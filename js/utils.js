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

// Toast global. Segundo argumento: 'success' | 'error' | 'info' (o booleano
// legado = error). Los módulos lo llaman con string, así que hay que
// distinguirlo de un booleano o todo saldría pintado como error.
window.showToastGlobal = function (msg, tipo) {
  if (typeof showToast === 'function') { showToast(msg, tipo); return; }
  const t = (tipo === true) ? 'error' : (tipo || 'info');
  if (!document.getElementById('toast-styles')) {
    const st = document.createElement('style');
    st.id = 'toast-styles';
    st.textContent = `
      #toast-stack{position:fixed;right:18px;bottom:18px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(380px,calc(100vw - 36px))}
      .toast{pointer-events:auto;background:var(--srf,#fff);color:var(--txt,#222);border:1px solid var(--bdr,#ddd);border-left:3px solid var(--info,#4D6FA8);border-radius:10px;padding:11px 15px;font-size:13.5px;line-height:1.45;box-shadow:0 8px 28px rgba(0,0,0,.14);animation:toast-in .18s ease-out}
      .toast-success{border-left-color:var(--success,#2e7d32)}
      .toast-error{border-left-color:var(--danger,#c0392b)}
      @keyframes toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      @media(max-width:600px){#toast-stack{left:14px;right:14px;bottom:14px;max-width:none}}
    `;
    document.head.appendChild(st);
  }
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + t;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), t === 'error' ? 6000 : 3500);
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

// ── Helper IA (Gemini vía Edge Function chat) ──
// Devuelve el texto generado. Lanza en caso de error para que el llamante lo gestione.
window.iaChat = async function (systemPrompt, userText) {
  const res = await fetch(`${window.SB_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': window.ANON_KEY, 'Authorization': `Bearer ${window.ANON_KEY}` },
    body: JSON.stringify({ system_prompt: systemPrompt, contents: [{ role: 'user', parts: [{ text: userText }] }] })
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.text || '';
};

// Modal simple para mostrar resultado de IA (con copiar). Idempotente.
window.iaModal = function (titulo, texto) {
  let ov = document.getElementById('ia-modal');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'ia-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--srf,#fff);border-radius:14px;max-width:620px;width:100%;max-height:80vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25)';
  box.innerHTML =
    '<div style="font-family:var(--font-display,serif);font-size:19px;margin-bottom:10px">' + escH(titulo) + '</div>' +
    '<div style="white-space:pre-wrap;font-size:14px;line-height:1.55;color:var(--txt,#222)">' + escH(texto) + '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
    '<button id="ia-modal-copy" style="padding:8px 14px;border:1px solid var(--bdr,#ddd);border-radius:8px;background:var(--srf,#fff);cursor:pointer;font-weight:600">Copiar</button>' +
    '<button id="ia-modal-close" style="padding:8px 14px;border:none;border-radius:8px;background:var(--ink,#1F2C4F);color:#fff;cursor:pointer;font-weight:600">Cerrar</button>' +
    '</div>';
  ov.appendChild(box);
  document.body.appendChild(ov);
  document.getElementById('ia-modal-close').onclick = () => ov.remove();
  document.getElementById('ia-modal-copy').onclick = function () {
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => { this.textContent = '¡Copiado!'; }).catch(() => {});
  };
};
