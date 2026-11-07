// Network first for the page and the day's data (always fresh), cache as offline fallback.
// Audio files are versioned by the generation time, so they are served from cache once fetched.
const CACHE = 'briefing-v8';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.includes('/data/audio/')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        await c.put(req, res.clone());
        // drop audio from earlier editions so the cache does not grow every day
        const v = url.searchParams.get('v');
        for (const k of await c.keys()) {
          const u = new URL(k.url);
          if (u.pathname.includes('/data/audio/') && u.searchParams.get('v') !== v) c.delete(k);
        }
      }
      return res;
    }));
    return;
  }
  const key = url.origin + url.pathname; // ignore cache-busting query
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(key, res.clone()));
    return res;
  }).catch(() => caches.open(CACHE).then((c) => c.match(key)).then((r) => r || Response.error())));
});
