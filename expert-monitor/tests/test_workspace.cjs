'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const w = require('../workspace-utils.js');
const estimates = require('../estimate-utils.js');

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

test('Document fields and signing defaults roundtrip while old v1 backups remain unchanged', () => {
  const legacy = {version: 1, notes: {}, work: {}, drafts: [{id: 'legacy', court: 'Суд', price: 'уточняется'}]};
  const oldDraft = w.normalizeWorkspace(legacy).drafts[0];
  assert.deepEqual(oldDraft, legacy.drafts[0]);
  assert.equal(Object.hasOwn(oldDraft, 'documentKind'), false, 'kind can be inferred from linked record by the UI');
  const draft = {id: 'new', recordId: 'removed-record', documentKind: 'procurement', documentMode: 'letter',
    documentDate: '2026-10-29', documentNumber: '12/Э', validUntil: '2026-12-31',
    signatory: 'Петров Пётр Петрович', signatoryRole: 'Директор', taxNote: 'НДС 20%'};
  const company = {organization: 'АНО', signatory: draft.signatory, signatoryRole: draft.signatoryRole, taxNote: draft.taxNote};
  const workspace = {...w.emptyWorkspace(), drafts: [draft], company};
  assert.deepEqual(w.normalizeWorkspace(JSON.parse(JSON.stringify(workspace))), workspace);
  const merged = w.mergeWorkspaces(w.normalizeWorkspace(legacy), workspace);
  assert.deepEqual(merged.drafts.map(item => item.id), ['legacy', 'new']);
  assert.equal(merged.drafts[1].documentKind, 'procurement');
  merged.company.signatory = 'Другой';
  assert.equal(company.signatory, 'Петров Пётр Петрович', 'company defaults are detached');
});

test('New document fields reject invalid kinds, modes, dates and excess lengths without banning incomplete drafts', () => {
  assert.equal(w.validDraft({id: 'empty', documentDate: '', validUntil: '', documentMode: 'draft', documentKind: 'general'}), true);
  assert.equal(w.validDraft({id: 'leap', documentDate: '2028-02-29'}), true);
  for (const change of [
    {documentKind: 'unknown'}, {documentKind: ''}, {documentMode: 'sent'},
    {documentDate: '2026-02-29'}, {documentDate: '2026-04-31'}, {documentDate: null},
    {validUntil: '2026-10-29T00:00:00Z'}, {validUntil: '2026-13-01'},
    {documentNumber: 'x'.repeat(101)}, {signatory: 'x'.repeat(1001)},
    {signatoryRole: 'x'.repeat(1001)}, {taxNote: 'x'.repeat(2001)}
  ]) {
    assert.equal(w.validDraft({id: 'invalid', ...change}), false, JSON.stringify(Object.keys(change)));
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), drafts: [{id: 'invalid', ...change}]}), null);
  }
  for (const [field, max] of [['signatory', 1000], ['signatoryRole', 1000], ['taxNote', 2000]]) {
    assert.ok(w.normalizeWorkspace({...w.emptyWorkspace(), company: {[field]: 'x'.repeat(max)}}));
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), company: {[field]: 'x'.repeat(max + 1)}}), null);
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), company: {[field]: 42}}), null);
  }
});

test('Task completion is optional, requires an ISO instant and never weakens updatedAt validation', () => {
  const completed = {...task(), completedAt: '2026-10-29T10:30:00.123Z'};
  const workspace = {...w.emptyWorkspace(), tasks: {done: completed, open: task()}};
  assert.deepEqual(w.normalizeWorkspace(JSON.parse(JSON.stringify(workspace))), workspace);
  for (const completedAt of ['', null, 'today', '2026-10-29', '2026-10-29T10:30:00',
    '2026-02-30T10:00:00Z', '2026-10-29T25:00:00Z']) {
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), tasks: {a: {...task(), completedAt}}}), null);
  }
  const noUpdatedAt = {...completed};
  delete noUpdatedAt.updatedAt;
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), tasks: {a: noUpdatedAt}}), null);
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), tasks: {a: {...completed, updatedAt: 'local'}}}), null);
  const current = {...w.emptyWorkspace(), tasks: {same: completed}};
  const incoming = {...w.emptyWorkspace(), tasks: {same: task('Открытая импортированная'), new: completed}};
  const merged = w.mergeWorkspaces(current, incoming);
  assert.equal(merged.tasks.same.completedAt, completed.completedAt, 'current completion wins a merge conflict');
  assert.equal(merged.tasks.new.completedAt, completed.completedAt, 'new completed task is retained');
  assert.deepEqual(w.mergeWorkspaces(workspace, workspace), workspace, 'self-merge retains completion');
});

test('Every document setting participates in dirty detection while save timestamps do not', () => {
  const baseline = {id: 'd', documentKind: 'general', documentMode: 'draft', documentDate: '2026-10-29',
    documentNumber: '', signatory: 'Иванов', signatoryRole: 'Директор', taxNote: 'НДС включён', validUntil: ''};
  for (const [field, value] of Object.entries({documentKind: 'court', documentMode: 'letter', documentDate: '2026-10-30',
    documentNumber: '15', signatory: 'Петров', signatoryRole: 'Заместитель', taxNote: 'Без НДС', validUntil: '2026-11-15'})) {
    assert.equal(w.isDraftDirty({...baseline, [field]: value}, baseline), true, field);
  }
  assert.equal(w.isDraftDirty({...baseline, createdAt: stamp, updatedAt: stamp}, baseline), false);
});

const savedEstimate = (changes = {}) => ({...estimates.emptyEstimate(),
  lines: [{id: 'expert', type: 'labor', name: 'Исследование', quantity: '2.5', unit: 'ч', rateRub: '1000.50'}],
  recordTitle: 'Сохранённый предмет исследования', caseNumber: 'А40-123/2099',
  notes: 'Проверить доступ к объекту', updatedAt: stamp, ...changes});

test('Legacy v1 and v2.1 workspaces gain independent empty estimate, profile and comparison sections', () => {
  const legacy = {version: 1, notes: {}, work: {}, drafts: []};
  const previous = {...legacy, tasks: {a: task()}, company: {contact: 'Сохранённый контакт'}};
  for (const source of [legacy, previous]) {
    const before = JSON.stringify(source);
    const result = w.normalizeWorkspace(source);
    assert.equal(result.version, 1);
    assert.deepEqual(result.estimates, {});
    assert.deepEqual(result.profile, w.emptyProfile());
    assert.deepEqual(result.compareIds, []);
    result.profile.regions.push('moscow');
    result.compareIds.push('a');
    result.estimates.a = savedEstimate();
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(w.emptyWorkspace().profile.regions, []);
    assert.deepEqual(w.emptyWorkspace().compareIds, []);
    assert.deepEqual(w.emptyWorkspace().estimates, {});
  }
});

test('Estimates retain exact user input and orphan metadata without automatically setting a proposal price', () => {
  const input = {...w.emptyWorkspace(), notes: {same: {proposalRub: 777.77, text: 'Отдельная рабочая оценка'}},
    estimates: {same: savedEstimate({overheadPct: '10,25'}),
      'removed-record': {...estimates.emptyEstimate(), notes: 'Ещё не оценено', recordTitle: 'Бывшая запись', caseNumber: 'TEST-OLD', updatedAt: stamp}},
    profile: {regions: ['moscow'], categories: ['expertise', 'survey'], includeWords: 'кровля; фасад',
      excludeWords: 'автомобиль', minBudget: '100000,50', maxBudget: '500000.00'},
    compareIds: ['same', 'removed-record'], savedFilters: [{...savedFilter('fit'), filters: {fit: 'match'}}]};
  const result = w.normalizeWorkspace(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(result, input);
  assert.equal(w.validBackup(input), true);
  assert.equal(result.notes.same.proposalRub, 777.77, 'A saved calculation must not silently overwrite the independent own price');
  assert.equal(result.estimates['removed-record'].lines[0].rateRub, '');
  result.estimates.same.lines[0].rateRub = '999';
  result.estimates['removed-record'].recordTitle = 'Другое';
  result.profile.regions.push('oblast');
  assert.equal(input.estimates.same.lines[0].rateRub, '1000.50');
  assert.equal(input.estimates['removed-record'].recordTitle, 'Бывшая запись');
  assert.deepEqual(input.profile.regions, ['moscow']);
});

test('Workspace validation accepts unfinished estimates but rejects malformed or excessive calculations atomically', () => {
  assert.equal(w.validEstimate(estimates.emptyEstimate()), true);
  const incomplete = {...estimates.emptyEstimate(), notes: 'Сохранить до получения материалов', updatedAt: stamp};
  assert.ok(w.normalizeWorkspace({...w.emptyWorkspace(), estimates: {incomplete}}));
  const invalid = [null, [], {unknown: true}, savedEstimate({automaticPrice: 100}),
    savedEstimate({updatedAt: '2026-10-29'}), savedEstimate({recordTitle: 'x'.repeat(1001)}),
    savedEstimate({lines: [{...savedEstimate().lines[0], rateRub: '1e3'}]}),
    savedEstimate({lines: [{...savedEstimate().lines[0], quantity: '1000000', rateRub: '1000000000000'}]})];
  for (const value of invalid) {
    const input = {...w.emptyWorkspace(), notes: {kept: {text: 'Не терять'}}, estimates: {bad: value}};
    assert.equal(w.validEstimate(value), false);
    assert.equal(w.normalizeWorkspace(input), null);
    assert.equal(input.notes.kept.text, 'Не терять');
  }
  const tooMany = Object.fromEntries(Array.from({length: 10001}, (_, index) => ['case-' + index, incomplete]));
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), estimates: tooMany}), null);
});

test('Profiles preserve raw keyword phrases and accept bounded decimal budget strings with partial defaults', () => {
  const partial = {includeWords: ' кровля, фасад;\n техническое состояние '};
  assert.equal(w.validProfile(partial), true);
  assert.deepEqual(w.normalizeWorkspace({...w.emptyWorkspace(), profile: partial}).profile, {...w.emptyProfile(), ...partial});
  assert.deepEqual(w.normalizeWorkspace({...w.emptyWorkspace(), profile: {}}).profile, w.emptyProfile());
  for (const profile of [
    {...w.emptyProfile(), minBudget: '.50', maxBudget: '0,50'},
    {...w.emptyProfile(), minBudget: '100.', maxBudget: '1000000000000'},
    {...w.emptyProfile(), minBudget: ' ', maxBudget: ''},
    {...w.emptyProfile(), regions: ['moscow', 'oblast', 'other', 'unknown'], categories: ['survey', 'design', 'land', 'expertise']}
  ]) {
    assert.equal(w.validProfile(profile), true);
    assert.deepEqual(w.normalizeWorkspace({...w.emptyWorkspace(), profile}).profile, profile);
  }
  for (const changes of [
    {regions: ['moscow', 'moscow']}, {regions: ['customer-address']}, {regions: 'moscow'},
    {categories: ['unknown']}, {categories: ['survey', 'survey']}, {categories: [42]},
    {includeWords: ['кровля']}, {excludeWords: 'x'.repeat(4001)}, {includeWords: undefined},
    {minBudget: 100}, {minBudget: '-1'}, {minBudget: '1e3'}, {maxBudget: 'Infinity'},
    {minBudget: '0x10'}, {minBudget: '1.001'}, {maxBudget: '1000000000000.01'},
    {minBudget: '10', maxBudget: '9.99'}, {maxBudget: '1'.repeat(101)}, {unknown: 'criterion'}
  ]) {
    const profile = {...w.emptyProfile(), ...changes};
    assert.equal(w.validProfile(profile), false, Object.keys(changes).join(','));
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), profile}), null);
  }
});

test('Comparison selections are unique, bounded and may keep IDs absent from the current public registry', () => {
  const ids = ['a', 'b', 'c', 'orphaned-public-record'];
  assert.deepEqual(w.normalizeWorkspace({...w.emptyWorkspace(), compareIds: ids}).compareIds, ids);
  for (const compareIds of [['a', 'a'], ['a', 'b', 'c', 'd', 'e'], [''], [' '], ['__proto__'],
    ['constructor'], ['x'.repeat(201)], [42], {}, null, undefined])
    assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), compareIds}), null);
});

test('Merging estimates keeps current conflicts and treats configured profile and comparison as coherent selections', () => {
  const current = {...w.emptyWorkspace(), estimates: {same: savedEstimate({notes: 'Текущий расчёт'}), orphan: savedEstimate()},
    profile: {...w.emptyProfile(), regions: ['moscow'], includeWords: 'кровля'}, compareIds: ['current'],
    notes: {same: {proposalRub: 777.77}}};
  const incoming = {...w.emptyWorkspace(), estimates: {same: savedEstimate({notes: 'Импорт'}), incoming: savedEstimate()},
    profile: {...w.emptyProfile(), categories: ['land'], excludeWords: 'кровля', minBudget: '500000'},
    compareIds: ['one', 'two', 'three', 'four']};
  const beforeCurrent = JSON.stringify(current), beforeIncoming = JSON.stringify(incoming);
  const merged = w.mergeWorkspaces(current, incoming);
  assert.equal(merged.estimates.same.notes, 'Текущий расчёт');
  assert.deepEqual(Object.keys(merged.estimates).sort(), ['incoming', 'orphan', 'same']);
  assert.deepEqual(merged.profile, current.profile, 'Profiles must not be field-merged into contradictory criteria');
  assert.deepEqual(merged.compareIds, ['current'], 'Comparison import must not silently union or truncate the selection');
  assert.equal(merged.notes.same.proposalRub, 777.77);
  merged.estimates.same.lines[0].rateRub = '1';
  merged.estimates.incoming.lines[0].quantity = '5';
  merged.profile.regions.push('oblast');
  merged.compareIds.push('another');
  assert.equal(JSON.stringify(current), beforeCurrent);
  assert.equal(JSON.stringify(incoming), beforeIncoming);
  assert.deepEqual(w.mergeWorkspaces(current, current), current);
});

test('Import restores a configured profile and comparison into both legacy and all-default current workspaces', () => {
  const incoming = {...w.emptyWorkspace(), estimates: {a: savedEstimate()},
    profile: {...w.emptyProfile(), categories: ['survey'], includeWords: 'фасад', maxBudget: '500000'},
    compareIds: ['a', 'missing-record']};
  const candidates = [w.emptyWorkspace(), {version: 1, notes: {}, work: {}, drafts: []},
    {...w.emptyWorkspace(), profile: {}}, {...w.emptyWorkspace(), profile: {...w.emptyProfile(), includeWords: ' , ;\n '}}];
  for (const current of candidates) {
    const merged = w.mergeWorkspaces(current, incoming);
    assert.deepEqual(merged.profile, incoming.profile);
    assert.deepEqual(merged.compareIds, incoming.compareIds);
    assert.deepEqual(merged.estimates, incoming.estimates);
  }
  assert.deepEqual(w.mergeWorkspaces(incoming, w.emptyWorkspace()).profile, incoming.profile);
  const invalid = {...incoming, compareIds: ['a', 'b', 'c', 'd', 'e']};
  assert.equal(w.mergeWorkspaces(w.emptyWorkspace(), invalid), null, 'Invalid incoming data must refuse the complete import');
});

test('New sections reject prototype keys, accessors and sparse arrays without executing imported values', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const unsafe = JSON.parse('{"' + key + '":true}');
    for (const change of [{estimates: unsafe}, {estimates: {a: {...savedEstimate(), ...unsafe}}},
      {estimates: {a: savedEstimate({lines: [{...savedEstimate().lines[0], ...unsafe}]})}},
      {profile: {...w.emptyProfile(), ...unsafe}}])
      assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), ...change}), null);
  }
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), compareIds: Array(1)}), null);
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), profile: {...w.emptyProfile(), regions: Array(1)}}), null);
  const getter = savedEstimate();
  Object.defineProperty(getter, 'lines', {enumerable: true, get() {throw new Error('Do not read imported accessors');}});
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), estimates: {a: getter}}), null);
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), estimates: undefined}), null);
  assert.equal(w.normalizeWorkspace({...w.emptyWorkspace(), profile: undefined}), null);
  assert.equal({}.polluted, undefined);
});
