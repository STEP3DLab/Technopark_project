import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/vision.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const landmarks = marker => ({ poseLandmarks: [{ x: marker, y: .5, z: 0, visibility: 1 }] });

function harness(behaviors = [], { script = false } = {}) {
  const instances = [], scripts = [], timers = new Map();
  let timerId = 0, now = 0;
  class Holistic {
    constructor() {
      this.behavior = behaviors[instances.length] || {};
      this.initializeCount = this.resetCount = this.sendCount = this.closeCount = 0;
      instances.push(this);
    }
    setOptions(options) { this.options = options; }
    onResults(callback) { this.callback = callback; }
    initialize() { this.initializeCount++; return this.behavior.initialize?.(this) || Promise.resolve(); }
    send({ image }) {
      this.sendCount++;
      if (this.behavior.send) return this.behavior.send(this, image);
      this.callback(landmarks(image));
      return Promise.resolve();
    }
    reset() { this.resetCount++; return this.behavior.reset?.(this) || Promise.resolve(); }
    close() { this.closeCount++; return this.behavior.close?.(this) || Promise.resolve(); }
  }
  const window = script ? {} : { Holistic };
  const context = vm.createContext({
    window, Promise, console,
    document: {
      createElement(tag) {
        return tag === 'canvas'
          ? { getContext: () => ({ getExtension: () => ({ loseContext() {} }) }) }
          : { removed: false, remove() { this.removed = true; } };
      },
      head: { append(element) { scripts.push(element); } },
    },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  const api = vm.runInContext(`${source}\n({ loadVision, detect, resetVision })`, context);
  return {
    api, instances, scripts, window, Holistic, timers,
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
  };
}

test('concurrent loading initializes one model and serialized frames keep their own result', async () => {
  const gate = deferred();
  const h = harness([{ initialize: () => gate.promise }]);
  const loads = [h.api.loadVision(), h.api.loadVision()];
  await flush();
  assert.equal(h.instances.length, 1);
  assert.equal(h.instances[0].initializeCount, 1);
  gate.resolve(); await Promise.all(loads);
  const results = await Promise.all([h.api.detect(.2), h.api.detect(.8)]);
  assert.equal(results[0].pose[0][0], .2);
  assert.equal(results[1].pose[0][0], .8);
  assert.equal(h.timers.size, 0);
});

test('initialization timeout is recoverable even when cleanup never finishes', async () => {
  const initialization = deferred(), cleanup = deferred();
  const h = harness([{ initialize: () => initialization.promise, close: () => cleanup.promise }, {}]);
  const first = h.api.loadVision();
  const rejected = assert.rejects(first, /за минуту/);
  await flush(); h.advance(60000); await rejected;
  assert.equal(h.instances[0].closeCount, 1);
  await h.api.loadVision();
  assert.equal(h.instances.length, 2);
  initialization.resolve(); await flush();
  assert.equal((await h.api.detect(.7)).pose[0][0], .7);
  assert.equal(h.instances[0].sendCount, 0, 'Late initialization must not replace the new model');
});

test('frame watchdog releases the queue and ignores a retired model callback', async () => {
  const oldSend = deferred(), newSend = deferred();
  const h = harness([{ send: () => oldSend.promise }, { send: () => newSend.promise }]);
  const first = h.api.detect(.1);
  const rejected = assert.rejects(first, /Обработка кадра остановилась/);
  await flush(); h.advance(15000); await rejected;
  const second = h.api.detect(.8); await flush();
  assert.equal(h.instances.length, 2);
  h.instances[1].callback(landmarks(.8));
  h.instances[0].callback(landmarks(.1));
  oldSend.resolve(); newSend.resolve();
  assert.equal((await second).pose[0][0], .8);
  assert.equal(h.instances[0].closeCount, 1);
});

test('reset waits for an active frame and times out without poisoning later captures', async () => {
  const frame = deferred(), reset = deferred();
  const h = harness([{ send: () => frame.promise, reset: () => reset.promise }, {}]);
  const first = h.api.detect(.3); await flush();
  const restarting = h.api.resetVision();
  const rejected = assert.rejects(restarting, /подготовить модель/);
  await flush(); assert.equal(h.instances[0].resetCount, 0);
  h.instances[0].callback(landmarks(.3)); frame.resolve(); await first; await flush();
  assert.equal(h.instances[0].resetCount, 1);
  h.advance(8000); await rejected;
  assert.equal((await h.api.detect(.6)).pose[0][0], .6);
  reset.resolve(); await flush();
  assert.equal(h.instances.length, 2);
});

test('script timeout removes stale handlers and a late load cannot complete a retry', async () => {
  const h = harness([], { script: true });
  const first = h.api.loadVision(), rejected = assert.rejects(first, /слишком много времени/);
  const obsoleteOnload = h.scripts[0].onload;
  h.advance(45000); await rejected;
  assert.equal(h.scripts[0].removed, true);
  assert.equal(h.scripts[0].onload, null);
  let done = false;
  const retry = h.api.loadVision().then(() => { done = true; });
  assert.equal(h.scripts.length, 2);
  h.window.Holistic = h.Holistic;
  obsoleteOnload(); await flush();
  assert.equal(done, false);
  assert.equal(h.instances.length, 0);
  h.scripts[1].onload(); await retry;
  assert.equal((await h.api.detect(.5)).pose[0][0], .5);
});

test('a send error or missing callback retires the model and allows a clean retry', async () => {
  const h = harness([{ send: () => Promise.reject(new Error('context lost')) }, { send: () => Promise.resolve() }, {}]);
  await assert.rejects(h.api.detect(.2), /context lost/);
  await assert.rejects(h.api.detect(.4), /не вернула результат/);
  assert.equal((await h.api.detect(.9)).pose[0][0], .9);
  assert.equal(h.instances[0].closeCount, 1);
  assert.equal(h.instances[1].closeCount, 1);
});
