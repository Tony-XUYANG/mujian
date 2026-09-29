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
const sandbox = {
  caches: {
    open: async name => open(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
  },
  self: {
    location: { origin: 'https://mujian.test' },
    clients: { claim: () => undefined },
    skipWaiting: () => undefined,
    addEventListener: (name, handler) => handlers.set(name, handler),
  },
  fetch: async () => Response.json({ 'index.html': { file: 'assets/app.js', css: ['assets/app.css'] } }),
  URL, Headers, Request, Response,
};
runInNewContext(readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8'), sandbox);

let installation;
handlers.get('install')({ waitUntil: promise => { installation = promise; } });
await installation;
assert.ok(precached.includes('/assets/app.js'));
assert.ok(precached.includes('/assets/app.css'));
sandbox.fetch = async () => { throw new Error('offline'); };

const videoUrl = 'https://mujian.test/media/demo.mp4';
const bytes = Uint8Array.from({ length: 20 }, (_, i) => i);
await (await sandbox.caches.open('mujian-offline-v1')).put(videoUrl, new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } }));
await sandbox.caches.open('mujian-app-v1');
await sandbox.caches.open('mujian-app-v2');
await sandbox.caches.open('mujian-app-v3');
let activation;
handlers.get('activate')({ waitUntil: promise => { activation = promise; } });
await activation;
assert.equal(stores.has('mujian-app-v1'), false);
assert.equal(stores.has('mujian-app-v2'), false);
assert.equal(stores.has('mujian-offline-v1'), true);

const shell = await sandbox.caches.open('mujian-app-v3');
await shell.put('/assets/app.js', new Response('console.log("offline app");', { headers: { 'Content-Type': 'text/javascript' } }));
const script = await sandbox.serve(new Request('https://mujian.test/assets/app.js'));
assert.equal(script.status, 200);
assert.equal(await script.text(), 'console.log("offline app");');

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
console.log('Service Worker offline cache and video range checks passed.');
