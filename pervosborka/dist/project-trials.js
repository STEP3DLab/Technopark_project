/* Personal notes after real projects. This module does not grade, save or listen.
 * ProjectTrials.html({state, tracks, demo, archived, esc, icon}) returns a scoped section.
 * archived:true shows nonempty records outside the plan, always read-only.
 * Delegate input/change for [data-trial-track][data-trial-field] in the host.
 * Fields: status, happenedOn, note, next; all are optional.
 */
(function (global) {
  'use strict';
  const STATUS = Object.freeze({
    '': 'Пока не отмечено',
    started: 'Проба начата',
    completed: 'Проба завершена'
  });
  const NEXT = Object.freeze({
    '': 'Пока не отвечаю',
    continue: 'Хочу продолжить это направление',
    another: 'Хочу попробовать другое',
    undecided: 'Пока не могу решить'
  });
  const QUESTIONS = Object.freeze({
    continue: 'Какое действие хочется повторить — и что добавить в следующий проект?',
    another: 'Что хочется изменить в следующей пробе: тему, инструмент или способ работы?',
    undecided: 'Какого опыта ещё не хватает, чтобы понять, хочется ли продолжать?'
  });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const escapeText = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1] ? value : '';
  }
  function trialFor(source) {
    const value = object(source) ? source : {};
    return {
      status: typeof value.status === 'string' && own(STATUS, value.status) ? value.status : '',
      happenedOn: calendarDate(value.happenedOn),
      note: typeof value.note === 'string' ? value.note.slice(0, 280) : '',
      next: typeof value.next === 'string' && own(NEXT, value.next) ? value.next : ''
    };
  }
  function dateLabel(value) {
    return value ? value.slice(8,10) + '.' + value.slice(5,7) + '.' + value.slice(0,4) : 'Дата пока не отмечена';
  }
  function question(trial) {
    if (trial.next && own(QUESTIONS, trial.next)) return QUESTIONS[trial.next];
    if (trial.status === 'completed') return 'Что увлекло в самом процессе, даже если результат получился не сразу?';
    if (trial.status === 'started') return 'Какой маленький шаг получится сделать дальше и какая помощь нужна?';
    return 'С какого небольшого действия начнём и что понадобится для первой пробы?';
  }
  function mark(icon, track) {
    if (typeof icon === 'function') return icon(track.id, 22);
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/></svg>';
  }
  function summary(trial, esc, demo) {
    return `<dl class="pt-summary ${demo ? 'pt-summary--visible' : 'pt-print-only'}"><div><dt>Этап</dt><dd>${esc(STATUS[trial.status])}</dd></div><div><dt>Дата реальной пробы</dt><dd>${esc(dateLabel(trial.happenedOn))}</dd></div><div><dt>Что сделал и заметил</dt><dd class="pt-note-text">${esc(trial.note || 'Заметки пока нет')}</dd></div><div><dt>Дальше</dt><dd>${esc(NEXT[trial.next])}</dd></div></dl>`;
  }
  function fields(track, trial, esc) {
    const id = track.id;
    const attr = field => `id="trial-${field}-${id}" data-trial-track="${id}" data-trial-field="${field}"`;
    const options = (list, current) => Object.entries(list).map(([value,label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
    return `<div class="pt-fields no-print">
      <div class="pt-field"><label for="trial-status-${id}">На каком этапе реальная проба?</label><select ${attr('status')} aria-describedby="trial-status-help-${id}">${options(STATUS,trial.status)}</select><p class="pt-field-help" id="trial-status-help-${id}">Отметку выбираешь ты. Завершение не зависит от того, всё ли получилось.</p></div>
      <div class="pt-field"><label for="trial-happenedOn-${id}">Когда пробовал в реальности?</label><input ${attr('happenedOn')} type="date" value="${esc(trial.happenedOn)}" aria-describedby="trial-date-help-${id}"><p class="pt-field-help" id="trial-date-help-${id}">Фактическая дата занятия. Дата обсуждения остаётся в плане.</p></div>
      <div class="pt-field pt-field--wide"><label for="trial-note-${id}">Что сделал и что заметил?</label><textarea ${attr('note')} rows="3" maxlength="280" aria-describedby="trial-note-help-${id}" placeholder="Например: сделал два макета и заметил, какой устойчивее.">${esc(trial.note)}</textarea><p class="pt-field-help" id="trial-note-help-${id}">До 280 символов. Пиши о действии и результате, без личных данных.</p></div>
      <div class="pt-field pt-field--wide"><label for="trial-next-${id}">Что хочется дальше?</label><select ${attr('next')}>${options(NEXT,trial.next)}</select></div>
    </div>`;
  }
  function html(options = {}) {
    const state = object(options.state) ? options.state : {};
    const tracks = Array.isArray(options.tracks) ? options.tracks : [];
    const esc = typeof options.esc === 'function' ? options.esc : escapeText;
    const demo = options.demo === true;
    const archived = options.archived === true;
    const readonly = demo || archived;
    const planned = Array.isArray(state.planned) ? [...new Set(state.planned)] : [];
    const records = object(state.projectTrials) ? state.projectTrials : {};
    const validTrack = track => object(track) && typeof track.id === 'string' && /^[a-z][a-z0-9_-]*$/.test(track.id);
    const hasRecord = id => { const trial = trialFor(records[id]); return !!(trial.status || trial.happenedOn || trial.note.trim() || trial.next); };
    const selected = archived ? tracks.filter((track,index) => validTrack(track) && tracks.findIndex(other => other && other.id === track.id) === index && !planned.includes(track.id) && own(records,track.id) && hasRecord(track.id)).slice(0,8) : planned.slice(0,2).map(id => tracks.find(track => validTrack(track) && track.id === id)).filter(Boolean);
    if (archived && !selected.length) return '';
    const headingId = archived ? 'project-trials-archived-heading' : 'project-trials-heading';
    const heading = archived ? 'Сохранённые записи вне текущего плана' : 'После реальной пробы';
    const intro = archived ? 'Эти проекты сейчас не входят в план. Записи сохранены; для продолжения работы с проектом его можно вернуть в план.' : 'Вернись после занятия или своего проекта. Сохрани, что попробовал, что заметил и хочется ли продолжить.';
    const header = `<header class="pt-heading"><div><p class="pt-kicker">ОПЫТ ЗА ПРЕДЕЛАМИ ТЕСТА</p><h2 id="${headingId}">${heading}</h2><p class="pt-intro">${intro}</p></div><span class="pt-source">Отметки участника · без баллов</span></header>`;
    if (!selected.length) return `<section class="pt" aria-labelledby="project-trials-heading">${header}<div class="pt-empty"><span class="pt-empty-mark" aria-hidden="true">＋</span><div><h3>Сначала выбери будущие проекты</h3><p>Добавь одну или две пробы в свой план. Здесь появятся их карточки для заметок после реального занятия.</p>${demo ? '' : '<a class="btn btn-secondary btn-small no-print" href="#report">Выбрать пробы в моей карте</a>'}</div></div></section>`;
    return `<section class="pt${archived ? ' pt--archived' : ''}" aria-labelledby="${headingId}">${header}<ol class="pt-projects">${selected.map((track,index) => {
      const trial = trialFor(records[track.id]);
      const color = typeof track.color === 'string' && /^#[\da-f]{6}$/i.test(track.color) ? track.color : '#2355ed';
      const titleId = `trial-${archived ? 'archived-' : ''}title-${track.id}`;
      return `<li class="pt-project"><article class="pt-card" aria-labelledby="${titleId}" style="--pt-track:${color}"><header class="pt-card-header"><span class="pt-number" aria-hidden="true">0${index+1}</span><span class="pt-state pt-state--${trial.status || 'unknown'}">${esc(STATUS[trial.status])}</span></header><div class="pt-project-title"><span class="pt-track-icon" aria-hidden="true">${mark(options.icon,track)}</span><div><p class="pt-track-name">${esc(track.name)}</p><h3 id="${titleId}">${esc(track.project)}</h3></div></div>${readonly ? '' : fields(track,trial,esc)}${summary(trial,esc,readonly)}<aside class="pt-conversation"><span aria-hidden="true">↗</span><div><strong>Обсудить с наставником</strong><p>${esc(question(trial))}</p></div></aside></article></li>`;
    }).join('')}</ol><p class="pt-footnote">${readonly ? 'Показаны сохранённые отметки этой карты.' : 'Все поля необязательны. Заметки сохраняются в этом браузере и входят в файл результатов и печатную карту.'} Эти отметки относятся к реальным занятиям и не меняют баллы цифровых миссий или карту интересов.</p></section>`;
  }
  const api = Object.freeze({html});
  global.ProjectTrials = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
