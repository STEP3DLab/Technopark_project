'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const exportsUtil = require('../export-utils.js');

const NOW = '2026-10-29T09:00:00Z';
const BASE = 'https://step3dlab.github.io/Technopark_project/expert-monitor/?v=old#workspace';
const record = (id, changes = {}) => ({id, title: 'Обследование здания', caseNumber: 'А40-123/2026',
  status: 'needs_review', sourceType: 'court_decision', deadline: '2026-10-30T10:00:00+03:00',
  sourceUrl: 'https://court.example/case/123', region: 'Москва', ...changes});
const task = (changes = {}) => ({text: 'Уточнить материалы', dueDate: '2026-10-30', updatedAt: NOW, ...changes});
const unfold = content => content.replace(/\r\n[ \t]/g, '');
const eventBlocks = content => [...unfold(content).matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g)].map(match => match[1]);
const uid = block => /^UID:(.+)$/m.exec(block)?.[1].trim();

test('Calendar has CRLF boundaries, required fields and explicit unconfirmed source wording', () => {
  const result = exportsUtil.createCalendar({records: [record('r1')], includeTasks: false, now: NOW, baseUrl: BASE});
  const expanded = unfold(result.content);
  assert.equal(result.events, 1);
  assert.deepEqual(result.skipped, []);
  assert.ok(result.content.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(result.content.endsWith('END:VCALENDAR\r\n'));
  assert.doesNotMatch(result.content.replace(/\r\n/g, ''), /[\r\n]/, 'No bare newline is permitted');
  assert.match(expanded, /DTSTAMP:20261029T090000Z/);
  assert.match(expanded, /STATUS:TENTATIVE/);
  assert.match(expanded, /SUMMARY:Проверить срок: /);
  assert.match(expanded, /Приём не подтверждён/);
  assert.match(expanded, /требует проверки по первоисточнику/);
  assert.match(expanded, /CLASS:PUBLIC/);
  assert.match(expanded, /#opportunities\?record=r1/);
  assert.doesNotMatch(expanded, /v=old|ATTENDEE:|ORGANIZER:|VALARM|METHOD:REQUEST/);
});

test('Confirmed public reception remains distinguished from unconfirmed calendar signals', () => {
  const result = exportsUtil.createCalendar({records: [record('confirmed', {status: 'open_confirmed'})], now: NOW});
  const expanded = unfold(result.content);
  assert.match(expanded, /STATUS:CONFIRMED/);
  assert.match(expanded, /SUMMARY:Срок подачи: /);
  assert.match(expanded, /Приём подтверждён в опубликованном срезе/);
  assert.match(expanded, /Перед подачей проверьте изменения/);
});

test('All-day dates keep the chosen calendar day with exclusive next-day end across month and year boundaries', () => {
  const result = exportsUtil.createCalendar({records: [record('year-end', {deadline: '2026-12-31'})],
    tasks: {leap: task({dueDate: '2028-02-29'}), overdue: task({dueDate: '2026-10-01'})}, now: NOW});
  const blocks = eventBlocks(result.content);
  assert.equal(result.events, 3, 'Overdue personal tasks are still tasks to act on');
  assert.ok(blocks.some(block => block.includes('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101')));
  assert.ok(blocks.some(block => block.includes('DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301')));
  assert.ok(blocks.some(block => block.includes('DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002')));
  assert.doesNotMatch(unfold(result.content), /TZID=|DTSTART:20261230|DTSTART:20280228/);
});

test('Timed deadlines use UTC and retain the Moscow convention for a source time without timezone', () => {
  const result = exportsUtil.createCalendar({records: [
    record('moscow'), record('naive', {deadline: '2026-10-30T10:00'}),
    record('offset', {deadline: '2026-10-30T10:00:00+05:00'}),
    record('utc', {deadline: '2026-10-30T10:00:00Z'})
  ], now: NOW});
  const blocks = eventBlocks(result.content);
  assert.equal(result.events, 4);
  assert.equal(blocks.filter(block => block.includes('DTSTART:20261030T070000Z')).length, 2);
  assert.ok(blocks.some(block => block.includes('DTSTART:20261030T050000Z')));
  assert.ok(blocks.some(block => block.includes('DTSTART:20261030T100000Z')));
  assert.match(unfold(result.content), /время без часового пояса интерпретировано по Москве/);
  assert.doesNotMatch(unfold(result.content), /DTEND:/, 'Do not invent a meeting duration for a deadline');
});

test('Impossible, ambiguous, missing, inactive and expired deadlines are skipped with reasons', () => {
  const rows = [
    record('bad-day', {deadline: '2026-02-30'}), record('bad-hour', {deadline: '2026-10-30T24:00'}),
    record('ambiguous', {deadline: '30.10.2026'}), record('missing', {deadline: null}),
    record('closed', {status: 'closed'}), record('history', {status: 'historical'}),
    record('expired', {deadline: '2026-10-29T08:59:59Z'}), record('unknown-status', {status: 'potential'}),
    record('out-of-range', {deadline: '9999-12-31'}), null
  ];
  const result = exportsUtil.createCalendar({records: rows, now: NOW});
  assert.equal(result.events, 0);
  assert.equal(result.skipped.length, rows.length);
  assert.equal(result.skipped.find(row => row.id === 'expired').reason, 'expired');
  assert.equal(result.skipped.find(row => row.id === 'missing').reason, 'missing-date');
  assert.equal(result.skipped.find(row => row.id === 'history').reason, 'inactive-record');
  assert.match(result.content, /BEGIN:VCALENDAR/);
  assert.doesNotMatch(result.content, /BEGIN:VEVENT/);
});

test('Unsafe nonempty public URLs are skipped, while an absent source is explicitly labelled', () => {
  const unsafe = ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd',
    'https://user:secret@court.example/', 'https://court.example/\r\nATTENDEE:mailto:bad@example.org', '/relative/path'];
  const result = exportsUtil.createCalendar({records: [
    ...unsafe.map((sourceUrl, index) => record('bad-' + index, {sourceUrl})),
    record('absent', {sourceUrl: ''})
  ], now: NOW, baseUrl: 'javascript:alert(2)'});
  assert.equal(result.events, 1);
  assert.equal(result.skipped.filter(row => row.reason === 'unsafe-url').length, unsafe.length);
  assert.match(unfold(result.content), /Источник не указан/);
  assert.doesNotMatch(unfold(result.content), /^URL:|javascript:|ATTENDEE:/m);
});

test('Public-only export ignores private tasks and every unrelated private field', () => {
  const rows = [record('r1', {notes: 'SECRET_NOTE', expert: 'SECRET_EXPERT', proposalRub: 876543,
    company: {contact: 'SECRET_CONTACT'}, task: 'SECRET_EMBEDDED_TASK'})];
  const result = exportsUtil.createCalendar({records: rows, tasks: {r1: task({text: 'SECRET_PERSONAL_TASK'})},
    includeTasks: false, now: NOW});
  assert.equal(result.events, 1);
  assert.doesNotMatch(unfold(result.content), /SECRET_|876543|CLASS:PRIVATE/);
  const noTaskArgument = exportsUtil.createCalendar({records: rows, now: NOW});
  assert.equal(noTaskArgument.events, 1);
});

test('Personal-only export includes explicit tasks and skips completed or malformed task dates', () => {
  const result = exportsUtil.createCalendar({records: [record('r1')], includeDeadlines: false, tasks: {
    r1: task({text: 'Мой личный следующий шаг'}), orphan: task({dueDate: '2026-10-28'}),
    done: task({completedAt: NOW}), badCompleted: task({completedAt: 'tomorrow'}),
    bad: task({dueDate: '2026-02-29'}), missing: task({dueDate: ''}),
    badUpdated: task({updatedAt: '2026-10-29T10:00:00'})
  }, now: NOW, baseUrl: BASE});
  assert.equal(result.events, 2);
  assert.equal(result.skipped.find(row => row.id === 'done').reason, 'completed');
  assert.equal(result.skipped.find(row => row.id === 'badCompleted').reason, 'invalid-completed-date');
  assert.equal(result.skipped.find(row => row.id === 'badUpdated').reason, 'invalid-updated-date');
  assert.match(unfold(result.content), /Мой личный следующий шаг/);
  assert.equal(eventBlocks(result.content).filter(block => block.includes('CLASS:PRIVATE')).length, 2);
  assert.match(unfold(result.content), /не является сроком подачи/);
  assert.match(unfold(result.content), /LAST-MODIFIED:20261029T090000Z/);
  assert.doesNotMatch(unfold(result.content), /SUMMARY:Проверить срок:/);
});

test('UIDs are deterministic across changed dates, titles and export time, with separate namespaces and deduplication', () => {
  const first = exportsUtil.createCalendar({records: [record('r1'), record('r1')], tasks: {r1: task()}, now: NOW});
  const second = exportsUtil.createCalendar({records: [record('r1', {title: 'Новый предмет', deadline: '2026-11-02'})],
    tasks: {r1: task({text: 'Новая формулировка', dueDate: '2026-11-03'})}, now: '2026-10-29T10:00:00Z'});
  const firstUids = eventBlocks(first.content).map(uid).sort();
  const secondUids = eventBlocks(second.content).map(uid).sort();
  assert.equal(first.events, 2);
  assert.equal(first.skipped[0].reason, 'duplicate');
  assert.deepEqual(firstUids, secondUids);
  assert.notEqual(firstUids[0], firstUids[1]);
  for (const value of firstUids) assert.match(value, /^(deadline|task)-[a-f0-9]{32}@expert-monitor\.step3dlab\.github\.io$/);
  const sameInput = {records: [record('b'), record('a')], now: NOW};
  assert.equal(exportsUtil.createCalendar(sameInput).content,
    exportsUtil.createCalendar({...sameInput, records: [...sameInput.records].reverse()}).content);
});

test('RFC TEXT escaping prevents property injection and preserves comma, semicolon, slash and multiline text', () => {
  const value = 'Строка, пункт; путь\\файл\r\nEND:VEVENT\nBEGIN:VEVENT\nATTENDEE:mailto:bad@example.org';
  const escaped = exportsUtil.escapeText(value);
  assert.equal(escaped, 'Строка\\, пункт\\; путь\\\\файл\\nEND:VEVENT\\nBEGIN:VEVENT\\nATTENDEE:mailto:bad@example.org');
  const result = exportsUtil.createCalendar({records: [], includeDeadlines: false, tasks: {r1: task({text: value})}, now: NOW});
  const expanded = unfold(result.content);
  assert.equal(eventBlocks(result.content).length, 1);
  assert.doesNotMatch(expanded, /^ATTENDEE:/m);
  assert.ok(expanded.includes('SUMMARY:Моя задача: ' + escaped));
});

test('UTF-8 folding stays within 75 octets including continuation spaces without splitting Cyrillic or emoji', () => {
  const title = 'Проверить 🧑‍🔬 экспертное обследование; уточнить, ' .repeat(12);
  const source = 'https://court.example/' + 'document/'.repeat(25);
  const result = exportsUtil.createCalendar({records: [record('long', {title, sourceUrl: source})], now: NOW});
  for (const line of result.content.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'Content line exceeds 75 UTF-8 octets: ' + line);
    assert.equal(Buffer.from(line, 'utf8').toString('utf8'), line, 'No broken Unicode surrogate can be emitted');
  }
  assert.ok(result.content.includes('\r\n '));
  assert.match(unfold(result.content), /🧑‍🔬/);
  assert.ok(unfold(result.content).includes('SUMMARY:Проверить срок: ' + exportsUtil.escapeText(title.trim())));
  const edge = 'A'.repeat(74) + '😀' + 'Б'.repeat(40);
  assert.equal(unfold(exportsUtil.foldLine(edge)), edge);
  for (const line of exportsUtil.foldLine(edge).split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});

test('Browser UMD and Node create the same calendar without dependencies, input mutation or local storage access', () => {
  const directory = path.resolve(__dirname, '..');
  const context = vm.createContext({URL});
  context.window = context;
  Object.defineProperty(context, 'localStorage', {get() {throw new Error('Calendar export must not read local data');}});
  for (const name of ['monitor-utils.js', 'export-utils.js']) vm.runInContext(fs.readFileSync(path.join(directory, name), 'utf8'), context);
  const input = {records: [record('r1')], tasks: {r1: task()}, now: NOW, baseUrl: BASE};
  const before = JSON.stringify(input);
  const browserResult = context.ExpertExportUtils.createCalendar(input);
  assert.equal(browserResult.content, exportsUtil.createCalendar(input).content);
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => exportsUtil.createCalendar({now: '2026-02-30T12:00:00Z'}), TypeError);
  assert.throws(() => exportsUtil.createCalendar({now: '2026-10-30T10:00:00'}), TypeError);
  const empty = exportsUtil.createCalendar({now: NOW});
  assert.equal(empty.events, 0);
  assert.deepEqual(empty.skipped, []);
});
