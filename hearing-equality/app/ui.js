let handlers = {};
let dictionary = [];
let selectedId = null;
let currentMode = 'avatar';
let isInitialized = false;
let scrubbing = false;
let ready = false;
let presentation = false;
let scene = 'dark';
let loop = false;
let lastPlaybackStatus = '';
let returnFocus = null;
let inertElements = [];
let announceTimer = 0;

const $ = (id) => document.getElementById(id);
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const normalize = (value) => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
const editable = (target) => target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
const interactive = (target) => target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,[role="tab"],[role="slider"],[contenteditable="true"]'));

function put(id, value) {
  const element = $(id);
  if (element && element.textContent !== value) element.textContent = value;
}
function dispatch(name, value) {
  if (typeof handlers[name] === 'function') handlers[name](value);
}
function preference(key, value) {
  try {
    if (value !== undefined) localStorage.setItem('rsl-studio-' + key, value);
    return localStorage.getItem('rsl-studio-' + key);
  } catch { return null; }
}
function labelButton(id, label) {
  const button = $(id);
  if (!button) return;
  button.setAttribute('aria-label', label);
  const shortcut = { 'play-button': ' · Пробел', 'focus-button': ' · F', 'loop-button': ' · L' }[id] || '';
  button.title = label + shortcut;
  const slot = button.querySelector('[data-label]');
  if (slot) slot.textContent = label;
}
function formatTime(value) {
  const seconds = Math.max(0, Number.isFinite(value) ? value : 0);
  return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
function announce(value) {
  const status = $('a11y-status');
  if (!status) return;
  clearTimeout(announceTimer);
  status.textContent = '';
  announceTimer = setTimeout(() => { status.textContent = value; }, 60);
}

export function showTab(name, focus = false) {
  const target = ['demo', 'dictionary', 'about'].includes(name) ? name : 'demo';
  if (target !== 'demo' && presentation) setPresentation(false);
  document.querySelectorAll('button[data-tab]').forEach((button) => {
    const active = button.dataset.tab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  ['demo', 'dictionary', 'about'].forEach((id) => { $('panel-' + id).hidden = id !== target; });
  dispatch('onTab', target);
  window.dispatchEvent(new Event('resize'));
}

function updateCount() {
  put('char-count', $('text-input').value.length + ' / 160');
}
export function revealViewer(force = false) {
  const viewer = $('viewer-card');
  const rect = viewer.getBoundingClientRect();
  if (force || (matchMedia('(max-width: 890px)').matches && (rect.top < -20 || rect.top > innerHeight * .35))) {
    viewer.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
}
function choose(item, fromDictionary = false) {
  $('text-input').value = text(item.text, text(item.label));
  $('text-input').removeAttribute('aria-invalid');
  updateCount();
  showTab('demo');
  dispatch('onSelect', item.id);
  if (fromDictionary) {
    $('selection-word').focus({ preventScroll: true });
  }
  revealViewer(fromDictionary);
}
function renderDictionary() {
  const query = normalize($('dictionary-search').value);
  const items = dictionary.filter((item) => normalize(item.text ?? item.label ?? '').includes(query));
  const list = $('dictionary-list');
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'dictionary-empty';
    empty.textContent = query ? 'Такого слова пока нет. Попробуйте «Привет», «Друг» или «Вопрос».' : 'Записи пока не добавлены.';
    list.append(empty);
    return;
  }
  for (const item of items) {
    const article = document.createElement('article');
    article.className = 'dictionary-item';
    article.classList.toggle('active', item.id === selectedId);
    const heading = document.createElement('div');
    const copy = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = text(item.text, text(item.label, 'Запись'));
    const status = document.createElement('p');
    status.textContent = 'Аватар + исходная запись';
    copy.append(name, status);
    heading.append(copy);
    const category = document.createElement('span');
    category.className = 'dictionary-category';
    category.textContent = String(dictionary.indexOf(item) + 1).padStart(2, '0');
    heading.append(category);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.itemId = String(item.id);
    button.setAttribute('aria-label', 'Показать: ' + name.textContent);
    button.setAttribute('aria-pressed', String(item.id === selectedId));
    const label = document.createElement('span');
    label.textContent = 'Показать движение';
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(label, arrow);
    button.addEventListener('click', () => choose(item, true));
    article.append(heading, button);
    list.append(article);
  }
}

export function setPresentation(active) {
  const next = Boolean(active);
  if (next === presentation) return;
  presentation = next;
  const viewer = $('viewer-card');
  if (next) {
    returnFocus = document.activeElement;
    let branch = viewer;
    while (branch.parentElement && branch.parentElement !== document.documentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling.id !== 'a11y-status' && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
          inertElements.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    document.body.classList.add('presentation-mode');
    $('focus-button').focus({ preventScroll: true });
  } else {
    document.body.classList.remove('presentation-mode');
    for (const [element, previous] of inertElements) element.inert = previous;
    inertElements = [];
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  $('focus-button')?.setAttribute('aria-pressed', String(next));
  labelButton('focus-button', next ? 'Выйти из показа' : 'Режим показа');
  announce(next ? 'Режим показа. Для выхода нажмите Escape или кнопку «Выйти из показа».' : 'Режим показа закрыт.');
  window.dispatchEvent(new Event('resize'));
}
export function setScene(value) {
  scene = value === 'light' ? 'light' : 'dark';
  $('viewer-card').dataset.scene = scene;
  $('theme-toggle')?.setAttribute('aria-pressed', String(scene === 'light'));
  labelButton('theme-toggle', scene === 'light' ? 'Тёмный фон' : 'Светлый фон');
  preference('scene', scene);
  dispatch('onScene', scene);
}
export function setLoop(value) {
  loop = Boolean(value);
  $('loop-button')?.setAttribute('aria-pressed', String(loop));
  $('loop-button')?.classList.toggle('active', loop);
  labelButton('loop-button', loop ? 'Повтор включён' : 'По кругу');
}
function finishScrub() {
  if (!scrubbing) return;
  scrubbing = false;
  dispatch('onScrubEnd');
}
async function share() {
  const url = new URL(window.location.href);
  if (selectedId) url.searchParams.set('word', selectedId);
  else url.searchParams.delete('word');
  url.hash = '';
  try {
    await navigator.clipboard.writeText(url.href);
    setMessage('Ссылка на выбранное слово скопирована.', 'success');
  } catch {
    setMessage('Ссылка на выбранное слово находится в адресной строке — её можно скопировать.', 'info');
  }
}

export function initUI(callbacks = {}) {
  handlers = { ...handlers, ...callbacks };
  if (isInitialized) return;
  isInitialized = true;
  if (!$('a11y-status')) {
    const status = document.createElement('div');
    status.id = 'a11y-status';
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    document.body.append(status);
  }
  // A single persistent live region avoids frame-by-frame announcements.
  $('message-box').removeAttribute('aria-live');
  $('message-box').removeAttribute('role');
  $('playback-status')?.removeAttribute('aria-live');
  $('playback-status')?.removeAttribute('role');
  $('selection-word').tabIndex = -1;
  $('viewer-card').tabIndex = -1;
  $('text-form').addEventListener('submit', (event) => {
    event.preventDefault();
    dispatch('onSubmit', $('text-input').value.trim());
  });
  $('text-input').addEventListener('input', () => {
    updateCount();
    $('text-input').removeAttribute('aria-invalid');
  });
  $('text-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $('text-form').requestSubmit();
    }
  });
  $('play-button').addEventListener('click', () => dispatch('onPlayPause'));
  $('replay-button').addEventListener('click', () => dispatch('onReplay'));
  $('prev-button')?.addEventListener('click', () => dispatch('onStep', -1));
  $('next-button')?.addEventListener('click', () => dispatch('onStep', 1));
  $('loop-button')?.addEventListener('click', () => dispatch('onLoop', !loop));
  $('theme-toggle')?.addEventListener('click', () => setScene(scene === 'dark' ? 'light' : 'dark'));
  $('focus-button')?.addEventListener('click', () => setPresentation(!presentation));
  $('share-button')?.addEventListener('click', share);
  const storedSpeed = Number(preference('speed'));
  if ([.5, .75, 1].includes(storedSpeed)) $('speed-select').value = String(storedSpeed);
  dispatch('onSpeed', Number($('speed-select').value));
  $('speed-select').addEventListener('change', (event) => {
    const value = Number(event.target.value);
    preference('speed', String(value));
    dispatch('onSpeed', value);
  });
  const progress = $('progress-input');
  progress.addEventListener('pointerdown', () => {
    if (!ready) return;
    scrubbing = true;
    dispatch('onScrubStart');
  });
  window.addEventListener('pointerup', finishScrub);
  window.addEventListener('pointercancel', finishScrub);
  progress.addEventListener('lostpointercapture', finishScrub);
  progress.addEventListener('input', (event) => {
    const value = Number(event.target.value) / 1000;
    event.target.style.setProperty('--progress', value * 100 + '%');
    dispatch('onScrub', value);
  });
  progress.addEventListener('change', finishScrub);
  document.querySelectorAll('button[data-mode]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.mode !== currentMode) dispatch('onMode', button.dataset.mode);
  }));
  document.querySelectorAll('button[data-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      const names = ['demo', 'dictionary', 'about'];
      let index = names.indexOf(button.dataset.tab);
      if (event.key === 'ArrowRight') index = (index + 1) % names.length;
      else if (event.key === 'ArrowLeft') index = (index + names.length - 1) % names.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = names.length - 1;
      else return;
      event.preventDefault();
      showTab(names[index], true);
    });
  });
  $('open-dictionary').addEventListener('click', () => showTab('dictionary', true));
  $('dictionary-search').addEventListener('input', renderDictionary);
  $('fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('viewer-card').requestFullscreen) await $('viewer-card').requestFullscreen();
      else setPresentation(true);
    } catch { setPresentation(true); }
  });
  document.addEventListener('fullscreenchange', () => {
    labelButton('fullscreen-button', document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'На весь экран');
    window.dispatchEvent(new Event('resize'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && presentation) {
      event.preventDefault();
      setPresentation(false);
      return;
    }
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        editable(event.target) || $('panel-demo').hidden) return;
    const code = event.code;
    if (code === 'KeyF' && !event.repeat) {
      event.preventDefault();
      setPresentation(!presentation);
    } else if (ready && code === 'Space' && !event.repeat && !interactive(event.target)) {
      event.preventDefault();
      dispatch('onPlayPause');
    } else if (ready && code === 'KeyR' && !event.repeat) {
      event.preventDefault();
      dispatch('onReplay');
    } else if (ready && code === 'KeyL' && !event.repeat) {
      event.preventDefault();
      dispatch('onLoop', !loop);
    } else if (ready && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      if (event.target instanceof Element && event.target.closest('[role="tab"],[role="slider"]')) return;
      event.preventDefault();
      dispatch('onSeekDelta', (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .5 : .1));
    }
  });
  setScene(preference('scene') || 'dark');
  setLoop(false);
  updateCount();
}

export function setItems(items = []) {
  dictionary = Array.isArray(items) ? items : [];
  put('dictionary-count', String(dictionary.length));
  const buttons = $('example-buttons');
  buttons.replaceChildren();
  dictionary.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-button';
    button.dataset.itemId = String(item.id);
    button.setAttribute('aria-pressed', String(item.id === selectedId));
    button.setAttribute('aria-label', 'Показать: ' + text(item.text, item.label));
    const number = document.createElement('span');
    number.className = 'example-number';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'example-label';
    label.textContent = text(item.text, text(item.label, 'Запись'));
    const arrow = document.createElement('span');
    arrow.className = 'example-arrow';
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(number, label, arrow);
    button.classList.toggle('active', item.id === selectedId);
    button.addEventListener('click', () => choose(item));
    buttons.append(button);
  });
  renderDictionary();
}

export function setSelection(item = {}) {
  selectedId = item.id ?? null;
  const label = text(item.text, text(item.label, 'Выберите слово'));
  put('selection-word', label);
  put('selection-status', text(item.status, 'Демонстратор РЖЯ. Понятность анимации ещё предстоит проверить.'));
  const position = dictionary.findIndex((entry) => entry.id === selectedId);
  put('selection-index', position < 0 ? '— / ' + dictionary.length : String(position + 1).padStart(2, '0') + ' / ' + String(dictionary.length).padStart(2, '0'));
  $('avatar-stage').setAttribute('aria-label', 'Аватар показывает: ' + label);
  $('reference-video').setAttribute('aria-label', 'Исходная запись: ' + label);
  if (item.id) {
    $('text-input').value = label;
    $('text-input').removeAttribute('aria-invalid');
    updateCount();
  }
  const url = new URL(window.location.href);
  if (item.id) url.searchParams.set('word', item.id);
  else url.searchParams.delete('word');
  history.replaceState(null, '', url);
  document.querySelectorAll('button[data-item-id]').forEach((button) => {
    const selected = button.dataset.itemId === String(selectedId);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.closest('.dictionary-item')?.classList.toggle('active', selected);
  });
  const sourceUrl = item.sourceUrl ?? item.source?.url;
  let safeUrl = null;
  try {
    const parsed = new URL(sourceUrl);
    if (['https:', 'http:'].includes(parsed.protocol)) safeUrl = parsed.href;
  } catch { /* An unavailable source has no link. */ }
  const source = $('selection-source');
  source.hidden = !safeUrl;
  if (safeUrl) {
    source.href = safeUrl;
    source.title = 'Открыть исходную видеозапись Slovo';
  } else source.removeAttribute('href');
  announce(selectedId ? 'Выбрано слово «' + label + '».' : label);
}

export function setPlayback({ playing = false, progress = 0, time = 0, duration = 0, buffering = false, repeating = false } = {}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  if (!scrubbing) {
    $('progress-input').value = String(Math.round(clamped * 1000));
    $('progress-input').style.setProperty('--progress', clamped * 100 + '%');
  }
  $('progress-input').setAttribute('aria-valuetext', time.toFixed(1) + ' из ' + duration.toFixed(1) + ' секунды');
  put('time-current', formatTime(time));
  put('time-duration', formatTime(duration));
  $('play-icon').toggleAttribute('hidden', Boolean(playing));
  $('pause-icon').toggleAttribute('hidden', !playing);
  const label = playing ? 'Приостановить' : time > 0 && time >= duration - .025 ? 'Воспроизвести снова' : 'Воспроизвести';
  labelButton('play-button', label);
  $('viewer-card').dataset.playing = String(playing);
  const status = !ready ? 'Загрузка' : repeating ? 'Повтор через мгновение' : buffering && playing ? 'Загрузка видео' : playing ? 'Воспроизведение' :
    duration > 0 && time >= duration - .025 ? 'Просмотр завершён' : time > 0 ? 'На паузе' : 'Готов к показу';
  if (status !== lastPlaybackStatus) {
    put('playback-status', status);
    lastPlaybackStatus = status;
  }
}

export function setMessage(message, kind = 'info') {
  const box = $('message-box');
  box.hidden = !message;
  box.dataset.kind = ['info', 'error', 'warning', 'success'].includes(kind) ? kind : 'info';
  put('message-text', String(message ?? ''));
  const sceneMessage = $('scene-message');
  if (sceneMessage) {
    sceneMessage.hidden = !message || !['warning', 'error'].includes(kind);
    sceneMessage.dataset.kind = kind;
    put('scene-message-text', String(message ?? ''));
  }
  if (message) announce(String(message));
}

export function setReady(value, message = 'Подготавливаем аватар', kind = 'loading') {
  ready = Boolean(value);
  $('viewer-empty').hidden = ready;
  $('viewer-card').setAttribute('aria-busy', String(!ready && kind === 'loading'));
  $('viewer-empty').dataset.state = kind;
  put('viewer-empty-text', message);
  const caption = $('viewer-empty').querySelector(':scope > span');
  if (caption) caption.textContent = kind === 'empty' ? 'Выберите слово из набора справа или ниже' :
    kind === 'error' ? 'Проверьте соединение и повторите выбор' : 'Это займёт несколько секунд';
  ['play-button', 'replay-button', 'progress-input', 'loop-button'].forEach((id) => {
    if ($(id)) $(id).disabled = !ready;
  });
  ['prev-button', 'next-button'].forEach((id) => { if ($(id)) $(id).disabled = dictionary.length < 2; });
  if (!ready) {
    put('playback-status', kind === 'loading' ? 'Загрузка' : 'Выберите слово');
    lastPlaybackStatus = '';
    if (message) announce(message);
  }
}

export function setMode(mode) {
  currentMode = ['avatar', 'reference', 'compare'].includes(mode) ? mode : 'avatar';
  $('viewer-card').dataset.mode = currentMode;
  document.querySelectorAll('button[data-mode]').forEach((button) => {
    const active = button.dataset.mode === currentMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('avatar-stage').hidden = currentMode === 'reference';
  $('reference-stage').hidden = currentMode === 'avatar';
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  const label = currentMode === 'compare' ? 'Аватар + исходная запись' :
    currentMode === 'avatar' ? 'Аватар · РЖЯ' : 'Исходная запись · РЖЯ';
  $('stage-tag').replaceChildren(dot, document.createTextNode(label));
  window.dispatchEvent(new Event('resize'));
}
