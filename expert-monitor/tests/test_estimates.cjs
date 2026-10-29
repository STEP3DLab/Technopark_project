'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../estimate-utils.js');

const line = (changes = {}) => ({id: 'line-1', type: 'labor', name: 'Работа специалиста', quantity: '1', unit: 'ч', rateRub: '100', ...changes});
const estimate = (lines = [line()], changes = {}) => ({...E.emptyEstimate(), lines, ...changes});

test('A new estimate has no invented quantities or rates, and incomplete work can be saved without producing a price', () => {
  const empty = E.emptyEstimate();
  assert.equal(empty.lines.length, 1);
  assert.equal(empty.lines[0].name, '');
  assert.equal(empty.lines[0].quantity, '');
  assert.equal(empty.lines[0].rateRub, '');
  assert.equal(empty.updatedAt, undefined, 'The pure model must not invent a save time');
  assert.equal(empty.recordTitle, '');
  assert.equal(empty.caseNumber, '');
  assert.equal(E.validateEstimate(empty, {allowIncomplete: true}).valid, true);
  const result = E.calculateEstimate(empty);
  assert.equal(result.valid, false);
  assert.equal(result.totals, null);
  assert.deepEqual(result.lines, []);
  assert.deepEqual(new Set(result.errors.map(error => error.field)),
    new Set(['lines.0.name', 'lines.0.quantity', 'lines.0.rateRub']));
  empty.lines[0].quantity = '42';
  assert.equal(E.emptyEstimate().lines[0].quantity, '', 'New forms must not share mutable rows');
});

test('Mixed labor and expense rows use the documented sequential bases, rounding each stage to kopecks', () => {
  const input = estimate([
    line({quantity: '2.125', rateRub: '1000.50'}),
    line({id: 'travel', type: 'expense', name: 'Выезд', quantity: '1.5', unit: 'поездка', rateRub: '99.99'})
  ], {overheadPct: '10', reservePct: '5', markupPct: '20', vatPct: '7.5'});
  const result = E.calculateEstimate(input);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.lines, [{id: 'line-1', totalRub: 2126.06}, {id: 'travel', totalRub: 149.99}]);
  assert.deepEqual(result.totals, {direct: 2276.05, overhead: 227.61, reserve: 125.18,
    markup: 525.77, net: 3154.61, vat: 236.6, total: 3391.21});
});

test('Half-kopeck lines round upwards before summing, without binary floating-point drift', () => {
  const result = E.calculateEstimate(estimate([
    line({quantity: '0.5', rateRub: '0.01'}),
    line({id: 'second', quantity: '0.5', rateRub: '0.01'}),
    line({id: 'third', quantity: '3', rateRub: 0.1})
  ]));
  assert.equal(result.valid, true);
  assert.deepEqual(result.lines.map(row => row.totalRub), [0.01, 0.01, 0.3]);
  assert.equal(result.totals.direct, 0.32, 'Rounding only the aggregate would incorrectly return 0.31');
  const stages = E.calculateEstimate(estimate([line({rateRub: '0.05'})], {overheadPct: '10', vatPct: '25'}));
  assert.equal(stages.totals.overhead, 0.01);
  assert.equal(stages.totals.net, 0.06);
  assert.equal(stages.totals.vat, 0.02);
  assert.equal(stages.totals.total, 0.08);
});

test('Decimal commas, numbers and surrounding whitespace are accepted without changing the saved input', () => {
  const input = estimate([line({quantity: ' .500 ', rateRub: '12,50'})], {overheadPct: '10,25', reservePct: '', markupPct: 0, vatPct: '0.'});
  const before = JSON.stringify(input);
  const result = E.calculateEstimate(input);
  assert.equal(result.valid, true);
  assert.equal(result.totals.direct, 6.25);
  assert.equal(result.totals.overhead, 0.64);
  assert.equal(result.totals.total, 6.89);
  assert.equal(JSON.stringify(input), before);
  result.lines[0].id = 'changed-result';
  assert.equal(input.lines[0].id, 'line-1');
});

test('An explicitly free row is valid, while zero quantity and a blank price do not invent free work', () => {
  const free = E.calculateEstimate(estimate([line({type: 'expense', rateRub: '0'})]));
  assert.equal(free.valid, true);
  assert.equal(free.totals.total, 0);
  assert.equal(E.calculateEstimate(estimate([line({quantity: '0', rateRub: '0'})])).valid, false);
  assert.equal(E.calculateEstimate(estimate([line({rateRub: ''})])).valid, false);
  assert.equal(E.validateEstimate(estimate([line({rateRub: ''})]), {allowIncomplete: true}).valid, true);
  const noAdjustments = {lines: [line()]};
  assert.equal(E.calculateEstimate(noAdjustments).totals.total, 100, 'Omitted percentages add nothing');
});

test('Invalid, signed, scientific and excessive-precision numbers are rejected even for incomplete saved estimates', () => {
  const invalid = [NaN, Infinity, -Infinity, -0, -1, true, null, undefined, {}, [],
    'NaN', 'Infinity', '-0', '+1', '-1', '1e3', '0x10', '1 000', '1,000.50', '1.2.3'];
  for (const value of invalid) {
    for (const field of ['quantity', 'rateRub']) {
      const input = estimate([line({[field]: value})]);
      const validation = E.validateEstimate(input, {allowIncomplete: true});
      assert.equal(validation.valid, false, field + ': ' + String(value));
      assert.ok(validation.errors.some(error => error.field === 'lines.0.' + field));
      assert.equal(E.calculateEstimate(input).totals, null);
    }
  }
  for (const [field, value] of [['quantity', '0.0001'], ['quantity', '1000000.001'],
    ['rateRub', '1.005'], ['rateRub', '1000000000000.01']])
    assert.equal(E.validateEstimate(estimate([line({[field]: value})]), {allowIncomplete: true}).valid, false);
});

test('Percentages have explicit mathematical limits and never silently coerce malformed input to zero', () => {
  for (const field of ['overheadPct', 'reservePct', 'markupPct', 'vatPct']) {
    for (const value of [-1, true, null, undefined, NaN, Infinity, '1e1', '0x10', '2.001'])
      assert.equal(E.validateEstimate(estimate(undefined, {[field]: value}), {allowIncomplete: true}).valid, false, field + ': ' + String(value));
    const maximum = field === 'vatPct' ? '100' : '1000';
    assert.equal(E.calculateEstimate(estimate(undefined, {[field]: maximum})).valid, true);
    assert.equal(E.calculateEstimate(estimate(undefined, {[field]: Number(maximum) + 0.01})).valid, false);
  }
});

test('Line products, aggregate totals and added percentages cannot exceed the money limit', () => {
  const maximum = E.calculateEstimate(estimate([line({quantity: '1000000', rateRub: '1000000'})]));
  assert.equal(maximum.valid, true);
  assert.equal(maximum.totals.total, 1e12);
  const excessive = [
    estimate([line({quantity: '1000000', rateRub: '1000000000000'})]),
    estimate([line({rateRub: '1000000000000'}), line({id: 'one-more', rateRub: '0.01'})]),
    estimate([line({rateRub: '1000000000000'})], {overheadPct: '0.01'}),
    estimate([line({rateRub: '1000000000000'})], {vatPct: '0.01'})
  ];
  for (const input of excessive) {
    assert.equal(E.validateEstimate(input, {allowIncomplete: true}).valid, false, 'Saving may not bypass amount limits');
    const result = E.calculateEstimate(input);
    assert.equal(result.valid, false);
    assert.equal(result.totals, null);
    assert.ok(result.errors.some(error => /1 трлн/.test(error.message)));
  }
});

test('Row identity, line types, text limits and estimate metadata are validated without dropping fields', () => {
  const invalidLines = [line({id: ''}), line({id: '__proto__'}), line({id: 'x'.repeat(201)}),
    line({type: 'automatic-rate'}), line({name: ' '}), line({name: 'x'.repeat(1001)}),
    line({unit: 'x'.repeat(41)}), line({quantity: undefined}), line({calculatedTotal: 10})];
  for (const row of invalidLines) assert.equal(E.calculateEstimate(estimate([row])).valid, false);
  assert.equal(E.calculateEstimate(estimate([line(), line()])).valid, false);
  assert.equal(E.calculateEstimate(estimate([])).valid, false);
  assert.equal(E.validateEstimate(estimate([]), {allowIncomplete: true}).valid, true);
  assert.equal(E.calculateEstimate(estimate(Array.from({length: 100}, (_, i) => line({id: 'r' + i})))).valid, true);
  assert.equal(E.validateEstimate(estimate(Array.from({length: 101}, (_, i) => line({id: 'r' + i}))), {allowIncomplete: true}).valid, false);
  for (const changes of [{notes: 'x'.repeat(20001)}, {recordTitle: 'x'.repeat(1001)}, {caseNumber: 'x'.repeat(301)},
    {notes: null}, {marketRate: 100}]) assert.equal(E.validateEstimate(estimate(undefined, changes), {allowIncomplete: true}).valid, false);
  const withMetadata = estimate(undefined, {recordTitle: 'Исследование объекта', caseNumber: 'А40-1/2099', notes: 'Проверить объём'});
  assert.deepEqual(E.calculateEstimate(withMetadata).totals, E.calculateEstimate(estimate()).totals);
});

test('Saved timestamps require real calendar instants with a time zone', () => {
  for (const updatedAt of ['2026-10-29T10:00:00Z', '2028-02-29T12:30:00.123+03:00'])
    assert.equal(E.validateEstimate(estimate(undefined, {updatedAt})).valid, true);
  for (const updatedAt of ['', null, 'today', '2026-10-29', '2026-10-29T12:00:00',
    '2026-02-29T12:00:00Z', '2026-04-31T12:00:00Z', '2026-10-29T24:00:00Z', '2026-10-29T12:60:00Z'])
    assert.equal(E.validateEstimate(estimate(undefined, {updatedAt}), {allowIncomplete: true}).valid, false);
});

test('Unsafe object shapes, sparse arrays and accessors are rejected before reading their values', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const forbidden = JSON.parse('{"' + key + '":true}');
    assert.equal(E.calculateEstimate({...estimate(), ...forbidden}).valid, false);
    assert.equal(E.calculateEstimate(estimate([{...line(), ...forbidden}])).valid, false);
  }
  const sparse = estimate(); sparse.lines = Array(1);
  assert.equal(E.validateEstimate(sparse, {allowIncomplete: true}).valid, false);
  const getter = line();
  Object.defineProperty(getter, 'rateRub', {enumerable: true, get() {throw new Error('Do not read imported accessors');}});
  assert.equal(E.calculateEstimate(estimate([getter])).valid, false);
  const hidden = estimate();
  Object.defineProperty(hidden, '__proto__', {value: {polluted: true}});
  assert.equal(E.calculateEstimate(hidden).valid, false);
  const symbolic = estimate(); symbolic[Symbol('hidden')] = true;
  assert.equal(E.calculateEstimate(symbolic).valid, false);
  for (const value of [null, undefined, [], new Date(), 42, 'estimate'])
    assert.equal(E.calculateEstimate(value).valid, false);
  assert.equal({}.polluted, undefined);
});

test('The browser module has the same pure result as Node and does not read storage or the registry', () => {
  const context = vm.createContext({});
  vm.runInContext('window = globalThis; Object.defineProperty(globalThis, "localStorage", {get() {throw new Error("No storage access");}});', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../estimate-utils.js'), 'utf8'), context);
  const input = estimate([line({quantity: '1.125', rateRub: '1234.56'})], {reservePct: '7.5', markupPct: '10'});
  const result = vm.runInContext('ExpertEstimateUtils.calculateEstimate(' + JSON.stringify(input) + ')', context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), E.calculateEstimate(input));
});
