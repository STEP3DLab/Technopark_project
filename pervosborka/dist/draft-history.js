/* Temporary undo/redo for task drafts. Checked attempts are owned by the host.
 * No browser storage, clocks, events, scores or cross-session state. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DraftHistory = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function (result, key) {
      result[key] = canonical(value[key]); return result;
    }, {});
    return value;
  }
  function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function create(options) {
    var limit = Number.isInteger(options && options.limit) ? Math.max(1, Math.min(50, options.limit)) : 30;
    var records = new Map();
    function bucket(key) {
      if (!records.has(key)) records.set(key, {past: [], future: []});
      return records.get(key);
    }
    function status(key) {
      var entry = records.get(key);
      return {
        undo: entry ? entry.past.length : 0,
        redo: entry ? entry.future.length : 0,
        undoLabel: entry && entry.past.length ? entry.past[entry.past.length - 1].label : '',
        redoLabel: entry && entry.future.length ? entry.future[entry.future.length - 1].label : '',
        limit: limit
      };
    }
    function record(key, before, after, label) {
      if (typeof key !== 'string' || !key || !before || !after || equal(before, after)) return false;
      var entry = bucket(key), previous = entry.past[entry.past.length - 1];
      // A different source draft means that this timeline is no longer valid.
      if (previous && !equal(previous.after, before)) entry.past = [];
      entry.future = [];
      entry.past.push({before: copy(before), after: copy(after), label: String(label || 'Изменение варианта')});
      if (entry.past.length > limit) entry.past.shift();
      return true;
    }
    function travel(key, current, direction) {
      var entry = records.get(key);
      if (!entry) return null;
      var from = direction === 'undo' ? entry.past : entry.future;
      var to = direction === 'undo' ? entry.future : entry.past;
      var step = from[from.length - 1];
      if (!step) return null;
      var expected = direction === 'undo' ? step.after : step.before;
      if (!equal(current, expected)) { records.delete(key); return null; }
      from.pop(); to.push(step);
      return {draft: copy(direction === 'undo' ? step.before : step.after), label: step.label};
    }
    return {
      record: record,
      undo: function (key, current) { return travel(key, current, 'undo'); },
      redo: function (key, current) { return travel(key, current, 'redo'); },
      status: status,
      clear: function (key) { if (key === undefined) records.clear(); else records.delete(key); }
    };
  }
  return {create: create};
});
