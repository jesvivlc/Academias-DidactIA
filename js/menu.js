/* Módulo Menú del comedor — dirección publica el menú diario; familias lo consultan */

function _menuEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _menuGestiona() {
  return ["admin", "admin_institucional", "director", "jefatura", "superadmin"].includes(window.role);
}
var _MENU_DOW = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
var _MENU_MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Lunes de la semana que contiene `d` (Date) → 'YYYY-MM-DD'
function _menuLunes(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dow = (x.getDay() + 6) % 7;  // 0 = lunes
  x.setDate(x.getDate() - dow);
  return x;
}
function _menuFmt(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function _menuSemanaFechas(lunes) {
  var out = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
    out.push({ date: d, fecha: _menuFmt(d), dow: _MENU_DOW[i], label: d.getDate() + " " + _MENU_MESES[d.getMonth()] });
  }
  return out;
}

/* ════════ Vista de solo lectura (familia / comedor) ════════ */
/* Renderiza el menú de la semana actual dentro del elemento target. */
window.renderMenuComedor = async function (targetEl, opts) {
  opts = opts || {};
  var el = typeof targetEl === "string" ? document.getElementById(targetEl) : targetEl;
  if (!el) return;
  _menuEnsureStyles();
  var lunes = _menuLunes(new Date());
  var dias = _menuSemanaFechas(lunes);
  var r = await window.sb.from("menu_comedor")
    .select("fecha,primer,segundo,postre,notas")
    .eq("centro_id", window.ctrId)
    .gte("fecha", dias[0].fecha).lte("fecha", dias[4].fecha);
  var map = {};
  (r.data || []).forEach(function (m) { map[m.fecha] = m; });
  var hayAlgo = Object.keys(map).length > 0;
  if (!hayAlgo && opts.hideIfEmpty) { el.innerHTML = ""; return; }
  var hoy = _menuFmt(new Date());

  var cards = dias.map(function (d) {
    var m = map[d.fecha] || {};
    var vacio = !m.primer && !m.segundo && !m.postre;
    var esHoy = d.fecha === hoy;
    return '<div class="menu-day' + (esHoy ? ' menu-day-hoy' : '') + '">' +
      '<div class="menu-day-hd">' + d.dow + ' <span>' + d.label + '</span></div>' +
      (vacio ? '<div class="menu-empty-day">—</div>' :
        '<div class="menu-platos">' +
          (m.primer ? '<div class="menu-plato"><span class="menu-pl-tag">1º</span>' + _menuEsc(m.primer) + '</div>' : '') +
          (m.segundo ? '<div class="menu-plato"><span class="menu-pl-tag">2º</span>' + _menuEsc(m.segundo) + '</div>' : '') +
          (m.postre ? '<div class="menu-plato"><span class="menu-pl-tag">🍎</span>' + _menuEsc(m.postre) + '</div>' : '') +
          (m.notas ? '<div class="menu-notas">' + _menuEsc(m.notas) + '</div>' : '') +
        '</div>') +
      '</div>';
  }).join("");

  el.innerHTML = '<div class="menu-card">' +
    '<div class="menu-card-hd"><span>🍽️ Menú del comedor</span>' +
      '<span class="menu-card-wk">Semana del ' + dias[0].label + '</span></div>' +
    (hayAlgo ? '<div class="menu-week">' + cards + '</div>'
             : '<div class="menu-empty">El menú de esta semana aún no está publicado.</div>') +
    '</div>';
};

/* ════════ Editor (staff) ════════ */
/* Abre un modal para editar el menú de una semana. */
window.menuComedorEditor = function (baseDate) {
  if (!_menuGestiona()) return;
  _menuEnsureStyles();
  window._menuWk = _menuLunes(baseDate ? new Date(baseDate) : new Date());
  var old = document.getElementById("menu-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "menu-modal";
  w.className = "menu-ov";
  w.innerHTML = '<div class="menu-modal">' +
    '<div class="menu-modal-hd"><h3>🍽️ Menú del comedor</h3>' +
      '<button class="menu-x" onclick="document.getElementById(\'menu-modal\').remove()">✕</button></div>' +
    '<div class="menu-wk-nav">' +
      '<button class="menu-btn" onclick="window._menuNav(-7)">‹ Semana ant.</button>' +
      '<span id="menu-wk-lbl" class="menu-wk-lbl"></span>' +
      '<button class="menu-btn" onclick="window._menuNav(7)">Semana sig. ›</button>' +
    '</div>' +
    '<div class="menu-modal-bd" id="menu-edit-bd"><div class="menu-empty">Cargando…</div></div>' +
    '<div class="menu-modal-ft">' +
      '<button class="menu-btn" onclick="document.getElementById(\'menu-modal\').remove()">Cerrar</button>' +
      '<button class="menu-btn menu-btn-primary" onclick="window._menuGuardar(this)">Guardar menú</button>' +
    '</div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });
  _menuCargarEditor();
};

window._menuNav = function (delta) {
  window._menuWk = new Date(window._menuWk.getFullYear(), window._menuWk.getMonth(), window._menuWk.getDate() + delta);
  _menuCargarEditor();
};

async function _menuCargarEditor() {
  var bd = document.getElementById("menu-edit-bd");
  if (!bd) return;
  var dias = _menuSemanaFechas(window._menuWk);
  var lbl = document.getElementById("menu-wk-lbl");
  if (lbl) lbl.textContent = "Semana del " + dias[0].label + " al " + dias[4].label;
  bd.innerHTML = '<div class="menu-empty">Cargando…</div>';
  var r = await window.sb.from("menu_comedor")
    .select("fecha,primer,segundo,postre,notas")
    .eq("centro_id", window.ctrId)
    .gte("fecha", dias[0].fecha).lte("fecha", dias[4].fecha);
  var map = {};
  (r.data || []).forEach(function (m) { map[m.fecha] = m; });

  bd.innerHTML = dias.map(function (d) {
    var m = map[d.fecha] || {};
    return '<div class="menu-edit-day" data-fecha="' + d.fecha + '">' +
      '<div class="menu-edit-hd">' + d.dow + ' · ' + d.label + '</div>' +
      '<div class="menu-edit-grid">' +
        '<input class="menu-in" data-f="primer" type="text" maxlength="120" placeholder="Primer plato" value="' + _menuEsc(m.primer || "") + '">' +
        '<input class="menu-in" data-f="segundo" type="text" maxlength="120" placeholder="Segundo plato" value="' + _menuEsc(m.segundo || "") + '">' +
        '<input class="menu-in" data-f="postre" type="text" maxlength="80" placeholder="Postre" value="' + _menuEsc(m.postre || "") + '">' +
        '<input class="menu-in" data-f="notas" type="text" maxlength="160" placeholder="Notas / alérgenos" value="' + _menuEsc(m.notas || "") + '">' +
      '</div></div>';
  }).join("");
}

window._menuGuardar = async function (btn) {
  var bd = document.getElementById("menu-edit-bd");
  if (!bd) return;
  var rows = [];
  Array.prototype.forEach.call(bd.querySelectorAll(".menu-edit-day"), function (dayEl) {
    var fecha = dayEl.getAttribute("data-fecha");
    var vals = {};
    Array.prototype.forEach.call(dayEl.querySelectorAll(".menu-in"), function (inp) {
      vals[inp.getAttribute("data-f")] = (inp.value || "").trim() || null;
    });
    // Solo persistir días con algún contenido
    if (vals.primer || vals.segundo || vals.postre || vals.notas) {
      rows.push({
        centro_id: window.ctrId, fecha: fecha,
        primer: vals.primer, segundo: vals.segundo, postre: vals.postre, notas: vals.notas,
      });
    }
  });
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  if (rows.length) {
    var r = await window.sb.from("menu_comedor").upsert(rows, { onConflict: "centro_id,fecha" });
    if (r.error) { if (btn) { btn.disabled = false; btn.textContent = "Guardar menú"; } showToast("Error: " + r.error.message); return; }
  }
  if (btn) { btn.disabled = false; btn.textContent = "Guardar menú"; }
  showToast("✅ Menú guardado");
  // Refrescar vistas abiertas
  var rdr = document.getElementById("menu-readonly");
  if (rdr) window.renderMenuComedor(rdr);
};

/* ── CSS ── */
function _menuEnsureStyles() {
  if (document.getElementById("menu-styles")) return;
  var s = document.createElement("style");
  s.id = "menu-styles";
  s.textContent = [
    ".menu-card{background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden;}",
    ".menu-card-hd{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line);font-weight:700;font-size:14px;color:var(--txt);background:var(--surface-sunk);}",
    ".menu-card-wk{font-size:12px;font-weight:500;color:var(--muted);}",
    ".menu-week{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--line);}",
    ".menu-day{background:var(--paper);padding:11px 12px;min-height:90px;}",
    ".menu-day-hoy{background:color-mix(in srgb,var(--ink) 6%,var(--paper));}",
    ".menu-day-hd{font-size:12px;font-weight:700;color:var(--txt2);margin-bottom:8px;}",
    ".menu-day-hd span{font-weight:400;color:var(--muted);}",
    ".menu-platos{display:flex;flex-direction:column;gap:5px;}",
    ".menu-plato{font-size:12.5px;color:var(--txt);line-height:1.35;}",
    ".menu-pl-tag{display:inline-block;font-size:10px;font-weight:700;color:var(--muted);margin-right:4px;}",
    ".menu-notas{font-size:11px;color:var(--muted);font-style:italic;margin-top:3px;}",
    ".menu-empty-day{color:var(--muted-2);font-size:13px;}",
    ".menu-empty{padding:26px 16px;text-align:center;color:var(--muted);font-size:13px;}",
    ".menu-ov{position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}",
    ".menu-modal{background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:620px;max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--line);}",
    ".menu-modal-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);flex:0 0 auto;}",
    ".menu-modal-hd h3{margin:0;font-size:17px;font-weight:700;color:var(--txt);}",
    ".menu-x{background:none;border:none;font-size:16px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".menu-x:hover{background:var(--surface-sunk);}",
    ".menu-wk-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 20px;border-bottom:1px solid var(--line);flex:0 0 auto;}",
    ".menu-wk-lbl{font-size:13px;font-weight:600;color:var(--txt2);}",
    ".menu-modal-bd{padding:14px 20px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:12px;}",
    ".menu-edit-day{border:1px solid var(--line);border-radius:10px;padding:11px 12px;}",
    ".menu-edit-hd{font-size:13px;font-weight:700;color:var(--txt);margin-bottom:8px;}",
    ".menu-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}",
    ".menu-in{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line-2);border-radius:7px;font-size:13px;font-family:inherit;background:var(--paper);color:var(--txt);}",
    ".menu-in:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px var(--ink-ll);}",
    ".menu-modal-ft{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line);flex:0 0 auto;}",
    ".menu-btn{padding:8px 14px;border-radius:8px;border:1px solid var(--line-2);background:var(--paper);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".menu-btn:hover{background:var(--surface-sunk);}",
    ".menu-btn-primary{background:var(--ink);color:#fff;border-color:var(--ink);}",
    "@media(max-width:768px){.menu-week{grid-template-columns:1fr;}.menu-edit-grid{grid-template-columns:1fr;}}",
  ].join("");
  document.head.appendChild(s);
}
