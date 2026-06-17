/* Módulo Documentos del centro — biblioteca de circulares, normativa, PGA, formularios… */

function _docEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _docGestiona() {
  return ["admin", "admin_institucional", "director", "jefatura", "superadmin"].includes(window.role);
}
function _docFmt(f) { try { return new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }
var _DOC_CATS = {
  circular: "Circular", normativa: "Normativa", pga: "PGA / Proyecto", calendario: "Calendario",
  formulario: "Formulario", otro: "Otro",
};
var _DOC_ICON = { circular: "📣", normativa: "⚖️", pga: "📚", calendario: "🗓️", formulario: "📝", otro: "📄" };
var _docCatFiltro = "todas";
var _DOC_BUCKET = "documentos-centro";

window.initDocumentos = function () {
  var el = document.getElementById("panel-documentos");
  if (!el) return;
  _docEnsureStyles();
  el.innerHTML = '<div class="doc-page"><div class="doc-hdr">' +
    '<div><div class="doc-eyebrow">CENTRO · DOCUMENTACIÓN</div>' +
    '<h1 class="doc-title">Documentos del centro</h1>' +
    '<p class="doc-sub">Circulares, normativa, calendario y formularios a un clic.</p></div>' +
    (_docGestiona() ? '<button class="doc-btn doc-btn-primary" onclick="window._docNuevo()">+ Subir documento</button>' : '') +
    '</div>' +
    '<div id="doc-cats" class="doc-cats"></div>' +
    '<div id="doc-list" class="doc-list-wrap"><div class="doc-loading">Cargando…</div></div></div>';
  _docCargar();
};

async function _docCargar() {
  var box = document.getElementById("doc-list");
  if (!box) return;
  var r = await window.sb.from("documentos_centro")
    .select("id,titulo,categoria,descripcion,tipo,url,storage_path,visible_para,created_at")
    .eq("centro_id", window.ctrId).order("created_at", { ascending: false });
  var docs = r.data || [];
  window._docData = docs;

  // Chips de categoría con conteo
  var cats = document.getElementById("doc-cats");
  if (cats) {
    var counts = {};
    docs.forEach(function (d) { counts[d.categoria] = (counts[d.categoria] || 0) + 1; });
    var chips = '<button class="doc-chip' + (_docCatFiltro === "todas" ? " doc-chip-act" : "") + '" onclick="window._docFiltrar(\'todas\')">Todas (' + docs.length + ')</button>';
    Object.keys(_DOC_CATS).forEach(function (k) {
      if (!counts[k]) return;
      chips += '<button class="doc-chip' + (_docCatFiltro === k ? " doc-chip-act" : "") + '" onclick="window._docFiltrar(\'' + k + '\')">' + _DOC_ICON[k] + " " + _DOC_CATS[k] + ' (' + counts[k] + ')</button>';
    });
    cats.innerHTML = chips;
  }
  _docRender();
}

window._docFiltrar = function (c) { _docCatFiltro = c; _docCargar(); };

function _docRender() {
  var box = document.getElementById("doc-list");
  if (!box) return;
  var docs = (window._docData || []).filter(function (d) { return _docCatFiltro === "todas" || d.categoria === _docCatFiltro; });
  if (!docs.length) {
    box.innerHTML = '<div class="doc-empty">No hay documentos' + (_docCatFiltro !== "todas" ? " en esta categoría" : " todavía") + '.</div>';
    return;
  }
  var gest = _docGestiona();
  box.innerHTML = '<div class="doc-grid">' + docs.map(function (d) {
    var visBadge = d.visible_para === "staff" ? '<span class="doc-vis">Solo personal</span>'
                 : d.visible_para === "familias" ? '<span class="doc-vis">Familias</span>' : '';
    return '<div class="doc-card">' +
      '<div class="doc-card-ic">' + (_DOC_ICON[d.categoria] || "📄") + '</div>' +
      '<div class="doc-card-body">' +
        '<div class="doc-card-ttl">' + _docEsc(d.titulo) + '</div>' +
        '<div class="doc-card-meta">' + (_DOC_CATS[d.categoria] || "Documento") + ' · ' + _docFmt(d.created_at) + (d.tipo === "enlace" ? " · 🔗 enlace" : "") + ' ' + visBadge + '</div>' +
        (d.descripcion ? '<div class="doc-card-desc">' + _docEsc(d.descripcion) + '</div>' : '') +
      '</div>' +
      '<div class="doc-card-act">' +
        '<button class="doc-btn doc-btn-sm doc-btn-primary" onclick="window._docAbrir(\'' + d.id + '\')">Abrir</button>' +
        (gest ? '<button class="doc-btn doc-btn-sm doc-btn-danger" title="Eliminar" onclick="window._docBorrar(\'' + d.id + '\')">✕</button>' : '') +
      '</div></div>';
  }).join("") + '</div>';
}

window._docAbrir = async function (id) {
  var d = (window._docData || []).find(function (x) { return x.id === id; });
  if (!d) return;
  if (d.tipo === "enlace" && d.url) { window.open(d.url, "_blank", "noopener"); return; }
  if (!d.storage_path) { showToast("Documento no disponible"); return; }
  var r = await window.sb.storage.from(_DOC_BUCKET).createSignedUrl(d.storage_path, 3600);
  if (r.error || !r.data) { showToast("No se pudo abrir el documento"); return; }
  window.open(r.data.signedUrl, "_blank", "noopener");
};

window._docBorrar = async function (id) {
  if (!_docGestiona()) return;
  var d = (window._docData || []).find(function (x) { return x.id === id; });
  if (!d) return;
  if (!confirm("¿Eliminar “" + d.titulo + "”?")) return;
  if (d.storage_path) { try { await window.sb.storage.from(_DOC_BUCKET).remove([d.storage_path]); } catch (e) {} }
  var r = await window.sb.from("documentos_centro").delete().eq("id", id);
  if (r.error) { showToast("Error: " + r.error.message); return; }
  showToast("Documento eliminado");
  _docCargar();
};

/* ── Subir ── */
window._docNuevo = function () {
  if (!_docGestiona()) return;
  var old = document.getElementById("doc-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "doc-modal";
  w.className = "doc-ov";
  w.innerHTML = '<div class="doc-modal">' +
    '<div class="doc-modal-hd"><h3>Subir documento</h3><button class="doc-x" onclick="document.getElementById(\'doc-modal\').remove()">✕</button></div>' +
    '<div class="doc-modal-bd">' +
      '<label class="doc-fl">Título *</label><input id="doc-f-titulo" class="doc-in" type="text" maxlength="140" placeholder="Ej. Circular inicio de curso">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:140px;"><label class="doc-fl">Categoría</label><select id="doc-f-cat" class="doc-in">' +
          Object.keys(_DOC_CATS).map(function (k) { return '<option value="' + k + '">' + _DOC_CATS[k] + '</option>'; }).join("") + '</select></div>' +
        '<div style="flex:1;min-width:140px;"><label class="doc-fl">Visible para</label><select id="doc-f-vis" class="doc-in">' +
          '<option value="todos">Todos</option><option value="familias">Solo familias</option><option value="staff">Solo personal</option></select></div>' +
      '</div>' +
      '<label class="doc-fl">Tipo</label>' +
      '<div class="doc-tipo-sel"><label><input type="radio" name="doc-tipo" value="archivo" checked onchange="window._docTipoChg()"> Archivo</label>' +
        '<label><input type="radio" name="doc-tipo" value="enlace" onchange="window._docTipoChg()"> Enlace externo</label></div>' +
      '<div id="doc-archivo-wrap"><label class="doc-fl">Archivo (PDF, imagen, doc…)</label><input id="doc-f-file" class="doc-in" type="file"></div>' +
      '<div id="doc-enlace-wrap" style="display:none;"><label class="doc-fl">URL</label><input id="doc-f-url" class="doc-in" type="url" placeholder="https://…"></div>' +
      '<label class="doc-fl">Descripción</label><input id="doc-f-desc" class="doc-in" type="text" maxlength="200" placeholder="Opcional">' +
    '</div>' +
    '<div class="doc-modal-ft"><button class="doc-btn" onclick="document.getElementById(\'doc-modal\').remove()">Cancelar</button>' +
      '<button class="doc-btn doc-btn-primary" onclick="window._docGuardar(this)">Subir</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });
};

window._docTipoChg = function () {
  var t = document.querySelector('input[name="doc-tipo"]:checked');
  var esArchivo = !t || t.value === "archivo";
  document.getElementById("doc-archivo-wrap").style.display = esArchivo ? "" : "none";
  document.getElementById("doc-enlace-wrap").style.display = esArchivo ? "none" : "";
};

window._docGuardar = async function (btn) {
  var titulo = (document.getElementById("doc-f-titulo").value || "").trim();
  if (!titulo) { showToast("Indica un título"); return; }
  var tipoSel = document.querySelector('input[name="doc-tipo"]:checked');
  var tipo = tipoSel ? tipoSel.value : "archivo";
  var cat = document.getElementById("doc-f-cat").value;
  var vis = document.getElementById("doc-f-vis").value;
  var desc = (document.getElementById("doc-f-desc").value || "").trim() || null;

  var payload = { centro_id: window.ctrId, titulo: titulo, categoria: cat, visible_para: vis, descripcion: desc, tipo: tipo, subido_por: window.currentUser && window.currentUser.id || null };

  if (tipo === "enlace") {
    var url = (document.getElementById("doc-f-url").value || "").trim();
    if (!url) { showToast("Indica la URL"); return; }
    payload.url = url;
  } else {
    var fileInput = document.getElementById("doc-f-file");
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) { showToast("Selecciona un archivo"); return; }
    if (file.size > 25 * 1024 * 1024) { showToast("El archivo supera 25 MB"); return; }
    if (btn) { btn.disabled = true; btn.textContent = "Subiendo…"; }
    var ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    var safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
    // La carpeta de visibilidad ({centro}/{visible_para}/…) la usa la RLS de Storage
    // para impedir que una familia descargue documentos 'staff' aunque conozca la ruta.
    var visFolder = (vis === "staff" || vis === "familias") ? vis : "todos";
    var path = window.ctrId + "/" + visFolder + "/" + Date.now() + "_" + safe + (safe.endsWith("." + ext) ? "" : "." + ext);
    var up = await window.sb.storage.from(_DOC_BUCKET).upload(path, file, { upsert: false });
    if (up.error) { if (btn) { btn.disabled = false; btn.textContent = "Subir"; } showToast("Error al subir: " + up.error.message); return; }
    payload.storage_path = path;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  var r = await window.sb.from("documentos_centro").insert(payload);
  if (r.error) { if (btn) { btn.disabled = false; btn.textContent = "Subir"; } showToast("Error: " + r.error.message); return; }
  document.getElementById("doc-modal").remove();
  showToast("✅ Documento publicado");
  _docCargar();
};

/* ── CSS ── */
function _docEnsureStyles() {
  if (document.getElementById("doc-styles")) return;
  var s = document.createElement("style");
  s.id = "doc-styles";
  s.textContent = [
    ".doc-page{display:flex;flex-direction:column;height:100%;overflow:auto;}",
    ".doc-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:22px 28px 14px;border-bottom:1px solid var(--line);}",
    ".doc-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}",
    ".doc-title{font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--txt);margin:0 0 2px;}",
    ".doc-sub{font-size:13px;color:var(--muted);margin:0;}",
    ".doc-cats{display:flex;gap:8px;flex-wrap:wrap;padding:14px 28px 0;}",
    ".doc-chip{padding:6px 13px;border-radius:20px;border:1px solid var(--line);background:var(--paper);color:var(--txt2);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".doc-chip-act{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".doc-list-wrap{padding:16px 28px 40px;}",
    ".doc-loading,.doc-empty{text-align:center;padding:46px 20px;color:var(--muted);font-size:14px;}",
    ".doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}",
    ".doc-card{display:flex;gap:12px;align-items:flex-start;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}",
    ".doc-card-ic{font-size:24px;flex:0 0 auto;}",
    ".doc-card-body{flex:1;min-width:0;}",
    ".doc-card-ttl{font-weight:600;font-size:14.5px;color:var(--txt);}",
    ".doc-card-meta{font-size:11.5px;color:var(--muted);margin-top:3px;}",
    ".doc-vis{display:inline-block;background:var(--surface-sunk);color:var(--muted);border-radius:6px;padding:1px 6px;font-size:10px;font-weight:600;margin-left:4px;}",
    ".doc-card-desc{font-size:12.5px;color:var(--txt2);margin-top:6px;line-height:1.4;}",
    ".doc-card-act{display:flex;flex-direction:column;gap:6px;flex:0 0 auto;}",
    ".doc-btn{padding:8px 14px;border-radius:8px;border:1px solid var(--line-2);background:var(--paper);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".doc-btn:hover{background:var(--surface-sunk);}",
    ".doc-btn-sm{padding:6px 11px;font-size:12px;}",
    ".doc-btn-primary{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".doc-btn-danger{color:var(--danger);}",
    ".doc-ov{position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}",
    ".doc-modal{background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:500px;max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--line);}",
    ".doc-modal-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);}",
    ".doc-modal-hd h3{margin:0;font-size:17px;font-weight:700;color:var(--txt);}",
    ".doc-x{background:none;border:none;font-size:16px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".doc-x:hover{background:var(--surface-sunk);}",
    ".doc-modal-bd{padding:16px 20px;overflow:auto;}",
    ".doc-fl{display:block;font-size:12px;font-weight:600;color:var(--txt2);margin:10px 0 4px;}",
    ".doc-in{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line-2);border-radius:8px;font-size:14px;font-family:inherit;background:var(--paper);color:var(--txt);}",
    ".doc-in:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px var(--ink-ll);}",
    ".doc-tipo-sel{display:flex;gap:18px;font-size:13.5px;color:var(--txt2);margin-top:2px;}",
    ".doc-tipo-sel label{cursor:pointer;}",
    ".doc-modal-ft{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line);}",
    "@media(max-width:768px){.doc-hdr{padding:16px;}.doc-cats{padding:12px 16px 0;}.doc-list-wrap{padding:14px 16px 40px;}.doc-grid{grid-template-columns:1fr;}}",
  ].join("");
  document.head.appendChild(s);
}
