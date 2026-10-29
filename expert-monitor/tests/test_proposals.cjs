'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const p = require('../proposal-utils.js');
const w = require('../workspace-utils.js');

const full = (changes = {}) => ({
  id: 'draft-1', recordId: 'public-record-1', documentKind: 'court', documentMode: 'letter',
  documentDate: '2026-10-29', documentNumber: '42/Э', validUntil: '2026-11-15',
  court: 'Арбитражный суд города Москвы', caseNumber: 'А40-12345/2026',
  subject: 'Причины повреждения кровли', organization: 'АНО «Независимая экспертиза»',
  requisites: 'ИНН 7700000000\nАдрес: Москва, улица Примерная, 1',
  contact: 'Рабочий телефон: +7 000 000-00-00', expert: 'Иванов Иван Иванович',
  qualification: 'Высшее техническое образование\nОпыт обследований — 12 лет',
  price: '125000.75', days: '21', taxNote: 'Без НДС: основание уточнено организацией',
  conditions: 'Изучение материалов и осмотр здания по согласованию.',
  attachments: '1. Сведения о квалификации\n2. Расчёт стоимости',
  signatory: 'Петров Пётр Петрович', signatoryRole: 'Директор',
  createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T11:00:00Z', ...changes
});
const compact = text => text.replace(/\s+/g, ' ').trim();

// Independent reader of the RTF control stream used by the assertions below.
// It checks balanced groups, skips destinations, applies \uc fallback counts,
// and decodes signed UTF-16. It does not call the producer's rendering helpers.
function readRtf(source) {
  const stack = [];
  const controls = [];
  let state = {skip: false, uc: 1}, fallback = 0, output = '';
  for (let i = 0; i < source.length;) {
    const char = source[i++];
    if (fallback) { fallback--; continue; }
    if (char === '{') { stack.push(state); state = {...state}; continue; }
    if (char === '}') {
      assert.ok(stack.length, 'RTF closes only an existing group');
      state = stack.pop(); continue;
    }
    if (char !== '\\') { if (!state.skip && char !== '\n' && char !== '\r') output += char; continue; }
    const symbol = source[i];
    if (['\\', '{', '}'].includes(symbol)) { i++; if (!state.skip) output += symbol; continue; }
    if (symbol === '*') { i++; state.skip = true; continue; }
    const match = /^([a-z]+)(-?\d+)? ?/.exec(source.slice(i));
    assert.ok(match, 'RTF contains recognized control words or escaped syntax');
    i += match[0].length;
    const [, word, number] = match;
    controls.push(word);
    if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object'].includes(word)) state.skip = true;
    if (word === 'uc') state.uc = Number(number);
    if (word === 'u') {
      if (!state.skip) output += String.fromCharCode(Number(number) & 0xffff);
      fallback = state.uc;
    }
    if (!state.skip && (word === 'par' || word === 'line')) output += '\n';
    if (!state.skip && word === 'tab') output += '\t';
  }
  assert.equal(stack.length, 0, 'RTF groups are balanced');
  assert.equal(fallback, 0, 'Unicode fallback does not run past the document');
  return {text: output, controls};
}

test('UMD exposes the same pure document API without DOM, storage or network globals', () => {
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../proposal-utils.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.window.ExpertProposalUtils).sort(), Object.keys(p).sort());
  assert.match(context.window.ExpertProposalUtils.proposalText({}), /ПРОЕКТ ДЛЯ ПРОВЕРКИ\. НЕ ОТПРАВЛЕН\./);
  assert.ok(Object.isFrozen(p));
});

test('Legacy and blank forms export a visibly incomplete project with no false readiness', () => {
  const legacy = {court: 'Суд', caseNumber: '123', expert: 'Эксперт', price: '100', days: '10'};
  const text = p.proposalText(legacy);
  assert.ok(text.startsWith(p.DRAFT_NOTICE));
  assert.match(text, /\[ПОЛНОЕ НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ\]/);
  assert.match(text, /\[ФИО ПОДПИСАНТА\]/);
  assert.match(text, /Не заполнено или требует исправления/);
  assert.equal(p.canExportLetter(legacy), false);
  assert.match(p.proposalHtml({}), /data-document-kind="general" data-document-mode="draft"/);
  assert.equal(readRtf(p.proposalRtf(legacy)).text.includes(p.DRAFT_NOTICE), true);
});

test('Complete court letter includes every editable document field, exact kopecks and semantic structure', () => {
  const form = full();
  const before = JSON.stringify(form);
  assert.deepEqual(p.missingFields(form), []);
  assert.equal(p.canExportLetter(form), true);
  const text = p.proposalText(form), html = p.proposalHtml(form);
  for (const key of ['court', 'caseNumber', 'subject', 'organization', 'requisites', 'contact', 'expert',
    'qualification', 'conditions', 'attachments', 'signatory', 'signatoryRole', 'taxNote', 'documentNumber']) {
    assert.ok(text.includes(form[key]), 'text contains ' + key);
  }
  assert.match(text, /Исх\. № 42\/Э от 29\.10\.2026/);
  assert.match(text, /125[\s\u00a0\u202f]000,75 ₽/);
  assert.match(text, /21 календарный день/);
  assert.match(text, /15\.11\.2026/);
  assert.equal(text.includes(p.DRAFT_NOTICE), false);
  assert.equal(text.includes('public-record-1'), false);
  for (const className of ['proposal-document', 'proposal-letterhead', 'proposal-recipient', 'proposal-title',
    'proposal-terms', 'proposal-signature']) assert.ok(html.includes('class="' + className + '"'));
  assert.match(html, /<dl class="proposal-terms"><div><dt>Стоимость<\/dt><dd>/);
  assert.match(html, /data-document-mode="letter"/);
  assert.equal(JSON.stringify(form), before, 'rendering never changes draft or work status');
});

test('Every required field participates in readiness, including organization, contact and subject', () => {
  for (const key of ['court', 'subject', 'organization', 'expert', 'qualification', 'requisites',
    'contact', 'signatory', 'signatoryRole', 'taxNote', 'caseNumber', 'documentDate', 'price', 'days']) {
    assert.equal(p.canExportLetter(full({[key]: ' \n\t '})), false, key);
    assert.ok(p.missingFields(full({[key]: ''})).length > 0, key);
  }
  for (const key of ['documentNumber', 'validUntil', 'conditions', 'attachments']) {
    assert.equal(p.canExportLetter(full({[key]: ''})), true, key + ' remains optional');
  }
});

test('Persisted document kind survives orphaned records, roundtrips and workspace merge', () => {
  const procurement = full({documentKind: 'procurement', recordId: 'removed-record', caseNumber: '026-25-77'});
  const workspace = {...w.emptyWorkspace(), drafts: [procurement]};
  const merged = w.mergeWorkspaces(w.emptyWorkspace(), JSON.parse(JSON.stringify(workspace)));
  assert.equal(merged.drafts[0].documentKind, 'procurement');
  const text = p.proposalText(merged.drafts[0]);
  assert.match(text, /По закупке № 026-25-77/);
  assert.equal(text.includes('По делу'), false);
  assert.equal(p.canExportLetter(full({documentKind: 'procurement', caseNumber: ''})), false);
  assert.equal(p.canExportLetter(full({documentKind: 'court', caseNumber: ''})), false);
  assert.equal(p.canExportLetter(full({documentKind: 'general', caseNumber: ''})), true);
  assert.match(p.proposalText(full({documentKind: 'general', caseNumber: ''})), /Коммерческое предложение/);
});

test('Incomplete letter stays an explicit draft in preview and blocks text and RTF exports', () => {
  const form = full({contact: '', taxNote: ''});
  const missing = p.missingFields(form);
  assert.match(p.proposalHtml(form), /data-document-mode="draft"/);
  assert.ok(p.proposalHtml(form).includes(p.DRAFT_NOTICE));
  for (const exporter of [p.proposalText, p.proposalRtf]) {
    assert.throws(() => exporter(form), error => error instanceof p.IncompleteProposalError
      && error.name === 'IncompleteProposalError' && JSON.stringify(error.fields) === JSON.stringify(missing));
  }
  assert.ok(p.proposalText({...form, documentMode: 'draft'}).startsWith(p.DRAFT_NOTICE));
});

test('Letter amounts and durations enforce meaningful finite boundaries without binary rounding false negatives', () => {
  for (const price of [0, -1, 1e12 + 1, NaN, Infinity, true, null, '', 'нет', '12.345']) {
    assert.equal(p.canExportLetter(full({price})), false, String(price));
  }
  for (const price of ['0.01', '125000.75', 10000000000.03, 999999999999.99, 1e12]) {
    assert.equal(p.canExportLetter(full({price})), true, String(price));
  }
  for (const days of [0, -1, 1.5, 3651, NaN, Infinity, true, '', 'уточняется']) {
    assert.equal(p.canExportLetter(full({days})), false, String(days));
  }
  for (const [days, expected] of [[1, '1 календарный день'], [2, '2 календарных дня'],
    [11, '11 календарных дней'], [114, '114 календарных дней'], [3650, '3650 календарных дней']]) {
    assert.equal(p.canExportLetter(full({days})), true);
    assert.ok(p.proposalText(full({days})).includes(expected));
  }
});

test('Document dates use calendar days and validity cannot silently predate the letter', () => {
  for (const documentDate of ['2026-02-29', '2026-04-31', '2026-1-02', '2026-10-29T00:00:00Z', '', null]) {
    assert.equal(p.canExportLetter(full({documentDate})), false, String(documentDate));
  }
  assert.equal(p.canExportLetter(full({documentDate: '2028-02-29', validUntil: '2028-03-01'})), true);
  for (const validUntil of ['2026-10-28', '2026-11-31', 'tomorrow']) {
    assert.equal(p.canExportLetter(full({validUntil})), false, validUntil);
  }
  assert.equal(p.canExportLetter(full({validUntil: '2026-10-29'})), true);
  assert.equal(p.canExportLetter(full({validUntil: ''})), true);
  for (const change of [{documentKind: 'injected'}, {documentMode: 'sent'}]) {
    assert.equal(p.canExportLetter(full(change)), false);
    assert.match(p.proposalHtml(full(change)), /data-document-mode="draft"/);
  }
});

test('HTML escapes every free-text field and cannot turn imported text into executable markup', () => {
  const attack = '<img src=x onerror="alert(1)"><script>bad()</script>&\'"';
  for (const key of ['court', 'caseNumber', 'subject', 'organization', 'requisites', 'contact', 'expert',
    'qualification', 'conditions', 'attachments', 'signatory', 'signatoryRole', 'taxNote', 'documentNumber']) {
    const html = p.proposalHtml(full({[key]: attack + '\nНовая строка'}));
    assert.equal(/<(?:script|img)\b/i.test(html), false, key);
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), key);
    assert.ok(html.includes('&amp;&#39;&quot;<br>Новая строка'), key);
  }
  assert.equal(p.proposalHtml(full({documentKind: '"><script>bad()</script>'})).includes('<script>'), false);
});

test('RTF preserves Cyrillic, line breaks, emoji and literal RTF syntax without active objects or fields', () => {
  const literal = 'Приложение {акт} \\server\\folder\nЁжик 🧪\t{\\object\\objdata 0102} {\\field{\\*\\fldinst HYPERLINK "x"}}';
  const form = full({conditions: literal});
  const rtf = p.proposalRtf(form);
  assert.ok(rtf.startsWith('{\\rtf1\\ansi\\ansicpg1251\\deff0\\uc1'));
  assert.equal(/[^\x00-\x7f]/.test(rtf), false, 'Unicode is encoded into portable ASCII RTF');
  assert.ok(rtf.includes('\\u1025?'), 'Ё is an actual Unicode control word');
  assert.ok(rtf.includes('\\u-10178?\\u-8726?'), 'supplementary Unicode uses both signed UTF-16 units');
  const parsed = readRtf(rtf);
  assert.ok(parsed.text.includes(literal));
  assert.equal(compact(parsed.text), compact(p.proposalText(form)));
  for (const forbidden of ['object', 'objdata', 'field', 'fldinst', 'pict', 'filetbl']) {
    assert.equal(parsed.controls.includes(forbidden), false, forbidden);
  }
});

test('Document output contains only proposal fields and excludes local notes, task data and metadata IDs', () => {
  const form = full({notes: 'PRIVATE_NOTE_CANARY', task: 'PRIVATE_TASK_CANARY',
    work: 'PRIVATE_WORK_CANARY', id: 'PRIVATE_DRAFT_CANARY', recordId: 'PRIVATE_RECORD_CANARY'});
  const before = JSON.stringify(form);
  for (const output of [p.proposalText(form), p.proposalHtml(form), readRtf(p.proposalRtf(form)).text]) {
    assert.equal(output.includes('PRIVATE_'), false);
    assert.equal(output.includes(form.updatedAt), false);
    assert.equal(output.includes(form.createdAt), false);
  }
  assert.equal(JSON.stringify(form), before);
});

test('Explicit draft mode remains visibly unsent even when all fields are complete', () => {
  const form = full({documentMode: 'draft'});
  assert.equal(p.canExportLetter(form), true);
  assert.ok(p.proposalText(form).startsWith(p.DRAFT_NOTICE));
  assert.match(p.proposalHtml(form), /data-document-mode="draft"/);
  assert.ok(readRtf(p.proposalRtf(form)).text.includes(p.DRAFT_NOTICE));
  assert.equal(p.proposalText(full()).includes('Предложение подано'), false);
  for (const documentKind of ['court', 'procurement', 'general']) {
    const letter = full({documentKind});
    for (const output of [p.proposalText(letter), p.proposalHtml(letter), readRtf(p.proposalRtf(letter)).text]) {
      assert.equal(/Перед участием необходимо|не заменяет заявку|не подтверждает назначение|подлежат уточнению/.test(output), false,
        'outgoing letter excludes internal workflow advice and invented qualifications');
    }
    assert.equal(p.proposalHtml(letter).includes('proposal-document-note'), false);
    assert.equal(p.proposalHtml({...letter, documentMode: 'draft'}).includes('proposal-document-note'), true);
  }
});
