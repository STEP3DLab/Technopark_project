'use strict';

// Pure workbench operations. A plan never mutates the workspace or public records.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./workspace-utils.js'));
  else root.ExpertWorkbenchUtils = factory(root.ExpertWorkspaceUtils);
})(typeof window === 'undefined' ? globalThis : window, function (W) {
  const STAGES = Object.freeze({new:'Не начата',review:'Проверяю',draft:'Готовлю КП',ready:'Готово к подаче',sent:'Подано вручную',won:'Работа получена',lost:'Не подходит',hold:'Отложено'});
  const FINISHED = new Set(['won','lost']);
  const FORBIDDEN = new Set(['__proto__','constructor','prototype']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !FORBIDDEN.has(value);
  const normalizedText = value => String(value ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
  }
  function moscowDate(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Moscow'}).format(date);
  }
  function shiftedDate(offset, value = new Date()) {
    if (![0,1,7].includes(offset)) return null;
    const today = moscowDate(value);
    if (!today) return null;
    const shifted = new Date(Date.parse(today + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0,10);
    return validDate(shifted) ? shifted : null;
  }
  function cleanPreferences(raw) {
    return {
      layout:raw?.layout === 'list' ? 'list' : 'board',
      scope:['all','active','finished'].includes(raw?.scope) ? raw.scope : 'all',
      hideEmpty:raw?.hideEmpty === true
    };
  }
  function trackedIds(workspace) {
    const ids = new Set(workspace?.favorites || []);
    for (const key of ['work','notes','tasks','checks','estimates'])
      for (const id of Object.keys(workspace?.[key] || {})) ids.add(id);
    for (const draft of workspace?.drafts || []) if (validId(draft.recordId)) ids.add(draft.recordId);
    return [...ids].filter(validId);
  }
  function ownCents(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1e12) return null;
    // Workspace legacy numbers may have more than two decimals. Display them
    // as money, rounding the decimal representation once, then sum integer cents.
    const decimal = /e/i.test(String(value)) ? value.toFixed(12) : String(value);
    const [whole,fraction=''] = decimal.split('.');
    const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0,2));
    return cents + (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
  }
  function formatCents(value) {
    const cents = typeof value === 'bigint' ? value : BigInt(value || '0');
    const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0');
    const fraction = (cents % 100n).toString().padStart(2,'0');
    return whole + (fraction === '00' ? '' : ',' + fraction) + '\u00a0₽';
  }
  function workItems(records, workspace, options = {}) {
    const byId = new Map((Array.isArray(records) ? records : []).filter(r => validId(r?.id)).map(r => [r.id,r]));
    const terms = normalizedText(options.search).split(/\s+/).filter(Boolean);
    const scope = cleanPreferences({scope:options.scope}).scope;
    return trackedIds(workspace).map(id => {
      const record = byId.get(id) || null;
      const stage = Object.hasOwn(STAGES,workspace.work?.[id]) ? workspace.work[id] : 'new';
      const draft = (workspace.drafts || []).filter(item => item.recordId === id)
        .sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
      const estimate = workspace.estimates?.[id];
      return {
        id,record,orphan:!record,stage,
        title:record?.title || estimate?.recordTitle || draft?.subject || 'Запись вне текущего реестра',
        number:record?.caseNumber || estimate?.caseNumber || draft?.caseNumber || '',
        note:workspace.notes?.[id] || {},task:workspace.tasks?.[id] || null,
        checks:workspace.checks?.[id] || {},favorite:(workspace.favorites || []).includes(id)
      };
    }).filter(item => {
      if (scope === 'active' && FINISHED.has(item.stage) || scope === 'finished' && !FINISHED.has(item.stage)) return false;
      const text = [item.id,item.title,item.number,item.record?.court,item.record?.summary,item.note.text,item.task?.text].filter(Boolean).join(' ');
      return typeof options.matchesSearch === 'function'
        ? options.matchesSearch(text,options.search || '')
        : terms.every(term => normalizedText(text).includes(term));
    }).sort((a,b) => {
      const ad = !a.task?.completedAt && a.task?.dueDate || '9999-12-31';
      const bd = !b.task?.completedAt && b.task?.dueDate || '9999-12-31';
      return ad.localeCompare(bd) || a.title.localeCompare(b.title,'ru') || a.id.localeCompare(b.id);
    });
  }
  function summarize(items, now = new Date()) {
    const counts = Object.fromEntries(Object.keys(STAGES).map(stage => [stage,0]));
    const today = moscowDate(now);
    let ownTotal = 0n, priced = 0, overdue = 0, finished = 0, orphans = 0;
    for (const item of items) {
      counts[item.stage] += 1;
      const cents = ownCents(item.note?.proposalRub);
      if (cents !== null && cents > 0n) {ownTotal += cents; priced += 1;}
      if (!item.task?.completedAt && validDate(item.task?.dueDate) && today && item.task.dueDate < today) overdue += 1;
      if (FINISHED.has(item.stage)) finished += 1;
      if (item.orphan) orphans += 1;
    }
    return {count:items.length,counts,priced,unpriced:items.length-priced,ownTotalCents:ownTotal.toString(),overdue,finished,unfinished:items.length-finished,orphans};
  }
  function planOperation(workspace, ids, operation, options = {}) {
    const before = W.normalizeWorkspace(workspace);
    if (!before || !Array.isArray(ids) || ids.length > 10000) return {ok:false,error:'Некорректная рабочая область или список записей.'};
    if (!operation || !['favorite-add','favorite-remove','stage','date'].includes(operation.type)) return {ok:false,error:'Неизвестное массовое действие.'};
    if (operation.type === 'stage' && !Object.hasOwn(STAGES,operation.stage)) return {ok:false,error:'Выберите рабочий этап.'};
    if (operation.type === 'date' && operation.date !== '' && !validDate(operation.date)) return {ok:false,error:'Укажите корректную дату следующего действия.'};
    const now = new Date(options.now ?? Date.now());
    if (!Number.isFinite(now.getTime())) return {ok:false,error:'Некорректное время изменения.'};
    const allowed = options.allowedIds ? new Set(options.allowedIds.filter(validId)) : null;
    const unique = [...new Set(ids)], eligible = [], skipped = [];
    const next = clone(before), changed = [];
    const favorites = new Set(next.favorites);
    for (const id of unique) {
      if (!validId(id) || allowed && !allowed.has(id)) {skipped.push({id,reason:'Запись недоступна для этого действия'}); continue;}
      if (operation.type === 'date' && (!next.tasks[id] || next.tasks[id].completedAt)) {
        skipped.push({id,reason:next.tasks[id]?.completedAt ? 'Задача уже выполнена' : 'Нет существующей задачи'}); continue;
      }
      eligible.push(id);
      if (operation.type === 'favorite-add' && !favorites.has(id)) {favorites.add(id);changed.push(id);}
      if (operation.type === 'favorite-remove' && favorites.has(id)) {favorites.delete(id);changed.push(id);}
      if (operation.type === 'stage' && next.work[id] !== operation.stage) {
        // Explicit new keeps a tracked card on the board when its stage resets.
        next.work[id] = operation.stage; changed.push(id);
      }
      if (operation.type === 'date' && next.tasks[id].dueDate !== operation.date) {
        next.tasks[id] = {...next.tasks[id],dueDate:operation.date,updatedAt:now.toISOString()};
        if (!next.tasks[id].text && !next.tasks[id].dueDate) delete next.tasks[id];
        changed.push(id);
      }
    }
    next.favorites = [...favorites];
    const checked = W.normalizeWorkspace(next);
    if (!checked) return {ok:false,error:'Изменение превышает пределы рабочей области. Данные не изменены.'};
    return {ok:true,before,next:checked,eligible,changed,skipped,operation:clone(operation)};
  }
  function undoToken(plan) {
    return plan?.ok && plan.changed.length ? {before:clone(plan.before),after:clone(plan.next)} : null;
  }
  function canUndo(workspace, token) {
    const current = W.normalizeWorkspace(workspace);
    return !!current && !!token && W.validBackup(token.before) && W.validBackup(token.after)
      && JSON.stringify(current) === JSON.stringify(token.after);
  }
  return Object.freeze({STAGES,validId,validDate,moscowDate,shiftedDate,cleanPreferences,trackedIds,ownCents,formatCents,workItems,summarize,planOperation,undoToken,canUndo});
});
