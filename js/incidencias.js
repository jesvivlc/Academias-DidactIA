// ── MÓDULO INCIDENCIAS ──
var incFiltroActivo  = 'abiertas';
var _incLastData     = [];
var _incAlumnosCache = null;

function initIncidenciasPanel() {
  var fechaInput = document.getElementById('inc-fecha');
  if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];
  _incLoadAlumnos();
  loadIncidencias('abiertas');
}

// ── Buscador de alumno ──────────────────────────────────────────

async function _incLoadAlumnos() {
  if (_incAlumnosCache) { _incPopulateGrupoFilter(); return; }
  var r = await sb.from('alumnos').select('id,nombre,grupo_horario')
    .eq('centro_id', ctrId).order('nombre');
  if (!r.error && r.data) {
    _incAlumnosCache = r.data;
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

  drop.innerHTML = results.map(function(a) {
    return '<div onclick="seleccionarAlumnoInc(' + JSON.stringify(a.id) + ','
      + JSON.stringify(a.nombre) + ',' + JSON.stringify(a.grupo_horario || '') + ')"'
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

document.addEventListener('click', function(e) {
  var drop = document.getElementById('inc-alumno-drop');
  var inp  = document.getElementById('inc-alumno');
  if (drop && inp && !inp.contains(e.target) && !drop.contains(e.target)) {
    drop.style.display = 'none';
  }
});

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
        acciones += '<button onclick="cerrarIncidencia(\'' + i.id + '\')" style="background:none;border:1px solid #1e6b3a;cursor:pointer;color:#1e6b3a;font-size:11px;padding:3px 8px;border-radius:8px;margin-right:4px;">✓ Cerrar</button>';
      }
      if ((gravedad === 'grave' || gravedad === 'muy_grave') && i.alumno_nombre) {
        acciones += '<button onclick="notificarFamiliaIncidencia(\'' + i.id + '\',' + JSON.stringify(i.alumno_nombre) + ')" style="background:none;border:1px solid #e65100;cursor:pointer;color:#e65100;font-size:11px;padding:3px 8px;border-radius:8px;margin-right:4px;" title="Notificar a la familia">📧 Familia</button>';
      }
      acciones += '<button onclick="eliminarIncidencia(\'' + i.id + '\')" style="background:none;border:none;cursor:pointer;color:#a50e0e;font-size:12px;padding:4px 8px;border-radius:8px;" title="Eliminar">✕</button>';
      return '<tr>'
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
  var cols   = ['fecha', 'tipo', 'gravedad', 'descripcion', 'alumno_nombre', 'grupo_horario', 'estado', 'created_at'];
  var header = ['Fecha', 'Tipo', 'Gravedad', 'Descripcion', 'Alumno', 'Grupo', 'Estado', 'Creado'];
  var esc = function(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  var csv = '﻿' + header.join(',') + '\n'
    + _incLastData.map(function(row) { return cols.map(function(k) { return esc(row[k]); }).join(','); }).join('\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'incidencias-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
}

// ── Registrar ───────────────────────────────────────────────────

async function registrarIncidencia() {
  var tipo     = document.getElementById('inc-tipo').value;
  var gravedad = (document.getElementById('inc-gravedad') || {}).value || 'leve';
  var desc     = document.getElementById('inc-desc').value.trim();
  var alumno   = document.getElementById('inc-alumno').value.trim();
  var grupo    = document.getElementById('inc-grupo').value.trim();
  var fecha    = document.getElementById('inc-fecha').value;
  var msg      = document.getElementById('inc-msg');

  if (!desc) {
    msg.textContent = 'La descripción es obligatoria.';
    msg.style.color = 'var(--red)';
    msg.style.display = 'block';
    return;
  }

  msg.textContent = '⟳ Guardando…';
  msg.style.color = 'var(--txt2)';
  msg.style.display = 'block';

  var r = await sb.from('incidencias').insert({
    centro_id:     ctrId,
    fecha:         fecha || new Date().toISOString().split('T')[0],
    tipo:          tipo,
    gravedad:      gravedad,
    descripcion:   desc,
    alumno_nombre: alumno || null,
    grupo_horario: grupo || null,
    registrado_por: currentUser.id,
    estado: 'abierta'
  }).select().single();

  if (r.error) {
    msg.textContent = 'Error: ' + r.error.message;
    msg.style.color = 'var(--red)';
    return;
  }

  msg.textContent = '✅ Incidencia registrada';
  msg.style.color = 'var(--ink)';
  document.getElementById('inc-desc').value   = '';
  document.getElementById('inc-alumno').value = '';
  document.getElementById('inc-grupo').value  = '';
  setTimeout(function() { msg.style.display = 'none'; }, 3000);
  await loadIncidencias();

  if ((gravedad === 'grave' || gravedad === 'muy_grave') && alumno && r.data) {
    setTimeout(function() {
      if (confirm('Incidencia ' + gravedad.replace('_', ' ') + ' registrada. ¿Desea notificar ahora a la familia de ' + alumno + '?')) {
        notificarFamiliaIncidencia(r.data.id, alumno);
      }
    }, 400);
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
