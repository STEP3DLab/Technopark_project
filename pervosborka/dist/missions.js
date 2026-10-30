/*
 * Isolated visual companions for the existing task bank. No scoring or persistence.
 *
 * const markup = MissionVisuals.html(lab, draft, escapeHtml);
 * // Insert markup into the page, then mount its root or a containing element:
 * const view = MissionVisuals.mount(container, {lab, draft, onChange, view:previousView});
 * const savedView = view.getView(); // fresh, serializable presentation snapshot
 * view.update(nextDraft); // draft: {selected:[...]}, or {order:[...]}
 * view.destroy();         // before removing/replacing the containing page
 *
 * The three visual companions only inspect an answer. They never call onChange:
 * filters, device modes and the pipeline run are local presentation state.
 * simulatePipeline(order, input) is an additional pure helper for verification;
 * it executes a fixed set of five known operations and never uses eval or scores.
 */
(function (global) {
  'use strict';

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char];
    });
  }
  function kindOf(lab) {
    if (!lab) return '';
    var type = String(lab.uiType || lab.type || '');
    if (lab.track === 'design' || type === 'design' || type === 'design-preview') return 'design';
    if (lab.track === 'ai' || type === 'ai' || type === 'ai-dataset') return 'ai';
    if (lab.track === 'code' || type === 'order' || type === 'pipeline') return 'order';
    return '';
  }
  function copyDraft(draft) {
    var d = draft || {};
    return {
      selected: Array.isArray(d.selected) ? d.selected.slice() : [],
      order: Array.isArray(d.order) ? d.order.slice() : null
    };
  }
  function presentationSnapshot(source) {
    var saved = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    return {
      device:['desktop','tablet','mobile'].includes(saved.device) ? saved.device : 'desktop',
      userView:saved.userView === true,
      datasetMode:['all','species','light'].includes(saved.datasetMode) ? saved.datasetMode : 'all',
      selectedSample:Number.isInteger(saved.selectedSample) && saved.selectedSample >= 1 && saved.selectedSample <= 20 ? saved.selectedSample : null
    };
  }
  function initialView(saved) {
    return Object.assign(presentationSnapshot(saved), {
      result:null, revealed:0, running:false, note:''
    });
  }
  function button(label, action, value, pressed, extra) {
    return '<button type="button" class="mv-button' + (pressed ? ' is-active' : '') + '" data-mv-action="' + safe(action) + '"' +
      (value != null ? ' data-mv-value="' + safe(value) + '"' : '') +
      (pressed != null ? ' aria-pressed="' + String(!!pressed) + '"' : '') + (extra || '') + '>' + label + '</button>';
  }
  function icon(name) {
    var paths = {
      monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
      tablet:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>',
      phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
      eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
      play:'<path d="m8 5 11 7-11 7Z"/>',
      sound:'<path d="m10 5-5 4H2v6h3l5 4V5Zm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
      mute:'<path d="m10 5-5 4H2v6h3l5 4V5Zm5 4 6 6m0-6-6 6"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      cross:'<path d="m6 6 12 12M6 18 18 6"/>',
      arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
      read:'<path d="M4 4h16v12H4zM8 20h8m-4-4v4M8 8h8m-8 4h5"/>',
      split:'<path d="M4 12h6m0 0 5-7h5m-10 7 5 7h5"/>',
      filter:'<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
      mean:'<path d="M5 5h14L9 12l10 7H5"/>',
      display:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10m-10 5h6"/>'
    };
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.arrow) + '</svg>';
  }
  function heading(kicker, title, text) {
    return '<div class="mv-heading"><div><p class="mv-kicker">' + kicker + '</p><h3>' + title + '</h3>' +
      (text ? '<p class="mv-description">' + text + '</p>' : '') + '</div></div>';
  }

  // Design preview: the source choices remain entirely in the host application.
  function invitationArt() {
    return '<svg viewBox="0 0 240 170" class="mv-invite-art" aria-hidden="true">' +
      '<ellipse cx="126" cy="145" rx="81" ry="13" fill="#172b51" opacity=".1"/>' +
      '<path d="m46 77 72-42 73 42-73 42Z" fill="#d7f56c"/>' +
      '<path d="m46 77 72 42v32l-72-42Z" fill="#9cbd3f"/>' +
      '<path d="m118 119 73-42v32l-73 42Z" fill="#bfe347"/>' +
      '<path d="m82 60 48-28 49 28-49 28Z" fill="#7297ff"/>' +
      '<path d="m82 60 48 28v46l-48-28Z" fill="#2355ed"/>' +
      '<path d="m130 88 49-28v46l-49 28Z" fill="#173bb4"/>' +
      '<path d="m104 22 25-14 25 14-25 14Z" fill="#fff"/>' +
      '<path d="m104 22 25 14v32l-25-14Z" fill="#c8d6f4"/>' +
      '<path d="m129 36 25-14v32l-25 14Z" fill="#eaf0ff"/>' +
      '<circle cx="196" cy="37" r="12" fill="#d7f56c"/><path d="M39 34v14m-7-7h14" stroke="#2355ed" stroke-width="2"/>' +
      '</svg>';
  }
  function designMarkup(lab, draft, view, esc) {
    var selected = new Set(draft.selected || []);
    var large = selected.has('large'), small = selected.has('small');
    var labels = selected.has('labels'), captions = selected.has('captions');
    var conflicts = [];
    if (large && small) conflicts.push('Выбраны два разных размера основного текста. В макете пока показан промежуточный размер.');
    if (labels && selected.has('coloronly')) conflicts.push('Подписи к кнопкам и передача смысла только цветом — разные варианты одного решения.');
    if (captions && selected.has('audioonly')) conflicts.push('Текстовая версия инструкции и инструкция только вслух — разные варианты одного решения.');
    var textSize = large && !small ? 20 : small && !large ? 12 : 16;
    var summary = 'Основной текст: ' + textSize + ' px. Подписи на кнопках: ' + (labels ? 'есть' : 'нет') + '. Текст инструкции: ' + (captions ? 'есть' : 'нет') + '.';
    var accessiblePreview = 'Макет приглашения в открытую мастерскую. 12:00, мастерская номер 3. Собери свой первый прототип. Один час, одна идея и результат, который можно забрать с собой. ' + summary +
      (labels ? ' На кнопках написано «Записаться» и «Позже».' : ' Две кнопки без текстовых подписей.') +
      (captions ? ' Текст инструкции: выбери «Записаться», чтобы подтвердить участие. «Позже» вернёт тебя к выбору.' : ' Текстовая версия голосовой инструкции отсутствует.') +
      (view.userView ? ' В режиме проверки убраны цвет и звук.' : ' Обычный цветной предпросмотр.');
    return heading('ЖИВОЙ МАКЕТ', 'Увидь, что меняют твои решения', 'Выбирай предложения в задании: приглашение сразу меняется.') +
      '<div class="mv-toolbar"><div class="mv-segment" role="group" aria-label="Размер экрана предпросмотра">' +
      button(icon('monitor') + '<span>Монитор</span>', 'device', 'desktop', view.device === 'desktop') +
      button(icon('tablet') + '<span>Планшет</span>', 'device', 'tablet', view.device === 'tablet') +
      button(icon('phone') + '<span>Телефон</span>', 'device', 'mobile', view.device === 'mobile') +
      '</div>' + button(icon('eye') + '<span>Как видит пользователь</span>', 'user-view', null, view.userView) + '</div>' +
      '<div class="mv-design-stage' + (view.userView ? ' is-user-view' : '') + '">' +
      '<div class="mv-device mv-device--' + view.device + '">' +
      '<div class="mv-device-bar"><span class="mv-device-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Предпросмотр приглашения</span><span aria-hidden="true">↗</span></div>' +
      '<div class="mv-invitation" role="img" aria-label="' + esc(accessiblePreview) + '" style="--mv-preview-text:' + textSize + 'px">' +
      '<div class="mv-invite-visual"><span class="mv-invite-tag">ОТКРЫТАЯ МАСТЕРСКАЯ</span>' + invitationArt() + '<span class="mv-art-caption">Идея становится вещью</span></div>' +
      '<div class="mv-invite-body"><span class="mv-invite-time">12:00 · Мастерская № 3</span><h4>Собери свой<br>первый прототип</h4>' +
      '<p class="mv-invite-copy">Один час, одна идея и результат, который можно забрать с собой.</p>' +
      '<div class="mv-audio' + (view.userView ? ' is-muted' : '') + '">' + icon(view.userView ? 'mute' : 'sound') + '<span>' +
      (view.userView ? 'Звук выключен' : 'Макет голосовой инструкции') + '</span><span class="mv-audio-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>' +
      (captions ? '<div class="mv-captions"><span>ТЕКСТ ИНСТРУКЦИИ</span>Выбери «Записаться», чтобы подтвердить участие. «Позже» вернёт тебя к выбору.</div>' :
        '<div class="mv-no-captions">' + (view.userView ? 'Текстовой версии инструкции нет.' : 'Здесь может появиться текстовая версия инструкции.') + '</div>') +
      '<div class="mv-preview-actions" aria-hidden="true"><span class="mv-preview-action mv-preview-yes">' + (labels ? 'Записаться' : '<i></i>') + '</span><span class="mv-preview-action mv-preview-no">' + (labels ? 'Позже' : '<i></i>') + '</span></div></div></div></div></div>' +
      '<div class="mv-preview-summary"><span class="mv-small-dot" aria-hidden="true"></span><p>' + esc(summary) + '</p></div>' +
      (view.userView ? '<p class="mv-note">Режим проверки убирает цвет и звук. Посмотри, хватает ли текстовых подсказок, чтобы понять приглашение.</p>' : '') +
      (conflicts.length ? '<div class="mv-conflicts">' + conflicts.map(function (message) { return '<p>' + esc(message) + '</p>'; }).join('') + '</div>' : '') +
      '<p class="mv-footnote">Размеры и содержание — учебный макет. Переключение экрана не меняет твой ответ.</p>';
  }

  // These are intentionally schematic images, not additional experimental data.
  function samples() {
    return Array.from({length:20}, function (_, i) {
      return {id:i + 1, species:i % 3, correct:i !== 5 && i !== 16, rotation:(i % 5 - 2) * 5};
    });
  }
  function speciesName(index) { return ['Вид А', 'Вид Б', 'Вид В'][index] || 'Вид'; }
  function leafArt(species, rotation) {
    var shapes = [
      '<path d="M44 77c0-16 0-33 4-49" stroke="#173b8e" stroke-width="3" fill="none"/><path d="M46 54C20 57 13 33 21 22c22-2 33 13 25 32Z" fill="#b7d862"/><path d="M47 41C45 18 61 9 75 15c7 21-8 33-28 26Z" fill="#d4ed8b"/><path d="m22 23 24 30m1-12 26-24" stroke="#173b8e" stroke-width="1.5" fill="none"/>',
      '<path d="M47 79V18" stroke="#173b8e" stroke-width="3" fill="none"/><path d="M46 65 18 53l6-15 22 14ZM48 59 75 47l-7-16-20 15ZM46 42 24 29l9-14 13 15ZM48 33 62 10l12 12-26 23Z" fill="#c6e77c"/><path d="m26 48 20 11m3-6 17-11M33 25l13 10m3 3 16-17" stroke="#173b8e" stroke-width="1.4" fill="none"/>',
      '<path d="M47 80V44" stroke="#173b8e" stroke-width="3" fill="none"/><path d="m47 9 9 18 16-6-1 16 17 7-15 11 2 17-19-4-9 14-9-14-19 4 2-17L6 44l17-7-1-16 16 6Z" fill="#c2dc72"/><path d="M47 18v52m0-24 19-16M47 51 29 32m18 27 20 4m-20-4-19 4" stroke="#173b8e" stroke-width="1.4" fill="none"/>'
    ];
    return '<svg viewBox="0 0 94 94" class="mv-leaf-art" aria-hidden="true"><g transform="rotate(' + Number(rotation || 0) + ' 47 47)">' + shapes[species % 3] + '</g></svg>';
  }
  function aiMarkup(lab, draft, view, esc) {
    var list = samples();
    if (view.datasetMode === 'species') list.sort(function (a, b) { return a.species - b.species || a.id - b.id; });
    var chosen = samples().find(function (sample) { return sample.id === view.selectedSample; });
    var modeText = view.datasetMode === 'species' ? 'Три условных вида · все 20 примеров остаются на экране' :
      view.datasetMode === 'light' ? 'Во всей проверке одно условие: хорошее освещение' : 'Нажми на любой пример, чтобы рассмотреть его';
    return heading('СТОЛ ИССЛЕДОВАТЕЛЯ', 'Что на самом деле проверили?', 'Рассмотри выборку, затем оцени утверждения в задании.') +
      '<div class="mv-dataset-top"><div class="mv-dataset-stat"><strong>20</strong><span>новых примеров</span></div><div class="mv-dataset-stat"><strong>18</strong><span>верных ответов</span></div><div class="mv-dataset-stat mv-stat-miss"><strong>2</strong><span>ошибки</span></div><div class="mv-dataset-condition">' + icon('sun') + '<span>Хорошее<br>освещение</span></div></div>' +
      '<div class="mv-toolbar"><div class="mv-segment" role="group" aria-label="Представление учебной выборки">' +
      button('Все примеры', 'dataset-mode', 'all', view.datasetMode === 'all') +
      button('По видам', 'dataset-mode', 'species', view.datasetMode === 'species') +
      button(icon('sun') + '<span>Освещение</span>', 'dataset-mode', 'light', view.datasetMode === 'light') + '</div></div>' +
      '<div class="mv-dataset-key"><span>' + esc(modeText) + '</span><span class="mv-status-key"><span>✓ Совпал</span><span>× Не совпал</span></span></div>' +
      '<div class="mv-sample-grid' + (view.datasetMode === 'light' ? ' is-light-view' : '') + '" role="group" aria-label="Двадцать условных иллюстраций растений">' +
      list.map(function (sample) {
        var label = 'Пример ' + sample.id + '. ' + speciesName(sample.species) + '. Ответ ' + (sample.correct ? 'совпал' : 'не совпал') + '. Хорошее освещение.';
        return '<button type="button" class="mv-sample' + (sample.correct ? '' : ' is-miss') + (view.selectedSample === sample.id ? ' is-selected' : '') + '" data-mv-action="sample" data-mv-value="' + sample.id + '" aria-pressed="' + (view.selectedSample === sample.id) + '" aria-label="' + esc(label) + '">' +
          '<span class="mv-sample-index">' + String(sample.id).padStart(2, '0') + '</span><span class="mv-sample-result" aria-hidden="true">' + (sample.correct ? '✓' : '×') + '</span>' +
          leafArt(sample.species, sample.rotation) + '<span class="mv-sample-caption">' +
          (view.datasetMode === 'light' ? icon('sun') + '<span>Хорошее</span>' : speciesName(sample.species)) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="mv-sample-detail' + (chosen ? '' : ' is-placeholder') + '">' +
      (chosen ? '<div class="mv-detail-image">' + leafArt(chosen.species, chosen.rotation) + '</div><div><span class="mv-detail-kicker">ПРИМЕР ' + String(chosen.id).padStart(2,'0') + '</span><h4>' + speciesName(chosen.species) + '</h4><p><span class="mv-detail-status' + (chosen.correct ? '' : ' is-miss') + '">' + (chosen.correct ? '✓ Ответ совпал с разметкой' : '× Ответ не совпал с разметкой') + '</span></p><p class="mv-detail-light">' + icon('sun') + 'Хорошее освещение</p></div>' :
        '<span class="mv-detail-placeholder">' + icon('eye') + '</span><p>Открой карточку. Здесь появятся условия съёмки и результат этого примера.</p>') + '</div>' +
      '<p class="mv-footnote">Карточки — условная иллюстрация учебной выборки. Раскладка по видам и расположение двух ошибок придуманы для наглядности; они не добавляют данных к условию задания.</p>';
  }

  function snapshot(kind, value) {
    if (kind === 'none') return 'Данные ещё не получены';
    if (kind === 'text') return '«' + value + '»';
    if (kind === 'tokens') return '[' + value.map(function (item) { return '«' + item + '»'; }).join(', ') + ']';
    if (kind === 'numbers') return '[' + value.map(formatNumber).join(', ') + ']';
    if (kind === 'number') return formatNumber(value);
    return String(value);
  }
  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000).replace('.', ',');
  }
  function simulatePipeline(order, input) {
    var ids = Array.isArray(order) ? order.slice(0, 20) : [];
    var source = typeof input === 'string' ? input : '19;20;нет данных;21';
    var state = {kind:'none', value:null}, halted = false, seen = new Set(), steps = [];
    var types = {read:'Получение строки', split:'Разделение строки', filter:'Очистка и преобразование', mean:'Среднее значение', display:'Вывод на экран'};
    ids.forEach(function (id) {
      var record = {id:id, label:types[id] || 'Неизвестный блок', status:'waiting', before:snapshot(state.kind,state.value), after:'', message:''};
      if (halted) { record.status = 'skipped'; record.message = 'Не выполнен: предыдущий шаг остановил поток.'; steps.push(record); return; }
      var error = '';
      if (!Object.prototype.hasOwnProperty.call(types,id)) error = 'Для этого блока не определено действие.';
      else if (seen.has(id)) error = 'Этот блок уже встречался. Каждый подготовленный блок используется один раз.';
      else if (id === 'read') { state = {kind:'text',value:source}; record.message = 'Получена исходная строка от датчика.'; }
      else if (id === 'split') {
        if (state.kind !== 'text') error = 'Разделению нужна исходная строка. Сейчас на входе другой тип данных.';
        else { state = {kind:'tokens',value:state.value.split(';').map(function (token) { return token.trim(); })}; record.message = 'Строка разделена по точке с запятой.'; }
      } else if (id === 'filter') {
        if (state.kind !== 'tokens') error = 'Очистке нужен список элементов после разделения строки.';
        else {
          var removed = [];
          var numbers = state.value.filter(function (token) {
            var valid = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(token) && Number.isFinite(Number(token.replace(',','.')));
            if (!valid) removed.push(token);
            return valid;
          }).map(function (token) { return Number(token.replace(',','.')); });
          state = {kind:'numbers',value:numbers}; record.message = removed.length ? 'Нечисловые элементы удалены: ' + removed.map(function (token) { return '«' + token + '»'; }).join(', ') + '.' : 'Все элементы преобразованы в числа.';
        }
      } else if (id === 'mean') {
        if (state.kind !== 'numbers') error = 'Для среднего нужен очищенный список чисел. Такой список ещё не получен.';
        else if (!state.value.length) error = 'В списке нет чисел: делить сумму на ноль нельзя.';
        else { var result = state.value.reduce(function (sum,n) { return sum+n; },0)/state.value.length; state = {kind:'number',value:result}; record.message = 'Сумма чисел разделена на их количество.'; }
      } else if (id === 'display') {
        if (state.kind !== 'number') error = 'Экран ждёт вычисленное среднее — одно число. Оно ещё не получено.';
        else { state = {kind:'screen',value:'Средняя температура: ' + formatNumber(state.value) + ' °C'}; record.message = 'Готовое значение показано на экране.'; }
      }
      seen.add(id);
      record.status = error ? 'error' : 'done';
      record.after = snapshot(state.kind,state.value);
      if (error) { record.message = error; halted = true; }
      steps.push(record);
    });
    var completed = !halted && state.kind === 'screen';
    var message = completed ? state.value : halted ? 'Конвейер остановился. Посмотри, какие данные нужны первому остановившемуся блоку.' : 'Экран ещё не получил готовое среднее.';
    return {steps:steps, completed:completed, halted:halted, output:completed?state.value:null, message:message, finalKind:state.kind};
  }
  function orderOf(lab,draft) {
    if (Array.isArray(draft.order)) return draft.order.slice(0,20);
    return (lab.config && Array.isArray(lab.config.items) ? lab.config.items : []).map(function (item) { return item.id; });
  }
  function orderMarkup(lab,draft,view,esc) {
    var order = orderOf(lab,draft), names = {read:'Получить',split:'Разделить',filter:'Очистить',mean:'Среднее',display:'Показать'};
    var source = lab.config && lab.config.input || '19;20;нет данных;21';
    var result = view.result, revealed = view.revealed;
    var doneSteps = result ? result.steps.slice(0,revealed) : [];
    var last = doneSteps.length ? doneSteps[doneSteps.length-1] : null;
    var complete = !!(result && !view.running && revealed >= result.steps.length);
    var statusText = view.note || (view.running ? 'Показ выполнения: шаг ' + Math.max(1,revealed) + ' из ' + order.length + '.' : complete ? result.message : 'Измени порядок блоков и запусти поток данных.');
    return heading('КОНВЕЙЕР В ДЕЙСТВИИ', 'Проверь, куда попадут данные', 'Запуск показывает работу выбранного порядка. Ответ сохраняется и оценивается только кнопками основного задания.') +
      '<div class="mv-pipeline-source"><span class="mv-source-label">СИГНАЛ ДАТЧИКА</span><code>' + esc(source) + '</code><span class="mv-source-tag">Исходная строка</span></div>' +
      '<ol class="mv-pipeline-track" aria-label="Текущий порядок блоков">' + order.map(function (id,i) {
        var step = result && result.steps[i], visible = i < revealed;
        var state = visible && step ? step.status : view.running && i === revealed ? 'active' : 'waiting';
        return '<li class="mv-pipeline-node is-' + state + '"><span class="mv-pipeline-number">' + (i+1) + '</span><span class="mv-pipeline-glyph">' + icon(id) + '</span><span class="mv-pipeline-name">' + esc(names[id] || 'Блок') + '</span><span class="mv-pipeline-state">' + (state === 'done' ? 'Готово' : state === 'error' ? 'Остановка' : state === 'skipped' ? 'Не выполнен' : state === 'active' ? 'В работе' : 'Ожидает') + '</span></li>';
      }).join('') + '</ol>' +
      '<div class="mv-pipeline-controls">' + button(icon(view.running ? 'cross' : 'play') + '<span>' + (view.running ? 'Остановить показ' : 'Запустить конвейер') + '</span>', 'pipeline-run', null, null, ' aria-label="' + (view.running ? 'Остановить показ выполнения' : 'Запустить предпросмотр текущего порядка блоков') + '"') + '<span>Без проверки баллов</span></div>' +
      '<div class="mv-pipeline-terminal' + (complete && result.completed ? ' is-complete' : last && last.status === 'error' ? ' is-error' : '') + '"><div class="mv-terminal-bar"><span class="mv-terminal-dot"></span><span>' + (last ? esc(last.label) : 'ОКНО ВЫПОЛНЕНИЯ') + '</span><span class="mv-terminal-mode">' + (view.running ? 'Выполнение' : complete ? 'Показ завершён' : 'Готов к запуску') + '</span></div><div class="mv-terminal-body"><p class="mv-terminal-value">' + esc(last ? last.after : 'Данные ещё не получены') + '</p><p>' + esc(statusText) + '</p></div></div>' +
      (doneSteps.length ? '<ol class="mv-execution-log" aria-label="Ход выполнения конвейера">' + doneSteps.map(function (step,i) {
        return '<li class="is-' + step.status + '"><span class="mv-log-index">' + (i+1) + '</span><div><strong>' + esc(step.label) + '</strong><p>' + esc(step.message) + '</p>' + (step.status === 'done' ? '<code>' + esc(step.after) + '</code>' : '') + '</div><span class="mv-log-symbol" aria-hidden="true">' + (step.status === 'done' ? '✓' : step.status === 'error' ? '×' : '—') + '</span></li>';
      }).join('') + '</ol>' : '') +
      '<p class="mv-footnote">Здесь выполняются только пять подготовленных действий. Пробуй другой порядок и наблюдай, на каком шаге меняется тип данных.</p>';
  }
  function bodyMarkup(kind,lab,draft,view,esc) {
    if (kind === 'design') return designMarkup(lab,draft,view,esc);
    if (kind === 'ai') return aiMarkup(lab,draft,view,esc);
    if (kind === 'order') return orderMarkup(lab,draft,view,esc);
    return '';
  }
  function html(lab,draft,escapeFn) {
    var kind = kindOf(lab);
    if (!kind) return '';
    var esc = typeof escapeFn === 'function' ? escapeFn : safe;
    return '<section class="mv mv--' + kind + '" data-mv-root data-mv-lab="' + esc(lab.id || lab.track || kind) + '" aria-label="Интерактивное представление задания"><div data-mv-content>' + bodyMarkup(kind,lab,copyDraft(draft),initialView(),esc) + '</div><p class="mv-sr-only" data-mv-live role="status" aria-live="polite" aria-atomic="true"></p></section>';
  }
  function mount(container,options) {
    options = options || {};
    var lab = options.lab, kind = kindOf(lab), draft = copyDraft(options.draft), view = initialView(options.view);
    var root = container && container.matches && container.matches('[data-mv-root]') ? container :
      container && container.querySelector ? container.querySelector('[data-mv-root]') : null;
    var destroyed = false, timer = null;
    if (!root || !kind) return {destroy:function(){},update:function(){},getView:function(){return presentationSnapshot(view);}};
    var content = root.querySelector('[data-mv-content]'), live = root.querySelector('[data-mv-live]');
    function stopTimer() { if (timer != null) { global.clearTimeout(timer); timer = null; } }
    function announce(text) { if (live && !destroyed) live.textContent = text; }
    function render(focusAction,focusValue) {
      if (destroyed || !content) return;
      content.innerHTML = bodyMarkup(kind,lab,draft,view,safe);
      if (focusAction) {
        var candidates = root.querySelectorAll('[data-mv-action]');
        for (var i=0;i<candidates.length;i++) {
          if (candidates[i].dataset.mvAction === focusAction && (focusValue == null || candidates[i].dataset.mvValue === String(focusValue))) {
            try { candidates[i].focus({preventScroll:true}); } catch (_) { candidates[i].focus(); }
            break;
          }
        }
      }
    }
    function finish() {
      var active = root.ownerDocument && root.ownerDocument.activeElement;
      var preserveRunFocus = active && root.contains(active) && active.dataset.mvAction === 'pipeline-run';
      view.running = false;
      view.revealed = view.result.steps.length;
      render(preserveRunFocus ? 'pipeline-run' : null);
      var error = view.result.steps.find(function (step) { return step.status === 'error'; });
      announce(error ? 'Конвейер остановился. ' + error.label + '. ' + error.message : view.result.message);
    }
    function advance() {
      if (destroyed || !view.running) return;
      view.revealed += 1;
      if (view.revealed >= view.result.steps.length) { finish(); return; }
      var step = view.result.steps[view.revealed-1];
      if (step && step.status === 'error') { finish(); return; }
      var active = root.ownerDocument && root.ownerDocument.activeElement;
      render(active && root.contains(active) && active.dataset.mvAction === 'pipeline-run' ? 'pipeline-run' : null);
      timer = global.setTimeout(advance,550);
    }
    function run() {
      stopTimer();
      if (view.running) {
        view.running = false; view.note = 'Показ остановлен. Твой ответ не изменён.';
        render('pipeline-run'); announce(view.note); return;
      }
      view.note = '';
      view.result = simulatePipeline(orderOf(lab,draft),lab.config && lab.config.input);
      view.revealed = 0; view.running = true;
      var reduced = (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) || global.document?.documentElement?.getAttribute('data-ui-motion') === 'reduced';
      if (reduced || !view.result.steps.length) { finish(); return; }
      render('pipeline-run'); announce('Запущен предпросмотр конвейера.');
      timer = global.setTimeout(advance,400);
    }
    function onClick(event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-mv-action]') : null;
      if (!target || !root.contains(target) || destroyed) return;
      var action = target.dataset.mvAction, value = target.dataset.mvValue;
      if (action === 'device' && ['desktop','tablet','mobile'].includes(value)) {
        view.device = value; render(action,value); announce('Предпросмотр: ' + ({desktop:'монитор',tablet:'планшет',mobile:'телефон'})[value] + '.');
      } else if (action === 'user-view') {
        view.userView = !view.userView; render(action); announce(view.userView ? 'В предпросмотре убраны цвет и звук.' : 'Обычный предпросмотр восстановлен.');
      } else if (action === 'dataset-mode' && ['all','species','light'].includes(value)) {
        view.datasetMode = value; render(action,value); announce(value === 'species' ? 'Примеры сгруппированы по трём условным видам.' : value === 'light' ? 'У всех двадцати примеров хорошее освещение.' : 'Показаны все двадцать примеров.');
      } else if (action === 'sample') {
        var number = Number(value), sample = samples().find(function (item) { return item.id === number; });
        if (!sample) return;
        view.selectedSample = number; render(action,value);
        announce('Пример ' + number + '. ' + speciesName(sample.species) + '. ' + (sample.correct ? 'Ответ совпал с разметкой.' : 'Ответ не совпал с разметкой.') + ' Хорошее освещение.');
      } else if (action === 'pipeline-run') run();
    }
    root.addEventListener('click',onClick);
    render();
    return {
      getView:function () { return presentationSnapshot(view); },
      destroy:function () { destroyed = true; stopTimer(); root.removeEventListener('click',onClick); },
      update:function (nextDraft) {
        if (destroyed) return;
        var previousOrder = JSON.stringify(orderOf(lab,draft));
        draft = copyDraft(nextDraft);
        if (kind === 'order' && previousOrder !== JSON.stringify(orderOf(lab,draft))) {
          stopTimer(); view.running = false; view.result = null; view.revealed = 0;
          view.note = 'Порядок изменён. Запусти конвейер, чтобы увидеть новый поток данных.';
        }
        render();
      }
    };
  }
  global.MissionVisuals = Object.freeze({html:html,mount:mount,simulatePipeline:simulatePipeline});
})(window);
