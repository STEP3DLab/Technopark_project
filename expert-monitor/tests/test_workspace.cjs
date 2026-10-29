'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const w = require('../workspace-utils.js');

const stamp = '2026-10-29T10:00:00+03:00';
const task = (text = 'Проверить последнее определение') => ({text, dueDate: '2026-10-30', updatedAt: stamp});
const savedFilter = (id, name = id) => ({id, name, filters: {status: 'needs_review', favorite: 'all'}});

test('Legacy v1 backups migrate with defaults and detached nested data', () => {
  const raw = {version: 1, notes: {case1: {text: 'Заметка', proposalRub: 125000}},
    work: {case1: 'review'}, drafts: [{id: 'd1', price: 125000, days: '30'}]};
  const normalized = w.normalizeWorkspace(raw);
  assert.deepEqual(normalized.favorites, []);
  assert.deepEqual(normalized.tasks, {});
  assert.deepEqual(normalized.checks, {});
  assert.deepEqual(normalized.savedFilters, []);
  assert.deepEqual(normalized.company, {});
  assert.equal(normalized.drafts[0].price, 125000);
  normalized.notes.case1.text = 'Другой текст';
  normalized.drafts[0].price = 5;
  assert.equal(raw.notes.case1.text, 'Заметка');
  assert.equal(raw.drafts[0].price, 125000);
  const first = w.emptyWorkspace();
  first.favorites.push('case1');
  assert.deepEqual(w.emptyWorkspace().favorites, []);
});

test('Extended workspace roundtrip retains every user field and every work status', () => {
  const input = w.emptyWorkspace();
  input.company = {organization: 'АНО «Эксперт»', contact: 'Рабочий контакт'};
  input.favorites = ['case1', 'case2'];
  input.tasks.case1 = task();
  input.checks.case1 = {stage: true, scope: false, eligibility: true,
    materials: false, deadline: true, channel: false};
  input.savedFilters = [{id: 'preset1', name: 'На проверку', filters: {
    search: 'кровля', status: 'needs_review', region: 'moscow', court: 'all',
    sourceType: 'court_decision', workStatus: 'review', due: '3', sort: 'deadline',
    favorite: 'yes', category: 'строительная', minAmount: '100000', maxAmount: '500000'
  }}];
  input.exportedAt = stamp;
  Object.keys(w.WORK_STATUS).forEach((status, index) => { input.work['c' + index] = status; });
  assert.deepEqual(w.normalizeWorkspace(JSON.parse(JSON.stringify(input))), input);
  assert.equal(w.validBackup(input), true);
});

test('Reject prototype keys at every structured boundary without silent sanitization', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const malicious = JSON.parse('{"' + key + '":true}');
    const variants = [
      {...w.emptyWorkspace(), ...malicious},
      {...w.emptyWorkspace(), notes: malicious},
      {...w.emptyWorkspace(), notes: {a: malicious}},
      {...w.emptyWorkspace(), work: malicious},
      {...w.emptyWorkspace(), company: malicious},
      {...w.emptyWorkspace(), tasks: malicious},
      {...w.emptyWorkspace(), tasks: {a: {...task(), ...malicious}}},
      {...w.emptyWorkspace(), checks: {a: malicious}},
      {...w.emptyWorkspace(), drafts: [{id: 'd', ...malicious}]},
      {...w.emptyWorkspace(), savedFilters: [{id: 'f', name: 'Фильтр', filters: malicious}]}
    ];
    for (const candidate of variants) assert.equal(w.normalizeWorkspace(candidate), null, key);
  }
  assert.equal({}.polluted, undefined);
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), unexpected: true}), null);
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), notes: new Date()}), null);
});

test('Money validation preserves legacy string drafts but rejects nonfinite or oversized numeric data', () => {
  for (const value of [NaN, Infinity, -1, 1e12 + 1, true, '125000']) {
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), notes: {a: {proposalRub: value}}}), null);
  }
  for (const value of [NaN, Infinity, -1, 1e12 + 1, true]) {
    assert.equal(w.validDraft({id: 'd', price: value}), false);
    assert.equal(w.validDraft({id: 'd', days: value}), false);
  }
  assert.equal(w.validDraft({id: 'd', price: '', days: 'уточняется'}), true);
  assert.equal(w.validDraft({id: 'd', price: 0, days: 1e12}), true);
  assert.equal(w.validDraft({id: 'd', organization: 'x'.repeat(1001)}), false);
  assert.equal(w.validDraft({id: 'd', custom: 'not allowed'}), false);
});

test('Bounds and duplicates fail explicitly instead of truncating user data', () => {
  const invalid = [
    {favorites: ['case1', 'case1']},
    {favorites: ['x'.repeat(201)]},
    {favorites: Array.from({length: 10001}, (_, i) => 'r' + i)},
    {drafts: [{id: 'same'}, {id: 'same'}]},
    {drafts: Array.from({length: 5001}, (_, i) => ({id: 'd' + i}))},
    {notes: {a: {text: 'x'.repeat(20001)}}},
    {tasks: {a: {...task(), text: 'x'.repeat(2001)}}},
    {savedFilters: [savedFilter('same'), savedFilter('same')]},
    {savedFilters: Array.from({length: 31}, (_, i) => savedFilter('f' + i))},
    {savedFilters: [{id: 'f', name: 'x'.repeat(81), filters: {}}]},
    {savedFilters: [{id: 'f', name: 'Имя', filters: {search: 'x'.repeat(1001)}}]},
    {savedFilters: [{id: 'f', name: 'Имя', filters: {minAmount: 1}}]},
    {savedFilters: [{id: 'f', name: 'Имя', filters: {unknown: 'x'}}]},
    {work: {a: 'not-a-status'}},
    {checks: {a: {stage: 1}}},
    {checks: {a: {unknown: true}}}
  ];
  for (const change of invalid) assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), ...change}), null);
});

test('Sparse arrays, accessor properties and hidden prototype keys cannot survive as invalid normalized snapshots', () => {
  for (const field of ['favorites', 'drafts', 'savedFilters']) {
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), [field]: Array(1)}), null);
    const extraKey = [];
    extraKey.constructor = 'unsafe';
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), [field]: extraKey}), null);
  }
  const hidden = {};
  Object.defineProperty(hidden, '__proto__', {value: {polluted: true}});
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), notes: hidden}), null);
  const getter = {};
  Object.defineProperty(getter, 'text', {enumerable: true, get() {throw new Error('Do not execute imported accessors');}});
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), notes: {a: getter}}), null);
});

test('Task dates accept exact calendar days and ISO instants, rejecting rollover and local timestamps', () => {
  for (const dueDate of ['', '2028-02-29', '2026-10-30']) {
    assert.ok(w.normalizeWorkspace({...w.emptyWorkspace(), tasks: {a: {...task(), dueDate}}}));
  }
  for (const dueDate of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'tomorrow', null]) {
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), tasks: {a: {...task(), dueDate}}}), null);
  }
  for (const updatedAt of ['2026-10-29T07:00:00Z', '2026-10-29T10:00:00.123+03:00']) {
    assert.ok(w.normalizeWorkspace({...w.emptyWorkspace(), tasks: {a: {...task(), updatedAt}}}));
  }
  for (const updatedAt of ['2026-02-30T07:00:00Z', '2026-10-29T25:00:00Z', '2026-10-29T07:00:00', '', 'today']) {
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), tasks: {a: {...task(), updatedAt}}}), null);
  }
});

test('Merge keeps current conflicts, imports missing IDs, and detaches all retained values', () => {
  const current = {...w.emptyWorkspace(), notes: {a: {text: 'Текущая'}}, work: {a: 'review'},
    drafts: [{id: 'same', contact: 'Текущий'}, {id: 'current-only'}],
    company: {organization: 'Текущая организация'}, favorites: ['a'],
    tasks: {a: task('Текущая задача')}, checks: {a: {stage: true}},
    savedFilters: [savedFilter('same', 'Текущий')], exportedAt: stamp};
  const incoming = {...w.emptyWorkspace(), notes: {a: {text: 'Импорт'}, b: {text: 'Новая'}},
    work: {a: 'sent', b: 'draft'}, drafts: [{id: 'same', contact: 'Импорт'}, {id: 'import-only'}],
    company: {organization: 'Импорт', contact: 'Новый контакт'}, favorites: ['b', 'a'],
    tasks: {a: task('Импорт'), b: task('Новая задача')}, checks: {a: {stage: false}, b: {scope: true}},
    savedFilters: [savedFilter('same', 'Импорт'), savedFilter('new')], exportedAt: 'old'};
  const beforeCurrent = JSON.stringify(current);
  const beforeIncoming = JSON.stringify(incoming);
  const merged = w.mergeWorkspaces(current, incoming);
  assert.equal(merged.notes.a.text, 'Текущая');
  assert.equal(merged.notes.b.text, 'Новая');
  assert.equal(merged.work.a, 'review');
  assert.equal(merged.work.b, 'draft');
  assert.deepEqual(merged.drafts.map(d => d.id), ['same', 'current-only', 'import-only']);
  assert.equal(merged.drafts[0].contact, 'Текущий');
  assert.equal(merged.company.organization, 'Текущая организация');
  assert.equal(merged.company.contact, 'Новый контакт');
  assert.deepEqual(merged.favorites, ['a', 'b']);
  assert.equal(merged.tasks.a.text, 'Текущая задача');
  assert.deepEqual(merged.checks.a, {stage: true});
  assert.deepEqual(merged.savedFilters.map(f => f.name), ['Текущий', 'new']);
  assert.equal(merged.exportedAt, stamp);
  merged.notes.a.text = 'Изменение после слияния';
  merged.drafts[0].contact = 'Изменение после слияния';
  merged.savedFilters[0].filters.status = 'closed';
  assert.equal(JSON.stringify(current), beforeCurrent);
  assert.equal(JSON.stringify(incoming), beforeIncoming);
  assert.equal(w.mergeWorkspaces(current, {version: 999}), null);
});

test('Oversized merge refuses the entire operation without dropping drafts or presets', () => {
  const current = {...w.emptyWorkspace(), drafts: Array.from({length: 5000}, (_, i) => ({id: 'd' + i}))};
  const incoming = {...w.emptyWorkspace(), drafts: [{id: 'one-more'}]};
  assert.equal(w.mergeWorkspaces(current, incoming), null);
  assert.equal(current.drafts.length, 5000);
  assert.equal(incoming.drafts.length, 1);
  const presets = {...w.emptyWorkspace(), savedFilters: Array.from({length: 30}, (_, i) => savedFilter('f' + i))};
  assert.equal(w.mergeWorkspaces(presets, {...w.emptyWorkspace(), savedFilters: [savedFilter('extra')]}), null);
});

test('Importing the current workspace into itself is idempotent and retains private fields', () => {
  const input = {...w.emptyWorkspace(), notes: {a: {text: 'Сохранённая заметка', proposalRub: 10}},
    drafts: [{id: 'd1', contact: 'Контакт', organization: 'Организация'}],
    favorites: ['a'], tasks: {a: task()}, checks: {a: {channel: true}},
    savedFilters: [savedFilter('f1')]};
  assert.deepEqual(w.mergeWorkspaces(input, JSON.parse(JSON.stringify(input))), input);
});

test('Dirty detection covers every editable field, including organization, contact and unnumbered new drafts', () => {
  const baseline = {id: '', createdAt: stamp, updatedAt: stamp, caseNumber: '',
    organization: 'АНО', contact: 'Телефон', price: 100, days: 30};
  assert.equal(w.isDraftDirty({...baseline}, baseline), false);
  assert.equal(w.isDraftDirty({...baseline, id: 'saved', createdAt: 'later', updatedAt: 'later'}, baseline), false);
  assert.equal(w.isDraftDirty({...baseline, price: '100', days: '30'}, baseline), false);
  for (const field of w.DRAFT_EDITABLE_FIELDS) {
    assert.equal(w.isDraftDirty({...baseline, [field]: String(baseline[field] || '') + ' изменено'}, baseline), true, field);
  }
  assert.equal(w.isDraftDirty({contact: 'Новый телефон'}, {}), true);
  assert.equal(w.isDraftDirty({}, null), false);
  assert.equal(Object.hasOwn(w.draftComparable(baseline), 'id'), false);
  assert.equal(Object.hasOwn(w.draftComparable(baseline), 'organization'), true);
});
