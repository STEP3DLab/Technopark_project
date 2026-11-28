import {classify} from './recognizer.mjs';
import {Transcript, DRAFT_KEY, LOG_KEY, MAX_TEXT, readStored, writeStored, cleanLog, journalCsv, validateVideoFile} from './session.mjs';

const $ = id => document.getElementById(id);
const video = $('video');
const examples = {
  question: {label: 'вопрос'}, help: {label: 'помочь'}, outside: {label: 'дом'}
};
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const transcript = new Transcript(readStored(storage, DRAFT_KEY, ''));
let journal = cleanLog(readStored(storage, LOG_KEY, []));
let mode = 'example', revision = 0, controller = null, stream = null, fileUrl = null;
let model = null, detectorPromise = null, proposed = null, busy = false, modelLoading = false;
let suppressPlaybackError = false;

function status(message) { $('status').textContent = message; }
function current(token) {
  if (token !== revision || controller?.signal.aborted) throw new DOMException('Операция отменена', 'AbortError');
}
function resetOutput() {
  proposed = null;
  $('prediction').dataset.state = 'idle';
  $('result-label').textContent = 'Предполагаемое слово';
  $('word').textContent = 'Ждём ваш жест';
  $('detail').textContent = 'Здесь появится вариант распознавания. Добавляйте слово, только если оно верное.';
  $('truth').hidden = true; $('add').disabled = true; $('reject').disabled = true;
}
function hideCapture() {
  $('capture-overlay').hidden = true;
  $('capture-progress').value = 0;
  $('stage').classList.remove('recording');
}
function invalidate() {
  revision++; controller?.abort(); controller = null; busy = false; hideCapture();
}
function stopTracks() {
  const old = stream; stream = null;
  old?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
}
function clearFile() { if (fileUrl) URL.revokeObjectURL(fileUrl); fileUrl = null; }
function updateRun() {
  const labels = {example: 'Распознать пример', camera: stream ? 'Записать жест' : 'Включить камеру', file: 'Распознать видео'};
  $('run').textContent = modelLoading ? 'Загрузка словаря…' : busy ? 'Идёт обработка…' : !model ? 'Повторить загрузку' : labels[mode];
  $('run').disabled = busy || modelLoading || (Boolean(model) && mode === 'file' && !fileUrl);
  $('stop').hidden = mode !== 'camera' || !stream;
  $('duration').disabled = busy; $('stage').setAttribute('aria-busy', String(busy));
}
function clearVideo() {
  suppressPlaybackError = true; video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load();
  queueMicrotask(() => { suppressPlaybackError = false; });
}
function sampleSource() {
  const name = Object.hasOwn(examples, $('example').value) ? $('example').value : 'question';
  $('example').value = name;
  video.poster = './samples/' + name + '.jpg'; video.src = './samples/' + name + '.mp4';
  video.controls = true; video.load(); $('stage-empty').hidden = true;
  $('stage-state').textContent = 'Пример из Slovo';
  status('Посмотрите запись, затем запустите распознавание по сохранённым координатам рук.');
}
function setMode(next) {
  if (!['example', 'camera', 'file'].includes(next)) return;
  invalidate(); stopTracks(); clearFile(); clearVideo(); resetOutput(); mode = next;
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  for (const key of ['example', 'camera', 'file']) $(key + '-pane').hidden = key !== mode;
  $('stage').classList.toggle('live', mode === 'camera'); $('stage-empty').hidden = false;
  video.controls = mode !== 'camera'; $('file').value = '';
  $('file-info').textContent = 'До 10 секунд и 100 МБ. Один жест на видео.';
  if (mode === 'example') sampleSource();
  if (mode === 'camera') {
    $('empty-title').textContent = 'Покажите жест на камеру';
    $('empty-help').textContent = 'Встаньте так, чтобы обе руки и верхняя часть тела помещались в кадре.';
    $('stage-state').textContent = 'Камера выключена';
    status('Камера включается только с вашего разрешения. Микрофон не используется.');
  }
  if (mode === 'file') {
    $('empty-title').textContent = 'Откройте короткое видео';
    $('empty-help').textContent = 'Выберите запись одного жеста с телефона или компьютера.';
    $('stage-state').textContent = 'Видео с устройства';
    status('Видео обрабатывается на вашем устройстве и не отправляется на сервер.');
  }
  updateRun();
}
function delay(ms, token) {
  return new Promise((resolve, reject) => {
    const signal = controller?.signal;
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Операция отменена', 'AbortError')); };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      try { current(token); resolve(); } catch (error) { reject(error); }
    }, ms);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
  });
}
async function jsonAsset(path, signal) {
  const response = await fetch(path, {signal, cache: 'no-cache'});
  if (!response.ok) throw new Error('Не удалось загрузить словарь. Проверьте соединение и попробуйте ещё раз.');
  return response.json();
}
async function loadModel() {
  if (modelLoading) return;
  modelLoading = true; updateRun();
  try {
    const candidate = await jsonAsset('./assets/model.json', AbortSignal.timeout(20000));
    classify({aspect: 1, frames: Array.from({length: 16}, () => [])}, candidate);
    model = candidate;
    status(mode === 'example' ? 'Готово. Выберите пример или включите камеру.' : 'Словарь загружен. Можно начинать.');
  } catch (error) {
    status(error.name === 'TimeoutError' ? 'Загрузка заняла слишком много времени. Нажмите «Повторить загрузку».' : error.message);
  } finally { modelLoading = false; updateRun(); }
}
async function getDetector() {
  if (detectorPromise) return detectorPromise;
  let expired = false, timeoutId;
  const loading = (async () => {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2')) throw new Error('Этот браузер не поддерживает модуль распознавания. Попробуйте актуальный Chrome или Safari. Встроенные примеры и ввод текста доступны.');
    const {FilesetResolver, HandLandmarker} = await import('./vendor/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', import.meta.url).href);
    return HandLandmarker.createFromOptions(files, {
      canvas,
      baseOptions: {modelAssetPath: new URL('./vendor/models/hand_landmarker.task', import.meta.url).href, delegate: 'CPU'},
      runningMode: 'IMAGE', numHands: 2, minHandDetectionConfidence: .45, minHandPresenceConfidence: .45
    });
  })();
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      expired = true;
      reject(new Error('Загрузка модели заняла больше 40 секунд. Проверьте соединение и повторите попытку. Встроенные примеры доступны сразу.'));
    }, 40000);
  });
  // If the timeout wins, dispose a late instance rather than retaining its memory.
  loading.then(detector => { if (expired) { try { detector.close(); } catch {} } }).catch(() => {});
  detectorPromise = Promise.race([loading, timeout]).catch(error => {
    detectorPromise = null;
    if (expired || error.message?.startsWith('Этот браузер')) throw error;
    throw new Error('Модуль распознавания не загрузился. Проверьте соединение и попробуйте снова. Можно открыть встроенный пример или набрать текст.');
  }).finally(() => clearTimeout(timeoutId));
  return detectorPromise;
}
function waitEvent(target, event, token, trigger, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const signal = controller?.signal;
    const finish = error => {
      clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener('error', fail);
      signal?.removeEventListener('abort', abort); error ? reject(error) : resolve();
    };
    const done = () => { try { current(token); finish(); } catch (error) { finish(error); } };
    const fail = () => finish(new Error('Не удалось прочитать видео. Попробуйте MP4 с кодеком H.264 или другой короткий ролик.'));
    const abort = () => finish(new DOMException('Операция отменена', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Видео не ответило вовремя. Выберите файл ещё раз или повторите попытку.')), timeout);
    target.addEventListener(event, done, {once: true}); target.addEventListener('error', fail, {once: true});
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) { abort(); return; }
    try { trigger?.(); } catch (error) { finish(error); }
  });
}
async function enableCamera(token) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Для камеры откройте приложение по защищённой ссылке HTTPS в браузере.');
  status('Разрешите доступ к камере. Звук не используется.');
  const next = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}}, audio: false});
  if (token !== revision) { next.getTracks().forEach(track => track.stop()); current(token); }
  stream = next; video.srcObject = stream;
  try {
    await video.play(); current(token);
    if (video.readyState < 2) await waitEvent(video, 'loadeddata', token);
  } catch (error) { if (stream === next) stopTracks(); throw error; }
  next.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
    if (stream !== next) return;
    setMode('camera'); status('Камера отключилась. Нажмите «Включить камеру», чтобы продолжить.');
  }));
  $('stage-empty').hidden = true; $('stage-state').textContent = 'Камера включена';
  status('Готово. Нажмите «Записать жест»: после обратного отсчёта покажите одно слово.');
}
function makeCapture() {
  const aspect = video.videoWidth / video.videoHeight;
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('Не удалось получить кадр. Подождите и повторите попытку.');
  const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Браузер не смог подготовить кадры для распознавания.');
  return {aspect, canvas, context, take() {
    // Mirror is display-only CSS. The original video reaches the trained model.
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }};
}
async function captureVideo(token) {
  if (video.readyState < 2) await waitEvent(video, 'loadeddata', token);
  current(token);
  const capture = makeCapture(), images = [];
  if (mode === 'camera') {
    const seconds = [2, 3, 4].includes(Number($('duration').value)) ? Number($('duration').value) : 3;
    $('capture-overlay').hidden = false; $('capture-caption').textContent = 'Приготовьтесь'; $('capture-progress').hidden = true;
    for (let value = 3; value > 0; value--) {
      $('capture-number').textContent = String(value); status('Начало через ' + value + '. Подготовьте руки.');
      await delay(1000, token);
    }
    $('stage').classList.add('recording'); $('capture-caption').textContent = 'Покажите жест'; $('capture-progress').hidden = false;
    status('Покажите один жест сейчас. Держите руки в кадре.');
    const start = performance.now(), interval = seconds * 1000 / 16;
    for (let i = 0; i < 16; i++) {
      const target = start + (i + .5) * interval;
      await delay(Math.max(0, target - performance.now()), token);
      if (performance.now() - target > Math.max(350, interval * 2)) throw new Error('Запись прервалась: вкладка или устройство были заняты. Повторите жест, оставив приложение открытым.');
      images.push(capture.take());
      $('capture-number').textContent = String(Math.max(1, Math.ceil(seconds - (performance.now() - start) / 1000)));
      $('capture-progress').value = i + 1;
    }
  } else {
    if (!Number.isFinite(video.duration) || video.duration < .3 || video.duration > 10.05) throw new Error('Нужен фрагмент от 0,3 до 10 секунд с одним жестом. Обрежьте видео и выберите его снова.');
    video.pause();
    for (let i = 0; i < 16; i++) {
      current(token);
      const time = video.duration * (i + .5) / 16;
      status('Читаем видео: кадр ' + (i + 1) + ' из 16.');
      if (Math.abs(video.currentTime - time) > .0001) await waitEvent(video, 'seeked', token, () => { video.currentTime = time; });
      images.push(capture.take());
    }
  }
  hideCapture();
  return {...capture, images};
}
async function analyzeInput(token) {
  status('Подготовка распознавания. При первом запуске загружается модель…');
  const detector = await getDetector(); current(token);
  const capture = await captureVideo(token), frames = [];
  for (let index = 0; index < capture.images.length; index++) {
    current(token); status('Определяем положение рук: кадр ' + (index + 1) + ' из 16.');
    capture.context.putImageData(capture.images[index], 0, 0);
    let result;
    try { result = detector.detect(capture.canvas); }
    catch {
      detectorPromise = null; try { detector.close(); } catch { /* failed instance may already be closed */ }
      throw new Error('Модуль распознавания остановился. Повторите попытку. Слово не добавлено в текст.');
    }
    frames.push(result.landmarks.map((points, index) => ({side: result.handedness[index]?.[0]?.categoryName,
      landmarks: points.map(point => [point.x, point.y, point.z])})));
    await delay(0, token);
  }
  return classify({aspect: capture.aspect, frames}, model);
}
function saveJournal() { writeStored(storage, LOG_KEY, journal); renderJournal(); }
function recordAttempt(result, sample) {
  const entry = {time: new Date().toISOString(), source: mode, sample: sample || '', method: mode === 'example' ? 'stored_landmarks' : 'hand_landmarker',
    word: result.word, score: Number(result.score.toFixed(6)), visible_frames: result.valid,
    model_accepted: result.accepted, decision: result.accepted ? 'pending' : 'abstained'};
  journal.push(entry); journal = journal.slice(-100); saveJournal(); return entry;
}
function renderJournal() {
  if (!$('history-list')) return;
  $('history-list').replaceChildren();
  const sourceNames = {camera: 'Камера', file: 'Видеофайл', example: 'Пример'};
  const decisions = {pending: 'Не подтверждено', confirmed: 'Подтверждено', rejected: 'Отклонено', abstained: 'Модель воздержалась'};
  if (!journal.length) { const item = document.createElement('li'); item.textContent = 'Пока нет попыток распознавания.'; $('history-list').append(item); }
  for (const entry of journal.slice(-8).reverse()) {
    const item = document.createElement('li'), date = new Date(entry.time);
    const time = Number.isFinite(date.getTime()) ? date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) : '';
    item.textContent = [time, sourceNames[entry.source], entry.word, decisions[entry.decision]].filter(Boolean).join(' · ');
    $('history-list').append(item);
  }
  if ($('export-log')) $('export-log').disabled = !journal.length;
  if ($('clear-log')) $('clear-log').disabled = !journal.length;
}
function showResult(result, sample) {
  const entry = recordAttempt(result, sample);
  $('prediction').dataset.state = result.accepted ? 'accepted' : 'rejected';
  $('result-label').textContent = result.accepted ? 'Проверьте результат' : 'Не получилось выбрать слово';
  $('word').textContent = result.accepted ? result.word : 'Повторите жест';
  $('detail').textContent = result.accepted
    ? 'Это предполагаемое слово. Сверьте его с вашим жестом, прежде чем добавить в сообщение.'
    : result.valid < model.minFrames
      ? 'Руки видны слишком редко. Увеличьте расстояние до камеры, добавьте света и повторите жест.'
      : 'Модель не смогла выбрать слово из восьми знакомых жестов. Повторите жест или введите слово вручную.';
  if (sample) {
    $('truth').hidden = false;
    $('truth').textContent = 'Эталон в Slovo: «' + examples[sample].label + '».' + (sample === 'outside' ? ' Слова нет в словаре. Этот пример показывает, что модель может уверенно ошибиться.' : '');
  } else $('truth').hidden = true;
  proposed = result.accepted ? {word: result.word, entry} : null;
  $('add').disabled = !proposed; $('reject').disabled = !proposed;
  status(mode === 'example' ? 'Модель обработала сохранённые координаты рук из 16 кадров оригинала. Видео можно посмотреть отдельно.'
    : 'Готово. Руки обнаружены в ' + result.valid + ' из 16 кадров. Проверьте предполагаемое слово.');
  if (window.matchMedia('(max-width: 900px)').matches) {
    $('prediction').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
  }
}
function errorMessage(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Нет доступа к камере. Разрешите его в настройках сайта или выберите видео и встроенные примеры.';
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') return 'Камера не найдена. Можно загрузить видео или открыть встроенный пример.';
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') return 'Камера занята другим приложением. Закройте его и повторите попытку.';
  if (error.name === 'TimeoutError') return 'Загрузка заняла слишком много времени. Проверьте соединение и повторите попытку.';
  return error.message || 'Не удалось выполнить распознавание. Повторите попытку.';
}
async function run() {
  if (busy || modelLoading) return;
  if (!model) { await loadModel(); return; }
  invalidate(); const token = revision; controller = new AbortController(); busy = true; resetOutput(); updateRun();
  try {
    if (mode === 'camera' && !stream) {
      status('Подготавливаем распознавание. При первом запуске потребуется загрузка модели…');
      await getDetector(); current(token); await enableCamera(token); return;
    }
    const sample = $('example').value;
    const result = mode === 'example' ? classify(await jsonAsset('./samples/' + sample + '.json', controller.signal), model) : await analyzeInput(token);
    current(token); showResult(result, mode === 'example' ? sample : null);
  } catch (error) {
    if (error.name !== 'AbortError' && token === revision) {
      status(errorMessage(error)); $('result-label').textContent = 'Нужна ещё одна попытка'; $('word').textContent = 'Не удалось обработать';
      $('detail').textContent = 'Сообщение можно набрать вручную. Подробность ошибки показана под видео.'; $('prediction').dataset.state = 'rejected';
    }
  } finally { if (token === revision) { busy = false; hideCapture(); updateRun(); } }
}
function updateText() {
  $('transcript').value = transcript.text;
  const hasText = Boolean(transcript.text.trim());
  for (const id of ['copy', 'show', 'share', 'clear']) $(id).disabled = !hasText;
  $('undo').disabled = !transcript.history.length;
  $('draft-status').textContent = writeStored(storage, DRAFT_KEY, transcript.text) ? 'Черновик сохраняется на этом устройстве' : 'Черновик доступен до закрытия вкладки';
}
function copyFeedback(text) { $('copy-status').textContent = text; }
async function copyText() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(transcript.text); copyFeedback('Текст скопирован.');
  } catch { $('transcript').focus(); $('transcript').select(); copyFeedback('Текст выделен. Выберите «Копировать» в меню устройства.'); }
}

for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode));
for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click', () => {
  if (!Object.hasOwn(examples, button.dataset.example)) return;
  $('example').value = button.dataset.example; setMode('example');
  $('stage').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center'});
});
$('example').addEventListener('change', () => { invalidate(); resetOutput(); sampleSource(); updateRun(); });
$('file').addEventListener('change', () => {
  invalidate(); clearFile(); resetOutput(); clearVideo(); $('stage-empty').hidden = false;
  const file = $('file').files[0], error = validateVideoFile(file);
  if (error) { status(error); updateRun(); return; }
  fileUrl = URL.createObjectURL(file); video.src = fileUrl; video.load(); $('stage-empty').hidden = true;
  $('file-info').textContent = file.name + ' · ' + (file.size / 1024 / 1024).toLocaleString('ru-RU', {maximumFractionDigits: 1}) + ' МБ';
  status('Видео выбрано. Нажмите «Распознать видео».'); updateRun();
});
$('stop').addEventListener('click', () => setMode('camera'));
$('run').addEventListener('click', run);
video.addEventListener('error', () => {
  if (!suppressPlaybackError && !busy && video.hasAttribute('src')) status('Не удалось открыть видео. Для своего файла попробуйте MP4 или WebM. Встроенный пример можно распознать по сохранённым координатам.');
});
$('add').addEventListener('click', () => {
  if (!proposed) return;
  if (!transcript.append(proposed.word)) { copyFeedback('В сообщении уже 6000 символов. Сократите текст перед добавлением слова.'); return; }
  proposed.entry.decision = 'confirmed'; saveJournal(); const word = proposed.word; proposed = null;
  $('add').disabled = true; $('reject').disabled = true; $('result-label').textContent = 'Слово подтверждено';
  updateText(); copyFeedback('Добавлено: «' + word + '».');
});
$('reject').addEventListener('click', () => {
  if (!proposed) return;
  proposed.entry.decision = 'rejected'; saveJournal(); proposed = null;
  $('add').disabled = true; $('reject').disabled = true; $('prediction').dataset.state = 'rejected';
  $('result-label').textContent = 'Вариант отклонён'; $('detail').textContent = 'Слово не добавлено. Повторите жест из словаря или напишите сообщение вручную.';
});
$('transcript').maxLength = MAX_TEXT;
$('transcript').addEventListener('input', () => {
  transcript.replace($('transcript').value);
  const selection = [$('transcript').selectionStart, $('transcript').selectionEnd];
  updateText(); $('transcript').setSelectionRange(...selection); copyFeedback('');
});
$('undo').addEventListener('click', () => { if (transcript.undo()) { updateText(); copyFeedback('Последнее изменение отменено.'); } });
$('clear').addEventListener('click', () => { transcript.replace(''); updateText(); copyFeedback('Сообщение очищено. Действие можно отменить.'); });
$('copy').addEventListener('click', copyText);
$('share').addEventListener('click', async () => {
  if (!navigator.share) { await copyText(); return; }
  try { await navigator.share({text: transcript.text}); copyFeedback('Меню отправки открыто.'); }
  catch (error) { if (error.name !== 'AbortError') await copyText(); }
});
if (!navigator.share) $('share').textContent = 'Скопировать для отправки';
$('show').addEventListener('click', () => { $('shown-text').textContent = transcript.text; $('message-dialog').showModal(); });
$('close-show').addEventListener('click', () => $('message-dialog').close());
$('message-dialog').addEventListener('click', event => { if (event.target === $('message-dialog')) $('message-dialog').close(); });
$('export-log')?.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([journalCsv(journal)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'rsl-attempts-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
});
$('clear-log')?.addEventListener('click', () => { journal = []; saveJournal(); copyFeedback('Журнал проб очищен. Текст сообщения сохранён.'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'camera' && (stream || busy)) { setMode('camera'); status('Камера выключена, пока приложение было скрыто. Включите её, чтобы продолжить.'); }
});
window.addEventListener('pagehide', () => { invalidate(); stopTracks(); clearFile(); });
window.addEventListener('pageshow', event => { if (event.persisted) setMode(mode); });
updateText(); renderJournal(); setMode('example'); loadModel();
