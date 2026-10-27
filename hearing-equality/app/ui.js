let handlers = {};
let dictionary = [];
let selectedId = null;
let currentMode = 'avatar';
let isInitialized = false;
let scrubbing = false;

const $ = (id) => document.getElementById(id);
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const normalize = (value) => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();

function formatTime(value) {
  const seconds = Math.max(0, Number.isFinite(value) ? value : 0);
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function dispatch(name, value) {
  if (typeof handlers[name] === 'function') handlers[name](value);
}

export function showTab(name, focus = false) {
  const target = ['demo', 'dictionary', 'about'].includes(name) ? name : 'demo';
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  ['demo', 'dictionary', 'about'].forEach((id) => { $(`panel-${id}`).hidden = id !== target; });
  // Resizing observers in renderers normally react to this. A resize event also
  // supports simpler renderers when the canvas becomes visible again.
  window.dispatchEvent(new Event('resize'));
}

function updateCount() {
  $('char-count').textContent = `${$('text-input').value.length} / 160`;
}

function choose(item) {
  $('text-input').value = text(item.text, text(item.label));
  updateCount();
  showTab('demo');
  dispatch('onSelect', item.id);
}

function renderDictionary() {
  const query = normalize($('dictionary-search').value);
  const items = dictionary.filter((item) => normalize(`${item.text ?? item.label ?? ''} ${item.category ?? ''}`).includes(query));
  const list = $('dictionary-list');
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'dictionary-empty';
    empty.textContent = query ? 'В демонстрационном словаре такого слова пока нет.' : 'Записи пока не добавлены.';
    list.append(empty);
    return;
  }
  for (const item of items) {
    const article = document.createElement('article');
    article.className = 'dictionary-item';
    const heading = document.createElement('div');
    const copy = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = text(item.text, text(item.label, 'Запись'));
    const status = document.createElement('p');
    status.textContent = text(item.status, 'Требуется проверка РЖЯ');
    copy.append(name, status);
    heading.append(copy);
    if (item.category) {
      const category = document.createElement('span');
      category.className = 'dictionary-category';
      category.textContent = text(item.category);
      heading.append(category);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Показать: ${name.textContent}`);
    const label = document.createElement('span');
    label.textContent = 'Рассмотреть движение';
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(label, arrow);
    button.addEventListener('click', () => choose(item));
    article.append(heading, button);
    list.append(article);
  }
}

export function initUI(callbacks = {}) {
  handlers = { ...handlers, ...callbacks };
  if (isInitialized) return;
  isInitialized = true;
  $('text-form').addEventListener('submit', (event) => {
    event.preventDefault();
    dispatch('onSubmit', $('text-input').value.trim());
  });
  $('text-input').addEventListener('input', updateCount);
  $('text-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('text-form').requestSubmit();
    }
  });
  $('play-button').addEventListener('click', () => dispatch('onPlayPause'));
  $('replay-button').addEventListener('click', () => dispatch('onReplay'));
  $('speed-select').addEventListener('change', (event) => dispatch('onSpeed', Number(event.target.value)));
  $('progress-input').addEventListener('pointerdown', () => { scrubbing = true; });
  window.addEventListener('pointerup', () => { scrubbing = false; });
  $('progress-input').addEventListener('input', (event) => {
    const progress = Number(event.target.value) / 1000;
    event.target.style.setProperty('--progress', `${progress * 100}%`);
    dispatch('onScrub', progress);
  });
  $('progress-input').addEventListener('change', () => { scrubbing = false; });
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    setMode(button.dataset.mode);
    dispatch('onMode', currentMode);
  }));
  document.querySelectorAll('[data-tab]').forEach((button) => {
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
      else setMessage('Этот браузер не поддерживает полноэкранный режим. Можно повернуть устройство горизонтально.', 'info');
    } catch {
      setMessage('Не удалось открыть полноэкранный режим в этом браузере.', 'info');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const fullscreen = Boolean(document.fullscreenElement);
    const label = fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран';
    $('fullscreen-button').setAttribute('aria-label', label);
    $('fullscreen-button').title = label;
    window.dispatchEvent(new Event('resize'));
  });
  updateCount();
}

export function setItems(items = []) {
  dictionary = Array.isArray(items) ? items : [];
  $('dictionary-count').textContent = String(dictionary.length);
  const buttons = $('example-buttons');
  buttons.replaceChildren();
  for (const item of dictionary.slice(0, 8)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-button';
    button.dataset.itemId = String(item.id);
    button.textContent = text(item.text, text(item.label, 'Запись'));
    button.classList.toggle('active', item.id === selectedId);
    button.addEventListener('click', () => choose(item));
    buttons.append(button);
  }
  if (!dictionary.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-examples';
    empty.textContent = 'Записи пока не добавлены.';
    buttons.append(empty);
  }
  renderDictionary();
}

export function setSelection(item = {}) {
  selectedId = item.id ?? null;
  const label = text(item.text, text(item.label, 'Выберите слово'));
  $('selection-word').textContent = label;
  $('selection-status').textContent = text(item.status, 'Экспериментальная визуализация · требуется проверка РЖЯ');
  $('avatar-stage').setAttribute('aria-label', `Экспериментальная визуализация жеста: ${label}`);
  $('reference-video').setAttribute('aria-label', `Исходная запись жеста: ${label}`);
  if (item.id) {
    $('text-input').value = label;
    updateCount();
  }
  document.querySelectorAll('[data-item-id]').forEach((button) => {
    const selected = button.dataset.itemId === String(selectedId);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const sourceUrl = item.sourceUrl ?? item.source?.url;
  let safeUrl = null;
  try {
    const parsed = new URL(sourceUrl);
    if (['https:', 'http:'].includes(parsed.protocol)) safeUrl = parsed.href;
  } catch { /* Missing or malformed source stays hidden. */ }
  const source = $('selection-source');
  source.hidden = !safeUrl;
  if (safeUrl) {
    source.href = safeUrl;
    source.title = text(item.sourceName, text(item.source?.name, 'Открыть исходную запись и сведения об источнике'));
  } else source.removeAttribute('href');
}

export function setPlayback({ playing = false, progress = 0, time = 0, duration = 0 } = {}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  if (!scrubbing) {
    $('progress-input').value = String(Math.round(clamped * 1000));
    $('progress-input').style.setProperty('--progress', `${clamped * 100}%`);
  }
  $('progress-input').setAttribute('aria-valuetext', `${formatTime(time)} из ${formatTime(duration)}`);
  $('time-current').textContent = formatTime(time);
  $('time-duration').textContent = formatTime(duration);
  $('play-icon').toggleAttribute('hidden', Boolean(playing));
  $('pause-icon').toggleAttribute('hidden', !playing);
  $('play-button').setAttribute('aria-label', playing ? 'Приостановить' : 'Воспроизвести');
  $('play-button').title = playing ? 'Приостановить' : 'Воспроизвести';
}

export function setMessage(message, kind = 'info') {
  const box = $('message-box');
  box.hidden = !message;
  box.dataset.kind = ['info', 'error', 'warning', 'success'].includes(kind) ? kind : 'info';
  $('message-text').textContent = String(message ?? '');
}

export function setReady(ready, message = 'Подготавливаем демонстратор') {
  $('viewer-empty').hidden = Boolean(ready);
  $('viewer-empty-text').textContent = message;
  ['play-button', 'replay-button', 'progress-input'].forEach((id) => { $(id).disabled = !ready; });
}

export function setMode(mode) {
  currentMode = mode === 'reference' ? 'reference' : 'avatar';
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const active = button.dataset.mode === currentMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('avatar-stage').hidden = currentMode !== 'avatar';
  $('reference-stage').hidden = currentMode !== 'reference';
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  $('stage-tag').replaceChildren(dot, document.createTextNode(currentMode === 'avatar' ? 'Аватар 2D · эксперимент' : 'Исходная запись · РЖЯ'));
  window.dispatchEvent(new Event('resize'));
}
