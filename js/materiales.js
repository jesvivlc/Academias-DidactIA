// ── MATERIALES MODULE ──
// Hub de materiales por grupo/asignatura. Lectura: todos los roles del centro.
// Subida/edición: profesional/admin/director/jefatura/superadmin. Borrado: quien lo subió o admin.
// Archivos en bucket privado 'materiales' ({centro_id}/...) servidos con signed URL.
// Globals del proyecto: sb, ctrId, role, currentUser, currentUserName, currentUserAlumnos.

let _matData    = [];
let _matGrupos  = [];
let _matVista   = 'mias';   // solo profesional: 'mias' = subidos por mí · 'todos' = del centro

function _matEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _matPuedeEditar() { return ['profesional', 'admin', 'director', 'jefatura', 'superadmin'].includes(role); }
function _matEsAdmin()     { return ['admin', 'superadmin', 'director', 'jefatura'].includes(role); }
function _matUuid() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function _matSafeName(n) {
  return String(n || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
}

function _matToast(msg, tipo) {
  var bg = tipo === 'error' ? 'var(--danger, #c0392b)' : tipo === 'warn' ? 'var(--warning, #d69540)' : 'var(--success, #2e7d32)';
  var t = document.createElement('div');
  t.style.cssText =
    'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0));transform:translateX(-50%);' +
    'z-index:9500;background:' + bg + ';color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;' +
    'font-family:var(--font-ui);box-shadow:var(--sh-lg, 0 8px 24px rgba(0,0,0,.18));max-width:90vw;text-align:center;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2600);
  setTimeout(function () { if (t.parentNode) t.remove(); }, 3100);
}

async function _matCargarGrupos() {
  if (role === 'familia') {
    return [...new Set((currentUserAlumnos || []).map(function (a) { return a.grupo_horario; }).filter(Boolean))]
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  // Fuente fija: grupos reales del centro desde necesidades_lectivas
  var r = await sb.from('necesidades_lectivas').select('grupo_horario')
    .eq('centro_id', ctrId).not('grupo_horario', 'is', null).limit(10000);
  console.log('[Materiales] grupos desde necesidades_lectivas → filas:', (r.data ? r.data.length : r.data), '| error:', r.error);
  return [...new Set((r.data || []).map(function (n) { return n.grupo_horario; }).filter(Boolean))]
    .sort(function (a, b) { return a.localeCompare(b, 'es'); });
}

// ── INICIALIZACIÓN ──
async function initMateriales() {
  var cont = document.getElementById('mat-container');
  if (!cont) return;
  cont.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;"><span class="spin">⟳</span> Cargando…</div>';
  _matGrupos = await _matCargarGrupos();

  var grupoOpts = '<option value="">Todos los grupos</option>' +
    _matGrupos.map(function (g) { return '<option value="' + _matEsc(g) + '">' + _matEsc(g) + '</option>'; }).join('');

  var addBtn = _matPuedeEditar()
    ? '<button class="btn btn-p" onclick="_matToggleForm()">➕ Añadir material</button>'
    : '';

  // Toggle "Mis materiales / Todos" — solo para el profesorado
  var toggle = (role === 'profesional')
    ? '<div class="mat-toggle" style="display:inline-flex;background:var(--paper-2);border:1px solid var(--line);border-radius:8px;padding:2px;gap:2px;">' +
        '<button id="mat-tg-mias"  class="btn btn-s" style="border:none;" onclick="matSetVista(\'mias\')">Mis materiales</button>' +
        '<button id="mat-tg-todos" class="btn btn-s" style="border:none;" onclick="matSetVista(\'todos\')">Todos</button>' +
      '</div>'
    : '';

  cont.innerHTML =
    '<div class="pg-hdr">' +
      '<div><div class="pg-title">Materiales</div>' +
      '<div class="pg-sub">Recursos del centro por grupo y asignatura</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' + toggle + addBtn + '</div>' +
    '</div>' +

    (_matPuedeEditar() ? _matFormHtml(grupoOpts) : '') +

    '<div class="card">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div style="min-width:160px;"><label class="lbl">Grupo</label>' +
          '<select class="fi" id="mat-f-grupo" onchange="_matRenderLista()"><option value="">Todos los grupos</option></select></div>' +
        '<div style="min-width:160px;"><label class="lbl">Asignatura</label>' +
          '<select class="fi" id="mat-f-asig" onchange="_matRenderLista()"><option value="">Todas las asignaturas</option></select></div>' +
        '<button class="btn btn-s" onclick="cargarMateriales()">↺ Actualizar</button>' +
      '</div>' +
    '</div>' +

    '<div id="mat-lista"></div>';

  await cargarMateriales();
}

// Cambia entre "Mis materiales" y "Todos" (profesorado). Recarga y repuebla filtros.
function matSetVista(v) {
  _matVista = (v === 'todos') ? 'todos' : 'mias';
  cargarMateriales();
}

// Activa el botón correcto del toggle según _matVista
function _matSyncToggle() {
  var bm = document.getElementById('mat-tg-mias');
  var bt = document.getElementById('mat-tg-todos');
  if (!bm || !bt) return;
  var on = 'background:var(--ink);color:#fff;border:none;';
  var off = 'background:transparent;color:var(--txt2);border:none;';
  bm.style.cssText = (_matVista === 'mias')  ? on : off;
  bt.style.cssText = (_matVista === 'todos') ? on : off;
}

// Repuebla los selects de Grupo y Asignatura con los valores presentes en la vista actual
function _matPopularFiltros() {
  var uniq = function (key) {
    return [...new Set(_matData.map(function (m) { return m[key]; }).filter(Boolean))]
      .sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); });
  };
  var fill = function (id, vals, ph) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + ph + '</option>' +
      vals.map(function (v) { return '<option value="' + _matEsc(v) + '">' + _matEsc(v) + '</option>'; }).join('');
    sel.value = (cur && vals.indexOf(cur) !== -1) ? cur : '';   // conserva selección si sigue presente
  };
  fill('mat-f-grupo', uniq('grupo'), 'Todos los grupos');
  fill('mat-f-asig', uniq('asignatura'), 'Todas las asignaturas');
}

function _matFormHtml(grupoOpts) {
  return '<div class="card" id="mat-form" style="display:none;">' +
    '<div class="card-hdr"><div class="card-ico g">📎</div><div><div class="card-title">Nuevo material</div></div></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">' +
      '<div style="min-width:150px;"><label class="lbl">Grupo</label><select class="fi" id="mat-grupo">' + grupoOpts + '</select></div>' +
      '<div style="min-width:150px;"><label class="lbl">Asignatura</label><input class="fi" id="mat-asig" placeholder="Ej: Matemáticas"></div>' +
      '<div style="min-width:130px;"><label class="lbl">Tipo</label>' +
        '<select class="fi" id="mat-tipo" onchange="_matTipoChange()"><option value="archivo">Archivo</option><option value="enlace">Enlace</option></select></div>' +
    '</div>' +
    '<div style="margin-top:10px;"><label class="lbl">Título</label><input class="fi" id="mat-titulo" placeholder="Título del material"></div>' +
    '<div style="margin-top:10px;" id="mat-archivo-wrap"><label class="lbl">Archivo</label><input class="fi" type="file" id="mat-file"></div>' +
    '<div style="margin-top:10px;display:none;" id="mat-url-wrap"><label class="lbl">URL del enlace</label><input class="fi" id="mat-url" placeholder="https://…"></div>' +
    '<div style="margin-top:10px;"><label class="lbl">Descripción (opcional)</label><textarea class="fa" id="mat-desc" placeholder="Breve descripción…"></textarea></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button class="btn btn-s" onclick="_matToggleForm()">Cancelar</button>' +
      '<button class="btn btn-p" id="mat-save-btn" onclick="matGuardar()">💾 Guardar material</button>' +
    '</div>' +
    '<div id="mat-msg" style="display:none;font-size:13px;margin-top:8px;"></div>' +
  '</div>';
}

function _matToggleForm() {
  var f = document.getElementById('mat-form');
  if (f) f.style.display = (f.style.display === 'none' || !f.style.display) ? 'block' : 'none';
}
function _matTipoChange() {
  var tipo = (document.getElementById('mat-tipo') || {}).value;
  var aw = document.getElementById('mat-archivo-wrap');
  var uw = document.getElementById('mat-url-wrap');
  if (aw) aw.style.display = tipo === 'archivo' ? 'block' : 'none';
  if (uw) uw.style.display = tipo === 'enlace' ? 'block' : 'none';
}

async function cargarMateriales() {
  var box = document.getElementById('mat-lista');
  if (box) box.innerHTML = '<div class="card" style="text-align:center;color:var(--txt3);font-size:13px;"><span class="spin">⟳</span> Cargando materiales…</div>';
  var q = sb.from('materiales').select('*').eq('centro_id', ctrId).order('created_at', { ascending: false }).limit(2000);
  // familia: limitar a los grupos de sus hijos
  if (role === 'familia' && _matGrupos.length) q = q.in('grupo', _matGrupos);
  // profesional con vista "Mis materiales": solo los que subió (profesor_id = auth.uid())
  if (role === 'profesional' && _matVista === 'mias' && currentUser) q = q.eq('profesor_id', currentUser.id);
  var r = await q;
  if (r.error) {
    if (box) box.innerHTML = '<div class="card" style="color:var(--red);font-size:13px;">Error: ' + _matEsc(r.error.message) + '</div>';
    return;
  }
  _matData = r.data || [];
  _matSyncToggle();
  _matPopularFiltros();   // los filtros reflejan SOLO la vista actual
  _matRenderLista();
}

function _matRenderLista() {
  var box = document.getElementById('mat-lista');
  if (!box) return;
  var fg = (document.getElementById('mat-f-grupo') || {}).value || '';
  var fa = (document.getElementById('mat-f-asig') || {}).value || '';   // ahora es select: valor exacto

  var rows = _matData.filter(function (m) {
    if (fg && m.grupo !== fg) return false;
    if (fa && String(m.asignatura || '') !== fa) return false;
    return true;
  });

  if (!rows.length) {
    box.innerHTML = '<div class="card" style="text-align:center;color:var(--txt3);font-size:13px;">No hay materiales' + (fg ? ' para ' + _matEsc(fg) : '') + '.</div>';
    return;
  }

  var puedeBorrar = function (m) {
    return _matEsAdmin() || (currentUser && m.profesor_id === currentUser.id);
  };

  var cards = rows.map(function (m) {
    var ico = m.tipo === 'enlace' ? '🔗' : '📄';
    var meta = [m.grupo, m.asignatura].filter(Boolean).map(_matEsc).join(' · ');
    var delBtn = puedeBorrar(m)
      ? '<button class="btn btn-s" style="color:var(--danger);" onclick="matEliminar(\'' + _matEsc(m.id) + '\')">Eliminar</button>'
      : '';
    return '<div class="card" style="display:flex;gap:14px;align-items:flex-start;">' +
      '<div style="font-size:24px;flex-shrink:0;">' + ico + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:14px;">' + _matEsc(m.titulo) + '</div>' +
        '<div style="font-size:12px;color:var(--txt3);margin-top:2px;">' + meta + (m.profesor_nombre ? ' · ' + _matEsc(m.profesor_nombre) : '') + '</div>' +
        (m.descripcion ? '<div style="font-size:13px;color:var(--txt2);margin-top:6px;">' + _matEsc(m.descripcion) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">' +
        '<button class="btn btn-p" onclick="matAbrir(\'' + _matEsc(m.id) + '\')">' + (m.tipo === 'enlace' ? 'Abrir' : 'Descargar') + '</button>' +
        delBtn +
      '</div>' +
    '</div>';
  }).join('');

  box.innerHTML = '<div style="font-size:12px;color:var(--txt3);margin:4px 2px 10px;">' + rows.length + ' material(es)</div>' + cards;
}

// ── Guardar (subir archivo a Storage privado o registrar enlace) ──
async function matGuardar() {
  if (!_matPuedeEditar()) { _matToast('No tienes permiso para añadir materiales.', 'error'); return; }
  var grupo  = (document.getElementById('mat-grupo')  || {}).value;
  var asig   = ((document.getElementById('mat-asig')  || {}).value || '').trim();
  var tipo   = (document.getElementById('mat-tipo')   || {}).value || 'archivo';
  var titulo = ((document.getElementById('mat-titulo')|| {}).value || '').trim();
  var desc   = ((document.getElementById('mat-desc')  || {}).value || '').trim();
  var msg    = document.getElementById('mat-msg');
  var setMsg = function (t, c) { if (msg) { msg.textContent = t; msg.style.display = 'block'; msg.style.color = c || 'var(--txt2)'; } };

  if (!grupo)  { setMsg('Selecciona un grupo.', 'var(--danger)'); return; }
  if (!titulo) { setMsg('El título es obligatorio.', 'var(--danger)'); return; }

  var row = {
    centro_id: ctrId, grupo: grupo, asignatura: asig || null, titulo: titulo, tipo: tipo,
    descripcion: desc || null, profesor_id: currentUser ? currentUser.id : null, profesor_nombre: currentUserName || null
  };

  var btn = document.getElementById('mat-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    if (tipo === 'enlace') {
      var url = ((document.getElementById('mat-url') || {}).value || '').trim();
      if (!url) { setMsg('Indica la URL del enlace.', 'var(--danger)'); return; }
      row.url = url;
    } else {
      var fileInput = document.getElementById('mat-file');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { setMsg('Selecciona un archivo.', 'var(--danger)'); return; }
      var path = ctrId + '/' + _matUuid() + '-' + _matSafeName(file.name);
      setMsg('Subiendo archivo…');
      var up = await sb.storage.from('materiales').upload(path, file, { upsert: false });
      if (up.error) { setMsg('Error al subir: ' + up.error.message, 'var(--danger)'); return; }
      row.storage_path = path;
    }

    var ins = await sb.from('materiales').insert(row);
    if (ins.error) { setMsg('Error al guardar: ' + ins.error.message, 'var(--danger)'); return; }

    _matToast('✅ Material añadido.', 'ok');
    // limpiar form
    ['mat-titulo', 'mat-asig', 'mat-desc', 'mat-url'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    var fi = document.getElementById('mat-file'); if (fi) fi.value = '';
    if (msg) msg.style.display = 'none';
    _matToggleForm();
    await cargarMateriales();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar material'; }
  }
}

// ── Abrir / descargar (signed URL para archivos del bucket privado) ──
async function matAbrir(id) {
  var m = _matData.find(function (x) { return x.id === id; });
  if (!m) return;
  if (m.tipo === 'enlace') {
    if (m.url) window.open(m.url, '_blank', 'noopener');
    else _matToast('Este material no tiene URL.', 'warn');
    return;
  }
  if (!m.storage_path) { _matToast('Archivo no disponible.', 'warn'); return; }
  var s = await sb.storage.from('materiales').createSignedUrl(m.storage_path, 3600);
  if (s.error || !s.data || !s.data.signedUrl) { _matToast('No se pudo generar el enlace de descarga.', 'error'); return; }
  window.open(s.data.signedUrl, '_blank', 'noopener');
}

// ── Eliminar (fila + archivo de Storage si aplica) ──
async function matEliminar(id) {
  var m = _matData.find(function (x) { return x.id === id; });
  if (!m) return;
  if (!confirm('¿Eliminar "' + (m.titulo || 'este material') + '"? No se puede deshacer.')) return;
  if (m.tipo === 'archivo' && m.storage_path) {
    try { await sb.storage.from('materiales').remove([m.storage_path]); } catch (e) { /* best effort */ }
  }
  var d = await sb.from('materiales').delete().eq('id', id);
  if (d.error) { _matToast('Error al eliminar: ' + d.error.message, 'error'); return; }
  _matToast('Material eliminado.', 'ok');
  await cargarMateriales();
}
