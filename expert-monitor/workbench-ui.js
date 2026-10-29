'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./workbench-utils.js'));
  else root.ExpertWorkbenchUI = factory(root.ExpertWorkbenchUtils);
})(typeof window === 'undefined' ? globalThis : window, function (B) {
  function create(A) {
    const doc = A.document || document;
    const ask = A.confirm || (message => window.confirm(message));
    const {esc,icon} = A;
    const $ = selector => doc.querySelector(selector);
    const selected = new Set();
    let visibleIds = [], undo = null, bulkStage = 'review', bulkDate = '';
    const records = () => A.records() || [];
    const prefs = () => B.cleanPreferences(A.state.workbench);
    const labelFor = id => {
      const record = A.getRecord(id);
      return record ? (record.caseNumber ? '№ ' + record.caseNumber + ' · ' : '') + (record.title || id) : id;
    };
    const formatMoney = value => A.money ? A.money(value) : B.formatCents(B.ownCents(value) || 0n);
    const option = (value,label,chosen) => A.option(value,label,chosen);
    function focusMatch(selector, predicate) {
      const found = [...doc.querySelectorAll(selector)].find(predicate);
      found?.focus({preventScroll:true});
      return !!found;
    }
    function rerender(action = '') {
      A.render();
      if (action) focusMatch('[data-action]',node => node.dataset.action === action);
    }
    function savePreferences(patch, focusAction) {
      A.state.workbench = B.cleanPreferences({...prefs(),...patch});
      A.saveUI(); rerender(focusAction);
    }
    function registrySelectionButton(record) {
      if (!B.validId(record?.id)) return '';
      return `<input type="checkbox" class="wb-select-record" data-wb-select="${esc(record.id)}" aria-label="Выбрать для массовых действий: ${esc(record.caseNumber || record.title || record.id)}" title="Выбрать для массовых действий"${selected.has(record.id)?' checked':''}>`;
    }
    function undoMarkup() {
      if (!undo) return '';
      const enabled = B.canUndo(A.workspace(),undo);
      return `<div class="wb-undo"><span>${enabled?'Последнее изменение рабочих данных можно отменить.':'После последнего действия появились другие изменения. Отмена больше не доступна.'}</span><button class="button secondary small" type="button" data-action="wb-undo"${enabled?'':' disabled'}>${icon('refresh')}Отменить изменение</button></div>`;
    }
    function selectionBar(filteredRecords = []) {
      visibleIds = [...new Set(filteredRecords.map(item => item.id).filter(B.validId))];
      const count = selected.size, selectedVisible = visibleIds.filter(id => selected.has(id)).length;
      const knownIds = new Set(records().map(item => item.id));
      const unavailable = [...selected].filter(id => !knownIds.has(id)).length;
      return `<section class="wb-selection ${count?'has-selection':''}" aria-label="Массовые действия с записями"><div class="wb-selection-summary"><div><b>Выбрано: ${count}</b><span>В текущем отборе: ${selectedVisible} из ${visibleIds.length}${unavailable?' · вне среза: '+unavailable:''}</span></div><div class="button-row"><button class="button secondary small" type="button" data-action="wb-select-all"${!visibleIds.length?' disabled':''}>Выбрать весь отбор</button><button class="button ghost small" type="button" data-action="wb-clear-selection"${!count?' disabled':''}>Снять выбор</button></div></div>${count?`<div class="wb-bulk-tools"><div class="wb-bulk-group"><span>Избранное</span><div class="button-row"><button class="button secondary small" type="button" data-action="wb-favorite-add">${icon('star')}Добавить</button><button class="button ghost small" type="button" data-action="wb-favorite-remove">Убрать</button></div></div><div class="wb-bulk-group"><label for="wb-bulk-stage">Личный рабочий этап</label><div class="wb-field-action"><select id="wb-bulk-stage" class="select-field">${Object.entries(B.STAGES).map(([key,label])=>option(key,label,bulkStage)).join('')}</select><button class="button secondary small" type="button" data-action="wb-apply-stage">Применить</button></div></div><div class="wb-bulk-group"><label for="wb-bulk-date">Дата существующих невыполненных задач</label><div class="wb-field-action"><input id="wb-bulk-date" type="date" class="select-field" value="${esc(bulkDate)}"><button class="button secondary small" type="button" data-action="wb-apply-date">Перенести</button></div></div><div class="wb-bulk-group"><span>CSV выбранных записей</span><div class="button-row"><button class="button secondary small" type="button" data-action="wb-export-public">Публичные данные</button><button class="button ghost small" type="button" data-action="wb-export-private">С моими заметками</button></div></div></div><p class="wb-selection-note">Выбор сохраняется при смене фильтров до перезагрузки вкладки. Массовые действия относятся ко всем выбранным записям; изменения этапа и даты требуют подтверждения. Статусы источников остаются прежними.</p>`:'<p class="wb-selection-note">Отмечайте записи флажком. Можно изменить свой рабочий этап, избранное или дату существующих задач сразу для нескольких записей.</p>'}${undoMarkup()}</section>`;
    }
    function stageSelect(item) {
      return `<label class="wb-stage-field"><span>Рабочий этап</span><select class="select-field" data-wb-stage="${esc(item.id)}" aria-label="Рабочий этап записи ${esc(item.number || item.id)}">${Object.entries(B.STAGES).map(([key,label])=>option(key,label,item.stage)).join('')}</select></label>`;
    }
    function taskMarkup(item) {
      const task = item.task;
      if (!task || !task.text && !task.dueDate) return '<p class="wb-card-muted">Следующее действие не назначено</p>';
      const overdue = !task.completedAt && task.dueDate && task.dueDate < B.moscowDate();
      return `<div class="wb-card-task ${task.completedAt?'is-complete':''}"><span class="tag ${overdue?'urgent':task.completedAt?'healthy':'blue'}">${task.completedAt?'Задача выполнена':overdue?'Задача просрочена':'Моя задача'}${task.dueDate?' · '+esc(A.shortDate ? A.shortDate(task.dueDate) : task.dueDate):' · без даты'}</span>${task.text?`<p>${esc(task.text)}</p>`:''}</div>`;
    }
    function cardMarkup(item) {
      const completeChecks = Object.values(item.checks).filter(value => value === true).length;
      return `<article class="wb-card" data-wb-card="${esc(item.id)}"><div class="wb-card-top"><span class="case-number">${esc(item.number?'№ '+item.number:item.orphan?'Локальная запись':'Запрос')}</span>${item.favorite?`<span class="wb-favorite" title="В избранном" aria-label="В избранном">${icon('star')}</span>`:''}</div>${item.record?`<button class="lead-open wb-card-title" type="button" data-action="open-detail" data-id="${esc(item.id)}">${esc(item.title)}</button>`:`<h3 class="wb-card-title">${esc(item.title)}</h3>`}${item.orphan?`<p class="wb-orphan"><b>Вне текущего среза</b><span>ID: ${esc(item.id)}</span><span>Личные данные сохранены. Текущий публичный статус неизвестен.</span></p>`:A.statusTag(item.record)}${item.record?`<p class="wb-card-muted">${icon('clock')}${esc(A.deadlineLabel(item.record))}</p>`:''}${taskMarkup(item)}<div class="wb-card-facts"><span>Чек-лист: ${completeChecks} / 6</span>${B.ownCents(item.note.proposalRub)>0n?`<strong>Моя цена: ${esc(formatMoney(item.note.proposalRub))}</strong>`:'<span>Моя цена не указана</span>'}</div>${item.note.text?`<details class="wb-note"><summary>Моя сохранённая заметка</summary><p>${esc(item.note.text)}</p></details>`:''}${stageSelect(item)}<button class="button secondary small" type="button" data-action="wb-edit-task" data-id="${esc(item.id)}">${icon('edit')}${item.task?'Изменить задачу':'Добавить задачу'}</button></article>`;
    }
    function workspacePanel() {
      const preferences = prefs();
      const items = B.workItems(records(),A.workspace(),{search:A.state.search,scope:preferences.scope,matchesSearch:A.matchesSearch});
      const summary = B.summarize(items);
      const stages = Object.entries(B.STAGES).filter(([key])=>!preferences.hideEmpty || summary.counts[key] > 0);
      return `<section class="wb-workspace" aria-label="Личные этапы и записи"><div class="wb-workspace-toolbar"><div class="view-switch" role="group" aria-label="Представление личной работы">${[['board','Доска · 8 этапов'],['list','Компактный список']].map(([key,label])=>`<button type="button" data-action="wb-layout" data-layout="${key}" class="${preferences.layout===key?'active':''}" aria-pressed="${preferences.layout===key}">${label}</button>`).join('')}</div><div class="wb-workspace-options"><label><span>Показывать</span><select id="wb-scope" class="select-field">${[['all','Все мои записи'],['active','Незавершённые'],['finished','Получено / не подходит']].map(([key,label])=>option(key,label,preferences.scope)).join('')}</select></label><label class="wb-checkbox"><input type="checkbox" id="wb-hide-empty"${preferences.hideEmpty?' checked':''}><span>Скрыть пустые этапы</span></label></div></div><div class="wb-metrics" aria-label="Показатели текущего личного отбора"><div><b>${summary.count}</b><span>записей в этом отборе${summary.orphans?' · вне среза: '+summary.orphans:''}</span></div><div><b>${summary.unfinished}</b><span>незавершённых · результат есть: ${summary.finished}</span></div><div class="${summary.overdue?'wb-metric-warning':''}"><b>${summary.overdue}</b><span>просроченных личных задач</span></div><div><b>${esc(B.formatCents(summary.ownTotalCents))}</b><span>мои цены ${summary.priced} записей · без цены: ${summary.unpriced}</span></div></div><p class="wb-price-note">Сумма включает только ваши цены в текущем личном отборе, включая записи вне среза. Это не выручка и не сумма бюджетов из источников. «Отложено» входит в незавершённые.</p>${undoMarkup()}${items.length?`<div class="wb-board ${preferences.layout==='list'?'wb-list':''}" tabindex="0" role="region" aria-label="${preferences.layout==='board'?'Доска восьми этапов, прокрутка по горизонтали':'Записи по рабочим этапам'}">${stages.map(([key,label])=>`<section class="wb-column" data-wb-column="${key}"><header><h3>${esc(label)}</h3><span>${summary.counts[key]}</span></header><div class="wb-column-body">${items.filter(item=>item.stage===key).map(cardMarkup).join('')||'<p class="wb-empty-column">Записей на этом этапе пока нет</p>'}</div></section>`).join('')}</div>`:`<div class="wb-empty"><h3>${A.state.search || preferences.scope!=='all'?'В этом личном отборе записей нет':'Добавьте запись в свою работу'}</h3><p>${A.state.search || preferences.scope!=='all'?'Измените поиск или выберите «Все мои записи».':'Отметьте запись в избранном, назначьте этап, сохраните задачу, заметку или расчёт. Они появятся здесь.'}</p><button class="button secondary" data-view="opportunities">Открыть реестр${icon('arrow')}</button></div>`}</section>`;
    }
    function dateShortcuts(target) {
      if (!['detail','task'].includes(target)) return '';
      return `<div class="wb-date-shortcuts" role="group" aria-label="Быстрая дата следующего действия, по Москве">${[['0','Сегодня'],['1','Завтра'],['7','Через неделю'],['clear','Без даты']].map(([offset,label])=>`<button class="link-button" type="button" data-action="wb-date-shortcut" data-target="${target}" data-offset="${offset}">${label}</button>`).join('')}</div>`;
    }
    function planFor(operation, ids = [...selected]) {
      return B.planOperation(A.workspace(),ids,operation,{allowedIds:records().map(item=>item.id).concat(B.trackedIds(A.workspace()))});
    }
    function preview(plan, description) {
      const changed = plan.changed.map(id=>labelFor(id));
      return description + '\n\nИзменятся записи: ' + changed.length + '.\n' + changed.slice(0,6).map(name=>'• '+name).join('\n')
        + (changed.length>6?'\n… и ещё '+(changed.length-6)+'.':'')
        + (plan.skipped.length?'\n\nПропущено: '+plan.skipped.length+' ('+[...new Set(plan.skipped.map(item=>item.reason))].join('; ')+').':'')
        + '\n\nПубличные статусы и опубликованные суммы не изменяются.';
    }
    function commitPlan(plan, message) {
      if (!plan.ok) {A.notify(plan.error);return false;}
      if (!plan.changed.length) {A.notify('Изменений нет.'+(plan.skipped.length?' Пропущено: '+plan.skipped.length+'; нет невыполненной задачи или доступной записи.':''));return false;}
      if (!A.persist(plan.next)) return false;
      undo = B.undoToken(plan);rerender();
      focusMatch('[data-action]',node=>node.dataset.action==='wb-undo');
      A.notify(message+' Изменено: '+plan.changed.length+'.'+(plan.skipped.length?' Пропущено: '+plan.skipped.length+'.':''));
      return true;
    }
    function bulk(operation, description, success) {
      if (!selected.size) {A.notify('Сначала выберите записи флажками.');return;}
      const plan = planFor(operation);
      if (!plan.ok) {A.notify(plan.error);return;}
      if (!plan.changed.length) {commitPlan(plan,success);return;}
      if (!ask(preview(plan,description))) return;
      commitPlan(plan,success);
    }
    function handleAction(action) {
      const key = action.dataset.action || '';
      if (!key.startsWith('wb-')) return false;
      if (key === 'wb-select-all') {for (const id of visibleIds) selected.add(id);rerender(key);A.notify('Выбрано записей: '+selected.size+'. Выбор включает весь текущий отбор.');}
      if (key === 'wb-clear-selection') {selected.clear();rerender('wb-select-all');A.notify('Выбор для массовых действий снят.');}
      if (key === 'wb-favorite-add') bulk({type:'favorite-add'},'Добавить выбранные записи в избранное?','Записи добавлены в избранное.');
      if (key === 'wb-favorite-remove') bulk({type:'favorite-remove'},'Убрать выбранные записи из избранного? Заметки, этапы и задачи сохранятся.','Записи убраны из избранного.');
      if (key === 'wb-apply-stage') {
        bulkStage = $('#wb-bulk-stage')?.value || bulkStage;
        bulk({type:'stage',stage:bulkStage},'Назначить выбранным записям личный этап «'+(B.STAGES[bulkStage]||'')+'»?','Рабочие этапы обновлены.');
      }
      if (key === 'wb-apply-date') {
        bulkDate = $('#wb-bulk-date')?.value ?? bulkDate;
        if (!B.validDate(bulkDate)) {A.notify('Укажите дату для существующих невыполненных задач.');$('#wb-bulk-date')?.focus();return true;}
        bulk({type:'date',date:bulkDate},'Назначить дату '+bulkDate+' по Москве существующим невыполненным задачам выбранных записей? Текст задач сохраняется; выполненные задачи и записи без задачи будут пропущены.','Даты задач изменены.');
      }
      if (key === 'wb-export-public' || key === 'wb-export-private') {
        const available = records().filter(record=>selected.has(record.id));
        if (!available.length) A.notify('Нет выбранных записей в текущем опубликованном срезе.');
        else {A.exportRecords(available,key === 'wb-export-private');if(available.length<selected.size)A.notify('Выгружено '+available.length+' записей. '+(selected.size-available.length)+' записей вне среза пропущено.');}
      }
      if (key === 'wb-undo') {
        if (!B.canUndo(A.workspace(),undo)) {A.notify('Отмена недоступна: рабочие данные уже изменились. Новые изменения сохранены.');return true;}
        if (A.persist(undo.before)) {undo=null;rerender();A.notify('Последнее изменение рабочих данных отменено.');}
      }
      if (key === 'wb-layout' && ['board','list'].includes(action.dataset.layout)) savePreferences({layout:action.dataset.layout},'wb-layout');
      if (key === 'wb-edit-task' && B.validId(action.dataset.id)) A.editTask(action.dataset.id);
      if (key === 'wb-date-shortcut' && ['detail','task'].includes(action.dataset.target)) {
        const value = action.dataset.offset === 'clear' ? '' : B.shiftedDate(Number(action.dataset.offset));
        if (value !== null) A.onDateShortcut(action.dataset.target,value);
      }
      return true;
    }
    function handleChange(event) {
      const target = event.target;
      if (Object.hasOwn(target.dataset,'wbSelect')) {
        const id = target.dataset.wbSelect;
        if (!B.validId(id) || !A.getRecord(id)) return true;
        if (target.checked) selected.add(id);else selected.delete(id);
        rerender();focusMatch('[data-wb-select]',node=>node.dataset.wbSelect===id);
        return true;
      }
      if (target.id === 'wb-bulk-stage') {bulkStage=target.value;return true;}
      if (target.id === 'wb-bulk-date') {bulkDate=target.value;return true;}
      if (target.id === 'wb-scope') {savePreferences({scope:target.value});$('#wb-scope')?.focus({preventScroll:true});return true;}
      if (target.id === 'wb-hide-empty') {savePreferences({hideEmpty:target.checked});$('#wb-hide-empty')?.focus({preventScroll:true});return true;}
      if (Object.hasOwn(target.dataset,'wbStage')) {
        const id = target.dataset.wbStage, previous = A.workspace().work[id] || 'new';
        const plan = planFor({type:'stage',stage:target.value},[id]);
        if (commitPlan(plan,'Рабочий этап обновлён.')) {
          if (!focusMatch('[data-wb-stage]',node=>node.dataset.wbStage===id)) $('#wb-scope')?.focus({preventScroll:true});
        }
        else target.value=previous;
        return true;
      }
      return false;
    }
    return Object.freeze({registrySelectionButton,selectionBar,workspacePanel,dateShortcuts,handleAction,handleChange,selectedIds:()=>[...selected]});
  }
  return Object.freeze({create});
});
