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

// clave de nombre: minúsculas, sin acentos, sin coma, palabras ordenadas
// ("Cerro, Sara" ≡ "Sara Cerro")
function _matNombreKey(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean).sort().join(' ');
}

async function _matCargarGrupos() {
  if (role === 'familia') {
    return [...new Set((currentUserAlumnos || []).map(function (a) { return a.grupo_horario; }).filter(Boolean))]
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  // Fuente 1: alumnos del centro (funciona para cualquier centro con alumnos importados)
  var ar = await sb.from('alumnos').select('grupo_horario')
    .eq('centro_id', ctrId).not('grupo_horario', 'is', null).limit(5000);
  console.log('[Materiales] grupos desde alumnos → filas:', (ar.data ? ar.data.length : ar.data), '| error:', ar.error);
  var grupos = [...new Set((ar.data || []).map(function (a) { return a.grupo_horario; }).filter(Boolean))];

  // Fuente 2 (fallback): necesidades_lectivas si alumnos falla o no devuelve grupos
  // (Agora y centros sin alumnos importados)
  if (ar.error || !grupos.length) {
    var nr = await sb.from('necesidades_lectivas').select('grupo_horario')
      .eq('centro_id', ctrId).not('grupo_horario', 'is', null).limit(10000);
    console.log('[Materiales] fallback grupos desde necesidades_lectivas → filas:', (nr.data ? nr.data.length : nr.data), '| error:', nr.error);
    grupos = [...new Set((nr.data || []).map(function (n) { return n.grupo_horario; }).filter(Boolean))];
  }

  return grupos.sort(function (a, b) { return a.localeCompare(b, 'es'); });
}

// Grupos del profesor logueado (para el FORM de subida). Devuelve { grupos, aviso }.
async function _matCargarMisGrupos() {
  // a) full_name del usuario
  var fullName = currentUserName || '';
  if (!fullName) {
    try {
      var u = await sb.auth.getUser();
      var uid = u && u.data && u.data.user ? u.data.user.id : null;
      if (uid) {
        var pr0 = await sb.from('profiles').select('full_name').eq('id', uid).maybeSingle();
        fullName = (pr0.data && pr0.data.full_name) || '';
      }
    } catch (e) { /* ignore */ }
  }

  // b) todos los profesores del centro
  var pr = await sb.from('profesores').select('id,nombre').eq('centro_id', ctrId).limit(2000);
  console.log('[Materiales] mis clases — full_name:', fullName, '| profesores centro:', (pr.data ? pr.data.length : pr.data), '| error:', pr.error);

  // c) match por nombre normalizado (sin acentos/coma, palabras ordenadas)
  var myKey = _matNombreKey(fullName);
  var match = myKey ? (pr.data || []).find(function (p) { return _matNombreKey(p.nombre) === myKey; }) : null;

  // d) si hay match → grupos de necesidades_lectivas de ese profesor
  if (match) {
    var nr = await sb.from('necesidades_lectivas').select('grupo_horario')
      .eq('centro_id', ctrId).eq('profesor_id', match.id).not('grupo_horario', 'is', null).limit(5000);
    console.log('[Materiales] mis clases — profesor:', match.nombre, '| grupos:', (nr.data ? nr.data.length : nr.data), '| error:', nr.error);
    var mis = [...new Set((nr.data || []).map(function (n) { return n.grupo_horario; }).filter(Boolean))]
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
    if (mis.length) return { grupos: mis, aviso: false };
  }

  // e) sin coincidencia (o profesor sin grupos) → todos los grupos del centro + aviso
  console.log('[Materiales] mis clases — sin coincidencia, mostrando todos los grupos');
  return { grupos: await _matCargarGrupos(), aviso: true };
}

// ── INICIALIZACIÓN ──
async function initMateriales() {
  var cont = document.getElementById('mat-container');
  if (!cont) return;
  cont.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;"><span class="spin">⟳</span> Cargando…</div>';
  _matGrupos = await _matCargarGrupos();

  // Grupos del formulario de subida: solo las clases del profesor (o todos + aviso)
  var misGrupos = { grupos: [], aviso: false };
  if (_matPuedeEditar()) misGrupos = await _matCargarMisGrupos();

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

    (_matPuedeEditar() ? _matFormHtml(misGrupos) : '') +

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

function _matFormHtml(misGrupos) {
  var grupos = (misGrupos && misGrupos.grupos) || [];
  var grupoOpts = grupos.map(function (g) { return '<option value="' + _matEsc(g) + '">' + _matEsc(g) + '</option>'; }).join('');
  var aviso = (misGrupos && misGrupos.aviso)
    ? '<div style="font-size:11.5px;color:var(--warning, #d69540);margin-top:4px;">⚠ No se encontraron tus clases — mostrando todos.</div>'
    : '';
  return '<div class="card" id="mat-form" style="display:none;">' +
    '<div class="card-hdr"><div class="card-ico g">📎</div><div><div class="card-title">Nuevo material</div></div></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;">' +
      '<div style="min-width:170px;"><label class="lbl">Grupos (uno o varios)</label>' +
        '<select class="fi" id="mat-grupo" multiple size="6" style="height:auto;min-height:auto;">' + grupoOpts + '</select>' + aviso + '</div>' +
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
  var sel    = document.getElementById('mat-grupo');
  var grupos = sel ? Array.from(sel.selectedOptions).map(function (o) { return o.value; }).filter(Boolean) : [];
  var asig   = ((document.getElementById('mat-asig')  || {}).value || '').trim();
  var tipo   = (document.getElementById('mat-tipo')   || {}).value || 'archivo';
  var titulo = ((document.getElementById('mat-titulo')|| {}).value || '').trim();
  var desc   = ((document.getElementById('mat-desc')  || {}).value || '').trim();
  var msg    = document.getElementById('mat-msg');
  var setMsg = function (t, c) { if (msg) { msg.textContent = t; msg.style.display = 'block'; msg.style.color = c || 'var(--txt2)'; } };

  if (!grupos.length) { setMsg('Selecciona al menos un grupo.', 'var(--danger)'); return; }
  if (!titulo)        { setMsg('El título es obligatorio.', 'var(--danger)'); return; }

  var base = {
    centro_id: ctrId, asignatura: asig || null, titulo: titulo, tipo: tipo,
    descripcion: desc || null, profesor_id: currentUser ? currentUser.id : null, profesor_nombre: currentUserName || null
  };

  var btn = document.getElementById('mat-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    if (tipo === 'enlace') {
      var url = ((document.getElementById('mat-url') || {}).value || '').trim();
      if (!url) { setMsg('Indica la URL del enlace.', 'var(--danger)'); return; }
      base.url = url;
    } else {
      var fileInput = document.getElementById('mat-file');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { setMsg('Selecciona un archivo.', 'var(--danger)'); return; }
      // Subir el archivo UNA sola vez
      var path = ctrId + '/' + _matUuid() + '-' + _matSafeName(file.name);
      setMsg('Subiendo archivo…');
      var up = await sb.storage.from('materiales').upload(path, file, { upsert: false });
      if (up.error) { setMsg('Error al subir: ' + up.error.message, 'var(--danger)'); return; }
      base.storage_path = path;
    }

    // Un registro por grupo (mismo archivo/enlace, distinto grupo)
    var rows = grupos.map(function (g) { return Object.assign({}, base, { grupo: g }); });
    var ins = await sb.from('materiales').insert(rows);
    if (ins.error) { setMsg('Error al guardar: ' + ins.error.message, 'var(--danger)'); return; }

    _matToast('✅ Material añadido a ' + rows.length + ' grupo(s).', 'ok');
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

  // Si es un archivo, comprobar si otros registros del centro comparten el mismo
  // storage_path: solo se borra del Storage si este es el último que lo usa.
  if (m.tipo === 'archivo' && m.storage_path) {
    var otros = await sb.from('materiales').select('id')
      .eq('centro_id', ctrId).eq('storage_path', m.storage_path).neq('id', id).limit(1);
    var hayOtros = !otros.error && otros.data && otros.data.length > 0;
    if (!hayOtros) {
      try { await sb.storage.from('materiales').remove([m.storage_path]); } catch (e) { /* best effort */ }
    } else {
      console.log('[Materiales] otros registros usan el archivo; no se borra de Storage:', m.storage_path);
    }
  }

  var d = await sb.from('materiales').delete().eq('id', id);
  if (d.error) { _matToast('Error al eliminar: ' + d.error.message, 'error'); return; }
  _matToast('Material eliminado.', 'ok');
  await cargarMateriales();
}
