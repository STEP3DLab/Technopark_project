'use strict';

// RFC 5545: https://www.rfc-editor.org/rfc/rfc5545
// Pure exports: this module never reads browser storage or sends calendar data.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./monitor-utils.js'));
  else root.ExpertExportUtils = factory(root.ExpertMonitorUtils);
})(typeof window === 'undefined' ? globalThis : window, function (monitor) {
  if (!monitor || typeof monitor.deadlineTime !== 'function') throw new Error('ExpertMonitorUtils must load before ExpertExportUtils');
  const CRLF = '\r\n';
  const DAY = 86400000;
  const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);
  const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
  const ZONED_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

  function text(value) {return typeof value === 'string' ? value : '';}
  function validId(id) {return typeof id === 'string' && id.length > 0 && id.length <= 200 && !FORBIDDEN_IDS.has(id);}
  function isObject(value) {return value !== null && typeof value === 'object' && !Array.isArray(value);}

  function escapeText(value) {
    return text(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n|\u2028|\u2029/g, '\\n')
      .replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  function foldLine(line) {
    // Count UTF-8 octets, including the continuation SPACE; never split a
    // Unicode code point. This also works without Buffer or TextEncoder.
    let result = '', chunk = '', bytes = 0;
    for (const character of line) {
      const point = character.codePointAt(0);
      const width = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bytes + width > 75) {result += chunk + CRLF; chunk = ' '; bytes = 1;}
      chunk += character; bytes += width;
    }
    return result + chunk;
  }

  function safeUrl(value) {
    if (!text(value) || /[\s\u0000-\u001f\u007f]/.test(value)) return '';
    try {
      const parsed = new URL(value);
      return ['https:', 'http:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : '';
    } catch {return '';}
  }

  function dateKey(value) {
    return typeof value === 'string' && DATE_KEY.test(value) && monitor.deadlineTime({deadline: value}) !== null ? value : null;
  }
  function nextDate(value) {
    if (!dateKey(value)) return null;
    // UTC is only a calendar arithmetic container here; the DATE is never
    // converted from or to a user's timezone.
    const next = new Date(Date.parse(value + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
    return dateKey(next);
  }
  function instant(value) {
    return typeof value === 'string' && ZONED_TIMESTAMP.test(value) ? monitor.deadlineTime({deadline: value}) : null;
  }
  function utcStamp(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const iso = date.toISOString();
    return /^\d{4}-/.test(iso) ? iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') : null;
  }

  function uid(kind, id) {
    // Four independently seeded 32-bit hashes make a compact deterministic
    // namespace. UIDs stay the same when a task's title or date changes.
    const input = kind + ':' + id;
    const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    const digest = seeds.map(seed => {
      let hash = seed;
      for (let i = 0; i < input.length; i++) {hash ^= input.charCodeAt(i); hash = Math.imul(hash, 0x01000193);}
      return (hash >>> 0).toString(16).padStart(8, '0');
    }).join('');
    return kind + '-' + digest + '@expert-monitor.step3dlab.github.io';
  }

  function cardUrl(baseUrl, id) {
    const base = safeUrl(baseUrl);
    if (!base) return '';
    const result = new URL(base);
    result.search = '';
    result.hash = 'opportunities?record=' + encodeURIComponent(id);
    return result.href;
  }
  function allDay(value) {
    const start = dateKey(value), end = start && nextDate(start);
    return start && end ? ['DTSTART;VALUE=DATE:' + start.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + end.replace(/-/g, '')] : null;
  }
  function eventLines({kind, id, stamp, dates, summary, description, location, url, confirmed, updatedAt}) {
    const lines = ['BEGIN:VEVENT', 'UID:' + uid(kind, id), 'DTSTAMP:' + stamp, ...dates,
      'SUMMARY:' + escapeText(summary), 'DESCRIPTION:' + escapeText(description),
      'CLASS:' + (kind === 'task' ? 'PRIVATE' : 'PUBLIC'),
      'STATUS:' + (confirmed ? 'CONFIRMED' : 'TENTATIVE'), 'TRANSP:TRANSPARENT'];
    if (location) lines.push('LOCATION:' + escapeText(location));
    if (url) lines.push('URL:' + url);
    if (updatedAt !== undefined) lines.push('LAST-MODIFIED:' + utcStamp(updatedAt));
    lines.push('END:VEVENT');
    return lines;
  }

  /**
   * createCalendar({records, tasks, includeDeadlines, includeTasks, baseUrl, now})
   * -> {content: string, events: number, skipped: [{kind, id, reason}]}.
   *
   * records is the explicitly selected public record array. tasks is the
   * explicitly supplied workspace map {recordId: {text, dueDate, updatedAt?,
   * completedAt?}}. No notes, quotes, experts or company details are read.
   * Public-only UI calls must set includeTasks:false; personal task export
   * passes tasks with includeDeadlines:false. Missing source URLs are labelled,
   * nonempty unsafe source URLs cause that public event to be skipped.
   * Empty selections return a valid empty VCALENDAR with events:0.
   */
  function createCalendar({records = [], tasks = {}, includeDeadlines = true, includeTasks = true, baseUrl = '', now = new Date()} = {}) {
    if (!Array.isArray(records)) throw new TypeError('records must be an array');
    if (includeTasks && !isObject(tasks)) throw new TypeError('tasks must be a workspace task map');
    const nowTime = typeof now === 'string' ? instant(now) : now instanceof Date ? now.getTime() : typeof now === 'number' ? now : null;
    const stamp = nowTime !== null && utcStamp(nowTime);
    if (!stamp) throw new TypeError('now must be a valid Date, epoch time, or ISO timestamp with timezone');
    const events = [], skipped = [], seen = new Set(), byId = new Map();
    const skip = (kind, id, reason) => skipped.push({kind, id: text(id), reason});
    for (const record of records) if (isObject(record) && validId(record.id) && !byId.has(record.id)) byId.set(record.id, record);

    if (includeDeadlines) for (const record of records) {
      const id = record?.id;
      if (!isObject(record) || !validId(id)) {skip('deadline', id, 'invalid-record'); continue;}
      if (!['open_confirmed', 'needs_review'].includes(record.status)) {skip('deadline', id, 'inactive-record'); continue;}
      const time = monitor.deadlineTime(record);
      if (time === null) {skip('deadline', id, record.deadline ? 'invalid-date' : 'missing-date'); continue;}
      if (time < nowTime) {skip('deadline', id, 'expired'); continue;}
      const source = safeUrl(record.sourceUrl);
      if (record.sourceUrl !== undefined && record.sourceUrl !== null && record.sourceUrl !== '' && !source) {skip('deadline', id, 'unsafe-url'); continue;}
      const dates = DATE_KEY.test(record.deadline) ? allDay(record.deadline) : utcStamp(time) ? ['DTSTART:' + utcStamp(time)] : null;
      if (!dates) {skip('deadline', id, 'invalid-date'); continue;}
      const key = 'deadline:' + id;
      if (seen.has(key)) {skip('deadline', id, 'duplicate'); continue;}
      seen.add(key);
      const confirmed = record.status === 'open_confirmed';
      const title = text(record.title).trim() || text(record.caseNumber).trim() || 'Публичный запрос';
      const link = cardUrl(baseUrl, id);
      const type = record.sourceType === 'procurement_adjacent' ? 'Смежная закупка' : record.sourceType === 'court_decision' ? 'Судебное дело' : 'Публичная запись';
      const description = [type + (text(record.caseNumber) ? ' № ' + record.caseNumber : ''),
        title, text(record.court),
        confirmed ? 'Приём подтверждён в опубликованном срезе. Перед подачей проверьте изменения и возможное продление срока.' : 'Приём не подтверждён. Срок взят из найденных материалов и требует проверки по первоисточнику. Событие не означает доступный заказ.',
        'Срок в исходных данных: ' + record.deadline + (DATE_KEY.test(record.deadline) ? ' (до конца указанного дня по Москве).' : ZONED_TIMESTAMP.test(record.deadline) ? '.' : ' (время без часового пояса интерпретировано по Москве; подтвердите его у источника).'),
        source ? 'Источник: ' + source : 'Источник не указан. Найдите первоисточник и подтвердите актуальность срока.',
        link ? 'Карточка: ' + link : ''].filter(Boolean).join('\n');
      events.push({key, order: time, lines: eventLines({kind: 'deadline', id, stamp, dates,
        summary: (confirmed ? 'Срок подачи: ' : 'Проверить срок: ') + title, description,
        location: text(record.objectRegion) || text(record.region), url: link || source, confirmed})});
    }

    if (includeTasks) for (const [id, task] of Object.entries(tasks)) {
      if (!validId(id) || !isObject(task)) {skip('task', id, 'invalid-task'); continue;}
      if (Object.hasOwn(task, 'completedAt')) {
        skip('task', id, instant(task.completedAt) === null ? 'invalid-completed-date' : 'completed'); continue;
      }
      const dates = allDay(task.dueDate);
      if (!dates) {skip('task', id, task.dueDate ? 'invalid-date' : 'missing-date'); continue;}
      const updated = Object.hasOwn(task, 'updatedAt') ? instant(task.updatedAt) : undefined;
      if (updated === null) {skip('task', id, 'invalid-updated-date'); continue;}
      const record = byId.get(id), link = record ? cardUrl(baseUrl, id) : '';
      const title = text(task.text).trim() || 'Проверить запись';
      const description = ['Личная задача. Дата планирования не является сроком подачи и не подтверждает статус источника.',
        title, record && text(record.title) ? 'Связанная запись: ' + record.title : '',
        record && text(record.caseNumber) ? 'Номер: ' + record.caseNumber : '', link ? 'Карточка: ' + link : ''].filter(Boolean).join('\n');
      events.push({key: 'task:' + id, order: Date.parse(task.dueDate + 'T00:00:00Z'),
        lines: eventLines({kind: 'task', id, stamp, dates, summary: 'Моя задача: ' + title,
          description, url: link, confirmed: true, updatedAt: updated})});
    }

    events.sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MSK Expert//Expert Monitor 2.1//RU',
      'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + escapeText(includeTasks && Object.keys(tasks).length ? 'МСК Эксперт — мои задачи и сроки' : 'МСК Эксперт — сроки источников'),
      ...events.flatMap(event => event.lines), 'END:VCALENDAR'];
    return {content: lines.map(foldLine).join(CRLF) + CRLF, events: events.length, skipped};
  }

  return Object.freeze({createCalendar, escapeText, foldLine});
});
