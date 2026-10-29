'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const o = require('../opportunity-utils.js');
const w = require('../workspace-utils.js');

const now = Date.parse('2026-10-29T12:00:00Z');
const profile = (changes = {}) => ({...w.emptyProfile(), ...changes});
const record = (changes = {}) => ({id: 'signal-1', title: 'Обследование кровли здания',
  category: 'Обследование зданий', summary: 'Оценка технического состояния конструкций.',
  objectRegion: 'Москва', region: 'Московская область — заказчик',
  sourceType: 'procurement_adjacent', status: 'needs_review', deadline: '2026-10-30T10:00:00+03:00',
  amountRub: 250000.50, amountType: 'contract', amountLabel: 'НМЦК по источнику', ...changes});
const has = (result, code) => result.reasons.some(reason => reason.code === code);

test('Blank profiles are neutral for all records, including archive entries and delimiter-only phrases', () => {
  for (const selection of [undefined, null, {}, profile(), profile({includeWords: ' , ; \n ', excludeWords: ' ; '})]) {
    for (const status of ['needs_review', 'open_confirmed', 'closed', 'historical']) {
      const result = o.evaluateFit(record({status, deadline: '2020-01-01'}), selection, now);
      assert.equal(result.configured, false);
      assert.equal(result.verdict, 'match', 'neutral inclusion is distinguished by configured=false');
      assert.deepEqual(result.reasons, []);
    }
  }
});

test('Known criteria match independently of source confirmation and never change public status', () => {
  const input = record(), selection = profile({regions: ['moscow'], categories: ['survey'], minBudget: '200000', maxBudget: '300000'});
  const before = JSON.stringify(input);
  const result = o.evaluateFit(input, selection, now);
  assert.equal(result.configured, true);
  assert.equal(result.verdict, 'match');
  assert.equal(result.sourceConfirmed, false);
  assert.ok(has(result, 'source-unconfirmed'));
  assert.equal(result.reasons.find(reason => reason.code === 'source-unconfirmed').kind, 'warning');
  for (const code of ['region-match', 'category-match', 'budget-match']) assert.ok(has(result, code));
  const confirmed = o.evaluateFit(record({status: 'open_confirmed'}), selection, now);
  assert.equal(confirmed.verdict, 'match');
  assert.equal(confirmed.sourceConfirmed, true);
  assert.equal(has(confirmed, 'source-unconfirmed'), false);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.hasOwn(result, 'score'), false, 'there is no fabricated score or eligibility percentage');
});

test('Unknown object location needs information; a known outside location is excluded', () => {
  const selection = profile({regions: ['moscow']});
  const unknown = o.evaluateFit(record({objectRegion: '', region: 'Москва — заказчик; фактический объект указан в ТЗ, местоположение не подтверждено'}), selection, now);
  assert.equal(unknown.region, 'unknown');
  assert.equal(unknown.verdict, 'review');
  assert.ok(has(unknown, 'region-unknown'));
  assert.equal(has(unknown, 'region-outside'), false);
  const outside = o.evaluateFit(record({objectRegion: '', region: 'Москва — заказчик; Карелия — объект'}), selection, now);
  assert.equal(outside.region, 'other');
  assert.equal(outside.verdict, 'excluded');
  assert.ok(has(outside, 'region-outside'));
  const accepted = o.evaluateFit(record({objectRegion: 'Московская область', region: 'Москва — заказчик'}), profile({regions: ['oblast']}), now);
  assert.equal(accepted.verdict, 'match');
  assert.equal(accepted.region, 'oblast');
  assert.equal(o.evaluateFit(record({objectRegion: '', region: ''}), profile({regions: ['unknown']}), now).verdict, 'review');
});

test('Category rules are deterministic, explanatory and do not call every unknown subject expertise', () => {
  for (const [title, expected] of [
    ['Землеустроительная экспертиза границ участка', 'land'],
    ['Проектирование и обследование здания', 'design'],
    ['Обследование технического состояния здания', 'survey'],
    ['Судебная строительная экспертиза', 'expertise'],
    ['Качество и объёмы выполненных работ', 'expertise'],
    ['Поставка офисной мебели', 'unknown'], ['', 'unknown']
  ]) {
    const info = o.categoryInfo({title});
    assert.equal(info.key, expected, title);
    assert.equal(o.categoryKey({title}), expected);
    assert.equal(info.heuristic, true);
    assert.ok(info.basis.length > 0);
  }
  assert.equal(o.categoryKey({category: 'Смежная закупка', title: 'Обследование кровли'}), 'survey', 'generic category must not mask title evidence');
  assert.equal(o.categoryKey({category: 'Обследование деформаций проезда', title: 'Обследование деформированного участка проезда'}), 'survey', 'a road segment is not evidence of land surveying');
  assert.equal(o.categoryKey({summary: 'Обследование'}), 'unknown', 'classification uses the declared category and title only');
  const selection = profile({categories: ['survey']});
  assert.equal(o.evaluateFit(record({title: 'Неуточнённые работы', category: ''}), selection, now).verdict, 'review');
  assert.equal(o.evaluateFit(record({title: 'Проектирование', category: ''}), selection, now).verdict, 'excluded');
});

test('Include and exclude phrases normalize case, yo and whitespace with explicit alternative semantics', () => {
  assert.deepEqual(o.splitTerms(' ЁЛКА; елка\n  техническое   обследование, кровля '), ['елка', 'техническое обследование', 'кровля']);
  const input = record({title: 'ТЁПЛЫЙ   ПОЛ здания', category: '', summary: ''});
  assert.equal(o.evaluateFit(input, profile({includeWords: 'кровля; теплый пол'}), now).verdict, 'match', 'one include alternative is sufficient');
  const excluded = o.evaluateFit(input, profile({includeWords: 'теплый пол', excludeWords: 'ТЁПЛЫЙ ПОЛ'}), now);
  assert.equal(excluded.verdict, 'excluded', 'an exclusion wins even when an include phrase matches');
  assert.ok(has(excluded, 'exclude-found'));
  assert.equal(o.evaluateFit(input, profile({includeWords: 'пол теплый'}), now).verdict, 'excluded', 'word order within a phrase is meaningful');
  assert.equal(o.evaluateFit(record({title: 'Техническое', category: 'Обследование', summary: ''}), profile({includeWords: 'техническое обследование'}), now).verdict, 'excluded', 'a phrase cannot cross distinct public fields');
});

test('Phrase input is literal rather than a regex and never searches private notes or legal eligibility', () => {
  const input = record({title: 'Обследование', category: '', summary: '',
    notes: 'PRIVATE_MATCH', eligibilityNote: 'PRIVATE_MATCH', court: 'PRIVATE_MATCH'});
  assert.equal(o.evaluateFit(input, profile({includeWords: '.*'}), now).verdict, 'excluded');
  assert.equal(o.evaluateFit(record({title: 'Фраза [акт] (пример)'}), profile({includeWords: '[акт]'}), now).verdict, 'match');
  assert.equal(o.evaluateFit(input, profile({includeWords: 'PRIVATE_MATCH'}), now).verdict, 'excluded');
  const noText = o.evaluateFit(record({title: '', category: '', summary: ''}), profile({excludeWords: 'асбест'}), now);
  assert.equal(noText.verdict, 'review');
  assert.ok(has(noText, 'text-unknown'));
});

test('Claims, missing values and invalid monetary data are unknown work budgets, never out-of-range amounts', () => {
  const selection = profile({minBudget: '200000', maxBudget: '300000'});
  const claim = o.evaluateFit(record({amountType: 'claim', amountRub: 9000000}), selection, now);
  assert.equal(claim.budgetRub, null);
  assert.equal(claim.verdict, 'review');
  assert.ok(has(claim, 'budget-not-work'));
  assert.equal(has(claim, 'budget-above'), false);
  for (const change of [{amountType: 'not_published'}, {amountRub: null}, {amountRub: '250000'},
    {amountRub: NaN}, {amountRub: Infinity}, {amountRub: 0}, {amountRub: -100}, {amountRub: 1e12 + 1}]) {
    const result = o.evaluateFit(record(change), selection, now);
    assert.equal(result.budgetRub, null);
    assert.equal(result.verdict, 'review');
    assert.ok(has(result, 'budget-unknown'));
  }
  for (const amountType of ['contract', 'expert_fee']) {
    const result = o.evaluateFit(record({amountType}), selection, now);
    assert.equal(result.budgetRub, 250000.50);
    assert.equal(result.verdict, 'match');
  }
});

test('Price bounds are inclusive, accept comma kopecks and distinguish known cheap or expensive work', () => {
  const selection = profile({minBudget: '250000,50', maxBudget: '250000.50'});
  assert.equal(o.evaluateFit(record(), selection, now).verdict, 'match');
  const below = o.evaluateFit(record({amountRub: 250000.49}), selection, now);
  assert.equal(below.verdict, 'excluded');
  assert.ok(has(below, 'budget-below'));
  const above = o.evaluateFit(record({amountRub: 250000.51}), selection, now);
  assert.equal(above.verdict, 'excluded');
  assert.ok(has(above, 'budget-above'));
  assert.equal(o.evaluateFit(record({amountRub: .50}), profile({minBudget: '.50', maxBudget: '100.'}), now).verdict, 'match');
  assert.equal(o.evaluateFit(record(), profile({minBudget: '0'}), now).configured, true);
});

test('Unknown values only request information when the profile constrains those values', () => {
  const input = record({objectRegion: '', region: '', amountRub: null});
  const categoryOnly = o.evaluateFit(input, profile({categories: ['survey']}), now);
  assert.equal(categoryOnly.verdict, 'match');
  assert.equal(categoryOnly.sourceConfirmed, false);
  assert.equal(has(categoryOnly, 'region-unknown'), false);
  assert.equal(has(categoryOnly, 'budget-unknown'), false);
  assert.equal(o.evaluateFit(input, profile({regions: ['moscow']}), now).verdict, 'review');
  assert.equal(o.evaluateFit(input, profile({minBudget: '100'}), now).verdict, 'review');
});

test('Configured profiles exclude completed, archive and expired sources with Moscow date-only boundaries', () => {
  const selection = profile({categories: ['survey']});
  for (const [status, code] of [['closed', 'source-closed'], ['historical', 'source-historical']]) {
    const result = o.evaluateFit(record({status, deadline: '2099-01-01'}), selection, now);
    assert.equal(result.verdict, 'excluded');
    assert.ok(has(result, code));
    assert.equal(result.sourceConfirmed, false);
  }
  const input = record({status: 'open_confirmed', deadline: '2026-10-29'});
  const stillCurrent = o.evaluateFit(input, selection, Date.parse('2026-10-29T20:59:58Z'));
  assert.equal(stillCurrent.verdict, 'match');
  assert.equal(stillCurrent.sourceConfirmed, true);
  const expired = o.evaluateFit(input, selection, Date.parse('2026-10-29T21:00:00Z'));
  assert.equal(expired.verdict, 'excluded');
  assert.ok(has(expired, 'deadline-expired'));
  assert.equal(expired.sourceConfirmed, false);
  assert.equal(input.status, 'open_confirmed', 'computed expiry never changes the stored source status');
  assert.equal(o.evaluateFit(input, selection, new Date('2026-10-29T21:00:00Z')).verdict, 'excluded');
  assert.equal(o.evaluateFit(input, selection, NaN).verdict, 'review', 'an invalid clock cannot certify a current opportunity');
});

test('Invalid and malicious profile data fail safely without running getters or mutating prototypes', () => {
  const variants = [
    {regions: ['moon']}, {categories: ['all']}, {regions: ['moscow', 'moscow']}, {categories: Array(1)},
    {includeWords: []}, {excludeWords: 'x'.repeat(4001)}, {minBudget: 100}, {minBudget: '1e3'},
    {minBudget: 'Infinity'}, {maxBudget: '-1'}, {minBudget: '0x10'}, {minBudget: '1.001'},
    {minBudget: '2', maxBudget: '1'}, {maxBudget: '1000000000000.01'}, {unknown: true}
  ];
  for (const key of ['__proto__', 'constructor', 'prototype']) variants.push(JSON.parse('{"' + key + '":{}}'));
  let calls = 0;
  variants.push(Object.defineProperty({}, 'regions', {enumerable: true, get() {calls++; throw new Error('unsafe');}}));
  for (const invalid of variants) {
    const result = o.evaluateFit(record(), invalid, now);
    assert.equal(result.verdict, 'review');
    assert.ok(has(result, 'profile-invalid'));
  }
  assert.equal(calls, 0);
  assert.equal({}.polluted, undefined);
});

test('Invalid records and oversized text cannot run accessors or masquerade as known matches', () => {
  let calls = 0;
  const getter = Object.defineProperty({}, 'title', {enumerable: true, get() {calls++; throw new Error('unsafe');}});
  const malicious = JSON.parse('{"__proto__":{"polluted":true},"title":"Обследование"}');
  for (const invalid of [null, [], 'Обследование', 42, getter, malicious, new Date()]) {
    const result = o.evaluateFit(invalid, profile({categories: ['survey']}), now);
    assert.equal(result.verdict, 'review');
    assert.ok(has(result, 'record-invalid'));
    assert.equal(o.categoryKey(invalid), 'unknown');
  }
  const long = o.evaluateFit(record({title: 'Обследование' + 'x'.repeat(20001), category: '', summary: ''}), profile({includeWords: 'обследование'}), now);
  assert.equal(long.verdict, 'review');
  assert.ok(has(long, 'text-unknown'));
  assert.equal(calls, 0);
  assert.equal({}.polluted, undefined);
});

test('Comparison facts separate actual work budget, source status and computed expiry without private data', () => {
  const input = record({amountType: 'claim', amountRub: 9000000, notes: 'PRIVATE_NOTE', proposalRub: 333,
    status: 'needs_review', deadline: '2026-10-01'});
  const facts = o.comparisonFacts(input, profile({minBudget: '100000'}), now);
  assert.equal(facts.budgetRub, null);
  assert.equal(facts.budgetType, null);
  assert.match(facts.budgetLabel, /Сумма иска/);
  assert.equal(facts.status, 'needs_review');
  assert.equal(facts.effectiveStatus, 'closed');
  assert.equal(facts.sourceConfirmed, false);
  assert.equal(facts.fit.verdict, 'excluded');
  assert.equal(JSON.stringify(facts).includes('PRIVATE_NOTE'), false);
  assert.equal(Object.hasOwn(facts, 'proposalRub'), false);
  const contract = o.comparisonFacts(record(), {}, now);
  assert.equal(contract.budgetRub, 250000.50);
  assert.equal(contract.budgetType, 'contract');
  assert.equal(contract.budgetLabel, 'НМЦК по источнику');
});

test('Evaluation is pure and does not retain mutable aliases to profile arrays or reasons', () => {
  const input = Object.freeze(record()), selection = profile({regions: ['moscow'], categories: ['survey']});
  Object.freeze(selection.regions); Object.freeze(selection.categories); Object.freeze(selection);
  const before = JSON.stringify({input, selection});
  const result = o.evaluateFit(input, selection, now);
  result.reasons[0].text = 'Changed output';
  assert.equal(JSON.stringify({input, selection}), before);
  assert.equal(o.evaluateFit(input, selection, now).reasons.some(reason => reason.text === 'Changed output'), false);
});

test('UMD browser API works without DOM or storage and accepts public records from another realm', () => {
  const context = {window: {}};
  for (const name of ['monitor-utils.js', 'workspace-utils.js', 'opportunity-utils.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../' + name), 'utf8'), context);
  }
  const browserApi = context.window.ExpertOpportunityUtils;
  assert.deepEqual(Object.keys(browserApi).sort(), Object.keys(o).sort());
  const selection = context.window.ExpertWorkspaceUtils.emptyProfile();
  selection.regions.push('moscow');
  const result = browserApi.evaluateFit(record(), selection, now);
  assert.equal(result.verdict, 'match');
  assert.equal(result.region, 'moscow');
  assert.equal(result.sourceConfirmed, false);
});
