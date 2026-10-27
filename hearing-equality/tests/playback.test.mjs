import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createCatalog, matchText, validateMotion } from '../app/catalog.js';

const source = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const manifest = JSON.parse(readFileSync(new URL('../app/assets/sources/slovo-sources.json', import.meta.url)));
const catalog = createCatalog(manifest.samples);
const motions = new Map(catalog.map(item => {
  const data = JSON.parse(readFileSync(new URL('../app/' + item.motion.slice(2), import.meta.url)));
  // Rendering is stubbed; retain the actual recording's timing and schema.
  return [item.id, { ...data, frames: data.frames.map(() => ({})) }];
}));
const base = 'https://example.test/hearing-equality/app/';
const wholeTourMs = [...motions.values()].reduce((sum, motion) => sum + motion.duration * 1000, 0) + 5 * 900 + 1000;

async function harness({ reducedMotion = false } = {}) {
  let now = 0, nextId = 1, handlers;
  const raf = new Map(), timers = new Map(), held = new Map(), listeners = new Map();
  const ui = { selected: [], playback: {}, tour: {}, ready: false, errors: [], toasts: [] };
  const emit = (name) => { for (const callback of listeners.get(name) ?? []) callback(); };
  const videoListeners = new Map();
  const video = {
    src: '', currentTime: 0, duration: 0, readyState: 4, paused: true, playbackRate: 1,
    get currentSrc() { return this.src ? new URL(this.src, base).href : ''; },
    getAttribute(name) { return name === 'src' ? this.src : null; },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    addEventListener(name, callback) {
      if (!videoListeners.has(name)) videoListeners.set(name, []);
      videoListeners.get(name).push(callback);
    },
    emit(name) { for (const callback of videoListeners.get(name) ?? []) callback(); },
    load() {
      const item = catalog.find(entry => entry.video === this.src);
      this.currentTime = 0;
      this.duration = item ? motions.get(item.id).duration : 0;
      this.emit('loadedmetadata');
    },
    pause() { this.paused = true; },
    async play() { this.paused = false; },
  };
  const elements = new Map([['reference-video', video]]);
  const document = {
    hidden: false, baseURI: base,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { hidden: false, setAttribute() {}, focus() {} });
      return elements.get(id);
    },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
  };
  const context = vm.createContext({
    document, window: { location: { href: base }, addEventListener() {} },
    performance: { now: () => now }, matchMedia: () => ({ matches: reducedMotion }),
    URL, AbortController, createCatalog, matchText, validateMotion,
    console: { warn() {}, error: error => ui.errors.push(error) },
    CanvasAvatar: class { load() {} showAt() {} resize() {} clear() {} setScene() {} setAppearance() {} },
    initUI: callbacks => { handlers = callbacks; },
    setItems() {}, setMode() {}, setLoop() {}, revealViewer() {},
    setSelection: item => { ui.selected.push(item.id ?? null); },
    setPlayback: value => { ui.playback = { ...value }; },
    setTour: value => { ui.tour = { ...value }; },
    setReady: value => { ui.ready = value; },
    setMessage: (text, kind) => { ui.message = { text, kind }; },
    showToast: text => ui.toasts.push(text),
    requestAnimationFrame: callback => { const id = nextId++; raf.set(id, callback); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    setTimeout: (callback, delay) => { const id = nextId++; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async path => {
      if (path.endsWith('slovo-sources.json')) return { ok: true, json: async () => manifest };
      const item = catalog.find(entry => entry.motion === path);
      assert.ok(item, 'Only known local motion files may be fetched');
      if (held.has(item.id)) await held.get(item.id).promise;
      return { ok: true, json: async () => motions.get(item.id) };
    },
  });
  await new vm.Script('(async () => {\n' + source + '\n})()', { filename: 'app.js' }).runInContext(context);
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function advance(ms, frameMs = 25) {
    const end = now + ms;
    while (now < end) {
      const soonest = Math.min(...[...timers.values()].map(timer => timer.at), Infinity);
      const next = Math.min(end, now + frameMs, soonest);
      const delta = next - now;
      now = next;
      if (!video.paused && video.duration) {
        video.currentTime = Math.min(video.duration, video.currentTime + delta / 1000 * video.playbackRate);
        if (video.currentTime >= video.duration) { video.paused = true; video.emit('ended'); }
      }
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
      await flush();
      const callbacks = [...raf.values()];
      raf.clear();
      for (const callback of callbacks) callback(now);
      await flush();
    }
  }
  async function startAtFirstGap() {
    handlers.onTour();
    await flush();
    await advance(motions.get('hello').duration * 1000 + 25);
    assert.equal(ui.playback.advancing, true, 'The first recording has ended, but the next has not begun');
    assert.equal(ui.selected.at(-1), 'hello');
  }
  return {
    handlers, ui, flush, advance, startAtFirstGap,
    visibility(hidden) { document.hidden = hidden; emit('visibilitychange'); },
    hold(id) {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      held.set(id, { promise });
      return () => { held.delete(id); resolve(); };
    },
  };
}

test('tour plays each of the six recordings once and finishes stopped', async () => {
  const app = await harness();
  assert.equal(app.ui.playback.playing, false, 'Initial load is a still view');
  app.handlers.onTour();
  await app.flush();
  await app.advance(wholeTourMs);
  assert.deepEqual(app.ui.selected.slice(1), catalog.map(item => item.id));
  assert.equal(app.ui.tour.active, false);
  assert.equal(app.ui.playback.playing, false);
  assert.equal(app.ui.toasts.length, 1);
  assert.deepEqual(app.ui.errors, []);
});

test('pause during the 900 ms gap cancels advance; resume selects the next word once', async () => {
  const app = await harness();
  await app.startAtFirstGap();
  app.handlers.onPlayPause();
  await app.advance(1500);
  assert.equal(app.ui.selected.at(-1), 'hello');
  assert.equal(app.ui.playback.playing, false);
  assert.equal(app.ui.tour.active, true);
  app.handlers.onPlayPause();
  await app.flush();
  await app.advance(100);
  assert.deepEqual(app.ui.selected.slice(1), ['hello', 'yes']);
  assert.equal(app.ui.playback.playing, true);
});

test('manual selection and unsupported text cancel old tour transitions', async () => {
  for (const unknown of [false, true]) {
    const app = await harness();
    await app.startAtFirstGap();
    if (unknown) app.handlers.onSubmit('не работать');
    else app.handlers.onSelect('friend');
    await app.flush();
    await app.advance(3000);
    assert.deepEqual(app.ui.selected.slice(1), ['hello', unknown ? null : 'friend']);
    assert.equal(app.ui.tour.active, false);
    assert.equal(app.ui.playback.playing, false);
    if (unknown) assert.equal(app.ui.ready, false);
  }
});

test('changing to comparison during the gap cannot double-advance the tour', async () => {
  const app = await harness();
  await app.startAtFirstGap();
  app.handlers.onMode('compare');
  await app.flush();
  await app.advance(wholeTourMs);
  assert.deepEqual(app.ui.selected.slice(1), catalog.map(item => item.id));
  assert.equal(app.ui.tour.active, false);
  assert.equal(app.ui.playback.playing, false);
});

test('reduced motion keeps normal selection still but permits an explicit tour', async () => {
  const app = await harness({ reducedMotion: true });
  app.handlers.onSelect('hello');
  await app.flush();
  await app.advance(2500);
  assert.equal(app.ui.playback.playing, false);
  assert.equal(app.ui.playback.time, 0);
  app.handlers.onTour();
  await app.flush();
  assert.equal(app.ui.playback.playing, true);
  await app.advance(wholeTourMs);
  assert.deepEqual(app.ui.selected.slice(2), catalog.map(item => item.id));
});

test('hiding during an outstanding load cancels playback intent without losing tour position', async () => {
  const app = await harness();
  const release = app.hold('hello');
  app.handlers.onTour();
  await app.flush();
  assert.equal(app.ui.ready, false);
  app.visibility(true);
  release();
  await app.flush();
  app.visibility(false);
  await app.advance(1500);
  assert.equal(app.ui.ready, true);
  assert.equal(app.ui.playback.playing, false);
  assert.equal(app.ui.tour.active, true);
  assert.equal(app.ui.selected.at(-1), 'hello');
  app.handlers.onPlayPause();
  await app.flush();
  assert.equal(app.ui.playback.playing, true);
});

test('a delayed animation frame does not silently slow the selected playback rate', async () => {
  const app = await harness();
  app.handlers.onReplay();
  await app.advance(1000, 1000);
  assert.ok(Math.abs(app.ui.playback.time - 1) < 1e-6);
  app.handlers.onPlayPause();
  await app.advance(1000, 1000);
  assert.ok(Math.abs(app.ui.playback.time - 1) < 1e-6, 'Paused time must not advance');
});
