'use strict';

// UI controller for the local profile and an explicit selection of up to four
// records. App routing, storage ownership and document-wide events stay in app.js.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(root,
    require('./opportunity-utils.js'), require('./workspace-utils.js'));
  else root.ExpertSelectionUI = factory(root, root.ExpertOpportunityUtils, root.ExpertWorkspaceUtils);
})(typeof window === 'undefined' ? globalThis : window, function (root, O, W) {
  const REGIONS = Object.freeze({moscow: 'Москва', oblast: 'Московская область',
    other: 'Другой регион', unknown: 'Место объекта не уточнено'});
  const CATEGORIES = Object.freeze({survey: 'Обследование', design: 'Проектирование',
    land: 'Землеустройство', expertise: 'Экспертиза'});
  const FIT_LABELS = Object.freeze({match: 'По вашим параметрам', review: 'Нужны сведения', excluded: 'Вне отбора'});
  const CHECK_KEYS = Object.freeze(['stage', 'scope', 'eligibility', 'materials', 'deadline', 'channel']);

  function create(A) {
    const document = A.document || root.document;
    const $ = selector => document?.querySelector(selector) || null;
    const all = selector => [...(document?.querySelectorAll(selector) || [])];
    const esc = A.esc;
    const clone = value => JSON.parse(JSON.stringify(value));
    const workspace = () => A.workspace();
    const savedProfile = () => ({...W.emptyProfile(), ...(workspace().profile || {})});
    const selectedIds = () => Array.isArray(workspace().compareIds) ? [...workspace().compareIds] : [];
    const ask = typeof A.confirm === 'function' ? A.confirm : message => typeof root.confirm === 'function' && root.confirm(message);
    const icon = name => A.icon(name);
    const text = value => typeof value === 'string' ? value : '';
    const multiline = value => esc(text(value)).replace(/\r\n?|\n/g, '<br>');
    const title = record => text(record?.caseNumber) || text(record?.title) || 'Запись';
    let profileBaseline = null;
    let returnFocus = null;

    function profileValues() {
      return {regions: all('#profile-content [data-profile-region]').filter(node => node.checked).map(node => node.dataset.profileRegion),
        categories: all('#profile-content [data-profile-category]').filter(node => node.checked).map(node => node.dataset.profileCategory),
        includeWords: $('#profile-include')?.value || '', excludeWords: $('#profile-exclude')?.value || '',
        minBudget: $('#profile-min-budget')?.value || '', maxBudget: $('#profile-max-budget')?.value || ''};
    }

    function profileDirty() {
      return !!$('#profile-dialog')?.open && profileBaseline !== null
        && JSON.stringify(profileValues()) !== JSON.stringify(profileBaseline);
    }

    function feedback(message) {
      const node = $('#profile-save-state');
      if (node) node.textContent = message;
    }

    function validProfileForm() {
      if ($('#profile-form') && !$('#profile-form').reportValidity()) return false;
      if (W.validProfile(profileValues())) return true;
      feedback('Проверьте диапазон: суммы от 0 до 1 трлн ₽, не больше двух знаков после точки или запятой. Минимум не должен превышать максимум. Для переносимой копии сначала исправьте поля.');
      $('#profile-min-budget')?.focus();
      return false;
    }

    function profileMarkup(profile) {
      const choices = (items, field, selected) => Object.entries(items).map(([value, label]) =>
        `<label class="profile-check"><input type="checkbox" data-profile-${field}="${value}"${selected.includes(value) ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('');
      return `<h2 id="profile-title" tabindex="-1">Мой профиль отбора</h2>`
        + `<p id="profile-description">Выберите работы, которые хотите рассматривать. Профиль хранится в этом браузере; совпадение параметров не подтверждает приём и условия участия.</p>`
        + `<form id="profile-form" aria-describedby="profile-description"><div class="profile-layout">`
        + `<section class="profile-panel"><fieldset class="profile-checks"><legend>Место объекта</legend>${choices(REGIONS, 'region', profile.regions)}</fieldset><p class="profile-note">Ничего не отмечено — любой регион. Используется место работ, а не адрес заказчика. Неуточнённое место остаётся кандидатом для проверки.</p></section>`
        + `<section class="profile-panel"><fieldset class="profile-checks"><legend>Профиль работ</legend>${choices(CATEGORIES, 'category', profile.categories)}</fieldset><p class="profile-note">Ничего не отмечено — любой профиль. Категория определяется по словам в названии и категории записи; точный состав работ нужно проверить в документах.</p></section>`
        + `<section class="profile-panel"><h3>Фразы в названии и описании</h3><div class="profile-grid">`
        + `<div class="field"><label for="profile-include">Что искать</label><textarea id="profile-include" maxlength="4000" rows="4" placeholder="обследование кровли; фасад" aria-describedby="profile-phrase-help">${esc(profile.includeWords)}</textarea></div>`
        + `<div class="field"><label for="profile-exclude">Что исключить</label><textarea id="profile-exclude" maxlength="4000" rows="4" placeholder="автомобильная экспертиза; перевод" aria-describedby="profile-phrase-help">${esc(profile.excludeWords)}</textarea></div></div>`
        + `<p class="profile-note" id="profile-phrase-help">Фразы разделяйте запятой, точкой с запятой или новой строкой. Достаточно одной фразы из «Что искать»; любая исключающая фраза убирает запись. Ищется последовательный фрагмент в названии, категории или описании, без учёта регистра и ё/е. Личные заметки не участвуют.</p></section>`
        + `<section class="profile-panel"><h3>Стоимость работ по источнику</h3><div class="profile-grid">`
        + `<div class="field"><label for="profile-min-budget">От, ₽</label><input id="profile-min-budget" type="text" inputmode="decimal" maxlength="100" value="${esc(profile.minBudget)}" placeholder="Без минимума" aria-describedby="profile-budget-help"></div>`
        + `<div class="field"><label for="profile-max-budget">До, ₽</label><input id="profile-max-budget" type="text" inputmode="decimal" maxlength="100" value="${esc(profile.maxBudget)}" placeholder="Без максимума" aria-describedby="profile-budget-help"></div></div>`
        + `<p class="profile-note" id="profile-budget-help">Сравнивается опубликованная стоимость экспертизы или закупки. Сумма иска не считается бюджетом работ. Когда стоимость неизвестна, запись требует уточнения. Пустое поле не ограничивает сумму.</p></section></div>`
        + `<p class="profile-note" id="profile-save-state" role="status" aria-live="polite">Настройки применятся после сохранения.</p>`
        + `<div class="profile-actions"><button class="button ghost" type="button" data-action="backup">${icon('down')}Копия правок</button><button class="button ghost" type="button" data-action="profile-reset">Очистить профиль</button><button class="button secondary" type="button" data-action="profile-close">Отмена</button><button class="button primary" type="submit">${icon('save')}Сохранить профиль</button></div></form>`;
    }

    function openProfile() {
      const dialog = $('#profile-dialog'), content = $('#profile-content');
      if (!dialog || !content) { A.notify('Редактор профиля недоступен. Перезагрузите страницу.'); return false; }
      if (dialog.open) { $('#profile-title')?.focus(); return true; }
      returnFocus = document.activeElement;
      content.innerHTML = profileMarkup(savedProfile());
      // Reading the rendered controls makes array order irrelevant to dirty state.
      profileBaseline = clone(profileValues());
      dialog.showModal(); $('#profile-title')?.focus();
      return true;
    }

    function closeProfile() {
      if (profileDirty() && !ask('Закрыть профиль без сохранения изменений? Можно отменить закрытие и скачать «Копию правок».')) return false;
      $('#profile-dialog')?.close();
      return true;
    }

    function saveProfile() {
      if (!$('#profile-dialog')?.open || !validProfileForm()) return false;
      const values = profileValues(), next = clone(workspace());
      next.profile = values;
      if (!A.persist(next)) {
        feedback($('#toast')?.textContent || 'Профиль не сохранён. Правки остаются в форме; скачайте «Копию правок».');
        return false;
      }
      profileBaseline = clone(values);
      if (!O.evaluateFit({}, values).configured) A.state.fit = 'all';
      A.saveUI?.();
      A.render(); $('#profile-dialog').close();
      A.notify('Профиль сохранён. Отметки соответствия обновлены; статусы источников не изменялись.');
      return true;
    }

    function resetProfile() {
      if (!ask('Очистить сохранённый профиль отбора и текущие правки? Фильтр соответствия профилю будет отключён.')) return false;
      const next = clone(workspace()); next.profile = W.emptyProfile();
      if (!A.persist(next)) {
        feedback($('#toast')?.textContent || 'Профиль не очищен. Текущие настройки и правки сохранены.');
        return false;
      }
      A.state.fit = 'all'; profileBaseline = null;
      A.saveUI?.();
      A.render(); $('#profile-dialog')?.close();
      A.notify('Профиль очищен. Отбор по соответствию отключён.');
      return true;
    }

    function applySnapshot(snapshot) {
      if ($('#profile-dialog')?.open) snapshot.profile = clone(profileValues());
      return snapshot;
    }

    function fitBadge(record) {
      const result = O.evaluateFit(record, savedProfile());
      if (!result.configured) return '';
      return `<span class="fit-badge ${result.verdict}" title="Соответствие локальным параметрам; статус источника показан отдельно">${icon(result.verdict === 'match' ? 'check' : result.verdict === 'review' ? 'info' : 'filter')}${esc(FIT_LABELS[result.verdict])}</span>`;
    }

    function fitReasons(record) {
      const result = O.evaluateFit(record, savedProfile());
      if (!result.configured) return '<p class="profile-note">Профиль отбора не задан. В реестре доступны все записи.</p>';
      return `<ul class="fit-reasons" aria-label="Основания сопоставления с моим профилем">${result.reasons.map(reason => `<li data-fit-reason="${esc(reason.code)}" class="${esc(reason.kind)}">${esc(reason.text)}</li>`).join('')}</ul>`;
    }

    function compareButton(record) {
      const selected = selectedIds().includes(record.id);
      const label = (selected ? 'Убрать из сравнения: ' : 'Добавить к сравнению: ') + title(record);
      return `<button type="button" class="button ghost small compare-button" data-action="toggle-compare" data-id="${esc(record.id)}" aria-pressed="${selected}" aria-label="${esc(label)}" title="${esc(label)}">${icon(selected ? 'check' : 'table')}${selected ? 'В сравнении' : 'Сравнить'}</button>`;
    }

    function comparisonBar() {
      const ids = selectedIds();
      if (!ids.length) return '';
      return `<section class="compare-toolbar" aria-label="Выбранные записи для сравнения"><div class="compare-selection"><span>Выбрано: ${ids.length} / 4</span>${ids.map(id => {
        const record = A.getRecord(id), label = record ? title(record) : 'Вне реестра · ' + id;
        return `<span class="compare-chip"><span title="${esc(label)}">${esc(label)}</span><button type="button" data-action="remove-compare" data-id="${esc(id)}" aria-label="${esc('Убрать из сравнения: ' + label)}">${icon('close')}</button></span>`;
      }).join('')}</div><div class="button-row"><button class="button secondary small" type="button" data-action="clear-compare">Очистить</button><button class="button primary small" type="button" data-view="compare">Сравнить ${ids.length}${icon('arrow')}</button></div></section>`;
    }

    function refreshCompareButtons() {
      const ids = selectedIds();
      for (const button of all('[data-action="toggle-compare"]')) {
        const selected = ids.includes(button.dataset.id), record = A.getRecord(button.dataset.id);
        const label = (selected ? 'Убрать из сравнения: ' : 'Добавить к сравнению: ') + (record ? title(record) : button.dataset.id);
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute('aria-label', label); button.setAttribute('title', label);
        button.innerHTML = icon(selected ? 'check' : 'table') + (selected ? 'В сравнении' : 'Сравнить');
      }
    }

    function updateComparison(ids, action, message) {
      const next = clone(workspace()); next.compareIds = ids;
      if (!A.persist(next)) return false;
      A.render(); refreshCompareButtons();
      // Rendering main never replaces an open detail editor. Update only its
      // comparison button so typed notes, prices and tasks stay in the DOM.
      if (action?.isConnected) action.focus({preventScroll: true});
      else {
        const replacement = all('[data-action="toggle-compare"]').find(node => node.dataset.id === action?.dataset.id)
          || $('[data-view="compare"]') || $('[data-action="profile-open"]') || $('#main');
        replacement?.focus({preventScroll: true});
      }
      A.notify(message); return true;
    }

    function toggleComparison(id, action) {
      const ids = selectedIds();
      if (ids.includes(id)) return updateComparison(ids.filter(value => value !== id), action, 'Запись убрана из сравнения.');
      if (!A.getRecord(id)) { A.notify('Эта запись отсутствует в текущем реестре.'); return false; }
      if (ids.length >= 4) { A.notify('Можно сравнить до четырёх записей. Сначала уберите одну из выбранных.'); return false; }
      return updateComparison([...ids, id], action, 'Запись добавлена к сравнению: ' + (ids.length + 1) + ' из 4.');
    }

    function dateLabel(value) {
      if (!value) return 'Дата не задана';
      if (typeof A.formatDate === 'function') return A.formatDate(value);
      return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4) : 'Дата не уточнена';
    }

    function verification(record) {
      const raw = text(record.verification);
      let description = typeof A.verificationText === 'function' ? A.verificationText(raw) : '';
      if (!description || /^[a-z0-9_]+$/i.test(description)) description = 'Подробности проверки — в карточке записи и по ссылке на источник.';
      return `<p>${esc(description)}</p>${record.checkedAt ? `<p class="field-hint">Проверено: ${esc(dateLabel(record.checkedAt))}</p>` : '<p class="field-hint">Дата проверки не указана</p>'}`;
    }

    function privatePrice(id) {
      const price = workspace().notes?.[id]?.proposalRub;
      return typeof price === 'number' && Number.isFinite(price) && price > 0
        ? `<div class="amount">${esc(A.money(price))}</div><p class="amount-label">Моя сохранённая цена</p>` : '<span class="muted">Не указана</span>';
    }

    function taskCell(id) {
      const task = workspace().tasks?.[id];
      if (!task || (!task.text && !task.dueDate)) return '<span class="muted">Не задана</span>';
      return `${task.completedAt ? '<span class="tag healthy">Выполнено</span>' : '<span class="tag blue">Следующий шаг</span>'}`
        + `<p>${multiline(task.text || 'Проверить запись')}</p><p class="field-hint">${esc(dateLabel(task.dueDate))}</p>`;
    }

    function comparisonView() {
      const ids = selectedIds();
      const heading = `<div class="page-heading"><div><p class="eyebrow">Выбор следующей работы</p><h1>Сравнение записей</h1><p class="page-description">До четырёх записей рядом: источник, место, стоимость и ваши следующие действия.</p></div><div class="heading-actions"><button class="button secondary" type="button" data-action="profile-open">${icon('filter')}Мой профиль</button><button class="button primary" type="button" data-view="opportunities">${icon('plus')}Выбрать записи</button></div></div>`;
      if (!ids.length) return heading + `<section class="panel empty-state compare-empty"><div class="empty-icon">${icon('table')}</div><h2>Выберите записи для сравнения</h2><p>Нажмите «Сравнить» в реестре или карточке записи. Здесь появятся публичные сведения и сохранённые вами действия.</p><button class="button primary" type="button" data-view="opportunities">Открыть реестр${icon('arrow')}</button></section>`;
      const columns = ids.map(id => { const record = A.getRecord(id); return {id, record, facts: record ? O.comparisonFacts(record, savedProfile()) : null}; });
      const unavailable = '<span class="compare-unavailable">Нет данных в текущем реестре</span>';
      const publicCell = (column, render) => column.record ? render(column.record, column.facts) : unavailable;
      const rows = [
        ['Статус источника', column => publicCell(column, record => A.statusTag(record))],
        ['Суд / заказчик', column => publicCell(column, record => esc(A.courtName(record)))],
        ['Место объекта', column => publicCell(column, (record, facts) => `<p>${esc(facts.regionLabel)}</p>${text(record.objectRegion || record.region) ? `<p class="field-hint">${esc(record.objectRegion || record.region)}</p>` : ''}`)],
        ['Профиль работ', column => publicCell(column, (_record, facts) => `<p>${esc(facts.categoryLabel)}</p><p class="field-hint">${esc(facts.categoryBasis)}</p>`)],
        ['Стоимость работ по источнику', column => publicCell(column, (_record, facts) => facts.budgetRub !== null
          ? `<div class="amount">${esc(A.money(facts.budgetRub))}</div><p class="amount-label">${esc(facts.budgetLabel)}</p>`
          : `<p>${esc(facts.budgetLabel)}</p>`)],
        ['Срок по источнику', column => publicCell(column, record => esc(A.deadlineLabel(record)))],
        ['Условия участия · из записи', column => publicCell(column, record => text(record.eligibilityNote)
          ? `<blockquote><p>${multiline(record.eligibilityNote)}</p></blockquote><p class="field-hint">Формулировка записи. Действующие требования проверяют по документам.</p>`
          : '<p>Требования не приведены в записи. Откройте документы источника.</p>')],
        ['Проверка источника', column => publicCell(column, verification)],
        ['Публикация и документы', column => publicCell(column, record => `<div class="button-row">${A.external(record.sourceUrl, 'Публикация', 'button secondary small')}${record.documentUrl && record.documentUrl !== record.sourceUrl ? A.external(record.documentUrl, 'Документ', 'button secondary small') : ''}</div>`)],
        ['Моя цена · локально', column => privatePrice(column.id)],
        ['Мой чек-лист · локально', column => `${CHECK_KEYS.filter(key => workspace().checks?.[column.id]?.[key] === true).length} из ${CHECK_KEYS.length} отмечено`],
        ['Моя задача · локально', column => taskCell(column.id)],
        ['По моему профилю', column => publicCell(column, record => fitBadge(record) + fitReasons(record))]
      ];
      return heading + `<p class="profile-note">Публичные статусы показаны отдельно от соответствия вашему профилю. Собственная цена, чек-лист и задачи — ваши локальные данные. Сравнение не отправляет их и не формирует заявку.</p>`
        + comparisonBar() + `<p class="profile-note" id="compare-scroll-help">На узком экране таблицу можно прокручивать по горизонтали.</p>`
        + `<div class="compare-table-wrap" role="region" aria-label="Таблица сравнения выбранных записей" aria-describedby="compare-scroll-help" tabindex="0"><table class="compare-table"><caption class="sr-only">Публичные сведения и локальные рабочие данные по выбранным записям</caption><thead><tr><th scope="col">Что сравниваем</th>${columns.map(({id, record}) => `<th scope="col">${record
          ? `<span class="case-number">${esc(record.caseNumber || 'Без номера')}</span><button class="lead-open compare-record-title" type="button" data-action="open-detail" data-id="${esc(id)}">${esc(record.title || 'Открыть запись')}</button>`
          : `<p class="compare-record-title compare-unavailable">Запись вне текущего реестра</p><p class="field-hint">ID: ${esc(id)}. Личные данные сохранены.</p>`}<button class="button ghost small" type="button" data-action="remove-compare" data-id="${esc(id)}" aria-label="${esc('Убрать из сравнения: ' + (record ? title(record) : id))}">${icon('close')}Убрать</button></th>`).join('')}</tr></thead><tbody>${rows.map(([label, render]) => `<tr><th scope="row">${esc(label)}</th>${columns.map(column => `<td>${render(column)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    function handleAction(action) {
      const name = action?.dataset?.action, id = action?.dataset?.id;
      switch (name) {
        case 'profile-open': openProfile(); return true;
        case 'profile-close': closeProfile(); return true;
        case 'profile-save': saveProfile(); return true;
        case 'profile-reset': resetProfile(); return true;
        case 'toggle-compare': toggleComparison(id, action); return true;
        case 'remove-compare': if (selectedIds().includes(id)) updateComparison(selectedIds().filter(value => value !== id), action, 'Запись убрана из сравнения.'); return true;
        case 'clear-compare': if (selectedIds().length) updateComparison([], action, 'Список сравнения очищен.'); return true;
        case 'backup': return !!$('#profile-dialog')?.open && !validProfileForm();
        default: return false;
      }
    }

    function handleSubmit(event) {
      if (event?.target?.id !== 'profile-form') return false;
      event.preventDefault(); saveProfile(); return true;
    }

    function handleInput(event) {
      if (!event?.target?.closest?.('#profile-form')) return false;
      feedback(profileDirty() ? 'Есть несохранённые изменения.' : 'Изменений нет.');
      return true;
    }

    const dialog = $('#profile-dialog');
    if (dialog) {
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeProfile(); });
      dialog.addEventListener('close', () => {
        profileBaseline = null;
        const target = returnFocus?.isConnected ? returnFocus : $('[data-action="profile-open"]') || $('#main');
        returnFocus = null; target?.focus({preventScroll: true});
      });
    }

    return Object.freeze({fitBadge, fitReasons, compareButton, comparisonBar, comparisonView,
      openProfile, profileDirty, applySnapshot, handleAction, handleSubmit, handleInput});
  }

  return Object.freeze({create});
});
