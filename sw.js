// Service Worker — cache-first strategy for offline use.
// Bump CACHE version when any app file changes to force clients to update.

const CACHE  = 'gearcalc-v22';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/calc.js',
  './js/domain.js',
  './js/db.js',
  './js/forms.js',
  './js/app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
