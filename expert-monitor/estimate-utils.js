'use strict';

// User-entered estimates only: no market rates, working-hour assumptions or tax
// rules. All arithmetic uses integer kopecks; every stage rounds half upwards.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpertEstimateUtils = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const ESTIMATE_FIELDS = new Set(['lines', 'overheadPct', 'reservePct', 'markupPct', 'vatPct',
    'notes', 'recordTitle', 'caseNumber', 'updatedAt']);
  const LINE_FIELDS = new Set(['id', 'type', 'name', 'quantity', 'unit', 'rateRub']);
  const LIMITS = Object.freeze({lines: 100, quantity: 1000000, moneyRub: 1000000000000,
    percentage: 1000, vatPercentage: 100, name: 1000, unit: 40, notes: 20000});
  const MAX_KOPECKS = BigInt(LIMITS.moneyRub) * 100n;
  const PERCENT_FIELDS = ['overheadPct', 'reservePct', 'markupPct', 'vatPct'];

  function emptyEstimate() {
    return {lines: [{id: 'line-1', type: 'labor', name: '', quantity: '', unit: '', rateRub: ''}],
      overheadPct: '0', reservePct: '0', markupPct: '0', vatPct: '0',
      notes: '', recordTitle: '', caseNumber: ''};
  }

  function safeObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && Object.getOwnPropertySymbols(value).length === 0
      && Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, descriptor]) =>
        !FORBIDDEN_KEYS.has(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  }

  function allowedFields(value, fields) {
    return safeObject(value) && Object.keys(value).every(key => fields.has(key));
  }

  function denseArray(value) {
    if (!Array.isArray(value) || value.length > LIMITS.lines
      || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length > 0) return false;
    const keys = Object.getOwnPropertyNames(value);
    return keys.length === value.length + 1 && keys.every(key => key === 'length'
      || /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }

  function validString(value, max) {return typeof value === 'string' && value.length <= max;}
  function validId(value) {
    return validString(value, 200) && value.trim().length > 0 && !FORBIDDEN_KEYS.has(value);
  }
  function validTimestamp(value) {
    if (!validString(value, 100)) return false;
    const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) return false;
    const day = new Date(parts[1] + 'T00:00:00.000Z');
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === parts[1]
      && Number.isFinite(Date.parse(value));
  }

  // Return fixed-point integers without binary multiplication. A comma or dot
  // is a decimal separator; grouping separators, signs and exponents are not.
  function decimal(value, places, maximum, allowBlank = false, positive = false) {
    if (typeof value !== 'string' && typeof value !== 'number') return {error: 'Введите число.'};
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))
      return {error: 'Введите конечное неотрицательное число.'};
    const source = String(value).trim();
    if (!source) return allowBlank ? {value: null} : {error: 'Укажите число.'};
    if (source.length > 100 || !new RegExp('^(?:\\d+(?:[.,]\\d{0,' + places + '})?|[.,]\\d{1,' + places + '})$').test(source))
      return {error: 'Нужно неотрицательное десятичное число, не более ' + places + ' знаков после запятой.'};
    const [whole, fraction = ''] = source.replace(',', '.').split('.');
    const scale = 10n ** BigInt(places);
    const fixed = BigInt(whole || '0') * scale + BigInt(fraction.padEnd(places, '0') || '0');
    if (positive && fixed === 0n) return {error: 'Количество должно быть больше нуля.'};
    if (fixed > BigInt(maximum) * scale) return {error: 'Значение превышает допустимый предел ' + maximum + '.'};
    return {value: fixed};
  }

  function rounded(numerator, denominator) {return (numerator + denominator / 2n) / denominator;}
  function rubles(kopecks) {return Number(kopecks) / 100;}

  function amounts(rows, percentages, errors) {
    const limit = (value, field) => {
      if (value > MAX_KOPECKS) errors.push({field, message: 'Сумма превышает предел 1 трлн ₽.'});
      return value;
    };
    const lines = [];
    let direct = 0n;
    for (const row of rows) {
      if (row.quantity === null || row.rate === null) continue;
      const amount = limit(rounded(row.quantity * row.rate, 1000n), 'lines.' + row.index + '.total');
      direct += amount;
      lines.push({id: row.id, totalRub: rubles(amount)});
    }
    limit(direct, 'totals.direct');
    const apply = (base, field) => rounded(base * percentages[field], 10000n);
    const overhead = limit(apply(direct, 'overheadPct'), 'totals.overhead');
    const reserve = limit(apply(direct + overhead, 'reservePct'), 'totals.reserve');
    const markup = limit(apply(direct + overhead + reserve, 'markupPct'), 'totals.markup');
    const net = limit(direct + overhead + reserve + markup, 'totals.net');
    const vat = limit(apply(net, 'vatPct'), 'totals.vat');
    const total = limit(net + vat, 'totals.total');
    return {lines, totals: Object.fromEntries(Object.entries({direct, overhead, reserve, markup, net, vat, total})
      .map(([key, value]) => [key, rubles(value)]))};
  }

  function inspect(estimate, allowIncomplete) {
    const errors = [];
    if (!allowedFields(estimate, ESTIMATE_FIELDS))
      return {errors: [{field: 'estimate', message: 'Некорректная структура расчёта или неизвестные поля.'}]};
    const rows = [];
    if (!denseArray(estimate.lines)) errors.push({field: 'lines', message: 'Допустимо не более 100 строк расчёта.'});
    else {
      if (!allowIncomplete && !estimate.lines.length) errors.push({field: 'lines', message: 'Добавьте хотя бы одну строку расчёта.'});
      const ids = new Set();
      estimate.lines.forEach((line, index) => {
        const field = 'lines.' + index;
        if (!allowedFields(line, LINE_FIELDS)) {
          errors.push({field, message: 'Некорректная строка расчёта или неизвестные поля.'}); return;
        }
        if (!validId(line.id) || ids.has(line.id)) errors.push({field: field + '.id', message: 'У каждой строки должен быть уникальный идентификатор.'});
        ids.add(line.id);
        if (!['labor', 'expense'].includes(line.type)) errors.push({field: field + '.type', message: 'Выберите работу или расход.'});
        if (!validString(line.name, LIMITS.name) || !allowIncomplete && !line.name.trim())
          errors.push({field: field + '.name', message: 'Укажите название строки, не более 1000 символов.'});
        if (!validString(line.unit, LIMITS.unit)) errors.push({field: field + '.unit', message: 'Единица измерения должна быть строкой до 40 символов.'});
        const quantity = decimal(line.quantity, 3, LIMITS.quantity, allowIncomplete, true);
        const rate = decimal(line.rateRub, 2, LIMITS.moneyRub, allowIncomplete);
        if (quantity.error) errors.push({field: field + '.quantity', message: quantity.error});
        if (rate.error) errors.push({field: field + '.rateRub', message: rate.error});
        rows.push({id: line.id, index, quantity: quantity.value, rate: rate.value});
      });
    }
    const percentages = {};
    for (const field of PERCENT_FIELDS) {
      // An omitted/blank adjustment means no added percentage. In particular,
      // zero VAT is only a mathematical input, never a statement of tax status.
      const value = Object.hasOwn(estimate, field) ? estimate[field] : '0';
      const parsed = decimal(value, 2, field === 'vatPct' ? LIMITS.vatPercentage : LIMITS.percentage, true);
      if (parsed.error) errors.push({field, message: parsed.error});
      else percentages[field] = parsed.value ?? 0n;
    }
    for (const [field, max] of [['notes', LIMITS.notes], ['recordTitle', 1000], ['caseNumber', 300]])
      if (Object.hasOwn(estimate, field) && !validString(estimate[field], max))
        errors.push({field, message: 'Поле должно быть строкой до ' + max + ' символов.'});
    if (Object.hasOwn(estimate, 'updatedAt') && !validTimestamp(estimate.updatedAt))
      errors.push({field: 'updatedAt', message: 'Нужна корректная дата сохранения ISO с часовым поясом.'});
    const result = errors.length ? null : amounts(rows, percentages, errors);
    return {errors, result};
  }

  // Incomplete drafts may contain blank names, quantities and rates, but an
  // entered invalid number, unsupported field or excessive amount is rejected.
  function validateEstimate(estimate, options = {}) {
    const {errors} = inspect(estimate, options.allowIncomplete === true);
    return {valid: errors.length === 0, errors};
  }

  // Each line = round(quantity × rate); direct = sum(lines).
  // overhead = round(direct × %); reserve = round((direct + overhead) × %);
  // markup = round((direct + overhead + reserve) × %); net = their sum;
  // vat = round(net × %); total = net + vat. Amounts returned are rubles.
  function calculateEstimate(estimate) {
    const {errors, result} = inspect(estimate, false);
    return errors.length ? {valid: false, errors, lines: [], totals: null}
      : {valid: true, errors: [], lines: result.lines, totals: result.totals};
  }

  return Object.freeze({LIMITS, emptyEstimate, validateEstimate, calculateEstimate});
});
