// ── MÓDULO INCIDENCIAS ──
var incFiltroActivo       = 'abiertas';
var _incLastData          = [];
var _incAlumnosCache      = null;
var _incAlumnosCacheCtrid = null;
var _incTipData           = null;
var _incAlumnosProfesor   = [];
var _incSelectedId        = null;

function initIncidenciasPanel() {
  if (role === 'profesional') {
    var viAdmin = document.getElementById('inc-vista-admin');
    var viProf  = document.getElementById('inc-vista-profesor');
    if (viAdmin) viAdmin.style.display = 'none';
    if (viProf)  viProf.style.display  = 'flex';
    _incProfesorInit();
    return;
  }

  // Admin / superadmin
  var viAdmin = document.getElementById('inc-vista-admin');
  var viProf  = document.getElementById('inc-vista-profesor');
  if (viAdmin) viAdmin.style.display = 'flex';
  if (viProf)  viProf.style.display  = 'none';

  var fechaInput = document.getElementById('inc-fecha');
  if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

  var drop = document.getElementById('inc-alumno-drop');
  if (drop && !drop._incReady) {
    drop._incReady = true;
    drop.addEventListener('mousedown', function(e) {
      var item = e.target.closest('[data-inc-id]');
      if (!item) return;
      e.preventDefault();
      seleccionarAlumnoInc(item.dataset.incId, item.dataset.incNombre, item.dataset.incGrupo);
    });
  }

  var inp = document.getElementById('inc-alumno');
  if (inp && !inp._incReady) {
    inp._incReady = true;
    inp.addEventListener('blur', function() {
      setTimeout(function() {
        var d = document.getElementById('inc-alumno-drop');
        if (d) d.style.display = 'none';
      }, 150);
    });
  }

  _incLoadAlumnos();
  loadIncidencias('abiertas');
}

// ── VISTA PROFESOR ──────────────────────────────────────────────

async function _incProfesorInit() {
  var fechaEl = document.getElementById('inc-prof-fecha');
  if (fechaEl) fechaEl.value = new Date().toISOString().split('T')[0];
  await _incLoadAlumnosProfesor();
  await _incLoadMisIncidencias();
  _updateIncTabCount();
}

async function _incLoadAlumnosProfesor() {
  // Obtener los grupos del profesor desde horarios_grupo
  var parte = currentUserName.trim().split(/\s+/).find(function(p) { return p.length > 2; }) || '';
  var r = await sb.from('horarios_grupo').select('grupo_horario')
    .eq('centro_id', ctrId).ilike('profesor_nombre', '%' + parte + '%');
  var misGrupos = Array.from(new Set(
    (r.data || []).map(function(c) { return c.grupo_horario; }).filter(Boolean)
  ));

  // Alumnos de esos grupos
  var q = sb.from('alumnos').select('id,nombre,grupo_horario').eq('centro_id', ctrId).order('nombre');
  if (misGrupos.length) q = q.in('grupo_horario', misGrupos);
  var ra = await q;
  _incAlumnosProfesor = ra.data || [];

  // Poblar selector
  var sel = document.getElementById('inc-prof-alumno-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">Sin alumno concreto / incidencia general</option>'
    + _incAlumnosProfesor.map(function(a) {
        return '<option value="' + a.id + '" data-grupo="' + (a.grupo_horario || '') + '">'
          + a.nombre + (a.grupo_horario ? ' · ' + a.grupo_horario : '')
          + '</option>';
      }).join('');
  sel.onchange = function() {
    var opt = sel.options[sel.selectedIndex];
    var grpEl = document.getElementById('inc-prof-grupo');
    if (grpEl && opt && opt.dataset.grupo) grpEl.value = opt.dataset.grupo;
    else if (grpEl) grpEl.value = '';
  };
}

async function registrarIncidenciaProfesor() {
  var sel     = document.getElementById('inc-prof-alumno-sel');
  var alumnoNom = (sel && sel.selectedIndex > 0)
    ? sel.options[sel.selectedIndex].text.split(' · ')[0] : null;
  var grupo   = (document.getElementById('inc-prof-grupo') || {}).value;
  var desc    = (document.getElementById('inc-prof-desc')  || {}).value;
  var fecha   = (document.getElementById('inc-prof-fecha') || {}).value
                || new Date().toISOString().split('T')[0];
  var msgEl   = document.getElementById('inc-prof-msg');
  if (!msgEl) return;

  if (!desc || !desc.trim()) {
    msgEl.textContent = 'La descripción es obligatoria.';
    msgEl.style.cssText = 'display:block;color:var(--red);font-size:13px;';
    return;
  }

  msgEl.textContent = '⟳ Registrando…';
  msgEl.style.cssText = 'display:block;color:var(--txt2);font-size:13px;';

  var r = await sb.from('incidencias').insert({
    centro_id:      ctrId,
    fecha:          fecha,
    tipo:           'convivencia',
    gravedad:       'leve',
    descripcion:    desc.trim(),
    alumno_nombre:  alumnoNom || null,
    grupo_horario:  (grupo && grupo.trim()) ? grupo.trim() : null,
    registrado_por: currentUser.id,
    estado:         'abierta',
  }).select().single();

  if (r.error) {
    msgEl.textContent = 'Error: ' + r.error.message;
    msgEl.style.cssText = 'display:block;color:var(--red);font-size:13px;';
    return;
  }

  // Notificar a jefatura automáticamente (fire-and-forget)
  if (r.data && r.data.id) {
    sb.functions.invoke('notify-jefatura', { body: { incidencia_id: r.data.id } }).catch(function() {});
  }

  msgEl.textContent = '✅ Incidencia registrada. Jefatura ha sido notificada.';
  msgEl.style.cssText = 'display:block;background:var(--ink-ll);color:var(--ink);border-radius:var(--r-sm);padding:8px 12px;font-size:13px;';

  if (sel) sel.value = '';
  var grpEl = document.getElementById('inc-prof-grupo');
  if (grpEl) grpEl.value = '';
  var descEl = document.getElementById('inc-prof-desc');
  if (descEl) descEl.value = '';
  setTimeout(function() { if (msgEl) msgEl.style.display = 'none'; }, 6000);

  await _incLoadMisIncidencias();
  _updateIncTabCount();
}

async function _incLoadMisIncidencias() {
  var c = document.getElementById('inc-prof-lista');
  if (!c) return;
  c.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:8px 0;">Cargando…</div>';

  var r = await sb.from('incidencias')
    .select('id,fecha,alumno_nombre,grupo_horario,descripcion,estado')
    .eq('centro_id', ctrId)
    .eq('registrado_por', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (r.error || !r.data || !r.data.length) {
    c.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:8px 0;">No has registrado incidencias aún.</div>';
    return;
  }

  var rows = r.data.map(function(i) {
    var ag = [i.alumno_nombre, i.grupo_horario].filter(Boolean).join(' · ') || '—';
    var est = i.estado === 'abierta'
      ? '<span style="background:#fce8e6;color:#a50e0e;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">⚠ Abierta</span>'
      : i.estado === 'cerrada'
      ? '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">✓ Cerrada</span>'
      : '<span style="background:#e8f0fe;color:#1a56db;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">' + (i.estado || '—') + '</span>';
    var descTxt = (i.descripcion || '—');
    if (descTxt.length > 90) descTxt = descTxt.slice(0, 90) + '…';
    return '<tr>'
      + '<td style="white-space:nowrap;">' + (i.fecha || '—') + '</td>'
      + '<td style="font-size:12px;">' + ag + '</td>'
      + '<td style="font-size:12px;max-width:240px;">' + descTxt + '</td>'
      + '<td>' + est + '</td>'
      + '</tr>';
  }).join('');

  c.innerHTML = '<div style="overflow-x:auto;"><table class="tbl">'
    + '<thead><tr><th>Fecha</th><th>Alumno / Grupo</th><th>Descripción</th><th>Estado</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>';
}

// ── Buscador de alumno ──────────────────────────────────────────

async function _incLoadAlumnos() {
  if (_incAlumnosCache && _incAlumnosCacheCtrid === ctrId) { _incPopulateGrupoFilter(); return; }
  var r = await sb.from('alumnos').select('id,nombre,grupo_horario')
    .eq('centro_id', ctrId).order('nombre');
  if (!r.error && r.data) {
    _incAlumnosCache = r.data;
    _incAlumnosCacheCtrid = ctrId;
    _incPopulateGrupoFilter();
  }
}

function _incPopulateGrupoFilter() {
  var sel = document.getElementById('inc-filtro-grupo');
  if (!sel || !_incAlumnosCache) return;
  var grupos = Array.from(new Set(
    _incAlumnosCache.map(function(a) { return a.grupo_horario; }).filter(Boolean)
  )).sort();
  sel.innerHTML = '<option value="">Todos los grupos</option>'
    + grupos.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
}

function buscarAlumnoInc(q) {
  var drop = document.getElementById('inc-alumno-drop');
  if (!drop) return;
  if (!q || q.length < 2) { drop.style.display = 'none'; return; }
  if (!_incAlumnosCache) { drop.style.display = 'none'; return; }

  var lq = q.toLowerCase();
  var results = _incAlumnosCache.filter(function(a) {
    return a.nombre.toLowerCase().includes(lq);
  }).slice(0, 8);

  if (!results.length) { drop.style.display = 'none'; return; }

  var esc = function(v) { return String(v || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); };
  drop.innerHTML = results.map(function(a) {
    return '<div data-inc-id="' + esc(a.id) + '" data-inc-nombre="' + esc(a.nombre) + '" data-inc-grupo="' + esc(a.grupo_horario || '') + '"'
      + ' style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;"'
      + ' onmouseover="this.style.background=\'#f5f5f5\'" onmouseout="this.style.background=\'\'">'
      + '<strong>' + a.nombre + '</strong>'
      + (a.grupo_horario ? ' <span style="color:var(--txt3);font-size:11px;margin-left:6px;">' + a.grupo_horario + '</span>' : '')
      + '</div>';
  }).join('');
  drop.style.display = 'block';
}

function seleccionarAlumnoInc(id, nombre, grupo) {
  var inp = document.getElementById('inc-alumno');
  if (inp) inp.value = nombre;
  var grp = document.getElementById('inc-grupo');
  if (grp && grupo) grp.value = grupo;
  var drop = document.getElementById('inc-alumno-drop');
  if (drop) drop.style.display = 'none';
}

// ── Contador del tab ────────────────────────────────────────────

async function _updateIncTabCount() {
  var r = await sb.from('incidencias')
    .select('*', { count: 'exact', head: true })
    .eq('centro_id', ctrId).eq('estado', 'abierta');
  var tab = document.getElementById('tab-incidencias');
  if (!tab) return;
  var n = (r.count != null) ? r.count : 0;
  tab.textContent = n > 0 ? '⚠️ Incidencias (' + n + ')' : '⚠️ Incidencias';
}

// ── Lista de incidencias ────────────────────────────────────────

async function loadIncidencias(filtro) {
  if (filtro !== undefined) incFiltroActivo = filtro;
  var grupoSel = document.getElementById('inc-filtro-grupo');
  var incFiltroGrupo = grupoSel ? grupoSel.value : '';

  ['abiertas', 'cerradas', 'todo'].forEach(function(k) {
    var btn = document.getElementById('inc-btn-' + k);
    if (!btn) return;
    btn.style.background  = k === incFiltroActivo ? 'var(--ink)' : 'white';
    btn.style.color       = k === incFiltroActivo ? '#fff' : '';
    btn.style.borderColor = k === incFiltroActivo ? 'var(--ink)' : '#e0e0e0';
  });

  var c = document.getElementById('inc-lista');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:12px;"><span class="spin">⟳</span> Cargando…</div>';

  var query = sb.from('incidencias').select('*').eq('centro_id', ctrId);
  if (incFiltroActivo === 'abiertas')  query = query.eq('estado', 'abierta');
  else if (incFiltroActivo === 'cerradas') query = query.eq('estado', 'cerrada');
  if (incFiltroGrupo) query = query.eq('grupo_horario', incFiltroGrupo);
  query = query.order('created_at', { ascending: false }).limit(200);

  var r = await query;
  _updateIncTabCount();

  if (r.error) {
    c.innerHTML = '<div style="color:var(--red);font-size:13px;">Error: ' + r.error.message + '</div>';
    return;
  }

  _incLastData = r.data || [];

  if (!_incLastData.length) {
    c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay incidencias registradas.</div>';
    return;
  }

  var tipoLabels = { convivencia:'👥 Convivencia', material:'📦 Material', instalaciones:'🏗️ Instalaciones', otro:'📝 Otro' };

  var gravedadBadge = function(g) {
    if (g === 'muy_grave') return '<span style="background:#fce8e6;color:#b71c1c;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;">🔴 Muy grave</span>';
    if (g === 'grave')     return '<span style="background:#fff3e0;color:#e65100;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;">🟠 Grave</span>';
    return '<span style="background:#e8f5e9;color:#2e7d32;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">🟢 Leve</span>';
  };

  c.innerHTML = '<table class="tbl"><thead><tr>'
    + '<th>Fecha</th><th>Tipo</th><th>Gravedad</th><th>Descripción</th>'
    + '<th>Alumno / Grupo</th><th>Estado</th><th></th>'
    + '</tr></thead><tbody>'
    + _incLastData.map(function(i) {
      var gravedad    = i.gravedad || 'leve';
      var alumnoGrupo = [i.alumno_nombre, i.grupo_horario].filter(Boolean).join(' · ') || '—';
      var estado = i.estado === 'abierta'
        ? '<span style="background:#fce8e6;color:#a50e0e;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">⚠ Abierta</span>'
        : '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">✓ Cerrada</span>';
      var acciones = '';
      if (i.estado === 'abierta') {
        acciones += '<button onclick="event.stopPropagation();cerrarIncidencia(\'' + i.id + '\')" style="background:none;border:1px solid #1e6b3a;cursor:pointer;color:#1e6b3a;font-size:11px;padding:3px 8px;border-radius:8px;margin-right:4px;">✓ Cerrar</button>';
      }
      if ((gravedad === 'grave' || gravedad === 'muy_grave') && i.alumno_nombre) {
        acciones += '<button onclick="event.stopPropagation();notificarFamiliaIncidencia(\'' + i.id + '\',' + JSON.stringify(i.alumno_nombre) + ')" style="background:none;border:1px solid #e65100;cursor:pointer;color:#e65100;font-size:11px;padding:3px 8px;border-radius:8px;margin-right:4px;" title="Notificar a la familia">📧 Familia</button>';
      }
      acciones += '<button onclick="event.stopPropagation();eliminarIncidencia(\'' + i.id + '\')" style="background:none;border:none;cursor:pointer;color:#a50e0e;font-size:12px;padding:4px 8px;border-radius:8px;" title="Eliminar">✕</button>';
      return '<tr data-id="' + i.id + '" onclick="_incAbrirDetalle(\'' + i.id + '\')">'
        + '<td>' + (i.fecha || '—') + '</td>'
        + '<td>' + (tipoLabels[i.tipo] || i.tipo || '—') + '</td>'
        + '<td>' + gravedadBadge(gravedad) + '</td>'
        + '<td style="max-width:200px;white-space:normal;">' + (i.descripcion || '—') + '</td>'
        + '<td>' + alumnoGrupo + '</td>'
        + '<td>' + estado + '</td>'
        + '<td style="white-space:nowrap;">' + acciones + '</td>'
        + '</tr>';
    }).join('')
    + '</tbody></table>';
}

// ── Exportar CSV ────────────────────────────────────────────────

function exportarIncidenciasCSV() {
  if (!_incLastData.length) { alert('No hay incidencias para exportar.'); return; }
  if (typeof XLSX === 'undefined') { alert('La librería de exportación (Excel) no está disponible.'); return; }
  var cols   = ['fecha', 'tipo', 'gravedad', 'alumno_nombre', 'grupo_horario', 'descripcion', 'estado'];
  var header = ['Fecha', 'Tipo', 'Gravedad', 'Alumno', 'Grupo', 'Descripción', 'Estado'];
  var aoa = [header];
  _incLastData.forEach(function(row) {
    aoa.push(cols.map(function(k) { return row[k] == null ? '' : row[k]; }));
  });
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 },{ wch: 14 },{ wch: 11 },{ wch: 22 },{ wch: 10 },{ wch: 46 },{ wch: 10 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Incidencias');
  XLSX.writeFile(wb, 'incidencias-' + new Date().toISOString().split('T')[0] + '.xlsx');
}

// ── Detalle de incidencia ───────────────────────────────────────

function _incAbrirDetalle(id) {
  _incSelectedId = id;
  document.querySelectorAll('#inc-lista tr[data-id]').forEach(function(r) {
    r.classList.toggle('inc-row-sel', r.dataset.id === id);
  });
  var i = (_incLastData || []).find(function(x) { return x.id === id; });
  if (!i) return;
  var panel = document.getElementById('inc-panel-der');
  if (!panel) return;
  panel.className = 'inc-detail-content';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  var gravedadColor = i.gravedad === 'muy_grave' ? '#b71c1c' : i.gravedad === 'grave' ? '#e65100' : '#2e7d32';
  var gravedadBg    = i.gravedad === 'muy_grave' ? '#fce8e6' : i.gravedad === 'grave' ? '#fff3e0' : '#e8f5e9';
  var gravedadLabel = i.gravedad === 'muy_grave' ? '🔴 Muy grave' : i.gravedad === 'grave' ? '🟠 Grave' : '🟢 Leve';
  var tipoLabels    = { convivencia:'👥 Convivencia', material:'📦 Material', instalaciones:'🏗️ Instalaciones', otro:'📝 Otro' };
  var estadoBadge   = i.estado === 'abierta'
    ? '<span style="background:#fce8e6;color:#a50e0e;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:500;">⚠ Abierta</span>'
    : '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:500;">✓ Cerrada</span>';

  var html = '<div style="padding:24px 20px;">';
  html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
  html += '<span style="background:' + gravedadBg + ';color:' + gravedadColor + ';border-radius:12px;padding:4px 12px;font-size:12px;font-weight:700;">' + gravedadLabel + '</span>';
  html += estadoBadge;
  html += '</div>';
  html += '<button onclick="_incCerrarDetalle()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--muted);padding:0 2px;line-height:1;" title="Cerrar">✕</button>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">';
  html += '<div style="background:var(--paper-2);border-radius:8px;padding:10px 12px;"><div style="font-size:11px;color:var(--muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px;">Fecha</div><div style="font-size:13px;font-weight:500;">' + esc(i.fecha || '—') + '</div></div>';
  html += '<div style="background:var(--paper-2);border-radius:8px;padding:10px 12px;"><div style="font-size:11px;color:var(--muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px;">Tipo</div><div style="font-size:13px;font-weight:500;">' + esc(tipoLabels[i.tipo] || i.tipo || '—') + '</div></div>';
  if (i.alumno_nombre || i.grupo_horario) {
    html += '<div style="background:var(--paper-2);border-radius:8px;padding:10px 12px;grid-column:1/-1;"><div style="font-size:11px;color:var(--muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px;">Alumno / Grupo</div><div style="font-size:13px;font-weight:500;">' + esc([i.alumno_nombre, i.grupo_horario].filter(Boolean).join(' · ')) + '</div></div>';
  }
  html += '</div>';

  html += '<div style="margin-bottom:16px;">';
  html += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px;font-weight:600;">Descripción</div>';
  html += '<div style="font-size:13px;line-height:1.6;color:var(--txt);white-space:pre-wrap;">' + esc(i.descripcion || '—') + '</div>';
  html += '</div>';

  if (i.informe_borrador) {
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px;font-weight:600;">Informe borrador</div>';
    html += '<div style="font-size:12px;line-height:1.55;color:var(--txt2);background:var(--paper-2);border-radius:8px;padding:12px;white-space:pre-wrap;">' + esc(i.informe_borrador) + '</div>';
    html += '</div>';
  }
  if (i.normativa_ref) {
    html += '<div style="margin-bottom:14px;font-size:12px;color:var(--info);background:var(--info-soft);border-radius:8px;padding:10px 12px;">📋 <strong>Normativa:</strong> ' + esc(i.normativa_ref) + '</div>';
  }
  if (i.medidas_propuestas && i.medidas_propuestas.length) {
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px;font-weight:600;">Medidas propuestas</div>';
    html += '<ul style="margin:0;padding-left:18px;font-size:13px;color:var(--txt2);line-height:1.6;">';
    i.medidas_propuestas.forEach(function(m) { html += '<li>' + esc(m) + '</li>'; });
    html += '</ul></div>';
  }
  if (i.protocolo_previ) {
    html += '<div style="margin-bottom:14px;background:#fce8e6;border-radius:8px;padding:10px 12px;font-size:12px;font-weight:700;color:#b71c1c;">🚨 Protocolo PREVI requerido</div>';
  }

  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;padding-top:16px;border-top:1px solid var(--line);">';
  if (i.estado === 'abierta') {
    html += '<button onclick="_incDetalleAccion(\'cerrar\',\'' + i.id + '\')" class="btn" style="background:var(--success-soft);border-color:var(--success);color:var(--success);font-size:12px;padding:7px 14px;">✓ Cerrar</button>';
    if ((i.gravedad === 'grave' || i.gravedad === 'muy_grave') && i.alumno_nombre) {
      html += '<button onclick="_incDetalleAccion(\'familia\',\'' + i.id + '\')" class="btn" style="background:#fff3e0;border-color:#e65100;color:#e65100;font-size:12px;padding:7px 14px;">📧 Notificar familia</button>';
    }
  }
  html += '<button onclick="_incDetalleAccion(\'eliminar\',\'' + i.id + '\')" class="btn" style="background:var(--danger-soft);border-color:var(--danger);color:var(--danger);font-size:12px;padding:7px 14px;margin-left:auto;">✕ Eliminar</button>';
  html += '</div>';
  html += '</div>';
  panel.innerHTML = html;
}

function _incCerrarDetalle() {
  _incSelectedId = null;
  document.querySelectorAll('#inc-lista tr[data-id]').forEach(function(r) { r.classList.remove('inc-row-sel'); });
  var panel = document.getElementById('inc-panel-der');
  if (!panel) return;
  panel.className = 'inc-detail-empty';
  panel.innerHTML = '<i class="ti ti-alert-circle inc-empty-ico"></i>'
    + '<p class="inc-empty-txt">Selecciona una incidencia para ver el detalle</p>'
    + '<button class="btn btn-p" onclick="loadIncidencias()">↺ Actualizar lista</button>';
}

function _incDetalleAccion(accion, id) {
  var i = (_incLastData || []).find(function(x) { return x.id === id; });
  if (!i) return;
  if (accion === 'cerrar') {
    sb.from('incidencias').update({ estado: 'cerrada' }).eq('id', id).eq('centro_id', ctrId).then(function(r) {
      if (r.error) { alert('Error: ' + r.error.message); return; }
      i.estado = 'cerrada';
      loadIncidencias().then(function() {
        if (_incSelectedId === id) _incAbrirDetalle(id);
      });
    });
  } else if (accion === 'familia') {
    notificarFamiliaIncidencia(id, i.alumno_nombre);
  } else if (accion === 'eliminar') {
    if (!confirm('¿Eliminar esta incidencia?')) return;
    sb.from('incidencias').delete().eq('id', id).eq('centro_id', ctrId).then(function(r) {
      if (r.error) { alert('Error: ' + r.error.message); return; }
      _incCerrarDetalle();
      loadIncidencias();
    });
  }
}

// ── Registrar ───────────────────────────────────────────────────

async function registrarIncidencia() {
  var tipo      = document.getElementById('inc-tipo').value;
  var gravedad  = (document.getElementById('inc-gravedad') || {}).value || 'leve';
  var desc      = document.getElementById('inc-desc').value.trim();
  var alumno    = document.getElementById('inc-alumno').value.trim();
  var grupo     = document.getElementById('inc-grupo').value.trim();
  var fecha     = document.getElementById('inc-fecha').value;
  var msg       = document.getElementById('inc-msg');
  var informeEl = document.getElementById('inc-informe');
  var informe   = informeEl ? informeEl.value.trim() : null;

  if (!desc) {
    msg.textContent = 'La descripción es obligatoria.';
    msg.style.color = 'var(--red)';
    msg.style.display = 'block';
    return;
  }

  msg.textContent = '⟳ Guardando…';
  msg.style.color = 'var(--txt2)';
  msg.style.display = 'block';

  var payload = {
    centro_id:      ctrId,
    fecha:          fecha || new Date().toISOString().split('T')[0],
    tipo:           tipo,
    gravedad:       gravedad,
    descripcion:    desc,
    alumno_nombre:  alumno || null,
    grupo_horario:  grupo || null,
    registrado_por: currentUser.id,
    estado:         'abierta',
  };

  if (_incTipData) {
    payload.normativa_ref      = _incTipData.normativa_ref || null;
    payload.medidas_propuestas = Array.isArray(_incTipData.medidas_propuestas) ? _incTipData.medidas_propuestas : null;
    payload.protocolo_previ    = _incTipData.protocolo_previ === true;
  }
  if (informe) payload.informe_borrador = informe;

  var r = await sb.from('incidencias').insert(payload).select().single();

  if (r.error) {
    msg.textContent = 'Error: ' + r.error.message;
    msg.style.color = 'var(--red)';
    return;
  }

  // Limpiar estado IA y sección de informe
  _incTipData = null;
  var informeSection = document.getElementById('inc-informe-section');
  if (informeSection) informeSection.remove();

  msg.textContent = '✅ Incidencia registrada';
  msg.style.color = 'var(--ink)';
  msg.style.display = 'block';
  document.getElementById('inc-desc').value   = '';
  document.getElementById('inc-alumno').value = '';
  document.getElementById('inc-grupo').value  = '';
  setTimeout(function() { if (msg.style.display !== 'none') msg.style.display = 'none'; }, 5000);
  await loadIncidencias();

  // Auto-notificar jefatura para grave/muy_grave
  if ((gravedad === 'grave' || gravedad === 'muy_grave') && r.data) {
    _incNotificarJefatura(r.data.id, msg);
  }

  // Preguntar por notificación a familia
  if ((gravedad === 'grave' || gravedad === 'muy_grave') && alumno && r.data) {
    var incId = r.data.id;
    setTimeout(function() {
      if (confirm('¿Notificar también a la familia de ' + alumno + '?')) {
        notificarFamiliaIncidencia(incId, alumno);
      }
    }, 600);
  }
}

async function _incNotificarJefatura(incId, msgEl) {
  var r = await sb.functions.invoke('notify-jefatura', { body: { incidencia_id: incId } });
  if (r.error) { console.warn('notify-jefatura:', r.error.message); return; }
  var data = r.data;
  if (data && data.success && msgEl) {
    msgEl.textContent = '✅ Registrada · ✉ Jefatura notificada (' + data.enviados + ')';
    msgEl.style.display = 'block';
  }
}

// ── Cerrar / Eliminar ───────────────────────────────────────────

async function cerrarIncidencia(id) {
  var r = await sb.from('incidencias').update({ estado: 'cerrada' }).eq('id', id).eq('centro_id', ctrId);
  if (r.error) alert('Error: ' + r.error.message);
  else await loadIncidencias();
}

async function eliminarIncidencia(id) {
  if (!confirm('¿Eliminar esta incidencia?')) return;
  var r = await sb.from('incidencias').delete().eq('id', id).eq('centro_id', ctrId);
  if (r.error) alert('Error: ' + r.error.message);
  else await loadIncidencias();
}

// ── Tipificar con IA ────────────────────────────────────────────

async function tipificarIncidenciaIA() {
  var desc = document.getElementById('inc-desc').value.trim();
  if (!desc || desc.length < 10) {
    alert('Escribe una descripción de la incidencia antes de tipificar (mínimo 10 caracteres).');
    return;
  }

  var btn = document.getElementById('inc-btn-tipificar');
  if (btn) { btn.textContent = '⟳ Analizando…'; btn.disabled = true; }

  var r = await sb.functions.invoke('tipificar-incidencia', {
    body: { descripcion: desc, centro_id: ctrId }
  });

  if (btn) { btn.textContent = '✨ Tipificar con IA'; btn.disabled = false; }

  if (r.error) { alert('Error al tipificar: ' + r.error.message); return; }
  var data = r.data;
  if (data && data.error) { alert('Error: ' + (data.message || data.error)); return; }

  _incShowTipModal(data);
}

function _incShowTipModal(data) {
  _incTipData = data;
  var existing = document.getElementById('inc-tip-modal');
  if (existing) existing.remove();

  var esc = function(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var gravedadBadge = function(g) {
    if (g === 'muy_grave') return '<span style="background:#fce8e6;color:#b71c1c;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;">🔴 Muy grave</span>';
    if (g === 'grave')     return '<span style="background:#fff3e0;color:#e65100;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;">🟠 Grave</span>';
    return '<span style="background:#e8f5e9;color:#2e7d32;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;">🟢 Leve</span>';
  };

  var alertaBanner = '';
  if (data.alerta_urgente) {
    alertaBanner = '<div style="background:#fce8e6;border-left:4px solid #b71c1c;padding:12px 16px;border-radius:8px;margin-bottom:16px;">'
      + '<strong style="color:#b71c1c;font-size:13px;">⚠️ PROTOCOLO DE ACTUACIÓN INMEDIATA</strong>'
      + '<div style="color:#a50e0e;font-size:12px;margin-top:4px;">' + esc(data.alerta_urgente) + '</div>'
      + '</div>';
  }

  var medidasHtml = '';
  if (Array.isArray(data.medidas_propuestas) && data.medidas_propuestas.length) {
    medidasHtml = '<div style="margin-bottom:16px;">'
      + '<div style="font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Medidas correctoras propuestas</div>'
      + '<ol style="margin:0;padding-left:20px;font-size:13px;color:#333;line-height:1.7;">'
      + data.medidas_propuestas.map(function(m) { return '<li>' + esc(m) + '</li>'; }).join('')
      + '</ol></div>';
  }

  var informe = (data.informe_borrador || '').replace(/\\n/g, '\n');

  var modal = document.createElement('div');
  modal.id = 'inc-tip-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

  modal.innerHTML = ''
    + '<div style="background:#fff;border-radius:12px;max-width:min(680px,calc(100vw - 24px));width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.18);">'
    + '  <div style="padding:20px 24px 16px;border-bottom:1px solid #e0e0e0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">'
    + '    <div>'
    + '      <div style="font-size:16px;font-weight:600;color:#222;">✨ Tipificación IA</div>'
    + '      <div style="font-size:11px;color:var(--txt3);margin-top:3px;">' + esc(data.normativa_ref || '') + '</div>'
    + '      <div style="font-size:11px;color:var(--txt3);">Paradigma: ' + esc(data.paradigma || '') + '</div>'
    + '    </div>'
    + '    <button onclick="document.getElementById(\'inc-tip-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;flex-shrink:0;line-height:1;padding:0;">✕</button>'
    + '  </div>'
    + '  <div style="padding:20px 24px;">'
    + alertaBanner
    + '  <div style="margin-bottom:16px;">'
    + '    <div style="font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Gravedad sugerida</div>'
    + '    ' + gravedadBadge(data.gravedad) + '</div>'
    + '  <div style="margin-bottom:16px;">'
    + '    <div style="font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Tipificación legal</div>'
    + '    <div style="font-size:13px;color:#333;background:#f8f9fa;padding:10px 14px;border-radius:8px;line-height:1.6;">' + esc(data.tipificacion || '—') + '</div>'
    + '  </div>'
    + medidasHtml
    + '  <div style="margin-bottom:16px;">'
    + '    <div style="font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Borrador del informe <span style="font-weight:400;text-transform:none;font-size:11px;">(editable)</span></div>'
    + '    <textarea id="inc-tip-informe" style="width:100%;min-height:180px;font-size:12px;font-family:monospace;padding:10px;border:1px solid #e0e0e0;border-radius:8px;resize:vertical;box-sizing:border-box;">' + esc(informe) + '</textarea>'
    + '  </div>'
    + (data.justificacion ? '<div style="margin-bottom:4px;">'
    + '  <div style="font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Justificación</div>'
    + '  <div style="font-size:12px;color:#555;line-height:1.6;">' + esc(data.justificacion) + '</div>'
    + '</div>' : '')
    + '  </div>'
    + '  <div style="padding:16px 24px;border-top:1px solid #e0e0e0;display:flex;gap:8px;justify-content:flex-end;">'
    + '    <button onclick="document.getElementById(\'inc-tip-modal\').remove()" style="padding:8px 18px;border:1px solid #e0e0e0;border-radius:8px;background:white;cursor:pointer;font-size:13px;color:#555;">Cancelar</button>'
    + '    <button onclick="_incUsarTipificacion()" style="padding:8px 18px;border:none;border-radius:8px;background:var(--ink);color:#fff;cursor:pointer;font-size:13px;font-weight:500;">✓ Usar esta tipificación</button>'
    + '  </div>'
    + '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

function _incUsarTipificacion() {
  if (!_incTipData) return;
  var sel = document.getElementById('inc-gravedad');
  if (sel) sel.value = _incTipData.gravedad || 'leve';
  var tipoSel = document.getElementById('inc-tipo');
  if (tipoSel) tipoSel.value = 'convivencia';
  _incMostrarInformeEnForm(_incTipData);
  var modal = document.getElementById('inc-tip-modal');
  if (modal) modal.remove();
}

function _incMostrarInformeEnForm(data) {
  var existing = document.getElementById('inc-informe-section');
  if (existing) existing.remove();
  if (!data) return;

  var esc = function(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var informe = (data.informe_borrador || '').replace(/\\n/g, '\n');

  var previrHtml = '';
  if (data.protocolo_previ) {
    previrHtml = '<div style="background:#fce8e6;border-left:4px solid #b71c1c;padding:10px 14px;border-radius:8px;margin-bottom:10px;">'
      + '<strong style="color:#b71c1c;font-size:12px;">⚠️ PROTOCOLO PREVI ACTIVO</strong>'
      + '<div style="color:#a50e0e;font-size:12px;margin-top:3px;">' + esc(data.alerta_urgente || 'Notificar a Jefatura y Orientación antes de finalizar la jornada.') + '</div>'
      + '</div>';
  }

  var section = document.createElement('div');
  section.id = 'inc-informe-section';
  section.style.cssText = 'margin-top:12px;padding:12px 14px;background:#f8f9fa;border-radius:8px;border:1px solid #e0e0e0;';
  section.innerHTML = previrHtml
    + '<div style="font-size:12px;font-weight:600;color:#555;margin-bottom:6px;">Informe borrador <span style="font-weight:400;color:var(--txt3);">(IA · editable)</span></div>'
    + '<textarea id="inc-informe" style="width:100%;min-height:130px;font-size:12px;font-family:monospace;padding:10px;border:1px solid #e0e0e0;border-radius:8px;resize:vertical;box-sizing:border-box;">' + esc(informe) + '</textarea>'
    + '<div style="font-size:11px;color:var(--txt3);margin-top:5px;">' + esc(data.normativa_ref || '') + (data.paradigma ? ' · ' + esc(data.paradigma) : '') + '</div>';

  var desc = document.getElementById('inc-desc');
  if (desc && desc.parentElement) {
    desc.parentElement.insertAdjacentElement('afterend', section);
  }
}

// ── Notificar familia ───────────────────────────────────────────

async function notificarFamiliaIncidencia(incId, alumnoNombre) {
  if (!confirm('Se enviará un email a la familia de ' + alumnoNombre + ' con los detalles de la incidencia. ¿Continuar?')) return;

  var r = await sb.functions.invoke('notify-incidencia', { body: { incidencia_id: incId } });

  if (r.error) { alert('Error al enviar notificación: ' + r.error.message); return; }

  var data = r.data;
  if (data && data.error) {
    var msgs = {
      sin_alumno: 'La incidencia no tiene alumno registrado.',
      sin_alumnos: 'No se encontró el alumno en la base de datos del centro.',
      sin_familias: 'El alumno no tiene familias vinculadas en el sistema.',
      sin_emails: 'Las familias vinculadas no tienen email válido.',
      incidencia_no_encontrada: 'Incidencia no encontrada.',
    };
    alert(msgs[data.error] || ('Error: ' + (data.message || data.error)));
    return;
  }

  if (data && data.success) {
    alert('✅ Notificación enviada a ' + data.enviados + ' de ' + data.total + ' familias.');
  }
}
