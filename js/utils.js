// ── Utilidades globales centralizadas ──
// Cargado ANTES que auth.js (ver app.html). Reemplaza progresivamente los ~30
// escapers y los wrappers de push/fecha dispersos por módulo. Expuestos como
// globals window.* porque la app no usa bundler (scripts clásicos).

// HTML escaper (texto y valores de atributo) — XSS-safe
window.escH = function (s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

// JS string escaper para argumentos dentro de onclick="f('…')"
window.escAttr = function (s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
};

// Argumento seguro para onclick="f('${escArg(x)}')": escapa \ y ' (capa JS) y
// " → &quot; (capa atributo HTML de comillas dobles). Maneja apóstrofos y comillas.
window.escArg = function (s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
};

// Fecha ISO de hoy (YYYY-MM-DD)
window.hoyISO = function () {
  return new Date().toISOString().split('T')[0];
};

// Formato de fecha legible es-ES (dd/mm/aaaa)
window.fmtFecha = function (iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Toast global (usa el del módulo activo si existe; si no, uno mínimo)
window.showToastGlobal = function (msg, isErr) {
  if (typeof showToast === 'function') { showToast(msg, isErr); return; }
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' toast-err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
};

// Wrapper global de envío de push (fire-and-forget)
window.pushNotify = async function (userIds, title, body) {
  if (!userIds || !userIds.length) return;
  try {
    await fetch(`${window.SB_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.ANON_KEY, 'Authorization': `Bearer ${window.ANON_KEY}` },
      body: JSON.stringify({ user_ids: userIds, title, body })
    });
  } catch (e) { console.warn('push failed', e); }
};
