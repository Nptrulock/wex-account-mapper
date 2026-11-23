/* Offline cache for the app code only. Never caches or sends user data —
   all data lives in the page's IndexedDB and never goes over the network. */
const CACHE = 'account-mapper-__VERSION__';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate'){
    // network first for the page so updates arrive, cached copy when offline
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put('index.html', cp)); return res; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r)));
});
