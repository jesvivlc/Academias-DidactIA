// Service Worker DidactIA — network-first para assets propios.
// Bump CACHE en cada cambio estructural para purgar cachés antiguas.
const CACHE = 'didactia-v6';
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
  '/js/palette.js',
  '/js/incidencias.js',
  '/js/espacios.js',
  '/js/rrhh.js',
  '/js/guardias.js',
  '/js/ib.js',
  '/js/comunicados.js',
  '/js/familias.js',
  '/js/planner.js',
  '/js/analytics.js',
  '/js/calificaciones.js',
  '/js/materiales.js',
  '/js/informes.js',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) { return c.addAll(PRECACHE).catch(function() {}); })
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

// network-first: online siempre sirve el último deploy; offline cae a la caché.
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return; // Supabase/CDN pasan directos
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res && res.ok) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});


// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', function(e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch(_) {}
  e.waitUntil(
    self.registration.showNotification(d.title || 'DidactIA', {
      body:  d.body  || '',
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      tag:   d.tag   || 'didactia'
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
