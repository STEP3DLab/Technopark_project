import { initUI, setItems, setSelection, setPlayback, setMessage, setReady, setMode, setLoop, setTour, showToast, revealViewer } from './ui.js?v=0.3';
import { createCatalog, matchText, validateMotion } from './catalog.js';
import { CanvasAvatar } from './canvas-avatar.js?v=0.12.0';

const video = document.getElementById('reference-video');
const cache = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  catalog: [], item: null, selectionId: null, data: null,
  time: 0, playing: false, intent: false, speed: 1, mode: 'avatar', loop: false,
  last: 0, loadId: 0, playId: 0, raf: 0, loopTimer: 0, loopGap: false,
  buffering: false, failedVideo: false, scrubResume: false, request: null,
  tour: null, tourId: 0,
};
let avatar;
try {
  avatar = new CanvasAvatar(document.getElementById('avatar-stage'));
} catch (error) {
  console.warn('Canvas unavailable', error);
  state.mode = 'reference';
  ['mode-avatar', 'mode-compare'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = true;
  });
}
const smoothingButton = document.getElementById('studio-smoothing');
let motionSmoothing = true;
function setMotionSmoothing(enabled) {
  motionSmoothing = Boolean(enabled);
  avatar?.setSmoothing?.(motionSmoothing);
  smoothingButton.setAttribute('aria-pressed', String(motionSmoothing));
  smoothingButton.textContent = motionSmoothing ? 'Плавные движения' : 'Без сглаживания';
  smoothingButton.title = motionSmoothing ? 'Выключите, чтобы видеть исходные координаты без сглаживания.' : 'Включите, чтобы уменьшить мелкое дрожание движения.';
}
smoothingButton.disabled = !avatar;
setMotionSmoothing(true);
smoothingButton.onclick = () => setMotionSmoothing(!motionSmoothing);
const usesVideo = () => state.mode !== 'avatar';
const activeVideo = () => state.item && video.currentSrc === new URL(state.item.video, document.baseURI).href;
const demoVisible = () => !document.hidden && !document.getElementById('panel-demo').hidden;

function update() {
  if (!state.data) return;
  if (state.mode !== 'reference') avatar?.showAt(state.time);
  setPlayback({
    playing: state.playing, time: state.time, duration: state.data.duration,
    progress: state.time / state.data.duration, buffering: state.buffering,
    repeating: state.loopGap === 'repeat', advancing: state.loopGap === 'tour',
    tourPaused: Boolean(state.tour && !state.playing),
    frame: Math.min(state.data.frame_count, Math.floor(state.time * state.data.fps + 1e-5) + 1),
    frames: state.data.frame_count,
  });
}
function cancelLoop() {
  clearTimeout(state.loopTimer);
  state.loopTimer = 0;
  state.loopGap = false;
}
function pause() {
  ++state.playId;
  state.playing = false;
  state.intent = false;
  state.buffering = false;
  video.pause();
  cancelLoop();
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
  update();
}
function refreshTour() {
  const tour = state.tour;
  setTour({ active: Boolean(tour), index: tour?.index ?? 0, total: state.catalog.length,
    label: tour ? state.catalog[tour.index]?.text : '',
    next: tour ? state.catalog[tour.index + 1]?.text : '' });
}
function stopTour(message = '', pausePlayback = true) {
  if (!state.tour) return;
  state.tour = null;
  ++state.tourId;
  cancelLoop();
  if (pausePlayback) pause();
  refreshTour();
  if (message) showToast(message);
}
function advanceTour() {
  if (!state.tour || !demoVisible()) return;
  state.tour.pending = false;
  state.tour.index += 1;
  if (state.tour.index >= state.catalog.length) {
    stopTour('Демопоказ завершён. Вы посмотрели все шесть примеров.');
    return;
  }
  select(state.catalog[state.tour.index].id, true, { keepTour: true, explicit: true });
}
function startTour() {
  if (!state.catalog.length) return;
  stopTour('', false);
  state.loop = false;
  setLoop(false);
  state.tour = { index: 0, pending: false };
  ++state.tourId;
  // Pressing this dedicated control explicitly requests the whole sequence,
  // including when the system prefers reduced incidental animation.
  select(state.catalog[0].id, true, { keepTour: true, explicit: true });
  revealViewer(true);
}
function finish() {
  if (!state.data || !state.playing || state.loopGap) return;
  state.time = state.data.duration;
  if (!demoVisible()) { pause(); return; }
  if (state.tour && state.tour.index >= state.catalog.length - 1) {
    stopTour('Демопоказ завершён. Вы посмотрели все шесть примеров.');
    return;
  }
  if (!state.loop && !state.tour) { pause(); return; }
  // Separate recordings remain visibly separate. No movement is interpolated
  // between words, and only one cancellable timer owns the next transition.
  const gap = state.tour ? 'tour' : 'repeat';
  state.loopGap = gap;
  if (state.tour) state.tour.pending = true;
  video.pause();
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
  update();
  const loadId = state.loadId, tourId = state.tourId, playId = state.playId;
  state.loopTimer = setTimeout(() => {
    state.loopTimer = 0;
    if (loadId !== state.loadId || tourId !== state.tourId || playId !== state.playId ||
        !state.playing || !demoVisible()) return;
    state.loopGap = false;
    if (gap === 'tour') { if (state.tour) advanceTour(); return; }
    if (!state.loop) return;
    state.time = 0;
    play();
  }, gap === 'tour' ? 900 : 550);
}
function tick(now) {
  state.raf = 0;
  if (!state.playing || !state.data || state.loopGap) return;
  if (usesVideo()) {
    // In comparison mode the actual media clock owns both pictures, including
    // video buffering and seeks. No separate animation clock can drift ahead.
    if (activeVideo() && !video.seeking) state.time = Math.min(state.data.duration, video.currentTime);
  } else {
    // Preserve the selected playback speed when rendering drops a frame.
    // Visibility changes already pause playback, so hidden tabs cannot jump
    // ahead on return. Capping every RAF delta made slow devices drift.
    state.time += Math.max(0, (now - state.last) / 1000) * state.speed;
  }
  state.last = now;
  if (!usesVideo() && state.time >= state.data.duration) { finish(); return; }
  update();
  if (state.playing && !state.loopGap) state.raf = requestAnimationFrame(tick);
}
async function play() {
  if (!state.data || !demoVisible()) return;
  cancelLoop();
  if (state.tour?.pending) { advanceTour(); return; }
  if (state.time >= state.data.duration - .025) state.time = 0;
  state.playing = true;
  state.intent = true;
  state.last = performance.now();
  const playId = ++state.playId, loadId = state.loadId, mode = state.mode;
  const current = () => playId === state.playId && loadId === state.loadId &&
    mode === state.mode && state.playing && state.data;
  update();
  if (usesVideo()) {
    if (state.failedVideo) {
      pause();
      setMessage('Видео не загрузилось. Выберите слово повторно или включите режим «Аватар».', 'error');
      return;
    }
    video.currentTime = Math.min(state.time, video.duration || state.data.duration);
    video.playbackRate = state.speed;
    state.buffering = video.readyState < 3;
    try {
      await video.play();
    } catch {
      if (!current()) return;
      pause();
      setMessage('Видео не удалось запустить. Нажмите воспроизведение ещё раз или включите аватар.', 'error');
      return;
    }
  }
  if (!current()) return;
  if (!state.raf) state.raf = requestAnimationFrame(tick);
  update();
}
function seek(ratio) {
  if (!state.data) return;
  const wasGap = state.loopGap;
  cancelLoop();
  if (state.tour) state.tour.pending = false;
  state.time = Math.max(0, Math.min(1, ratio)) * state.data.duration;
  if (video.readyState >= 1 && activeVideo()) {
    video.currentTime = Math.min(state.time, video.duration || state.data.duration);
  }
  state.last = performance.now();
  update();
  if (wasGap && state.playing && usesVideo()) { play(); return; }
  if (state.playing && !state.raf) state.raf = requestAnimationFrame(tick);
}
async function select(id, autoplay = true, { keepTour = false, explicit = false } = {}) {
  const item = state.catalog.find((entry) => entry.id === id);
  if (!item) return;
  if (!keepTour) stopTour('', false);
  const token = ++state.loadId;
  state.request?.abort();
  const request = new AbortController();
  state.request = request;
  pause();
  state.intent = Boolean(autoplay && (explicit || !reducedMotion.matches));
  state.item = null;
  state.selectionId = id;
  state.data = null;
  state.time = 0;
  state.failedVideo = false;
  state.scrubResume = false;
  avatar?.clear();
  setPlayback({ playing: false, time: 0, duration: 0, progress: 0 });
  setReady(false, 'Подготавливаем движение');
  setSelection({ ...item, sourceUrl: new URL(item.video, document.baseURI).href });
  refreshTour();
  setMessage('');
  try {
    let data = cache.get(id);
    if (!data) {
      const response = await fetch(item.motion, { signal: request.signal });
      if (!response.ok) throw new Error('Файл движения недоступен');
      data = validateMotion(await response.json());
      cache.set(id, data);
    }
    if (token !== state.loadId) return;
    state.item = item;
    state.data = data;
    video.src = item.video;
    video.muted = true;
    video.loop = false;
    video.load();
    avatar?.load(data);
    setReady(true);
    update();
    if (!avatar) setMessage('На этом устройстве доступна исходная видеозапись.', 'info');
    if (state.intent && demoVisible()) await play();
  } catch (error) {
    if (token !== state.loadId || error.name === 'AbortError') return;
    state.intent = false;
    stopTour('', false);
    setReady(false, 'Не удалось загрузить движение', 'error');
    setMessage('Проверьте соединение и нажмите на выбранное слово ещё раз.', 'error');
    console.error(error);
  }
}
function submit(value) {
  stopTour('', false);
  const item = matchText(value, state.catalog);
  if (item) { select(item.id); revealViewer(); return; }
  ++state.loadId;
  state.request?.abort();
  pause();
  state.item = null;
  state.selectionId = null;
  state.data = null;
  state.time = 0;
  state.scrubResume = false;
  setPlayback({ playing: false, time: 0, duration: 0, progress: 0 });
  video.removeAttribute('src');
  video.load();
  avatar?.clear();
  setSelection({ text: value ? 'Пока нет в наборе' : 'Выберите слово', status: 'Доступны шесть записанных слов РЖЯ' });
  setReady(false, value ? 'Для этого текста пока нет движения' : 'Какое слово показать?', 'empty');
  document.getElementById('text-input').setAttribute('aria-invalid', String(Boolean(value)));
  setMessage(value
    ? 'Попробуйте одно из шести слов. Предложения и отрицания требуют отдельного перевода — мы не сокращаем их до знакомого слова.'
    : 'Введите слово или выберите его из набора.', 'warning');
}

initUI({
  onSubmit: submit,
  onSelect: (id) => select(id),
  onPlayPause: () => state.playing ? pause() : play(),
  onReplay: () => { pause(); seek(0); play(); },
  onTour: startTour,
  onTourStop: () => stopTour('Демопоказ остановлен.'),
  onFrame: (delta) => {
    if (!state.data) return;
    pause();
    const frame = Math.min(state.data.frame_count - 1, Math.floor(state.time * state.data.fps + 1e-5));
    const next = Math.max(0, Math.min(state.data.frame_count - 1, frame + delta));
    seek(next / state.data.fps / state.data.duration);
  },
  onStep: (step) => {
    if (!state.catalog.length) return;
    const position = state.catalog.findIndex((item) => item.id === state.selectionId);
    const next = position < 0 ? (step > 0 ? 0 : state.catalog.length - 1) :
      (position + step + state.catalog.length) % state.catalog.length;
    select(state.catalog[next].id, state.playing || (!state.data && state.intent));
  },
  onLoop: (value) => {
    const resume = state.playing;
    if (value && state.tour) stopTour('Демопоказ завершён. Включён повтор одного слова.');
    state.loop = Boolean(value);
    setLoop(state.loop);
    if (!state.loop && state.loopGap) pause();
    else if (state.loop && resume && !state.playing) play();
  },
  onSpeed: (speed) => {
    if ([.5, .75, 1].includes(speed)) {
      state.speed = speed;
      video.playbackRate = speed;
      state.last = performance.now();
    }
  },
  onScrub: seek,
  onScrubStart: () => { state.scrubResume = state.playing; pause(); },
  onScrubEnd: () => {
    const resume = state.scrubResume;
    state.scrubResume = false;
    if (resume && state.data && demoVisible()) play();
  },
  onSeekDelta: (seconds) => { if (state.data) seek((state.time + seconds) / state.data.duration); },
  onMode: (mode) => {
    if (!['avatar', 'reference', 'compare'].includes(mode) || (!avatar && mode !== 'reference')) return;
    const wasPlaying = state.playing;
    const intent = state.intent;
    pause();
    state.intent = intent;
    state.mode = mode;
    setMode(mode);
    if (video.readyState >= 1 && activeVideo()) video.currentTime = Math.min(state.time, video.duration || state.time);
    avatar?.resize();
    if (state.data) setMessage('');
    update();
    if (wasPlaying) play();
  },
  onScene: (scene) => avatar?.setScene?.(scene),
  onAppearance: (appearance) => avatar?.setAppearance?.(appearance),
  onHelp: () => pause(),
  onTab: (tab) => { if (tab !== 'demo') pause(); },
});
setMode(state.mode);

video.addEventListener('ended', () => {
  if (usesVideo() && activeVideo() && state.data) finish();
});
video.addEventListener('waiting', () => {
  if (usesVideo() && state.playing && activeVideo()) { state.buffering = true; update(); }
});
video.addEventListener('playing', () => {
  if (usesVideo() && activeVideo()) { state.buffering = false; update(); }
});
video.addEventListener('loadedmetadata', () => {
  if (state.data && activeVideo()) video.currentTime = Math.min(state.time, video.duration || state.data.duration);
});
video.addEventListener('seeked', () => {
  if (!usesVideo() || !state.data || !activeVideo()) return;
  state.time = Math.min(state.data.duration, video.currentTime);
  state.buffering = false;
  update();
});
video.addEventListener('error', () => {
  if (!state.item || !video.getAttribute('src') || !activeVideo()) return;
  state.failedVideo = true;
  if (usesVideo()) {
    pause();
    setMessage('Исходное видео не загрузилось. Включите аватар или повторно выберите слово.', 'error');
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { state.scrubResume = false; pause(); }
});
window.addEventListener('resize', () => avatar?.resize());

try {
  const response = await fetch('./assets/sources/slovo-sources.json');
  if (!response.ok) throw new Error('Словарь недоступен');
  const manifest = await response.json();
  state.catalog = createCatalog(manifest.samples);
  setItems(state.catalog);
  const requested = new URL(window.location.href).searchParams.get('word');
  const initial = state.catalog.find((item) => item.id === requested) || state.catalog.find((item) => item.id === 'question') || state.catalog[0];
  // Start with a still frame. Motion always follows an explicit user action.
  await select(initial.id, false);
} catch (error) {
  setReady(false, 'Не удалось открыть демонстратор', 'error');
  setMessage('Проверьте соединение и обновите страницу.', 'error');
  console.error(error);
}
