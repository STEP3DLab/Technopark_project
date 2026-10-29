// Only curated, same-origin demonstration assets are stored. Camera models,
// microphone audio, uploaded files and conversation content are never cached.
export const APP_VERSION = '0.11.1';
export const APP_BASE = new URL('./', import.meta.url);
export const CACHE_PREFIX = `hearing-equality-demo:${APP_BASE.pathname}:`;
export const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
export const BUNDLE_PREFIX = `${CACHE_PREFIX}bundle:${APP_VERSION}:`;
export const MANIFEST_URL = new URL(`.__demo-manifest-${APP_VERSION}.json`, APP_BASE).href;
// A protocol suffix also distinguishes this atomic-cache worker from an older
// worker already running the same application release during a rehearsal.
export const WORKER_URL = new URL(`sw.js?v=${APP_VERSION}&cache=2`, APP_BASE).href;
const STATIC_FILES = [
  'index.html',
  'platform.css', 'dialogue.css', 'rgsu.css', 'showcase.css',
  'platform.js', 'canvas-avatar.js', 'vision.js', 'catalog.js', 'recognizer.js',
  'session.js', 'trial-protocol.js', 'avatar-motion.js', 'hand-geometry.js',
  'avatar-hands.js', 'avatar-framing.js',
  'showcase.js', 'demo-cache.js',
  'fonts/manrope.woff2', 'assets/brand/rgsu-blue.svg', 'assets/brand/rgsu-white.svg',
  'assets/sources/slovo-sources.json', 'assets/recognition-library.json', 'assets/evaluation-v07.json',
];
const SOURCE_PATH = /^assets\/(motion\/([a-f0-9-]{36})\.json|sources\/([a-f0-9-]{36})\.mp4)$/;
const REQUEST_TIMEOUT = 18000;
let preparing = null;

export function canonicalAssetURL(value) {
  let url;
  try { url = new URL(value, APP_BASE); } catch { return null; }
  if (url.origin !== APP_BASE.origin || !url.pathname.startsWith(APP_BASE.pathname) || url.hash) return null;
  const relative = url.pathname.slice(APP_BASE.pathname.length);
  if (!STATIC_FILES.includes(relative) && !SOURCE_PATH.test(relative)) return null;
  if ([...url.searchParams].some(([key, version]) => key !== 'v' || version !== APP_VERSION)) return null;
  if (url.searchParams.getAll('v').length > 1) return null;
  url.search = /\.(css|js)$/.test(relative) ? `?v=${APP_VERSION}` : '';
  return url.href;
}
export const STATIC_URLS = STATIC_FILES.map(file => canonicalAssetURL(file));

export function buildDemoManifest(catalog) {
  if (!Array.isArray(catalog) || catalog.length !== 6) throw new Error('Дождитесь загрузки всех шести слов, затем подготовьте показ.');
  const sources = [];
  for (const item of catalog) {
    const motion = canonicalAssetURL(item?.motion), video = canonicalAssetURL(item?.video);
    const motionID = motion && new URL(motion).pathname.match(/\/motion\/([a-f0-9-]{36})\.json$/)?.[1];
    const videoID = video && new URL(video).pathname.match(/\/sources\/([a-f0-9-]{36})\.mp4$/)?.[1];
    if (!motionID || motionID !== videoID) throw new Error('В словаре обнаружен неподдерживаемый ресурс. Обновите страницу.');
    sources.push(motion, video);
  }
  if (new Set(sources).size !== 12) throw new Error('Для показа нужны шесть разных записей словаря.');
  return { version: APP_VERSION, urls: [...STATIC_URLS, ...sources], complete: false, preparedAt: null };
}

export function validDemoManifest(value) {
  if (value?.version !== APP_VERSION || !Array.isArray(value.urls) || value.urls.length !== STATIC_URLS.length + 12) return false;
  if (value.bundle != null && (typeof value.bundle !== 'string' || !value.bundle.startsWith(BUNDLE_PREFIX))) return false;
  const urls = new Set(value.urls);
  if (urls.size !== value.urls.length || !STATIC_URLS.every(url => urls.has(url))) return false;
  const pairs = new Map();
  for (const url of value.urls) {
    if (typeof url !== 'string' || canonicalAssetURL(url) !== url) return false;
    if (STATIC_URLS.includes(url)) continue;
    const relative = new URL(url).pathname.slice(APP_BASE.pathname.length), match = relative.match(SOURCE_PATH);
    if (!match) return false;
    const id = match[2] || match[3], kind = match[2] ? 'motion' : 'video';
    const types = pairs.get(id) || new Set(); types.add(kind); pairs.set(id, types);
  }
  return pairs.size === 6 && [...pairs.values()].every(types => types.size === 2);
}

function currentWorker(worker) {
  return Boolean(worker && worker.scriptURL === WORKER_URL && worker.state === 'activated');
}
function supported() {
  return Boolean(globalThis.isSecureContext && globalThis.caches && globalThis.navigator?.serviceWorker);
}
function bounded(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })])
    .finally(() => clearTimeout(timer));
}
function notify(onProgress, value) { try { onProgress?.(value); } catch {} }
async function loadManifest(cache) {
  try { const response = await cache.match(MANIFEST_URL); const value = response && await response.json(); return validDemoManifest(value) ? value : null; }
  catch { return null; }
}
async function inspectEntries(cache, manifest) {
  let cached = 0; const missing = [];
  for (const url of manifest.urls) {
    const response = await cache.match(url);
    if (response?.status === 200) cached++; else missing.push({ url, reason: 'Файл не сохранён для показа.' });
  }
  return { cached, missing };
}
export async function readPreparedBundle() {
  const control = await caches.open(CACHE_NAME), manifest = await loadManifest(control);
  if (!manifest) return { control, manifest: null, assets: null };
  if (!manifest.bundle) return { control, manifest, assets: control }; // Earlier direct-cache format.
  if (!(await caches.keys()).includes(manifest.bundle)) return { control, manifest, assets: null };
  return { control, manifest, assets: await caches.open(manifest.bundle) };
}
export async function hasCompleteDemoBundle() {
  const { manifest, assets } = await readPreparedBundle();
  if (!manifest?.complete || !assets) return false;
  return (await inspectEntries(assets, manifest)).cached === manifest.urls.length;
}

export async function readDemoCacheStatus() {
  const empty = { cached: 0, total: 0, failed: [], offlineReady: false, needsReload: false, supported: supported(), version: APP_VERSION };
  if (!empty.supported) return { ...empty, reason: 'Сохранение для показа недоступно в этом браузере. Нужен HTTPS и поддержка Service Worker.' };
  try {
    const { manifest, assets } = await readPreparedBundle();
    if (!manifest) return empty;
    const { cached, missing } = assets ? await inspectEntries(assets, manifest) : { cached: 0, missing: manifest.urls.map(url => ({ url, reason: 'Сохранённый набор удалён браузером.' })) };
    const controllerReady = currentWorker(navigator.serviceWorker.controller);
    let workerReady = controllerReady;
    if (!workerReady) {
      try { workerReady = currentWorker((await bounded(navigator.serviceWorker.getRegistration(APP_BASE.href), 2500, 'Проверка регистрации не завершена.'))?.active); } catch {}
    }
    const complete = manifest.complete === true && cached === manifest.urls.length;
    return { ...empty, cached, total: manifest.urls.length, failed: missing, offlineReady: complete && controllerReady,
      needsReload: complete && workerReady && !controllerReady, preparedAt: manifest.preparedAt, bundleComplete: complete,
      reason: !complete ? 'Подготовка не завершена или часть файлов удалена браузером.' : !workerReady ? 'Файлы сохранены. Нажмите подготовку ещё раз, чтобы включить офлайн-режим.' : !controllerReady ? 'Обновите страницу обычным способом, чтобы включить сохранённый показ.' : '' };
  } catch (error) { return { ...empty, reason: `Не удалось проверить сохранённые файлы: ${error.message}` }; }
}

async function fetchAndCache(cache, url, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT);
  try {
    // The worker deliberately lets this request reach the network. Preparation
    // must not mistake its own cache fallback for a fresh successful download.
    // An already-installed older worker only recognises its own preparation
    // header value. Version EVERY network URL, including HTML, JSON and video,
    // so the older worker cannot serve its stale cached shell into this bundle.
    // Cache keys remain canonical; only the network fetch gets this version.
    const networkURL = new URL(url); networkURL.searchParams.set('v', APP_VERSION);
    const response = await fetch(networkURL.href, { signal: controller.signal, cache: 'reload', credentials: 'same-origin',
      headers: { 'X-Hearing-Demo-Prepare': APP_VERSION } });
    if (response.status !== 200 || response.type === 'opaque' || (response.url && new URL(response.url).origin !== APP_BASE.origin))
      throw new Error(`Не удалось загрузить файл (HTTP ${response.status}).`);
    // Consume the body under the same deadline, including slow video downloads.
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error('Получен пустой файл.');
    if (signal?.aborted) throw new Error('Подготовка отменена.');
    const headers = new Headers(response.headers);
    headers.delete('content-encoding'); headers.delete('transfer-encoding'); headers.set('content-length', String(bytes.byteLength));
    await cache.put(url, new Response(bytes, { status: 200, headers }));
  } catch (error) {
    throw new Error(signal?.aborted ? 'Подготовка отменена.' : timedOut ? 'Загрузка заняла больше 18 секунд. Повторите подготовку.' : error.message);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

async function registerWorker() {
  const registration = await bounded(navigator.serviceWorker.register(WORKER_URL,
    { scope: APP_BASE.href, type: 'module', updateViaCache: 'none' }), 15000, 'Офлайн-компонент не зарегистрировался вовремя. Повторите подготовку.');
  if (registration.scope !== APP_BASE.href) throw new Error('Офлайн-компонент получил неподходящую область действия.');
  // An automatically installed update may have waited for a complete bundle.
  // Wake it only now, after the atomic manifest commit succeeded.
  for (const worker of [registration.installing, registration.waiting, registration.active])
    worker?.postMessage({ type: 'HEARING_DEMO_READY', version: APP_VERSION });
  if (currentWorker(navigator.serviceWorker.controller)) return registration;
  await new Promise(resolve => {
    let timer;
    const watched = [registration.installing, registration.waiting, registration.active].filter(Boolean);
    const done = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', check); watched.forEach(worker => worker.removeEventListener('statechange', check)); resolve(); };
    const check = () => { if (currentWorker(navigator.serviceWorker.controller)) done(); };
    navigator.serviceWorker.addEventListener('controllerchange', check);
    watched.forEach(worker => worker.addEventListener('statechange', check));
    timer = setTimeout(done, 8000); check();
  });
  return registration;
}

async function prepare(catalog, { onProgress, signal } = {}) {
  let manifest;
  try { manifest = buildDemoManifest(catalog); }
  catch (error) { return { cached: 0, total: 0, failed: [{ url: '', reason: error.message }], offlineReady: false, needsReload: false }; }
  const total = manifest.urls.length;
  if (!supported()) return { cached: 0, total, failed: [{ url: '', reason: 'Браузер не поддерживает сохранённый показ. Используйте актуальный браузер по HTTPS.' }], offlineReady: false, needsReload: false };
  const failed = [], previous = await readDemoCacheStatus(), previousBundle = await readPreparedBundle();
  // Cache.put has an atomic per-entry commit but CacheStorage has no rename.
  // Download a complete immutable bundle, then atomically switch ONE manifest
  // pointer. A failed refresh never writes over the active files or manifest.
  const bundleName = `${BUNDLE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cache = await caches.open(bundleName);
  let committed = false;
  let cursor = 0, downloaded = 0;
  notify(onProgress, { cached: 0, total, failed: [], offlineReady: false, needsReload: false });
  const worker = async () => {
    while (cursor < total) {
      const url = manifest.urls[cursor++];
      try { if (signal?.aborted) throw new Error('Подготовка отменена.'); await fetchAndCache(cache, url, signal); downloaded++; }
      catch (error) { failed.push({ url, reason: error.message }); }
      notify(onProgress, { cached: downloaded, total, failed: [...failed], offlineReady: false, needsReload: false, url });
    }
  };
  try {
    await Promise.all(Array.from({ length: 4 }, worker));
    const { cached, missing } = await inspectEntries(cache, manifest);
    for (const entry of missing) if (!failed.some(value => value.url === entry.url)) failed.push(entry);
    if (cached === total && failed.length === 0 && !signal?.aborted) {
      manifest = { ...manifest, complete: true, bundle: bundleName, preparedAt: new Date().toISOString() };
      const control = await caches.open(CACHE_NAME);
      await control.put(MANIFEST_URL, new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
      committed = true;
      try { await registerWorker(); }
      catch (error) { failed.push({ url: WORKER_URL, reason: error.message }); }
    }
  } catch (error) { failed.push({ url: MANIFEST_URL, reason: `Не удалось завершить сохранение: ${error.message}` }); }
  finally { if (!committed) await caches.delete(bundleName).catch(() => {}); }
  const available = await readDemoCacheStatus();
  if (committed && available.offlineReady && previousBundle.manifest?.bundle && previousBundle.manifest.bundle !== bundleName)
    await caches.delete(previousBundle.manifest.bundle).catch(() => {});
  const result = { cached: available.cached, total: available.total || total, failed,
    offlineReady: available.offlineReady, needsReload: available.needsReload,
    retained: !committed && Boolean(previous.bundleComplete && available.bundleComplete),
    downloaded, version: APP_VERSION, preparedAt: available.preparedAt || null };
  notify(onProgress, result); return result;
}

export function prepareDemoAssets(catalog, options = {}) {
  if (preparing) return preparing;
  const job = prepare(catalog, options).catch(error => ({ cached: 0, total: 0,
    failed: [{ url: '', reason: `Не удалось сохранить показ: ${error.message}` }], offlineReady: false, needsReload: false }))
    .finally(() => { if (preparing === job) preparing = null; });
  preparing = job;
  return job;
}
