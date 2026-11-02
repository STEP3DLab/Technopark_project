import { StudioScene } from './scene.js';
import { POSE_LIMITS, DEFAULT_POSE, createProject, validateProject, sampleTimeline,
  upsertKeyframe, removeKeyframe, toProgram, buildFrameSchedule, timeToFrame, stepFrameTime } from './motion.js';
import { restoreEditor, checkpointEditor, setDraftPose, commitDraft, discardDraft,
  undoEditor, redoEditor, serializeSession, restoreSession } from './editor.js';
import { buildZip } from './zip.js';

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const STORAGE_KEY = 'rgsu-vgik-motion-studio-v1';
const MAX_FRAMES = 360;
const JOINTS = [['base', 'Основание'], ['shoulder', 'Плечо'], ['elbow', 'Локоть'],
  ['wrist', 'Запястье'], ['tilt', 'Наклон камеры'], ['roll', 'Крен камеры']];
const PRESET_LABELS = { orbit: 'Облёт объекта', dolly: 'Плавный наезд', crane: 'Подъём камеры' };
const initialProject = createProject();
const state = {
  project: initialProject, pose: sampleTimeline(initialProject.keyframes, 0), time: 0,
  selected: initialProject.keyframes[0].id, dirty: false, draftOrigin: null,
  history: [], future: [], activePreset: 'orbit',
  scene: null, engineStatus: 'loading', playing: false,
  playbackTime: 0, playbackClock: 0, capturing: false, captureToken: 0,
  captures: [], captureProject: null, captureMode: null, previousTake: null,
  previewClock: 0, previewAnimation: null, storageOK: true,
};
let toastTimer, lastRender = 0, lastUI = 0, cachedScheduleKey = '', cachedSchedule;
let cachedAssessmentKey = '', cachedAssessment;

function toast(message, error = false) {
  $('toast').querySelector('span').textContent = message;
  $('toast').classList.toggle('error', error); $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), error ? 6000 : 3200);
}
function schedule(project = state.project) {
  const key = `${project.duration}/${project.fps}`;
  if (key !== cachedScheduleKey) { cachedScheduleKey = key; cachedSchedule = buildFrameSchedule(project); }
  return cachedSchedule;
}
function sample(time, project = state.project) {
  return sampleTimeline(project.keyframes, time, { easing: project.easing });
}
function formatSeconds(value) { return Number(value.toFixed(3)).toLocaleString('ru-RU', { maximumFractionDigits: 3 }); }
function save() {
  try { localStorage.setItem(STORAGE_KEY, serializeSession(state)); state.storageOK = true; }
  catch { state.storageOK = false; }
  const label = state.storageOK
    ? state.dirty ? 'Черновик позы сохранён' : 'Проект сохранён в этом браузере'
    : 'Автосохранение недоступно · сохраните JSON';
  $('save-status').replaceChildren();
  const dot = document.createElement('span'); dot.className = 'live-dot';
  $('save-status').append(dot, document.createTextNode(label));
}
function syncHistoryUI() {
  $('undo-button').disabled = !state.dirty && !state.history.length;
  $('redo-button').disabled = !state.future.length;
}
function syncDraftUI() {
  $('dirty-note').classList.toggle('active', state.dirty);
  $('dirty-note').textContent = state.dirty
    ? 'Поза изменена. При переходе по шкале ключ запишется автоматически.'
    : 'Выберите время на шкале и настройте позу.';
  $('discard-draft').hidden = !state.dirty; syncHistoryUI();
}
function updatePoseControls({ preserveNumber = null } = {}) {
  for (const [key] of JOINTS) {
    const value = Math.round(state.pose[key] * 10) / 10;
    $(`joint-${key}`).value = value;
    if ($(`value-${key}`) !== preserveNumber) $(`value-${key}`).value = value;
  }
  $('focal').value = state.pose.focal; $('focal-value').textContent = `${Math.round(state.pose.focal)} мм`;
  $('monitor-lens').textContent = `${Math.round(state.pose.focal)} mm`;
  $('subject').value = state.pose.subject; $('subject-value').textContent = `${Math.round(state.pose.subject)}%`;
}
function selectKey(id) {
  state.selected = id;
  $$('.keyframe-dot').forEach(button => {
    button.classList.toggle('selected', button.dataset.id === id);
    button.setAttribute('aria-pressed', String(button.dataset.id === id));
  });
  const index = state.project.keyframes.findIndex(key => key.id === id);
  $('selected-key-label').textContent = index < 0
    ? `Новая поза · ${formatSeconds(state.time)} с`
    : `Ключ ${String(index + 1).padStart(2, '0')} · ${formatSeconds(state.project.keyframes[index].time)} с`;
  $('delete-key').disabled = !id || state.project.keyframes.length <= 1 || state.playing;
  $('key-time-input').disabled = index < 0 || state.playing;
  $('move-key-button').disabled = index < 0 || state.playing;
  $('key-time-input').max = state.project.duration;
  if (document.activeElement !== $('key-time-input')) $('key-time-input').value = index < 0 ? '' : state.project.keyframes[index].time;
}
function syncSelection() {
  const key = state.project.keyframes.find(point => Math.abs(point.time - state.time) < 1e-6);
  selectKey(key?.id ?? null);
}
function updateTimeUI() {
  const minutes = Math.floor(state.time / 60), seconds = Math.floor(state.time % 60);
  const hundredths = Math.floor((state.time % 1) * 100 + 1e-7);
  $('time-display').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  const frame = timeToFrame(state.project, state.time) + 1, count = schedule().count;
  $('frame-display').textContent = `КАДР ${String(frame).padStart(3, '0')} / ${String(count).padStart(3, '0')}`;
  $('monitor-frame-label').textContent = state.time >= state.project.duration - 1e-7 ? 'КОНЕЧНАЯ ПОЗА' : `КАДР ${String(frame).padStart(3, '0')}`;
  $('timeline-scrubber').value = state.time;
  $('timeline-scrubber').setAttribute('aria-valuetext', `${formatSeconds(state.time)} секунд, кадр ${frame} из ${count}`);
  $('playhead').style.left = `${state.time / state.project.duration * 100}%`;
  const position = state.scene?.getCameraPosition();
  for (const axis of ['x', 'y', 'z']) $(`coord-${axis}`).textContent = position ? position[axis].toFixed(2) : '—';
}
function applyCurrentPose({ preserveNumber = null } = {}) {
  state.scene?.setPose(state.pose); updatePoseControls({ preserveNumber }); updateTimeUI(); syncDraftUI();
}
function displayAssessment(assessment) {
  const issues = assessment?.issues ?? [];
  $('studio-health').hidden = !issues.length;
  $('studio-health').classList.toggle('error', assessment?.valid === false);
  $('studio-health').textContent = issues.slice(0, 2).map(issue => issue.message).join(' · ');
}
function assessCurrentPose() {
  if (state.engineStatus !== 'ready') { $('studio-health').hidden = true; return null; }
  const assessment = state.scene.assessPose(state.pose); displayAssessment(assessment); return assessment;
}
function rebuildPath() {
  cachedAssessmentKey = '';
  if (state.engineStatus !== 'ready') return;
  state.scene.setPath(Array.from({ length: 65 }, (_, i) => sample(i / 64 * state.project.duration)));
  state.scene.setPose(state.pose);
}
function drawTimeline() {
  $('keyframes').replaceChildren();
  state.project.keyframes.forEach((key, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'keyframe-dot';
    button.dataset.id = key.id; button.style.left = `${key.time / state.project.duration * 100}%`;
    button.setAttribute('aria-label', `Ключ ${index + 1}, ${formatSeconds(key.time)} секунд`);
    button.title = `Ключ ${index + 1} · ${formatSeconds(key.time)} с`;
    button.addEventListener('click', () => navigateTime(key.time)); $('keyframes').appendChild(button);
  });
  $('timeline-ruler').replaceChildren();
  for (let index = 0; index <= 4; index++) {
    const mark = document.createElement('span'); mark.textContent = `${formatSeconds(index * state.project.duration / 4)} с`;
    $('timeline-ruler').appendChild(mark);
  }
  $('timeline-scrubber').max = state.project.duration; $('timeline-scrubber').step = 'any';
  $('duration-input').min = 1; $('duration-input').max = 120; $('duration-input').step = '.01'; $('duration-input').value = state.project.duration;
  if (![...$('fps-select').options].some(option => Number(option.value) === state.project.fps)) $('fps-select').add(new Option(`${state.project.fps} кадр/с`, String(state.project.fps)));
  $('fps-select').value = state.project.fps; $('easing-select').value = state.project.easing;
  $('key-count').textContent = `${state.project.keyframes.length} ключевых поз`;
  const frames = schedule();
  $('timeline-frame-summary').textContent = `${frames.count} кадров · ${formatSeconds(frames.playbackDuration)} с${frames.quantized ? ' в клипе' : ''}`;
  $('timeline-frame-summary').title = frames.quantized ? `Длина программы ${formatSeconds(frames.requestedDuration)} с округлена до целого числа кадров.` : 'Длительность снятого клипа';
  rebuildPath(); updateTimeUI(); selectKey(state.selected);
}
function syncSettings() {
  const settings = state.project.settings;
  if (state.engineStatus === 'ready') {
    state.scene.setSubjectType(settings.subjectType); state.scene.setLighting(settings.lighting);
    state.scene.setAutoAim(settings.autoAim);
    state.scene.setHelpers({ grid: settings.grid, path: settings.path, frustum: settings.frustum });
  }
  $('lighting-select').value = settings.lighting; $('autoaim-toggle').checked = settings.autoAim;
  $('tracking-description').textContent = settings.autoAim ? 'Запястье задаёт смещение от направления на объект' : 'Камера следует поворотам звеньев и запястья';
  $$('.scene-card').forEach(button => {
    const active = button.dataset.subject === settings.subjectType;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  for (const key of ['grid', 'path', 'frustum']) $(`${key}-toggle`).checked = settings[key];
  for (const [key, label] of JOINTS.slice(3)) $(`label-${key}`).textContent = settings.autoAim ? `${label} · сдвиг` : label;
  $$('.preset').forEach(button => button.classList.toggle('active', button.dataset.preset === state.activePreset));
}
function syncEditor({ assess = true } = {}) {
  syncSettings(); drawTimeline(); applyCurrentPose(); $('project-name').value = state.project.name;
  if (assess) assessCurrentPose(); save();
}
function commitPendingPose({ announce = false, force = false } = {}) {
  if (!state.dirty && !force) return true;
  const assessment = assessCurrentPose();
  if (assessment?.valid === false) {
    toast(`${assessment.issues.find(item => item.severity === 'error')?.message ?? 'Поза вне рабочей зоны'}. Измените позу или отмените правку.`, true); return false;
  }
  try {
    commitDraft(state, { id: `key-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}` });
    syncEditor(); if (announce) toast(`Ключ записан · ${formatSeconds(state.time)} с`); return !state.dirty;
  } catch (error) { toast(error.message, true); syncDraftUI(); save(); return false; }
}
function saveKey() {
  if (state.capturing) return; pausePlayback(); commitPendingPose({ announce: true, force: true });
}
function seekRaw(time) {
  state.time = clamp(Number(time) || 0, 0, state.project.duration); state.pose = sample(state.time);
  state.dirty = false; state.draftOrigin = null; applyCurrentPose(); syncSelection(); assessCurrentPose();
}
function navigateTime(time) {
  if (state.capturing) return;
  pausePlayback(); if (!commitPendingPose()) { updateTimeUI(); return; }
  seekRaw(time); save();
}
function poseChange(key, value, preserveNumber = null) {
  if (state.capturing) return;
  pausePlayback(); const number = Number(value);
  if (!Number.isFinite(number)) { updatePoseControls(); return; }
  setDraftPose(state, { ...state.pose, [key]: number }); applyCurrentPose({ preserveNumber }); assessCurrentPose(); save();
}
function programAssessment() {
  if (state.engineStatus !== 'ready') return null;
  const signature = JSON.stringify(state.project);
  if (signature === cachedAssessmentKey) return cachedAssessment;
  const frames = schedule(), times = new Set([0, state.project.duration, ...state.project.keyframes.map(key => key.time)]);
  const samples = Math.min(480, Math.max(60, Math.ceil(state.project.duration * 24)));
  for (let index = 0; index <= samples; index++) times.add(index / samples * state.project.duration);
  if (frames.count <= MAX_FRAMES) frames.times.forEach(time => times.add(time));
  const sortedTimes = [...times].sort((a, b) => a - b);
  const report = state.scene.analyzeProgram(sortedTimes.map(time => sample(time)));
  if (Number.isInteger(report.firstInvalidIndex)) report.firstInvalidTime = sortedTimes[report.firstInvalidIndex];
  cachedAssessmentKey = signature; cachedAssessment = report; return report;
}
function canRunProgram() {
  if (!commitPendingPose()) return false;
  const report = programAssessment();
  if (report?.valid === false) {
    displayAssessment(report); toast(`Движение выходит из рабочей зоны около ${formatSeconds(report.firstInvalidTime ?? 0)} с. Скорректируйте ключевые позы.`, true); return false;
  }
  return true;
}
function updatePlaybackControls() {
  const ready = state.engineStatus === 'ready'; document.body.classList.toggle('is-playing', state.playing);
  $('monitor-signal').innerHTML = ready ? '<i></i>LIVE' : 'НЕТ СИГНАЛА';
  $('play-button').disabled = !ready || state.capturing; $('demo-button').disabled = !ready || state.capturing;
  $('play-button').setAttribute('aria-label', state.playing ? 'Пауза' : 'Воспроизвести');
  $('play-button').querySelector('use').setAttribute('href', state.playing ? '#i-pause' : '#i-play');
  $('demo-button').querySelector('span').textContent = state.playing ? 'Пауза' : 'Запустить демо';
  $('demo-button').querySelector('use').setAttribute('href', state.playing ? '#i-pause' : '#i-play');
  $('capture-button').disabled = !ready || state.capturing; $('capture-sequence').disabled = !ready && !state.capturing;
  $('scene-status').textContent = state.engineStatus === 'error' ? '3D НЕДОСТУПНА' : state.engineStatus === 'loading' ? 'ЗАГРУЗКА СТУДИИ' : state.capturing ? 'СЪЁМКА КАДРОВ' : state.playing ? 'ДВИЖЕНИЕ КАМЕРЫ' : 'СТУДИЯ ГОТОВА';
}
function updatePlaybackAt(now) {
  state.time = Math.min(state.project.duration, state.playbackTime + (now - state.playbackClock) / 1000);
  state.pose = sample(state.time); state.scene?.setPose(state.pose);
}
function pausePlayback() {
  if (!state.playing) return;
  updatePlaybackAt(performance.now()); state.playing = false;
  applyCurrentPose(); syncSelection(); updatePlaybackControls(); assessCurrentPose(); save();
}
function togglePlayback() {
  if (state.capturing || state.engineStatus !== 'ready') return;
  if (state.playing) { pausePlayback(); return; }
  if (!canRunProgram()) return;
  if (state.time >= state.project.duration - 1e-7) seekRaw(0);
  state.playbackTime = state.time; state.playbackClock = performance.now(); state.playing = true;
  updatePlaybackControls(); selectKey(state.selected);
}
function applyPreset(name) {
  if (state.capturing) return;
  pausePlayback(); checkpointEditor(state); const base = { ...DEFAULT_POSE, focal: 20 };
  const poses = name === 'dolly' ? [
    { ...base, base: -7, shoulder: 12, elbow: 75, subject: 0 },
    { ...base, base: -7, shoulder: 25, elbow: 65, subject: 50 },
    { ...base, base: -7, shoulder: 40, elbow: 55, subject: 100 },
  ] : name === 'crane' ? [
    { ...base, base: 12, shoulder: 50, elbow: 80, subject: 0 },
    { ...base, base: 6, shoulder: 35, elbow: 60, subject: 50 },
    { ...base, base: 0, shoulder: 15, elbow: 65, subject: 100 },
  ] : [{ ...base, base: -22, subject: 0 }, { ...base, base: 0, subject: 50 }, { ...base, base: 22, subject: 100 }];
  state.project.keyframes = poses.map((pose, index) => ({ id: `${name}-${index + 1}`, time: index * state.project.duration / 2, pose }));
  state.project.settings.autoAim = true; state.project.easing = 'smooth'; state.activePreset = name;
  seekRaw(0); syncEditor(); toast(`${PRESET_LABELS[name]} · прежнее состояние доступно через «Отменить»`);
}
function changeSetting(key, value) {
  if (state.capturing) return;
  pausePlayback(); if (!commitPendingPose()) { syncSettings(); return; }
  checkpointEditor(state); state.project.settings[key] = value; syncEditor();
}
function moveSelectedKey() {
  if (state.capturing || !state.selected) return;
  const time = Number($('key-time-input').value);
  if (!Number.isFinite(time) || time < 0 || time > state.project.duration) { toast('Укажите время ключа в пределах программы.', true); return; }
  if (!commitPendingPose()) return;
  const key = state.project.keyframes.find(point => point.id === state.selected); if (!key) return;
  if (state.project.keyframes.some(point => point.id !== key.id && Math.abs(point.time - time) < 1e-6)) { toast('В этой точке уже есть ключ. Выберите другое время.', true); return; }
  const next = upsertKeyframe(state.project.keyframes, { ...key, time });
  checkpointEditor(state); state.project.keyframes = next; state.activePreset = null;
  seekRaw(time); syncEditor(); toast(`Ключ перемещён на ${formatSeconds(time)} с`);
}
function historyAction(direction) {
  if (state.capturing) return; pausePlayback();
  if (direction < 0 ? undoEditor(state) : redoEditor(state)) { syncEditor(); toast(direction < 0 ? 'Действие отменено' : 'Действие повторено'); }
}
function openDialog(id) { pausePlayback(); $(id).showModal(); }
function showProgram() {
  if (state.capturing || !canRunProgram()) return;
  $('program-text').value = toProgram(state.project); openDialog('program-dialog');
}
function filename(project = state.project) {
  return project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70) || 'rgsu-vgik';
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function currentTake() { return { captures: state.captures.slice(), project: state.captureProject ? clone(state.captureProject) : null, mode: state.captureMode }; }
function rememberTake() { if (state.captures.length) state.previousTake = currentTake(); }
function restoreTake() {
  if (state.capturing || !state.previousTake) return;
  stopPreview(); const previous = state.previousTake; state.previousTake = state.captures.length ? currentTake() : null;
  state.captures = previous.captures; state.captureProject = previous.project; state.captureMode = previous.mode;
  renderGallery(); showCaptured(0); toast('Предыдущий дубль восстановлен');
}
function stopPreview() {
  if (state.previewAnimation !== null) cancelAnimationFrame(state.previewAnimation);
  state.previewAnimation = null; $('play-captures').innerHTML = '<svg><use href="#i-play"/></svg>Просмотреть';
}
function togglePreview() {
  if (state.capturing || !state.captures.length) return;
  if (state.previewAnimation !== null) { stopPreview(); return; }
  state.previewClock = performance.now(); $('play-captures').innerHTML = '<svg><use href="#i-pause"/></svg>Пауза';
  const fps = state.captureProject?.fps ?? state.project.fps;
  const tick = now => {
    showCaptured(Math.floor((now - state.previewClock) / 1000 * fps) % state.captures.length);
    state.previewAnimation = requestAnimationFrame(tick);
  };
  state.previewAnimation = requestAnimationFrame(tick);
}
function syncCaptureControls() {
  const empty = !state.captures.length;
  for (const id of ['play-captures', 'download-frames', 'clear-frames']) $(id).disabled = state.capturing || empty;
  $('restore-take').disabled = state.capturing || !state.previousTake;
  $('workspace').inert = state.capturing; document.querySelector('.topbar').inert = state.capturing;
  updatePlaybackControls();
}
function renderGallery() {
  const count = state.captures.length, fps = state.captureProject?.fps ?? state.project.fps;
  $('capture-count').textContent = count; $('gallery-count').textContent = count; $('gallery-empty').hidden = count > 0;
  $('take-summary').textContent = count ? `${state.captureMode === 'manual' ? 'Ручной дубль' : 'Программа'} · ${count} кадров · ${fps} кадр/с · ${formatSeconds(count / fps)} с` : 'Снимите отдельные кадры или всю программу';
  $('frames-gallery').replaceChildren(); const fragment = document.createDocumentFragment();
  state.captures.forEach((frame, index) => {
    const button = document.createElement('button'); button.className = 'frame-card'; button.type = 'button';
    button.setAttribute('aria-label', `Просмотреть снятый кадр ${index + 1}`); button.disabled = state.capturing;
    const img = document.createElement('img'); img.src = frame.url; img.alt = `Кадр ${index + 1}`; img.loading = 'lazy';
    const caption = document.createElement('span'); caption.textContent = `${String(index + 1).padStart(3, '0')}   ${formatSeconds(frame.time)} с`;
    button.append(img, caption); button.addEventListener('click', () => { if (!state.capturing) { stopPreview(); showCaptured(index); } }); fragment.appendChild(button);
  });
  $('frames-gallery').appendChild(fragment); syncCaptureControls();
}
function showCaptured(index) {
  const frame = state.captures[index]; if (!frame) return;
  $('capture-preview').hidden = false; $('capture-preview-image').src = frame.url;
  $('capture-preview-counter').textContent = `Кадр ${index + 1} / ${state.captures.length} · ${formatSeconds(frame.time)} с`;
}
function captureOne() {
  if (state.capturing || state.engineStatus !== 'ready') return; pausePlayback();
  if (assessCurrentPose()?.valid === false) { toast('Камера вне рабочей зоны. Скорректируйте позу перед съёмкой.', true); return; }
  const newTake = state.captureMode !== 'manual' || (state.captureProject && state.captureProject.fps !== state.project.fps);
  if (!newTake && state.captures.length >= MAX_FRAMES) { toast('В дубле уже 360 кадров. Скачайте его и начните новый.', true); return; }
  try {
    const frame = { url: state.scene.captureFrame(), time: state.time, pose: clone(state.pose), settings: clone(state.project.settings) };
    if (newTake) { rememberTake(); state.captures = []; state.captureProject = clone(state.project); state.captureMode = 'manual'; }
    if (!state.captureProject) state.captureProject = clone(state.project);
    state.captures = [...state.captures, frame]; renderGallery(); toast(`Кадр ${state.captures.length} снят${newTake && state.previousTake ? ' · прежний дубль можно восстановить' : ''}`);
  } catch (error) { toast(`Не удалось снять кадр: ${error.message}`, true); }
}
async function captureSequence() {
  if (state.capturing) { state.captureToken++; return; }
  if (state.engineStatus !== 'ready' || !canRunProgram()) return;
  const frameSchedule = buildFrameSchedule(state.project);
  if (frameSchedule.count > MAX_FRAMES) { toast(`В программе ${frameSchedule.count} кадров. Для одного прохода доступно 360: уменьшите длительность или частоту.`, true); return; }
  pausePlayback(); stopPreview(); state.capturing = true; const token = ++state.captureToken;
  const savedTime = state.time, savedPose = clone(state.pose), capturedProject = clone(state.project), frames = [];
  $('capture-sequence').textContent = 'Остановить съёмку'; $('capture-progress').hidden = false;
  $('capture-progress').max = frameSchedule.count; $('capture-progress').value = 0; $('capture-preview').hidden = false;
  document.body.classList.add('is-capturing'); syncCaptureControls(); $$('.frame-card').forEach(button => button.disabled = true);
  try {
    state.scene.beginCapture?.();
    for (let index = 0; index < frameSchedule.count; index++) {
      if (token !== state.captureToken || state.engineStatus !== 'ready') break;
      const time = frameSchedule.times[index], pose = sample(time, capturedProject); state.scene.setPose(pose);
      const url = state.scene.captureFrame(); frames.push({ url, time, pose, settings: clone(capturedProject.settings) });
      $('capture-preview-image').src = url; $('capture-preview-counter').textContent = `Съёмка ${index + 1} / ${frameSchedule.count}`;
      $('capture-progress').value = index + 1; await new Promise(requestAnimationFrame);
    }
    if (token === state.captureToken && frames.length === frameSchedule.count) {
      rememberTake(); state.captures = frames; state.captureProject = capturedProject; state.captureMode = 'sequence';
      showCaptured(0); toast(`Дубль готов: ${frames.length} кадров · ${formatSeconds(frameSchedule.playbackDuration)} с`);
    } else toast('Съёмка остановлена. Предыдущий дубль сохранён.');
  } catch (error) { toast(`Съёмка прервана. Предыдущий дубль сохранён. ${error.message}`, true); }
  finally {
    try { state.scene?.endCapture?.(); } catch { /* Context recovery is handled by the recovery panel. */ }
    state.capturing = false; document.body.classList.remove('is-capturing'); $('capture-progress').hidden = true;
    $('capture-sequence').innerHTML = '<svg><use href="#i-film"/></svg>Снять всю программу';
    state.time = savedTime; state.pose = savedPose; applyCurrentPose(); assessCurrentPose();
    $('capture-preview').hidden = !state.captures.length; if (state.captures.length) showCaptured(0); renderGallery();
  }
}
async function downloadFrames() {
  if (state.capturing || !state.captures.length) return;
  const button = $('download-frames'); button.disabled = true;
  const capturedProject = clone(state.captureProject ?? state.project), frames = state.captures.slice(), mode = state.captureMode;
  try {
    const files = frames.map((frame, index) => {
      const binary = atob(frame.url.split(',')[1]), data = new Uint8Array(binary.length);
      for (let byte = 0; byte < binary.length; byte++) data[byte] = binary.charCodeAt(byte);
      return { name: `frames/frame-${String(index + 1).padStart(4, '0')}.png`, data };
    });
    files.push({ name: 'project.json', data: JSON.stringify(capturedProject, null, 2) });
    files.push({ name: 'captures.json', data: JSON.stringify({ version: 2, mode, fps: capturedProject.fps,
      timelineDuration: capturedProject.duration, playbackDuration: frames.length / capturedProject.fps,
      frames: frames.map(({ time, pose, settings }, index) => ({ frame: index + 1, time, pose, settings })) }, null, 2) });
    files.push({ name: 'frames.csv', data: 'frame,time_seconds\n' + frames.map((frame, index) => `${index + 1},${frame.time.toFixed(9)}`).join('\n') });
    files.push({ name: 'README.txt', data: `РГСУ × ВГИК · КАДР\n${capturedProject.name}\n${frames.length} PNG-кадров 1280×720.\nТип дубля: ${mode === 'manual' ? 'ручная съёмка' : 'съёмка программы'}.\nЧастота: ${capturedProject.fps} кадров/с.\nДлительность клипа: ${formatSeconds(frames.length / capturedProject.fps)} с.\nДлительность временной шкалы проекта: ${formatSeconds(capturedProject.duration)} с.\nДополнительный конечный кадр не добавляется. При дробной длительности клип округляется до целого числа кадров.\nВ captures.json записаны фактические позы и настройки каждого изображения; frames.csv содержит время съёмки.\nproject.json — сохранённый проект начала дубля, откройте его через меню «Проект».\nhttps://step3dlab.github.io/Technopark_project/vgik-motion-lab/\n` });
    download(await buildZip(files), `${filename(capturedProject)}-frames.zip`); toast(`Архив готов · ${frames.length} кадров`);
  } catch (error) { toast(`Не удалось подготовить архив: ${error.message}`, true); }
  finally { syncCaptureControls(); }
}
function engineError(message) {
  state.playing = false; state.engineStatus = 'error'; state.captureToken++;
  $('loading').hidden = true; $('stage-error').hidden = false; $('stage-error-message').textContent = message;
  $('stage-error').querySelector('h2').textContent = '3D-просмотр недоступен';
  $('studio-health').hidden = true; syncSelection(); updatePlaybackControls(); save();
}
async function initializeScene() {
  if (state.capturing) return; pausePlayback();
  try { state.scene?.dispose(); } catch { /* A partially initialized renderer can already be gone. */ }
  state.scene = null; state.engineStatus = 'loading'; $('loading').hidden = false; $('stage-error').hidden = true;
  $('retry-scene').disabled = true; updatePlaybackControls();
  try {
    state.scene = new StudioScene({ viewport: $('viewport'), monitor: $('monitor'), onStatus: event => {
      if (event.type === 'error') engineError('Графическая сцена остановилась. Проект и черновик сохранены. Нажмите «Запустить снова», чтобы восстановить просмотр.');
      if (event.type === 'ready' && state.scene && !state.scene.contextLost) {
        state.engineStatus = 'ready'; $('loading').hidden = true; $('stage-error').hidden = true;
        if (!state.capturing) syncEditor(); updatePlaybackControls();
      }
    } });
    state.engineStatus = 'ready'; $('loading').hidden = true; $('stage-error').hidden = true;
    syncEditor(); updatePlaybackControls(); state.scene.render();
  } catch (error) {
    engineError('В этом браузере недоступна 3D-графика WebGL 2. Ключевые позы, проект и экспорт JSON остаются доступны. Для просмотра сцены откройте студию в браузере с включённой аппаратной графикой или повторите запуск.');
    console.error('Не удалось запустить 3D:', error);
  } finally { $('retry-scene').disabled = false; }
}
function bindUI() {
  JOINTS.forEach(([key, title], index) => {
    const [min, max] = POSE_LIMITS[key], row = document.createElement('div'); row.className = 'joint-row';
    row.innerHTML = `<span class="joint-number">J${index + 1}</span><label id="label-${key}" for="joint-${key}">${title}</label><input type="number" id="value-${key}" aria-label="${title}, градусы" min="${min}" max="${max}" value="${DEFAULT_POSE[key]}" step="0.1"><input type="range" id="joint-${key}" min="${min}" max="${max}" value="${DEFAULT_POSE[key]}" step="0.1" aria-label="${title}">`;
    $('joint-controls').appendChild(row);
    $(`joint-${key}`).addEventListener('input', event => poseChange(key, event.target.value));
    $(`value-${key}`).addEventListener('input', event => {
      if (event.target.value !== '' && Number.isFinite(Number(event.target.value))) poseChange(key, event.target.value, event.target);
    });
    $(`value-${key}`).addEventListener('change', event => poseChange(key, event.target.value));
  });
  $('focal').addEventListener('input', event => poseChange('focal', event.target.value));
  $('subject').addEventListener('input', event => poseChange('subject', event.target.value));
  $('add-key-button').addEventListener('click', saveKey); $('timeline-add-key').addEventListener('click', saveKey);
  $('discard-draft').addEventListener('click', () => { if (!state.capturing) { discardDraft(state); syncEditor(); toast('Правка позы отменена'); } });
  $('play-button').addEventListener('click', togglePlayback); $('demo-button').addEventListener('click', togglePlayback);
  $('start-button').addEventListener('click', () => navigateTime(0));
  const step = direction => { pausePlayback(); navigateTime(stepFrameTime(state.project, state.time, direction)); };
  $('previous-frame-button').addEventListener('click', () => step(-1));
  $('step-button').addEventListener('click', () => step(1));
  $('timeline-scrubber').addEventListener('input', event => navigateTime(event.target.value));
  $('move-key-button').addEventListener('click', moveSelectedKey);
  $('key-time-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); moveSelectedKey(); } });
  $('delete-key').addEventListener('click', () => {
    if (state.capturing || !state.selected || state.project.keyframes.length <= 1 || !commitPendingPose()) return;
    checkpointEditor(state); state.project.keyframes = removeKeyframe(state.project.keyframes, state.selected); state.activePreset = null;
    seekRaw(state.time); syncEditor(); toast('Ключ удалён. Можно отменить действие.');
  });
  $('undo-button').addEventListener('click', () => historyAction(-1)); $('redo-button').addEventListener('click', () => historyAction(1));
  $('duration-input').addEventListener('change', event => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 1 || value > 120) { event.target.value = state.project.duration; toast('Длительность: от 1 до 120 секунд.', true); return; }
    pausePlayback(); if (!commitPendingPose()) { event.target.value = state.project.duration; return; }
    checkpointEditor(state); const previousDuration = state.project.duration, ratio = value / previousDuration;
    state.project.keyframes.forEach(key => { key.time = key.time === previousDuration ? value : clamp(key.time * ratio, 0, value); });
    state.time = clamp(state.time * ratio, 0, value); state.project.duration = value;
    seekRaw(state.time); syncEditor();
  });
  $('fps-select').addEventListener('change', event => {
    const fps = Number(event.target.value); pausePlayback();
    if (!commitPendingPose()) { event.target.value = state.project.fps; return; }
    checkpointEditor(state); state.project.fps = fps; syncEditor();
  });
  $('easing-select').addEventListener('change', event => {
    const easing = event.target.value; pausePlayback();
    if (!commitPendingPose()) { event.target.value = state.project.easing; return; }
    checkpointEditor(state); state.project.easing = easing; seekRaw(state.time); syncEditor();
  });
  $$('.preset').forEach(button => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  $$('.scene-card').forEach(button => button.addEventListener('click', () => changeSetting('subjectType', button.dataset.subject)));
  $('lighting-select').addEventListener('change', event => changeSetting('lighting', event.target.value));
  $('autoaim-toggle').addEventListener('change', event => changeSetting('autoAim', event.target.checked));
  for (const key of ['grid', 'path', 'frustum']) $(`${key}-toggle`).addEventListener('change', event => changeSetting(key, event.target.checked));
  $('thirds-toggle').addEventListener('change', event => $('composition-grid').hidden = !event.target.checked);
  $$('[data-view]').forEach(button => button.addEventListener('click', () => {
    if (state.engineStatus !== 'ready' || state.capturing) return; state.scene.setView(button.dataset.view);
    $$('[data-view]').forEach(other => { other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button)); });
  }));
  $('reset-view').addEventListener('click', () => {
    if (state.engineStatus !== 'ready' || state.capturing) return; state.scene.setView('perspective');
    $$('[data-view]').forEach(button => { const active = button.dataset.view === 'perspective'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  });
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { toast('Полноэкранный режим недоступен в этом браузере'); }
  });
  document.addEventListener('fullscreenchange', () => state.scene?.resize());
  $('retry-scene').addEventListener('click', initializeScene);
  $('project-button').addEventListener('click', () => { $('project-name').value = state.project.name; openDialog('project-dialog'); });
  $('project-name').addEventListener('change', event => {
    const name = event.target.value.trim().slice(0, 80) || 'Первый дубль';
    if (!commitPendingPose()) { event.target.value = state.project.name; return; }
    checkpointEditor(state); state.project.name = name; event.target.value = name; syncHistoryUI(); save();
  });
  $('export-project').addEventListener('click', () => {
    if (!commitPendingPose()) return;
    download(new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }), `${filename()}.json`); toast('Проект сохранён в JSON');
  });
  $('import-project').addEventListener('click', () => $('import-input').click());
  $('import-input').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 500000) throw new Error('Максимальный размер проекта — 500 КБ.');
      const project = validateProject(await file.text()); checkpointEditor(state);
      state.project = project; state.activePreset = null; seekRaw(0); syncEditor(); $('project-dialog').close();
      toast('Проект открыт. Прежнее состояние можно восстановить кнопкой отмены.');
    } catch (error) { toast(error.message, true); } finally { event.target.value = ''; }
  });
  $('open-code').addEventListener('click', () => { $('project-dialog').close(); showProgram(); });
  $('program-button').addEventListener('click', showProgram);
  $('download-program').addEventListener('click', () => download(new Blob([toProgram(state.project)], { type: 'text/plain;charset=utf-8' }), `${filename()}-program.txt`));
  $('copy-program').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('program-text').value); toast('Программа скопирована'); }
    catch { $('program-text').focus(); $('program-text').select(); toast('Текст выделен — скопируйте его из поля'); }
  });
  $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('mobile-help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('capture-button').addEventListener('click', captureOne);
  $('frames-button').addEventListener('click', () => { renderGallery(); openDialog('frames-dialog'); });
  $('capture-sequence').addEventListener('click', captureSequence);
  $('play-captures').addEventListener('click', togglePreview); $('download-frames').addEventListener('click', downloadFrames);
  $('restore-take').addEventListener('click', restoreTake);
  $('clear-frames').addEventListener('click', () => {
    if (state.capturing) return; stopPreview(); rememberTake(); state.captures = []; state.captureProject = null; state.captureMode = null;
    $('capture-preview').hidden = true; renderGallery(); toast('Галерея очищена. Предыдущий дубль можно восстановить.');
  });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => { if (dialog.id === 'frames-dialog') { if (state.capturing) state.captureToken++; stopPreview(); } });
  });
  document.addEventListener('keydown', event => {
    const interactive = event.target.closest('input,select,textarea,button,a,[contenteditable="true"],[role="slider"]');
    if (state.capturing || interactive || $$('dialog[open]').length || event.altKey) return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); historyAction(event.shiftKey ? 1 : -1); return; }
    if (event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    if (event.code === 'KeyK') { event.preventDefault(); saveKey(); }
    if (event.code === 'KeyC') { event.preventDefault(); captureOne(); }
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') { event.preventDefault(); step(event.code === 'ArrowRight' ? 1 : -1); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pausePlayback(); stopPreview(); save(); } });
  window.addEventListener('pagehide', save);
}
function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden || state.engineStatus !== 'ready' || state.capturing) return;
  if (state.playing) {
    updatePlaybackAt(now);
    if (now - lastUI >= 60) { updateTimeUI(); updatePoseControls(); syncSelection(); lastUI = now; }
    if (state.time >= state.project.duration) { pausePlayback(); toast('Движение завершено. Можно снять программу в кадры.'); }
  }
  if (now - lastRender >= 1000 / (state.playing ? 45 : 30)) {
    try { state.scene.render(); lastRender = now; }
    catch (error) { engineError('Не удалось отрисовать сцену. Проект сохранён. Повторите запуск 3D.'); console.error(error); }
  }
}
function boot() {
  let restored = false;
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { restoreEditor(state, restoreSession(saved)); restored = true; } }
  catch { /* Malformed local state must not prevent starting a fresh project. */ }
  bindUI(); syncEditor({ assess: false }); renderGallery(); updatePlaybackControls();
  requestAnimationFrame(animate); initializeScene();
  if (restored) toast(state.dirty ? 'Проект и незавершённая правка восстановлены' : 'Ваш последний проект восстановлен');
}
boot();
