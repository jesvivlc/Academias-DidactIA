// ── MÓDULO INCIDENCIAS ──
var incFiltroActivo = 'abiertas';

function initIncidenciasPanel() {
  var fechaInput = document.getElementById('inc-fecha');
  if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];
  loadIncidencias('abiertas');
}

async function loadIncidencias(filtro) {
  if (!filtro) filtro = incFiltroActivo;
  incFiltroActivo = filtro;

  ['abiertas', 'cerradas', 'todo'].forEach(function(k) {
    var btn = document.getElementById('inc-btn-' + k);
    if (!btn) return;
    btn.style.background  = k === filtro ? 'var(--ink)' : 'white';
    btn.style.color       = k === filtro ? '#fff' : '';
    btn.style.borderColor = k === filtro ? 'var(--ink)' : '#e0e0e0';
  });

  var c = document.getElementById('inc-lista');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:12px;"><span class="spin">⟳</span> Cargando…</div>';

  var query = sb.from('incidencias').select('*').eq('centro_id', ctrId);
  if (filtro === 'abiertas') query = query.eq('estado', 'abierta');
  else if (filtro === 'cerradas') query = query.eq('estado', 'cerrada');
  query = query.order('created_at', { ascending: false }).limit(60);

  var r = await query;
  if (r.error) { c.innerHTML = '<div style="color:var(--red);font-size:13px;">Error: ' + r.error.message + '</div>'; return; }
  if (!r.data || !r.data.length) {
    c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay incidencias registradas.</div>';
    return;
  }

  var tipoLabels = { convivencia:'👥 Convivencia', material:'📦 Material', instalaciones:'🏗️ Instalaciones', otro:'📝 Otro' };
  c.innerHTML = '<table class="tbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Alumno / Grupo</th><th>Estado</th><th></th></tr></thead><tbody>'
    + r.data.map(function(i) {
      var estado = i.estado === 'abierta'
        ? '<span style="background:#fce8e6;color:#a50e0e;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">⚠ Abierta</span>'
        : '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:500;">✓ Cerrada</span>';
      var alumnoGrupo = [i.alumno_nombre, i.grupo_horario].filter(Boolean).join(' · ') || '—';
      var acciones = '';
      if (i.estado === 'abierta') acciones += '<button onclick="cerrarIncidencia(\'' + i.id + '\')" style="background:none;border:1px solid #1e6b3a;cursor:pointer;color:#1e6b3a;font-size:11px;padding:3px 8px;border-radius:8px;margin-right:4px;">✓ Cerrar</button>';
      acciones += '<button onclick="eliminarIncidencia(\'' + i.id + '\')" style="background:none;border:none;cursor:pointer;color:#a50e0e;font-size:12px;padding:4px 8px;border-radius:8px;" title="Eliminar">✕</button>';
      return '<tr>'
        + '<td>' + (i.fecha || '—') + '</td>'
        + '<td>' + (tipoLabels[i.tipo] || i.tipo || '—') + '</td>'
        + '<td style="max-width:220px;white-space:normal;">' + (i.descripcion || '—') + '</td>'
        + '<td>' + alumnoGrupo + '</td>'
        + '<td>' + estado + '</td>'
        + '<td style="white-space:nowrap;">' + acciones + '</td>'
        + '</tr>';
    }).join('')
    + '</tbody></table>';
}

async function registrarIncidencia() {
  var tipo  = document.getElementById('inc-tipo').value;
  var desc  = document.getElementById('inc-desc').value.trim();
  var alumno = document.getElementById('inc-alumno').value.trim();
  var grupo  = document.getElementById('inc-grupo').value.trim();
  var fecha  = document.getElementById('inc-fecha').value;
  var msg    = document.getElementById('inc-msg');

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
    centro_id: ctrId,
    fecha: fecha || new Date().toISOString().split('T')[0],
    tipo: tipo,
    descripcion: desc,
    alumno_nombre: alumno || null,
    grupo_horario: grupo || null,
    registrado_por: currentUser.id,
    estado: 'abierta'
  });

  if (r.error) {
    msg.textContent = 'Error: ' + r.error.message;
    msg.style.color = 'var(--red)';
  } else {
    msg.textContent = '✅ Incidencia registrada';
    msg.style.color = 'var(--ink)';
    document.getElementById('inc-desc').value = '';
    document.getElementById('inc-alumno').value = '';
    document.getElementById('inc-grupo').value = '';
    setTimeout(function() { msg.style.display = 'none'; }, 3000);
    await loadIncidencias(incFiltroActivo);
  }
}

async function cerrarIncidencia(id) {
  var r = await sb.from('incidencias').update({ estado: 'cerrada' }).eq('id', id);
  if (r.error) alert('Error: ' + r.error.message);
  else await loadIncidencias(incFiltroActivo);
}

async function eliminarIncidencia(id) {
  if (!confirm('¿Eliminar esta incidencia?')) return;
  var r = await sb.from('incidencias').delete().eq('id', id);
  if (r.error) alert('Error: ' + r.error.message);
  else await loadIncidencias(incFiltroActivo);
}
