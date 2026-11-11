import { validateCatalog, emptyStudy, addMaterial, addMaterialReview, materialLanguage, beginAttempt, finishAttempt, addReview, studySummary, exportStudy, importStudy, attemptsCSV, materialsCSV, MAX_IMPORT_BYTES } from './pilot-model.js?v=0.19.0';

const $ = id => document.getElementById(id);
const storageKey = `hearing-equality:pilot:visitor-v1:${location.pathname}`;
const splitNames = { train: 'Образцы', validation: 'Настройка', test: 'Итоговая проверка' };
const outcomeNames = { answered: 'Получен ответ', refused: 'Отказ', skipped: 'Пропуск' };
const kindNames = { recognition: 'Распознавание', comprehension: 'Понятность' };
const mediaNames = { human_video: 'Видео носителя', avatar_video: 'Видео аватара', live: 'Очный показ' };
const languageNames = { pending: 'Язык ещё не проверен', approved: 'Языковая проверка отмечена', changes: 'Нужны исправления' };
const meaningNames = { preserved: 'Смысл передан', partial: 'Смысл передан частично', changed: 'Смысл искажён', uncertain: 'Недостаточно данных' };
let catalog = [], study = emptyStudy(), selectedId = 'M01', materialFile = null, materialURL = null;
let activeAttempt = null, attemptStart = 0, dirty = false, fileTicket = 0, storageSaved = false;
const localVideos = new Map();
const allURLs = new Set();
let savedText = null;

function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function inform(message, error = false) { $('feedback').textContent = message; $('feedback').className = `feedback ${error ? 'error' : 'success'}`; $('feedback').hidden = false; }
function report(error) { inform(error instanceof Error ? error.message : String(error), true); }
function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach(button => button.toggleAttribute('aria-current', button.dataset.tab === name));
  document.querySelectorAll('[data-tab][aria-current]').forEach(button => button.setAttribute('aria-current', 'page'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.hidden = panel.id !== `tab-${name}`);
  for (const video of document.querySelectorAll('video')) if (video.closest('.tab-panel')?.hidden) video.pause();
}
function option(value, text) { const item = node('option', text); item.value = value; return item; }
function fillSelect(select, options, previous) {
  select.replaceChildren(...options.map(item => option(item[0], item[1])));
  if (options.some(item => item[0] === previous)) select.value = previous;
}
function persist() {
  if (!$('remember').checked) return;
  try {
    localStorage.setItem(storageKey, exportStudy(study));
    storageSaved = true;
    $('storage-status').textContent = 'Проект сохранён в этом браузере. Видео в него не входят. Для переноса скачайте JSON.';
  } catch {
    storageSaved = false;
    $('storage-status').textContent = 'Сохранить в браузере не удалось. Данные остались в открытой вкладке; скачайте JSON.';
    inform('Браузер не сохранил проект. Скачайте JSON перед закрытием вкладки.', true);
  }
}
function update(next) { study = next; dirty = true; storageSaved = false; persist(); render(); }
function download(text, filename, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = node('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function filename(suffix) { return `ravenstvo-pilot-${new Date().toISOString().slice(0, 10)}-${suffix}`; }
function formatBytes(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} МБ`; }
function dateText(value) { return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); }

function renderMessages() {
  const filter = $('message-filter').value.trim().toLocaleLowerCase('ru');
  const visible = catalog.filter(m => `${m.id} ${m.text} ${m.role} ${m.context}`.toLocaleLowerCase('ru').includes(filter));
  $('message-list').replaceChildren(...visible.map(message => {
    const button = node('button', undefined, 'message-card'); button.type = 'button';
    if (message.id === selectedId) button.setAttribute('aria-current', 'true');
    const records = study.materials.filter(m => m.expectedId === message.id), reviewed = records.filter(m => materialLanguage(study,m).status === 'approved').length;
    const body = node('div'); body.append(node('strong', message.text), node('small', records.length ? `${records.length} материалов · ${reviewed} с языковой проверкой` : 'Материалов пока нет · не проверено'));
    button.append(node('span', message.id), body);
    button.addEventListener('click', () => { selectedId = message.id; resetMaterialFile(); renderMessages(); renderSelected(); });
    return button;
  }));
  $('filter-empty').hidden = Boolean(visible.length);
}

function renderSelected() {
  const message = catalog.find(item => item.id === selectedId);
  $('selected-id').textContent = message.id; $('selected-role').textContent = message.role;
  $('selected-title').textContent = message.text; $('selected-context').textContent = message.context;
  const records = study.materials.filter(item => item.expectedId === selectedId);
  $('selected-status').textContent = records.length ? `В реестре: ${records.length}. Языковая проверка отмечена для ${records.filter(item => materialLanguage(study,item).status === 'approved').length}. Понятность оценивается отдельно.` : 'Материалов пока нет. Языковая проверка не проводилась.';
  $('selected-materials').replaceChildren();
  if (records.length) $('selected-materials').append(node('h4', 'Зарегистрированные материалы'));
  for (const record of records) {
    const row = node('article', `${record.participantCode} · ${splitNames[record.split]} · дубль ${record.take} · ${mediaNames[record.mediaType]}`);
    const language = materialLanguage(study,record);
    row.append(node('small', `${languageNames[language.status]}${language.reviewerCode ? ` · ${language.reviewerCode}` : ''}. ${record.video.duration.toFixed(1)} с, ${record.video.width} × ${record.video.height}.`));
    const checkButton = node('button', 'Добавить языковую проверку', 'quiet'); checkButton.type = 'button';
    checkButton.addEventListener('click', () => {
      $('language-material-id').value = record.id; $('language-material-title').textContent = `${record.participantCode} · ${record.expectedId} · дубль ${record.take}. ${record.expectedText}`;
      $('language-error').textContent = ''; $('language-reviewer').value = ''; $('language-notes').value = ''; $('language-dialog').showModal();
    });
    row.append(checkButton);
    $('selected-materials').append(row);
  }
}

function materialForAttempt() { return study.materials.find(item => item.id === $('attempt-material').value); }
function refreshAttemptMaterials() {
  if (activeAttempt) return;
  const media = $('attempt-medium').value;
  const materials = study.materials.filter(item => item.expectedId === $('attempt-message').value && item.mediaType === media);
  const options = materials.length ? materials.map(m => [m.id, `${m.participantCode} · дубль ${m.take} · ${splitNames[m.split]} · ${languageNames[materialLanguage(study,m).status]}`]) : [['', 'Для этого сообщения пока нет материалов']];
  fillSelect($('attempt-material'), options, $('attempt-material').value);
  $('attempt-material-label').hidden = media === 'live'; $('attempt-material').required = media !== 'live';
  $('attempt-video-area').hidden = media === 'live';
  refreshAttemptVideo();
}
function refreshAttemptVideo() {
  const material = activeAttempt ? study.materials.find(item => item.id === activeAttempt.materialId) : materialForAttempt();
  const url = material ? localVideos.get(material.id) : null;
  const video = $('attempt-video'); video.pause();
  if (url) { video.src = url; video.hidden = false; $('attempt-video-status').textContent = 'Локальный файл подключён; контрольная сумма совпадает с реестром.'; }
  else { video.removeAttribute('src'); video.load(); video.hidden = true; $('attempt-video-status').textContent = material ? 'Видео не входит в JSON. Подключите исходный файл, чтобы воспроизвести его.' : 'Сначала добавьте материал на первом этапе.'; }
  $('attach-attempt-video').disabled = !material;
  $('blind-view').disabled = !(activeAttempt?.kind === 'comprehension' && url);
  if (!activeAttempt && $('attempt-kind').value === 'recognition' && material) {
    $('attempt-participant').value = material.participantCode;
    $('attempt-split').value = material.split;
  }
}

function refreshReview() {
  const answers = study.attempts.filter(item => item.outcome === 'answered');
  fillSelect($('review-attempt'), answers.length ? answers.map(a => [a.id, `${a.participantCode} · ${a.expectedId} · попытка ${a.take} · ${kindNames[a.kind]}`]) : [['', 'Ответов для оценки пока нет']], $('review-attempt').value);
  $('save-review').disabled = !answers.length;
  const selected = answers.find(item => item.id === $('review-attempt').value);
  $('review-expected').textContent = selected?.expectedText ?? '—';
  $('review-original').textContent = selected?.response ?? 'Пока нет ответов для оценки.';
}

function renderJournal() {
  const summary = studySummary(study);
  $('journal-summary').textContent = `${summary.materials} материалов; ${summary.attempts} попыток, из них ${summary.firstAttempts} первых. Ответов: ${summary.answered}; отказов: ${summary.refused}; пропусков: ${summary.skipped}. Оценено ответов: ${summary.reviewed}. Отдельных независимых оценок: ${summary.independentReviews}.`;
  $('participant-groups').replaceChildren(...Object.keys(splitNames).map(split => {
    const group = node('div'), codes = study.participants.filter(p => p.split === split).map(p => p.code);
    group.append(node('strong', `${splitNames[split]} · ${codes.length}`), node('p', codes.join(', ') || 'Участников пока нет'));
    return group;
  }));
  const rows = [...study.attempts].reverse().map(attempt => {
    const row = node('tr'), first = node('td', `${attempt.participantCode} / ${splitNames[attempt.split]}`); first.append(node('small', dateText(attempt.startedAt)));
    const target = node('td', `${attempt.expectedId} / № ${attempt.take}`); target.append(node('small', attempt.expectedText));
    const outcome = node('td', `${kindNames[attempt.kind]} / ${outcomeNames[attempt.outcome]}`); outcome.append(node('small', `${mediaNames[attempt.mediaType]} · ${(attempt.elapsedMs / 1000).toFixed(1)} с`));
    const response = node('td', attempt.response || '—');
    const reviews = study.reviews.filter(item => item.attemptId === attempt.id);
    const assessed = node('td', reviews.length ? reviews.map(r => `${r.reviewerCode}: ${meaningNames[r.meaning]}${r.independent ? ' (отдельный проверяющий)' : ''}`).join('\n') : attempt.outcome === 'answered' ? 'Не оценено' : 'Без ответа');
    row.append(first, target, outcome, response, assessed); return row;
  });
  if (!rows.length) { const row = node('tr'), cell = node('td', 'Попыток пока нет. Здесь появятся исходные ответы, отказы и пропуски.'); cell.colSpan = 5; row.append(cell); rows.push(row); }
  $('journal-body').replaceChildren(...rows);
}

function render() {
  const summary = studySummary(study);
  $('metric-messages').replaceChildren(document.createTextNode(`${summary.coveredMessages} `), node('span', '/ 20'));
  $('metric-approved').textContent = summary.approvedMaterials; $('metric-attempts').textContent = summary.attempts;
  $('progress-caption').textContent = summary.materials || summary.attempts ? `Локальный проект: ${summary.participants} участников, ${summary.materials} материалов. Оценки внесены исследователем.` : 'Записей и результатов в этом проекте пока нет.';
  renderMessages(); renderSelected(); refreshAttemptMaterials(); refreshReview(); renderJournal();
}

function resetMaterialFile() {
  if (materialURL && ![...localVideos.values()].includes(materialURL)) { URL.revokeObjectURL(materialURL); allURLs.delete(materialURL); }
  fileTicket++; materialFile = null; materialURL = null; $('material-file').value = '';
  $('material-preview').pause(); $('material-preview').removeAttribute('src'); $('material-preview').load(); $('material-preview').hidden = true;
  $('material-file-status').textContent = '';
}
function clearVideos() {
  for (const video of document.querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
  allURLs.forEach(url => URL.revokeObjectURL(url)); allURLs.clear(); localVideos.clear(); resetMaterialFile();
}

async function inspectVideo(file) {
  if (!file || !file.size || file.size > 200 * 1024 * 1024) throw new Error('Выберите видео размером до 200 МБ.');
  if (file.type && !file.type.startsWith('video/')) throw new Error('Нужен видеофайл, который воспроизводится в браузере.');
  if (!crypto.subtle) throw new Error('Проверка видео требует HTTPS или локального сервера. Откройте опубликованную страницу.');
  const url = URL.createObjectURL(file); allURLs.add(url);
  const video = document.createElement('video'); video.preload = 'metadata';
  try {
    const metadata = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('Браузер не смог прочитать видео за 15 секунд. Попробуйте MP4 или WebM.')); }, 15000);
      video.onloadedmetadata = () => { clearTimeout(timeout); resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }); };
      video.onerror = () => { clearTimeout(timeout); reject(new Error('Этот видеофайл не воспроизводится. Попробуйте MP4 или WebM.')); };
      video.src = url;
    });
    if (!Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.duration > 600 || !metadata.width || !metadata.height) throw new Error('Нужна завершённая видеозапись длительностью до 10 минут.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { url, metadata: { ...metadata, bytes: file.size, sha256 } };
  } catch (error) { URL.revokeObjectURL(url); allURLs.delete(url); throw error; }
  finally { video.removeAttribute('src'); video.load(); }
}

function resetAttempt() {
  activeAttempt = null; $('attempt-settings').disabled = false; $('response-fields').disabled = true;
  $('attempt-state').textContent = 'Сначала выберите участника и задание.'; $('blind-view').disabled = true;
  $('attempt-response').value = ''; $('attempt-notes').value = ''; $('attempt-outcome').value = 'answered';
  $('attempt-response').disabled = false; $('attempt-consent').checked = false;
}
function completeAttempt(outcome, response, notes = '') {
  if (!activeAttempt) throw new Error('Сначала зафиксируйте задание.');
  const doneId = activeAttempt.id;
  const next = finishAttempt(study, catalog, activeAttempt, { outcome, response, notes, elapsedMs: performance.now() - attemptStart });
  resetAttempt(); update(next);
  $('review-attempt').value = doneId; refreshReview();
  inform('Исходная попытка сохранена. Её текст и задание останутся неизменными; оценку можно добавить отдельно.');
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
for (const field of document.querySelectorAll('input[autocapitalize="characters"]')) field.addEventListener('input', () => { field.value = field.value.toUpperCase(); });
$('message-filter').addEventListener('input', renderMessages);
$('material-language').addEventListener('change', () => { $('material-reviewer').required = $('material-language').value !== 'pending'; });
$('material-file').addEventListener('change', async () => {
  if (materialURL && ![...localVideos.values()].includes(materialURL)) { URL.revokeObjectURL(materialURL); allURLs.delete(materialURL); }
  const ticket = ++fileTicket; materialFile = null; materialURL = null; $('material-file-status').textContent = 'Проверяем видео и считаем контрольную сумму…'; $('material-preview').hidden = true;
  try {
    const result = await inspectVideo($('material-file').files[0]);
    if (ticket !== fileTicket) { URL.revokeObjectURL(result.url); allURLs.delete(result.url); return; }
    materialFile = result.metadata; materialURL = result.url; $('material-preview').src = result.url; $('material-preview').hidden = false;
    $('material-file-status').textContent = `${result.metadata.duration.toFixed(1)} с · ${result.metadata.width} × ${result.metadata.height} · ${formatBytes(result.metadata.bytes)}. Файл прочитан локально.`;
  } catch (error) { if (ticket === fileTicket) { $('material-file-status').textContent = error.message; report(error); } }
});

$('language-close').addEventListener('click', () => $('language-dialog').close());
$('language-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    update(addMaterialReview(study, { materialId: $('language-material-id').value, reviewerCode: $('language-reviewer').value.trim().toUpperCase(), status: $('language-status').value, notes: $('language-notes').value }));
    $('language-dialog').close(); inform('Языковая проверка добавлена к истории материала. Исходная запись не изменена.');
  } catch (error) { $('language-error').textContent = error.message; }
});
$('material-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const next = addMaterial(study, catalog, {
      participantCode: $('material-participant').value.trim().toUpperCase(), split: $('material-split').value,
      expectedId: selectedId, take: Number($('material-take').value), mediaType: $('material-type').value,
      video: materialFile, consent: $('material-consent').checked, languageStatus: $('material-language').value,
      reviewerCode: $('material-reviewer').value.trim().toUpperCase(), notes: $('material-notes').value,
    });
    localVideos.set(next.materials.at(-1).id, materialURL);
    $('material-take').value = Math.min(99, Number($('material-take').value) + 1);
    $('material-consent').checked = false; $('material-notes').value = ''; $('material-language').value = 'pending'; $('material-reviewer').value = ''; $('material-reviewer').required = false;
    resetMaterialFile(); update(next); inform('Материал добавлен. В проекте сохранены код, параметры и контрольная сумма; само видео храните отдельно.');
  } catch (error) { report(error); }
});

for (const key of ['attempt-message', 'attempt-medium', 'attempt-kind']) $(key).addEventListener('change', refreshAttemptMaterials);
$('attempt-material').addEventListener('change', refreshAttemptVideo);
$('attach-attempt-video').addEventListener('change', async () => {
  const expected = activeAttempt ? study.materials.find(item => item.id === activeAttempt.materialId) : materialForAttempt();
  if (!expected) return;
  $('attempt-video-status').textContent = 'Сверяем локальный файл с контрольной суммой…';
  try {
    const result = await inspectVideo($('attach-attempt-video').files[0]);
    if (result.metadata.sha256 !== expected.video.sha256) { URL.revokeObjectURL(result.url); allURLs.delete(result.url); throw new Error('Это другой видеофайл. Его контрольная сумма не совпадает с выбранным материалом.'); }
    localVideos.set(expected.id, result.url); refreshAttemptVideo();
  } catch (error) { $('attempt-video-status').textContent = error.message; report(error); }
  finally { $('attach-attempt-video').value = ''; }
});
$('assessment-setup').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const draft = beginAttempt(study, catalog, {
      participantCode: $('attempt-participant').value.trim().toUpperCase(), split: $('attempt-split').value,
      kind: $('attempt-kind').value, expectedId: $('attempt-message').value, take: Number($('attempt-take').value),
      mediaType: $('attempt-medium').value, materialId: $('attempt-medium').value === 'live' ? '' : $('attempt-material').value,
      consent: $('attempt-consent').checked,
    });
    activeAttempt = draft; attemptStart = performance.now(); $('attempt-settings').disabled = true; $('response-fields').disabled = false;
    $('attempt-state').textContent = `${draft.participantCode} · ${draft.expectedId} · попытка ${draft.take}. Задание зафиксировано. Сохраните ответ, отказ или пропуск.`;
    $('attempt-response').value = ''; $('attempt-notes').value = ''; refreshAttemptVideo();
  } catch (error) { report(error); }
});
$('attempt-outcome').addEventListener('change', () => {
  const answered = $('attempt-outcome').value === 'answered'; $('attempt-response').disabled = !answered;
  $('attempt-response').required = answered;
  // Do not discard an unsaved transcription when the researcher changes outcome.
});
$('response-form').addEventListener('submit', event => {
  event.preventDefault();
  try { completeAttempt($('attempt-outcome').value, $('attempt-outcome').value === 'answered' ? $('attempt-response').value : '', $('attempt-notes').value); }
  catch (error) { report(error); }
});

$('blind-view').addEventListener('click', () => {
  const url = activeAttempt && localVideos.get(activeAttempt.materialId);
  if (!url || activeAttempt.kind !== 'comprehension') return;
  $('attempt-video').pause(); $('blind-video').src = url; $('blind-response').value = ''; $('blind-error').textContent = ''; $('blind-dialog').showModal();
});
function finishBlind(outcome) {
  try { completeAttempt(outcome, outcome === 'answered' ? $('blind-response').value : '', 'Ответ зафиксирован на экране просмотра без русской подписи.'); $('blind-dialog').close(); }
  catch (error) { $('blind-error').textContent = error.message; }
}
$('blind-submit').addEventListener('click', () => finishBlind('answered'));
$('blind-refuse').addEventListener('click', () => finishBlind('refused'));
$('blind-skip').addEventListener('click', () => finishBlind('skipped'));
$('blind-close').addEventListener('click', () => $('blind-dialog').close());
$('blind-dialog').addEventListener('close', () => { $('blind-video').pause(); $('blind-video').removeAttribute('src'); $('blind-video').load(); });

$('review-attempt').addEventListener('change', refreshReview);
$('review-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    update(addReview(study, {
      attemptId: $('review-attempt').value, reviewerCode: $('review-code').value.trim().toUpperCase(), independent: $('review-independent').checked,
      meaning: $('review-meaning').value, polarity: $('review-polarity').value, question: $('review-question').value,
      correctedText: $('review-corrected').value, notes: $('review-notes').value,
    }));
    $('review-meaning').value = ''; $('review-polarity').value = ''; $('review-question').value = ''; $('review-corrected').value = ''; $('review-notes').value = ''; $('review-independent').checked = false;
    inform('Оценка сохранена отдельно. Исходный ответ не изменён. Другой проверяющий может добавить свою оценку.');
  } catch (error) { report(error); }
});

$('export-json').addEventListener('click', () => { download(exportStudy(study), filename('project.json'), 'application/json;charset=utf-8'); dirty = false; inform('Экспорт проекта подготовлен. Проверьте скачанный JSON; видеозаписи храните отдельно.'); });
$('export-attempts').addEventListener('click', () => download(attemptsCSV(study), filename('attempts.csv'), 'text/csv;charset=utf-8'));
$('export-materials').addEventListener('click', () => download(materialsCSV(study), filename('materials.csv'), 'text/csv;charset=utf-8'));
$('import-json').addEventListener('change', async () => {
  const file = $('import-json').files[0]; if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('Проект должен быть не больше 8 МБ.');
    const next = importStudy(await file.text(), catalog);
    if ((dirty || activeAttempt) && !confirm('Открыть другой проект? Текущие несохранённые изменения будут заменены. Сначала скачайте JSON, если они нужны.')) return;
    clearVideos(); resetAttempt(); study = next; dirty = false; persist(); render(); inform('Проект открыт. Видео подключают отдельно: файл должен совпадать с сохранённой контрольной суммой.');
  } catch (error) { report(error); }
  finally { $('import-json').value = ''; }
});
$('new-study').addEventListener('click', () => {
  if ((study.materials.length || study.attempts.length || activeAttempt) && !confirm('Начать пустой проект? Сначала скачайте JSON текущего проекта, если хотите продолжить его позже.')) return;
  clearVideos(); resetAttempt(); study = emptyStudy(); dirty = false; persist(); render(); inform('Создан пустой проект. Результатов и материалов в нём пока нет.');
});
$('remember').addEventListener('change', () => {
  if ($('remember').checked) { persist(); $('restore-banner').hidden = true; }
  else {
    storageSaved = false;
    try { localStorage.removeItem(storageKey); $('storage-status').textContent = 'Сохранённая копия удалена из браузера. Текущий проект остаётся в открытой вкладке.'; }
    catch { $('storage-status').textContent = 'Не удалось удалить сохранённую копию. Удалите данные сайта в настройках браузера.'; }
  }
});
$('restore-study').addEventListener('click', () => {
  try {
    const next = importStudy(savedText, catalog);
    if ((dirty || activeAttempt) && !confirm('Восстановить сохранённую копию вместо текущих несохранённых изменений?')) return;
    clearVideos(); resetAttempt(); study = next; dirty = false; $('remember').checked = true; $('restore-banner').hidden = true; persist(); render(); inform('Проект восстановлен. Видео не сохранялись в браузере; при необходимости подключите исходные файлы.');
  } catch (error) { report(error); }
});
$('forget-saved').addEventListener('click', () => {
  if (!confirm('Удалить сохранённую в браузере копию проекта? Открытая вкладка и скачанные файлы останутся.')) return;
  try { localStorage.removeItem(storageKey); savedText = null; storageSaved = false; $('restore-banner').hidden = true; $('remember').checked = false; inform('Сохранённая копия удалена. Текущий проект остался в открытой вкладке.'); }
  catch (error) { report(error); }
});
window.addEventListener('beforeunload', event => { if (activeAttempt || (dirty && !storageSaved)) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const video of document.querySelectorAll('video')) video.pause(); });

try {
  const response = await fetch('./assets/pilot-messages.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Не удалось загрузить 20 сообщений. Обновите страницу или проверьте соединение.');
  const source = await response.json(); catalog = validateCatalog(source.messages);
  fillSelect($('attempt-message'), catalog.map(item => [item.id, `${item.id} · ${item.text}`]));
  try { savedText = localStorage.getItem(storageKey); $('restore-banner').hidden = !savedText; } catch {}
  render(); $('loading').hidden = true; $('app-content').hidden = false;
} catch (error) { $('loading').textContent = error.message; $('loading').classList.add('error'); }
