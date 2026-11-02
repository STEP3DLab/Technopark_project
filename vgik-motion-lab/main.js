import { StudioScene } from './scene.js';
import { POSE_LIMITS, DEFAULT_POSE, createProject, validateProject, sanitizePose, sampleTimeline, upsertKeyframe, removeKeyframe, toProgram } from './motion.js';
import { buildZip } from './zip.js';

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const STORAGE_KEY = 'rgsu-vgik-motion-studio-v1';
const MAX_FRAMES = 360;
const JOINTS = [['base', 'Основание'], ['shoulder', 'Плечо'], ['elbow', 'Локоть'], ['wrist', 'Запястье'], ['tilt', 'Наклон камеры'], ['roll', 'Крен камеры']];
const PRESET_LABELS = { orbit: 'Облёт объекта', dolly: 'Плавный наезд', crane: 'Подъём камеры' };
const state = { project: createProject(), pose: { ...DEFAULT_POSE }, time: 0, playing: false, selected: null, dirty: false, captures: [], captureProject: null, history: [], scene: null, captureToken: 0, capturing: false, previewTimer: null, storageOK: true, activePreset: 'orbit' };
let toastTimer, lastRender = 0, previousTime = performance.now(), lastUI = 0;

function toast(message, error = false) {
  const target = $('toast'); target.querySelector('span').textContent = message;
  target.classList.toggle('error', error); target.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => target.classList.remove('visible'), error ? 6500 : 3400);
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project)); state.storageOK = true; }
  catch { state.storageOK = false; }
  $('save-status').innerHTML = state.storageOK ? '<span class="live-dot"></span>Сохранено в этом браузере' : 'Автосохранение недоступно · экспортируйте JSON';
}
function checkpoint() {
  state.history.push({ project: clone(state.project), time: state.time });
  if (state.history.length > 20) state.history.shift();
  $('undo-button').disabled = false;
}
function setPlaying(value) {
  if (!state.scene || state.capturing) value = false;
  if (value && state.time >= state.project.duration - .001) seek(0);
  state.playing = value; previousTime = performance.now();
  document.body.classList.toggle('is-playing', value);
  $('play-button').setAttribute('aria-label', value ? 'Пауза' : 'Воспроизвести');
  $('play-button').querySelector('use').setAttribute('href', value ? '#i-pause' : '#i-play');
  $('demo-button').querySelector('span').textContent = value ? 'Пауза' : 'Запустить демо';
  $('demo-button').querySelector('use').setAttribute('href', value ? '#i-pause' : '#i-play');
  $('scene-status').textContent = value ? 'ДВИЖЕНИЕ КАМЕРЫ' : 'СТУДИЯ ГОТОВА';
}
function frameCount() { return Math.ceil(state.project.duration * state.project.fps) + 1; }
function sample(time) { return sampleTimeline(state.project.keyframes, time, { easing: state.project.easing }); }
function setDirty(value) {
  state.dirty = value;
  $('dirty-note').classList.toggle('active', value);
  $('dirty-note').textContent = value ? 'Поза изменена — сохраните ключ на шкале' : 'Выберите время на шкале и измените позу';
}
function updatePoseControls() {
  for (const [key] of JOINTS) {
    const value = Math.round(state.pose[key] * 10) / 10;
    $(`joint-${key}`).value = value; $(`value-${key}`).value = value;
  }
  $('focal').value = state.pose.focal; $('focal-value').textContent = `${Math.round(state.pose.focal)} мм`;
  $('monitor-lens').textContent = `${Math.round(state.pose.focal)} mm`;
  $('subject').value = state.pose.subject; $('subject-value').textContent = `${Math.round(state.pose.subject)}%`;
}
function updateTimeUI() {
  const time = state.time;
  const mins = Math.floor(time / 60), secs = Math.floor(time % 60), hundredths = Math.floor((time % 1) * 100);
  $('time-display').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  const frame = Math.min(frameCount(), Math.round(time * state.project.fps) + 1);
  $('frame-display').textContent = `КАДР ${String(frame).padStart(3, '0')} / ${String(frameCount()).padStart(3, '0')}`;
  $('monitor-frame-label').textContent = `КАДР ${String(frame).padStart(3, '0')}`;
  $('timeline-scrubber').value = time;
  $('playhead').style.left = `${time / state.project.duration * 100}%`;
  if (state.scene) {
    const pos = state.scene.getCameraPosition();
    for (const axis of ['x', 'y', 'z']) $(`coord-${axis}`).textContent = pos[axis].toFixed(2);
  }
}
function selectKey(id) {
  state.selected = id;
  $$('.keyframe-dot').forEach((button) => { button.classList.toggle('selected', button.dataset.id === id); button.setAttribute('aria-pressed', String(button.dataset.id === id)); });
  const index = state.project.keyframes.findIndex(k => k.id === id);
  $('selected-key-label').textContent = index < 0 ? `Позиция ${state.time.toFixed(2)} с · сохраните новую позу` : `Ключ ${String(index + 1).padStart(2, '0')} · ${state.project.keyframes[index].time.toFixed(2)} с`;
  $('delete-key').disabled = !id || state.project.keyframes.length <= 1;
}
function seek(time, { controls = true } = {}) {
  state.time = clamp(Number(time) || 0, 0, state.project.duration);
  state.pose = sample(state.time); state.scene?.setPose(state.pose); setDirty(false);
  if (controls) updatePoseControls(); updateTimeUI();
  const at = state.project.keyframes.find(k => Math.abs(k.time - state.time) < .015);
  selectKey(at?.id ?? null);
}
function rebuildPath() {
  if (!state.scene) return;
  const poses = Array.from({ length: 65 }, (_, i) => sample(i / 64 * state.project.duration));
  state.scene.setPath(poses); state.scene.setPose(state.pose);
}
function drawTimeline() {
  const container = $('keyframes'); container.replaceChildren();
  for (let i = 0; i < state.project.keyframes.length; i++) {
    const key = state.project.keyframes[i];
    const button = document.createElement('button'); button.type = 'button'; button.className = 'keyframe-dot';
    button.dataset.id = key.id; button.style.left = `${key.time / state.project.duration * 100}%`;
    button.setAttribute('aria-label', `Ключ ${i + 1}, ${key.time.toFixed(2)} секунд`);
    button.setAttribute('title', `Ключ ${i + 1} · ${key.time.toFixed(2)} с`);
    button.addEventListener('click', () => { setPlaying(false); seek(key.time); });
    container.appendChild(button);
  }
  $('timeline-ruler').replaceChildren();
  for (let i = 0; i <= 4; i++) { const mark = document.createElement('span'); mark.textContent = `${Number((i * state.project.duration / 4).toFixed(1))} с`; $('timeline-ruler').appendChild(mark); }
  $('timeline-scrubber').max = state.project.duration;
  $('duration-input').min = 1; $('duration-input').max = 120; $('duration-input').value = state.project.duration;
  if (![...$('fps-select').options].some(o => Number(o.value) === state.project.fps)) $('fps-select').add(new Option(`${state.project.fps} кадр/с`, String(state.project.fps)));
  $('fps-select').value = state.project.fps; $('easing-select').value = state.project.easing;
  $('key-count').textContent = `${state.project.keyframes.length} ключевых поз`;
  updateTimeUI(); selectKey(state.selected); rebuildPath();
}
function syncSettings() {
  const settings = state.project.settings;
  state.scene?.setSubjectType(settings.subjectType); state.scene?.setLighting(settings.lighting);
  state.scene?.setAutoAim(settings.autoAim);
  $('lighting-select').value = settings.lighting; $('autoaim-toggle').checked = settings.autoAim;
  $('tracking-description').textContent = settings.autoAim ? 'Камера удерживает объект в кадре' : 'Направление камеры задаётся запястьем';
  $$('.scene-card').forEach(b => { b.classList.toggle('active', b.dataset.subject === settings.subjectType); b.setAttribute('aria-pressed', String(b.dataset.subject === settings.subjectType)); });
  for (const key of ['grid', 'path', 'frustum']) $(`${key}-toggle`).checked = settings[key];
  state.scene?.setHelpers({ grid: settings.grid, path: settings.path, frustum: settings.frustum });
}
function refreshProject() { setPlaying(false); syncSettings(); drawTimeline(); seek(state.time); $('project-name').value = state.project.name; save(); }
function poseChange(key, value) {
  setPlaying(false); const next = Number(value); if (!Number.isFinite(next)) return;
  state.pose = sanitizePose({ ...state.pose, [key]: next }); state.scene?.setPose(state.pose);
  setDirty(true); updatePoseControls(); updateTimeUI();
}
function addKey({ notify = true } = {}) {
  if (!state.scene) return;
  checkpoint();
  const selected = state.project.keyframes.find(k => k.id === state.selected && Math.abs(k.time - state.time) < .015);
  const time = selected?.time ?? Math.min(state.project.duration, Math.round(state.time * state.project.fps) / state.project.fps);
  const existing = selected ?? state.project.keyframes.find(k => Math.abs(k.time - time) < .0001);
  const id = existing?.id ?? `key-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  try { state.project.keyframes = upsertKeyframe(state.project.keyframes, { id, time, pose: state.pose }); }
  catch (error) { toast(error.message, true); return; }
  state.time = time; state.selected = id; state.activePreset = null; $$('.preset').forEach(b => b.classList.remove('active'));
  drawTimeline(); setDirty(false); save();
  if (notify) toast(existing ? 'Ключевая поза обновлена' : `Ключевая поза сохранена · ${time.toFixed(2)} с`);
}
function applyPreset(name, { remember = true } = {}) {
  if (remember) checkpoint(); setPlaying(false);
  const defaultPose = { ...DEFAULT_POSE, focal: 20 };
  const poses = name === 'dolly' ? [
    { ...defaultPose, base: -7, shoulder: 12, elbow: 75, focal: 20, subject: 0 },
    { ...defaultPose, base: -7, shoulder: 25, elbow: 65, focal: 20, subject: 50 },
    { ...defaultPose, base: -7, shoulder: 40, elbow: 55, focal: 20, subject: 100 },
  ] : name === 'crane' ? [
    { ...defaultPose, base: 12, shoulder: 50, elbow: 80, focal: 20, subject: 0 },
    { ...defaultPose, base: 6, shoulder: 35, elbow: 60, focal: 20, subject: 50 },
    { ...defaultPose, base: 0, shoulder: 15, elbow: 65, focal: 20, subject: 100 },
  ] : [
    { ...defaultPose, base: -22, subject: 0 }, { ...defaultPose, base: 0, subject: 50 }, { ...defaultPose, base: 22, subject: 100 },
  ];
  state.project.keyframes = poses.map((pose, index) => ({ id: `${name}-${index + 1}`, time: index * state.project.duration / 2, pose }));
  state.project.settings.autoAim = true; state.project.easing = 'smooth'; state.activePreset = name; state.time = 0;
  $$('.preset').forEach(b => b.classList.toggle('active', b.dataset.preset === name));
  refreshProject(); if (remember) toast(`${PRESET_LABELS[name]} · можно изменять ключевые позы`);
}
function openDialog(id) { setPlaying(false); $(id).showModal(); }
function showProgram() {
  if (state.dirty) addKey({ notify: false });
  $('program-text').value = toProgram(state.project); openDialog('program-dialog');
}
function filename(project = state.project) { return project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70) || 'rgsu-vgik'; }
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function stopPreview() { clearInterval(state.previewTimer); state.previewTimer = null; $('play-captures').querySelector('use').setAttribute('href', '#i-play'); $('play-captures').lastChild.textContent = 'Просмотреть'; }
function renderGallery() {
  const count = state.captures.length; $('capture-count').textContent = count; $('gallery-count').textContent = count;
  $('gallery-empty').hidden = count > 0; ['play-captures', 'download-frames', 'clear-frames'].forEach(id => $(id).disabled = count === 0);
  const gallery = $('frames-gallery'); gallery.replaceChildren();
  const fragment = document.createDocumentFragment();
  state.captures.forEach((frame, index) => {
    const button = document.createElement('button'); button.className = 'frame-card'; button.type = 'button';
    button.setAttribute('aria-label', `Просмотреть снятый кадр ${index + 1}`);
    const img = document.createElement('img'); img.src = frame.url; img.alt = `Кадр ${index + 1}`; img.loading = 'lazy';
    const caption = document.createElement('span'); caption.textContent = `${String(index + 1).padStart(3, '0')}    ${frame.time.toFixed(2)} с`;
    button.append(img, caption); button.addEventListener('click', () => { stopPreview(); showCaptured(index); }); fragment.appendChild(button);
  }); gallery.appendChild(fragment);
}
function showCaptured(index) {
  const frame = state.captures[index]; if (!frame) return;
  $('capture-preview').hidden = false; $('capture-preview-image').src = frame.url;
  $('capture-preview-counter').textContent = `Кадр ${index + 1} / ${state.captures.length} · ${frame.time.toFixed(2)} с`;
}
function captureOne() {
  if (!state.scene || state.capturing) return;
  if (state.captures.length >= MAX_FRAMES) { toast('В галерее уже 360 кадров. Скачайте их и очистите галерею.', true); return; }
  setPlaying(false);
  try { if (!state.captures.length) state.captureProject = clone(state.project); state.captures.push({ url: state.scene.captureFrame(), time: state.time, pose: clone(state.pose), settings: clone(state.project.settings) }); renderGallery(); toast(`Кадр ${state.captures.length} снят`); }
  catch { toast('Не удалось снять кадр. Проверьте поддержку WebGL в браузере.', true); }
}
async function captureSequence() {
  if (state.capturing) { state.captureToken++; return; }
  if (!state.scene) return;
  if (state.dirty) addKey({ notify: false });
  const count = frameCount();
  if (count > MAX_FRAMES) { toast(`Для одного прохода доступно до 360 кадров. Сейчас ${count}: уменьшите длительность или частоту кадров.`, true); return; }
  setPlaying(false); stopPreview(); state.capturing = true; const token = ++state.captureToken;
  const savedTime = state.time, savedPose = clone(state.pose), capturedProject = clone(state.project), frames = [];
  const button = $('capture-sequence'); button.textContent = 'Остановить съёмку';
  document.body.classList.add('is-capturing'); $('capture-progress').hidden = false; $('capture-progress').max = count; $('capture-progress').value = 0;
  $('capture-preview').hidden = false;
  try {
    for (let i = 0; i < count; i++) {
      if (token !== state.captureToken) break;
      const time = i === count - 1 ? state.project.duration : i / state.project.fps;
      const pose = sample(time); state.scene.setPose(pose);
      const url = state.scene.captureFrame(); frames.push({ url, time, pose, settings: clone(capturedProject.settings) });
      $('capture-preview-image').src = url; $('capture-preview-counter').textContent = `Съёмка ${i + 1} / ${count}`;
      $('capture-progress').value = i + 1;
      await new Promise(requestAnimationFrame);
    }
    if (token === state.captureToken) {
      state.captures = frames; state.captureProject = capturedProject; renderGallery(); showCaptured(0); toast(`Дубль готов: ${frames.length} кадров. Можно просмотреть и скачать.`);
    } else { toast('Съёмка остановлена. Предыдущие кадры сохранены.'); $('capture-preview').hidden = !state.captures.length; if (state.captures.length) showCaptured(0); }
  } catch (error) { toast('Не удалось завершить съёмку. Уменьшите частоту кадров и повторите.', true); }
  finally {
    state.capturing = false; document.body.classList.remove('is-capturing'); $('capture-progress').hidden = true;
    button.innerHTML = '<svg><use href="#i-film"/></svg>Снять всю программу';
    state.time = savedTime; state.pose = savedPose; state.scene.setPose(savedPose); updatePoseControls(); updateTimeUI();
  }
}
async function downloadFrames() {
  if (!state.captures.length) return;
  const button = $('download-frames'); button.disabled = true;
  const capturedProject = state.captureProject ?? state.project;
  try {
    const files = state.captures.map((frame, index) => {
      const binary = atob(frame.url.split(',')[1]); const data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
      return { name: `frames/frame-${String(index + 1).padStart(4, '0')}.png`, data };
    });
    files.push({ name: 'project.json', data: JSON.stringify(capturedProject, null, 2) });
    files.push({ name: 'captures.json', data: JSON.stringify({ version: 1, fps: capturedProject.fps, frames: state.captures.map(({time,pose,settings}, i) => ({frame:i+1,time,pose,settings})) }, null, 2) });
    files.push({ name: 'frames.csv', data: 'frame,time_seconds\n' + state.captures.map((f, i) => `${i + 1},${f.time.toFixed(6)}`).join('\n') });
    files.push({ name: 'README.txt', data: `РГСУ × ВГИК · КАДР\n${capturedProject.name}\n${state.captures.length} PNG-кадров 1280×720.\nЧастота проекта: ${capturedProject.fps} кадров/с.\nПорядок: frame-0001.png → frame-${String(state.captures.length).padStart(4, '0')}.png.\nПолная съёмка включает конечную позу как дополнительный опорный кадр. Для точной длительности ${capturedProject.duration} с импортируйте первые ${Math.ceil(capturedProject.duration * capturedProject.fps)} кадров.\nДля отдельных ручных кадров время съёмки указано в frames.csv.\nproject.json открывается в меню «Проект» виртуальной студии.\nhttps://step3dlab.github.io/Technopark_project/vgik-motion-lab/\n` });
    const blob = await buildZip(files); download(blob, `${filename(capturedProject)}-frames.zip`); toast(`Архив готов · ${state.captures.length} кадров`);
  } catch (error) { toast(`Не удалось подготовить архив: ${error.message}`, true); }
  finally { button.disabled = false; }
}
function bindUI() {
  for (let index = 0; index < JOINTS.length; index++) {
    const [key, title] = JOINTS[index], [min, max] = POSE_LIMITS[key];
    const row = document.createElement('div'); row.className = 'joint-row';
    row.innerHTML = `<span class="joint-number">J${index + 1}</span><label for="joint-${key}">${title}</label><input type="number" id="value-${key}" aria-label="${title}, градусы" min="${min}" max="${max}" value="${DEFAULT_POSE[key]}" step="1"><input type="range" id="joint-${key}" min="${min}" max="${max}" value="${DEFAULT_POSE[key]}" step="1" aria-label="${title}">`;
    $('joint-controls').appendChild(row);
    $(`joint-${key}`).addEventListener('input', event => poseChange(key, event.target.value));
    $(`value-${key}`).addEventListener('change', event => { poseChange(key, event.target.value); updatePoseControls(); });
  }
  $('focal').addEventListener('input', event => poseChange('focal', event.target.value));
  $('subject').addEventListener('input', event => poseChange('subject', event.target.value));
  $('add-key-button').addEventListener('click', () => addKey());
  $('timeline-add-key').addEventListener('click', () => addKey());
  $('play-button').addEventListener('click', () => { if (state.dirty) addKey({ notify: false }); setPlaying(!state.playing); });
  $('demo-button').addEventListener('click', () => { if (state.dirty) addKey({ notify: false }); setPlaying(!state.playing); });
  $('start-button').addEventListener('click', () => { setPlaying(false); seek(0); });
  $('step-button').addEventListener('click', () => { setPlaying(false); seek(Math.min(state.project.duration, (Math.floor(state.time * state.project.fps + .001) + 1) / state.project.fps)); });
  $('timeline-scrubber').addEventListener('input', event => { setPlaying(false); seek(event.target.value); });
  $('delete-key').addEventListener('click', () => { if (!state.selected || state.project.keyframes.length <= 1) return; checkpoint(); state.project.keyframes = removeKeyframe(state.project.keyframes, state.selected); state.selected = null; drawTimeline(); seek(state.time); save(); toast('Ключ удалён. Действие можно отменить.'); });
  $('undo-button').addEventListener('click', () => { const entry = state.history.pop(); if (!entry) return; state.project = entry.project; state.time = entry.time; refreshProject(); $('undo-button').disabled = !state.history.length; toast('Предыдущее состояние восстановлено'); });
  $('duration-input').addEventListener('change', event => { const next = Number(event.target.value); if (!Number.isFinite(next) || next < 1 || next > 120) { event.target.value = state.project.duration; toast('Длительность должна быть от 1 до 120 секунд', true); return; } checkpoint(); setPlaying(false); const scale = next / state.project.duration; state.project.keyframes.forEach(k => k.time *= scale); state.time *= scale; state.project.duration = next; drawTimeline(); seek(state.time); save(); });
  $('fps-select').addEventListener('change', event => { checkpoint(); state.project.fps = Number(event.target.value); updateTimeUI(); save(); });
  $('easing-select').addEventListener('change', event => { checkpoint(); state.project.easing = event.target.value; rebuildPath(); seek(state.time); save(); });
  $$('.preset').forEach(button => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  $$('.scene-card').forEach(button => button.addEventListener('click', () => { checkpoint(); state.project.settings.subjectType = button.dataset.subject; syncSettings(); save(); }));
  $('lighting-select').addEventListener('change', event => { checkpoint(); state.project.settings.lighting = event.target.value; syncSettings(); save(); });
  $('autoaim-toggle').addEventListener('change', event => { checkpoint(); state.project.settings.autoAim = event.target.checked; syncSettings(); rebuildPath(); save(); });
  for (const key of ['grid', 'path', 'frustum']) $(`${key}-toggle`).addEventListener('change', event => { state.project.settings[key] = event.target.checked; syncSettings(); save(); });
  $('thirds-toggle').addEventListener('change', event => $('composition-grid').hidden = !event.target.checked);
  $$('[data-view]').forEach(button => button.addEventListener('click', () => { state.scene?.setView(button.dataset.view); $$('[data-view]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); }));
  $('reset-view').addEventListener('click', () => { state.scene?.setView('perspective'); $$('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === 'perspective'); b.setAttribute('aria-pressed', String(b.dataset.view === 'perspective')); }); });
  $('fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('workspace').requestFullscreen(); } catch { toast('Полноэкранный режим недоступен в этом браузере'); } });
  document.addEventListener('fullscreenchange', () => state.scene?.resize());
  $('project-button').addEventListener('click', () => { $('project-name').value = state.project.name; openDialog('project-dialog'); });
  $('project-name').addEventListener('change', event => { checkpoint(); state.project.name = event.target.value.trim().slice(0, 80) || 'Первый дубль'; event.target.value = state.project.name; save(); });
  $('export-project').addEventListener('click', () => { if (state.dirty) addKey({ notify: false }); download(new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }), `${filename()}.json`); toast('Проект сохранён в JSON'); });
  $('import-project').addEventListener('click', () => $('import-input').click());
  $('import-input').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 500000) throw new Error('Проект слишком большой: максимум 500 КБ.'); const next = validateProject(await file.text()); checkpoint(); state.project = next; state.time = 0; state.activePreset = null; $$('.preset').forEach(b => b.classList.remove('active')); refreshProject(); $('project-dialog').close(); toast('Проект открыт. Можно продолжать съёмку.'); }
    catch (error) { toast(error.message, true); } finally { event.target.value = ''; }
  });
  $('open-code').addEventListener('click', () => { $('project-dialog').close(); showProgram(); });
  $('program-button').addEventListener('click', showProgram);
  $('download-program').addEventListener('click', () => download(new Blob([toProgram(state.project)], { type: 'text/plain;charset=utf-8' }), `${filename()}-program.txt`));
  $('copy-program').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('program-text').value); toast('Программа скопирована'); } catch { $('program-text').focus(); $('program-text').select(); toast('Текст выделен — скопируйте его из поля'); } });
  $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('mobile-help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('capture-button').addEventListener('click', captureOne);
  $('frames-button').addEventListener('click', () => { renderGallery(); openDialog('frames-dialog'); });
  $('capture-sequence').addEventListener('click', captureSequence);
  $('play-captures').addEventListener('click', () => { if (state.previewTimer) { stopPreview(); return; } let frame = 0; showCaptured(0); $('play-captures').querySelector('use').setAttribute('href', '#i-pause'); $('play-captures').lastChild.textContent = 'Пауза'; state.previewTimer = setInterval(() => { frame = (frame + 1) % state.captures.length; showCaptured(frame); }, 1000 / (state.captureProject?.fps ?? state.project.fps)); });
  $('download-frames').addEventListener('click', downloadFrames);
  $('clear-frames').addEventListener('click', () => { stopPreview(); state.captures = []; state.captureProject = null; $('capture-preview').hidden = true; renderGallery(); });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => { dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }); dialog.addEventListener('close', () => { if (dialog.id === 'frames-dialog') { state.captureToken++; stopPreview(); } }); });
  document.addEventListener('keydown', event => {
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || $$('dialog[open]').length || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space') { event.preventDefault(); if (state.dirty) addKey({ notify: false }); setPlaying(!state.playing); }
    if (event.code === 'KeyK') addKey(); if (event.code === 'KeyC') captureOne();
    if (event.code === 'ArrowRight') { event.preventDefault(); setPlaying(false); seek(state.time + 1 / state.project.fps); }
    if (event.code === 'ArrowLeft') { event.preventDefault(); setPlaying(false); seek(state.time - 1 / state.project.fps); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { setPlaying(false); stopPreview(); } });
}
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - previousTime) / 1000, .1); previousTime = now;
  if (document.hidden || !state.scene || state.capturing) return;
  if (state.playing) {
    state.time = Math.min(state.project.duration, state.time + delta);
    state.pose = sample(state.time); state.scene.setPose(state.pose); setDirty(false);
    if (now - lastUI > 60) { updateTimeUI(); updatePoseControls(); lastUI = now; }
    if (state.time >= state.project.duration) { setPlaying(false); updateTimeUI(); updatePoseControls(); toast('Движение завершено. Откройте «Снятые кадры», чтобы снять дубль.'); }
  }
  if (now - lastRender >= 1000 / (state.playing ? 45 : 30)) { state.scene.render(); lastRender = now; }
}
function boot() {
  let restored = false;
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { state.project = validateProject(saved); restored = true; } } catch { /* Broken storage must not prevent a demonstration. */ }
  bindUI();
  try {
    state.scene = new StudioScene({ viewport: $('viewport'), monitor: $('monitor'), onStatus: ({ type, message }) => { if (type === 'error') { $('stage-error').textContent = message; $('stage-error').hidden = false; setPlaying(false); } } });
    $('loading').hidden = true; refreshProject(); requestAnimationFrame(animate);
    $('capture-note').textContent = 'Съёмка: PNG 1280 × 720. Скачивание: ZIP с кадрами и проектом. До 360 кадров за проход. Последняя поза — дополнительный опорный кадр. Галерея хранится до закрытия страницы.';
    if (restored) { state.activePreset = null; $$('.preset').forEach(b => b.classList.remove('active')); toast('Ваш последний проект восстановлен'); }
  } catch (error) {
    $('loading').hidden = true; $('stage-error').hidden = false;
    $('stage-error').textContent = 'Не удалось запустить 3D-сцену. Откройте студию в актуальном Chrome, Edge, Firefox или Safari с включённым WebGL 2.';
    ['play-button', 'demo-button', 'capture-button', 'add-key-button', 'capture-sequence'].forEach(id => $(id).disabled = true);
    console.error('Studio initialization failed:', error);
  }
}
boot();
