// Service worker for the installable web app (phones). vite.config.ts fills in the
// placeholders and writes the result to dist/sw.js; the desktop app never registers it.
/* global self, caches, location */

const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const SHELL = `shell-${VERSION}`
// The full engine (95 MB) is cached the first time it is used, not on install. Its file names
// carry no hash, so the cache is named after the Stockfish package version instead.
const ENGINE = 'engine-__STOCKFISH__'

self.addEventListener('install', (event) => {
  // Bypass the HTTP cache so a new version never precaches an old file.
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))))
  // The first install takes over at once; later versions wait until the user reloads (see pwa.ts).
  if (!self.registration.active) self.skipWaiting()
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ENGINE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  // Always from the network: it tells a running page which version is waiting.
  if (url.pathname.endsWith('/version.json')) return
  event.respondWith(respond(req, url).then(isolate))
})

async function respond(req, url) {
  // Every page is the app shell (routes live in the hash), served from the cache so the app
  // opens the same way online and offline, and always matches the cached assets.
  if (req.mode === 'navigate') {
    const shell = await caches.match(new URL('index.html', self.registration.scope).href, { cacheName: SHELL })
    return shell ?? fetch(req)
  }
  const cached = await caches.match(req, { ignoreSearch: true })
  if (cached) return cached
  const res = await fetch(req)
  if (res.ok && url.pathname.includes('/stockfish/')) {
    const copy = res.clone()
    void caches.open(ENGINE).then((c) => c.put(req, copy))
  }
  return res
}

// GitHub Pages cannot send headers, so the worker adds the ones that make the page
// cross-origin isolated, which the multi-threaded engine needs (same as vite.config.ts).
function isolate(res) {
  if (!res || res.type === 'opaque' || res.status === 0) return res
  const headers = new Headers(res.headers)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
