// ── MÓDULO SALIDAS DIDÁCTICAS ──
var _salidasData            = [];
var _salidasFiltroEstado    = '';
var _salidasFiltroMes       = '';
var _salidasFiltroGrupo     = '';
var _salidasGrupos          = [];
var _salidasAlumnosPorGrupo = {}; // cache para el INSERT de participantes

function initSalidasPanel() {
  _salidasCargarGrupos().then(function () {
    loadSalidas();
    _salidasInitFiltros();
  });
}

async function _salidasCargarGrupos() {
  var r = await sb.from('alumnos')
    .select('grupo_horario,id')
    .eq('centro_id', ctrId)
    .not('grupo_horario', 'is', null)
    .order('grupo_horario');
  var map = {};
  (r.data || []).forEach(function (a) {
    if (!map[a.grupo_horario]) map[a.grupo_horario] = [];
    map[a.grupo_horario].push(a.id);
  });
  _salidasAlumnosPorGrupo = map;
  _salidasGrupos = Object.keys(map).sort();
}

function _salidasInitFiltros() {
  var selEst = document.getElementById('sal-filtro-estado');
  if (selEst && !selEst._salReady) {
    selEst._salReady = true;
    selEst.addEventListener('change', function () {
      _salidasFiltroEstado = this.value;
      _salidasRenderFiltered();
    });
  }
  var selMes = document.getElementById('sal-filtro-mes');
  if (selMes && !selMes._salReady) {
    selMes._salReady = true;
    selMes.addEventListener('change', function () {
      _salidasFiltroMes = this.value;
      _salidasRenderFiltered();
    });
  }
  var selGrp = document.getElementById('sal-filtro-grupo');
  if (selGrp && !selGrp._salReady) {
    selGrp._salReady = true;
    // Populate grupo options if needed
    if (selGrp.options.length <= 1) {
      _salidasGrupos.forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        selGrp.appendChild(opt);
      });
    }
    selGrp.addEventListener('change', function () {
      _salidasFiltroGrupo = this.value;
      _salidasRenderFiltered();
    });
  }
}

// ── CARGA PRINCIPAL ─────────────────────────────────────────────

async function loadSalidas() {
  var tbody = document.getElementById('sal-tbody');
  var hdr   = document.getElementById('sal-contador');
  if (tbody) tbody.innerHTML =
    '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--txt3);"><span class="spin">⟳</span> Cargando…</td></tr>';

  var { data, error } = await sb.from('salidas_didacticas')
    .select('*, responsable:profiles!responsable_id(full_name)')
    .eq('centro_id', ctrId)
    .order('fecha_salida', { ascending: false });

  if (error) {
    if (tbody) tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--red);">Error al cargar salidas.</td></tr>';
    return;
  }

  var salidas = data || [];

  if (salidas.length) {
    var ids = salidas.map(function (s) { return s.id; });
    var { data: parts } = await sb.from('participantes_salida')
      .select('salida_id,autorizado,pagado')
      .in('salida_id', ids);
    var pm = {};
    (parts || []).forEach(function (p) {
      if (!pm[p.salida_id]) pm[p.salida_id] = { total: 0, autorizados: 0, pagados: 0 };
      pm[p.salida_id].total++;
      if (p.autorizado) pm[p.salida_id].autorizados++;
      if (p.pagado)     pm[p.salida_id].pagados++;
    });
    salidas.forEach(function (s) { s._p = pm[s.id] || { total: 0, autorizados: 0, pagados: 0 }; });
  }

  _salidasData = salidas;
  _salidasRenderFiltered();

  var activas  = salidas.filter(function (s) { return s.estado === 'publicada'; });
  var pendAuth = activas.filter(function (s) { return s._p && s._p.autorizados < s._p.total; });
  if (hdr) hdr.textContent =
    activas.length + ' salidas activas · ' + pendAuth.length + ' pendientes de autorización completa';
}

function _salidasRenderFiltered() {
  var f = _salidasData.slice();
  if (_salidasFiltroEstado) f = f.filter(function (s) { return s.estado === _salidasFiltroEstado; });
  if (_salidasFiltroMes) f = f.filter(function (s) {
    return (s.fecha_salida || '').slice(0, 7) === _salidasFiltroMes;
  });
  if (_salidasFiltroGrupo) f = f.filter(function (s) {
    var gs = Array.isArray(s.curso_grupos) ? s.curso_grupos : [];
    return gs.includes(_salidasFiltroGrupo);
  });
  _salidasRender(f);
}

function _salidasEstadoBadge(estado) {
  var map = {
    borrador:  ['#6b7280', '#f3f4f6'],
    publicada: ['var(--info)', 'var(--info-soft)'],
    cerrada:   ['var(--success)', 'var(--success-soft)'],
    cancelada: ['var(--danger)', 'var(--danger-soft)']
  };
  var v    = map[estado] || ['#6b7280', '#f3f4f6'];
  var label = { borrador:'Borrador', publicada:'Publicada', cerrada:'Cerrada', cancelada:'Cancelada' }[estado] || estado;
  return '<span style="background:' + v[1] + ';color:' + v[0] +
    ';border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">' + label + '</span>';
}

function _salidasCountBadge(x, y) {
  if (y === 0) return '<span style="color:var(--txt3);font-size:13px;">—</span>';
  var color = (x === y) ? 'var(--success)' : (x > 0) ? 'var(--warning)' : 'var(--danger)';
  return '<span style="color:' + color + ';font-weight:600;font-size:13px;">' + x + ' / ' + y + '</span>';
}

function _salidasRender(salidas) {
  var tbody = document.getElementById('sal-tbody');
  if (!tbody) return;

  if (!salidas.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--txt3);">' +
      '<div style="font-size:36px;margin-bottom:12px;">🚌</div>' +
      '<div style="font-size:14px;margin-bottom:16px;">No hay salidas didácticas que mostrar.</div>' +
      '<button class="btn btn-p" onclick="salNueva()">+ Nueva salida</button></td></tr>';
    return;
  }

  tbody.innerHTML = salidas.map(function (s) {
    var fecha = s.fecha_salida
      ? new Date(s.fecha_salida + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—';
    var grupos = Array.isArray(s.curso_grupos) ? s.curso_grupos : [];
    var p     = s._p || { total: 0, autorizados: 0, pagados: 0 };
    var coste = parseFloat(s.coste || 0).toFixed(2) + ' €';
    var chips = grupos.map(function (g) {
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
        '<button class="btn" onclick="salVerDetalle(\'' + s.id + '\')" ' +
        'style="font-size:12px;padding:5px 12px;">Ver</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function salVerDetalle(id) {
  alert('Vista de detalle (disponible en la próxima versión).');
}

// ── MODAL NUEVA SALIDA ──────────────────────────────────────────

function salNueva() {
  var m = document.getElementById('sal-modal');
  if (!m) return;
  document.getElementById('sal-form').reset();
  var msgEl = document.getElementById('sal-msg');
  if (msgEl) { msgEl.textContent = ''; }

  // Grupos checkboxes
  var cont = document.getElementById('sal-grupos-checks');
  if (cont) {
    cont.innerHTML = _salidasGrupos.length
      ? _salidasGrupos.map(function (g) {
          return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:3px 0;">' +
            '<input type="checkbox" name="sal-grupo" value="' + _salEsc(g) +
            '" style="accent-color:var(--ink);width:15px;height:15px;"> ' + _salEsc(g) + '</label>';
        }).join('')
      : '<span style="color:var(--txt3);font-size:13px;">No hay grupos configurados en el centro.</span>';
  }

  _salidasCargarResponsables();
  m.style.display = 'flex';
}

async function _salidasCargarResponsables() {
  var sel = document.getElementById('sal-responsable');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin responsable asignado —</option>';
  var { data } = await sb.from('profiles')
    .select('id,full_name')
    .eq('centro_id', ctrId)
    .in('rol', ['profesional', 'admin', 'superadmin'])
    .order('full_name');
  (data || []).forEach(function (p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.full_name || p.id;
    sel.appendChild(opt);
  });
}

function salCerrarModal() {
  var m = document.getElementById('sal-modal');
  if (m) m.style.display = 'none';
}

async function salGuardar() {
  var msgEl    = document.getElementById('sal-msg');
  var titulo   = (document.getElementById('sal-titulo')       || {}).value || '';
  var desc     = (document.getElementById('sal-desc')         || {}).value || '';
  var fecha    = (document.getElementById('sal-fecha')        || {}).value || '';
  var horaSal  = (document.getElementById('sal-hora-salida')  || {}).value || null;
  var horaReg  = (document.getElementById('sal-hora-regreso') || {}).value || null;
  var coste    = parseFloat((document.getElementById('sal-coste')        || {}).value || '0') || 0;
  var respId   = (document.getElementById('sal-responsable')  || {}).value || null;
  var empresa  = (document.getElementById('sal-bus-empresa')  || {}).value || '';
  var matricula= (document.getElementById('sal-bus-matricula')|| {}).value || '';
  var telefono = (document.getElementById('sal-bus-telefono') || {}).value || '';

  var grupos = Array.from(
    document.querySelectorAll('input[name="sal-grupo"]:checked')
  ).map(function (cb) { return cb.value; });

  if (!titulo.trim()) {
    if (msgEl) { msgEl.textContent = 'El título es obligatorio.'; msgEl.style.color = 'var(--red)'; }
    return;
  }
  if (!fecha) {
    if (msgEl) { msgEl.textContent = 'La fecha de salida es obligatoria.'; msgEl.style.color = 'var(--red)'; }
    return;
  }
  if (!grupos.length) {
    if (msgEl) { msgEl.textContent = 'Selecciona al menos un grupo participante.'; msgEl.style.color = 'var(--red)'; }
    return;
  }

  if (msgEl) { msgEl.textContent = '⟳ Guardando…'; msgEl.style.color = 'var(--txt2)'; }

  var { data: salida, error } = await sb.from('salidas_didacticas').insert({
    centro_id:     ctrId,
    titulo:        titulo.trim(),
    descripcion:   desc.trim() || null,
    fecha_salida:  fecha,
    hora_salida:   horaSal  || null,
    hora_regreso:  horaReg  || null,
    curso_grupos:  grupos,
    coste:         coste,
    responsable_id:respId   || null,
    estado:        'borrador',
    datos_autobus: { empresa: empresa, matricula: matricula, telefono: telefono }
  }).select().single();

  if (error || !salida) {
    if (msgEl) {
      msgEl.textContent = 'Error: ' + ((error && error.message) || 'desconocido');
      msgEl.style.color = 'var(--red)';
    }
    return;
  }

  // Generar participantes para todos los alumnos de los grupos seleccionados
  var alumnoIds = [];
  grupos.forEach(function (g) {
    (_salidasAlumnosPorGrupo[g] || []).forEach(function (id) {
      alumnoIds.push(id);
    });
  });
  // Deduplicar (un alumno puede estar en dos grupos teóricamente)
  alumnoIds = alumnoIds.filter(function (v, i, a) { return a.indexOf(v) === i; });

  if (alumnoIds.length) {
    var participantes = alumnoIds.map(function (aid) {
      return {
        centro_id:      ctrId,
        salida_id:      salida.id,
        alumno_id:      aid,
        autorizado:     false,
        pagado:         false,
        necesita_picnic:false
      };
    });
    await sb.from('participantes_salida').insert(participantes);
  }

  salCerrarModal();
  _salidasToast('✅ Salida creada con ' + alumnoIds.length + ' participante' + (alumnoIds.length !== 1 ? 's' : '') + '.');
  loadSalidas();
}

// ── EXPORTAR EXCEL ──────────────────────────────────────────────

async function salExportar() {
  if (!_salidasData.length) { alert('No hay salidas para exportar.'); return; }
  if (typeof XLSX === 'undefined') { alert('Librería de exportación no disponible.'); return; }

  var aoa = [['Título', 'Fecha', 'Grupos', 'Coste (€)', 'Total alumnos', 'Autorizados', 'Pagados', 'Estado']];
  _salidasData.forEach(function (s) {
    var p      = s._p || { total: 0, autorizados: 0, pagados: 0 };
    var grupos = Array.isArray(s.curso_grupos) ? s.curso_grupos.join(', ') : '';
    var fecha  = s.fecha_salida
      ? new Date(s.fecha_salida + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    aoa.push([s.titulo, fecha, grupos, parseFloat(s.coste || 0).toFixed(2), p.total, p.autorizados, p.pagados, s.estado]);
  });

  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Salidas');
  XLSX.writeFile(wb, 'salidas-didacticas-' + new Date().toISOString().split('T')[0] + '.xlsx');
}

// ── HELPERS ─────────────────────────────────────────────────────

function _salEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _salidasToast(msg, color) {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (color || 'var(--ink)') +
    ';color:#fff;padding:10px 18px;border-radius:var(--r-sm);font-size:13px;z-index:9999;box-shadow:var(--sh-lg);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2800);
}
