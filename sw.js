/* Lookup Reader service worker: makes the app work offline and receives PDFs shared to it. */
const VERSION = 'lookup-reader-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'pdf.min.js', 'pdf.worker.min.js', 'dict.json.gz', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lookup-reader-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const file = form.get('pdf');
        if (file && typeof file === 'object' && 'size' in file) {
          const c = await caches.open('lookup-shared');
          await c.put(new URL('shared-file', self.registration.scope).href, new Response(file, {
            headers: { 'Content-Type': 'application/pdf', 'X-Name': encodeURIComponent(file.name || 'Book.pdf') }
          }));
        }
      } catch (err) { /* fall through to the app */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    const refresh = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    });
    if (hit) { refresh.catch(() => {}); return hit; }
    try { return await refresh; }
    catch (err) {
      if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return idx; }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
