// Service Worker DidactIA — network-first para assets propios.
// Bump CACHE en cada cambio estructural para purgar cachés antiguas.
const CACHE = 'didactia-v14';
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
  '/js/orientacion.js',
  '/js/salidas.js',
  '/js/calidad.js',
  '/js/alumnos.js',
  '/js/asistencia.js',
  '/js/mensajes.js',
  '/js/tutoria.js',
  '/js/agenda.js',
  '/js/encuestas.js',
  '/js/menu.js',
  '/js/recursos.js',
  '/js/actas.js',
  '/js/prevision.js',
  '/js/documentos.js',
  '/js/participacion.js',
  '/js/plancobertura.js',
  '/manifest.json'
];

// Icono inline para notificaciones (no hay PNG en el repo).
var NOTIF_ICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='42' fill='%232a3d2b'/><text x='96' y='130' font-size='100' text-anchor='middle' fill='white' font-family='serif'>D</text></svg>";

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
  // Forzar revalidación contra el servidor (evita servir JS/HTML viejos del HTTP cache).
  var req = e.request;
  try { req = new Request(e.request, { cache: 'no-cache' }); } catch (_) { req = e.request; }
  e.respondWith(
    fetch(req).then(function(res) {
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
      icon:  NOTIF_ICON,
      badge: NOTIF_ICON,
      tag:   d.tag   || 'didactia',
      data:  { url: d.url || '/app.html' }
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/app.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow(url);
    })
  );
});
