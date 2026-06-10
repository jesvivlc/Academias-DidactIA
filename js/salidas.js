// ── MÓDULO SALIDAS DIDÁCTICAS ──
// Patrón: panel vacío en app.html; initSalidasPanel() renderiza la vista lista
// y salidasAbrirDetalle() renderiza la vista detalle. "Volver" vuelve a init.

var _salidasData            = [];
var _salidasFiltroEstado    = '';
var _salidasFiltroMes       = '';
var _salidasFiltroGrupo     = '';
var _salidasGrupos          = [];
var _salidasAlumnosPorGrupo = {};

// Detalle
var _salDet      = null;   // salida actual (objeto completo)
var _salDetParts = [];     // participantes enriquecidos con alumno_nombre/grupo
var _salDetTab   = 'dashboard';

// ── HELPERS ─────────────────────────────────────────────────────
function _salEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _salidasToast(msg, color) {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (color || 'var(--ink)') +
    ';color:#fff;padding:10px 18px;border-radius:var(--r-sm);font-size:13px;z-index:9999;box-shadow:var(--sh-lg);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 2800);
}

function _salFmtFecha(d) {
  if (!d) return '—';
  try {
    return new Date(String(d).length <= 10 ? d + 'T12:00:00' : d)
      .toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch(e) { return String(d); }
}

function _salPush(userIds, title, body, tag) {
  try {
    var ids = (userIds || []).filter(Boolean);
    if (!ids.length) return;
    fetch(SB_URL + '/functions/v1/send-push', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + ANON_KEY, 'apikey': ANON_KEY },
      body: JSON.stringify({ user_ids: ids, title: title, body: body, tag: tag || 'salidas' })
    }).catch(function(){});
  } catch(e) {}
}

function _salidasEstadoBadge(estado) {
  var map = {
    borrador:  ['#6b7280','#f3f4f6'],
    publicada: ['var(--info)','var(--info-soft)'],
    cerrada:   ['var(--success)','var(--success-soft)'],
    cancelada: ['var(--danger)','var(--danger-soft)']
  };
  var v = map[estado] || ['#6b7280','#f3f4f6'];
  var label = {borrador:'Borrador',publicada:'Publicada',cerrada:'Cerrada',cancelada:'Cancelada'}[estado] || estado;
  return '<span style="background:' + v[1] + ';color:' + v[0] +
    ';border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">' + label + '</span>';
}

function _salidasCountBadge(x, y) {
  if (y === 0) return '<span style="color:var(--txt3);font-size:13px;">—</span>';
  var color = (x === y) ? 'var(--success)' : (x > 0) ? 'var(--warning)' : 'var(--danger)';
  return '<span style="color:' + color + ';font-weight:600;font-size:13px;">' + x + ' / ' + y + '</span>';
}

function _salProgressBar(x, y) {
  if (!y) return '';
  var pct = Math.round((x / y) * 100);
  var color = (pct === 100) ? 'var(--success)' : (pct > 0) ? 'var(--warning)' : 'var(--danger)';
  return '<div style="background:var(--srf2);border-radius:20px;height:6px;margin-top:4px;">' +
    '<div style="background:' + color + ';width:' + pct + '%;height:6px;border-radius:20px;transition:width .3s;"></div></div>';
}

function _salEnsureJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function _salHexToRgb(hex) {
  var h = String(hex || '#1a73e8').replace('#','');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var n = parseInt(h, 16);
  if (isNaN(n)) return {r:26,g:115,b:232};
  return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};
}

async function _salCentroInfo() {
  try {
    var r = await sb.from('centros').select('nombre,color_primario,logo_url').eq('id',ctrId).single();
    if (r.data) return {nombre: r.data.nombre||'Centro', color: r.data.color_primario||'#1a73e8', logo: r.data.logo_url||''};
  } catch(e) {}
  return {nombre: (typeof ctrName !== 'undefined' && ctrName) || 'Centro', color: '#1a73e8', logo: ''};
}

// ── CARGA DE GRUPOS ─────────────────────────────────────────────
async function _salidasCargarGrupos() {
  var r = await sb.from('alumnos')
    .select('grupo_horario,id')
    .eq('centro_id', ctrId)
    .not('grupo_horario','is',null)
    .order('grupo_horario');
  var map = {};
  (r.data || []).forEach(function(a) {
    if (!map[a.grupo_horario]) map[a.grupo_horario] = [];
    map[a.grupo_horario].push(a.id);
  });
  _salidasAlumnosPorGrupo = map;
  _salidasGrupos = Object.keys(map).sort();
}

// ════════════════════════════════════════════════════════════════
// VISTA LISTA
// ════════════════════════════════════════════════════════════════

function initSalidasPanel() {
  var panel = document.getElementById('panel-salidas');
  if (!panel) return;

  // Render shell HTML (list view)
  panel.innerHTML =
    // Header
    '<div class="pg-hdr">' +
      '<div><div class="pg-title">🚌 Salidas Didácticas</div>' +
      '<div class="pg-sub" id="sal-contador">Cargando…</div></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn" onclick="salExportar()" style="font-size:13px;">⬇ Excel</button>' +
        (role !== 'familia' ? '<button class="btn btn-p" onclick="salNueva()">+ Nueva salida</button>' : '') +
      '</div>' +
    '</div>' +
    // Filters
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
      '<select class="fi" id="sal-filtro-estado" style="max-width:160px;">' +
        '<option value="">Todos los estados</option>' +
        '<option value="borrador">Borrador</option>' +
        '<option value="publicada">Publicada</option>' +
        '<option value="cerrada">Cerrada</option>' +
        '<option value="cancelada">Cancelada</option>' +
      '</select>' +
      '<input class="fi" id="sal-filtro-mes" type="month" title="Filtrar por mes" style="max-width:160px;">' +
      '<select class="fi" id="sal-filtro-grupo" style="max-width:160px;">' +
        '<option value="">Todos los grupos</option>' +
      '</select>' +
      '<button class="btn" onclick="loadSalidas()" style="font-size:13px;">↺ Actualizar</button>' +
    '</div>' +
    // Table
    '<div style="overflow-x:auto;background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);">' +
      '<table style="width:100%;border-collapse:collapse;min-width:700px;">' +
        '<thead><tr style="background:var(--srf2);border-bottom:1px solid var(--bdr);">' +
          '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Título</th>' +
          '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Fecha</th>' +
          '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Grupos</th>' +
          '<th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:var(--txt2);">Coste</th>' +
          '<th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--txt2);">Autorizados</th>' +
          '<th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--txt2);">Pagados</th>' +
          '<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Estado</th>' +
          '<th style="padding:10px 12px;"></th>' +
        '</tr></thead>' +
        '<tbody id="sal-tbody"><tr><td colspan="8" style="text-align:center;padding:24px;color:var(--txt3);">—</td></tr></tbody>' +
      '</table>' +
    '</div>' +
    // Modal placeholder (inserted into body at open time)
    '<div id="sal-modal-anchor"></div>';

  _salidasFiltroEstado = '';
  _salidasFiltroMes = '';
  _salidasFiltroGrupo = '';

  _salidasCargarGrupos().then(function() {
    loadSalidas();
    _salidasInitFiltros();
  });
}
window.initSalidasPanel = initSalidasPanel;

function _salidasInitFiltros() {
  var selEst = document.getElementById('sal-filtro-estado');
  if (selEst && !selEst._salReady) {
    selEst._salReady = true;
    selEst.addEventListener('change', function() { _salidasFiltroEstado = this.value; _salidasRenderFiltered(); });
  }
  var selMes = document.getElementById('sal-filtro-mes');
  if (selMes && !selMes._salReady) {
    selMes._salReady = true;
    selMes.addEventListener('change', function() { _salidasFiltroMes = this.value; _salidasRenderFiltered(); });
  }
  var selGrp = document.getElementById('sal-filtro-grupo');
  if (selGrp && !selGrp._salReady) {
    selGrp._salReady = true;
    if (selGrp.options.length <= 1) {
      _salidasGrupos.forEach(function(g) {
        var opt = document.createElement('option'); opt.value = g; opt.textContent = g;
        selGrp.appendChild(opt);
      });
    }
    selGrp.addEventListener('change', function() { _salidasFiltroGrupo = this.value; _salidasRenderFiltered(); });
  }
}

async function loadSalidas() {
  var tbody = document.getElementById('sal-tbody');
  var hdr   = document.getElementById('sal-contador');
  if (tbody) tbody.innerHTML =
    '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--txt3);"><span class="spin">⟳</span> Cargando…</td></tr>';

  var q = sb.from('salidas_didacticas')
    .select('*, responsable:profiles!responsable_id(full_name)')
    .eq('centro_id', ctrId)
    .order('fecha_salida', { ascending: false });

  // Familia: solo ver salidas publicadas de los grupos de sus hijos
  if (role === 'familia') {
    q = q.eq('estado', 'publicada');
  }

  var { data, error } = await q;
  if (error) {
    if (tbody) tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--red);">Error al cargar salidas.</td></tr>';
    return;
  }

  var salidas = data || [];
  if (salidas.length) {
    var ids = salidas.map(function(s) { return s.id; });
    var { data: parts } = await sb.from('participantes_salida')
      .select('salida_id,autorizado,pagado').in('salida_id', ids);
    var pm = {};
    (parts || []).forEach(function(p) {
      if (!pm[p.salida_id]) pm[p.salida_id] = {total:0,autorizados:0,pagados:0};
      pm[p.salida_id].total++;
      if (p.autorizado) pm[p.salida_id].autorizados++;
      if (p.pagado)     pm[p.salida_id].pagados++;
    });
    salidas.forEach(function(s) { s._p = pm[s.id] || {total:0,autorizados:0,pagados:0}; });
  }

  _salidasData = salidas;
  _salidasRenderFiltered();

  var activas  = salidas.filter(function(s) { return s.estado === 'publicada'; });
  var pendAuth = activas.filter(function(s) { return s._p && s._p.autorizados < s._p.total; });
  if (hdr) hdr.textContent = activas.length + ' salidas activas · ' + pendAuth.length + ' pendientes de autorización completa';
}
window.loadSalidas = loadSalidas;

function _salidasRenderFiltered() {
  var f = _salidasData.slice();
  if (_salidasFiltroEstado) f = f.filter(function(s) { return s.estado === _salidasFiltroEstado; });
  if (_salidasFiltroMes)    f = f.filter(function(s) { return (s.fecha_salida||'').slice(0,7) === _salidasFiltroMes; });
  if (_salidasFiltroGrupo)  f = f.filter(function(s) {
    var gs = Array.isArray(s.curso_grupos) ? s.curso_grupos : [];
    return gs.includes(_salidasFiltroGrupo);
  });
  _salidasRender(f);
}

function _salidasRender(salidas) {
  var tbody = document.getElementById('sal-tbody');
  if (!tbody) return;

  if (!salidas.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--txt3);">' +
      '<div style="font-size:36px;margin-bottom:12px;">🚌</div>' +
      '<div style="font-size:14px;margin-bottom:16px;">No hay salidas didácticas que mostrar.</div>' +
      (role !== 'familia' ? '<button class="btn btn-p" onclick="salNueva()">+ Nueva salida</button>' : '') +
      '</td></tr>';
    return;
  }

  tbody.innerHTML = salidas.map(function(s) {
    var fecha  = _salFmtFecha(s.fecha_salida);
    var grupos = Array.isArray(s.curso_grupos) ? s.curso_grupos : [];
    var p      = s._p || {total:0,autorizados:0,pagados:0};
    var coste  = parseFloat(s.coste||0).toFixed(2) + ' €';
    var chips  = grupos.map(function(g) {
      return '<span style="background:var(--surface-sunk);border-radius:20px;padding:2px 8px;font-size:11px;white-space:nowrap;">' + _salEsc(g) + '</span>';
    }).join(' ');
    return '<tr style="border-bottom:1px solid var(--bdr);">' +
      '<td style="padding:10px 12px;font-size:13px;font-weight:500;color:var(--txt);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _salEsc(s.titulo) + '</td>' +
      '<td style="padding:10px 12px;font-size:13px;color:var(--txt2);white-space:nowrap;">' + fecha + '</td>' +
      '<td style="padding:10px 12px;font-size:12px;">' + (chips || '<span style="color:var(--txt3)">—</span>') + '</td>' +
      '<td style="padding:10px 12px;font-size:13px;text-align:right;">' + coste + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' + _salidasCountBadge(p.autorizados, p.total) + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' + _salidasCountBadge(p.pagados, p.total) + '</td>' +
      '<td style="padding:10px 12px;">' + _salidasEstadoBadge(s.estado) + '</td>' +
      '<td style="padding:10px 12px;">' +
        '<button class="btn" onclick="salidasAbrirDetalle(\'' + s.id + '\')" style="font-size:12px;padding:5px 12px;">Ver</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

// backward compat alias
function salVerDetalle(id) { salidasAbrirDetalle(id); }
window.salVerDetalle = salVerDetalle;

// ── MODAL NUEVA SALIDA ──────────────────────────────────────────
function salNueva() {
  // Build modal HTML if not present
  var existing = document.getElementById('sal-modal');
  if (!existing) {
    var div = document.createElement('div');
    div.innerHTML = _salModalHTML();
    document.body.appendChild(div.firstChild);
  }
  var m = document.getElementById('sal-modal');
  if (!m) return;
  var form = document.getElementById('sal-form');
  if (form) form.reset();
  var msgEl = document.getElementById('sal-msg');
  if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; }

  var cont = document.getElementById('sal-grupos-checks');
  if (cont) {
    cont.innerHTML = _salidasGrupos.length
      ? _salidasGrupos.map(function(g) {
          return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:3px 0;">' +
            '<input type="checkbox" name="sal-grupo" value="' + _salEsc(g) +
            '" style="accent-color:var(--ink);width:15px;height:15px;"> ' + _salEsc(g) + '</label>';
        }).join('')
      : '<span style="color:var(--txt3);font-size:13px;">No hay grupos configurados en el centro.</span>';
  }
  _salidasCargarResponsables();
  m.style.display = 'flex';
}
window.salNueva = salNueva;

function _salModalHTML() {
  return '<div id="sal-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center;padding:20px;">' +
    '<div style="background:var(--srf);border-radius:var(--r);max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:var(--sh-lg);">' +
      '<div style="padding:20px 24px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="font-weight:600;font-size:16px;">Nueva salida didáctica</div>' +
        '<button onclick="salCerrarModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--txt2);">✕</button>' +
      '</div>' +
      '<form id="sal-form" onsubmit="return false;" style="padding:20px 24px;display:flex;flex-direction:column;gap:14px;">' +
        '<div><label class="lbl">Título <span style="color:var(--red)">*</span></label>' +
          '<input class="fi" id="sal-titulo" type="text" placeholder="Ej: Visita al Museo de Ciencias" required></div>' +
        '<div><label class="lbl">Descripción</label>' +
          '<textarea class="fi" id="sal-desc" rows="2" placeholder="Descripción opcional" style="resize:vertical;"></textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' +
          '<div><label class="lbl">Fecha <span style="color:var(--red)">*</span></label>' +
            '<input class="fi" id="sal-fecha" type="date" required></div>' +
          '<div><label class="lbl">Hora salida</label><input class="fi" id="sal-hora-salida" type="time"></div>' +
          '<div><label class="lbl">Hora regreso</label><input class="fi" id="sal-hora-regreso" type="time"></div>' +
        '</div>' +
        '<div><label class="lbl">Grupos participantes <span style="color:var(--red)">*</span></label>' +
          '<div id="sal-grupos-checks" style="display:flex;flex-wrap:wrap;gap:8px 20px;padding:10px;background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);max-height:130px;overflow-y:auto;">' +
            '<span style="color:var(--txt3);font-size:13px;">Cargando…</span></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><label class="lbl">Coste por alumno (€)</label>' +
            '<input class="fi" id="sal-coste" type="number" min="0" step="0.01" value="0"></div>' +
          '<div><label class="lbl">Responsable</label>' +
            '<select class="fi" id="sal-responsable"><option value="">— Sin responsable —</option></select></div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--bdr);padding-top:12px;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:8px;">Datos del autobús (opcional)</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' +
            '<div><label class="lbl">Empresa</label><input class="fi" id="sal-bus-empresa" type="text" placeholder="Nombre empresa"></div>' +
            '<div><label class="lbl">Matrícula</label><input class="fi" id="sal-bus-matricula" type="text" placeholder="0000 AAA"></div>' +
            '<div><label class="lbl">Teléfono</label><input class="fi" id="sal-bus-telefono" type="tel" placeholder="600 000 000"></div>' +
          '</div>' +
        '</div>' +
        '<div id="sal-msg" style="display:none;font-size:13px;"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px;">' +
          '<button type="button" class="btn" onclick="salCerrarModal()">Cancelar</button>' +
          '<button type="button" class="btn btn-p" onclick="salGuardar()">Crear salida</button>' +
        '</div>' +
      '</form>' +
    '</div></div>';
}

async function _salidasCargarResponsables() {
  var sel = document.getElementById('sal-responsable');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin responsable —</option>';
  var { data } = await sb.from('profiles').select('id,full_name')
    .eq('centro_id', ctrId).in('rol', ['profesional','admin','superadmin']).order('full_name');
  (data || []).forEach(function(p) {
    var opt = document.createElement('option'); opt.value = p.id;
    opt.textContent = p.full_name || p.id; sel.appendChild(opt);
  });
}

function salCerrarModal() {
  var m = document.getElementById('sal-modal');
  if (m) m.style.display = 'none';
}
window.salCerrarModal = salCerrarModal;

async function salGuardar() {
  var msgEl   = document.getElementById('sal-msg');
  var titulo  = (document.getElementById('sal-titulo')       || {}).value || '';
  var desc    = (document.getElementById('sal-desc')         || {}).value || '';
  var fecha   = (document.getElementById('sal-fecha')        || {}).value || '';
  var horaSal = (document.getElementById('sal-hora-salida')  || {}).value || null;
  var horaReg = (document.getElementById('sal-hora-regreso') || {}).value || null;
  var coste   = parseFloat((document.getElementById('sal-coste') || {}).value || '0') || 0;
  var respId  = (document.getElementById('sal-responsable')  || {}).value || null;
  var empresa = (document.getElementById('sal-bus-empresa')  || {}).value || '';
  var matricula=(document.getElementById('sal-bus-matricula')|| {}).value || '';
  var telefono= (document.getElementById('sal-bus-telefono') || {}).value || '';

  var grupos = Array.from(document.querySelectorAll('input[name="sal-grupo"]:checked'))
    .map(function(cb) { return cb.value; });

  if (!titulo.trim()) { _salShowMsg(msgEl, 'El título es obligatorio.'); return; }
  if (!fecha)         { _salShowMsg(msgEl, 'La fecha de salida es obligatoria.'); return; }
  if (!grupos.length) { _salShowMsg(msgEl, 'Selecciona al menos un grupo participante.'); return; }

  if (msgEl) { msgEl.textContent = '⟳ Guardando…'; msgEl.style.color = 'var(--txt2)'; msgEl.style.display = 'block'; }

  var { data: salida, error } = await sb.from('salidas_didacticas').insert({
    centro_id: ctrId, titulo: titulo.trim(),
    descripcion: desc.trim() || null,
    fecha_salida: fecha, hora_salida: horaSal || null, hora_regreso: horaReg || null,
    curso_grupos: grupos, coste: coste, responsable_id: respId || null,
    estado: 'borrador',
    datos_autobus: { empresa: empresa, matricula: matricula, telefono: telefono }
  }).select().single();

  if (error || !salida) {
    _salShowMsg(msgEl, 'Error: ' + ((error && error.message) || 'desconocido')); return;
  }

  // Insert participants for all alumnos in selected groups
  var alumnoIds = [];
  grupos.forEach(function(g) {
    (_salidasAlumnosPorGrupo[g] || []).forEach(function(id) { alumnoIds.push(id); });
  });
  alumnoIds = alumnoIds.filter(function(v, i, a) { return a.indexOf(v) === i; });
  if (alumnoIds.length) {
    await sb.from('participantes_salida').insert(alumnoIds.map(function(aid) {
      return { centro_id: ctrId, salida_id: salida.id, alumno_id: aid,
               autorizado: false, pagado: false, necesita_picnic: false };
    }));
  }

  salCerrarModal();
  _salidasToast('✅ Salida creada con ' + alumnoIds.length + ' participante' + (alumnoIds.length !== 1 ? 's' : '') + '.');
  loadSalidas();
}
window.salGuardar = salGuardar;

function _salShowMsg(el, msg) {
  if (!el) return;
  el.textContent = msg; el.style.color = 'var(--red)'; el.style.display = 'block';
}

// ── EXPORTAR EXCEL (lista) ───────────────────────────────────────
async function salExportar() {
  // If in detail view, export 3-sheet report
  if (_salDet) { _salExportarDetalle(); return; }
  if (!_salidasData.length) { alert('No hay salidas para exportar.'); return; }
  if (typeof XLSX === 'undefined') { alert('Librería de exportación no disponible.'); return; }
  var aoa = [['Título','Fecha','Grupos','Coste (€)','Total alumnos','Autorizados','Pagados','Estado']];
  _salidasData.forEach(function(s) {
    var p = s._p || {total:0,autorizados:0,pagados:0};
    var grupos = Array.isArray(s.curso_grupos) ? s.curso_grupos.join(', ') : '';
    aoa.push([s.titulo, _salFmtFecha(s.fecha_salida), grupos,
      parseFloat(s.coste||0).toFixed(2), p.total, p.autorizados, p.pagados, s.estado]);
  });
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:32},{wch:12},{wch:28},{wch:10},{wch:14},{wch:12},{wch:10},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Salidas');
  XLSX.writeFile(wb, 'salidas-didacticas-' + new Date().toISOString().split('T')[0] + '.xlsx');
}
window.salExportar = salExportar;

// ════════════════════════════════════════════════════════════════
// VISTA DETALLE
// ════════════════════════════════════════════════════════════════

async function salidasAbrirDetalle(salidaId) {
  var panel = document.getElementById('panel-salidas');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:40px;color:var(--txt3);"><span class="spin">⟳</span> Cargando salida…</div>';

  var { data: sal, error } = await sb.from('salidas_didacticas')
    .select('*, responsable:profiles!responsable_id(full_name)')
    .eq('id', salidaId).eq('centro_id', ctrId).single();

  if (error || !sal) {
    panel.innerHTML = '<div style="padding:24px;color:var(--txt3);">No se pudo cargar la salida. ' +
      '<button onclick="initSalidasPanel()" class="btn" style="margin-left:8px;">← Volver</button></div>';
    return;
  }

  var { data: parts } = await sb.from('participantes_salida')
    .select('*, alumnos(nombre,grupo_horario)')
    .eq('salida_id', salidaId).eq('centro_id', ctrId);

  _salDet = sal;
  _salDetParts = (parts || []).map(function(p) {
    return Object.assign({}, p, {
      alumno_nombre: (p.alumnos && p.alumnos.nombre) || '—',
      alumno_grupo:  (p.alumnos && p.alumnos.grupo_horario) || '—'
    });
  }).sort(function(a,b) { return a.alumno_nombre.localeCompare(b.alumno_nombre,'es'); });

  _salDetTab = 'dashboard';

  if (role === 'familia') {
    _salDetRenderFamilia();
  } else {
    _salDetRenderShell();
    _salDetRenderTab('dashboard');
  }
}
window.salidasAbrirDetalle = salidasAbrirDetalle;

function _salDetRenderShell() {
  var panel = document.getElementById('panel-salidas');
  if (!panel) return;
  var s = _salDet;
  var grupos = Array.isArray(s.curso_grupos) ? s.curso_grupos : [];
  var grupoChips = grupos.map(function(g) {
    return '<span style="background:var(--surface-sunk);border-radius:20px;padding:3px 10px;font-size:12px;">' + _salEsc(g) + '</span>';
  }).join(' ');
  var hora = (s.hora_salida ? s.hora_salida.slice(0,5) : '') +
             (s.hora_regreso ? ' – ' + s.hora_regreso.slice(0,5) : '');
  var resp = (s.responsable && s.responsable.full_name) || '—';
  var tabs = ['dashboard','cocina','autobus','admin'];
  var tabLabels = {dashboard:'📊 Dashboard', cocina:'🍽 Cocina', autobus:'🚌 Autobús', admin:'⚙ Administración'};

  panel.innerHTML =
    // Back + export bar
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;">' +
      '<button onclick="initSalidasPanel()" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:6px 12px;font-size:13px;cursor:pointer;color:var(--txt2);">← Volver</button>' +
      '<div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn" onclick="salExportar()" style="font-size:13px;">📥 Exportar Excel</button>' +
        (_salPuedeEditar() ? '<button class="btn" onclick="_salEditarEstado()" style="font-size:13px;">✏ Cambiar estado</button>' : '') +
      '</div>' +
    '</div>' +
    // Header card
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px 20px;margin-bottom:18px;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
        '<div>' +
          '<div style="font-size:20px;font-weight:700;color:var(--txt);margin-bottom:4px;">' + _salEsc(s.titulo) + '</div>' +
          '<div style="font-size:13px;color:var(--txt2);margin-bottom:8px;">' +
            _salFmtFecha(s.fecha_salida) + (hora ? ' · ' + hora : '') +
            ' · Responsable: ' + _salEsc(resp) +
            ' · Coste: ' + parseFloat(s.coste||0).toFixed(2) + ' €' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
            grupoChips + '&nbsp;' + _salidasEstadoBadge(s.estado) +
          '</div>' +
        '</div>' +
      '</div>' +
      (s.descripcion ? '<div style="font-size:13px;color:var(--txt2);margin-top:10px;border-top:1px solid var(--bdr);padding-top:10px;">' + _salEsc(s.descripcion) + '</div>' : '') +
    '</div>' +
    // Tabs
    '<div style="display:flex;gap:4px;border-bottom:1px solid var(--bdr);margin-bottom:18px;flex-wrap:wrap;">' +
      tabs.map(function(t) {
        return '<button id="sal-tab-' + t + '" onclick="_salDetRenderTab(\'' + t + '\')" ' +
          'style="background:none;border:none;border-bottom:2px solid transparent;padding:9px 14px;font-size:13px;cursor:pointer;color:var(--txt2);">' +
          tabLabels[t] + '</button>';
      }).join('') +
    '</div>' +
    // Tab body
    '<div id="sal-det-body"><div style="text-align:center;padding:40px;color:var(--txt3);"><span class="spin">⟳</span></div></div>';
}

function _salTabHighlight(which) {
  ['dashboard','cocina','autobus','admin'].forEach(function(t) {
    var b = document.getElementById('sal-tab-' + t);
    if (!b) return;
    var act = t === which;
    b.style.borderBottomColor = act ? 'var(--ink)' : 'transparent';
    b.style.color = act ? 'var(--ink)' : 'var(--txt2)';
    b.style.fontWeight = act ? '600' : '400';
  });
}

function _salDetRenderTab(which) {
  _salDetTab = which;
  _salTabHighlight(which);
  var body = document.getElementById('sal-det-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--txt3);"><span class="spin">⟳</span> Cargando…</div>';
  if (which === 'dashboard') return _salTabDashboard();
  if (which === 'cocina')    return _salTabCocina();
  if (which === 'autobus')   return _salTabAutobus();
  if (which === 'admin')     return _salTabAdmin();
}
window._salDetRenderTab = _salDetRenderTab;

function _salPuedeEditar() {
  return ['admin','superadmin'].includes(role);
}

// ── TAB DASHBOARD ────────────────────────────────────────────────
function _salTabDashboard() {
  var body = document.getElementById('sal-det-body');
  if (!body) return;
  var parts = _salDetParts;
  var total    = parts.length;
  var autCount = parts.filter(function(p) { return p.autorizado; }).length;
  var pagCount = parts.filter(function(p) { return p.pagado; }).length;
  var picCount = parts.filter(function(p) { return p.necesita_picnic; }).length;
  var alerCount= parts.filter(function(p) { return p.alergias_confirmadas && p.alergias_confirmadas.trim(); }).length;

  function statCard(label, val, sub) {
    return '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px 18px;text-align:center;">' +
      '<div style="font-size:28px;font-weight:700;color:var(--txt);font-family:var(--font-display);">' + val + '</div>' +
      '<div style="font-size:12px;color:var(--txt2);margin-top:2px;">' + label + '</div>' +
      (sub ? '<div style="font-size:11px;color:var(--txt3);margin-top:2px;">' + sub + '</div>' : '') +
    '</div>';
  }

  var counters =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:22px;">' +
      statCard('Total participantes', total, '') +
      statCard('Autorizados', autCount + ' / ' + total, _salProgressBar(autCount, total)) +
      statCard('Pagados', pagCount + ' / ' + total, _salProgressBar(pagCount, total)) +
      statCard('Necesita picnic', picCount, '') +
      statCard('Con alergias', alerCount, '') +
    '</div>';

  // Gemini circular generator (only admin/profesional)
  var iaBtn = _salPuedeEditar()
    ? '<div style="margin-bottom:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '<button id="sal-ia-btn" onclick="_salGenerarCircular()" ' +
          'style="background:var(--accent,#C76B3D);color:#fff;border:none;border-radius:var(--r-sm);padding:7px 14px;font-size:13px;cursor:pointer;">✨ Generar circular para familias</button>' +
        '<span style="font-size:12px;color:var(--txt3);">Borrador de comunicado listo para copiar o enviar</span>' +
      '</div>'
    : '';

  // Participant table with interactive checkboxes
  var canEdit = ['admin','superadmin','profesional'].includes(role);
  var tableRows = parts.length ? parts.map(function(p) {
    return '<tr style="border-bottom:1px solid var(--bdr);">' +
      '<td style="padding:9px 12px;font-size:13px;font-weight:500;">' + _salEsc(p.alumno_nombre) + '</td>' +
      '<td style="padding:9px 12px;font-size:12px;color:var(--txt2);">' + _salEsc(p.alumno_grupo) + '</td>' +
      '<td style="padding:9px 12px;text-align:center;">' +
        (canEdit
          ? '<input type="checkbox" data-pid="' + p.id + '" data-col="autorizado" ' +
              (p.autorizado ? 'checked' : '') + ' onchange="_salTogglePart(this)" style="width:16px;height:16px;accent-color:var(--success);cursor:pointer;">'
          : (p.autorizado ? '✅' : '—')) +
      '</td>' +
      '<td style="padding:9px 12px;text-align:center;">' +
        (canEdit
          ? '<input type="checkbox" data-pid="' + p.id + '" data-col="pagado" ' +
              (p.pagado ? 'checked' : '') + ' onchange="_salTogglePart(this)" style="width:16px;height:16px;accent-color:var(--success);cursor:pointer;">'
          : (p.pagado ? '✅' : '—')) +
      '</td>' +
      '<td style="padding:9px 12px;text-align:center;">' +
        (canEdit
          ? '<input type="checkbox" data-pid="' + p.id + '" data-col="necesita_picnic" ' +
              (p.necesita_picnic ? 'checked' : '') + ' onchange="_salTogglePart(this)" style="width:16px;height:16px;accent-color:var(--warning);cursor:pointer;">'
          : (p.necesita_picnic ? '🥪' : '—')) +
      '</td>' +
      '<td style="padding:9px 12px;font-size:12px;color:var(--txt2);">' +
        _salEsc(p.alergias_confirmadas || '—') +
      '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--txt3);">Sin participantes registrados.</td></tr>';

  body.innerHTML = counters + iaBtn +
    '<div style="overflow-x:auto;background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);">' +
      '<table style="width:100%;border-collapse:collapse;min-width:500px;">' +
        '<thead><tr style="background:var(--srf2);border-bottom:1px solid var(--bdr);">' +
          '<th style="padding:9px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Alumno/a</th>' +
          '<th style="padding:9px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Grupo</th>' +
          '<th style="padding:9px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--txt2);">Autorizado</th>' +
          '<th style="padding:9px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--txt2);">Pagado</th>' +
          '<th style="padding:9px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--txt2);">Picnic</th>' +
          '<th style="padding:9px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Alergias</th>' +
        '</tr></thead>' +
        '<tbody>' + tableRows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div id="sal-ia-result" style="margin-top:16px;"></div>';
}

async function _salTogglePart(cb) {
  var pid = cb.getAttribute('data-pid');
  var col = cb.getAttribute('data-col');
  var val = cb.checked;
  var upd = {};
  upd[col] = val;
  if (col === 'autorizado' && val) upd.fecha_autorizacion = new Date().toISOString();
  var { error } = await sb.from('participantes_salida').update(upd).eq('id', pid).eq('centro_id', ctrId);
  if (error) {
    _salidasToast('Error al guardar: ' + error.message, 'var(--danger)');
    cb.checked = !val; // revert
    return;
  }
  // Update local cache
  var part = _salDetParts.find(function(p) { return p.id === pid; });
  if (part) part[col] = val;
}
window._salTogglePart = _salTogglePart;

async function _salGenerarCircular() {
  var btn = document.getElementById('sal-ia-btn');
  var res = document.getElementById('sal-ia-result');
  if (!btn || !res) return;
  var s = _salDet;
  btn.disabled = true; btn.textContent = '⟳ Generando…';

  var sys = 'Eres un asistente de gestión escolar español. Redactas comunicados para familias en tono cordial, formal y conciso. Usa el formato de carta breve (sin markdown). Solo el texto del comunicado, sin explicaciones.';
  var usr = 'Redacta un comunicado informativo para las familias de los alumnos sobre la siguiente salida didáctica:\n' +
    'Título: ' + (s.titulo || '') + '\n' +
    'Fecha: ' + _salFmtFecha(s.fecha_salida) + '\n' +
    'Hora de salida: ' + (s.hora_salida ? s.hora_salida.slice(0,5) : 'por confirmar') + '\n' +
    'Hora de regreso: ' + (s.hora_regreso ? s.hora_regreso.slice(0,5) : 'por confirmar') + '\n' +
    'Grupos: ' + (Array.isArray(s.curso_grupos) ? s.curso_grupos.join(', ') : '') + '\n' +
    'Coste por alumno: ' + parseFloat(s.coste||0).toFixed(2) + ' €\n' +
    (s.descripcion ? 'Descripción: ' + s.descripcion + '\n' : '') +
    'Incluye una instrucción para que las familias devuelvan la autorización firmada con el pago si procede.';

  try {
    var rsp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + ANON_KEY, 'apikey': ANON_KEY },
      body: JSON.stringify({
        contents: [{ role:'user', parts:[{ text: usr }] }],
        system_prompt: sys, centro_id: ctrId, role:'familia',
        user_name: currentUserName || '', user_id: currentUser ? currentUser.id : ''
      })
    });
    var d = await rsp.json();
    var txt = d.text || '';
    if (!txt) { alert('La IA no devolvió texto.'); return; }
    res.innerHTML =
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
          '<div style="font-size:13px;font-weight:600;color:var(--txt);">✨ Circular generada por IA</div>' +
          '<div style="font-size:11px;color:var(--warning);">Revisa antes de usar</div>' +
        '</div>' +
        '<textarea id="sal-circular-txt" rows="12" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);color:var(--txt);resize:vertical;">' +
          _salEsc(txt) + '</textarea>' +
      '</div>';
  } catch(err) {
    alert('Error al generar: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Generar circular para familias'; }
  }
}
window._salGenerarCircular = _salGenerarCircular;

// ── TAB COCINA ───────────────────────────────────────────────────
function _salTabCocina() {
  var body = document.getElementById('sal-det-body');
  if (!body) return;
  var parts = _salDetParts;
  var total  = parts.length;
  var picnic = parts.filter(function(p) { return p.necesita_picnic; }).length;
  var sinPicnic = total - picnic;

  // Parse allergy keywords — RGPD: no names in summary, only counts
  var _ALERGENOS = ['gluten','lactosa','huevo','frutos secos','nuez','cacahuete','soja',
    'pescado','marisco','apio','mostaza','sésamo','sulfitos','moluscos'];
  var alerCounts = {};
  var conAlergias = [];
  parts.forEach(function(p) {
    if (!p.alergias_confirmadas || !p.alergias_confirmadas.trim()) return;
    var txt = p.alergias_confirmadas.toLowerCase();
    conAlergias.push(p);
    _ALERGENOS.forEach(function(al) {
      if (txt.indexOf(al) !== -1) {
        alerCounts[al] = (alerCounts[al] || 0) + 1;
      }
    });
    // catch-all for custom text
    if (!_ALERGENOS.some(function(al) { return txt.indexOf(al) !== -1; })) {
      alerCounts['otros'] = (alerCounts['otros'] || 0) + 1;
    }
  });

  var alerRows = Object.keys(alerCounts).map(function(k) {
    return '<tr><td style="padding:7px 12px;font-size:13px;text-transform:capitalize;">' + _salEsc(k) + '</td>' +
      '<td style="padding:7px 12px;font-size:13px;font-weight:600;">' + alerCounts[k] + '</td></tr>';
  }).join('') || '<tr><td colspan="2" style="padding:12px;color:var(--txt3);font-size:13px;">Ninguna alergia declarada.</td></tr>';

  // Dietas table (names allowed — kitchen needs them)
  var dietasRows = conAlergias.length ? conAlergias.map(function(p) {
    return '<tr style="border-bottom:1px solid var(--bdr);">' +
      '<td style="padding:8px 12px;font-size:13px;">' + _salEsc(p.alumno_nombre) + '</td>' +
      '<td style="padding:8px 12px;font-size:12px;color:var(--txt2);">' + _salEsc(p.alumno_grupo) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px;">' + _salEsc(p.alergias_confirmadas) + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="3" style="padding:12px;color:var(--txt3);font-size:13px;">Sin alergias declaradas.</td></tr>';

  body.innerHTML =
    '<div style="background:var(--info-soft);border:1px solid var(--info);border-radius:var(--r-sm);padding:10px 14px;font-size:12px;color:var(--info);margin-bottom:16px;">ℹ️ Resumen RGPD: los datos agregados no incluyen nombres. La tabla de dietas detallada solo se muestra al personal del centro.</div>' +
    // Summary counts
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px;">' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;text-align:center;">' +
        '<div style="font-size:26px;font-weight:700;font-family:var(--font-display);">' + total + '</div>' +
        '<div style="font-size:12px;color:var(--txt2);">Total participantes</div></div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;text-align:center;">' +
        '<div style="font-size:26px;font-weight:700;font-family:var(--font-display);">' + picnic + '</div>' +
        '<div style="font-size:12px;color:var(--txt2);">🥪 Con picnic</div></div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;text-align:center;">' +
        '<div style="font-size:26px;font-weight:700;font-family:var(--font-display);">' + sinPicnic + '</div>' +
        '<div style="font-size:12px;color:var(--txt2);">Sin picnic</div></div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;text-align:center;">' +
        '<div style="font-size:26px;font-weight:700;font-family:var(--font-display);">' + conAlergias.length + '</div>' +
        '<div style="font-size:12px;color:var(--txt2);">Con alergias</div></div>' +
    '</div>' +
    // Allergy keyword counts
    '<div style="margin-bottom:20px;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:10px;">Alergenos declarados</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--srf2);"><th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Alergeno</th>' +
          '<th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Nº alumnos</th></tr></thead>' +
          '<tbody>' + alerRows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    // Dietas detail table
    '<div style="margin-bottom:20px;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:10px;">Tabla de dietas especiales (uso interno cocina)</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--srf2);"><th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Alumno/a</th>' +
          '<th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Grupo</th>' +
          '<th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Alergias/dieta</th></tr></thead>' +
          '<tbody>' + dietasRows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    // Actions
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-p" onclick="_salCocinaEmail()" style="font-size:13px;">📧 Enviar informe a cocina</button>' +
      '<button class="btn" onclick="_salCocinaPDF()" style="border:1px solid var(--bdr);background:var(--srf);font-size:13px;">📄 Exportar PDF cocina</button>' +
    '</div>' +
    '<div id="sal-cocina-msg" style="margin-top:10px;font-size:13px;"></div>';
}

async function _salCocinaEmail() {
  var msgEl = document.getElementById('sal-cocina-msg');
  if (msgEl) { msgEl.textContent = '⟳ Enviando…'; msgEl.style.color = 'var(--txt2)'; }

  // Register notification record
  await sb.from('notificaciones_salida').insert({
    centro_id: ctrId, salida_id: _salDet.id, tipo: 'cocina'
  });

  if (msgEl) { msgEl.textContent = '✅ Notificación registrada. Envía el PDF manualmente a cocina si no tienes email de cocina configurado.'; msgEl.style.color = 'var(--success)'; }
}
window._salCocinaEmail = _salCocinaEmail;

async function _salCocinaPDF() {
  try { await _salEnsureJsPDF(); } catch(e) { alert('No se pudo cargar jsPDF.'); return; }
  var info = await _salCentroInfo();
  var rgb  = _salHexToRgb(info.color);
  var jsPDF = window.jspdf.jsPDF;
  var doc  = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  var pw   = doc.internal.pageSize.getWidth();
  var s    = _salDet;
  var parts = _salDetParts;

  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.rect(0, 0, pw, 24, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text(info.nombre, 12, 11);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text('Informe de cocina — ' + _salEsc(s.titulo), 12, 18);

  doc.setTextColor(40,40,40);
  var y = 32;
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('Salida: ' + (s.titulo||''), 12, y); y += 7;
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text('Fecha: ' + _salFmtFecha(s.fecha_salida), 12, y); y += 6;
  var picCount = parts.filter(function(p){ return p.necesita_picnic; }).length;
  doc.text('Total participantes: ' + parts.length + '  |  Con picnic: ' + picCount + '  |  Sin picnic: ' + (parts.length - picCount), 12, y); y += 10;

  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('Alergias / Dietas especiales:', 12, y); y += 7;
  doc.setFont('helvetica','normal'); doc.setFontSize(10);

  var conAler = parts.filter(function(p){ return p.alergias_confirmadas && p.alergias_confirmadas.trim(); });
  if (!conAler.length) {
    doc.text('Ninguna alergia declarada.', 12, y);
  } else {
    conAler.forEach(function(p) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text('• ' + (p.alumno_nombre||'') + ' (' + (p.alumno_grupo||'') + '): ' + (p.alergias_confirmadas||''), 14, y);
      y += 6;
    });
  }

  doc.save('cocina-' + (s.titulo||'salida').replace(/\s+/g,'-').toLowerCase() + '.pdf');
}
window._salCocinaPDF = _salCocinaPDF;

// ── TAB AUTOBÚS ──────────────────────────────────────────────────
async function _salTabAutobus() {
  var body = document.getElementById('sal-det-body');
  if (!body) return;
  var s    = _salDet;
  var bus  = (s.datos_autobus && typeof s.datos_autobus === 'object') ? s.datos_autobus : {};
  var parts = _salDetParts;
  var ckKey = 'checkin-' + s.id;
  var checkins = {};
  try { checkins = JSON.parse(localStorage.getItem(ckKey) || '{}'); } catch(e) {}

  var canEditBus = _salPuedeEditar();

  body.innerHTML =
    // Bus data form
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px 20px;margin-bottom:20px;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:14px;">Datos del autobús</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">' +
        '<div><label class="lbl">Empresa</label>' +
          '<input class="fi" id="sal-bus-emp" value="' + _salEsc(bus.empresa||'') + '"' + (canEditBus ? '' : ' readonly') + '></div>' +
        '<div><label class="lbl">Matrícula</label>' +
          '<input class="fi" id="sal-bus-mat" value="' + _salEsc(bus.matricula||'') + '"' + (canEditBus ? '' : ' readonly') + '></div>' +
        '<div><label class="lbl">Teléfono</label>' +
          '<input class="fi" id="sal-bus-tel" value="' + _salEsc(bus.telefono||'') + '"' + (canEditBus ? '' : ' readonly') + '></div>' +
        '<div><label class="lbl">Plazas totales</label>' +
          '<input class="fi" id="sal-bus-plazas" type="number" min="0" value="' + _salEsc(bus.plazas||'') + '"' + (canEditBus ? '' : ' readonly') + '></div>' +
      '</div>' +
      '<div style="margin-top:12px;"><label class="lbl">Notas del conductor / indicaciones</label>' +
        '<textarea class="fi" id="sal-bus-notas" rows="2" style="resize:vertical;"' + (canEditBus ? '' : ' readonly') + '>' + _salEsc(bus.notas||'') + '</textarea></div>' +
      (canEditBus ? '<div style="margin-top:12px;"><button class="btn btn-p" onclick="_salGuardarBus()" style="font-size:13px;">💾 Guardar datos bus</button>' +
        '<span id="sal-bus-msg" style="margin-left:10px;font-size:12px;color:var(--success);"></span></div>' : '') +
    '</div>' +
    // Check-in list
    '<div>' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">Lista de embarque / Check-in <span style="font-size:11px;color:var(--txt3);font-weight:400;">(guardado localmente en este dispositivo)</span></div>' +
      '<div id="sal-checkin-list" style="display:flex;flex-direction:column;gap:6px;">' +
        parts.map(function(p) {
          var checked = !!checkins[p.id];
          return '<div style="display:flex;align-items:center;gap:12px;background:' + (checked ? 'var(--success-soft)' : 'var(--srf)') + ';border:1px solid var(--bdr);border-radius:var(--r-sm);padding:10px 14px;transition:background .2s;" id="ck-row-' + p.id + '">' +
            '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="_salCheckin(this,\'' + p.id + '\',\'' + ckKey + '\')" ' +
              'style="width:20px;height:20px;accent-color:var(--success);cursor:pointer;flex-shrink:0;">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:500;">' + _salEsc(p.alumno_nombre) + '</div>' +
              '<div style="font-size:12px;color:var(--txt2);">' + _salEsc(p.alumno_grupo) + '</div>' +
            '</div>' +
            '<div style="font-size:12px;color:' + (p.autorizado ? 'var(--success)' : 'var(--danger)') + ';white-space:nowrap;">' +
              (p.autorizado ? '✓ Autorizado' : '⚠ Sin autorización') +
            '</div>' +
          '</div>';
        }).join('') ||
        '<div style="color:var(--txt3);font-size:13px;padding:12px;">Sin participantes.</div>' +
      '</div>' +
      '<div style="margin-top:12px;font-size:13px;color:var(--txt2);">Embarcados: <strong id="sal-ck-count">' + Object.values(checkins).filter(Boolean).length + '</strong> / ' + parts.length + '</div>' +
    '</div>';
}

function _salCheckin(cb, pid, ckKey) {
  var checkins = {};
  try { checkins = JSON.parse(localStorage.getItem(ckKey) || '{}'); } catch(e) {}
  checkins[pid] = cb.checked;
  localStorage.setItem(ckKey, JSON.stringify(checkins));
  var row = document.getElementById('ck-row-' + pid);
  if (row) row.style.background = cb.checked ? 'var(--success-soft)' : 'var(--srf)';
  var cnt = document.getElementById('sal-ck-count');
  if (cnt) cnt.textContent = Object.values(checkins).filter(Boolean).length;
}
window._salCheckin = _salCheckin;

async function _salGuardarBus() {
  var msg = document.getElementById('sal-bus-msg');
  var bus = {
    empresa:   (document.getElementById('sal-bus-emp')   || {}).value || '',
    matricula: (document.getElementById('sal-bus-mat')   || {}).value || '',
    telefono:  (document.getElementById('sal-bus-tel')   || {}).value || '',
    plazas:    parseInt((document.getElementById('sal-bus-plazas') || {}).value || '0') || 0,
    notas:     (document.getElementById('sal-bus-notas') || {}).value || ''
  };
  var { error } = await sb.from('salidas_didacticas')
    .update({ datos_autobus: bus }).eq('id', _salDet.id).eq('centro_id', ctrId);
  if (error) { if (msg) { msg.textContent = 'Error: ' + error.message; msg.style.color = 'var(--danger)'; } return; }
  _salDet.datos_autobus = bus;
  if (msg) { msg.textContent = '✓ Guardado'; msg.style.color = 'var(--success)'; setTimeout(function(){ msg.textContent = ''; }, 2000); }
}
window._salGuardarBus = _salGuardarBus;

// ── TAB ADMINISTRACIÓN ───────────────────────────────────────────
async function _salTabAdmin() {
  var body = document.getElementById('sal-det-body');
  if (!body) return;
  var parts  = _salDetParts;
  var s      = _salDet;
  var coste  = parseFloat(s.coste || 0);
  var total  = parts.length;
  var pagados = parts.filter(function(p){ return p.pagado; }).length;
  var pendPago = parts.filter(function(p){ return !p.pagado; });

  var esperado = (coste * total).toFixed(2);
  var cobrado  = (coste * pagados).toFixed(2);
  var pendiente= (coste * pendPago.length).toFixed(2);

  // Notifications sent
  var { data: notifs } = await sb.from('notificaciones_salida')
    .select('*').eq('salida_id', s.id).eq('centro_id', ctrId)
    .order('created_at', { ascending: false });

  var notifRows = (notifs && notifs.length) ? notifs.map(function(n) {
    return '<tr style="border-bottom:1px solid var(--bdr);">' +
      '<td style="padding:8px 12px;font-size:13px;">' + _salEsc(n.tipo) + '</td>' +
      '<td style="padding:8px 12px;font-size:12px;color:var(--txt2);">' + _salFmtFecha(n.created_at) + '</td>' +
      '<td style="padding:8px 12px;text-align:center;">' + (n.enviada ? '✅' : '⏳') + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="3" style="padding:12px;color:var(--txt3);font-size:13px;">Sin notificaciones enviadas.</td></tr>';

  var pendRows = pendPago.length ? pendPago.map(function(p) {
    return '<tr style="border-bottom:1px solid var(--bdr);">' +
      '<td style="padding:8px 12px;font-size:13px;">' + _salEsc(p.alumno_nombre) + '</td>' +
      '<td style="padding:8px 12px;font-size:12px;color:var(--txt2);">' + _salEsc(p.alumno_grupo) + '</td>' +
      '<td style="padding:8px 12px;text-align:center;">' +
        '<button onclick="_salMarcarPagado(\'' + p.id + '\',this)" style="background:var(--success-soft);color:var(--success);border:1px solid var(--success);border-radius:var(--r-sm);padding:3px 10px;font-size:11px;cursor:pointer;">Marcar pagado</button>' +
      '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="3" style="text-align:center;padding:12px;font-size:13px;color:var(--success);">✅ Todos los alumnos han pagado.</td></tr>';

  body.innerHTML =
    // Economic summary
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px;">' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;text-align:center;">' +
        '<div style="font-size:11px;color:var(--txt3);margin-bottom:4px;">Esperado</div>' +
        '<div style="font-size:24px;font-weight:700;font-family:var(--font-display);">' + esperado + ' €</div>' +
        '<div style="font-size:11px;color:var(--txt3);margin-top:2px;">' + total + ' alumnos × ' + coste.toFixed(2) + ' €</div></div>' +
      '<div style="background:var(--success-soft);border:1px solid var(--success);border-radius:var(--r);padding:14px;text-align:center;">' +
        '<div style="font-size:11px;color:var(--success);margin-bottom:4px;">Cobrado</div>' +
        '<div style="font-size:24px;font-weight:700;font-family:var(--font-display);color:var(--success);">' + cobrado + ' €</div>' +
        '<div style="font-size:11px;color:var(--success);margin-top:2px;">' + pagados + ' alumnos</div></div>' +
      '<div style="background:var(--warning-soft);border:1px solid var(--warning);border-radius:var(--r);padding:14px;text-align:center;">' +
        '<div style="font-size:11px;color:var(--warning);margin-bottom:4px;">Pendiente</div>' +
        '<div style="font-size:24px;font-weight:700;font-family:var(--font-display);color:var(--warning);">' + pendiente + ' €</div>' +
        '<div style="font-size:11px;color:var(--warning);margin-top:2px;">' + pendPago.length + ' alumnos</div></div>' +
    '</div>' +
    // Pending payments
    (pendPago.length ? '<div style="margin-bottom:22px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<div style="font-size:14px;font-weight:600;">Pagos pendientes</div>' +
        '<button onclick="_salMarcarTodosPagados()" style="background:var(--success-soft);color:var(--success);border:1px solid var(--success);border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">✓ Marcar todos pagados</button>' +
      '</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--srf2);"><th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Alumno/a</th>' +
          '<th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Grupo</th>' +
          '<th style="padding:8px 12px;"></th></tr></thead>' +
          '<tbody id="sal-pend-tbody">' + pendRows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' : '<div style="background:var(--success-soft);border:1px solid var(--success);border-radius:var(--r-sm);padding:12px;font-size:13px;color:var(--success);margin-bottom:22px;">✅ Todos los alumnos han pagado.</div>') +
    // Estado + publish
    (_salPuedeEditar() ? '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px;margin-bottom:22px;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">Estado de la salida</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
        _salidasEstadoBadge(_salDet.estado) +
        '<button onclick="_salCambiarEstado(\'publicada\')" style="background:var(--info-soft);color:var(--info);border:1px solid var(--info);border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">Publicar</button>' +
        '<button onclick="_salCambiarEstado(\'cerrada\')" style="background:var(--success-soft);color:var(--success);border:1px solid var(--success);border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">Cerrar</button>' +
        '<button onclick="_salCambiarEstado(\'cancelada\')" style="background:var(--danger-soft);color:var(--danger);border:1px solid var(--danger);border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">Cancelar</button>' +
      '</div>' +
      '<div id="sal-estado-msg" style="margin-top:8px;font-size:12px;"></div>' +
    '</div>' : '') +
    // Notifications log
    '<div>' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:10px;">Notificaciones registradas</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--srf2);"><th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Tipo</th>' +
          '<th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--txt2);">Fecha</th>' +
          '<th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--txt2);">Enviada</th></tr></thead>' +
          '<tbody>' + notifRows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>' +
    // History
    '<div style="margin-top:16px;font-size:12px;color:var(--txt3);">Salida creada: ' + _salFmtFecha(_salDet.created_at) + '</div>';
}

async function _salMarcarPagado(pid, btn) {
  var { error } = await sb.from('participantes_salida').update({ pagado: true }).eq('id', pid).eq('centro_id', ctrId);
  if (error) { _salidasToast('Error: ' + error.message, 'var(--danger)'); return; }
  var part = _salDetParts.find(function(p){ return p.id === pid; });
  if (part) part.pagado = true;
  var row = btn && btn.closest('tr');
  if (row) row.remove();
  _salidasToast('✓ Marcado como pagado');
}
window._salMarcarPagado = _salMarcarPagado;

async function _salMarcarTodosPagados() {
  if (!confirm('¿Marcar como pagados a todos los alumnos con pago pendiente?')) return;
  var pendIds = _salDetParts.filter(function(p){ return !p.pagado; }).map(function(p){ return p.id; });
  if (!pendIds.length) return;
  var { error } = await sb.from('participantes_salida').update({ pagado: true }).in('id', pendIds).eq('centro_id', ctrId);
  if (error) { _salidasToast('Error: ' + error.message, 'var(--danger)'); return; }
  _salDetParts.forEach(function(p){ p.pagado = true; });
  _salidasToast('✅ Todos los pagos marcados');
  _salDetRenderTab('admin');
}
window._salMarcarTodosPagados = _salMarcarTodosPagados;

async function _salCambiarEstado(nuevoEstado) {
  var msgEl = document.getElementById('sal-estado-msg');
  var s = _salDet;
  var msgs = { publicada:'¿Publicar esta salida? Las familias podrán verla y autorizarla.', cerrada:'¿Cerrar esta salida?', cancelada:'¿Cancelar esta salida?' };
  if (!confirm(msgs[nuevoEstado] || '¿Cambiar estado?')) return;

  var { error } = await sb.from('salidas_didacticas').update({ estado: nuevoEstado }).eq('id', s.id).eq('centro_id', ctrId);
  if (error) {
    if (msgEl) { msgEl.textContent = 'Error: ' + error.message; msgEl.style.color = 'var(--danger)'; }
    return;
  }
  _salDet.estado = nuevoEstado;
  if (msgEl) { msgEl.textContent = 'Estado actualizado a: ' + nuevoEstado; msgEl.style.color = 'var(--success)'; }

  // Push to families when publishing
  if (nuevoEstado === 'publicada') {
    var alumnosIds = _salDetParts.map(function(p){ return p.alumno_id; }).filter(Boolean);
    if (alumnosIds.length) {
      sb.from('familia_alumno').select('profile_id').in('alumno_id', alumnosIds).then(function(r) {
        var famIds = (r.data || []).map(function(v){ return v.profile_id; }).filter(Boolean);
        _salPush(famIds, '🚌 Nueva salida publicada', s.titulo + ' — ' + _salFmtFecha(s.fecha_salida), 'salida-publicada');
      });
    }
    // Register notification
    sb.from('notificaciones_salida').insert({ centro_id: ctrId, salida_id: s.id, tipo: 'recordatorio', enviada: true, fecha_envio: new Date().toISOString() }).then(function(){});
  }

  // Update shell badge
  _salDetRenderShell();
  _salDetRenderTab('admin');
  _salTabHighlight('admin');
}
window._salCambiarEstado = _salCambiarEstado;

function _salEditarEstado() { _salDetRenderTab('admin'); }
window._salEditarEstado = _salEditarEstado;

// ── VISTA FAMILIA ────────────────────────────────────────────────
async function _salDetRenderFamilia() {
  var panel = document.getElementById('panel-salidas');
  if (!panel) return;
  var s = _salDet;

  // Get children linked to this family
  var { data: fa } = await sb.from('familia_alumno')
    .select('alumno_id').eq('profile_id', currentUser.id);
  var misHijosIds = (fa || []).map(function(v){ return v.alumno_id; });

  // Filter participants to only my children
  var misParticipantes = _salDetParts.filter(function(p) {
    return misHijosIds.includes(p.alumno_id);
  });

  var hora = (s.hora_salida ? s.hora_salida.slice(0,5) : '') +
             (s.hora_regreso ? ' – ' + s.hora_regreso.slice(0,5) : '');

  var grupos = Array.isArray(s.curso_grupos) ? s.curso_grupos.join(', ') : '—';

  panel.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
      '<button onclick="initSalidasPanel()" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:6px 12px;font-size:13px;cursor:pointer;color:var(--txt2);">← Volver</button>' +
    '</div>' +
    // Info card
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px 20px;margin-bottom:20px;">' +
      '<div style="font-size:20px;font-weight:700;margin-bottom:6px;">' + _salEsc(s.titulo) + '</div>' +
      '<div style="font-size:13px;color:var(--txt2);margin-bottom:8px;">' +
        '📅 ' + _salFmtFecha(s.fecha_salida) + (hora ? ' · ⏰ ' + hora : '') + '<br>' +
        '👥 Grupos: ' + _salEsc(grupos) +
        (s.coste > 0 ? ' · 💶 Coste: ' + parseFloat(s.coste).toFixed(2) + ' €' : ' · 🎫 Gratuita') +
      '</div>' +
      (s.descripcion ? '<div style="font-size:13px;color:var(--txt2);border-top:1px solid var(--bdr);padding-top:10px;">' + _salEsc(s.descripcion) + '</div>' : '') +
    '</div>' +
    // Authorization per child
    (!misParticipantes.length
      ? '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:24px;text-align:center;color:var(--txt3);font-size:13px;">Sus hijos no están inscritos como participantes de esta salida.</div>'
      : '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">Autorización de participación</div>' +
        misParticipantes.map(function(p) {
          return '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px 18px;margin-bottom:12px;" id="sal-fam-card-' + p.id + '">' +
            '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">' + _salEsc(p.alumno_nombre) + ' · <span style="font-size:12px;font-weight:400;color:var(--txt2);">' + _salEsc(p.alumno_grupo) + '</span></div>' +
            '<div style="display:flex;flex-direction:column;gap:10px;">' +
              '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">' +
                '<input type="checkbox" id="fam-aut-' + p.id + '" ' + (p.autorizado ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--success);"> ' +
                'Autorizo la participación de mi hijo/a en esta salida</label>' +
              '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">' +
                '<input type="checkbox" id="fam-pic-' + p.id + '" ' + (p.necesita_picnic ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--warning);"> ' +
                '🥪 Necesita picnic</label>' +
              '<div><label class="lbl" style="font-size:12px;">Alergias alimentarias o dieta especial (si procede)</label>' +
                '<input class="fi" id="fam-aler-' + p.id + '" type="text" placeholder="Ej: intolerante a la lactosa, alérgico a los frutos secos…" value="' + _salEsc(p.alergias_confirmadas||'') + '"></div>' +
              '<div id="fam-msg-' + p.id + '" style="display:none;font-size:12px;"></div>' +
              '<button onclick="_salFamGuardar(\'' + p.id + '\')" class="btn btn-p" style="align-self:flex-start;">Guardar autorización</button>' +
            '</div>' +
          '</div>';
        }).join(''));
}

async function _salFamGuardar(pid) {
  var aut  = !!(document.getElementById('fam-aut-'  + pid) || {}).checked;
  var pic  = !!(document.getElementById('fam-pic-'  + pid) || {}).checked;
  var aler = ((document.getElementById('fam-aler-' + pid) || {}).value || '').trim();
  var msgEl = document.getElementById('fam-msg-' + pid);

  var upd = { autorizado: aut, necesita_picnic: pic, alergias_confirmadas: aler || null };
  if (aut) upd.fecha_autorizacion = new Date().toISOString();

  var { error } = await sb.from('participantes_salida').update(upd).eq('id', pid).eq('centro_id', ctrId);
  if (error) {
    if (msgEl) { msgEl.textContent = 'Error: ' + error.message; msgEl.style.color = 'var(--danger)'; msgEl.style.display = 'block'; }
    return;
  }

  // Update local cache
  var part = _salDetParts.find(function(p){ return p.id === pid; });
  if (part) { part.autorizado = aut; part.necesita_picnic = pic; part.alergias_confirmadas = aler || null; }

  if (msgEl) { msgEl.textContent = '✅ Autorización guardada'; msgEl.style.color = 'var(--success)'; msgEl.style.display = 'block'; }

  // Push to responsable
  if (_salDet.responsable_id) {
    var alumNombre = part ? part.alumno_nombre : 'un alumno';
    _salPush([_salDet.responsable_id], '📋 Autorización recibida',
      alumNombre + (aut ? ' ha autorizado' : ' ha retirado su autorización') + ' la salida: ' + _salDet.titulo,
      'salida-autorizacion');
  }
}
window._salFamGuardar = _salFamGuardar;

// ── EXPORTAR EXCEL DETALLE (3 hojas) ────────────────────────────
async function _salExportarDetalle() {
  if (typeof XLSX === 'undefined') { alert('Librería de exportación no disponible.'); return; }
  var s     = _salDet;
  var parts = _salDetParts;
  var wb    = XLSX.utils.book_new();

  // Sheet 1: Participantes
  var ws1 = XLSX.utils.aoa_to_sheet([
    ['Alumno/a','Grupo','Autorizado','Pagado','Picnic','Alergias','Fecha autorización'],
    ...parts.map(function(p) {
      return [p.alumno_nombre, p.alumno_grupo, p.autorizado ? 'Sí':'No',
        p.pagado ? 'Sí':'No', p.necesita_picnic ? 'Sí':'No',
        p.alergias_confirmadas || '', _salFmtFecha(p.fecha_autorizacion)];
    })
  ]);
  ws1['!cols'] = [{wch:28},{wch:12},{wch:11},{wch:9},{wch:8},{wch:32},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Participantes');

  // Sheet 2: Cocina
  var conAler = parts.filter(function(p){ return p.alergias_confirmadas && p.alergias_confirmadas.trim(); });
  var ws2 = XLSX.utils.aoa_to_sheet([
    ['INFORME DE COCINA — ' + (s.titulo||'')],
    ['Fecha:', _salFmtFecha(s.fecha_salida)],
    ['Total participantes:', parts.length],
    ['Con picnic:', parts.filter(function(p){ return p.necesita_picnic; }).length],
    ['Sin picnic:', parts.filter(function(p){ return !p.necesita_picnic; }).length],
    ['Con alergias:', conAler.length],
    [],
    ['Alumno/a','Grupo','Alergia / Dieta especial'],
    ...conAler.map(function(p){ return [p.alumno_nombre, p.alumno_grupo, p.alergias_confirmadas]; })
  ]);
  ws2['!cols'] = [{wch:30},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Cocina');

  // Sheet 3: Económico
  var coste = parseFloat(s.coste || 0);
  var pagados = parts.filter(function(p){ return p.pagado; }).length;
  var ws3 = XLSX.utils.aoa_to_sheet([
    ['RESUMEN ECONÓMICO — ' + (s.titulo||'')],
    ['Coste por alumno (€):', coste.toFixed(2)],
    ['Total esperado (€):', (coste * parts.length).toFixed(2)],
    ['Cobrado (€):', (coste * pagados).toFixed(2)],
    ['Pendiente (€):', (coste * (parts.length - pagados)).toFixed(2)],
    [],
    ['Alumno/a','Grupo','Pagado'],
    ...parts.map(function(p){ return [p.alumno_nombre, p.alumno_grupo, p.pagado ? 'Sí':'No']; })
  ]);
  ws3['!cols'] = [{wch:30},{wch:16},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws3, 'Económico');

  var fname = 'salida-' + (s.titulo||'').replace(/\s+/g,'-').toLowerCase() + '-' + new Date().toISOString().split('T')[0] + '.xlsx';
  XLSX.writeFile(wb, fname);
}
