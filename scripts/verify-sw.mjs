import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const stores = new Map();
const precached = [];
function open(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  const entries = stores.get(name);
  const key = request => new URL(typeof request === 'string' ? request : request.url, 'https://mujian.test').href;
  return {
    match: async request => entries.get(key(request))?.clone(),
    put: async (request, response) => { entries.set(key(request), response.clone()); },
    delete: async request => entries.delete(key(request)),
    addAll: async urls => { precached.push(...urls); },
  };
}
const handlers = new Map();
let skipped = 0, claimed = 0;
const sandbox = {
  caches: {
    open: async name => open(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
  },
  self: {
    location: { origin: 'https://mujian.test' },
    clients: { claim: async () => { claimed++; } },
    skipWaiting: async () => { skipped++; },
    addEventListener: (name, handler) => handlers.set(name, handler),
  },
  fetch: async () => Response.json({ 'index.html': { file: 'assets/app.js', css: ['assets/app.css'] } }),
  URL, Headers, Request, Response,
};
runInNewContext(readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8').replace('__BUILD_ID__', 'test-release'), sandbox);

let installation;
handlers.get('install')({ waitUntil: promise => { installation = promise; } });
await installation;
assert.ok(precached.includes('/assets/app.js'));
assert.ok(precached.includes('/assets/app.css'));
assert.equal(skipped, 0, 'a new release must wait for user confirmation');
let message;
handlers.get('message')({ data: { type: 'UNKNOWN' }, waitUntil: promise => { message = promise; } });
assert.equal(skipped, 0, 'unknown messages cannot activate an update');
handlers.get('message')({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil: promise => { message = promise; } });
await message;
assert.equal(skipped, 1, 'explicit update confirmation activates the worker');
sandbox.fetch = async () => { throw new Error('offline'); };

const videoUrl = 'https://mujian.test/media/demo.mp4';
const bytes = Uint8Array.from({ length: 20 }, (_, i) => i);
await (await sandbox.caches.open('mujian-offline-v1')).put(videoUrl, new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } }));
await sandbox.caches.open('mujian-app-v1');
await sandbox.caches.open('mujian-app-v2');
await sandbox.caches.open('mujian-app-v3');
await sandbox.caches.open('mujian-app-v4');
await sandbox.caches.open('another-app-cache');
let activation;
handlers.get('activate')({ waitUntil: promise => { activation = promise; } });
await activation;
assert.equal(stores.has('mujian-app-v1'), false);
assert.equal(stores.has('mujian-app-v2'), false);
assert.equal(stores.has('mujian-app-v3'), false);
assert.equal(stores.has('mujian-app-v4'), false);
assert.equal(stores.has('another-app-cache'), true);
assert.equal(claimed, 1);
assert.equal(stores.has('mujian-offline-v1'), true);

const shell = await sandbox.caches.open('mujian-app-test-release');
await shell.put('/assets/app.js', new Response('console.log("offline app");', { headers: { 'Content-Type': 'text/javascript' } }));
const script = await sandbox.serve(new Request('https://mujian.test/assets/app.js'));
assert.equal(script.status, 200);
assert.equal(await script.text(), 'console.log("offline app");');

await shell.put('/index.html', new Response('release A HTML'));
await shell.put('/asset-manifest.json', new Response('release A manifest'));
sandbox.fetch = async () => new Response('release B');
const navigation = await sandbox.serve({ url: 'https://mujian.test/#mall', mode: 'navigate', headers: new Headers() });
assert.equal(await navigation.text(), 'release A HTML', 'controlled navigation must stay on the current release');
assert.equal(await (await sandbox.serve(new Request('https://mujian.test/asset-manifest.json'))).text(), 'release A manifest');
for (const request of [new Request('https://mujian.test/api/dramas'), new Request('https://other.test/a'), new Request('https://mujian.test/sw.js'), new Request('https://mujian.test/a', { method: 'POST' })]) {
  let intercepted = false;
  handlers.get('fetch')({ request, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false, 'do not cache API, cross-origin, worker or writes: ' + request.url);
}

sandbox.fetch = async () => new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } });
await sandbox.serve(new Request('https://mujian.test/media/not-downloaded.mp4'));
assert.equal(await shell.match('/media/not-downloaded.mp4'), undefined, 'online videos do not silently enter the App shell cache');
sandbox.fetch = async () => { throw new Error('offline'); };

const range = await sandbox.serve(new Request(videoUrl, { headers: { Range: 'bytes=4-9' } }));
assert.equal(range.status, 206);
assert.equal(range.headers.get('Content-Range'), 'bytes 4-9/20');
assert.deepEqual(new Uint8Array(await range.arrayBuffer()), bytes.slice(4, 10));

const suffix = await sandbox.serve(new Request(videoUrl, { headers: { Range: 'bytes=-3' } }));
assert.equal(suffix.status, 206);
assert.deepEqual(new Uint8Array(await suffix.arrayBuffer()), bytes.slice(-3));

const invalid = await sandbox.serve(new Request(videoUrl, { headers: { Range: 'bytes=30-40' } }));
assert.equal(invalid.status, 416);
assert.equal(invalid.headers.get('Content-Range'), 'bytes */20');

const full = await sandbox.serve(new Request(videoUrl));
assert.equal(full.status, 200);
assert.deepEqual(new Uint8Array(await full.arrayBuffer()), bytes);
assert.equal((await sandbox.serve(new Request('https://mujian.test/missing.png'))).status, 503);
console.log('Service Worker update activation, release isolation, cache retention, API exclusion and offline video checks passed.');
