// ── MÓDULO INCIDENCIAS ──
var incFiltroActivo  = 'abiertas';
var _incLastData     = [];
var _incAlumnosCache = null;
var _incTipData      = null;  // último resultado de tipificar-incidencia

function initIncidenciasPanel() {
  var fechaInput = document.getElementById('inc-fecha');
  if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

  // Selección con mousedown+preventDefault: evita blur del input y evita
  // que los dobles-comillas de JSON.stringify rompan onclick="..."
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

  // Cerrar dropdown al perder el foco (con delay para no matar el mousedown)
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
    + '<div style="background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.18);">'
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
