import { APP_VERSION, APP_BASE, CACHE_PREFIX, CACHE_NAME, canonicalAssetURL, readPreparedBundle, hasCompleteDemoBundle } from './demo-cache.js?v=0.18.1';

// Automatic updates can fetch this script before the new release's offline
// files exist. Reject installation then: merely leaving a worker waiting would
// still let it replace the old one when the last old tab closes.
self.addEventListener('install', event => event.waitUntil((async () => {
  if (!await hasCompleteDemoBundle()) throw new Error('The demonstration bundle must be prepared before activating this release.');
  await self.skipWaiting();
})()));
async function activatePreparedBundle() {
  if (!await hasCompleteDemoBundle()) return;
  const { manifest } = await readPreparedBundle(), names = await caches.keys();
  const oldVersions = names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME &&
    /^\d+(?:\.\d+){1,2}$/.test(name.slice(CACHE_PREFIX.length)));
  for (const name of oldVersions) {
    // Delete an older version's pointed bundle, never an unrelated cache or a
    // concurrent in-progress bundle belonging to the current/next release.
    const old = await caches.open(name);
    const oldVersion = name.slice(CACHE_PREFIX.length);
    const oldKey = new URL(`.__demo-manifest-${oldVersion}.json`, APP_BASE).href;
    try {
      const response = await old.match(oldKey), record = response && await response.json();
      if (typeof record?.bundle === 'string' && record.bundle.startsWith(`${CACHE_PREFIX}bundle:`) && record.bundle !== manifest.bundle)
        await caches.delete(record.bundle);
    } catch {}
    await caches.delete(name);
  }
  await self.clients.claim();
}
self.addEventListener('activate', event => event.waitUntil(activatePreparedBundle()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'HEARING_DEMO_READY' || event.data.version !== APP_VERSION) return;
  event.waitUntil((async () => {
    if (!await hasCompleteDemoBundle()) return;
    await self.skipWaiting();
    // If already active but initially lacking a bundle, claim now. A waiting
    // worker cannot claim yet; its activate handler will do so immediately.
    try { await self.clients.claim(); } catch {}
  })());
});

// Cached video is stored as a full 200 response. Browsers normally request byte
// ranges while loading/seeking; supply precise 206/416 responses from that copy.
export async function rangeResponse(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() || '');
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer(), size = bytes.byteLength;
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  }
  const headers = new Headers(response.headers);
  headers.delete('content-encoding'); headers.delete('transfer-encoding');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1)); headers.set('Accept-Ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function network(request, timeout = 5000, completeBody = false) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request, { signal: controller.signal });
    // For the small HTML shell, a server sending headers and then stalling
    // must not suppress the offline fallback forever.
    if (completeBody) await response.clone().arrayBuffer();
    return response;
  }
  finally { clearTimeout(timer); }
}
export async function handleDemoRequest(request) {
  const url = new URL(request.url), { manifest, assets: cache } = await readPreparedBundle();
  const isHome = url.origin === APP_BASE.origin && [APP_BASE.pathname, `${APP_BASE.pathname}index.html`].includes(url.pathname);
  if (request.mode === 'navigate' && isHome) {
    try { const response = await network(request, 5000, true); if (response.ok) return response; }
    catch {}
    const saved = cache && await cache.match(new URL('index.html', APP_BASE).href);
    return saved || new Response('Показ ещё не сохранён. Подключитесь к интернету и нажмите «Подготовить показ».',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const canonical = canonicalAssetURL(request.url);
  if (!canonical || !cache || !manifest?.urls.includes(canonical)) return fetch(request);
  const saved = await cache.match(canonical);
  if (saved?.status === 200) return request.headers.has('range') ? rangeResponse(saved, request.headers.get('range')) : saved;
  return network(request);
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== APP_BASE.origin || !url.pathname.startsWith(APP_BASE.pathname) ||
      request.headers.has('X-Hearing-Demo-Prepare')) return;
  const isHome = [APP_BASE.pathname, `${APP_BASE.pathname}index.html`].includes(url.pathname);
  if (!(request.mode === 'navigate' && isHome) && !canonicalAssetURL(request.url)) return;
  event.respondWith(handleDemoRequest(request));
});
