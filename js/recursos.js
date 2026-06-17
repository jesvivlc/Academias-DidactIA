/* Módulo Préstamo de recursos — inventario prestable + registro de préstamos */

function _recEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _recHoy() { return new Date().toISOString().split("T")[0]; }
function _recFmtFecha(f) {
  if (!f) return "—";
  var p = f.split("-");
  return p[2] + "/" + p[1] + "/" + p[0].slice(2);
}
var _REC_CATS = ["Portátil", "Tablet", "Libro", "Proyector", "Material deportivo", "Instrumento", "Otro"];
var _recVista = "prestamos";

window.initRecursos = function () {
  var el = document.getElementById("panel-recursos");
  if (!el) return;
  _recEnsureStyles();
  el.innerHTML = '<div class="rec-page">' +
    '<div class="rec-hdr"><div><div class="rec-eyebrow">CENTRO · INVENTARIO</div>' +
    '<h1 class="rec-title">Préstamo de recursos</h1>' +
    '<p class="rec-sub">Controla el material prestable del centro y quién lo tiene.</p></div></div>' +
    '<div class="rec-pills">' +
      '<button id="rec-pill-prestamos" class="rec-pill rec-pill-act" onclick="window._recTab(\'prestamos\')">Préstamos</button>' +
      '<button id="rec-pill-recursos" class="rec-pill" onclick="window._recTab(\'recursos\')">Inventario</button>' +
    '</div>' +
    '<div id="rec-body" class="rec-body"><div class="rec-loading">Cargando…</div></div></div>';
  window._recTab(_recVista);
};

window._recTab = function (v) {
  _recVista = v;
  var pp = document.getElementById("rec-pill-prestamos");
  var pr = document.getElementById("rec-pill-recursos");
  if (pp) pp.className = "rec-pill" + (v === "prestamos" ? " rec-pill-act" : "");
  if (pr) pr.className = "rec-pill" + (v === "recursos" ? " rec-pill-act" : "");
  if (v === "prestamos") _recLoadPrestamos();
  else _recLoadRecursos();
};

/* ════════ INVENTARIO ════════ */
async function _recLoadRecursos() {
  var box = document.getElementById("rec-body");
  if (!box) return;
  box.innerHTML = '<div class="rec-loading">Cargando…</div>';
  var r = await window.sb.from("recursos").select("*").eq("centro_id", window.ctrId).order("nombre");
  var recs = r.data || [];
  var html = '<div class="rec-toolbar"><button class="rec-btn rec-btn-primary" onclick="window._recNuevoRecurso()">+ Nuevo recurso</button>' +
    '<span class="rec-count">' + recs.length + ' recurso' + (recs.length !== 1 ? "s" : "") + '</span></div>';
  if (!recs.length) {
    html += '<div class="rec-empty">No hay recursos en el inventario. Añade el primero.</div>';
  } else {
    html += '<div class="rec-list">' + recs.map(function (x) {
      var est = x.estado === "disponible" ? ["Disponible", "var(--success)"]
              : x.estado === "prestado" ? ["Prestado", "var(--warning)"]
              : ["Baja", "var(--muted)"];
      return '<div class="rec-item">' +
        '<div class="rec-item-main">' +
          '<div class="rec-item-name">' + _recEsc(x.nombre) + (x.codigo ? ' <span class="rec-code">' + _recEsc(x.codigo) + '</span>' : '') + '</div>' +
          '<div class="rec-item-meta">' + (x.categoria ? _recEsc(x.categoria) : "Sin categoría") + (x.notas ? ' · ' + _recEsc(x.notas) : '') + '</div>' +
        '</div>' +
        '<span class="rec-badge" style="background:' + est[1] + '">' + est[0] + '</span>' +
        '<div class="rec-item-actions">' +
          (x.estado === "disponible" ? '<button class="rec-btn" onclick="window._recNuevoPrestamo(\'' + x.id + '\')">Prestar</button>' : '') +
          (x.estado === "baja"
            ? '<button class="rec-btn" onclick="window._recEstadoRecurso(\'' + x.id + '\',\'disponible\')">Reactivar</button>'
            : (x.estado === "disponible" ? '<button class="rec-btn" onclick="window._recEstadoRecurso(\'' + x.id + '\',\'baja\')">Dar de baja</button>' : '')) +
          '<button class="rec-btn rec-btn-danger" title="Eliminar" onclick="window._recBorrarRecurso(\'' + x.id + '\')">✕</button>' +
        '</div></div>';
    }).join("") + '</div>';
  }
  box.innerHTML = html;
}

window._recNuevoRecurso = function () {
  _recModal("Nuevo recurso",
    '<label class="rec-fl">Nombre *</label><input id="rec-f-nombre" class="rec-in" type="text" maxlength="120" placeholder="Ej. Portátil HP nº 12">' +
    '<div style="display:flex;gap:10px;"><div style="flex:1"><label class="rec-fl">Categoría</label>' +
      '<select id="rec-f-cat" class="rec-in">' + _REC_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join("") + '</select></div>' +
      '<div style="flex:1"><label class="rec-fl">Código inventario</label><input id="rec-f-codigo" class="rec-in" type="text" maxlength="40" placeholder="INV-001"></div></div>' +
    '<label class="rec-fl">Notas</label><input id="rec-f-notas" class="rec-in" type="text" maxlength="160" placeholder="Estado, accesorios…">',
    "Guardar recurso", "window._recGuardarRecurso(this)");
};
window._recGuardarRecurso = async function (btn) {
  var nombre = (document.getElementById("rec-f-nombre").value || "").trim();
  if (!nombre) { showToast("Indica un nombre"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  var r = await window.sb.from("recursos").insert({
    centro_id: window.ctrId, nombre: nombre,
    categoria: document.getElementById("rec-f-cat").value || null,
    codigo: (document.getElementById("rec-f-codigo").value || "").trim() || null,
    notas: (document.getElementById("rec-f-notas").value || "").trim() || null,
    estado: "disponible",
  });
  if (r.error) { if (btn) { btn.disabled = false; btn.textContent = "Guardar recurso"; } showToast("Error: " + r.error.message); return; }
  _recCerrarModal();
  showToast("✅ Recurso añadido");
  _recLoadRecursos();
};
window._recEstadoRecurso = async function (id, estado) {
  var r = await window.sb.from("recursos").update({ estado: estado }).eq("id", id);
  if (r.error) { showToast("Error: " + r.error.message); return; }
  _recLoadRecursos();
};
window._recBorrarRecurso = async function (id) {
  if (!confirm("¿Eliminar este recurso y su historial de préstamos?")) return;
  var r = await window.sb.from("recursos").delete().eq("id", id);
  if (r.error) { showToast("Error: " + r.error.message); return; }
  showToast("Recurso eliminado");
  _recLoadRecursos();
};

/* ════════ PRÉSTAMOS ════════ */
async function _recLoadPrestamos() {
  var box = document.getElementById("rec-body");
  if (!box) return;
  box.innerHTML = '<div class="rec-loading">Cargando…</div>';
  var r = await window.sb.from("prestamos")
    .select("id,persona,fecha_prestamo,fecha_prevista,fecha_devolucion,notas,recurso_id,recursos(nombre,codigo,categoria)")
    .eq("centro_id", window.ctrId).order("fecha_prestamo", { ascending: false }).limit(500);
  var ps = r.data || [];
  var activos = ps.filter(function (p) { return !p.fecha_devolucion; });
  var devueltos = ps.filter(function (p) { return p.fecha_devolucion; });
  var hoy = _recHoy();

  window._recPrestamosCache = ps;
  var html = '<div class="rec-toolbar"><button class="rec-btn rec-btn-primary" onclick="window._recNuevoPrestamo()">+ Nuevo préstamo</button>' +
    '<span style="flex:1"></span>' +
    '<button class="rec-btn" onclick="window._recExportar()">📥 Exportar Excel</button>' +
    '<span class="rec-count">' + activos.length + ' activo' + (activos.length !== 1 ? "s" : "") + '</span></div>';

  html += '<div class="rec-sec-ttl">Préstamos activos</div>';
  if (!activos.length) {
    html += '<div class="rec-empty">No hay préstamos activos.</div>';
  } else {
    html += '<div class="rec-list">' + activos.map(function (p) {
      var venc = p.fecha_prevista && p.fecha_prevista < hoy;
      var rname = p.recursos ? p.recursos.nombre : "Recurso";
      return '<div class="rec-item' + (venc ? ' rec-item-venc' : '') + '">' +
        '<div class="rec-item-main">' +
          '<div class="rec-item-name">' + _recEsc(rname) + (p.recursos && p.recursos.codigo ? ' <span class="rec-code">' + _recEsc(p.recursos.codigo) + '</span>' : '') + '</div>' +
          '<div class="rec-item-meta">👤 ' + _recEsc(p.persona) + ' · desde ' + _recFmtFecha(p.fecha_prestamo) +
            (p.fecha_prevista ? ' · ' + (venc ? '<strong style="color:var(--danger)">venció ' : 'devuelve ') + _recFmtFecha(p.fecha_prevista) + (venc ? '</strong>' : '') : '') + '</div>' +
        '</div>' +
        '<div class="rec-item-actions"><button class="rec-btn rec-btn-primary" onclick="window._recDevolver(\'' + p.id + '\',\'' + p.recurso_id + '\')">Devolver</button></div>' +
        '</div>';
    }).join("") + '</div>';
  }

  if (devueltos.length) {
    html += '<div class="rec-sec-ttl">Historial reciente</div><div class="rec-list">' + devueltos.slice(0, 30).map(function (p) {
      var rname = p.recursos ? p.recursos.nombre : "Recurso";
      return '<div class="rec-item rec-item-hist">' +
        '<div class="rec-item-main"><div class="rec-item-name">' + _recEsc(rname) + '</div>' +
        '<div class="rec-item-meta">👤 ' + _recEsc(p.persona) + ' · ' + _recFmtFecha(p.fecha_prestamo) + ' → ' + _recFmtFecha(p.fecha_devolucion) + '</div></div>' +
        '<span class="rec-badge" style="background:var(--muted)">Devuelto</span></div>';
    }).join("") + '</div>';
  }
  box.innerHTML = html;
}

window._recNuevoPrestamo = async function (recursoId) {
  // Recursos disponibles
  var r = await window.sb.from("recursos").select("id,nombre,codigo").eq("centro_id", window.ctrId).eq("estado", "disponible").order("nombre");
  var disp = r.data || [];
  if (!disp.length && !recursoId) { showToast("No hay recursos disponibles para prestar"); return; }
  var opts = disp.map(function (x) {
    return '<option value="' + x.id + '"' + (x.id === recursoId ? " selected" : "") + '>' + _recEsc(x.nombre) + (x.codigo ? " (" + _recEsc(x.codigo) + ")" : "") + '</option>';
  }).join("");
  _recModal("Nuevo préstamo",
    '<label class="rec-fl">Recurso *</label><select id="rec-p-recurso" class="rec-in">' + opts + '</select>' +
    '<label class="rec-fl">Prestado a *</label><input id="rec-p-persona" class="rec-in" type="text" maxlength="120" placeholder="Nombre del profesor / alumno / grupo">' +
    '<div style="display:flex;gap:10px;"><div style="flex:1"><label class="rec-fl">Fecha préstamo</label><input id="rec-p-fecha" class="rec-in" type="date" value="' + _recHoy() + '"></div>' +
      '<div style="flex:1"><label class="rec-fl">Devolución prevista</label><input id="rec-p-prevista" class="rec-in" type="date"></div></div>' +
    '<label class="rec-fl">Notas</label><input id="rec-p-notas" class="rec-in" type="text" maxlength="160" placeholder="Observaciones…">',
    "Registrar préstamo", "window._recGuardarPrestamo(this)");
};
window._recGuardarPrestamo = async function (btn) {
  var recursoId = document.getElementById("rec-p-recurso").value;
  var persona = (document.getElementById("rec-p-persona").value || "").trim();
  if (!recursoId) { showToast("Selecciona un recurso"); return; }
  if (!persona) { showToast("Indica a quién se presta"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  var ins = await window.sb.from("prestamos").insert({
    centro_id: window.ctrId, recurso_id: recursoId, persona: persona,
    fecha_prestamo: document.getElementById("rec-p-fecha").value || _recHoy(),
    fecha_prevista: document.getElementById("rec-p-prevista").value || null,
    notas: (document.getElementById("rec-p-notas").value || "").trim() || null,
    registrado_por: window.currentUser && window.currentUser.id || null,
  });
  if (ins.error) { if (btn) { btn.disabled = false; btn.textContent = "Registrar préstamo"; } showToast("Error: " + ins.error.message); return; }
  await window.sb.from("recursos").update({ estado: "prestado" }).eq("id", recursoId);
  _recCerrarModal();
  showToast("✅ Préstamo registrado");
  _recTab("prestamos");
};
window._recDevolver = async function (prestamoId, recursoId) {
  if (!confirm("¿Marcar como devuelto?")) return;
  var r = await window.sb.from("prestamos").update({ fecha_devolucion: _recHoy() }).eq("id", prestamoId);
  if (r.error) { showToast("Error: " + r.error.message); return; }
  await window.sb.from("recursos").update({ estado: "disponible" }).eq("id", recursoId);
  showToast("✅ Recurso devuelto");
  _recLoadPrestamos();
};

/* ── Exportación contable de préstamos ── */
window._recExportar = function () {
  if (typeof XLSX === "undefined") { showToast("Librería de Excel no disponible"); return; }
  var ps = window._recPrestamosCache || [];
  if (!ps.length) { showToast("No hay préstamos para exportar"); return; }
  var hoy = _recHoy();
  var aoa = [["Recurso", "Código", "Categoría", "Prestado a", "Fecha préstamo", "Devolución prevista", "Devuelto", "Estado", "Notas"]];
  ps.forEach(function (p) {
    var r = p.recursos || {};
    var activo = !p.fecha_devolucion;
    var venc = activo && p.fecha_prevista && p.fecha_prevista < hoy;
    aoa.push([
      r.nombre || "—", r.codigo || "", r.categoria || "",
      p.persona || "", _recFmtFecha(p.fecha_prestamo), p.fecha_prevista ? _recFmtFecha(p.fecha_prevista) : "",
      p.fecha_devolucion ? _recFmtFecha(p.fecha_devolucion) : "",
      p.fecha_devolucion ? "Devuelto" : (venc ? "Vencido" : "Activo"),
      p.notas || "",
    ]);
  });
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, ws, "Préstamos");
  XLSX.writeFile(wb, "prestamos-" + new Date().toISOString().split("T")[0] + ".xlsx");
};

/* ── Modal genérico ── */
function _recModal(titulo, bodyHtml, btnLabel, onSave) {
  _recCerrarModal();
  var w = document.createElement("div");
  w.id = "rec-modal";
  w.className = "rec-ov";
  w.innerHTML = '<div class="rec-modal">' +
    '<div class="rec-modal-hd"><h3>' + _recEsc(titulo) + '</h3><button class="rec-x" onclick="window._recCerrarModal()">✕</button></div>' +
    '<div class="rec-modal-bd">' + bodyHtml + '</div>' +
    '<div class="rec-modal-ft"><button class="rec-btn" onclick="window._recCerrarModal()">Cancelar</button>' +
    '<button class="rec-btn rec-btn-primary" onclick="' + onSave + '">' + btnLabel + '</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) _recCerrarModal(); });
}
window._recCerrarModal = function () {
  var m = document.getElementById("rec-modal");
  if (m) m.remove();
};

/* ── CSS ── */
function _recEnsureStyles() {
  if (document.getElementById("rec-styles")) return;
  var s = document.createElement("style");
  s.id = "rec-styles";
  s.textContent = [
    ".rec-page{display:flex;flex-direction:column;height:100%;overflow:auto;}",
    ".rec-hdr{padding:22px 28px 12px;}",
    ".rec-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}",
    ".rec-title{font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--txt);margin:0 0 2px;}",
    ".rec-sub{font-size:13px;color:var(--muted);margin:0;}",
    ".rec-pills{display:flex;gap:8px;padding:6px 28px 0;}",
    ".rec-pill{padding:7px 16px;border-radius:20px;border:1px solid var(--line);background:var(--paper);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".rec-pill-act{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".rec-body{padding:16px 28px 40px;}",
    ".rec-loading,.rec-empty{text-align:center;padding:40px 20px;color:var(--muted);font-size:14px;}",
    ".rec-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;}",
    ".rec-count{font-size:12px;color:var(--muted);font-weight:600;}",
    ".rec-sec-ttl{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:18px 0 8px;}",
    ".rec-list{display:flex;flex-direction:column;gap:8px;}",
    ".rec-item{display:flex;align-items:center;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 16px;}",
    ".rec-item-venc{border-color:var(--danger);background:color-mix(in srgb,var(--danger) 5%,var(--paper));}",
    ".rec-item-hist{opacity:.72;}",
    ".rec-item-main{flex:1;min-width:0;}",
    ".rec-item-name{font-weight:600;font-size:14px;color:var(--txt);}",
    ".rec-code{font-size:11px;color:var(--muted);font-weight:500;background:var(--surface-sunk);padding:1px 6px;border-radius:5px;margin-left:4px;}",
    ".rec-item-meta{font-size:12px;color:var(--muted);margin-top:3px;}",
    ".rec-item-actions{display:flex;gap:6px;flex:0 0 auto;}",
    ".rec-badge{color:#fff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;text-transform:uppercase;flex:0 0 auto;}",
    ".rec-btn{padding:7px 13px;border-radius:8px;border:1px solid var(--line-2);background:var(--paper);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".rec-btn:hover{background:var(--surface-sunk);}",
    ".rec-btn-primary{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".rec-btn-danger{color:var(--danger);}",
    ".rec-ov{position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}",
    ".rec-modal{background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:480px;max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--line);}",
    ".rec-modal-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);}",
    ".rec-modal-hd h3{margin:0;font-size:17px;font-weight:700;color:var(--txt);}",
    ".rec-x{background:none;border:none;font-size:16px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".rec-x:hover{background:var(--surface-sunk);}",
    ".rec-modal-bd{padding:16px 20px;overflow:auto;}",
    ".rec-fl{display:block;font-size:12px;font-weight:600;color:var(--txt2);margin:10px 0 4px;}",
    ".rec-in{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line-2);border-radius:8px;font-size:14px;font-family:inherit;background:var(--paper);color:var(--txt);}",
    ".rec-in:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px var(--ink-ll);}",
    ".rec-modal-ft{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line);}",
    "@media(max-width:768px){.rec-hdr{padding:16px;}.rec-pills{padding:6px 16px 0;}.rec-body{padding:14px 16px 40px;}.rec-item{flex-wrap:wrap;}}",
  ].join("");
  document.head.appendChild(s);
}
