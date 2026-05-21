const CACHE = 'didactia-v1';
const PRECACHE = [
  '/app.html',
  '/index.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/users.js',
  '/js/admin.js',
  '/js/chat.js',
  '/js/comedor.js',
  '/js/mejoras.js',
  '/js/incidencias.js',
  '/js/espacios.js',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) { return c.addAll(PRECACHE); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  // Solo cachear peticiones del mismo origen (no Supabase, no CDN)
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (res.ok && e.request.method === 'GET') {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      });
    })
  );
});
