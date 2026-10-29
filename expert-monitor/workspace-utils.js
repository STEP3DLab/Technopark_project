'use strict';

// Pure workspace model. Public registry data and browser storage are not accessed.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpertWorkspaceUtils = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const WORK_STATUS = Object.freeze({
    new: 'Не начата', review: 'Проверяю', draft: 'Готовлю предложение',
    ready: 'Готово к подаче', sent: 'Предложение подано', won: 'Работа получена',
    lost: 'Не подходит / отказ', hold: 'Отложено'
  });
  const DRAFT_LIMITS = Object.freeze({
    id: 200, recordId: 200, court: 1000, caseNumber: 300, subject: 5000,
    organization: 1000, requisites: 10000, contact: 2000, expert: 1000,
    qualification: 20000, conditions: 20000, attachments: 20000,
    createdAt: 100, updatedAt: 100, price: 100, days: 100,
    documentKind: 16, documentMode: 16, documentDate: 10, documentNumber: 100,
    signatory: 1000, signatoryRole: 1000, taxNote: 2000, validUntil: 10
  });
  const DRAFT_EDITABLE_FIELDS = Object.freeze(Object.keys(DRAFT_LIMITS)
    .filter(key => !['id', 'createdAt', 'updatedAt'].includes(key)));
  const COMPANY_FIELDS = new Set(['organization', 'requisites', 'contact', 'expert', 'qualification',
    'signatory', 'signatoryRole', 'taxNote']);
  const CHECK_FIELDS = new Set(['stage', 'scope', 'eligibility', 'materials', 'deadline', 'channel']);
  const FILTER_FIELDS = new Set([
    'search', 'status', 'region', 'court', 'sourceType', 'workStatus', 'due',
    'sort', 'favorite', 'category', 'minAmount', 'maxAmount'
  ]);
  const WORKSPACE_FIELDS = new Set([
    'version', 'notes', 'work', 'drafts', 'company', 'favorites', 'tasks',
    'checks', 'savedFilters', 'exportedAt'
  ]);

  function emptyWorkspace() {
    return {version: 1, notes: {}, work: {}, drafts: [], company: {},
      favorites: [], tasks: {}, checks: {}, savedFilters: []};
  }

  function safeObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && Object.getOwnPropertySymbols(value).length === 0
      && Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, descriptor]) =>
        !FORBIDDEN_KEYS.has(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  }

  function denseArray(value, max) {
    if (!Array.isArray(value) || value.length > max
      || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length > 0) return false;
    const keys = Object.getOwnPropertyNames(value);
    return keys.length === value.length + 1
      && keys.every(key => key === 'length' || /^(0|[1-9]\d*)$/.test(key)
        && Number(key) < value.length
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }

  function validString(value, max) {
    return typeof value === 'string' && value.length <= max;
  }

  function validId(value) {
    return validString(value, 200) && value.length > 0;
  }

  function allowedFields(value, fields) {
    return safeObject(value) && Object.keys(value).every(key => fields.has(key));
  }

  function validMoney(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
  }

  function validDraft(draft) {
    return safeObject(draft) && validId(draft.id)
      && Object.entries(draft).every(([key, value]) => {
        if (!Object.hasOwn(DRAFT_LIMITS, key)) return false;
        if (key === 'price' || key === 'days') return validString(value, 100) || validMoney(value);
        if (key === 'documentKind') return ['court', 'procurement', 'general'].includes(value);
        if (key === 'documentMode') return ['draft', 'letter'].includes(value);
        if (key === 'documentDate' || key === 'validUntil') return value === '' || validDateKey(value);
        return validString(value, DRAFT_LIMITS[key]);
      });
  }

  function validDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validTimestamp(value) {
    if (!validString(value, 100)) return false;
    const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    return !!parts && validDateKey(parts[1]) && Number(parts[2]) <= 23
      && Number(parts[3]) <= 59 && Number(parts[4]) <= 59
      && Number.isFinite(Date.parse(value));
  }

  function validMap(value, validateEntry, allowEmptyKey = false) {
    return safeObject(value) && Object.keys(value).length <= 10000
      && Object.entries(value).every(([key, entry]) =>
        (allowEmptyKey ? key.length <= 200 : validId(key)) && validateEntry(entry));
  }

  function validNote(note) {
    return safeObject(note) && Object.entries(note).every(([field, value]) => {
      if (field === 'text') return validString(value, 20000);
      if (field === 'updatedAt') return validString(value, 100);
      if (field === 'proposalRub') return value === null || validMoney(value);
      return false;
    });
  }

  function validTask(task) {
    return allowedFields(task, new Set(['text', 'dueDate', 'updatedAt', 'completedAt']))
      && validString(task.text, 2000)
      && (task.dueDate === '' || validDateKey(task.dueDate))
      && validTimestamp(task.updatedAt)
      && (task.completedAt === undefined || validTimestamp(task.completedAt));
  }

  function validChecks(checks) {
    return allowedFields(checks, CHECK_FIELDS)
      && Object.values(checks).every(value => typeof value === 'boolean');
  }

  function validSavedFilter(filter) {
    return allowedFields(filter, new Set(['id', 'name', 'filters']))
      && validId(filter.id) && validString(filter.name, 80)
      && allowedFields(filter.filters, FILTER_FIELDS)
      && Object.values(filter.filters).every(value => validString(value, 1000));
  }

  function uniqueIds(items) {
    return new Set(items.map(item => item.id)).size === items.length;
  }

  function validateWorkspace(raw) {
    if (!allowedFields(raw, WORKSPACE_FIELDS) || raw.version !== 1) return false;
    // Legacy v1 permits sparse note/draft/company objects; retain that behavior.
    if (!validMap(raw.notes, validNote, true)
      || !validMap(raw.work, value => typeof value === 'string' && Object.hasOwn(WORK_STATUS, value), true)
      || !denseArray(raw.drafts, 5000)
      || !raw.drafts.every(validDraft) || !uniqueIds(raw.drafts)) return false;
    if (raw.company !== undefined && (!allowedFields(raw.company, COMPANY_FIELDS)
      || !Object.entries(raw.company).every(([key, value]) =>
        validString(value, ['signatory', 'signatoryRole', 'taxNote'].includes(key) ? DRAFT_LIMITS[key] : 20000)))) return false;
    if (raw.favorites !== undefined && (!denseArray(raw.favorites, 10000)
      || !raw.favorites.every(validId)
      || new Set(raw.favorites).size !== raw.favorites.length)) return false;
    if (raw.tasks !== undefined && !validMap(raw.tasks, validTask)) return false;
    if (raw.checks !== undefined && !validMap(raw.checks, validChecks)) return false;
    if (raw.savedFilters !== undefined && (!denseArray(raw.savedFilters, 30)
      || !raw.savedFilters.every(validSavedFilter)
      || !uniqueIds(raw.savedFilters))) return false;
    return raw.exportedAt === undefined || validString(raw.exportedAt, 100);
  }

  function normalizeWorkspace(raw) {
    if (!validateWorkspace(raw)) return null;
    const result = emptyWorkspace();
    for (const key of WORKSPACE_FIELDS) {
      if (raw[key] !== undefined) result[key] = raw[key];
    }
    // All accepted values are JSON data. Return a detached snapshot, never input aliases.
    return JSON.parse(JSON.stringify(result));
  }

  function validBackup(raw) {
    return validateWorkspace(raw);
  }

  function mergeById(current, incoming) {
    const known = new Set(current.map(item => item.id));
    return current.concat(incoming.filter(item => !known.has(item.id)));
  }

  function mergeWorkspaces(current, incoming) {
    const left = normalizeWorkspace(current);
    const right = normalizeWorkspace(incoming);
    if (!left || !right) return null;
    const merged = emptyWorkspace();
    for (const field of ['notes', 'work', 'company', 'tasks', 'checks']) {
      merged[field] = {...right[field], ...left[field]};
    }
    merged.drafts = mergeById(left.drafts, right.drafts);
    merged.savedFilters = mergeById(left.savedFilters, right.savedFilters);
    merged.favorites = [...new Set([...left.favorites, ...right.favorites])];
    if (left.exportedAt !== undefined) merged.exportedAt = left.exportedAt;
    else if (right.exportedAt !== undefined) merged.exportedAt = right.exportedAt;
    // Reject an oversized union instead of silently dropping either user's entries.
    return normalizeWorkspace(merged);
  }

  function draftComparable(draft) {
    // Browser form fields are strings; legacy numeric price/days compare identically.
    return Object.fromEntries(DRAFT_EDITABLE_FIELDS.map(key => [key, String(draft?.[key] ?? '')]));
  }

  function isDraftDirty(draft, baseline) {
    return JSON.stringify(draftComparable(draft)) !== JSON.stringify(draftComparable(baseline));
  }

  return Object.freeze({
    WORK_STATUS, DRAFT_EDITABLE_FIELDS, emptyWorkspace, normalizeWorkspace,
    validBackup, validDraft, mergeWorkspaces, draftComparable, isDraftDirty
  });
});
