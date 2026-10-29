import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const base = 'https://example.test/Technopark_project/hearing-equality/app/';
const moduleSource = readFileSync(new URL('../app/demo-cache.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '').replaceAll('import.meta.url', JSON.stringify(`${base}demo-cache.js?v=0.10.1`));
const workerSource = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/, '').replace(/^export /gm, '');
const catalog = Array.from({ length: 6 }, (_, i) => {
  const id = `${String(i + 1).padStart(8, '0')}-1111-2222-3333-444444444444`;
  return { motion: `./assets/motion/${id}.json`, video: `./assets/sources/${id}.mp4` };
});
const flush = () => new Promise(resolve => setImmediate(resolve));

function storage() {
  const names = new Map();
  return {
    names,
    async open(name) {
      if (!names.has(name)) {
        const entries = new Map();
        names.set(name, { entries,
          async match(key) { return entries.get(typeof key === 'string' ? key : key.url)?.clone(); },
          async put(key, response) { entries.set(typeof key === 'string' ? key : key.url, response.clone()); },
        });
      }
      return names.get(name);
    },
    async keys() { return [...names.keys()]; },
    async delete(name) { return names.delete(name); },
  };
}

function harness({ fetcher, controlled = true } = {}) {
  const caches = storage(), fetched = [], listeners = new Map(), timers = new Map();
  let id = 0, clock = 0, registrations = 0;
  const active = { scriptURL: `${base}sw.js?v=0.10.1&cache=2`, state: 'activated', addEventListener() {}, removeEventListener() {}, postMessage() {} };
  const registration = { active, scope: base };
  const serviceWorker = {
    controller: controlled ? active : null,
    async register(url, options) { registrations++; assert.equal(url, active.scriptURL); assert.equal(options.scope, base); assert.equal(options.type, 'module'); return registration; },
    async getRegistration() { return registration; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const context = vm.createContext({
    URL, Response, Request, Headers, AbortController, Date, Promise, console,
    isSecureContext: true, caches, navigator: { serviceWorker },
    fetch: async (url, options) => { fetched.push(String(url)); return fetcher ? fetcher(url, options) : new Response(`asset:${url}`, { status: 200 }); },
    setTimeout(callback, ms) { timers.set(++id, { callback, at: clock + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
  });
  const api = vm.runInContext(`${moduleSource}\n({ prepareDemoAssets, readDemoCacheStatus, APP_VERSION, APP_BASE, CACHE_PREFIX, CACHE_NAME, MANIFEST_URL, STATIC_URLS, canonicalAssetURL, validDemoManifest, buildDemoManifest, readPreparedBundle, hasCompleteDemoBundle })`, context);
  return { api, caches, fetched, serviceWorker, registration, context, registrations: () => registrations,
    advance(ms) { clock += ms; for (const [key, timer] of [...timers]) if (timer.at <= clock) { timers.delete(key); timer.callback(); } },
  };
}

function workerHarness(h, fetcher = async () => { throw new Error('offline'); }) {
  const handlers = new Map(); let claimed = 0, activated = 0;
  const context = vm.createContext({ ...h.api, URL, Response, Request, Headers, AbortController, console,
    caches: h.caches, fetch: fetcher, setTimeout, clearTimeout,
    self: { addEventListener(type, callback) { handlers.set(type, callback); }, skipWaiting: async () => { activated++; }, clients: { claim: async () => { claimed++; } } },
  });
  return { ...vm.runInContext(`${workerSource}\n({ rangeResponse, handleDemoRequest })`, context), handlers, claimed: () => claimed, activated: () => activated };
}

test('a complete prepared bundle has every curated file and an active controller', async () => {
  const h = harness(), progress = [];
  const result = await h.api.prepareDemoAssets(catalog, { onProgress: value => progress.push(value) });
  assert.equal(result.total, 34); assert.equal(result.cached, 34); assert.equal(result.failed.length, 0);
  assert.equal(result.offlineReady, true); assert.equal(result.needsReload, false);
  assert.equal(h.fetched.length, 34); assert.ok(progress.length >= 34);
  assert.ok(h.fetched.every(url => url.startsWith(base)), 'No third-party model or personal data URL is fetched');
  const status = await h.api.readDemoCacheStatus(); assert.equal(status.offlineReady, true);
  assert.equal(h.api.canonicalAssetURL('platform.js'), `${base}platform.js?v=0.10.1`);
  assert.equal(h.api.canonicalAssetURL('platform.js?v=0.9'), null, 'Old release assets must not be silently substituted');
});

test('partial download failures are visible and eviction revokes readiness', async () => {
  const h = harness({ fetcher: url => new Response('file', { status: new URL(url).pathname.endsWith('manrope.woff2') ? 503 : 200 }) });
  const partial = await h.api.prepareDemoAssets(catalog);
  assert.equal(partial.cached, 0); assert.equal(partial.downloaded, 33); assert.equal(partial.failed.length, 1); assert.equal(partial.offlineReady, false);
  assert.equal(h.registrations(), 0, 'A partial first bundle must not activate a worker');
  assert.match(partial.failed[0].reason, /503/);
  const full = harness(); await full.api.prepareDemoAssets(catalog);
  (await full.api.readPreparedBundle()).assets.entries.delete(new URL(catalog[0].video, base).href);
  const status = await full.api.readDemoCacheStatus();
  assert.equal(status.cached, 33); assert.equal(status.offlineReady, false); assert.equal(status.failed.length, 1);
});

test('cached files alone do not claim offline readiness before this worker controls the page', async () => {
  const h = harness(); await h.api.prepareDemoAssets(catalog); h.serviceWorker.controller = null;
  const status = await h.api.readDemoCacheStatus();
  assert.equal(status.cached, 34); assert.equal(status.offlineReady, false); assert.equal(status.needsReload, true);
  h.registration.active.scriptURL = `${base}sw.js?v=0.9`;
  const wrong = await h.api.readDemoCacheStatus(); assert.equal(wrong.needsReload, false); assert.equal(wrong.offlineReady, false);
});

test('untrusted catalog paths and duplicate records are rejected before any download', async () => {
  const h = harness(), external = catalog.map(item => ({ ...item }));
  external[0].video = 'https://elsewhere.test/private.mp4';
  assert.equal((await h.api.prepareDemoAssets(external)).offlineReady, false);
  assert.equal((await h.api.prepareDemoAssets(Array(6).fill(catalog[0]))).offlineReady, false);
  assert.equal(h.fetched.length, 0);
  assert.equal(h.api.canonicalAssetURL('../private.json'), null);
  assert.equal(h.api.canonicalAssetURL('assets/recognition-library.json?secret=anything'), null);
});

test('download timeout and cancellation finish with explicit failures instead of hanging', async () => {
  const external = new AbortController();
  const h = harness({ fetcher: (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  const snapshots = [], pending = h.api.prepareDemoAssets(catalog, { signal: external.signal, onProgress: value => snapshots.push(value) });
  await flush(); h.advance(18000); await flush(); external.abort();
  const result = await pending;
  assert.equal(result.cached, 0); assert.equal(result.failed.length, 34); assert.equal(result.offlineReady, false);
  assert.ok(result.failed.some(entry => /18 секунд/.test(entry.reason)));
  assert.ok(result.failed.some(entry => /отменена/.test(entry.reason)));
});

test('cached MP4 ranges return exact closed, open and suffix byte intervals', async () => {
  const w = workerHarness(harness()), file = () => new Response(Uint8Array.from([0, 1, 2, 3, 4, 5]), { headers: { 'Content-Type': 'video/mp4' } });
  for (const [range, expected, contentRange] of [
    ['bytes=1-3', [1, 2, 3], 'bytes 1-3/6'], ['bytes=4-', [4, 5], 'bytes 4-5/6'], ['bytes=-2', [4, 5], 'bytes 4-5/6'],
  ]) {
    const response = await w.rangeResponse(file(), range);
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), contentRange);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], expected);
  }
  for (const range of ['bytes=9-', 'bytes=3-1', 'bytes=-0']) {
    const invalid = await w.rangeResponse(file(), range); assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('content-range'), 'bytes */6');
  }
});

test('navigation tries the network first and falls back only to the prepared application shell', async () => {
  const h = harness(); await h.api.prepareDemoAssets(catalog);
  let online = true, networkCalls = 0;
  const w = workerHarness(h, async () => { networkCalls++; if (online) return new Response('online shell'); throw new Error('offline'); });
  const request = { url: `${base}?word=question`, mode: 'navigate', method: 'GET', headers: new Headers() };
  assert.equal(await (await w.handleDemoRequest(request)).text(), 'online shell');
  online = false;
  assert.match(await (await w.handleDemoRequest(request)).text(), /index.html/); assert.equal(networkCalls, 2);
  let intercepted = 0;
  for (const url of ['https://elsewhere.test/model.wasm', 'https://example.test/Technopark_project/other/index.html', `${base}my-upload.mp4`]) {
    w.handlers.get('fetch')({ request: new Request(url), respondWith() { intercepted++; } });
  }
  assert.equal(intercepted, 0);
});

test('activation deletes only older caches for this application scope and claims clients', async () => {
  const h = harness();
  await h.api.prepareDemoAssets(catalog);
  const bundle = (await h.api.readPreparedBundle()).manifest.bundle;
  const old = `${h.api.CACHE_PREFIX}0.9`, sibling = 'hearing-equality-demo:/another-app/:0.9', unrelated = 'other-product';
  for (const name of [h.api.CACHE_NAME, old, sibling, unrelated]) await h.caches.open(name);
  const w = workerHarness(h); let work;
  w.handlers.get('activate')({ waitUntil(promise) { work = promise; } }); await work;
  assert.deepEqual((await h.caches.keys()).sort(), [h.api.CACHE_NAME, bundle, sibling, unrelated].sort());
  assert.equal(w.claimed(), 1);
});

test('a failed refresh keeps the complete manifest, files and active offline readiness unchanged', async () => {
  let online = true;
  const h = harness({ fetcher: url => new Response(online ? `original:${url}` : 'unavailable', { status: online ? 200 : 503 }) });
  await h.api.prepareDemoAssets(catalog);
  const control = await h.caches.open(h.api.CACHE_NAME), before = await (await control.match(h.api.MANIFEST_URL)).text();
  const namesBefore = await h.caches.keys(); online = false;
  const result = await h.api.prepareDemoAssets(catalog);
  assert.equal(result.retained, true); assert.equal(result.offlineReady, true); assert.equal(result.cached, 34);
  assert.equal(result.failed.length, 34); assert.equal(result.downloaded, 0); assert.equal(h.registrations(), 1);
  assert.equal(await (await control.match(h.api.MANIFEST_URL)).text(), before);
  assert.deepEqual(await h.caches.keys(), namesBefore, 'The failed staging cache is discarded');
  const w = workerHarness(h);
  assert.match(await (await w.handleDemoRequest(new Request(`${base}platform.js?v=0.10.1`))).text(), /^original:/);
});

test('a failed atomic pointer commit preserves the previous complete bundle', async () => {
  const h = harness(); await h.api.prepareDemoAssets(catalog);
  const control = await h.caches.open(h.api.CACHE_NAME), before = await (await control.match(h.api.MANIFEST_URL)).text();
  const originalPut = control.put;
  control.put = async (url, response) => { if (url === h.api.MANIFEST_URL) throw new Error('storage quota'); return originalPut(url, response); };
  const result = await h.api.prepareDemoAssets(catalog);
  assert.equal(result.retained, true); assert.equal(result.offlineReady, true); assert.equal(result.cached, 34);
  assert.equal(result.downloaded, 34); assert.match(result.failed[0].reason, /storage quota/);
  assert.equal(await (await control.match(h.api.MANIFEST_URL)).text(), before);
  assert.equal(h.registrations(), 1);
});

test('automatic installation rejects an unprepared release instead of waiting to replace the old worker', async () => {
  const h = harness(), old = `${h.api.CACHE_PREFIX}0.9`;
  await h.caches.open(old);
  const w = workerHarness(h); let work;
  w.handlers.get('install')({ waitUntil(promise) { work = promise; } });
  await assert.rejects(work, /bundle must be prepared/);
  w.handlers.get('activate')({ waitUntil(promise) { work = promise; } }); await work;
  assert.equal(w.activated(), 0); assert.equal(w.claimed(), 0);
  assert.ok((await h.caches.keys()).includes(old));
  await h.api.prepareDemoAssets(catalog);
  w.handlers.get('install')({ waitUntil(promise) { work = promise; } }); await work;
  assert.equal(w.activated(), 1);
});

test('preparation bypasses an older worker that would otherwise return a stale unversioned HTML shell', async () => {
  const h = harness({ fetcher: url => {
    const request = new URL(url);
    if (request.pathname.endsWith('/index.html')) {
      // The previous worker rejects unknown version queries, but its prepared
      // cache would intercept an unversioned index.html regardless of the new
      // preparation header value. Reproduce precisely that upgrade boundary.
      const version = request.searchParams.get('v') === '0.10.1' ? '0.10.1' : '0.10.0';
      return new Response(`<script type="module" src="platform.js?v=${version}"></script>`);
    }
    return new Response(`network:${url}`);
  } });
  const result = await h.api.prepareDemoAssets(catalog);
  assert.equal(result.offlineReady, true);
  assert.ok(h.fetched.every(url => new URL(url).searchParams.get('v') === '0.10.1'), 'Every network request must bypass the old version, including video and JSON');
  const { assets } = await h.api.readPreparedBundle();
  const html = await (await assets.match(`${base}index.html`)).text();
  assert.match(html, /platform\.js\?v=0\.10\.1/);
  assert.doesNotMatch(html, /0\.10\.0/);
  assert.ok(await assets.match(new URL(catalog[0].video, base).href), 'Video remains stored under the canonical key used by the player');
});
