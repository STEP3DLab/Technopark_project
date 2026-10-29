'use strict';

// Transparent local selection rules. This module never changes a public status,
// verifies a source, determines legal eligibility or accesses browser storage.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./monitor-utils.js'), require('./workspace-utils.js'));
  } else root.ExpertOpportunityUtils = factory(root.ExpertMonitorUtils, root.ExpertWorkspaceUtils);
})(typeof window === 'undefined' ? globalThis : window, function (U, W) {
  const CATEGORY_LABELS = Object.freeze({
    survey: 'Обследование', design: 'Проектирование', land: 'Землеустройство',
    expertise: 'Экспертиза', unknown: 'Профиль работ не определён'
  });
  const CATEGORY_RULES = Object.freeze([
    {key: 'land', pattern: /землеуст|межеван|кадастр|земельн|границ.{0,32}участ/, basis: 'Признаки землеустройства, кадастра или границ земельного участка'},
    {key: 'design', pattern: /проектир|документац/, basis: 'Признаки проектирования или документации'},
    {key: 'survey', pattern: /обследован|технического состояния/, basis: 'Признаки обследования или оценки технического состояния'},
    {key: 'expertise', pattern: /экспертиз|экспертн|исследован|качеств.{0,24}работ|объем.{0,24}работ/, basis: 'Признаки экспертизы, исследования, качества или объёмов работ'}
  ]);
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const SOURCE_STATUSES = Object.freeze(['open_confirmed', 'needs_review', 'closed', 'historical']);
  const TEXT_FIELDS = Object.freeze(['title', 'category', 'summary']);
  const MAX_TEXT = 20000;

  function safeObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      const prototype = Object.getPrototypeOf(value);
      // Plain records may arrive from another JS realm (for example an iframe).
      // Only own data properties are read below, never inherited values.
      return (prototype === null || Object.getPrototypeOf(prototype) === null)
        && Object.getOwnPropertySymbols(value).length === 0
        && Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, descriptor]) =>
          !FORBIDDEN_KEYS.has(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
    } catch { return false; }
  }

  function readText(value, max = MAX_TEXT) {
    return typeof value === 'string' && value.length <= max
      ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
  }

  function normalizeText(value) {
    return readText(value).normalize('NFC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  // A phrase is a literal sequential fragment, not a regex or a stemmed query.
  // Comma, semicolon and newline separate alternatives; whitespace inside each
  // phrase is collapsed. A phrase must occur within one public text field.
  function splitTerms(value) {
    if (typeof value !== 'string' || value.length > 4000) return [];
    return [...new Set(value.split(/[,;\n]+/).map(normalizeText).filter(Boolean))];
  }

  function categoryInfo(record) {
    if (!safeObject(record)) return {key: 'unknown', label: CATEGORY_LABELS.unknown,
      basis: 'Нет пригодной для определения профиля категории или названия.', heuristic: true};
    const fields = Object.getOwnPropertyDescriptors(record);
    const text = [fields.category?.value, fields.title?.value].map(normalizeText).filter(Boolean).join(' ');
    const rule = CATEGORY_RULES.find(item => item.pattern.test(text));
    return rule ? {key: rule.key, label: CATEGORY_LABELS[rule.key],
      basis: rule.basis + ' в категории или названии. Это правило по словам; состав работ проверяют по документам.', heuristic: true}
      : {key: 'unknown', label: CATEGORY_LABELS.unknown,
        basis: 'В категории и названии нет достаточных признаков выбранных профилей работ.', heuristic: true};
  }

  function categoryKey(record) { return categoryInfo(record).key; }

  function budgetOf(record) {
    const amount = U.publishedBudget(record);
    // The local price range and proposal model use the same numerical ceiling.
    return amount !== null && amount <= 1e12 ? amount : null;
  }

  function profileData(raw) {
    try {
      const profile = raw === undefined || raw === null ? W.emptyProfile() : raw;
      if (!W.validProfile(profile)) return null;
      const complete = {...W.emptyProfile(), ...profile};
      return {...complete, regions: [...complete.regions], categories: [...complete.categories]};
    } catch { return null; }
  }

  function profileBudget(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text === '' ? null : Number(text.replace(',', '.'));
  }

  function clockTime(now) {
    if (typeof now === 'number') return Number.isFinite(now) ? now : null;
    if (now instanceof Date) return Number.isFinite(now.getTime()) ? now.getTime() : null;
    return null;
  }

  function recordFacts(record, now) {
    const valid = safeObject(record), row = Object.create(null);
    if (valid) for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(record))) row[key] = descriptor.value;
    const category = categoryInfo(row), time = clockTime(now), deadline = U.deadlineTime(row);
    const expired = deadline !== null && time !== null && deadline < time;
    return {valid, row, category, time, expired, region: U.normalizeRegion(row),
      budgetRub: budgetOf(row), deadlineTime: deadline,
      sourceConfirmed: row.status === 'open_confirmed' && !expired};
  }

  function evaluateFit(record, rawProfile, now = Date.now()) {
    const facts = recordFacts(record, now), profile = profileData(rawProfile);
    const base = {configured: false, verdict: 'match', reasons: [], region: facts.region,
      category: facts.category.key, budgetRub: facts.budgetRub,
      deadlineTime: facts.deadlineTime, sourceConfirmed: facts.sourceConfirmed};
    if (!profile) return {...base, configured: true, verdict: 'review', reasons: [
      {code: 'profile-invalid', kind: 'review', text: 'Профиль содержит некорректные поля или диапазон сумм. Исправьте настройки отбора.'}
    ]};
    const included = splitTerms(profile.includeWords), excluded = splitTerms(profile.excludeWords);
    const minBudget = profileBudget(profile.minBudget), maxBudget = profileBudget(profile.maxBudget);
    const configured = !!(profile.regions.length || profile.categories.length || included.length
      || excluded.length || minBudget !== null || maxBudget !== null);
    // No configured criteria means neutral inclusion, including archive records.
    // Callers must not show a "match" label when configured is false.
    if (!configured) return base;
    const reasons = [];
    const add = (code, kind, text) => reasons.push({code, kind, text});
    if (!facts.valid) add('record-invalid', 'review', 'Недостаточно корректных данных записи для сопоставления.');
    if (facts.time === null) add('clock-invalid', 'review', 'Не удалось определить текущее время для проверки срока.');
    const row = facts.row;
    if (row.status === 'closed') add('source-closed', 'excluded', 'В публичном реестре приём отмечен как завершённый.');
    else if (row.status === 'historical') add('source-historical', 'excluded', 'Это архивный пример, а не актуальная возможность подачи.');
    else if (facts.expired) add('deadline-expired', 'excluded', 'Указанный в источнике срок истёк. Возможное продление нужно проверить отдельно.');
    if (!facts.sourceConfirmed && !['closed', 'historical'].includes(row.status))
      add('source-unconfirmed', 'warning', 'Совпадение параметров не подтверждает приём: актуальность и порядок подачи нужно проверить в источнике.');

    if (profile.regions.length) {
      if (facts.region === 'unknown') add('region-unknown', 'review', 'Место объекта не уточнено. Адрес суда или заказчика не подтверждает место работ.');
      else if (!profile.regions.includes(facts.region)) add('region-outside', 'excluded', 'Место объекта: ' + U.geographyLabel(facts.region) + ' — вне выбранных регионов.');
      else add('region-match', 'match', 'Место объекта соответствует профилю: ' + U.geographyLabel(facts.region) + '.');
    }
    if (profile.categories.length) {
      if (facts.category.key === 'unknown') add('category-unknown', 'review', 'По категории и названию нельзя определить профиль работ. Нужны сведения из документов.');
      else if (!profile.categories.includes(facts.category.key)) add('category-outside', 'excluded', 'По словам в категории и названии профиль «' + facts.category.label + '» вне выбранного отбора.');
      else add('category-match', 'match', 'По словам в категории и названии: «' + facts.category.label + '». Состав работ и требования нужно сверить с документами.');
    }
    if (included.length || excluded.length) {
      const texts = TEXT_FIELDS.map(key => normalizeText(row[key])).filter(Boolean);
      const found = terms => terms.filter(term => texts.some(text => text.includes(term)));
      const blocked = found(excluded), wanted = found(included);
      if (blocked.length) add('exclude-found', 'excluded', 'В названии, категории или описании найдена исключающая фраза: ' + blocked.join('; ') + '.');
      if (!texts.length) add('text-unknown', 'review', 'Нет названия, категории или описания, по которым можно проверить заданные фразы.');
      else if (included.length && !wanted.length) add('include-missing', 'excluded', 'В названии, категории и описании нет ни одной указанной включающей фразы.');
      else if (included.length) add('include-found', 'match', 'Найдена включающая фраза: ' + wanted.join('; ') + '.');
      if (texts.length && excluded.length && !blocked.length) add('exclude-clear', 'match', 'В доступном названии, категории и описании исключающие фразы не найдены.');
    }
    if (minBudget !== null || maxBudget !== null) {
      if (facts.budgetRub === null) add(row.amountType === 'claim' ? 'budget-not-work' : 'budget-unknown', 'review',
        row.amountType === 'claim' ? 'Указана сумма иска, а не стоимость работ. Проверить ваш диапазон бюджета по ней нельзя.'
          : 'Стоимость экспертизы или закупки не опубликована либо некорректна. Соответствие вашему диапазону пока неизвестно.');
      else if (minBudget !== null && facts.budgetRub < minBudget) add('budget-below', 'excluded', 'Опубликованная стоимость работ ниже минимальной суммы вашего профиля.');
      else if (maxBudget !== null && facts.budgetRub > maxBudget) add('budget-above', 'excluded', 'Опубликованная стоимость работ выше максимальной суммы вашего профиля.');
      else add('budget-match', 'match', 'Опубликованная стоимость экспертизы или закупки находится в вашем диапазоне. Это не расчёт вашей цены.');
    }
    const order = {excluded: 0, review: 1, match: 2, warning: 3};
    reasons.sort((a, b) => order[a.kind] - order[b.kind]);
    const verdict = reasons.some(reason => reason.kind === 'excluded') ? 'excluded'
      : reasons.some(reason => reason.kind === 'review') ? 'review' : 'match';
    return {...base, configured: true, verdict, reasons};
  }

  function comparisonFacts(record, profile, now = Date.now()) {
    const facts = recordFacts(record, now), row = facts.row;
    const status = SOURCE_STATUSES.includes(row.status) ? row.status : 'unknown';
    const budgetType = facts.budgetRub !== null ? row.amountType : null;
    return {id: readText(row.id, 200), title: readText(row.title, 5000) || 'Название не указано',
      caseNumber: readText(row.caseNumber, 300), region: facts.region,
      regionLabel: U.geographyLabel(facts.region), category: facts.category.key,
      categoryLabel: facts.category.label, categoryBasis: facts.category.basis,
      budgetRub: facts.budgetRub, budgetType,
      budgetLabel: facts.budgetRub === null ? row.amountType === 'claim' ? 'Сумма иска не является бюджетом работ' : 'Стоимость работ не опубликована'
        : readText(row.amountLabel, 1000) || (budgetType === 'expert_fee' ? 'Стоимость экспертизы по источнику' : 'Цена закупки / контракта по источнику'),
      status, effectiveStatus: facts.expired && ['open_confirmed', 'needs_review'].includes(status) ? 'closed' : status,
      deadline: facts.deadlineTime === null ? '' : readText(row.deadline, 100), deadlineTime: facts.deadlineTime,
      sourceConfirmed: facts.sourceConfirmed, fit: evaluateFit(record, profile, now)};
  }

  return Object.freeze({CATEGORY_LABELS, categoryKey, categoryInfo, splitTerms, evaluateFit, comparisonFacts});
});
