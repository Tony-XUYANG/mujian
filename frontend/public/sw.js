// Vite replaces the build token; each release prepares its own shell without touching the active one.
const CACHE = 'mujian-app-__BUILD_ID__';
const MEDIA_CACHE = 'mujian-offline-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/asset-manifest.json'];
self.addEventListener('install', event => {
  event.waitUntil(precache());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mujian-app-') && key !== CACHE).map(key => caches.delete(key))));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  event.respondWith(serve(event.request));
});

async function precache() {
  const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('App asset manifest unavailable');
  const manifest = await response.json();
  const assets = Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css || []), ...(entry.assets || [])]);
  const cache = await caches.open(CACHE);
  await cache.addAll([...APP_SHELL, ...new Set(assets.filter(Boolean).map(path => '/' + path))]);
}

async function serve(request) {
  const path = new URL(request.url).pathname;
  const media = await caches.open(MEDIA_CACHE);
  const downloaded = await media.match(request.url);
  if (downloaded) return request.headers.has('Range') ? rangeResponse(request, downloaded) : downloaded;
  const shell = await caches.open(CACHE);
  // A controlled page must use one release's HTML, JS and CSS even while a newer release waits.
  if (request.mode === 'navigate' || path === '/' || path === '/index.html') {
    const index = await shell.match('/index.html');
    if (index) return index;
  }
  if (path.startsWith('/assets/') || APP_SHELL.includes(path)) {
    const asset = await shell.match(path);
    if (asset) return asset;
  }
  try {
    const response = await fetch(request);
    const isMedia = /^(audio|video)\//.test(response.headers.get('Content-Type') || '');
    if (response.ok && response.status === 200 && !request.headers.has('Range') && !isMedia) {
      await shell.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await shell.match(path);
    if (cached) return request.headers.has('Range') ? rangeResponse(request, cached) : cached;
    if (request.mode === 'navigate') {
      const index = await shell.match('/index.html');
      if (index) return index;
    }
    return new Response('Resource unavailable offline', { status: 503 });
  }
}

async function rangeResponse(request, cached) {
  const data = await cached.arrayBuffer();
  const size = data.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  const invalid = () => new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return invalid();
  const headers = new Headers(cached.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}
