/* js/planner.js — DidactIA Planner V2: motor CSP neuroeducativo + co-docencia LOMLOE */
/* Solo para admin/superadmin. Usa globals: sb, ctrId (config.js) */

(function () {
  'use strict';

  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

  /* Tramos genéricos de hora en hora — solo como placeholder hasta que el centro
     configure los suyos en la pestaña Tramos. NO corresponden a ningún centro real. */
  const TRAMOS_DEFAULT = [
    { numero:1, hora_inicio:'08:00', hora_fin:'09:00', nombre:'', es_descanso:false },
    { numero:2, hora_inicio:'09:00', hora_fin:'10:00', nombre:'', es_descanso:false },
    { numero:3, hora_inicio:'10:00', hora_fin:'11:00', nombre:'', es_descanso:false },
    { numero:4, hora_inicio:'11:00', hora_fin:'11:30', nombre:'Recreo', es_descanso:true  },
    { numero:5, hora_inicio:'11:30', hora_fin:'12:30', nombre:'', es_descanso:false },
    { numero:6, hora_inicio:'12:30', hora_fin:'13:30', nombre:'', es_descanso:false },
    { numero:7, hora_inicio:'13:30', hora_fin:'14:30', nombre:'', es_descanso:false },
  ];

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Estado del módulo ── */
  const _s = {
    materias:       [],
    profesores:     [],
    necesidades:    [],
    grupos:         [],
    tramos:         [],   // cargado de tramos_centro; fallback a TRAMOS_DEFAULT
    dictarResultado:    null,  // resultado parseado por la IA
    dictarConfirmados:  {},    // { 'mat_0': true, 'nec_1': false, ... }
    dictarAudioBase64:  null,
    dictarAudioMime:    null,
    dictarRecognition:  null,
    dictarRecognizing:  false,
    disponibilidad: {},   // profesor_id → Set<"dia_tramo">
    schedule:       {},   // grupo → dia → String(tramo) → slot
    aparcados:      [],   // [{ grupo, slot }] — clases retiradas temporalmente (persistido en localStorage)
    aparcadosAvisados: false,
    sinProf:        false, // modo de generación "sin profesores" (slots con profesor_id null)
    auditLog:       {},   // grupo → string[]
    globalScore:    {},   // grupo → 0–100
    currentGrupo:   null,
    dragData:       null,
    ptab:           'materias'
  };

  /* ── Helpers dinámicos de tramos ── */
  function _allTramos()   { return [..._s.tramos].sort(function (a, b) { return a.numero - b.numero; }); }
  function _claseTramos() { return _allTramos().filter(function (t) { return !t.es_descanso; }); }
  function _tramoNums()   { return _claseTramos().map(function (t) { return t.numero; }); }
  function _tramoLabel(n) {
    var t = _s.tramos.find(function (x) { return x.numero === n; });
    if (!t) return 'T' + n;
    var lbl = t.hora_inicio.slice(0, 5) + '–' + t.hora_fin.slice(0, 5);
    return t.nombre ? lbl + ' (' + t.nombre + ')' : lbl;
  }
  function _horaInicio(n) {
    var t = _s.tramos.find(function (x) { return x.numero === n; });
    return t ? t.hora_inicio.slice(0, 5) : '08:00';
  }
  function _horaFin(n) {
    var t = _s.tramos.find(function (x) { return x.numero === n; });
    return t ? t.hora_fin.slice(0, 5) : '09:00';
  }

  /* ════════════════════════════════
     INIT
  ════════════════════════════════ */
  window.initPlannerPanel = function () {
    const wrap = document.getElementById('pt-materias');
    if (wrap) wrap.innerHTML = '<div class="planner-empty" style="padding:40px 0;text-align:center">Cargando…</div>';
    _loadData()
      .then(function () {
        var warn = document.getElementById('planner-tramos-warn');
        if (warn) warn.style.display = _s.usingFallbackTramos ? 'flex' : 'none';
        _showPTab(_s.ptab);
        if (_s.aparcados && _s.aparcados.length && !_s.aparcadosAvisados) {
          _s.aparcadosAvisados = true;
          _plannerToast('⚠ Tienes ' + _s.aparcados.length + ' clase' + (_s.aparcados.length === 1 ? '' : 's') +
            ' aparcada' + (_s.aparcados.length === 1 ? '' : 's') + ' sin asignar. Arrástrala' +
            (_s.aparcados.length === 1 ? '' : 's') + ' a un hueco del tablero.', 'warn');
        }
      })
      .catch(function (err) {
        console.error('[Planner V2] error al cargar datos:', err);
        const el = document.getElementById('pt-materias');
        if (el) {
          el.innerHTML =
            '<div class="planner-empty" style="color:var(--danger)">Error al cargar datos del Planner.<br>' +
            'Revisa la consola. Puede que las tablas no estén creadas o falten columnas V2.<br>' +
            '<code style="font-size:11px">' + _esc(String(err && err.message ? err.message : err)) + '</code></div>';
          el.style.display = 'block';
        }
      });
  };

  /* ════════════════════════════════
     CARGA DE DATOS
  ════════════════════════════════ */
  async function _loadData() {
    console.log('[Planner V2] _loadData — ctrId:', ctrId, '| sb:', !!sb);
    if (!sb) throw new Error('Supabase client (sb) no disponible');

    const [mR, pR, nR, tR] = await Promise.all([
      sb.from('materias')
        .select('id,nombre,color,carga_cognitiva,tipo_dinamica,centro_id,created_at')
        .eq('centro_id', ctrId).order('nombre'),
      sb.from('profesores')
        .select('id,nombre,activo,centro_id,afinidad_metodologica')
        .eq('centro_id', ctrId).or('activo.is.null,activo.eq.true').order('nombre'),
      sb.from('necesidades_lectivas')
        .select('*, materias(nombre,color,carga_cognitiva,tipo_dinamica), profesores(nombre,afinidad_metodologica)')
        .eq('centro_id', ctrId),
      sb.from('tramos_centro')
        .select('id,numero,hora_inicio,hora_fin,nombre,es_descanso')
        .eq('centro_id', ctrId).order('numero')
    ]);

    console.log('[Planner V2] materias:', mR.data, '| error:', mR.error && mR.error.message);
    console.log('[Planner V2] profesores:', pR.data, '| error:', pR.error && pR.error.message);
    console.log('[Planner V2] necesidades:', nR.data, '| error:', nR.error && nR.error.message);
    console.log('[Planner V2] tramos:', tR.data, '| error:', tR.error && tR.error.message);
    if (mR.error) console.warn('[Planner V2] materias — ¿columnas V2 añadidas?', mR.error.message);
    if (nR.error) console.warn('[Planner V2] necesidades_lectivas — ¿tabla existente con columnas V2?', nR.error.message);
    if (tR.error) console.warn('[Planner V2] tramos_centro no disponible — usando defaults:', tR.error.message);

    _s.materias   = mR.data || [];
    _s.profesores = pR.data || [];
    _s.necesidades = (nR.data || []).map(function (n) {
      return Object.assign({}, n, {
        materia_nombre:        (n.materias && n.materias.nombre)            || '?',
        materia_color:         (n.materias && n.materias.color)             || '#1a56db',
        carga_cognitiva:       (n.materias && n.materias.carga_cognitiva)   || 'media',
        tipo_dinamica:         (n.materias && n.materias.tipo_dinamica)     || 'estatica',
        profesor_nombre:       (n.profesores && n.profesores.nombre)        || '?',
        afinidad_metodologica: (n.profesores && n.profesores.afinidad_metodologica) || 'tradicional'
      });
    });

    /* Tramos: usar DB si existen, si no usar TRAMOS_DEFAULT */
    const tramosFromDB = !!(tR.data && tR.data.length);
    _s.tramos = tramosFromDB
      ? tR.data
      : TRAMOS_DEFAULT.map(function (t) { return Object.assign({}, t); });
    _s.usingFallbackTramos = !tramosFromDB;

    _s.grupos = [...new Set(_s.necesidades.map(function (n) { return n.grupo_horario; }))].sort();
    if (!_s.currentGrupo && _s.grupos.length) _s.currentGrupo = _s.grupos[0];

    /* Disponibilidad de profesores */
    const profIds = _s.profesores.map(function (p) { return p.id; }).filter(Boolean);
    _s.disponibilidad = {};
    if (profIds.length) {
      const dR = await sb.from('disponibilidad_profesor')
        .select('profesor_id,dia_semana,tramo_horario,estado')
        .in('profesor_id', profIds)
        .eq('estado', 'no_disponible');
      console.log('[Planner V2] disponibilidad:', dR.data, '| error:', dR.error && dR.error.message);
      (dR.data || []).forEach(function (d) {
        if (!_s.disponibilidad[d.profesor_id]) _s.disponibilidad[d.profesor_id] = new Set();
        _s.disponibilidad[d.profesor_id].add(d.dia_semana + '_' + d.tramo_horario);
      });
    }

    /* Clases aparcadas (persistidas en localStorage por centro) */
    _s.aparcadosAvisados = false;
    _loadAparcados();
  }

  /* ── Sub-tabs ── */
  window.showPTab = _showPTab;
  function _showPTab(tab) {
    _s.ptab = tab;
    document.querySelectorAll('#panel-planner .pt-panel').forEach(function (p) { p.style.display = 'none'; });
    document.querySelectorAll('#panel-planner .planner-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.ptab === tab);
    });
    const panel = document.getElementById('pt-' + tab);
    if (!panel) return;
    panel.style.display = 'block';
    if (tab === 'materias')    _renderMaterias();
    if (tab === 'necesidades') _renderNecesidades();
    if (tab === 'tablero')     _renderTablero();
    if (tab === 'publicar')    _renderPublicar();
    if (tab === 'tramos')      _renderTramos();
    if (tab === 'dictar')      _renderDictar();
    if (tab === 'importar')    _renderImportar();
    if (tab === 'profe')       _renderProfesorView();
  }

  /* ════════════════════════════════
     MATERIAS — CRUD (V2: carga_cognitiva + tipo_dinamica)
  ════════════════════════════════ */
  function _renderMaterias() {
    const el = document.getElementById('pt-materias');
    if (!el) return;

    const CARGA_OPTS = [['alta','Alta'],['media','Media'],['baja','Baja']];
    const DIN_OPTS   = [['estatica','Estática'],['motriz','Motriz'],['colaborativa','Colaborativa']];

    const rows = _s.materias.map(function (m) {
      const cargaSel = CARGA_OPTS.map(function (o) {
        return '<option value="' + o[0] + '"' + ((m.carga_cognitiva || 'media') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('');
      const dinSel = DIN_OPTS.map(function (o) {
        return '<option value="' + o[0] + '"' + ((m.tipo_dinamica || 'estatica') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('');
      return '<div class="planner-list-row">' +
        '<span class="planner-color-dot" style="background:' + _esc(m.color) + '"></span>' +
        '<span style="flex:1;font-weight:500">' + _esc(m.nombre) + '</span>' +
        '<select title="Carga cognitiva" onchange="plannerUpdateMateria(\'' + m.id + '\',\'carga_cognitiva\',this.value)"' +
        ' style="font-size:12px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;font-family:var(--font-ui)">' +
        cargaSel + '</select>' +
        '<select title="Dinámica" onchange="plannerUpdateMateria(\'' + m.id + '\',\'tipo_dinamica\',this.value)"' +
        ' style="font-size:12px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;font-family:var(--font-ui)">' +
        dinSel + '</select>' +
        '<input type="color" value="' + _esc(m.color) + '" title="Cambiar color"' +
        ' onchange="plannerUpdateColor(\'' + m.id + '\',this.value)"' +
        ' style="width:28px;height:28px;border:1px solid var(--line);border-radius:6px;cursor:pointer;padding:2px">' +
        '<button class="icon-btn-sm" onclick="plannerDeleteMateria(\'' + m.id + '\')">&#x2715;</button>' +
        '</div>';
    }).join('');

    const cargaNew = CARGA_OPTS.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === 'media' ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    const dinNew = DIN_OPTS.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === 'estatica' ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Configuración</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Materias del centro</h3></div>' +
        '<button class="btn-ink" onclick="plannerAddMateria()">+ Nueva materia</button>' +
      '</div>' +
      '<div class="planner-add-inline" style="margin-bottom:12px;gap:8px;flex-wrap:wrap;display:flex;align-items:center">' +
        '<input id="pm-nombre" class="planner-input" placeholder="Nombre de la materia" style="flex:1;min-width:180px;max-width:260px">' +
        '<select id="pm-carga" class="planner-select" title="Carga cognitiva">' + cargaNew + '</select>' +
        '<select id="pm-dinamica" class="planner-select" title="Dinámica">' + dinNew + '</select>' +
        '<input id="pm-color" type="color" value="#1a56db" title="Color"' +
        ' style="width:38px;height:38px;border:1px solid var(--line);border-radius:8px;cursor:pointer;padding:3px">' +
        '<button class="btn-ink" onclick="plannerAddMateria()">Añadir</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:16px">' +
        'La carga cognitiva y la dinámica son usadas por el motor neuroeducativo para optimizar el horario.' +
      '</div>' +
      '<div class="planner-list">' +
        (_s.materias.length === 0
          ? '<div class="planner-empty">No hay materias. Añade la primera arriba.</div>'
          : rows) +
      '</div>';
  }

  window.plannerAddMateria = function () {
    const nombre   = (document.getElementById('pm-nombre') && document.getElementById('pm-nombre').value || '').trim();
    const color    = (document.getElementById('pm-color') && document.getElementById('pm-color').value) || '#1a56db';
    const carga    = (document.getElementById('pm-carga') && document.getElementById('pm-carga').value) || 'media';
    const dinamica = (document.getElementById('pm-dinamica') && document.getElementById('pm-dinamica').value) || 'estatica';
    if (!nombre) { alert('Escribe el nombre de la materia.'); return; }
    sb.from('materias')
      .insert({ centro_id: ctrId, nombre: nombre, color: color, carga_cognitiva: carga, tipo_dinamica: dinamica })
      .then(function (r) {
        if (r.error) return alert('Error: ' + r.error.message);
        const el = document.getElementById('pm-nombre');
        if (el) el.value = '';
        _loadData().then(function () { _showPTab('materias'); });
      });
  };

  window.plannerUpdateColor = function (id, color) {
    sb.from('materias').update({ color: color }).eq('id', id)
      .then(function () { _loadData().then(function () { _showPTab('materias'); }); });
  };

  window.plannerUpdateMateria = function (id, campo, valor) {
    const patch = {};
    patch[campo] = valor;
    sb.from('materias').update(patch).eq('id', id).then(function () {});
    const m = _s.materias.find(function (x) { return x.id === id; });
    if (m) m[campo] = valor;
  };

  window.plannerDeleteMateria = function (id) {
    if (!confirm('¿Eliminar esta materia? Se borrarán también las necesidades asociadas.')) return;
    sb.from('materias').delete().eq('id', id)
      .then(function () { _loadData().then(function () { _showPTab('materias'); }); });
  };

  /* ════════════════════════════════
     NECESIDADES LECTIVAS — CRUD (V2: bloque_interdisciplinar_id)
  ════════════════════════════════ */
  function _renderNecesidades() {
    const el = document.getElementById('pt-necesidades');
    if (!el) return;

    const matOpts  = _s.materias.map(function (m) {
      return '<option value="' + m.id + '">' + _esc(m.nombre) + '</option>';
    }).join('');
    const profOpts = _s.profesores.map(function (p) {
      return '<option value="' + p.id + '">' + _esc(p.nombre) + '</option>';
    }).join('');

    const bloqueIds = [...new Set(_s.necesidades.map(function (n) {
      return n.bloque_interdisciplinar_id;
    }).filter(Boolean))];
    const bloqueOpts =
      '<option value="">Sin bloque LOMLOE</option>' +
      bloqueIds.map(function (b) {
        return '<option value="' + _esc(b) + '">🔗 ' + _esc(b.slice(0, 8)) + '…</option>';
      }).join('') +
      '<option value="__nuevo__">+ Nuevo bloque LOMLOE</option>';

    const tbody = _s.necesidades.map(function (n) {
      const cargaColor = n.carga_cognitiva === 'alta' ? 'var(--danger)'
        : n.carga_cognitiva === 'baja' ? 'var(--success)' : 'var(--muted)';
      const bloqueBadge = n.bloque_interdisciplinar_id
        ? '<span style="font-size:10px;color:var(--info);background:var(--info-soft);padding:1px 5px;border-radius:4px">🔗 LOMLOE</span>'
        : '';
      return '<tr>' +
        '<td><strong>' + _esc(n.grupo_horario) + '</strong></td>' +
        '<td><span class="planner-color-dot" style="background:' + _esc(n.materia_color) + ';display:inline-block;vertical-align:middle;margin-right:6px"></span>' +
        _esc(n.materia_nombre) +
        '<span style="font-size:10px;color:' + cargaColor + ';margin-left:6px;font-weight:600">' + _esc(n.carga_cognitiva || 'media') + '</span></td>' +
        '<td>' + _esc(n.profesor_nombre) + '</td>' +
        '<td style="text-align:center;font-weight:500">' + n.horas_semanales + '</td>' +
        '<td>' + bloqueBadge + '</td>' +
        '<td><button class="icon-btn-sm" onclick="plannerDeleteNec(\'' + n.id + '\')">&#x2715;</button></td>' +
        '</tr>';
    }).join('');

    const LOMLOE_HELP = 'La co-docencia LOMLOE permite que dos profesores impartan clase juntos en el mismo aula y tramo. ' +
      'Asigna el mismo bloque a dos necesidades lectivas para que el Planner las coloque siempre juntas.';

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Configuración</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Necesidades lectivas</h3></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">' +
        '<input id="pn-grupo" class="planner-input" placeholder="Grupo (ej: 1ESOA)" style="width:130px">' +
        '<select id="pn-materia" class="planner-select">' + (matOpts || '<option value="">— sin materias —</option>') + '</select>' +
        '<select id="pn-profesor" class="planner-select">' + (profOpts || '<option value="">— sin profesores —</option>') + '</select>' +
        '<input id="pn-horas" type="number" min="1" max="10" value="3" class="planner-input" style="width:70px" placeholder="H/sem">' +
        '<span style="display:inline-flex;align-items:center;gap:4px">' +
          '<select id="pn-bloque" class="planner-select" title="' + _esc(LOMLOE_HELP) + '">' + bloqueOpts + '</select>' +
          '<button type="button" title="' + _esc(LOMLOE_HELP) + '"' +
          ' style="background:none;border:1px solid var(--line);border-radius:50%;width:18px;height:18px;font-size:11px;' +
          'cursor:help;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0">' +
          'ⓘ</button>' +
        '</span>' +
        '<button class="btn-ink" onclick="plannerAddNec()">+ Añadir</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--info);background:var(--info-soft);border-left:3px solid var(--info);' +
      'padding:8px 12px;border-radius:6px;margin-bottom:16px;line-height:1.5">' +
        '<strong>ⓘ Bloque LOMLOE:</strong> ' + _esc(LOMLOE_HELP) +
      '</div>' +
      (_s.necesidades.length === 0
        ? '<div class="planner-empty">No hay necesidades definidas. Añade la primera.</div>'
        : '<table class="planner-table"><thead><tr><th>Grupo</th><th>Materia</th><th>Profesor</th><th>H/sem</th><th>LOMLOE</th><th></th></tr></thead><tbody>' + tbody + '</tbody></table>');
  }

  window.plannerAddNec = function () {
    const grupo    = (document.getElementById('pn-grupo') && document.getElementById('pn-grupo').value || '').trim().toUpperCase();
    const mat      = document.getElementById('pn-materia') && document.getElementById('pn-materia').value;
    const prof     = document.getElementById('pn-profesor') && document.getElementById('pn-profesor').value;
    const horas    = parseInt(document.getElementById('pn-horas') && document.getElementById('pn-horas').value) || 0;
    let bloqueRaw  = (document.getElementById('pn-bloque') && document.getElementById('pn-bloque').value) || '';
    if (bloqueRaw === '__nuevo__') {
      bloqueRaw = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    }
    const bloque = bloqueRaw || null;
    if (!grupo || !mat || !prof || horas < 1) { alert('Completa todos los campos correctamente.'); return; }
    sb.from('necesidades_lectivas')
      .insert({ centro_id: ctrId, grupo_horario: grupo, materia_id: mat, profesor_id: prof,
                horas_semanales: horas, bloque_interdisciplinar_id: bloque })
      .then(function (r) {
        if (r.error) return alert('Error: ' + r.error.message);
        _loadData().then(function () { _showPTab('necesidades'); });
      });
  };

  window.plannerDeleteNec = function (id) {
    sb.from('necesidades_lectivas').delete().eq('id', id)
      .then(function () { _loadData().then(function () { _showPTab('necesidades'); }); });
  };

  /* ════════════════════════════════
     TRAMOS — CRUD + guardado en tramos_centro
  ════════════════════════════════ */
  function _renderTramos() {
    var el = document.getElementById('pt-tramos');
    if (!el) return;

    var isDefault = _s.tramos.every(function (t) { return !t.id; });

    var headerRow =
      '<div class="planner-list-row" style="font-size:11px;color:var(--muted);font-weight:600;' +
      'border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:6px">' +
        '<span style="min-width:32px">Nº</span>' +
        '<span style="min-width:80px">Inicio</span>' +
        '<span style="min-width:80px">Fin</span>' +
        '<span style="flex:1">Nombre</span>' +
        '<span style="width:72px"></span>' +
        '<span style="width:28px"></span>' +
      '</div>';

    var rows = _allTramos().map(function (t) {
      var descBadge = t.es_descanso
        ? '<span style="font-size:10px;color:var(--muted);background:var(--surface-sunk);' +
          'padding:1px 6px;border-radius:4px;white-space:nowrap">Descanso</span>'
        : '<span style="width:72px"></span>';
      return '<div class="planner-list-row">' +
        '<span style="min-width:32px;font-weight:600;color:var(--muted);font-size:13px">' + t.numero + '</span>' +
        '<span style="min-width:80px;font-size:13px">' + _esc(t.hora_inicio.slice(0, 5)) + '</span>' +
        '<span style="min-width:80px;font-size:13px">' + _esc(t.hora_fin.slice(0, 5)) + '</span>' +
        '<span style="flex:1;font-size:13px">' + _esc(t.nombre || '—') + '</span>' +
        descBadge +
        '<button class="icon-btn-sm" onclick="plannerDeleteTramo(' + t.numero + ')">&#x2715;</button>' +
        '</div>';
    }).join('');

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Configuración</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Tramos horarios del centro</h3></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:14px">' +
        'Define los tramos del día incluyendo recreos. Los tramos marcados como “Descanso” ' +
        'se muestran en el tablero pero no se asignan clases.' +
      '</div>' +
      (isDefault
        ? '<div style="font-size:12px;color:var(--muted);background:var(--warning-soft);border-left:3px solid var(--warning);' +
          'padding:8px 12px;border-radius:6px;margin-bottom:14px">' +
          '⚠ Usando tramos por defecto (Agora Lledó). Guarda para personalizarlos.' +
          '</div>'
        : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
        '<input id="pt-num" type="number" min="1" max="20" class="planner-input" placeholder="Nº" style="width:64px" title="Número de tramo (define el orden)">' +
        '<input id="pt-ini" type="time" class="planner-input" style="width:110px" title="Hora inicio">' +
        '<input id="pt-fin" type="time" class="planner-input" style="width:110px" title="Hora fin">' +
        '<input id="pt-nom" class="planner-input" placeholder="Nombre (ej: Recreo)" style="width:150px">' +
        '<label style="display:flex;align-items:center;gap:5px;font-size:13px;color:var(--txt2);cursor:pointer;white-space:nowrap">' +
          '<input type="checkbox" id="pt-desc"> Descanso' +
        '</label>' +
        '<button class="btn-ink" onclick="plannerAddTramo()">Añadir</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">' +
        '<button class="btn-ink" style="background:var(--success)" onclick="plannerSaveTramos()">✓ Guardar tramos en el centro</button>' +
        '<button onclick="plannerResetTramos()" style="font-size:12px;padding:5px 12px;border:1px solid var(--line);' +
        'border-radius:6px;background:none;cursor:pointer;color:var(--muted);font-family:var(--font-ui)">' +
        'Restablecer por defecto</button>' +
        '<div id="pt-tramos-msg" style="font-size:13px"></div>' +
      '</div>' +
      '<div class="planner-list">' + headerRow + (rows || '<div class="planner-empty">Sin tramos. Añade el primero.</div>') + '</div>';
  }

  window.plannerAddTramo = function () {
    var num  = parseInt(document.getElementById('pt-num') && document.getElementById('pt-num').value || 0);
    var ini  = (document.getElementById('pt-ini') && document.getElementById('pt-ini').value || '').trim();
    var fin  = (document.getElementById('pt-fin') && document.getElementById('pt-fin').value || '').trim();
    var nom  = (document.getElementById('pt-nom') && document.getElementById('pt-nom').value || '').trim();
    var desc = !!(document.getElementById('pt-desc') && document.getElementById('pt-desc').checked);
    if (!num || !ini || !fin) { alert('Rellena número, hora inicio y hora fin.'); return; }
    if (_s.tramos.find(function (t) { return t.numero === num; })) {
      alert('Ya existe un tramo con el número ' + num + '. Elímina el existente primero.'); return;
    }
    _s.tramos.push({ numero: num, hora_inicio: ini, hora_fin: fin, nombre: nom, es_descanso: desc });
    _renderTramos();
  };

  window.plannerDeleteTramo = function (numero) {
    _s.tramos = _s.tramos.filter(function (t) { return t.numero !== numero; });
    _renderTramos();
  };

  window.plannerResetTramos = function () {
    if (!confirm('¿Restablecer los tramos por defecto? Se perderán los cambios no guardados.')) return;
    _s.tramos = TRAMOS_DEFAULT.map(function (t) { return Object.assign({}, t); });
    _renderTramos();
  };

  window.plannerSaveTramos = function () {
    var msgEl = document.getElementById('pt-tramos-msg');
    var btns  = document.querySelectorAll('[onclick="plannerSaveTramos()"]');
    btns.forEach(function (b) { b.disabled = true; b.textContent = 'Guardando…'; });

    (async function () {
      try {
        var del = await sb.from('tramos_centro').delete().eq('centro_id', ctrId);
        if (del.error) throw del.error;
        if (_s.tramos.length) {
          var rows = _s.tramos.map(function (t) {
            return {
              centro_id:   ctrId,
              numero:      t.numero,
              hora_inicio: t.hora_inicio.slice(0, 5),
              hora_fin:    t.hora_fin.slice(0, 5),
              nombre:      t.nombre || null,
              es_descanso: !!t.es_descanso
            };
          });
          var ins = await sb.from('tramos_centro').insert(rows);
          if (ins.error) throw ins.error;
        }
        await _loadData();
        _showPTab('tramos');
        var msg2 = document.getElementById('pt-tramos-msg');
        if (msg2) msg2.innerHTML = '<span style="color:var(--success)">✓ Tramos guardados — ' + _s.tramos.length + ' tramos activos.</span>';
      } catch (err) {
        btns.forEach(function (b) { b.disabled = false; b.textContent = '✓ Guardar tramos en el centro'; });
        if (msgEl) msgEl.innerHTML = '<span style="color:var(--danger)">Error: ' + _esc(err && err.message ? err.message : String(err)) + '</span>';
      }
    })();
  };

  /* ════════════════════════════════
     MOTOR CSP V2 — NEUROEDUCATIVO
  ════════════════════════════════ */

  /* ── Mapa de profesores ocupados por otros grupos ya generados ── */
  function _buildTeacherBusy(grupoActual) {
    const busy = {};
    Object.keys(_s.schedule).forEach(function (g) {
      if (g === grupoActual) return;
      DIAS.forEach(function (d) {
        Object.keys(_s.schedule[g] && _s.schedule[g][d] || {}).forEach(function (t) {
          const slot = _s.schedule[g][d][t];
          if (!slot) return;
          const ids = slot.codocente_prof_ids
            ? slot.codocente_prof_ids
            : (slot.profesor_id ? [slot.profesor_id] : []);
          ids.forEach(function (pid) {
            if (!busy[pid]) busy[pid] = new Set();
            busy[pid].add(d + '_' + t);
          });
        });
      });
    });
    return busy;
  }

  /* ── HARD CONSTRAINTS: devuelve true si la asignación es válida ── */
  function _esHardValido(sess, dia, tramo, sched, teacherBusy) {
    const key   = String(tramo);
    const dtKey = dia + '_' + key;
    const TNUMS = _tramoNums();

    /* HC-1: slot ya ocupado para el grupo */
    if (sched[dia][key]) return false;

    /* HC-MATERIA-DIA (universal, todas las CCAA): para un grupo dado, la misma
       materia no puede aparecer más de una vez en el mismo día de la semana */
    const materiaIds = sess.type === 'codoce'
      ? sess.necs.map(function (n) { return n.materia_id; })
      : [sess.materia_id];
    for (var t = 0; t < TNUMS.length; t++) {
      const s = sched[dia][String(TNUMS[t])];
      if (s && materiaIds.indexOf(s.materia_id) !== -1) return false;
    }

    /* HC-VENTANA (universal): el nº de tramos lectivos de un grupo en un mismo
       día no puede superar 8 tramos de clase (los descansos no cuentan, ya que
       TNUMS excluye los tramos con es_descanso) */
    var ocupadosHoy = 0;
    for (var v = 0; v < TNUMS.length; v++) {
      if (sched[dia][String(TNUMS[v])]) ocupadosHoy++;
    }
    if (ocupadosHoy >= TNUMS.length) return false;

    /* HC-INICIO-FIN (universal): sin huecos libres en mitad de la jornada — las
       clases del grupo deben ser consecutivas dentro de los tramos lectivos.
       Los descansos no rompen la continuidad porque TNUMS solo lista tramos de
       clase; verificamos que los índices ocupados formen un bloque contiguo. */
    var idxNuevo = TNUMS.indexOf(parseInt(tramo, 10));
    if (idxNuevo !== -1) {
      var ocupadas = [idxNuevo];
      for (var w = 0; w < TNUMS.length; w++) {
        if (sched[dia][String(TNUMS[w])]) ocupadas.push(w);
      }
      var minI = Math.min.apply(null, ocupadas);
      var maxI = Math.max.apply(null, ocupadas);
      if (maxI - minI + 1 !== ocupadas.length) return false;
    }

    /* HC-3: disponibilidad + ocupación en otros grupos.
       En modo "sin profesores" se omite: el CSP solo coloca materias y los
       slots quedan sin docente (profesor_id null) para asignarlo después. */
    if (!_s.sinProf) {
      const profIds = sess.type === 'codoce'
        ? sess.necs.map(function (n) { return n.profesor_id; }).filter(Boolean)
        : (sess.profesor_id ? [sess.profesor_id] : []);
      for (var i = 0; i < profIds.length; i++) {
        const pid = profIds[i];
        if (teacherBusy[pid] && teacherBusy[pid].has(dtKey))           return false;
        if (_s.disponibilidad[pid] && _s.disponibilidad[pid].has(dtKey)) return false;
      }
    }

    return true;
  }

  /* ── SOFT CONSTRAINTS neuroeducativas: devuelve { score 0–100, reasons[] } ── */
  function _scoreSoft(sess, dia, tramo, sched) {
    var score   = 100;
    var reasons = [];
    var tr      = parseInt(tramo);
    var carga   = sess.carga_cognitiva  || 'media';
    var din     = sess.tipo_dinamica    || 'estatica';
    var TNUMS   = _tramoNums();
    var isFirst = tr === TNUMS[0];
    var isLast  = tr === TNUMS[TNUMS.length - 1];

    var prev1 = sched[dia] && sched[dia][String(tr - 1)];
    var prev2 = sched[dia] && sched[dia][String(tr - 2)];

    /* SC-1: carga alta en hora extrema → -15 */
    if ((isFirst || isLast) && carga === 'alta') {
      score -= 15;
      reasons.push('penalización -15: carga alta en hora ' + (isFirst ? 'inicial' : 'final'));
    }
    if ((isFirst || isLast) && (carga === 'baja' || din === 'motriz')) {
      reasons.push('óptimo: ' + (carga === 'baja' ? 'carga baja' : 'dinámica motriz') + ' en hora extrema');
    }

    /* SC-2: dos materias de carga alta consecutivas → -20 */
    if (prev1 && prev1.carga_cognitiva === 'alta' && carga === 'alta') {
      score -= 20;
      reasons.push('penalización -20: dos materias de carga alta consecutivas');
    }

    /* SC-2b: tres materias de carga alta consecutivas → -20 adicional */
    if (prev2 && prev2.carga_cognitiva === 'alta' &&
        prev1 && prev1.carga_cognitiva === 'alta' && carga === 'alta') {
      score -= 20;
      reasons.push('penalización -20 extra: tres materias de carga alta consecutivas');
    }

    /* SC-3: misma dinámica dos horas seguidas → -10 */
    if (prev1 && prev1.tipo_dinamica && prev1.tipo_dinamica === din) {
      score -= 10;
      reasons.push('penalización -10: dinámica "' + din + '" repetida consecutivamente');
    }
    if (prev1 && prev1.tipo_dinamica === 'estatica' && din === 'motriz') {
      reasons.push('favorable: actividad motriz rompe sedentarismo');
    }

    /* SC-4: muchas cargas altas en el mismo día → -10 */
    if (carga === 'alta') {
      var altasHoy = 0;
      for (var t = 0; t < TNUMS.length; t++) {
        var s = sched[dia] && sched[dia][String(TNUMS[t])];
        if (s && s.carga_cognitiva === 'alta') altasHoy++;
      }
      if (altasHoy >= 2) {
        score -= 10;
        reasons.push('penalización -10: ' + (altasHoy + 1) + 'ª materia de carga alta en ' + dia);
      }
    }

    if (!reasons.length) reasons.push('sin restricciones activas');

    return { score: Math.max(0, score), reasons: reasons };
  }

  /* ── Construir entrada del log de auditoría ── */
  function _buildAuditEntry(sess, dia, tramo, score, reasons) {
    var tramoLabel = _tramoLabel(tramo);
    var matLabel   = sess.type === 'codoce'
      ? sess.necs.map(function (n) { return n.materia_nombre; }).join(' + ')
      : (sess.materia_nombre || '?');
    var profLabel  = sess.type === 'codoce'
      ? sess.necs.map(function (n) { return n.profesor_nombre; }).join(' + ')
      : (sess.profesor_nombre || '?');
    var prefix = sess.type === 'codoce' ? ' [CO-DOC LOMLOE]' : '';
    return '[' + dia + ' T' + tramo + ' ' + tramoLabel + ']' + prefix +
      ' ' + matLabel + ' (' + profLabel + '): ' +
      reasons.join('; ') + '. Puntuación: ' + score + '/100';
  }

  /* ── Colocar sesión en el horario ── */
  function _placeSession(sess, dia, key, sched, teacherBusy, score, reasons, auditLog) {
    var logEntry = _buildAuditEntry(sess, dia, parseInt(key), score, reasons);
    var slot;

    /* Modo sin profesores: coloca solo la materia, sin docente ni teacherBusy */
    if (_s.sinProf) {
      var matNombre = sess.type === 'codoce'
        ? sess.necs.map(function (n) { return n.materia_nombre; }).join(' + ')
        : sess.materia_nombre;
      slot = {
        materia_id:                 sess.type === 'codoce' ? sess.necs[0].materia_id : sess.materia_id,
        materia_nombre:             matNombre,
        materia_color:              sess.type === 'codoce' ? sess.necs[0].materia_color : sess.materia_color,
        profesor_id:                null,
        profesor_nombre:            '',
        carga_cognitiva:            sess.carga_cognitiva || 'media',
        tipo_dinamica:              sess.tipo_dinamica   || 'estatica',
        codocente_prof_ids:         [],
        es_codoce:                  sess.type === 'codoce',
        bloque_interdisciplinar_id: sess.type === 'codoce' ? sess.necs[0].bloque_interdisciplinar_id : undefined,
        sin_asignar:                true,
        puntuacion:                 score,
        log_auditoria:              logEntry
      };
      sched[dia][key] = slot;
      auditLog.push(logEntry);
      return;
    }

    if (sess.type === 'codoce') {
      var profIds = sess.necs.map(function (n) { return n.profesor_id; }).filter(Boolean);
      slot = {
        materia_id:                 sess.necs[0].materia_id,
        materia_nombre:             sess.necs.map(function (n) { return n.materia_nombre; }).join(' + '),
        materia_color:              sess.necs[0].materia_color,
        profesor_id:                sess.necs[0].profesor_id,
        profesor_nombre:            sess.necs.map(function (n) { return n.profesor_nombre; }).join(' + '),
        carga_cognitiva:            sess.necs[0].carga_cognitiva || 'media',
        tipo_dinamica:              sess.necs[0].tipo_dinamica   || 'estatica',
        codocente_prof_ids:         profIds,
        es_codoce:                  true,
        bloque_interdisciplinar_id: sess.necs[0].bloque_interdisciplinar_id,
        puntuacion:                 score,
        log_auditoria:              logEntry
      };
      profIds.forEach(function (pid) {
        if (!teacherBusy[pid]) teacherBusy[pid] = new Set();
        teacherBusy[pid].add(dia + '_' + key);
      });
    } else {
      slot = {
        materia_id:         sess.materia_id,
        materia_nombre:     sess.materia_nombre,
        materia_color:      sess.materia_color,
        profesor_id:        sess.profesor_id,
        profesor_nombre:    sess.profesor_nombre,
        carga_cognitiva:    sess.carga_cognitiva || 'media',
        tipo_dinamica:      sess.tipo_dinamica   || 'estatica',
        codocente_prof_ids: sess.profesor_id ? [sess.profesor_id] : [],
        es_codoce:          false,
        puntuacion:         score,
        log_auditoria:      logEntry
      };
      if (sess.profesor_id) {
        if (!teacherBusy[sess.profesor_id]) teacherBusy[sess.profesor_id] = new Set();
        teacherBusy[sess.profesor_id].add(dia + '_' + key);
      }
    }

    sched[dia][key] = slot;
    auditLog.push(logEntry);
  }

  /* ── Retirar sesión del horario (backtrack) ── */
  function _unplaceSession(sess, dia, key, sched, teacherBusy, auditLog) {
    var slot = sched[dia][key];
    if (!slot) return;
    var profIds = slot.codocente_prof_ids && slot.codocente_prof_ids.length
      ? slot.codocente_prof_ids
      : (slot.profesor_id ? [slot.profesor_id] : []);
    profIds.forEach(function (pid) {
      if (teacherBusy[pid]) teacherBusy[pid].delete(dia + '_' + key);
    });
    var idx = auditLog.lastIndexOf(slot.log_auditoria);
    if (idx !== -1) auditLog.splice(idx, 1);
    delete sched[dia][key];
  }

  /* ── Resolver CSP V2: best-first heuristic + backtracking ── */
  function _resolverCSP_V2(sessions, idx, sched, teacherBusy, auditLog) {
    if (idx >= sessions.length) return sched;

    /* límite de nodos para evitar bloqueo en centros grandes (>18 grupos) */
    _s._cspNodes = (_s._cspNodes || 0) + 1;
    if (_s._cspNodes > 500000) return null;

    var sess       = sessions[idx];
    var TNUMS      = _tramoNums();
    var candidates = [];

    for (var di = 0; di < DIAS.length; di++) {
      var dia = DIAS[di];
      for (var ti = 0; ti < TNUMS.length; ti++) {
        var tramo = TNUMS[ti];
        if (_esHardValido(sess, dia, tramo, sched, teacherBusy)) {
          var scored = _scoreSoft(sess, dia, tramo, sched);
          candidates.push({ dia: dia, tramo: tramo, score: scored.score, reasons: scored.reasons });
        }
      }
    }

    candidates.sort(function (a, b) { return b.score - a.score; });

    for (var ci = 0; ci < candidates.length; ci++) {
      var c   = candidates[ci];
      var key = String(c.tramo);
      _placeSession(sess, c.dia, key, sched, teacherBusy, c.score, c.reasons, auditLog);
      var res = _resolverCSP_V2(sessions, idx + 1, sched, teacherBusy, auditLog);
      if (res) return res;
      _unplaceSession(sess, c.dia, key, sched, teacherBusy, auditLog);
    }

    return null;
  }

  /* ── Expandir necesidades en sesiones individuales + co-docencia ── */
  function _buildSessions(grupo) {
    var necs = _s.necesidades.filter(function (n) { return n.grupo_horario === grupo; });

    var bloqueMap  = {};
    var individual = [];
    necs.forEach(function (n) {
      if (n.bloque_interdisciplinar_id) {
        if (!bloqueMap[n.bloque_interdisciplinar_id]) bloqueMap[n.bloque_interdisciplinar_id] = [];
        bloqueMap[n.bloque_interdisciplinar_id].push(n);
      } else {
        individual.push(n);
      }
    });

    var sessions = [];

    Object.keys(bloqueMap).forEach(function (bid) {
      var bloque = bloqueMap[bid];
      var horas  = Math.min.apply(null, bloque.map(function (n) { return n.horas_semanales; }));
      for (var i = 0; i < horas; i++) {
        sessions.push({
          type:                       'codoce',
          necs:                       bloque,
          materia_id:                 bloque[0].materia_id,
          materia_nombre:             bloque[0].materia_nombre,
          materia_color:              bloque[0].materia_color,
          carga_cognitiva:            bloque[0].carga_cognitiva,
          tipo_dinamica:              bloque[0].tipo_dinamica,
          bloque_interdisciplinar_id: bid,
          horas_semanales:            horas
        });
      }
    });

    individual.forEach(function (n) {
      for (var i = 0; i < n.horas_semanales; i++) {
        sessions.push({
          type:            'individual',
          materia_id:      n.materia_id,
          materia_nombre:  n.materia_nombre,
          materia_color:   n.materia_color,
          carga_cognitiva: n.carga_cognitiva,
          tipo_dinamica:   n.tipo_dinamica,
          profesor_id:     n.profesor_id,
          profesor_nombre: n.profesor_nombre,
          horas_semanales: n.horas_semanales
        });
      }
    });

    sessions.sort(function (a, b) { return (b.horas_semanales || 0) - (a.horas_semanales || 0); });
    return sessions;
  }

  /* ── Generar horario para un grupo ── */
  function _generarHorario(grupo) {
    var sessions = _buildSessions(grupo);
    if (!sessions.length) return null;

    var teacherBusy = _buildTeacherBusy(grupo);
    var grupoSched  = {};
    DIAS.forEach(function (d) { grupoSched[d] = {}; });
    var auditLog = [];

    var result = _resolverCSP_V2(sessions, 0, grupoSched, teacherBusy, auditLog);
    if (result) _s.auditLog[grupo] = auditLog;
    return result;
  }

  /* ── Calcular puntuación global (media de todas las sesiones) ── */
  function _calcGlobalScore(sched) {
    var total = 0, count = 0;
    var TNUMS = _tramoNums();
    DIAS.forEach(function (d) {
      TNUMS.forEach(function (t) {
        var slot = sched[d] && sched[d][String(t)];
        if (slot && typeof slot.puntuacion === 'number') {
          total += slot.puntuacion;
          count++;
        }
      });
    });
    return count ? Math.round(total / count) : 0;
  }

  /* ════════════════════════════════
     EXPORTACIÓN — PDF (jsPDF) + Excel (SheetJS)
  ════════════════════════════════ */

  function _ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function _exportCursoEscolar() {
    var now = new Date();
    var y = now.getFullYear();
    return now.getMonth() >= 8 ? (y + '-' + (y + 1)) : ((y - 1) + '-' + y);  /* sep (mes 8) inicia curso */
  }

  async function _exportCentroInfo() {
    try {
      var r = await sb.from('centros').select('nombre,color_primario,logo_url').eq('id', ctrId).single();
      if (r.data) return { nombre: r.data.nombre || 'Centro', color: r.data.color_primario || '#1a73e8', logo: r.data.logo_url || '' };
    } catch (e) { /* ignore */ }
    return { nombre: (typeof ctrName !== 'undefined' && ctrName) || 'Centro', color: '#1a73e8', logo: '' };
  }

  function _hexToRgb(hex) {
    var h = String(hex || '#1a73e8').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 26, g: 115, b: 232 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function _imgToDataURL(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(null); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ dataURL: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function _scheduleConDatos() {
    return Object.keys(_s.schedule || {}).some(function (g) {
      return DIAS.some(function (d) {
        return _s.schedule[g][d] && Object.keys(_s.schedule[g][d]).length;
      });
    });
  }

  /* Carga el horario publicado desde horario_generado a _s.schedule (con nombres) */
  async function _hidratarScheduleDesdeDB() {
    var r = await sb.from('horario_generado')
      .select('grupo_horario,dia_semana,tramo_horario,materia_id,profesor_id, materias(nombre,color), profesores(nombre), aulas(nombre)')
      .eq('centro_id', ctrId);
    if (r.error || !r.data || !r.data.length) return false;
    _s.schedule = {};
    r.data.forEach(function (row) {
      var g = row.grupo_horario, d = row.dia_semana, k = String(row.tramo_horario);
      if (!_s.schedule[g]) { _s.schedule[g] = {}; DIAS.forEach(function (dd) { _s.schedule[g][dd] = {}; }); }
      if (!_s.schedule[g][d]) _s.schedule[g][d] = {};
      _s.schedule[g][d][k] = {
        materia_id:      row.materia_id,
        materia_nombre:  row.materias ? row.materias.nombre : '',
        materia_color:   (row.materias && row.materias.color) || '#888',
        profesor_id:     row.profesor_id,
        profesor_nombre: row.profesores ? row.profesores.nombre : '',
        aula_nombre:     row.aulas ? row.aulas.nombre : ''
      };
    });
    _s.grupos = Object.keys(_s.schedule).sort();
    if (!_s.currentGrupo && _s.grupos.length) _s.currentGrupo = _s.grupos[0];
    return true;
  }

  async function _asegurarHorario() {
    if (!_s.tramos || !_s.tramos.length) { try { await _loadData(); } catch (e) { /* ignore */ } }
    if (_scheduleConDatos()) return true;
    return await _hidratarScheduleDesdeDB();
  }

  /* Índice por profesor: { nombre: { 'dia_tramo': {grupo, materia, aula} } } */
  function _buildProfesorIndex() {
    var idx = {};
    Object.keys(_s.schedule).forEach(function (g) {
      DIAS.forEach(function (d) {
        var day = _s.schedule[g][d] || {};
        Object.keys(day).forEach(function (k) {
          var slot = day[k];
          if (!slot) return;
          var prof = (slot.profesor_nombre || '').trim();
          if (!prof) return; /* slots sin asignar no aparecen en la hoja de profesor */
          if (!idx[prof]) idx[prof] = {};
          idx[prof][d + '_' + k] = { grupo: g, materia: slot.materia_nombre || '', aula: slot.aula_nombre || '' };
        });
      });
    });
    return idx;
  }

  function _safeSheetName(base, used) {
    var n = String(base || 'Hoja').replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 28) || 'Hoja';
    var name = n, i = 2;
    while (used[name]) { name = n.slice(0, 25) + ' (' + i + ')'; i++; }
    used[name] = true;
    return name;
  }

  /* ── PDF: cabecera con logo + banda de color corporativo ── */
  function _pdfHeader(doc, centro, logoImg, titulo, subtitulo, rgb) {
    var W = doc.internal.pageSize.getWidth();
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(0, 0, W, 28, 'F');
    var x = 12;
    if (logoImg && logoImg.dataURL) {
      try {
        var h = 18, w = h * (logoImg.w / logoImg.h);
        if (w > 42) { w = 42; h = w * (logoImg.h / logoImg.w); }
        doc.addImage(logoImg.dataURL, 'PNG', 12, 5, w, h);
        x = 12 + w + 7;
      } catch (e) { /* logo opcional */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont(undefined, 'bold');
    doc.text(centro.nombre || 'Centro', x, 13);
    doc.setFontSize(11); doc.setFont(undefined, 'normal');
    doc.text(titulo, x, 21);
    doc.setFontSize(9);
    doc.text(subtitulo, W - 12, 13, { align: 'right' });
    doc.setTextColor(40, 40, 40);
  }

  /* ── PDF: rejilla tramos × días; cellFn(dia, tramoNum) → {l1, l2} | null ── */
  function _pdfGrid(doc, startY, tnums, rgb, cellFn) {
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 12;
    var labels = DIAS.map(function (d) { return d.charAt(0).toUpperCase() + d.slice(1); });
    var col0 = 34;
    var dayW = (W - 2 * M - col0) / DIAS.length;
    var headH = 9;
    var avail = H - startY - M - headH;
    var rowH = Math.max(11, Math.min(22, avail / Math.max(1, tnums.length)));
    var y = startY;

    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.setDrawColor(255, 255, 255);
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.rect(M, y, col0, headH, 'F');
    doc.text('Hora', M + col0 / 2, y + headH / 2 + 1.5, { align: 'center' });
    DIAS.forEach(function (d, i) {
      var x = M + col0 + i * dayW;
      doc.rect(x, y, dayW, headH, 'F');
      doc.text(labels[i], x + dayW / 2, y + headH / 2 + 1.5, { align: 'center' });
    });
    y += headH;

    doc.setDrawColor(208, 208, 208);
    tnums.forEach(function (t, ri) {
      var ry = y + ri * rowH;
      doc.setFillColor(244, 242, 238);
      doc.rect(M, ry, col0, rowH, 'FD');
      doc.setTextColor(80, 80, 80); doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
      doc.text(_tramoLabel(t), M + col0 / 2, ry + rowH / 2 + 1, { align: 'center', maxWidth: col0 - 3 });
      DIAS.forEach(function (d, i) {
        var x = M + col0 + i * dayW;
        doc.setFillColor(255, 255, 255);
        doc.rect(x, ry, dayW, rowH, 'FD');
        var cell = cellFn(d, t);
        if (cell && cell.l1) {
          doc.setTextColor(28, 28, 28); doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
          doc.text(String(cell.l1), x + 2, ry + rowH / 2 - 0.5, { maxWidth: dayW - 4 });
          if (cell.l2) {
            doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(115, 115, 115);
            doc.text(String(cell.l2), x + 2, ry + rowH / 2 + 4, { maxWidth: dayW - 4 });
          }
        }
      });
    });
  }

  window.plannerExportarPDF = async function () {
    var btn = document.getElementById('planner-exp-pdf-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
    try {
      var hay = await _asegurarHorario();
      if (!hay) { alert('No hay horario generado todavía. Genera o publica un horario primero.'); return; }
      await _ensureJsPDF();

      var centro  = await _exportCentroInfo();
      var logoImg = await _imgToDataURL(centro.logo);
      var curso   = _exportCursoEscolar();
      var rgb     = _hexToRgb(centro.color);
      var jsPDF   = window.jspdf.jsPDF;
      var doc     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      var tnums   = _tramoNums();
      var grupos  = Object.keys(_s.schedule).sort(function (a, b) { return a.localeCompare(b, 'es'); });
      var first   = true;

      grupos.forEach(function (g) {
        if (!first) doc.addPage(); first = false;
        _pdfHeader(doc, centro, logoImg, 'Horario · Grupo ' + g, 'Curso ' + curso, rgb);
        _pdfGrid(doc, 44, tnums, rgb, function (d, t) {
          var slot = _s.schedule[g][d] && _s.schedule[g][d][String(t)];
          if (!slot) return null;
          return { l1: slot.materia_nombre || '', l2: _slotSinProfesor(slot) ? 'Sin asignar' : (slot.profesor_nombre || '') };
        });
      });

      var profIdx = _buildProfesorIndex();
      Object.keys(profIdx).sort(function (a, b) { return a.localeCompare(b, 'es'); }).forEach(function (prof) {
        doc.addPage();
        _pdfHeader(doc, centro, logoImg, 'Horario del profesor · ' + prof, 'Curso ' + curso, rgb);
        _pdfGrid(doc, 44, tnums, rgb, function (d, t) {
          var cell = profIdx[prof][d + '_' + t];
          if (!cell) return null;
          return { l1: cell.materia || '', l2: cell.grupo + (cell.aula ? ' · ' + cell.aula : '') };
        });
      });

      doc.save('horario-' + String(centro.nombre || 'centro').replace(/[^a-zA-Z0-9]+/g, '_') + '-' + curso + '.pdf');
    } catch (e) {
      console.error('[Planner] export PDF:', e);
      alert('Error al generar el PDF. Revisa la consola.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📄 PDF'; }
    }
  };

  window.plannerExportarExcel = async function () {
    var btn = document.getElementById('planner-exp-xls-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
    try {
      if (typeof XLSX === 'undefined') { alert('La librería de exportación (Excel) no está disponible.'); return; }
      var hay = await _asegurarHorario();
      if (!hay) { alert('No hay horario generado todavía. Genera o publica un horario primero.'); return; }

      var centro = await _exportCentroInfo();
      var curso  = _exportCursoEscolar();
      var tnums  = _tramoNums();
      var labels = DIAS.map(function (d) { return d.charAt(0).toUpperCase() + d.slice(1); });
      var grupos = Object.keys(_s.schedule).sort(function (a, b) { return a.localeCompare(b, 'es'); });
      var wb     = XLSX.utils.book_new();
      var used   = {};

      /* Hoja por grupo */
      grupos.forEach(function (g) {
        var aoa = [['Hora'].concat(labels)];
        tnums.forEach(function (t) {
          var row = [_tramoLabel(t)];
          DIAS.forEach(function (d) {
            var slot = _s.schedule[g][d] && _s.schedule[g][d][String(t)];
            if (!slot) { row.push(''); return; }
            var prof = _slotSinProfesor(slot) ? 'Sin asignar' : (slot.profesor_nombre || '');
            row.push((slot.materia_nombre || '') + (prof ? '\n' + prof : ''));
          });
          aoa.push(row);
        });
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 16 }].concat(DIAS.map(function () { return { wch: 22 }; }));
        XLSX.utils.book_append_sheet(wb, ws, _safeSheetName(g, used));
      });

      /* Hoja por profesor (clases, aulas y grupos) */
      var profIdx = _buildProfesorIndex();
      Object.keys(profIdx).sort(function (a, b) { return a.localeCompare(b, 'es'); }).forEach(function (prof) {
        var aoa = [['Día', 'Hora', 'Grupo', 'Materia', 'Aula']];
        DIAS.forEach(function (d) {
          tnums.forEach(function (t) {
            var cell = profIdx[prof][d + '_' + t];
            if (!cell) return;
            aoa.push([d.charAt(0).toUpperCase() + d.slice(1), _tramoLabel(t), cell.grupo, cell.materia, cell.aula || '']);
          });
        });
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 24 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, _safeSheetName('Prof ' + prof, used));
      });

      /* Hoja resumen — horario completo del centro */
      var resumen = [['Grupo', 'Día', 'Hora', 'Materia', 'Profesor', 'Aula']];
      grupos.forEach(function (g) {
        DIAS.forEach(function (d) {
          tnums.forEach(function (t) {
            var slot = _s.schedule[g][d] && _s.schedule[g][d][String(t)];
            if (!slot) return;
            resumen.push([
              g, d.charAt(0).toUpperCase() + d.slice(1), _tramoLabel(t),
              slot.materia_nombre || '', _slotSinProfesor(slot) ? 'Sin asignar' : (slot.profesor_nombre || ''), slot.aula_nombre || ''
            ]);
          });
        });
      });
      var wsR = XLSX.utils.aoa_to_sheet(resumen);
      wsR['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 22 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsR, _safeSheetName('Resumen centro', used));

      XLSX.writeFile(wb, 'horario-' + String(centro.nombre || 'centro').replace(/[^a-zA-Z0-9]+/g, '_') + '-' + curso + '.xlsx');
    } catch (e) {
      console.error('[Planner] export Excel:', e);
      alert('Error al generar el Excel. Revisa la consola.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📊 Excel'; }
    }
  };

  /* ════════════════════════════════
     TABLERO — Grid + Drag & Drop
  ════════════════════════════════ */
  function _renderTablero() {
    var el = document.getElementById('pt-tablero');
    if (!el) return;

    /* cobertura para badges en el selector de grupo */
    var cob = (_s.necesidades.length && Object.keys(_s.schedule).length) ? _calcCobertura() : null;
    var grupoOpts = _s.grupos.map(function (g) {
      var badge = '';
      if (cob && cob.porGrupo[g]) {
        var pg = cob.porGrupo[g];
        badge = pg.estado === 'ok' ? ' ✓' : pg.estado === 'warn' ? ' ⚠ ' + pg.totalGen + '/' + pg.totalReq + 'h' : ' ❌';
      }
      return '<option value="' + _esc(g) + '"' + (g === _s.currentGrupo ? ' selected' : '') + '>' + _esc(g) + badge + '</option>';
    }).join('');

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
          '<div><div class="card-eyebrow">Generador</div>' +
          '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Tablero de horario</h3></div>' +
          (_s.grupos.length
            ? '<select id="planner-grupo-sel" class="planner-select" onchange="plannerChangeGrupo(this.value)" style="margin-top:6px">' + grupoOpts + '</select>'
            : '') +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn-ghost" id="planner-exp-pdf-btn" onclick="plannerExportarPDF()"' + (!_s.grupos.length ? ' disabled' : '') +
          ' title="Exporta el horario a PDF (una página por grupo y por profesor)">' +
            '📄 PDF' +
          '</button>' +
          '<button class="btn-ghost" id="planner-exp-xls-btn" onclick="plannerExportarExcel()"' + (!_s.grupos.length ? ' disabled' : '') +
          ' title="Exporta el horario a Excel (hoja por grupo, por profesor y resumen)">' +
            '📊 Excel' +
          '</button>' +
          '<button class="btn-ghost" onclick="plannerCobertura()"' + (!_s.necesidades.length ? ' disabled' : '') +
          ' title="Muestra cuántas horas de cada necesidad están colocadas en el tablero">' +
            '📊 Cobertura' +
          '</button>' +
          '<button class="btn-ghost" onclick="plannerVerificar()"' + (!_s.necesidades.length ? ' disabled' : '') +
          ' title="Verifica que las necesidades lectivas son matemáticamente viables antes de generar">' +
            '🔍 Verificar' +
          '</button>' +
          '<button class="btn-ghost" id="planner-gen-sinprof-btn" onclick="plannerGenerarSinProf()"' + (!_s.grupos.length ? ' disabled' : '') +
          ' title="Coloca las materias en el horario sin asignar profesores; los asignas después">' +
            '🧩 Generar sin profesores' +
          '</button>' +
          '<button class="btn-ink" id="planner-gen-btn" onclick="plannerGenerar()"' + (!_s.grupos.length ? ' disabled' : '') + '>' +
            '✨ Generar con IA' +
          '</button>' +
        '</div>' +
      '</div>' +
      (_s.grupos.length === 0
        ? '<div class="planner-empty">Define necesidades lectivas primero (pestaña Necesidades).</div>'
        : '<div id="planner-tablero-body">' +
            '<div class="planner-grid-outer">' + _buildGrid() + '</div>' +
            _buildMobileList() +
            _buildProfesoresPanel() +
            '<div class="unassigned-pool" id="planner-pool"' +
            ' ondragover="plannerDragOver(event)" ondragleave="plannerDragLeave(event)" ondrop="plannerDropPool(event)">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
              '<div class="card-eyebrow" style="margin:0">🅿️ Aparcados — arrastra una clase aquí para quitarla del horario temporalmente</div>' +
              (_s.aparcados.length
                ? '<span style="font-size:11px;font-weight:700;color:var(--warning-soft);background:var(--warning);padding:2px 9px;border-radius:999px">' +
                  _s.aparcados.length + ' sin asignar</span>'
                : '') +
            '</div>' +
            '<div id="planner-pool-inner" style="min-height:48px;display:flex;flex-wrap:wrap;gap:8px">' +
              _buildAparcadosInner() +
            '</div>' +
            '</div>' +
          '</div>');

    if (_s.currentGrupo && typeof _s.globalScore[_s.currentGrupo] === 'number') {
      _mostrarPuntuacion(_s.currentGrupo, _s.globalScore[_s.currentGrupo]);
    }
  }

  /* ════════════════════════════════
     SPRINT 4 — COBERTURA DEL HORARIO
  ════════════════════════════════ */

  function _calcCobertura() {
    /* contar sesiones colocadas por (grupo, materia_id) en _s.schedule */
    var colocadas = {};
    Object.keys(_s.schedule).forEach(function (g) {
      DIAS.forEach(function (d) {
        Object.keys(_s.schedule[g][d] || {}).forEach(function (k) {
          var slot = _s.schedule[g][d][k];
          if (!slot || !slot.materia_id) return;
          var key = g + '|' + slot.materia_id;
          colocadas[key] = (colocadas[key] || 0) + 1;
        });
      });
    });

    var items = _s.necesidades.map(function (n) {
      var key = n.grupo_horario + '|' + n.materia_id;
      var gen = colocadas[key] || 0;
      var req = n.horas_semanales || 0;
      var estado = gen >= req ? 'ok' : gen > 0 ? 'warn' : 'error';
      return { grupo: n.grupo_horario, materia: n.materia_nombre, color: n.materia_color || '#888', req: req, gen: gen, estado: estado };
    });

    var porGrupo = {};
    items.forEach(function (item) {
      var g = item.grupo;
      if (!porGrupo[g]) porGrupo[g] = { ok: 0, warn: 0, error: 0, totalReq: 0, totalGen: 0 };
      porGrupo[g][item.estado]++;
      porGrupo[g].totalReq += item.req;
      porGrupo[g].totalGen += item.gen;
    });
    Object.keys(porGrupo).forEach(function (g) {
      var p = porGrupo[g];
      p.estado = p.error > 0 ? 'error' : p.warn > 0 ? 'warn' : 'ok';
      p.pct    = p.totalReq > 0 ? Math.round(p.totalGen / p.totalReq * 100) : 100;
    });

    var okItems = items.filter(function (i) { return i.estado === 'ok'; }).length;
    return { items: items, porGrupo: porGrupo, totalItems: items.length, okItems: okItems };
  }

  window.plannerCobertura = function () {
    if (!_s.necesidades.length) { alert('No hay necesidades lectivas definidas.'); return; }
    var cob   = _calcCobertura();
    var _col  = function (e) { return e === 'error' ? 'var(--danger)' : e === 'warn' ? 'var(--warning)' : 'var(--success)'; };
    var _icon = function (e) { return e === 'error' ? '❌' : e === 'warn' ? '⚠️' : '✅'; };

    /* agrupar items por grupo */
    var grupos = _s.grupos.slice().sort();
    var body   = grupos.map(function (g) {
      var pg = cob.porGrupo[g];
      if (!pg) return '';
      var badge = pg.estado === 'ok'
        ? '<span style="background:var(--success-soft);color:var(--success);font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px">✓ Completo ' + pg.totalGen + 'h</span>'
        : pg.estado === 'warn'
        ? '<span style="background:var(--warning-soft);color:var(--warning);font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px">⚠ ' + pg.totalGen + '/' + pg.totalReq + 'h</span>'
        : '<span style="background:var(--danger-soft);color:var(--danger);font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px">❌ Sin generar</span>';

      var rows = cob.items.filter(function (i) { return i.grupo === g; }).map(function (i) {
        var diffTxt = i.gen >= i.req ? '' :
          '<span style="color:' + _col(i.estado) + ';font-size:11px;font-weight:600"> −' + (i.req - i.gen) + 'h</span>';
        return '<tr style="border-bottom:1px solid var(--line)">' +
          '<td style="padding:5px 8px">' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + _esc(i.color) + ';margin-right:6px;vertical-align:middle"></span>' +
            _esc(i.materia) + '</td>' +
          '<td style="padding:5px 8px;text-align:center;color:var(--muted)">' + i.req + '</td>' +
          '<td style="padding:5px 8px;text-align:center;font-weight:600">' + i.gen + diffTxt + '</td>' +
          '<td style="padding:5px 8px;text-align:center">' + _icon(i.estado) + '</td>' +
        '</tr>';
      }).join('');

      return '<div style="margin-bottom:20px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<strong style="font-size:14px">' + _esc(g) + '</strong>' + badge +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr style="border-bottom:2px solid var(--line)">' +
            '<th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase">Materia</th>' +
            '<th style="padding:5px 8px;text-align:center;font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase">Req.</th>' +
            '<th style="padding:5px 8px;text-align:center;font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase">Gen.</th>' +
            '<th style="padding:5px 8px;text-align:center;font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase">Estado</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
    }).join('');

    var pct     = cob.totalItems > 0 ? Math.round(cob.okItems / cob.totalItems * 100) : 100;
    var sumBg   = cob.okItems === cob.totalItems ? 'var(--success-soft)' : 'var(--warning-soft)';
    var sumBrd  = cob.okItems === cob.totalItems ? 'var(--success)' : 'var(--warning)';
    var sumTxt  = cob.okItems === cob.totalItems
      ? '✅ Todas las necesidades cubiertas al 100%. El horario está completo.'
      : '⚠️ ' + cob.okItems + ' de ' + cob.totalItems + ' necesidades al 100% — ' + (cob.totalItems - cob.okItems) + ' con horas incompletas o sin generar.';

    var overlay = document.createElement('div');
    overlay.className = 'cob-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9300;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML =
      '<div style="background:var(--paper);border-radius:14px;padding:28px;max-width:780px;width:100%;box-shadow:var(--sh-lg);display:flex;flex-direction:column;gap:16px">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">' +
          '<div><div class="card-eyebrow">Planner</div>' +
          '<h2 style="font-family:var(--font-display);font-size:22px;font-weight:500;margin:4px 0 4px">Cobertura del horario</h2>' +
          '<div style="font-size:13px;color:var(--muted)">' + cob.okItems + '/' + cob.totalItems + ' necesidades al 100% · ' + pct + '% completo</div></div>' +
          '<button onclick="document.querySelector(\'.cob-overlay\').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);padding:0;line-height:1;flex-shrink:0">✕</button>' +
        '</div>' +
        '<div style="background:' + sumBg + ';border-left:4px solid ' + sumBrd + ';border-radius:8px;padding:12px 16px;font-size:14px;font-weight:500;line-height:1.5">' + sumTxt + '</div>' +
        '<div style="max-height:60vh;overflow-y:auto;padding-right:4px">' + body + '</div>' +
        '<div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--line)">' +
          '<button class="btn-ghost" onclick="document.querySelector(\'.cob-overlay\').remove()">Cerrar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
  };

  /* ════════════════════════════════
     SPRINT 3 — VALIDACIÓN DE VIABILIDAD
  ════════════════════════════════ */

  function _validarViabilidad() {
    var tnums    = _tramoNums();
    var nDias    = DIAS.length;
    var nTramos  = tnums.length;
    var maxSlots = nTramos * nDias;

    /* por grupo */
    var porGrupo = {};
    _s.necesidades.forEach(function (n) {
      if (!porGrupo[n.grupo_horario]) porGrupo[n.grupo_horario] = [];
      porGrupo[n.grupo_horario].push(n);
    });

    var grupoRes = Object.keys(porGrupo).sort().map(function (g) {
      var necs   = porGrupo[g];
      var totalH = necs.reduce(function (s, n) { return s + (n.horas_semanales || 0); }, 0);
      var issues = [];

      if (totalH > maxSlots) {
        issues.push('Carga imposible: ' + totalH + 'h — solo ' + maxSlots + ' slots (' + nTramos + ' tramos × ' + nDias + ' días)');
      }
      necs.forEach(function (n) {
        if ((n.horas_semanales || 0) > nDias) {
          issues.push('"' + n.materia_nombre + '": ' + n.horas_semanales + 'h > ' + nDias + ' días (viola HC-MATERIA-DIA)');
        }
      });
      var sinProf = necs.filter(function (n) { return !n.profesor_id; });
      if (sinProf.length) {
        issues.push(sinProf.length + ' materia' + (sinProf.length > 1 ? 's' : '') + ' sin profesor asignado: ' +
          sinProf.map(function (n) { return n.materia_nombre; }).join(', '));
      }

      var uso    = maxSlots > 0 ? Math.round(totalH / maxSlots * 100) : 0;
      var estado = issues.some(function (i) { return i.indexOf('imposible') !== -1 || i.indexOf('HC-') !== -1; })
        ? 'error' : (uso >= 88 ? 'warn' : 'ok');

      return { grupo: g, totalH: totalH, maxSlots: maxSlots, uso: uso, estado: estado, issues: issues };
    });

    /* por profesor */
    var porProf = {};
    _s.necesidades.forEach(function (n) {
      if (!n.profesor_id) return;
      if (!porProf[n.profesor_id]) porProf[n.profesor_id] = { nombre: n.profesor_nombre, horas: 0, grupos: [] };
      porProf[n.profesor_id].horas += (n.horas_semanales || 0);
      if (porProf[n.profesor_id].grupos.indexOf(n.grupo_horario) === -1)
        porProf[n.profesor_id].grupos.push(n.grupo_horario);
    });

    var profRes = Object.keys(porProf).map(function (pid) {
      var p       = porProf[pid];
      var bloq    = _s.disponibilidad[pid] ? _s.disponibilidad[pid].size : 0;
      var efectivo = maxSlots - bloq;
      var issues  = [];
      if (p.horas > efectivo) {
        issues.push(p.horas + 'h asignadas pero solo ' + efectivo + ' slots disponibles' + (bloq ? ' (−' + bloq + ' bloqueados)' : ''));
      }
      var uso    = efectivo > 0 ? Math.round(p.horas / efectivo * 100) : 100;
      var estado = p.horas > efectivo ? 'error' : (uso >= 90 ? 'warn' : 'ok');
      return { nombre: p.nombre, horas: p.horas, grupos: p.grupos, efectivo: efectivo, uso: uso, estado: estado, issues: issues };
    }).sort(function (a, b) { return b.horas - a.horas; });

    var hayError = grupoRes.some(function (r) { return r.estado === 'error'; }) ||
                   profRes.some(function (r) { return r.estado === 'error'; });
    var hayWarn  = grupoRes.some(function (r) { return r.estado === 'warn'; }) ||
                   profRes.some(function (r) { return r.estado === 'warn'; });

    return { grupos: grupoRes, profesores: profRes, ok: !hayError, hayWarn: hayWarn, hayError: hayError, maxSlots: maxSlots };
  }

  /* Diagnóstico rápido cuando un grupo falla en el CSP */
  function _diagnosticarFallo(grupo) {
    var necs    = _s.necesidades.filter(function (n) { return n.grupo_horario === grupo; });
    var tnums   = _tramoNums();
    var maxSlots = tnums.length * DIAS.length;
    var totalH  = necs.reduce(function (s, n) { return s + (n.horas_semanales || 0); }, 0);
    var msgs    = [];

    if (totalH > maxSlots) {
      msgs.push('carga total ' + totalH + 'h > ' + maxSlots + ' slots disponibles');
    }
    necs.filter(function (n) { return (n.horas_semanales || 0) > DIAS.length; }).forEach(function (n) {
      msgs.push('"' + n.materia_nombre + '" ' + n.horas_semanales + 'h > ' + DIAS.length + ' días (HC-MATERIA-DIA)');
    });
    if (!msgs.length) msgs.push('restricciones de disponibilidad o cross-grupo incompatibles — usa 🔍 Verificar para más detalles');
    return msgs;
  }

  window.plannerVerificar = async function () {
    await _loadData();
    if (!_s.necesidades.length) {
      alert('Define las necesidades lectivas primero (pestaña Necesidades).'); return;
    }

    var rep  = _validarViabilidad();
    var _col  = function (e) { return e === 'error' ? 'var(--danger)' : e === 'warn' ? 'var(--warning)' : 'var(--success)'; };
    var _icon = function (e) { return e === 'error' ? '❌' : e === 'warn' ? '⚠️' : '✅'; };
    var _bar  = function (uso, est) {
      return '<div style="display:inline-flex;align-items:center;gap:6px">' +
        '<div style="width:90px;height:7px;background:var(--line);border-radius:4px;overflow:hidden">' +
          '<div style="width:' + Math.min(uso, 100) + '%;height:100%;background:' + _col(est) + ';border-radius:4px"></div>' +
        '</div><span style="font-size:11px;color:var(--muted)">' + uso + '%</span></div>';
    };

    var grupoRows = rep.grupos.map(function (r) {
      var issHtml = r.issues.length
        ? '<ul style="margin:3px 0 0;padding-left:14px;font-size:11px;color:' + _col(r.estado) + '">' +
          r.issues.map(function (i) { return '<li>' + _esc(i) + '</li>'; }).join('') + '</ul>'
        : '';
      return '<tr style="border-bottom:1px solid var(--line)">' +
        '<td style="padding:7px 10px;font-weight:600">' + _esc(r.grupo) + '</td>' +
        '<td style="padding:7px 10px;text-align:right">' + r.totalH + 'h</td>' +
        '<td style="padding:7px 10px;text-align:right;color:var(--muted)">' + r.maxSlots + '</td>' +
        '<td style="padding:7px 10px">' + _bar(r.uso, r.estado) + '</td>' +
        '<td style="padding:7px 10px">' + _icon(r.estado) + issHtml + '</td>' +
      '</tr>';
    }).join('');

    var profRows = rep.profesores.filter(function (p) { return p.grupos.length > 1 || p.estado !== 'ok'; }).map(function (p) {
      var issHtml = p.issues.length
        ? '<div style="font-size:11px;color:' + _col(p.estado) + ';margin-top:2px">' + _esc(p.issues[0]) + '</div>' : '';
      return '<tr style="border-bottom:1px solid var(--line)">' +
        '<td style="padding:7px 10px;font-weight:600">' + _esc(p.nombre) + '</td>' +
        '<td style="padding:7px 10px;text-align:right">' + p.horas + 'h</td>' +
        '<td style="padding:7px 10px;font-size:11px;color:var(--muted)">' + _esc(p.grupos.join(', ')) + '</td>' +
        '<td style="padding:7px 10px">' + _bar(p.uso, p.estado) + '</td>' +
        '<td style="padding:7px 10px">' + _icon(p.estado) + issHtml + '</td>' +
      '</tr>';
    }).join('');

    var sumBg  = rep.hayError ? 'var(--danger-soft)'  : rep.hayWarn ? 'var(--warning-soft)'  : 'var(--success-soft)';
    var sumBrd = rep.hayError ? 'var(--danger)'        : rep.hayWarn ? 'var(--warning)'        : 'var(--success)';
    var sumTxt = rep.hayError
      ? '❌ Hay problemas que impiden generar el horario. Revisa los grupos marcados en rojo antes de continuar.'
      : rep.hayWarn
      ? '⚠️ Matemáticamente posible pero algunos grupos están muy ajustados. La generación puede fallar con algunas combinaciones de restricciones.'
      : '✅ El horario es completamente viable. Puedes generar con total confianza.';

    var overlay = document.createElement('div');
    overlay.className = 'verif-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9300;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var thStyle = 'padding:7px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border-bottom:2px solid var(--line)';

    overlay.innerHTML =
      '<div style="background:var(--paper);border-radius:14px;padding:28px;max-width:900px;width:100%;box-shadow:var(--sh-lg);display:flex;flex-direction:column;gap:20px">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">' +
          '<div><div class="card-eyebrow">Planner</div>' +
          '<h2 style="font-family:var(--font-display);font-size:22px;font-weight:500;margin:4px 0 4px">Verificación de viabilidad</h2>' +
          '<div style="font-size:13px;color:var(--muted)">' + rep.grupos.length + ' grupos · ' +
            _s.necesidades.length + ' necesidades · ' + rep.maxSlots + ' slots/semana por grupo</div></div>' +
          '<button onclick="document.querySelector(\'.verif-overlay\').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);padding:0;line-height:1;flex-shrink:0">✕</button>' +
        '</div>' +

        '<div style="background:' + sumBg + ';border-left:4px solid ' + sumBrd + ';border-radius:8px;padding:13px 16px;font-size:14px;font-weight:500;line-height:1.5">' + sumTxt + '</div>' +

        '<div>' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px">Por grupo</div>' +
          '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
            '<thead><tr><th style="' + thStyle + '">Grupo</th><th style="' + thStyle + ';text-align:right">H. requeridas</th>' +
            '<th style="' + thStyle + ';text-align:right">Slots disp.</th><th style="' + thStyle + '">Ocupación</th><th style="' + thStyle + '">Estado</th></tr></thead>' +
            '<tbody>' + grupoRows + '</tbody>' +
          '</table></div>' +
        '</div>' +

        (profRows
          ? '<div>' +
              '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px">Profesores con carga multi-grupo o alertas</div>' +
              '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
                '<thead><tr><th style="' + thStyle + '">Profesor</th><th style="' + thStyle + ';text-align:right">H. total</th>' +
                '<th style="' + thStyle + '">Grupos</th><th style="' + thStyle + '">Ocupación</th><th style="' + thStyle + '">Estado</th></tr></thead>' +
                '<tbody>' + profRows + '</tbody>' +
              '</table></div>' +
            '</div>'
          : '') +

        '<div style="display:flex;justify-content:flex-end;gap:10px;padding-top:8px;border-top:1px solid var(--line)">' +
          (rep.ok
            ? '<button class="btn-ink" onclick="document.querySelector(\'.verif-overlay\').remove();plannerGenerar()">✨ Generar con IA</button>' : '') +
          '<button class="btn-ghost" onclick="document.querySelector(\'.verif-overlay\').remove()">Cerrar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
  };

  /* ════════════════════════════════
     VISTA POR PROFESOR — cross-grupo
  ════════════════════════════════ */
  function _renderProfesorView() {
    var el = document.getElementById('pt-profe');
    if (!el) return;

    /* construir índice por profesor incluyendo color de materia */
    var idx = {};       /* { profNombre: { 'dia_tramo': { grupo, materia, color, aula } } } */
    var horas = {};     /* { profNombre: count } */
    Object.keys(_s.schedule).forEach(function (g) {
      DIAS.forEach(function (d) {
        Object.keys(_s.schedule[g][d] || {}).forEach(function (k) {
          var slot = _s.schedule[g][d][k];
          if (!slot) return;
          var prof = (slot.profesor_nombre || '').trim();
          if (!prof) return;
          if (!idx[prof]) { idx[prof] = {}; horas[prof] = 0; }
          idx[prof][d + '_' + k] = {
            grupo:   g,
            materia: slot.materia_nombre  || '',
            color:   slot.materia_color   || '#888',
            aula:    slot.aula_nombre     || ''
          };
          horas[prof]++;
        });
      });
    });

    var profesores = Object.keys(idx).sort(function (a, b) { return a.localeCompare(b, 'es'); });

    if (!profesores.length) {
      el.innerHTML =
        '<div class="planner-section-hdr"><div>' +
          '<div class="card-eyebrow">Planner</div>' +
          '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Vista por profesor</h3>' +
        '</div></div>' +
        '<div class="planner-empty">No hay profesores asignados todavía.<br>Genera el horario con profesores o asígnalos en el Tablero.</div>';
      return;
    }

    var curProf = _s._profViewCurrent;
    if (!curProf || profesores.indexOf(curProf) === -1) curProf = profesores[0];
    _s._profViewCurrent = curProf;

    var profOpts = profesores.map(function (p) {
      return '<option value="' + _esc(p) + '"' + (p === curProf ? ' selected' : '') + '>' + _esc(p) + ' (' + (horas[p] || 0) + 'h)</option>';
    }).join('');

    var profData  = idx[curProf] || {};
    var totalH    = horas[curProf] || 0;
    var tnums     = _tramoNums();
    var allTramos = _allTramos();

    /* conteo de slots sin asignar en todo el centro (badge de aviso) */
    var sinAsignar = 0;
    Object.keys(_s.schedule).forEach(function (g) {
      DIAS.forEach(function (d) {
        Object.keys(_s.schedule[g][d] || {}).forEach(function (k) {
          if (_slotSinProfesor(_s.schedule[g][d][k])) sinAsignar++;
        });
      });
    });

    /* grid */
    var hdrs = '<div class="planner-hdr-cell planner-hdr-hora">Hora</div>' +
      DIAS.map(function (d) {
        return '<div class="planner-hdr-cell">' + d.charAt(0).toUpperCase() + d.slice(1) + '</div>';
      }).join('');

    var rows = allTramos.map(function (t) {
      if (t.es_descanso) {
        var lbl = (t.nombre || 'Descanso') + ' · ' + t.hora_inicio.slice(0,5) + '–' + t.hora_fin.slice(0,5);
        return '<div class="planner-row-label planner-break-row">' + _esc(lbl) + '</div>' +
               '<div class="planner-break-cell" style="grid-column:span 5">' + _esc(t.nombre || 'Descanso') + '</div>';
      }
      var key = String(t.numero);
      var rowLabel = '<div class="planner-row-label">' +
        _esc(t.hora_inicio.slice(0,5)) + '<br>' +
        '<span style="font-size:10px;color:var(--muted-2)">' + _esc(t.hora_fin.slice(0,5)) + '</span>' +
      '</div>';
      var cells = DIAS.map(function (dia) {
        var cell = profData[dia + '_' + key];
        if (!cell) return '<div class="planner-cell"></div>';
        return '<div class="planner-cell">' +
          '<div class="class-card" style="border-left:4px solid ' + _esc(cell.color) + ';cursor:default;user-select:none">' +
            '<div class="cc-name">' + _esc(cell.materia) + '</div>' +
            '<div class="cc-info">' + _esc(cell.grupo) + (cell.aula ? ' · ' + _esc(cell.aula) : '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      return rowLabel + cells;
    }).join('');

    /* totales por día */
    var dayTotals = '<div class="planner-row-label" style="font-size:11px;font-weight:600;color:var(--muted)">Total</div>' +
      DIAS.map(function (d) {
        var n = tnums.filter(function (t) { return profData[d + '_' + String(t)]; }).length;
        return '<div style="text-align:center;font-size:12px;color:var(--muted);padding:4px 0;background:var(--paper-2)">' + (n || '—') + '</div>';
      }).join('');

    /* resumen de carga de todos los profesores */
    var loadRows = profesores.map(function (p) {
      var h = horas[p] || 0;
      var pct = Math.min(100, Math.round(h / 25 * 100)); // 25h referencia jornada completa
      var col = h <= 15 ? 'var(--success)' : h <= 22 ? 'var(--ink)' : 'var(--warning)';
      return '<tr onclick="plannerCambiarProf(\'' + _esc(p).replace(/'/g,"&#39;") + '\')" style="cursor:pointer' + (p === curProf ? ';background:color-mix(in srgb,var(--ink) 8%,var(--paper))' : '') + '">' +
        '<td style="padding:7px 10px;font-size:13px">' + _esc(p) + '</td>' +
        '<td style="padding:7px 10px;text-align:right;font-size:13px;font-weight:600;color:' + col + '">' + h + 'h</td>' +
        '<td style="padding:7px 10px;width:120px">' +
          '<div style="background:var(--line);border-radius:4px;height:6px;overflow:hidden">' +
            '<div style="width:' + pct + '%;height:100%;background:' + col + ';border-radius:4px"></div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
          '<div><div class="card-eyebrow">Planner</div>' +
          '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Vista por profesor</h3></div>' +
          '<select class="planner-select" id="planner-prof-sel" onchange="plannerCambiarProf(this.value)">' + profOpts + '</select>' +
        '</div>' +
        '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
          '<span style="font-size:13px;color:var(--muted)"><strong style="color:var(--txt);font-size:22px;font-family:var(--font-display)">' + totalH + '</strong>&nbsp;h/semana</span>' +
          (sinAsignar ? '<span style="font-size:12px;background:var(--warning-soft);color:var(--warning);font-weight:600;padding:3px 10px;border-radius:999px">⚠ ' + sinAsignar + ' slots sin asignar</span>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 280px;gap:20px;padding:0 20px 20px;align-items:start">' +
        /* horario grid */
        '<div class="planner-grid-outer">' +
          '<div class="planner-grid" style="grid-template-columns:100px repeat(5,1fr)">' + hdrs + rows + '</div>' +
          '<div style="display:grid;grid-template-columns:100px repeat(5,1fr);gap:1px;margin-top:2px">' + dayTotals + '</div>' +
        '</div>' +
        /* tabla resumen de carga */
        '<div style="background:var(--paper);border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;flex-shrink:0">' +
          '<div style="padding:10px 12px;background:var(--paper-2);border-bottom:1px solid var(--line);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Carga semanal</div>' +
          '<table style="width:100%;border-collapse:collapse">' +
            '<tbody>' + loadRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }

  window.plannerCambiarProf = function (prof) {
    _s._profViewCurrent = prof;
    _renderProfesorView();
  };

  function _buildGrid() {
    var g = _s.currentGrupo;
    if (!g) return '';
    if (!_s.schedule[g]) {
      _s.schedule[g] = {};
      DIAS.forEach(function (d) { _s.schedule[g][d] = {}; });
    }
    var hdrs = DIAS.map(function (d) {
      return '<div class="planner-hdr-cell">' + d.charAt(0).toUpperCase() + d.slice(1) + '</div>';
    }).join('');

    var rows = _allTramos().map(function (t) {
      if (t.es_descanso) {
        var breakLbl = (t.nombre || 'Descanso') + ' · ' + t.hora_inicio.slice(0, 5) + '–' + t.hora_fin.slice(0, 5);
        return '<div class="planner-row-label planner-break-row">' + _esc(breakLbl) + '</div>' +
          '<div class="planner-break-cell">' + _esc(t.nombre || 'Descanso') + '</div>';
      }
      var key   = String(t.numero);
      var cells = DIAS.map(function (dia) {
        var slot = _s.schedule[g] && _s.schedule[g][dia] && _s.schedule[g][dia][key];
        var card = '';
        if (slot) {
          var sc    = typeof slot.puntuacion === 'number' ? slot.puntuacion : null;
          var scCol = sc === null ? 'var(--muted)'
            : sc >= 80 ? 'var(--success)' : sc >= 60 ? 'var(--warning)' : 'var(--danger)';
          var scBadge  = sc !== null
            ? '<div style="font-size:9px;color:' + scCol + ';font-weight:700;margin-top:2px">' + sc + '/100</div>'
            : '';
          var codBadge = slot.es_codoce
            ? '<div style="font-size:9px;color:var(--info);font-weight:600;margin-top:1px">CO-DOC</div>'
            : '';
          var tooltip  = slot.log_auditoria ? _esc(slot.log_auditoria) : '';
          var sinProf  = _slotSinProfesor(slot);
          /* fondo rayado suave para slots sin profesor asignado */
          var sinProfBg = sinProf
            ? ';background-image:repeating-linear-gradient(45deg,var(--surface-sunk),var(--surface-sunk) 6px,transparent 6px,transparent 12px);cursor:pointer'
            : '';
          var profLine = sinProf
            ? '<div class="class-card__prof" style="color:var(--warning);font-weight:600">⚠ Sin asignar</div>'
            : '<div class="class-card__prof">' + _esc(slot.profesor_nombre) + '</div>';
          var clickAttr = sinProf
            ? ' onclick="plannerAbrirSelectorProfesor(\'' + _esc(dia) + '\',\'' + key + '\',\'' + _esc(g) + '\')"'
            : '';
          card =
            '<div class="class-card' + (sinProf ? ' class-card--sin-prof' : '') + '" draggable="true"' +
            ' style="border-left-color:' + _esc(slot.materia_color || 'var(--muted)') + sinProfBg + '"' +
            ' title="' + (sinProf ? 'Clic para asignar profesor' : tooltip) + '"' +
            ' data-dia="' + _esc(dia) + '" data-tramo="' + key + '" data-grupo="' + _esc(g) + '"' +
            clickAttr +
            ' ondragstart="plannerDragStart(event,this)" ondragend="plannerDragEnd(event)">' +
            '<div class="class-card__mat">' + _esc(slot.materia_nombre) + '</div>' +
            profLine +
            scBadge + codBadge +
            '</div>';
        }
        return '<div class="planner-cell" data-dia="' + _esc(dia) + '" data-tramo="' + key + '"' +
          ' ondragover="plannerDragOver(event)" ondragleave="plannerDragLeave(event)"' +
          ' ondrop="plannerDrop(event,\'' + _esc(g) + '\')">' + card + '</div>';
      }).join('');
      return '<div class="planner-row-label">' + _esc(_tramoLabel(t.numero)) + '</div>' + cells;
    }).join('');

    return '<div class="planner-grid" id="planner-grid" style="grid-template-columns:100px repeat(5,1fr)">' +
      '<div class="planner-hdr-cell planner-hdr-hora">Hora</div>' + hdrs + rows + '</div>';
  }

  function _buildMobileList() {
    var g = _s.currentGrupo;
    if (!g || !_s.schedule[g]) return '<div class="planner-mobile-list"></div>';

    var DIA_LABELS = { lunes:'Lunes', martes:'Martes', 'miércoles':'Miércoles', jueves:'Jueves', viernes:'Viernes' };
    var tramos = _claseTramos();

    var html = DIAS.map(function (dia) {
      var rows = tramos.map(function (t) {
        var key = String(t.numero);
        var s = (_s.schedule[g][dia] || {})[key];
        if (!s) return '';
        var color = s.materia_color || 'var(--muted)';
        return '<div class="planner-ml-row">' +
          '<span class="planner-ml-hora">' + _esc(_tramoLabel(t.numero)) + '</span>' +
          '<span class="planner-ml-card" style="border-left-color:' + _esc(color) + '">' +
            '<span class="planner-ml-mat">' + _esc(s.materia_nombre || '—') + '</span>' +
            (_slotSinProfesor(s)
              ? '<span class="planner-ml-prof" style="color:var(--warning)">⚠ Sin asignar</span>'
              : (s.profesor_nombre ? '<span class="planner-ml-prof">' + _esc(s.profesor_nombre) + '</span>' : '')) +
          '</span>' +
        '</div>';
      }).join('');

      if (!rows) return '';
      return '<div class="planner-ml-day">' +
        '<div class="planner-ml-day-hdr">' + _esc(DIA_LABELS[dia] || dia) + '</div>' +
        rows +
      '</div>';
    }).join('');

    return '<div class="planner-mobile-list">' + html + '</div>';
  }

  /* ── Tarjetas de la zona de aparcamiento ── */
  function _buildAparcadosInner() {
    if (!_s.aparcados.length) {
      return '<div style="font-size:12px;color:var(--muted-2);padding:6px 2px">No hay clases aparcadas. Arrastra una clase del tablero aquí para retirarla temporalmente.</div>';
    }
    return _s.aparcados.map(function (a, i) {
      var s = a.slot || {};
      return '<div class="class-card aparcado-card" draggable="true"' +
        ' style="position:relative;cursor:grab;min-width:128px;border-left-color:' + _esc(s.materia_color || 'var(--muted)') + '"' +
        ' data-idx="' + i + '"' +
        ' ondragstart="plannerDragStartAparcado(event,this)" ondragend="plannerDragEnd(event)">' +
        '<button class="icon-btn-sm" title="Eliminar definitivamente" draggable="false"' +
        ' onclick="plannerDescartarAparcado(' + i + ')"' +
        ' style="position:absolute;top:2px;right:2px;line-height:1">&#x2715;</button>' +
        '<div class="class-card__mat">' + _esc(s.materia_nombre || '—') + '</div>' +
        '<div class="class-card__prof">' + _esc(s.profesor_nombre || '') + '</div>' +
        '<div style="font-size:9px;color:var(--muted);font-weight:700;margin-top:2px">' + _esc(a.grupo || '') + '</div>' +
        '</div>';
    }).join('');
  }

  /* ── ¿slot sin profesor asignado? ── */
  function _slotSinProfesor(slot) {
    if (!slot) return false;
    if (slot.sin_asignar) return true;
    return !slot.profesor_id && !(slot.codocente_prof_ids && slot.codocente_prof_ids.length);
  }

  function _profNombre(profId) {
    var p = _s.profesores.find(function (x) { return x.id === profId; });
    return p ? p.nombre : '';
  }

  /* ── Panel lateral de profesores (arrastrables a slots sin asignar) ── */
  function _buildProfesoresPanel() {
    if (!_s.profesores.length) return '';
    /* nº de slots sin asignar en el grupo actual, para orientar al usuario */
    var g = _s.currentGrupo, pend = 0;
    if (g && _s.schedule[g]) {
      DIAS.forEach(function (d) {
        Object.keys(_s.schedule[g][d] || {}).forEach(function (k) {
          if (_slotSinProfesor(_s.schedule[g][d][k])) pend++;
        });
      });
    }
    var chips = _s.profesores.map(function (p) {
      return '<div class="prof-chip" draggable="true"' +
        ' style="display:inline-flex;align-items:center;gap:6px;cursor:grab;background:var(--surface-sunk);' +
        'border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600;color:var(--txt);font-family:var(--font-ui)"' +
        ' data-prof-id="' + _esc(p.id) + '" data-prof-nombre="' + _esc(p.nombre) + '"' +
        ' ondragstart="plannerDragStartProfesor(event,this)" ondragend="plannerDragEnd(event)"' +
        ' title="Arrastra sobre una clase sin asignar">' +
        '<span style="width:7px;height:7px;border-radius:50%;background:var(--accent)"></span>' +
        _esc(p.nombre) +
        '</div>';
    }).join('');
    return '<div class="profesores-panel" style="margin-top:14px;padding:12px 14px;background:var(--paper-2);border:1px solid var(--line);border-radius:10px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<div class="card-eyebrow" style="margin:0">👥 Profesores — arrastra uno sobre una clase «Sin asignar» (o haz clic en la clase)</div>' +
        (pend
          ? '<span style="font-size:11px;font-weight:700;color:var(--warning-soft);background:var(--warning);padding:2px 9px;border-radius:999px">' +
            pend + ' sin asignar en ' + _esc(g) + '</span>'
          : '') +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px">' + chips + '</div>' +
    '</div>';
  }

  /* ── Banner de puntuación neuroeducativa ── */
  function _mostrarPuntuacion(grupo, score) {
    var ex = document.getElementById('planner-score-banner');
    if (ex) ex.remove();

    var color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
    var emoji = score >= 80 ? '🧠' : score >= 60 ? '⚠️' : '📉';
    var label = score >= 80 ? 'Excelente' : score >= 60 ? 'Aceptable' : 'Mejorable';

    var banner = document.createElement('div');
    banner.id = 'planner-score-banner';
    banner.style.cssText =
      'margin-bottom:16px;padding:12px 16px;border-radius:8px;background:var(--paper-2);' +
      'border-left:4px solid ' + color + ';display:flex;align-items:center;' +
      'justify-content:space-between;gap:12px;flex-wrap:wrap';
    banner.innerHTML =
      '<span style="font-size:14px;font-weight:500;color:var(--txt)">' +
        emoji + ' Horario <strong>' + _esc(grupo) + '</strong> — ' +
        'Puntuación neuroeducativa: <span style="color:' + color + ';font-weight:700">' + score + '/100</span>' +
        ' <span style="color:var(--muted);font-size:12px">(' + label + ')</span>' +
      '</span>' +
      '<button onclick="plannerVerExplicacion(\'' + _esc(grupo) + '\')"' +
      ' style="font-size:12px;padding:5px 12px;border:1px solid var(--line);border-radius:6px;' +
      'background:none;cursor:pointer;color:var(--muted);font-family:var(--font-ui);white-space:nowrap">' +
      '🔍 Ver explicación IA</button>';

    var body = document.getElementById('planner-tablero-body');
    if (body) body.insertAdjacentElement('afterbegin', banner);
  }

  /* ── Modal log de auditoría ── */
  window.plannerVerExplicacion = function (grupo) {
    var log   = _s.auditLog[grupo] || [];
    var score = _s.globalScore[grupo];

    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;' +
      'display:flex;align-items:center;justify-content:center;padding:24px';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var modal = document.createElement('div');
    modal.style.cssText =
      'background:var(--paper);border-radius:12px;padding:28px;max-width:720px;width:100%;' +
      'max-height:82vh;overflow-y:auto;box-shadow:var(--sh-lg);display:flex;flex-direction:column;gap:16px';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px';
    hdr.innerHTML =
      '<div>' +
        '<div class="card-eyebrow">Log de auditoría IA</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">' +
          'Decisiones del motor CSP — ' + _esc(grupo) + '</h3>' +
        (typeof score === 'number'
          ? '<div style="font-size:13px;color:var(--muted);margin-top:4px">Puntuación global: <strong>' + score + '/100</strong></div>'
          : '') +
      '</div>' +
      '<button id="planner-audit-close-btn"' +
      ' style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted);' +
      'line-height:1;padding:0;flex-shrink:0">×</button>';
    hdr.querySelector('#planner-audit-close-btn').addEventListener('click', function () { overlay.remove(); });

    var logWrap = document.createElement('div');
    logWrap.style.cssText = 'border:1px solid var(--line);border-radius:8px;overflow:hidden';

    if (!log.length) {
      logWrap.innerHTML =
        '<div style="color:var(--muted);padding:24px;text-align:center;font-size:14px">' +
        'No hay log disponible. Genera el horario primero.</div>';
    } else {
      logWrap.innerHTML = log.map(function (entry, i) {
        var bg = entry.indexOf('penalización') !== -1 ? 'var(--danger-soft)'
               : (entry.indexOf('favorable') !== -1 || entry.indexOf('óptimo') !== -1)
                 ? 'var(--success-soft)' : 'transparent';
        return '<div style="padding:9px 14px;border-bottom:1px solid var(--line);font-size:11.5px;' +
          'font-family:monospace;line-height:1.55;background:' + bg + ';color:var(--txt)">' +
          '<span style="color:var(--muted);margin-right:8px;user-select:none">' + (i + 1) + '.</span>' +
          _esc(entry) + '</div>';
      }).join('');
    }

    modal.appendChild(hdr);
    modal.appendChild(logWrap);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  };

  window.plannerChangeGrupo = function (g) {
    _s.currentGrupo = g;
    _renderTablero();
  };

  /* ── Transformar datos de _s al formato que espera DidactIAPlanner ── */
  function _buildPlannerConfig() {
    var claseT   = _claseTramos();
    var numT     = claseT.length;
    var DIAS_IDX = { 'lunes': 0, 'martes': 1, 'miércoles': 2, 'jueves': 3, 'viernes': 4 };

    var teachers = _s.profesores.map(function (p) {
      var unavail = [];
      var dispSet = _s.disponibilidad[p.id];
      if (dispSet) {
        dispSet.forEach(function (key) {
          var sep  = key.lastIndexOf('_');
          var dia  = key.slice(0, sep);
          var tNum = parseInt(key.slice(sep + 1));
          var dIdx = DIAS_IDX[dia];
          var tIdx = -1;
          for (var ci = 0; ci < claseT.length; ci++) {
            if (claseT[ci].numero === tNum) { tIdx = ci; break; }
          }
          if (dIdx >= 0 && tIdx >= 0) unavail.push(dIdx * numT + tIdx);
        });
      }
      return { id: p.id, nombre: p.nombre, unavailableSlots: unavail };
    });

    var groups = _s.grupos.map(function (g) { return { id: g }; });

    var bloqueProcessed = {};
    var blocks = [];
    _s.necesidades.forEach(function (n) {
      if (n.bloque_interdisciplinar_id) {
        var bid = n.bloque_interdisciplinar_id;
        if (bloqueProcessed[bid]) return;
        bloqueProcessed[bid] = true;
        var grp  = _s.necesidades.filter(function (x) { return x.bloque_interdisciplinar_id === bid; });
        var hrs  = Math.min.apply(null, grp.map(function (x) { return x.horas_semanales; }));
        var tIds = grp.map(function (x) { return x.profesor_id; }).filter(Boolean);
        for (var i = 0; i < hrs; i++) {
          blocks.push({ id: 'blq_' + bid + '_' + i, groupId: grp[0].grupo_horario,
            subjectId: grp[0].materia_id,
            subjectName: grp.map(function (x) { return x.materia_nombre; }).join(' + '),
            teacherIds: tIds, cognitiveLoad: grp[0].carga_cognitiva || 'media',
            dynamicType: grp[0].tipo_dinamica || 'estatica', isOptative: true,
            bloque_interdisciplinar_id: bid, materia_color: grp[0].materia_color || '#1a56db' });
        }
      } else {
        for (var j = 0; j < n.horas_semanales; j++) {
          blocks.push({ id: n.id + '_' + j, groupId: n.grupo_horario,
            subjectId: n.materia_id, subjectName: n.materia_nombre,
            teacherIds: n.profesor_id ? [n.profesor_id] : [],
            cognitiveLoad: n.carga_cognitiva || 'media',
            dynamicType: n.tipo_dinamica || 'estatica', isOptative: false,
            bloque_interdisciplinar_id: null, materia_color: n.materia_color || '#1a56db' });
        }
      }
    });

    return { groups: groups, teachers: teachers, blocks: blocks, numTramos: numT, timeout: 25000 };
  }

  /* ── Panel de progreso en tiempo real ── */
  function _renderProgresoPanel() {
    var el = document.getElementById('pt-tablero');
    if (!el) return;
    _s.plannerProgress = {
      A: { pct: 0, label: 'Iniciando…', log: [] },
      B: { pct: 0, label: 'Iniciando…', log: [] },
      C: { pct: 0, label: 'Iniciando…', log: [] }
    };

    var cards = DidactIAPlanner.VARIANTS.map(function (v) {
      return '<div style="padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--paper-2)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-size:13px;font-weight:600;color:var(--txt)">' + _esc(v.id) + ' — ' + _esc(v.label) + '</span>' +
          '<span id="prog-pct-' + v.id + '" style="font-size:12px;color:var(--muted)">0%</span>' +
        '</div>' +
        '<div style="height:5px;background:var(--line);border-radius:3px;overflow:hidden;margin-bottom:6px">' +
          '<div id="prog-bar-' + v.id + '" style="height:5px;width:0%;background:var(--accent);border-radius:3px;transition:width .25s"></div>' +
        '</div>' +
        '<div id="prog-lbl-' + v.id + '" style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          'Iniciando…</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="planner-section-hdr"><div>' +
        '<div class="card-eyebrow">Motor H-MRV-SA</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Generando horario…</h3>' +
      '</div></div>' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">' +
        '3 variantes Pareto ejecutándose en paralelo (Equidad · Neuroeducativa · Mínimo cambio)' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">' + cards + '</div>' +
      '<div id="prog-log" style="border:1px solid var(--line);border-radius:8px;padding:9px 12px;' +
        'font-size:11px;font-family:monospace;color:var(--muted);min-height:44px;' +
        'background:var(--paper-2);white-space:pre-line">Esperando log…</div>' +
      '<div id="prog-errors"></div>';
  }

  function _updateProgresoPanel(variantId, msg) {
    var p = _s.plannerProgress && _s.plannerProgress[variantId];
    if (!p) return;

    if (msg.type === 'error') {
      var errBox = document.getElementById('prog-errors');
      if (errBox) {
        errBox.innerHTML +=
          '<div style="margin-top:8px;padding:10px 14px;background:var(--danger-soft);' +
          'border-left:3px solid var(--danger);border-radius:6px;font-size:12px">' +
          '<strong>⚠ ' + _esc(variantId) + ':</strong> ' + _esc(msg.message || '') +
          (msg.suggestion ? '<br><span style="color:var(--info)">→ ' + _esc(msg.suggestion) + '</span>' : '') +
          '</div>';
      }
      return;
    }

    if (msg.phase === 1 && msg.total) {
      p.pct   = Math.round((msg.assigned / msg.total) * 50);
      p.label = 'Construyendo base… (' + msg.assigned + '/' + msg.total + ')';
    } else if (msg.phase === 2 && msg.T !== undefined) {
      p.pct   = 50 + Math.round((1 - Math.min(msg.T, 1000) / 1000) * 48);
      p.label = 'SA T=' + msg.T + '  coste=' + (msg.cost || '?');
    } else if (msg.phase === 3) {
      p.pct   = 98;
      p.label = msg.label || 'Finalizando…';
    }

    var bar = document.getElementById('prog-bar-' + variantId);
    var pct = document.getElementById('prog-pct-' + variantId);
    var lbl = document.getElementById('prog-lbl-' + variantId);
    if (bar) bar.style.width = p.pct + '%';
    if (pct) pct.textContent = p.pct + '%';
    if (lbl) lbl.textContent = p.label;

    p.log.push(variantId + ': ' + p.label);
    if (p.log.length > 2) p.log.shift();

    var allLog = [];
    var prog = _s.plannerProgress;
    ['A', 'B', 'C'].forEach(function (v) { if (prog[v]) allLog = allLog.concat(prog[v].log); });
    var logEl = document.getElementById('prog-log');
    if (logEl) logEl.textContent = allLog.slice(-3).join('\n');
  }

  /* ── Cards de selección de variante ── */
  function _renderVariantCards(results) {
    var el = document.getElementById('pt-tablero');
    if (!el) return;
    _s.plannerVariantResults = results;

    var DESCS = {
      A: 'Optimiza la equidad del profesorado minimizando huecos y distribuyendo la carga uniformemente.',
      B: 'Prioriza criterios neuroeducativos: evita carga alta consecutiva y en horario extremo.',
      C: 'Minimiza los cambios respecto al horario anterior, ideal para ajustes puntuales.'
    };

    var cards = DidactIAPlanner.VARIANTS.map(function (v) {
      var r = results[v.id];
      if (!r) return '<div style="flex:1;min-width:180px;padding:20px;border:1px solid var(--line);border-radius:10px;color:var(--muted);font-size:13px">Sin resultado</div>';
      var score   = r.score || 0;
      var scColor = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
      return '<div style="flex:1;min-width:180px;border:1px solid var(--line);border-radius:10px;overflow:hidden">' +
        '<div style="padding:12px 14px;background:var(--paper-2);border-bottom:1px solid var(--line)">' +
          '<div class="card-eyebrow">Variante ' + _esc(v.id) + '</div>' +
          '<div style="font-size:15px;font-weight:600;margin:2px 0 0">' + _esc(v.label) + '</div>' +
        '</div>' +
        '<div style="padding:14px">' +
          '<div style="font-size:36px;font-weight:700;color:' + scColor + ';font-family:var(--font-display);line-height:1">' + score + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-bottom:10px">/ 100 puntos neuroeducativos</div>' +
          '<div style="font-size:12px;color:var(--txt2);line-height:1.5;margin-bottom:12px">' + _esc(DESCS[v.id] || '') + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-bottom:12px">' + ((r.schedule || []).length) + ' sesiones generadas</div>' +
          '<button class="btn-ink" style="width:100%" onclick="plannerElegirVariante(\'' + _esc(v.id) + '\')">Usar esta variante</button>' +
        '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Generador H-MRV-SA</div>' +
          '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Elige una variante</h3>' +
        '</div>' +
        '<button onclick="plannerGenerar()" style="font-size:12px;padding:5px 14px;border:1px solid var(--line);' +
          'border-radius:6px;background:none;cursor:pointer;font-family:var(--font-ui);color:var(--muted)">&#x21ba; Regenerar</button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">' +
        'Tres optimizaciones distintas. Elige la que mejor encaje con la logística de tu centro.' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap">' + cards + '</div>';
  }

  /* ── Aplicar variante elegida al tablero ── */
  window.plannerElegirVariante = function (variantId) {
    var results = _s.plannerVariantResults;
    if (!results || !results[variantId]) return;
    var r      = results[variantId];
    var claseT = _claseTramos();
    var profNombre = {};
    _s.profesores.forEach(function (p) { profNombre[p.id] = p.nombre; });

    _s.schedule    = {};
    _s.auditLog    = {};
    _s.globalScore = {};

    (r.schedule || []).forEach(function (item) {
      var grupo    = item.groupId;
      var dia      = DIAS[item.dayIdx];
      var tramoObj = claseT[item.tramoIdx];
      if (!dia || !tramoObj) return;
      var key = String(tramoObj.numero);

      if (!_s.schedule[grupo]) {
        _s.schedule[grupo] = {};
        DIAS.forEach(function (d) { _s.schedule[grupo][d] = {}; });
      }
      var tIds    = item.teacherIds || [];
      var pNombre = tIds.map(function (tid) { return profNombre[tid] || tid; }).join(' + ');
      var slot    = {
        materia_id:        item.subjectId   || null,
        materia_nombre:    item.subjectName,
        materia_color:     item.materia_color || '#1a56db',
        profesor_id:       tIds[0]           || null,
        profesor_nombre:   pNombre,
        codocente_prof_ids: tIds,
        sin_asignar:       tIds.length === 0,
        puntuacion:        r.score,
        es_codoce:         tIds.length > 1,
        log_auditoria:     null,
        carga_cognitiva:   item.cognitiveLoad,
        tipo_dinamica:     item.dynamicType
      };
      _s.schedule[grupo][dia][key] = slot;
    });

    var gruposHorario = Object.keys(_s.schedule);
    gruposHorario.forEach(function (g) {
      _s.globalScore[g] = r.score;
      _s.auditLog[g]    = r.auditLog || [];
      _guardarHorarioGenerado(g, _s.schedule[g]);
    });

    if (!_s.currentGrupo && gruposHorario.length) _s.currentGrupo = gruposHorario[0];
    _s.plannerVariantResults = null;
    _showPTab('tablero');
  };

  /* ── Generar horario con H-MRV-SA ── */
  window.plannerGenerar = async function () {
    if (!_s.necesidades.length) {
      alert('Define necesidades lectivas primero (pestaña Necesidades).'); return;
    }
    var tieneHorario = Object.keys(_s.schedule).some(function (g) {
      return DIAS.some(function (d) { return Object.keys(_s.schedule[g][d] || {}).length > 0; });
    });
    if (tieneHorario && !confirm('Ya existe un horario generado. ¿Quieres generar uno nuevo y sobrescribirlo?')) return;
    await _loadData();
    var config = _buildPlannerConfig();
    if (!config.blocks.length) {
      alert('No hay bloques que generar. Revisa las necesidades lectivas.'); return;
    }
    _renderProgresoPanel();
    DidactIAPlanner.generateTimetable(config, {
      onProgress: function (vid, msg) { _updateProgresoPanel(vid, msg); },
      onComplete: function (results)  { _renderVariantCards(results); },
      onError:    function (vid, err) { _updateProgresoPanel(vid, { type: 'error', message: err }); }
    });
  };

  /* ── Generar SIN profesores (motor CSP, solo coloca materias) ── */
  window.plannerGenerarSinProf = async function () {
    if (!_s.necesidades.length) {
      alert('Define necesidades lectivas primero (pestaña Necesidades).'); return;
    }
    var tieneHorario = Object.keys(_s.schedule).some(function (g) {
      return DIAS.some(function (d) { return Object.keys(_s.schedule[g][d] || {}).length > 0; });
    });
    if (tieneHorario && !confirm('Ya existe un horario generado. ¿Quieres generar uno nuevo sin profesores y sobrescribirlo?')) return;

    var btn = document.getElementById('planner-gen-sinprof-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
    try {
      await _loadData();
      if (!_s.grupos.length) { alert('No hay grupos con necesidades lectivas.'); return; }

      _s.sinProf = true;
      _s.schedule = {};
      var fallidos = [];
      for (var gi = 0; gi < _s.grupos.length; gi++) {
        var g = _s.grupos[gi];
        if (btn) btn.textContent = 'Generando ' + (gi + 1) + '/' + _s.grupos.length + ' — ' + g + '…';
        await new Promise(function (r) { setTimeout(r, 0); }); // yield al navegador
        _s._cspNodes = 0;
        var res = _generarHorario(g);          // motor CSP backtracking, HC-3 omitido
        if (res) {
          _s.schedule[g] = res;
          _s.globalScore[g] = _calcGlobalScore(res);
        } else {
          fallidos.push(g);
          _s.schedule[g] = {};
          DIAS.forEach(function (d) { _s.schedule[g][d] = {}; });
        }
      }
      _s.sinProf = false;

      /* persistir en horario_generado para que el chat pueda asignar después */
      for (var i = 0; i < _s.grupos.length; i++) {
        await _guardarHorarioGenerado(_s.grupos[i], _s.schedule[_s.grupos[i]]);
      }

      _showPTab('tablero');
      if (fallidos.length) {
        var diagMsg = fallidos.map(function (g) {
          return g + ': ' + _diagnosticarFallo(g).join('; ');
        }).join('\n');
        _plannerToast('No se pudo generar: ' + fallidos.join(', ') + ' — usa 🔍 Verificar para detalles', 'warn');
        console.warn('[Planner] grupos fallidos:\n' + diagMsg);
      } else {
        _plannerToast('Horario generado sin profesores. Asigna los docentes en cada clase «Sin asignar».', 'ok');
      }
    } catch (e) {
      console.error('[Planner V2] generar sin profesores:', e);
      alert('Error al generar el horario sin profesores. Revisa la consola.');
    } finally {
      _s.sinProf = false;
      if (btn) { btn.disabled = false; btn.textContent = '🧩 Generar sin profesores'; }
    }
  };

  /* ── Asignar un profesor a un slot (memoria + horario_generado), validando conflictos ── */
  function _asignarProfesorSlot(grupo, dia, tramo, profId, profNombre) {
    var key = String(tramo);
    var slot = _s.schedule[grupo] && _s.schedule[grupo][dia] && _s.schedule[grupo][dia][key];
    if (!slot) return { ok: false, motivo: 'No hay ninguna clase en ese hueco.' };

    /* conflicto: el profesor ya da clase en ese día y tramo en otro grupo */
    var conflicto = null;
    Object.keys(_s.schedule).forEach(function (gg) {
      if (gg === grupo) return;
      var o = _s.schedule[gg] && _s.schedule[gg][dia] && _s.schedule[gg][dia][key];
      if (!o) return;
      if (_slotProfIds(o).indexOf(profId) !== -1) conflicto = gg;
    });
    if (conflicto) return { ok: false, motivo: profNombre + ' ya tiene clase con ' + conflicto + ' ese día y tramo.' };

    /* disponibilidad declarada */
    var set = _s.disponibilidad[profId];
    if (set && set.has(dia + '_' + key)) return { ok: false, motivo: profNombre + ' no está disponible ese día y tramo.' };

    slot.profesor_id        = profId;
    slot.profesor_nombre    = profNombre || _profNombre(profId);
    slot.codocente_prof_ids = [profId];
    slot.es_codoce          = false;
    slot.sin_asignar        = false;

    /* persistir el cambio en horario_generado (best-effort) */
    sb.from('horario_generado')
      .update({ profesor_id: profId })
      .eq('centro_id', ctrId).eq('grupo_horario', grupo)
      .eq('dia_semana', dia).eq('tramo_horario', parseInt(key, 10))
      .then(function (r) {
        if (r && r.error) console.warn('[Planner V2] no se pudo persistir asignación:', r.error.message);
      });

    return { ok: true };
  }

  /* ── Selector de profesor al hacer clic en un slot «Sin asignar» ── */
  window.plannerAbrirSelectorProfesor = function (dia, tramo, grupo) {
    if (!_s.profesores.length) { alert('No hay profesores en el centro.'); return; }
    var slot = _s.schedule[grupo] && _s.schedule[grupo][dia] && _s.schedule[grupo][dia][String(tramo)];
    if (!slot) return;

    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9200;display:flex;align-items:center;justify-content:center;padding:24px';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var opts = _s.profesores.map(function (p) {
      return '<option value="' + _esc(p.id) + '">' + _esc(p.nombre) + '</option>';
    }).join('');

    var modal = document.createElement('div');
    modal.style.cssText =
      'background:var(--paper);border-radius:12px;padding:22px;max-width:380px;width:100%;box-shadow:var(--sh-lg);display:flex;flex-direction:column;gap:14px';
    modal.innerHTML =
      '<div><div class="card-eyebrow">Asignar profesor</div>' +
      '<h3 style="font-family:var(--font-display);font-size:18px;font-weight:500;margin:4px 0 0">' +
        _esc(slot.materia_nombre) + ' · ' + _esc(grupo) + '</h3>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:2px">' + _esc(dia) + ', ' + _esc(_tramoLabel(parseInt(tramo, 10))) + '</div></div>' +
      '<select id="sel-prof-asignar" class="planner-select" style="width:100%">' + opts + '</select>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="btn-ghost" id="sel-prof-cancel">Cancelar</button>' +
        '<button class="btn-ink" id="sel-prof-ok">Asignar</button>' +
      '</div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#sel-prof-cancel').onclick = function () { overlay.remove(); };
    modal.querySelector('#sel-prof-ok').onclick = function () {
      var sel = modal.querySelector('#sel-prof-asignar');
      var profId = sel.value;
      var profNombre = sel.options[sel.selectedIndex].text;
      var res = _asignarProfesorSlot(grupo, dia, tramo, profId, profNombre);
      if (!res.ok) { _plannerToast('No se puede asignar: ' + res.motivo, 'error'); return; }
      overlay.remove();
      _renderTablero();
      _plannerToast(profNombre + ' asignado a ' + slot.materia_nombre + '.', 'ok');
    };
  };

  /* ── Guardar horario_generado en Supabase ── */
  async function _guardarHorarioGenerado(grupo, sched) {
    await sb.from('horario_generado').delete().eq('centro_id', ctrId).eq('grupo_horario', grupo);
    var rows = [];
    DIAS.forEach(function (dia) {
      Object.keys(sched[dia] || {}).forEach(function (t) {
        var slot = sched[dia][t];
        if (!slot) return;
        var tr = parseInt(t);
        rows.push({
          centro_id:     ctrId,
          grupo_horario: grupo,
          materia_id:    slot.materia_id,
          profesor_id:   slot.profesor_id,
          dia_semana:    dia,
          tramo_horario: tr,
          log_auditoria: slot.log_auditoria || null
        });
      });
    });
    if (rows.length) {
      var r = await sb.from('horario_generado').insert(rows);
      if (r.error) console.error('[Planner V2] error guardando horario_generado:', r.error.message);
    }
  }

  /* ════════════════════════════════
     DRAG & DROP
  ════════════════════════════════ */
  /* ── Persistencia de aparcados (localStorage por centro) ── */
  function _aparcadosKey() {
    return 'planner_aparcados_' + (typeof ctrId !== 'undefined' && ctrId ? ctrId : 'sin-centro');
  }
  function _loadAparcados() {
    try {
      var raw = localStorage.getItem(_aparcadosKey());
      var arr = raw ? JSON.parse(raw) : [];
      _s.aparcados = Array.isArray(arr) ? arr : [];
    } catch (e) { _s.aparcados = []; }
  }
  function _saveAparcados() {
    try { localStorage.setItem(_aparcadosKey(), JSON.stringify(_s.aparcados)); } catch (e) { /* quota / privado */ }
  }

  /* ── Toast ligero del planner ── */
  function _plannerToast(msg, tipo) {
    var bg = tipo === 'error' ? 'var(--danger)' : tipo === 'warn' ? 'var(--warning)' : 'var(--success)';
    var t = document.createElement('div');
    t.style.cssText =
      'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);' +
      'z-index:9500;background:' + bg + ';color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;' +
      'font-family:var(--font-ui);box-shadow:var(--sh-lg);max-width:90vw;text-align:center;line-height:1.35';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2700);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3150);
  }

  function _flashCellError(cell) {
    if (!cell) return;
    /* diferido para que se vea tras el barrido de clases que hace plannerDragEnd */
    setTimeout(function () {
      cell.classList.add('drag-error');
      setTimeout(function () { if (cell) cell.classList.remove('drag-error'); }, 650);
    }, 0);
  }

  function _ensureSched(grupo) {
    if (!_s.schedule[grupo]) _s.schedule[grupo] = {};
    DIAS.forEach(function (d) { if (!_s.schedule[grupo][d]) _s.schedule[grupo][d] = {}; });
  }

  function _slotProfIds(slot) {
    return slot.codocente_prof_ids && slot.codocente_prof_ids.length
      ? slot.codocente_prof_ids
      : (slot.profesor_id ? [slot.profesor_id] : []);
  }

  /* ── Validación de hard constraints (misma lógica que mover_clase) ── */
  /* Valida el estado actual de un día concreto de un grupo (tras una mutación tentativa). */
  function _validarDiaGrupo(grupo, dia) {
    var TNUMS = _tramoNums();
    var sched = _s.schedule[grupo] || {};
    var vistas = {}, occ = [];
    for (var i = 0; i < TNUMS.length; i++) {
      var s = sched[dia] && sched[dia][String(TNUMS[i])];
      if (!s) continue;
      occ.push(TNUMS[i]);
      /* HC-MATERIA-DIA */
      if (vistas[s.materia_id]) {
        return { ok: false, motivo: (s.materia_nombre || 'Esa materia') + ' quedaría dos veces el mismo día.' };
      }
      vistas[s.materia_id] = true;
    }
    /* HC-VENTANA */
    if (occ.length > 8) return { ok: false, motivo: 'El grupo superaría 8 tramos lectivos ese día.' };
    /* HC-INICIO-FIN: sin huecos en mitad de la jornada */
    if (occ.length > 1) {
      var idxs = occ.map(function (t) { return TNUMS.indexOf(t); });
      var mn = Math.min.apply(null, idxs), mx = Math.max.apply(null, idxs);
      if (mx - mn + 1 !== idxs.length) return { ok: false, motivo: 'Quedaría un hueco libre en mitad de la jornada.' };
    }
    return { ok: true };
  }

  /* Valida que el slot ahora situado en (grupo,dia,tramo) no choque con otros grupos ni disponibilidad. */
  function _validarProfesorGlobal(grupo, dia, tramo) {
    var slot = _s.schedule[grupo] && _s.schedule[grupo][dia] && _s.schedule[grupo][dia][String(tramo)];
    if (!slot) return { ok: true };
    var profIds = _slotProfIds(slot);
    var bad = null;
    Object.keys(_s.schedule).forEach(function (gg) {
      if (gg === grupo) return;
      var o = _s.schedule[gg] && _s.schedule[gg][dia] && _s.schedule[gg][dia][String(tramo)];
      if (!o) return;
      var oids = _slotProfIds(o);
      if (profIds.some(function (id) { return oids.indexOf(id) !== -1; })) bad = gg;
    });
    if (bad) return { ok: false, motivo: 'Un profesor ya da clase a ' + bad + ' ese día y tramo.' };
    for (var p = 0; p < profIds.length; p++) {
      var set = _s.disponibilidad[profIds[p]];
      if (set && set.has(dia + '_' + tramo)) return { ok: false, motivo: 'El profesor no está disponible ese día y tramo.' };
    }
    return { ok: true };
  }

  /* Núcleo simular-validar-revertir. dryRun=true revierte siempre (para feedback en hover). */
  function _ejecutarDrop(grupo, tgtDia, tgtTramo, dryRun) {
    var d = _s.dragData;
    if (!d || d.from === 'profesor') return { ok: false };
    var key = String(tgtTramo);
    _ensureSched(grupo);

    var fromAparcado = d.from === 'aparcado';
    var srcSlot, srcGrupo = null, srcDia = null, srcTramo = null;

    if (fromAparcado) {
      var ap = _s.aparcados[d.idx];
      if (!ap) return { ok: false };
      if (ap.grupo !== grupo) {
        return { ok: false, motivo: 'Esta clase es del grupo ' + ap.grupo + '. Cámbiate a ese grupo para colocarla.' };
      }
      srcSlot = ap.slot;
    } else {
      srcGrupo = d.grupo; srcDia = d.dia; srcTramo = d.tramo;
      if (srcGrupo === grupo && srcDia === tgtDia && srcTramo === key) return { ok: true, noop: true };
      srcSlot = _s.schedule[srcGrupo] && _s.schedule[srcGrupo][srcDia] && _s.schedule[srcGrupo][srcDia][srcTramo];
      if (!srcSlot) return { ok: false };
    }

    var tgtSlot = (_s.schedule[grupo][tgtDia] && _s.schedule[grupo][tgtDia][key]) || null;
    var isSwap = !!tgtSlot;
    if (isSwap && fromAparcado) {
      return { ok: false, motivo: 'Ese hueco está ocupado. Suelta la clase en un slot libre.' };
    }

    /* ── mutación tentativa ── */
    if (fromAparcado) {
      _s.schedule[grupo][tgtDia][key] = srcSlot;
    } else if (isSwap) {
      _s.schedule[grupo][tgtDia][key] = srcSlot;
      _s.schedule[srcGrupo][srcDia][srcTramo] = tgtSlot;
    } else {
      _s.schedule[grupo][tgtDia][key] = srcSlot;
      delete _s.schedule[srcGrupo][srcDia][srcTramo];
    }

    /* ── validación de los días/posiciones afectados ── */
    var checks = [_validarDiaGrupo(grupo, tgtDia), _validarProfesorGlobal(grupo, tgtDia, key)];
    if (!fromAparcado) {
      checks.push(_validarDiaGrupo(srcGrupo, srcDia)); /* el día de origen no debe quedar con huecos */
      if (isSwap) checks.push(_validarProfesorGlobal(srcGrupo, srcDia, srcTramo));
    }
    var bad = null;
    for (var c = 0; c < checks.length; c++) { if (!checks[c].ok) { bad = checks[c]; break; } }

    if (bad || dryRun) {
      /* ── revertir ── */
      if (fromAparcado) {
        delete _s.schedule[grupo][tgtDia][key];
      } else if (isSwap) {
        _s.schedule[grupo][tgtDia][key] = tgtSlot;
        _s.schedule[srcGrupo][srcDia][srcTramo] = srcSlot;
      } else {
        delete _s.schedule[grupo][tgtDia][key];
        _s.schedule[srcGrupo][srcDia][srcTramo] = srcSlot;
      }
      return bad ? { ok: false, motivo: bad.motivo } : { ok: true };
    }

    /* ── commit ── */
    if (fromAparcado) {
      _s.aparcados.splice(d.idx, 1);
      _saveAparcados();
    }
    return { ok: true, committed: true };
  }

  window.plannerDragStart = function (e, el) {
    _s.dragData = { from: 'tablero', dia: el.dataset.dia, tramo: el.dataset.tramo, grupo: el.dataset.grupo };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(function () { if (el) el.style.opacity = '0.4'; }, 0);
  };

  window.plannerDragStartAparcado = function (e, el) {
    _s.dragData = { from: 'aparcado', idx: parseInt(el.dataset.idx, 10) };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(function () { if (el) el.style.opacity = '0.4'; }, 0);
  };

  window.plannerDragStartProfesor = function (e, el) {
    _s.dragData = { from: 'profesor', profId: el.dataset.profId, profNombre: el.dataset.profNombre };
    e.dataTransfer.effectAllowed = 'copy';
    setTimeout(function () { if (el) el.style.opacity = '0.4'; }, 0);
  };

  window.plannerDragEnd = function () {
    document.querySelectorAll('.class-card').forEach(function (c) { c.style.opacity = ''; });
    document.querySelectorAll('.prof-chip').forEach(function (c) { c.style.opacity = ''; });
    document.querySelectorAll('.planner-cell').forEach(function (c) {
      c.classList.remove('drag-over', 'drag-error');
    });
    var pool = document.getElementById('planner-pool');
    if (pool) pool.classList.remove('drag-over');
  };

  window.plannerDragOver = function (e) {
    e.preventDefault();
    var cell = e.currentTarget;
    if (cell.classList.contains('planner-cell')) {
      var d = _s.dragData;
      /* arrastrando un profesor: solo es válido sobre una clase "sin asignar" */
      if (d && d.from === 'profesor') {
        var sl = _s.schedule[_s.currentGrupo] && _s.schedule[_s.currentGrupo][cell.dataset.dia] &&
                 _s.schedule[_s.currentGrupo][cell.dataset.dia][cell.dataset.tramo];
        var okProf = !!sl && _slotSinProfesor(sl);
        cell.classList.toggle('drag-over', okProf);
        cell.classList.toggle('drag-error', !okProf);
        return;
      }
      var res = _ejecutarDrop(_s.currentGrupo, cell.dataset.dia, cell.dataset.tramo, true);
      if (res.noop) { cell.classList.remove('drag-over', 'drag-error'); return; }
      cell.classList.toggle('drag-over', !!res.ok);
      cell.classList.toggle('drag-error', !res.ok);
    } else {
      cell.classList.add('drag-over');
    }
  };

  window.plannerDragLeave = function (e) {
    e.currentTarget.classList.remove('drag-over', 'drag-error');
  };

  window.plannerDrop = function (e, grupo) {
    e.preventDefault();
    var cell = e.currentTarget;
    cell.classList.remove('drag-over', 'drag-error');
    var d = _s.dragData;
    if (!d) return;

    /* ── soltar un profesor sobre una clase "sin asignar" ── */
    if (d.from === 'profesor') {
      _s.dragData = null;
      var dia = cell.dataset.dia, tramo = cell.dataset.tramo;
      var slot = _s.schedule[grupo] && _s.schedule[grupo][dia] && _s.schedule[grupo][dia][tramo];
      if (!slot) { _flashCellError(cell); return; }
      if (!_slotSinProfesor(slot)) {
        _plannerToast('Esa clase ya tiene profesor. Quítalo antes o usa otra.', 'warn');
        _flashCellError(cell); return;
      }
      var resP = _asignarProfesorSlot(grupo, dia, tramo, d.profId, d.profNombre);
      if (!resP.ok) { _plannerToast('No se puede asignar: ' + resP.motivo, 'error'); _flashCellError(cell); return; }
      _renderTablero();
      _plannerToast(d.profNombre + ' asignado a ' + slot.materia_nombre + '.', 'ok');
      return;
    }

    var srcGrupo = (d.from === 'tablero' && d.grupo !== grupo) ? d.grupo : null;
    var res = _ejecutarDrop(grupo, cell.dataset.dia, cell.dataset.tramo, false);
    _s.dragData = null;

    if (res.noop) return;
    if (!res.ok) {
      if (res.motivo) _plannerToast('No se puede colocar: ' + res.motivo, 'error');
      _flashCellError(cell);
      return;
    }
    _renderTablero();
    _guardarHorarioGenerado(grupo, _s.schedule[grupo]);
    if (srcGrupo) _guardarHorarioGenerado(srcGrupo, _s.schedule[srcGrupo]);
  };

  /* Soltar sobre la zona "Aparcados" → retirar la clase del horario (sin eliminarla) */
  window.plannerDropPool = function (e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    var d = _s.dragData;
    _s.dragData = null;
    if (!d || d.from === 'aparcado' || d.from === 'profesor') return; /* solo se aparcan clases del tablero */

    var slot = _s.schedule[d.grupo] && _s.schedule[d.grupo][d.dia] && _s.schedule[d.grupo][d.dia][d.tramo];
    if (!slot) return;

    var parkedGrupo = d.grupo;
    delete _s.schedule[d.grupo][d.dia][d.tramo];
    _s.aparcados.push({ grupo: d.grupo, slot: slot });
    _saveAparcados();
    _guardarHorarioGenerado(parkedGrupo, _s.schedule[parkedGrupo]);
    _renderTablero();
    _plannerToast('Clase aparcada. Arrástrala a un hueco para recolocarla.', 'ok');
  };

  /* Eliminar definitivamente una clase aparcada */
  window.plannerDescartarAparcado = function (i) {
    if (i < 0 || i >= _s.aparcados.length) return;
    var a = _s.aparcados[i];
    var nom = (a && a.slot && a.slot.materia_nombre) ? a.slot.materia_nombre : 'esta clase';
    if (!confirm('¿Eliminar definitivamente "' + nom + '" de ' + ((a && a.grupo) || '') + '? No se podrá recuperar.')) return;
    _s.aparcados.splice(i, 1);
    _saveAparcados();
    _renderTablero();
  };

  /* ════════════════════════════════
     PUBLICAR — escribir en horarios_grupo
  ════════════════════════════════ */
  function _renderPublicar() {
    var el = document.getElementById('pt-publicar');
    if (!el) return;
    var grupos = Object.keys(_s.schedule);
    var total  = grupos.reduce(function (acc, g) {
      return acc + DIAS.reduce(function (a, d) {
        return a + Object.keys(_s.schedule[g] && _s.schedule[g][d] || {}).length;
      }, 0);
    }, 0);
    var avgScore = grupos.length
      ? Math.round(grupos.reduce(function (s, g) { return s + (_s.globalScore[g] || 0); }, 0) / grupos.length)
      : null;

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Paso final</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Publicar horario</h3></div>' +
      '</div>' +
      '<div class="planner-publish-summary">' +
        '<div class="planner-stat-row">' +
          '<div class="planner-stat"><div class="planner-stat-n">' + grupos.length + '</div><div class="planner-stat-l">Grupos</div></div>' +
          '<div class="planner-stat"><div class="planner-stat-n">' + total + '</div><div class="planner-stat-l">Sesiones</div></div>' +
          '<div class="planner-stat"><div class="planner-stat-n">' + _s.necesidades.length + '</div><div class="planner-stat-l">Necesidades</div></div>' +
          (avgScore !== null
            ? '<div class="planner-stat"><div class="planner-stat-n">' + avgScore + '</div><div class="planner-stat-l">Score IA</div></div>'
            : '') +
        '</div>' +
        '<div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<label style="font-size:13px;font-weight:500;">Curso escolar:</label>' +
          '<select id="planner-curso-escolar" style="font-size:13px;padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:var(--paper);">' +
            '<option value="2025-26">2025-26 (actual)</option>' +
            '<option value="2026-27" selected>2026-27 (próximo)</option>' +
          '</select>' +
        '</div>' +
        '<div id="planner-pub-aviso-curso" style="display:none;background:#fde8e8;color:#b71c1c;border-radius:6px;padding:8px 12px;font-size:13px;margin-bottom:12px;">' +
          '⚠️ Estás publicando sobre el curso activo. Los cambios afectarán al chat y las sustituciones inmediatamente.' +
        '</div>' +
        (function () {
          if (!_s.necesidades.length || !total) return '';
          var cob = _calcCobertura();
          if (cob.okItems === cob.totalItems) {
            return '<div style="background:var(--success-soft);border-left:4px solid var(--success);border-radius:8px;padding:10px 16px;margin-bottom:12px;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
              '<span>✅ <strong>' + cob.okItems + '/' + cob.totalItems + ' necesidades cubiertas al 100%.</strong> El horario está completo.</span>' +
            '</div>';
          }
          var faltantes = cob.totalItems - cob.okItems;
          return '<div style="background:var(--warning-soft);border-left:4px solid var(--warning);border-radius:8px;padding:10px 16px;margin-bottom:12px;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
            '<span>⚠️ <strong>' + cob.okItems + '/' + cob.totalItems + ' necesidades cubiertas</strong> — ' + faltantes + ' sin completar. Puedes publicar igualmente.</span>' +
            '<button onclick="plannerCobertura()" style="flex-shrink:0;font-size:12px;font-weight:600;padding:4px 12px;border-radius:6px;border:1px solid var(--warning);background:var(--paper);cursor:pointer;color:var(--warning)">Ver detalles →</button>' +
          '</div>';
        }()) +
        '<div class="planner-warning">' +
          '<strong>⚠ Atención:</strong> Publicar reemplazará los registros actuales en ' +
          '<code>horarios_grupo</code> para el curso y grupos generados. ' +
          'El chatbot y el resto de módulos usarán el nuevo horario inmediatamente.' +
        '</div>' +
        (total === 0
          ? '<div class="planner-empty">Ve al Tablero, selecciona un grupo y pulsa "✨ Generar con IA".</div>'
          : '<button class="btn-ink btn-danger" id="planner-pub-btn" onclick="plannerPublicar()">Publicar horario en el centro</button>') +
        '<div id="planner-pub-msg" style="margin-top:14px;font-size:14px"></div>' +
      '</div>';
  }

  window.plannerPublicar = function () {
    // 1. Leer curso a publicar desde el selector (fallback '2026-27')
    var selCurso = document.getElementById('planner-curso-escolar');
    var cursoAPublicar = selCurso ? selCurso.value : '2026-27';

    // Avisar si se publica sobre el curso activo
    var avisoCursoEl = document.getElementById('planner-pub-aviso-curso');
    if (avisoCursoEl) {
      var esActivo = (typeof cursoActivo !== 'undefined') && cursoAPublicar === cursoActivo;
      avisoCursoEl.style.display = esActivo ? '' : 'none';
    }

    var avisoAparcados = _s.aparcados.length
      ? '\n\n⚠ Tienes ' + _s.aparcados.length + ' clase' + (_s.aparcados.length === 1 ? '' : 's') +
        ' aparcada' + (_s.aparcados.length === 1 ? '' : 's') + ' sin asignar que NO se publicarán.'
      : '';
    if (!confirm('¿Publicar curso ' + cursoAPublicar + '? Se sobreescribirán los horarios_grupo de los grupos generados para ese curso.' + avisoAparcados)) return;
    var btn = document.getElementById('planner-pub-btn');
    var msg = document.getElementById('planner-pub-msg');
    if (btn) { btn.disabled = true; btn.textContent = 'Publicando…'; }

    var rows = [];
    Object.keys(_s.schedule).forEach(function (grupo) {
      DIAS.forEach(function (dia) {
        Object.keys(_s.schedule[grupo] && _s.schedule[grupo][dia] || {}).forEach(function (t) {
          var slot = _s.schedule[grupo][dia][t];
          if (!slot) return;
          var tr = parseInt(t);
          rows.push({
            centro_id:        ctrId,
            grupo_horario:    grupo,
            curso_escolar:    cursoAPublicar,
            dia:              dia,
            tramo:            tr,
            hora_inicio:      _horaInicio(tr),
            hora_fin:         _horaFin(tr),
            actividad_nombre: slot.materia_nombre,
            profesor_nombre:  slot.profesor_nombre,
            aula:             ''
          });
        });
      });
    });

    var grupos = [...new Set(rows.map(function (r) { return r.grupo_horario; }))];
    console.log('[PUBLICAR] curso:', cursoAPublicar, '| filas:', rows.length, '| grupos:', grupos);

    (async function () {
      try {
        // DELETE filtrado por centro_id Y curso_escolar — nunca toca otros cursos
        for (var i = 0; i < grupos.length; i++) {
          await sb.from('horarios_grupo').delete()
            .eq('centro_id', ctrId)
            .eq('curso_escolar', cursoAPublicar)
            .eq('grupo_horario', grupos[i]);
        }
        if (rows.length) {
          var r = await sb.from('horarios_grupo').insert(rows);
          if (r.error) { console.error('[PUBLICAR] error Supabase:', JSON.stringify(r.error, null, 2)); throw r.error; }
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar horario en el centro'; }
        if (msg) msg.innerHTML =
          '<span style="color:var(--success)">✓ Horario publicado (' + cursoAPublicar + ') — ' + rows.length + ' sesiones en ' + grupos.length + ' grupos.</span>';
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar horario en el centro'; }
        if (msg) msg.innerHTML =
          '<span style="color:var(--danger)">Error al publicar: ' + _esc(err && err.message ? err.message : String(err)) + '</span>';
      }
    })();
  };

  /* ════════════════════════════════
     DICTAR — Entrada voz/texto/audio → IA → Planner
  ════════════════════════════════ */
  function _renderDictar() {
    var el = document.getElementById('pt-dictar');
    if (!el) return;

    var hayResultado = !!_s.dictarResultado;

    var micBtn =
      '<button id="dictar-mic-btn" onclick="plannerDictarToggleVoz()" ' +
      'style="padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:' +
      (_s.dictarRecognizing ? 'var(--danger-soft)' : 'var(--paper-2)') +
      ';cursor:pointer;font-family:var(--font-ui);font-size:13px;display:flex;align-items:center;gap:6px">' +
      (_s.dictarRecognizing
        ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--danger);display:inline-block"></span> Detener'
        : '🎙️ Dictar por voz') +
      '</button>';

    var resultHtml = '';
    if (hayResultado) {
      var r = _s.dictarResultado;

      var matRows = (r.materias || []).map(function (m, i) {
        var key = 'mat_' + i;
        var checked = _s.dictarConfirmados[key] !== false;
        return '<div class="planner-list-row" style="gap:10px">' +
          '<input type="checkbox" id="dc-' + key + '"' + (checked ? ' checked' : '') +
          ' onchange="plannerDictarToggle(\'' + key + '\')" style="accent-color:var(--accent)">' +
          '<label for="dc-' + key + '" style="flex:1;cursor:pointer">' +
          '<strong>' + _esc(m.nombre) + '</strong>' +
          ' <span style="font-size:11px;color:var(--muted)">' + _esc(m.horas_semanales || '') + 'h/sem · ' +
          _esc(m.carga_cognitiva || 'media') + ' · ' + _esc(m.tipo_dinamica || 'estatica') + '</span>' +
          (m.es_optativa ? ' <span style="font-size:10px;color:var(--info);background:var(--info-soft);padding:1px 5px;border-radius:4px">optativa</span>' : '') +
          '</label></div>';
      }).join('');

      var necRows = (r.necesidades || []).map(function (n, i) {
        var key = 'nec_' + i;
        var checked = _s.dictarConfirmados[key] !== false;
        return '<div class="planner-list-row" style="gap:10px">' +
          '<input type="checkbox" id="dc-' + key + '"' + (checked ? ' checked' : '') +
          ' onchange="plannerDictarToggle(\'' + key + '\')" style="accent-color:var(--accent)">' +
          '<label for="dc-' + key + '" style="flex:1;cursor:pointer">' +
          '<strong>' + _esc(n.grupo) + '</strong> — ' + _esc(n.materia) + ' con ' + _esc(n.profesor) +
          ' <span style="font-size:11px;color:var(--muted)">(' + _esc(n.horas) + 'h)</span>' +
          '</label></div>';
      }).join('');

      var restrRows = (r.restricciones_profesor || []).map(function (rp, i) {
        var key = 'rp_' + i;
        var checked = _s.dictarConfirmados[key] !== false;
        return '<div class="planner-list-row" style="gap:10px">' +
          '<input type="checkbox" id="dc-' + key + '"' + (checked ? ' checked' : '') +
          ' onchange="plannerDictarToggle(\'' + key + '\')" style="accent-color:var(--accent)">' +
          '<label for="dc-' + key + '" style="flex:1;cursor:pointer">' +
          _esc(rp.profesor) + ': <em>' + _esc(rp.tipo) + '</em>' +
          (rp.detalle ? ' — ' + _esc(rp.detalle) : '') +
          '</label></div>';
      }).join('');

      var preguntas = r.preguntas || [];
      var pregHtml = preguntas.length
        ? '<div style="margin-top:14px;padding:12px;background:var(--warning-soft);border-left:3px solid var(--warning);border-radius:6px">' +
          '<div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:6px">Preguntas de la IA:</div>' +
          preguntas.map(function (p) {
            return '<div style="font-size:13px;color:var(--txt);margin-bottom:4px">• ' + _esc(p) + '</div>';
          }).join('') + '</div>'
        : '';

      resultHtml =
        '<div style="margin-top:20px;border:1px solid var(--line);border-radius:10px;overflow:hidden">' +
        '<div style="background:var(--paper-2);padding:12px 16px;border-bottom:1px solid var(--line);' +
        'display:flex;align-items:center;justify-content:space-between">' +
          '<span style="font-size:14px;font-weight:600;color:var(--txt)">Resultado del análisis IA</span>' +
          '<div style="display:flex;gap:8px">' +
            '<button onclick="plannerDictarRefinir()" style="font-size:12px;padding:4px 10px;border:1px solid var(--line);' +
            'border-radius:6px;background:none;cursor:pointer;color:var(--muted);font-family:var(--font-ui)">✏️ Refinar</button>' +
            '<button class="btn-ink" onclick="plannerDictarAplicar()">✓ Aplicar al Planner</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:16px;display:flex;flex-direction:column;gap:16px">' +
        (matRows ? '<div><div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Materias detectadas</div>' + matRows + '</div>' : '') +
        (necRows ? '<div><div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Necesidades lectivas</div>' + necRows + '</div>' : '') +
        (restrRows ? '<div><div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Restricciones de profesores</div>' + restrRows + '</div>' : '') +
        pregHtml +
        '</div></div>';
    }

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Entrada inteligente</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Dictar restricciones al Planner</h3></div>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.5">' +
        'Describe las necesidades horarias del centro en lenguaje natural, por voz o por texto. ' +
        'La IA extraerá materias, necesidades lectivas y restricciones de profesores.' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">' +
        micBtn +
        '<label style="padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:var(--paper-2);' +
        'cursor:pointer;font-size:13px;font-family:var(--font-ui);display:flex;align-items:center;gap:6px">' +
          '📎 Subir audio' +
          '<input type="file" accept="audio/*" style="display:none" onchange="plannerDictarSubirAudio(this)">' +
        '</label>' +
        '<div id="dictar-audio-badge" style="font-size:12px;color:var(--success)"></div>' +
      '</div>' +
      '<textarea id="dictar-texto" class="planner-input"' +
      ' placeholder="Escribe o dicta aquí. Ej: María García no puede dar clase la primera hora. Matemáticas 2ESOA 4h con Juan Pérez…"' +
      ' style="width:100%;min-height:110px;resize:vertical;font-family:var(--font-ui);font-size:13px;' +
      'line-height:1.55;padding:10px 12px;box-sizing:border-box;margin-top:4px"></textarea>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap">' +
        '<button class="btn-ink" id="dictar-analizar-btn" onclick="plannerDictarAnalizar()">✨ Analizar con IA</button>' +
        '<div id="dictar-status" style="font-size:13px;color:var(--muted)"></div>' +
      '</div>' +
      resultHtml;
  }

  window.plannerDictarToggleVoz = function () {
    var SpeechRecog = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecog) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.'); return;
    }
    if (_s.dictarRecognizing && _s.dictarRecognition) {
      _s.dictarRecognition.stop(); return;
    }
    var recog = new SpeechRecog();
    recog.lang           = 'es-ES';
    recog.continuous     = true;
    recog.interimResults = true;
    _s.dictarRecognition = recog;
    var base = (document.getElementById('dictar-texto') && document.getElementById('dictar-texto').value) || '';

    recog.onstart = function () {
      _s.dictarRecognizing = true;
      _renderDictar();
    };
    recog.onresult = function (e) {
      var interim = '', final_ = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final_ += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final_) base += (base ? ' ' : '') + final_;
      var el = document.getElementById('dictar-texto');
      if (el) el.value = base + (interim ? ' ' + interim : '');
    };
    recog.onerror = function (e) {
      console.error('[Dictar] voz error:', e.error);
      _s.dictarRecognizing = false; _s.dictarRecognition = null;
      _renderDictar();
    };
    recog.onend = function () {
      _s.dictarRecognizing = false; _s.dictarRecognition = null;
      _renderDictar();
    };
    recog.start();
  };

  window.plannerDictarSubirAudio = function (input) {
    if (!input.files || !input.files[0]) return;
    var file  = input.files[0];
    var badge = document.getElementById('dictar-audio-badge');
    if (badge) badge.textContent = '⏳ Leyendo…';
    var reader = new FileReader();
    reader.onload = function (ev) {
      var parts = ev.target.result.split(',');
      _s.dictarAudioBase64 = parts[1];
      _s.dictarAudioMime   = file.type || 'audio/webm';
      if (badge) badge.textContent = '✓ ' + file.name;
    };
    reader.onerror = function () {
      if (badge) badge.textContent = '';
      alert('Error al leer el archivo de audio.');
    };
    reader.readAsDataURL(file);
  };

  window.plannerDictarToggle = function (key) {
    var cb = document.getElementById('dc-' + key);
    if (cb) _s.dictarConfirmados[key] = cb.checked;
  };

  window.plannerDictarAnalizar = function () {
    var texto = (document.getElementById('dictar-texto') && document.getElementById('dictar-texto').value || '').trim();
    if (!texto && !_s.dictarAudioBase64) {
      alert('Escribe un texto o adjunta un audio antes de analizar.'); return;
    }
    var btn    = document.getElementById('dictar-analizar-btn');
    var status = document.getElementById('dictar-status');
    if (btn)    { btn.disabled = true; btn.textContent = '⏳ Analizando…'; }
    if (status) status.textContent = '';

    var payload = { centro_id: ctrId };
    if (texto)                payload.texto        = texto;
    if (_s.dictarAudioBase64) payload.audio_base64 = _s.dictarAudioBase64;
    if (_s.dictarAudioMime)   payload.mime_type    = _s.dictarAudioMime;

    sb.functions.invoke('parse-restricciones', { body: payload })
      .then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = '✨ Analizar con IA'; }
        if (res.error) {
          if (status) status.innerHTML = '<span style="color:var(--danger)">Error: ' + _esc(String(res.error)) + '</span>';
          return;
        }
        var data = res.data;
        if (!data || data.error) {
          if (status) status.innerHTML = '<span style="color:var(--danger)">Error IA: ' + _esc(data && data.error ? data.error : 'Sin respuesta') + '</span>';
          return;
        }
        _s.dictarResultado   = data;
        _s.dictarConfirmados = {};
        _renderDictar();
        var st2 = document.getElementById('dictar-status');
        if (st2) st2.innerHTML =
          '<span style="color:var(--success)">✓ Análisis completado — ' +
          (data.materias || []).length + ' materias, ' +
          (data.necesidades || []).length + ' necesidades, ' +
          (data.restricciones_profesor || []).length + ' restricciones.</span>';
      })
      .catch(function (err) {
        if (btn)    { btn.disabled = false; btn.textContent = '✨ Analizar con IA'; }
        if (status) status.innerHTML = '<span style="color:var(--danger)">Error: ' + _esc(err && err.message ? err.message : String(err)) + '</span>';
      });
  };

  window.plannerDictarAplicar = async function () {
    if (!_s.dictarResultado) return;
    var r   = _s.dictarResultado;
    var btn = document.querySelector('#pt-dictar .btn-ink[onclick="plannerDictarAplicar()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Aplicando…'; }

    try {
      var bloqueMap = {};
      var matIdMap  = {};

      var confirmedMats = (r.materias || []).filter(function (m, i) {
        return _s.dictarConfirmados['mat_' + i] !== false;
      });

      for (var mi = 0; mi < confirmedMats.length; mi++) {
        var m = confirmedMats[mi];
        var existente = _s.materias.find(function (x) {
          return x.nombre.toLowerCase() === m.nombre.toLowerCase();
        });
        if (existente) {
          matIdMap[m.nombre] = existente.id;
        } else {
          var color = '#' + Math.floor(Math.random() * 0xAAAAAA + 0x555555).toString(16);
          var ins = await sb.from('materias').insert({
            centro_id:       ctrId,
            nombre:          m.nombre,
            color:           color,
            carga_cognitiva: m.carga_cognitiva || 'media',
            tipo_dinamica:   m.tipo_dinamica   || 'estatica'
          }).select('id').single();
          if (ins.error) throw ins.error;
          matIdMap[m.nombre] = ins.data.id;
        }
        if (m.es_optativa && m.grupo_optativas && !bloqueMap[m.grupo_optativas]) {
          bloqueMap[m.grupo_optativas] = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID() : String(Date.now() + mi);
        }
      }

      var confirmedNecs = (r.necesidades || []).filter(function (n, i) {
        return _s.dictarConfirmados['nec_' + i] !== false;
      });

      for (var ni = 0; ni < confirmedNecs.length; ni++) {
        var n = confirmedNecs[ni];
        var matId = matIdMap[n.materia];
        if (!matId) {
          var existMat = _s.materias.find(function (x) {
            return x.nombre.toLowerCase() === n.materia.toLowerCase();
          });
          if (existMat) matId = existMat.id;
        }
        if (!matId) continue;

        var profId = null;
        var profMatch = _s.profesores.find(function (p) {
          return p.nombre && p.nombre.toLowerCase().indexOf(n.profesor.toLowerCase()) !== -1;
        });
        if (profMatch) profId = profMatch.id;

        var bloqueId = null;
        var matEntry = (r.materias || []).find(function (x) {
          return x.nombre === n.materia && x.es_optativa && x.grupo_optativas;
        });
        if (matEntry && bloqueMap[matEntry.grupo_optativas]) {
          bloqueId = bloqueMap[matEntry.grupo_optativas];
        }

        var necIns = await sb.from('necesidades_lectivas').insert({
          centro_id:                  ctrId,
          grupo_horario:              n.grupo.toUpperCase(),
          materia_id:                 matId,
          profesor_id:                profId,
          horas_semanales:            n.horas || 1,
          bloque_interdisciplinar_id: bloqueId
        });
        if (necIns.error && necIns.error.code !== '23505') throw necIns.error;
      }

      var confirmedRestr = (r.restricciones_profesor || []).filter(function (rp, i) {
        return _s.dictarConfirmados['rp_' + i] !== false;
      });

      for (var ri = 0; ri < confirmedRestr.length; ri++) {
        var rp = confirmedRestr[ri];
        var rpProf = _s.profesores.find(function (p) {
          return p.nombre && p.nombre.toLowerCase().indexOf(rp.profesor.toLowerCase()) !== -1;
        });
        if (!rpProf) continue;

        var dias   = _parseDiasDetalle(rp.detalle);
        var trNums = _parseTramoDetalle(rp.tipo, rp.detalle);
        var tnums  = _tramoNums();

        if (rp.tipo === 'no_primera_hora') {
          trNums = [tnums[0]];
          if (!dias.length) dias = DIAS.slice();
        } else if (rp.tipo === 'no_ultima_hora') {
          trNums = [tnums[tnums.length - 1]];
          if (!dias.length) dias = DIAS.slice();
        } else {
          if (!dias.length) dias = DIAS.slice();
        }

        for (var di = 0; di < dias.length; di++) {
          for (var ti = 0; ti < trNums.length; ti++) {
            var dispIns = await sb.from('disponibilidad_profesor').upsert({
              profesor_id:   rpProf.id,
              dia_semana:    dias[di],
              tramo_horario: trNums[ti],
              estado:        'no_disponible'
            }, { onConflict: 'profesor_id,dia_semana,tramo_horario' });
            if (dispIns.error) console.warn('[Dictar] disponibilidad:', dispIns.error.message);
          }
        }
      }

      await _loadData();
      _s.dictarResultado   = null;
      _s.dictarConfirmados = {};
      _s.dictarAudioBase64 = null;
      _s.dictarAudioMime   = null;
      _showPTab('dictar');
      var st3 = document.getElementById('dictar-status');
      if (st3) st3.innerHTML = '<span style="color:var(--success)">✓ Datos aplicados correctamente al Planner.</span>';

    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Aplicar al Planner'; }
      alert('Error al aplicar: ' + (err && err.message ? err.message : String(err)));
    }
  };

  window.plannerDictarRefinir = function () {
    var prev = _s.dictarResultado;
    _s.dictarResultado   = null;
    _s.dictarConfirmados = {};
    _renderDictar();
    if (prev && prev.preguntas && prev.preguntas.length) {
      var el = document.getElementById('dictar-texto');
      if (el && el.value) {
        el.value += '\n\n[Aclaraciones pendientes]\n' + prev.preguntas.map(function (q) {
          return '- ' + q;
        }).join('\n');
      }
    }
  };

  function _parseDiasDetalle(detalle) {
    if (!detalle) return [];
    var txt  = detalle.toLowerCase();
    var dias = [];
    if (txt.indexOf('lunes')   !== -1) dias.push('lunes');
    if (txt.indexOf('martes')  !== -1) dias.push('martes');
    if (txt.indexOf('mi') !== -1 && (txt.indexOf('miérc') !== -1 || txt.indexOf('mierc') !== -1)) dias.push('miércoles');
    if (txt.indexOf('jueves')  !== -1) dias.push('jueves');
    if (txt.indexOf('viernes') !== -1) dias.push('viernes');
    return dias;
  }

  function _parseTramoDetalle(tipo, detalle) {
    if (!detalle) return [];
    var txt  = detalle.toLowerCase();
    var nums = [];
    var tnums = _tramoNums();
    var tramoMatches = txt.match(/tramo\s*(\d+)/gi) || [];
    tramoMatches.forEach(function (m) {
      var n = parseInt(m.replace(/\D/g, ''));
      if (tnums.indexOf(n) !== -1 && nums.indexOf(n) === -1) nums.push(n);
    });
    if (!nums.length) {
      var numMatches = txt.match(/\b([1-9]|10)\b/g) || [];
      numMatches.forEach(function (m) {
        var n = parseInt(m);
        if (tnums.indexOf(n) !== -1 && nums.indexOf(n) === -1) nums.push(n);
      });
    }
    return nums;
  }

  /* ════════════════════════════════
     H-MRV-SA MOTOR
     Fase 1 — Greedy MRV + LCV
     Fase 2 — Simulated Annealing (SWAP / RELOCATE)
     Fase 3 — 3 variantes Pareto (Web Workers paralelos)
  ════════════════════════════════ */

  const WORKER_LOGIC = `
'use strict';
class TimetableSolver {
  constructor(cfg) {
    this.groups    = cfg.groups;
    this.teachers  = cfg.teachers;
    this.blocks    = cfg.blocks;
    this.numTramos = cfg.numTramos || 8;
    this.timeout   = cfg.timeout  || 30000;
    this.weights   = cfg.weights;
    this.variantId = cfg.variantId;
    this.auditLog  = [];
    this.startTime = Date.now();
    this.finalCost = 0;
    this.schedule              = new Map();
    this.teacherOccupancy      = new Map();
    this.groupOccupancy        = new Map();
    this.subjectDayOccupancy   = new Map(); // key: groupId+'_'+subjectId → Map<dayIdx,count>
    this.maxPerDay             = new Map(); // key: groupId+'_'+subjectId → Math.ceil(total/5)
    this.previousSchedule = cfg.previousSchedule
      ? new Map(Object.entries(cfg.previousSchedule)) : new Map();
    this.groups.forEach(function(g) { this.groupOccupancy.set(g.id, new Set()); }.bind(this));
    this.teachers.forEach(function(t) {
      this.teacherOccupancy.set(t.id, new Set());
      t.unavailableSlots = new Set(t.unavailableSlots || []);
    }.bind(this));
    // Pre-compute maxPerDay: ceil(total_sesiones / 5) per (group, subject)
    var blockCounts = {};
    this.blocks.forEach(function(b) {
      var k = b.groupId + '_' + b.subjectId;
      blockCounts[k] = (blockCounts[k] || 0) + 1;
    });
    var self_ = this;
    Object.keys(blockCounts).forEach(function(k) {
      self_.maxPerDay.set(k, Math.ceil(blockCounts[k] / 5));
      self_.subjectDayOccupancy.set(k, new Map());
    });
  }

  getValidSlots(block) {
    var total = 5 * this.numTramos;
    var gOcc  = this.groupOccupancy.get(block.groupId) || new Set();
    var valid = [];
    for (var s = 0; s < total; s++) {
      if (gOcc.has(s)) continue;
      var conflict = false;
      for (var i = 0; i < block.teacherIds.length; i++) {
        var tid  = block.teacherIds[i];
        var tOcc = this.teacherOccupancy.get(tid);
        if (tOcc && tOcc.has(s)) { conflict = true; break; }
        var teacher = null;
        for (var j = 0; j < this.teachers.length; j++) {
          if (this.teachers[j].id === tid) { teacher = this.teachers[j]; break; }
        }
        if (teacher && teacher.unavailableSlots.has(s)) { conflict = true; break; }
      }
      // HC-MATERIA-DIA: max ceil(horas_semanales/5) sesiones de la misma materia por día y grupo
      if (!conflict) {
        var sdKey  = block.groupId + '_' + block.subjectId;
        var sdMap  = this.subjectDayOccupancy.get(sdKey);
        var maxPD  = this.maxPerDay.get(sdKey) || 1;
        var dayIdx = Math.floor(s / this.numTramos);
        if (sdMap && (sdMap.get(dayIdx) || 0) >= maxPD) conflict = true;
      }
      if (!conflict) valid.push(s);
    }
    return valid;
  }

  getValidSlotsLCV(block, pending) {
    var raw = this.getValidSlots(block);
    if (raw.length <= 1 || !pending.length) return raw;
    var self_ = this;
    return raw.slice().sort(function(sa, sb) {
      var sumA = 0, sumB = 0;
      for (var pi = 0; pi < pending.length; pi++) {
        var dom = pending[pi]._domain || [];
        for (var di = 0; di < dom.length; di++) {
          if (dom[di] !== sa) sumA++;
          if (dom[di] !== sb) sumB++;
        }
      }
      return sumB - sumA;
    });
  }

  assignBlock(block, slot) {
    this.schedule.set(block.id, slot);
    var g = this.groupOccupancy.get(block.groupId);
    if (!g) { g = new Set(); this.groupOccupancy.set(block.groupId, g); }
    g.add(slot);
    for (var i = 0; i < block.teacherIds.length; i++) {
      var t = this.teacherOccupancy.get(block.teacherIds[i]);
      if (!t) { t = new Set(); this.teacherOccupancy.set(block.teacherIds[i], t); }
      t.add(slot);
    }
    // HC-MATERIA-DIA: incrementar conteo (grupo, materia, día)
    var sdKey = block.groupId + '_' + block.subjectId;
    var sdMap = this.subjectDayOccupancy.get(sdKey);
    if (!sdMap) { sdMap = new Map(); this.subjectDayOccupancy.set(sdKey, sdMap); }
    var day = Math.floor(slot / this.numTramos);
    sdMap.set(day, (sdMap.get(day) || 0) + 1);
  }

  removeBlock(block) {
    var slot = this.schedule.get(block.id);
    if (slot === undefined) return;
    this.schedule.delete(block.id);
    var g = this.groupOccupancy.get(block.groupId);
    if (g) g.delete(slot);
    for (var i = 0; i < block.teacherIds.length; i++) {
      var t = this.teacherOccupancy.get(block.teacherIds[i]);
      if (t) t.delete(slot);
    }
    // HC-MATERIA-DIA: decrementar conteo (grupo, materia, día)
    var sdKey = block.groupId + '_' + block.subjectId;
    var sdMap = this.subjectDayOccupancy.get(sdKey);
    if (sdMap) {
      var day = Math.floor(slot / this.numTramos);
      var cur = sdMap.get(day) || 0;
      if (cur <= 1) sdMap.delete(day); else sdMap.set(day, cur - 1);
    }
  }

  constructInitialSolution() {
    var pending = this.blocks.slice().sort(function(a, b) {
      var ap = a.teacherIds.length > 1 ? 2 : (a.isOptative ? 1 : 0);
      var bp = b.teacherIds.length > 1 ? 2 : (b.isOptative ? 1 : 0);
      return bp - ap;
    });
    var assigned = 0;
    while (pending.length > 0) {
      for (var i = 0; i < pending.length; i++) pending[i]._domain = this.getValidSlots(pending[i]);
      pending.sort(function(a, b) { return a._domain.length - b._domain.length; });
      var block = pending.shift();
      if (!block._domain.length) {
        self.postMessage({ type: 'error', variantId: this.variantId, blockId: block.id,
          message: 'Sin slots: "' + block.subjectName + '" (grupo ' + block.groupId + ')',
          suggestion: 'Reduce horas semanales o revisa disponibilidad del profesor.' });
        continue;
      }
      var slots = this.getValidSlotsLCV(block, pending);
      this.assignBlock(block, slots[0]);
      assigned++;
      this.auditLog.push('[C1] ' + block.subjectName + '/' + block.groupId +
        ' -> slot ' + slots[0] +
        ' (d' + Math.floor(slots[0] / this.numTramos) +
        ' t' + (slots[0] % this.numTramos) + ')');
      if (assigned % 20 === 0)
        self.postMessage({ type: 'progress', variantId: this.variantId,
          phase: 1, assigned: assigned, total: this.blocks.length });
    }
  }

  calculateCost() {
    var w = this.weights, nt = this.numTramos, cost = 0;
    var byGD = new Map();
    var schedule = this.schedule, blocks = this.blocks;
    schedule.forEach(function(slot, bid) {
      var b = null;
      for (var i = 0; i < blocks.length; i++) { if (blocks[i].id === bid) { b = blocks[i]; break; } }
      if (!b) return;
      var key = b.groupId + '_' + Math.floor(slot / nt);
      if (!byGD.has(key)) byGD.set(key, []);
      byGD.get(key).push({ b: b, tram: slot % nt });
    });
    byGD.forEach(function(slots) {
      slots.sort(function(a, x) { return a.tram - x.tram; });
      for (var i = 0; i < slots.length; i++) {
        var b = slots[i].b;
        if (b.cognitiveLoad === 'alta' && (i === 0 || i === slots.length - 1))
          cost += 40 * w.cognitiveLoad;
        if (i > 0 && b.cognitiveLoad === 'alta' && slots[i-1].b.cognitiveLoad === 'alta')
          cost += 100 * w.cognitiveLoad;
        if (b.dynamicType === 'estatica') {
          var streak = 1;
          for (var j = i - 1; j >= 0 && slots[j].b.dynamicType === 'estatica'; j--) streak++;
          if (streak > 5) cost += 50 * w.alternation;
        }
      }
    });
    var byTD = new Map();
    schedule.forEach(function(slot, bid) {
      var b = null;
      for (var i = 0; i < blocks.length; i++) { if (blocks[i].id === bid) { b = blocks[i]; break; } }
      if (!b) return;
      for (var i = 0; i < b.teacherIds.length; i++) {
        var key = b.teacherIds[i] + '_' + Math.floor(slot / nt);
        if (!byTD.has(key)) byTD.set(key, []);
        byTD.get(key).push(slot % nt);
      }
    });
    byTD.forEach(function(tramos) {
      tramos.sort(function(a, b) { return a - b; });
      if (tramos.length > 1) {
        var gap = tramos[tramos.length - 1] - tramos[0] - tramos.length + 1;
        if (gap > 0) cost += gap * 25 * w.equity;
      }
    });
    if (w.minimumChange > 0) {
      var prevSched = this.previousSchedule;
      schedule.forEach(function(slot, bid) {
        var prev = prevSched.get(bid);
        if (prev !== undefined && prev !== slot) cost += 500 * w.minimumChange;
      });
    }
    return cost;
  }

  optimize() {
    var T = 1000.0, alpha = 0.995, T_min = 0.01, iter = 0;
    var cost = this.calculateCost();
    var blocks = this.blocks;
    var assigned = blocks.filter(function(b) { return this.schedule.has(b.id); }.bind(this));
    if (!assigned.length) return;
    while (T > T_min && (Date.now() - this.startTime) < this.timeout) {
      iter++;
      if (Math.random() < 0.6 && assigned.length >= 2) {
        var byG = {};
        for (var ai = 0; ai < assigned.length; ai++) {
          var b_ = assigned[ai];
          if (!byG[b_.groupId]) byG[b_.groupId] = [];
          byG[b_.groupId].push(b_);
        }
        var gs = Object.keys(byG).filter(function(g) { return byG[g].length >= 2; });
        if (!gs.length) { T *= alpha; continue; }
        var gId = gs[Math.floor(Math.random() * gs.length)];
        var gb  = byG[gId];
        var i1  = Math.floor(Math.random() * gb.length);
        var i2  = (i1 + 1 + Math.floor(Math.random() * (gb.length - 1))) % gb.length;
        var b1  = gb[i1], b2 = gb[i2];
        var s1  = this.schedule.get(b1.id), s2 = this.schedule.get(b2.id);
        this.removeBlock(b1); this.removeBlock(b2);
        var v1 = this.getValidSlots(b1).indexOf(s2) !== -1;
        var v2 = this.getValidSlots(b2).indexOf(s1) !== -1;
        if (v1 && v2) {
          this.assignBlock(b1, s2); this.assignBlock(b2, s1);
          var nc = this.calculateCost(), d = nc - cost;
          if (d < 0 || Math.random() < Math.exp(-d / T)) { cost = nc; }
          else {
            this.removeBlock(b1); this.removeBlock(b2);
            this.assignBlock(b1, s1); this.assignBlock(b2, s2);
          }
        } else { this.assignBlock(b1, s1); this.assignBlock(b2, s2); }
      } else {
        var b = assigned[Math.floor(Math.random() * assigned.length)];
        var os = this.schedule.get(b.id);
        this.removeBlock(b);
        var v = this.getValidSlots(b);
        if (!v.length) { this.assignBlock(b, os); T *= alpha; continue; }
        var ns = v[Math.floor(Math.random() * v.length)];
        this.assignBlock(b, ns);
        var nc2 = this.calculateCost(), d2 = nc2 - cost;
        if (d2 < 0 || Math.random() < Math.exp(-d2 / T)) { cost = nc2; }
        else { this.removeBlock(b); this.assignBlock(b, os); }
      }
      T *= alpha;
      if (iter % 500 === 0)
        self.postMessage({ type: 'progress', variantId: this.variantId, phase: 2,
          T: parseFloat(T.toFixed(3)), cost: Math.round(cost), iter: iter });
    }
    this.finalCost = cost;
  }

  generateReport() {
    var nt = this.numTramos, out = [], blocks = this.blocks;
    this.schedule.forEach(function(slot, bid) {
      var b = null;
      for (var i = 0; i < blocks.length; i++) { if (blocks[i].id === bid) { b = blocks[i]; break; } }
      if (!b) return;
      out.push({ blockId: bid, slot: slot, groupId: b.groupId, subjectId: b.subjectId,
        subjectName: b.subjectName, teacherIds: b.teacherIds, materia_color: b.materia_color,
        cognitiveLoad: b.cognitiveLoad, dynamicType: b.dynamicType,
        dayIdx: Math.floor(slot / nt), tramoIdx: slot % nt });
    });
    var score = Math.max(0, Math.min(100, Math.round(100 - this.finalCost / 50)));
    return { schedule: out, score: score,
      auditLog: this.auditLog.slice(-100), finalCost: Math.round(this.finalCost) };
  }
}

self.onmessage = function(e) {
  var cfg    = e.data;
  var solver = new TimetableSolver(cfg);
  solver.constructInitialSolution();
  self.postMessage({ type: 'progress', variantId: cfg.variantId, phase: 3, label: 'Optimizando...' });
  solver.optimize();
  self.postMessage({ type: 'completed', variantId: cfg.variantId, result: solver.generateReport() });
};
`;

  /* ── DidactIAPlanner: 3 variantes Pareto en Workers paralelos ── */
  const DidactIAPlanner = {
    VARIANTS: [
      { id: 'A', label: 'Máxima Equidad',
        weights: { cognitiveLoad: 0.3, equity: 2.0, minimumChange: 0.0, alternation: 0.5 } },
      { id: 'B', label: 'Neuroeducativa',
        weights: { cognitiveLoad: 2.0, equity: 0.5, minimumChange: 0.0, alternation: 1.5 } },
      { id: 'C', label: 'Mínimo Cambio',
        weights: { cognitiveLoad: 0.5, equity: 0.5, minimumChange: 3.0, alternation: 0.5 } }
    ],

    generateTimetable: function (config, callbacks) {
      var blob    = new Blob([WORKER_LOGIC], { type: 'application/javascript' });
      var blobUrl = URL.createObjectURL(blob);
      var results = {};
      var done    = 0;
      var total   = DidactIAPlanner.VARIANTS.length;

      DidactIAPlanner.VARIANTS.forEach(function (v) {
        var worker = new Worker(blobUrl);
        var cfg    = Object.assign({}, config, { variantId: v.id, weights: v.weights });
        worker.postMessage(cfg);

        worker.onmessage = function (e) {
          var msg = e.data;
          if (msg.type === 'progress' || msg.type === 'error') {
            if (callbacks.onProgress) callbacks.onProgress(v.id, msg);
          } else if (msg.type === 'completed') {
            results[v.id] = Object.assign({ label: v.label }, msg.result);
            worker.terminate();
            if (++done === total) {
              URL.revokeObjectURL(blobUrl);
              if (callbacks.onComplete) callbacks.onComplete(results);
            }
          }
        };

        worker.onerror = function (err) {
          if (callbacks.onError) callbacks.onError(v.id, err.message || String(err));
          worker.terminate();
          if (++done === total) {
            URL.revokeObjectURL(blobUrl);
            if (callbacks.onComplete) callbacks.onComplete(results);
          }
        };
      });
    }
  };

  /* ════════════════════════════════
     IMPORTAR datos de entrada del Planner desde .xlsx (una hoja → una tabla)
  ════════════════════════════════ */

  var IMPORT_CENTRO = ctrId; // centro activo del usuario

  function _impNorm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[?:.*]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function _impNum(v) {
    if (v == null || v === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  function _impInt(v) {
    var n = _impNum(v);
    return n == null ? null : Math.round(n);
  }
  function _impBool(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'boolean') return v;
    var s = _impNorm(v);
    if (['si', 'sí', 'true', '1', 'x', 'verdadero', 'yes', 'y', 'ok', 'disponible', 'aplicar'].indexOf(s) !== -1) return true;
    if (['no', 'false', '0', '-', 'n', 'falso'].indexOf(s) !== -1) return false;
    return null;
  }
  function _impTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      var frac = (v >= 0 && v < 1) ? v : (v - Math.floor(v));
      var mins = Math.round(frac * 24 * 60);
      var hh = Math.floor(mins / 60) % 24, mm = mins % 60;
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    return m ? (m[1].padStart(2, '0') + ':' + m[2]) : s;
  }
  function _impStr(v) {
    if (v == null) return null;
    var s = String(v).trim();
    return s === '' ? null : s;
  }

  /* clave de nombre: minúsculas, sin acentos, sin espacios extra (para casar materias) */
  function _impNombreKey(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  /* clave de profesor: como _impNombreKey pero quita comas y ordena las palabras
     → "Cerro, Sara" y "Sara Cerro" producen la misma clave "cerro sara" */
  function _impProfKey(s) {
    return _impNombreKey(String(s == null ? '' : s).replace(/,/g, ' '))
      .split(' ').filter(Boolean).sort().join(' ');
  }

  /* sheet (normalizado) → { tabla, cols: { columnaBD: { a:[alias…], t:tipo } } } */
  var IMPORT_MAP = {
    profesores: { tabla: 'planner_profesores', cols: {
      nombre:            { a: ['nombre', 'profesor', 'docente', 'nombre profesor', 'apellidos nombre'], t: 'str' },
      horas_lectivas:    { a: ['horas_lectivas', 'horas lectivas', 'horas', 'lectivas', 'horas semanales'], t: 'num' },
      asignaturas_texto: { a: ['asignaturas_texto', 'asignaturas', 'materias', 'asignatura'], t: 'str' }
    }},
    cargas: { tabla: 'planner_cargas', cols: {
      profesor:   { a: ['profesor', 'docente', 'nombre'], t: 'str' },
      grupo:      { a: ['grupo', 'curso', 'clase'], t: 'str' },
      asignatura: { a: ['asignatura', 'materia'], t: 'str' },
      horas:      { a: ['horas', 'sesiones', 'horas semanales', 'h'], t: 'num' }
    }},
    grupos: { tabla: 'planner_grupos', cols: {
      grupo:       { a: ['grupo', 'nombre', 'clase', 'codigo', 'grupo horario'], t: 'str' },
      curso:       { a: ['curso', 'nivel', 'etapa'], t: 'str' },
      num_alumnos: { a: ['num_alumnos', 'numero alumnos', 'n alumnos', 'nº alumnos', 'alumnos', 'total'], t: 'int' },
      tutor:       { a: ['tutor', 'tutora', 'tutor/a', 'tutor a'], t: 'str' }
    }},
    tramos: { tabla: 'planner_tramos', cols: {
      modelo:      { a: ['modelo', 'jornada', 'tipo modelo'], t: 'str' },
      orden:       { a: ['orden', 'numero', 'n', 'tramo', 'posicion', 'nº'], t: 'int' },
      hora_inicio: { a: ['hora_inicio', 'hora inicio', 'inicio', 'desde'], t: 'time' },
      hora_fin:    { a: ['hora_fin', 'hora fin', 'fin', 'hasta'], t: 'time' },
      tipo:        { a: ['tipo', 'categoria', 'clase descanso'], t: 'str' }
    }},
    restricciones: { tabla: 'planner_restricciones', cols: {
      detalle: { a: ['detalle', 'restriccion', 'restricción', 'texto', 'descripcion'], t: 'str' }
    }},
    disponibilidad: { tabla: 'planner_disponibilidad', cols: {
      profesor:   { a: ['profesor', 'docente', 'nombre'], t: 'str' },
      dia:        { a: ['dia', 'día'], t: 'str' },
      tramo:      { a: ['tramo', 'hora', 'orden', 'franja'], t: 'str' },
      disponible: { a: ['disponible', 'disponibilidad', 'si no', 'ok'], t: 'bool' }
    }},
    espacios: { tabla: 'planner_espacios', cols: {
      nombre:            { a: ['nombre', 'espacio', 'aula', 'sala'], t: 'str' },
      tipo:              { a: ['tipo', 'categoria'], t: 'str' },
      asignaturas_texto: { a: ['asignaturas_texto', 'asignaturas', 'materias', 'uso'], t: 'str' },
      capacidad:         { a: ['capacidad', 'aforo', 'plazas', 'cap'], t: 'int' }
    }},
    reglas: { tabla: 'planner_reglas', cols: {
      regla:      { a: ['regla', 'nombre', 'rule'], t: 'str' },
      aplicar:    { a: ['aplicar', 'activa', 'activo', 'si no', 'aplicar?'], t: 'bool' },
      comentario: { a: ['comentario', 'observaciones', 'nota', 'notas'], t: 'str' }
    }}
  };

  /* Matching flexible de nombre de hoja → clave de IMPORT_MAP.
     Tolera prefijos tipo "0. ", "1. ", acentos y mayúsculas; usa includes(). */
  function _impMatchSheet(sheetName) {
    // _impNorm ya pasa a minúsculas, quita acentos y convierte '.' en espacio.
    // Además quitamos números/puntos/espacios iniciales: "1. Profesores" → "profesores".
    var n = _impNorm(sheetName).replace(/^[0-9.\s]+/, '').trim();
    console.log('[Planner import] hoja "' + sheetName + '" → limpia "' + n + '"');

    // LÉEME / instrucciones → ignorar
    if (n.indexOf('leeme') !== -1 || n.indexOf('leme') !== -1 || n.indexOf('readme') !== -1 || n.indexOf('instruc') !== -1) {
      console.log('[Planner import]   ↳ ignorada (hoja de instrucciones)');
      return null;
    }

    // Palabra clave contenida → tabla. (orden: keywords sin solapamientos)
    var KW = [
      ['profesores',     'profesores'],
      ['profe',          'profesores'],
      ['cargas',         'cargas'],
      ['carga',          'cargas'],
      ['sesion',         'cargas'],
      ['grupos',         'grupos'],
      ['grupo',          'grupos'],
      ['restricciones',  'restricciones'],
      ['restric',        'restricciones'],
      ['disponibilidad', 'disponibilidad'],
      ['dispon',         'disponibilidad'],
      ['tramos',         'tramos'],
      ['tramo',          'tramos'],
      ['espacios',       'espacios'],
      ['espacio',        'espacios'],
      ['aula',           'espacios'],
      ['reglas',         'reglas'],
      ['regla',          'reglas']
    ];
    for (var i = 0; i < KW.length; i++) {
      if (n.indexOf(KW[i][0]) !== -1) return KW[i][1];
    }
    return null;
  }

  var _impConv = { str: _impStr, num: _impNum, int: _impInt, bool: _impBool, time: _impTime };

  function _impMapRow(rawRow, colsDef) {
    // índice normHeader → valor
    var norm = {};
    Object.keys(rawRow).forEach(function (k) { norm[_impNorm(k)] = rawRow[k]; });
    var out = {}, vacia = true;
    Object.keys(colsDef).forEach(function (col) {
      var def = colsDef[col], val = null;
      for (var i = 0; i < def.a.length; i++) {
        if (norm[def.a[i]] !== undefined) { val = norm[def.a[i]]; break; }
      }
      var conv = _impConv[def.t](val);
      out[col] = conv;
      if (conv !== null && conv !== undefined && conv !== '') vacia = false;
    });
    return vacia ? null : out;
  }

  /* Hoja "Cargas" → materias + profesores + necesidades_lectivas (lo que lee el generador).
     Usa ctrId (el centro activo, que es el que consulta _loadData). */
  async function _impCargasANecesidades(rawRows) {
    var centro = ctrId;
    var filas = rawRows.map(function (r) { return _impMapRow(r, IMPORT_MAP.cargas.cols); }).filter(Boolean);
    console.log('[Planner import][Cargas→Necesidades] centro_id:', centro, '· filas con datos:', filas.length);

    // ── 1. MATERIAS: casar por nombre normalizado; crear las que falten ──
    var matRes = await sb.from('materias').select('id,nombre').eq('centro_id', centro);
    if (matRes.error) { console.error('[Planner import][Cargas] error leyendo materias:', JSON.stringify(matRes.error, null, 2)); throw new Error(matRes.error.message); }
    var matIdByKey = {};
    (matRes.data || []).forEach(function (m) { matIdByKey[_impNombreKey(m.nombre)] = m.id; });

    var asigRawByKey = {};
    filas.forEach(function (f) {
      if (!f.asignatura) return;
      var k = _impNombreKey(f.asignatura);
      if (k && !(k in asigRawByKey)) asigRawByKey[k] = f.asignatura;
    });

    var matCreadas = 0, matReusadas = 0;
    var asigKeys = Object.keys(asigRawByKey);
    for (var i = 0; i < asigKeys.length; i++) {
      var ak = asigKeys[i];
      if (matIdByKey[ak]) { matReusadas++; continue; }
      var mi = await sb.from('materias').insert({ centro_id: centro, nombre: asigRawByKey[ak] }).select('id').single();
      if (mi.error) { console.error('[Planner import][Cargas] error creando materia "' + asigRawByKey[ak] + '":', JSON.stringify(mi.error, null, 2)); throw new Error(mi.error.message); }
      matIdByKey[ak] = mi.data.id; matCreadas++;
    }
    console.log('[Planner import][Cargas] materias → creadas:', matCreadas, '· reutilizadas:', matReusadas, '(' + asigKeys.length + ' distintas)');

    // ── 2. PROFESORES: casar por palabras ordenadas (sin orden ni coma); crear los que falten ──
    var profRes = await sb.from('profesores').select('id,nombre').eq('centro_id', centro);
    if (profRes.error) { console.error('[Planner import][Cargas] error leyendo profesores:', JSON.stringify(profRes.error, null, 2)); throw new Error(profRes.error.message); }
    var profIdByKey = {};
    (profRes.data || []).forEach(function (p) { profIdByKey[_impProfKey(p.nombre)] = p.id; });

    var profRawByKey = {};
    filas.forEach(function (f) {
      if (!f.profesor) return;
      var k = _impProfKey(f.profesor);
      if (k && !(k in profRawByKey)) profRawByKey[k] = f.profesor;
    });

    var profCreados = 0, profReusados = 0;
    var profKeys = Object.keys(profRawByKey);
    for (var j = 0; j < profKeys.length; j++) {
      var pk = profKeys[j];
      if (profIdByKey[pk]) { profReusados++; continue; }
      var pi = await sb.from('profesores').insert({ centro_id: centro, nombre: profRawByKey[pk] }).select('id').single();
      if (pi.error) { console.error('[Planner import][Cargas] error creando profesor "' + profRawByKey[pk] + '":', JSON.stringify(pi.error, null, 2)); throw new Error(pi.error.message); }
      profIdByKey[pk] = pi.data.id; profCreados++;
    }
    console.log('[Planner import][Cargas] profesores → creados:', profCreados, '· reutilizados:', profReusados, '(' + profKeys.length + ' distintos)');

    // ── 3. NECESIDADES_LECTIVAS: borrar las del centro e insertar una por carga con horas válidas ──
    var del = await sb.from('necesidades_lectivas').delete().eq('centro_id', centro);
    if (del.error) { console.error('[Planner import][Cargas] error borrando necesidades_lectivas:', JSON.stringify(del.error, null, 2)); throw new Error(del.error.message); }
    console.log('[Planner import][Cargas] necesidades_lectivas previas del centro borradas');

    var necRows = [], sinHoras = 0;
    filas.forEach(function (f) {
      var horas = (f.horas == null) ? NaN : parseInt(f.horas, 10);
      if (isNaN(horas)) { sinHoras++; return; }   // horas_semanales es NOT NULL → no se inserta
      necRows.push({
        centro_id:       centro,
        grupo_horario:   f.grupo || null,
        materia_id:      f.asignatura ? (matIdByKey[_impNombreKey(f.asignatura)] || null) : null,
        profesor_id:     f.profesor   ? (profIdByKey[_impProfKey(f.profesor)]   || null) : null,
        horas_semanales: horas
      });
    });

    if (necRows.length) {
      var nins = await sb.from('necesidades_lectivas').insert(necRows);
      if (nins.error) { console.error('[Planner import][Cargas] error insertando necesidades_lectivas:', JSON.stringify(nins.error, null, 2)); throw new Error(nins.error.message); }
    }
    console.log('[Planner import][Cargas] necesidades insertadas:', necRows.length, '·', sinHoras, 'cargas sin horas, no importadas');

    return { necesidades: necRows.length, sinHoras: sinHoras, matCreadas: matCreadas, matReusadas: matReusadas, profCreados: profCreados, profReusados: profReusados };
  }

  async function _impProcesar(wb) {
    var resultados = [];
    console.log('[Planner import] centro destino (Agora):', IMPORT_CENTRO);
    console.log('[Planner import] hojas en el archivo:', wb.SheetNames);

    for (var si = 0; si < wb.SheetNames.length; si++) {
      var sheetName = wb.SheetNames[si];
      var key = _impMatchSheet(sheetName);
      if (!key) {
        console.log('[Planner import] "' + sheetName + '" → SIN TABLA (ignorada)');
        resultados.push({ hoja: sheetName, tabla: '—', n: 0, estado: 'ignorada (sin tabla)' });
        continue;
      }
      var cfg = IMPORT_MAP[key];
      var raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
      console.log('[Planner import] "' + sheetName + '" → tabla ' + cfg.tabla + ' · ' + raw.length + ' filas leídas');
      if (raw.length) console.log('[Planner import]   cabeceras detectadas:', Object.keys(raw[0]));

      /* "Cargas" NO va a planner_cargas: se vuelca a lo que lee el generador
         (materias + profesores + necesidades_lectivas). */
      if (key === 'cargas') {
        try {
          var rc = await _impCargasANecesidades(raw);
          resultados.push({ hoja: sheetName, tabla: 'necesidades_lectivas', n: rc.necesidades,
            estado: '✅ ' + rc.necesidades + ' necesidades · ' + rc.sinHoras + ' sin horas · materias +' +
              rc.matCreadas + '/♻' + rc.matReusadas + ' · profes +' + rc.profCreados + '/♻' + rc.profReusados });
        } catch (err) {
          console.error('[Planner import]   ❌ Cargas→necesidades falló:', err);
          resultados.push({ hoja: sheetName, tabla: 'necesidades_lectivas', n: 0, estado: '❌ ' + (err.message || err) });
        }
        continue;
      }

      var rows = raw.map(function (r) {
        var m = _impMapRow(r, cfg.cols);
        if (!m) return null;
        m.centro_id = IMPORT_CENTRO;
        return m;
      }).filter(Boolean);
      console.log('[Planner import]   ' + rows.length + ' filas mapeadas (no vacías). Ejemplo:', rows[0] || '(ninguna)');

      try {
        var del = await sb.from(cfg.tabla).delete().eq('centro_id', IMPORT_CENTRO);
        if (del.error) { console.error('[Planner import]   ❌ error en DELETE de ' + cfg.tabla + ':', del.error); throw new Error(del.error.message); }
        console.log('[Planner import]   datos previos de Agora borrados en ' + cfg.tabla);
        if (rows.length) {
          var ins = await sb.from(cfg.tabla).insert(rows);
          if (ins.error) { console.error('[Planner import]   ❌ error en INSERT a ' + cfg.tabla + ':', ins.error); throw new Error(ins.error.message); }
          console.log('[Planner import]   ✅ ' + rows.length + ' filas insertadas en ' + cfg.tabla);
        } else {
          console.log('[Planner import]   (no hay filas que insertar en ' + cfg.tabla + ')');
        }
        resultados.push({ hoja: sheetName, tabla: cfg.tabla, n: rows.length, estado: '✅ ' + rows.length + ' filas' });
      } catch (err) {
        console.error('[Planner import]   ❌ ' + cfg.tabla + ' falló:', err);
        resultados.push({ hoja: sheetName, tabla: cfg.tabla, n: 0, estado: '❌ ' + (err.message || err) });
      }
    }
    console.log('[Planner import] resumen:', resultados);
    _impRenderLog(resultados);
  }

  function _impRenderLog(resultados) {
    var el = document.getElementById('planner-import-log');
    if (!el) return;
    var filas = resultados.map(function (r) {
      return '<tr><td>' + _esc(r.hoja) + '</td><td style="color:var(--muted)">' + _esc(r.tabla) +
        '</td><td style="text-align:right">' + r.n + '</td><td>' + _esc(r.estado) + '</td></tr>';
    }).join('');
    el.innerHTML =
      '<div class="planner-list" style="padding:0">' +
      '<table class="tbl"><thead><tr><th>Hoja</th><th>Tabla</th><th style="text-align:right">Filas</th><th>Estado</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table></div>';
  }

  function _renderImportar() {
    var el = document.getElementById('pt-importar');
    if (!el) return;
    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Datos de entrada</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Importar datos de horario</h3></div>' +
      '</div>' +
      '<div class="planner-empty" style="text-align:left;line-height:1.5">' +
        '<p style="margin:0 0 12px">Sube <strong>DidactIA_Planner_datos_26-27.xlsx</strong>. Cada hoja se vuelca a su tabla de entrada del Planner ' +
        '(Profesores · Cargas · Tramos · Restricciones · Disponibilidad · Espacios · Reglas) para el centro <strong>Agora Lledó</strong>. ' +
        'Se reemplazan los datos previos de ese centro en cada tabla.</p>' +
        '<input type="file" id="planner-import-file" accept=".xlsx,.xls" style="display:none" onchange="plannerImportarArchivo(this)">' +
        '<button class="btn-ink" onclick="document.getElementById(\'planner-import-file\').click()">📥 Importar datos de horario</button>' +
      '</div>' +
      '<div id="planner-import-log" style="margin-top:16px"></div>';
  }

  window.plannerImportarArchivo = function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    console.log('[Planner import] archivo seleccionado:', file.name, '(' + file.size + ' bytes)');
    if (typeof XLSX === 'undefined') { console.error('[Planner import] SheetJS (XLSX) no está cargado'); alert('La librería de lectura de Excel (SheetJS) no está disponible.'); return; }
    var logEl = document.getElementById('planner-import-log');
    if (logEl) logEl.innerHTML = '<div style="color:var(--muted);font-size:13px"><span class="spin">⟳</span> Leyendo y volcando datos…</div>';
    var reader = new FileReader();
    reader.onload = function (e) {
      var wb;
      try { wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); }
      catch (err) {
        console.error('[Planner import] no se pudo leer el .xlsx:', err);
        if (logEl) logEl.innerHTML = '<div style="color:var(--danger)">No se pudo leer el archivo: ' + _esc(err.message) + '</div>';
        input.value = ''; return;
      }
      console.log('[Planner import] archivo leído. Hojas:', wb.SheetNames);
      _impProcesar(wb).catch(function (err) {
        if (logEl) logEl.innerHTML = '<div style="color:var(--danger)">Error: ' + _esc(err.message || err) + '</div>';
      }).then(function () { input.value = ''; });
    };
    reader.readAsArrayBuffer(file);
  };

  window.DidactIAPlanner = DidactIAPlanner;

})();
