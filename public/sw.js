/* HEEVA CLINIC — Service Worker
   App-shell caching for fast startup + offline availability.
   Strategy: precache core shell, stale-while-revalidate for same-origin static assets.
   Dynamic clinic data (/api/*) is NEVER cached by the Service Worker. */
const VERSION = 'heeva-v3';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CORE).catch(() => c.addAll(['./'])))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(async (keys) => {
      // 1. Delete all older cache versions (e.g. heeva-v1, heeva-v2)
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      // 2. Actively purge any legacy /api/* entries in current cache
      try {
        const currentCache = await caches.open(VERSION);
        const cachedRequests = await currentCache.keys();
        await Promise.all(
          cachedRequests
            .filter((req) => new URL(req.url).pathname.startsWith('/api'))
            .map((req) => currentCache.delete(req))
        );
      } catch (_) {}
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // CRITICAL: Dynamic clinic data API routes (/api/*) must ALWAYS bypass the
  // Service Worker cache completely so Cloudflare D1 is the single source of truth.
  if (url.pathname.startsWith('/api')) {
    return;
  }

  // Navigations: network first, fall back to cached shell (offline support)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Static Assets: stale-while-revalidate for fast loading
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
