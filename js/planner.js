/* js/planner.js — DidactIA Planner V2: motor CSP neuroeducativo + co-docencia LOMLOE */
/* Solo para admin/superadmin. Usa globals: sb, ctrId (config.js) */

(function () {
  'use strict';

  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
  const TRAMOS = [1, 2, 3, 4, 5, 6, 7, 8];
  const TRAMOS_HORA = {
    1: '08:00–09:00', 2: '09:00–10:00', 3: '10:00–11:00', 4: '11:00–12:00',
    5: '12:00–13:00', 6: '13:00–14:00', 7: '14:00–15:00', 8: '15:00–16:00'
  };
  const HORA_INICIO = {
    1: '08:00', 2: '09:00', 3: '10:00', 4: '11:00',
    5: '12:00', 6: '13:00', 7: '14:00', 8: '15:00'
  };
  const HORA_FIN = {
    1: '09:00', 2: '10:00', 3: '11:00', 4: '12:00',
    5: '13:00', 6: '14:00', 7: '15:00', 8: '16:00'
  };

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Estado del módulo ── */
  const _s = {
    materias:       [],
    profesores:     [],
    necesidades:    [],
    grupos:         [],
    disponibilidad: {},   // profesor_id → Set<"dia_tramo">
    schedule:       {},   // grupo → dia → String(tramo) → slot
    auditLog:       {},   // grupo → string[]
    globalScore:    {},   // grupo → 0–100
    currentGrupo:   null,
    dragData:       null,
    ptab:           'materias'
  };

  /* ════════════════════════════════
     INIT
  ════════════════════════════════ */
  window.initPlannerPanel = function () {
    const wrap = document.getElementById('pt-materias');
    if (wrap) wrap.innerHTML = '<div class="planner-empty" style="padding:40px 0;text-align:center">Cargando…</div>';
    _loadData()
      .then(function () { _showPTab(_s.ptab); })
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
     CARGA DE DATOS (V2: nuevas columnas + disponibilidad)
  ════════════════════════════════ */
  async function _loadData() {
    console.log('[Planner V2] _loadData — ctrId:', ctrId, '| sb:', !!sb);
    if (!sb) throw new Error('Supabase client (sb) no disponible');

    const [mR, pR, nR] = await Promise.all([
      sb.from('materias')
        .select('id,nombre,color,carga_cognitiva,tipo_dinamica,centro_id,created_at')
        .eq('centro_id', ctrId).order('nombre'),
      sb.from('profesores')
        .select('id,nombre,activo,centro_id,afinidad_metodologica')
        .eq('centro_id', ctrId).eq('activo', true).order('nombre'),
      sb.from('necesidades_lectivas')
        .select('*, materias(nombre,color,carga_cognitiva,tipo_dinamica), profesores(nombre,afinidad_metodologica)')
        .eq('centro_id', ctrId)
    ]);

    console.log('[Planner V2] materias:', mR.data, '| error:', mR.error && mR.error.message);
    console.log('[Planner V2] profesores:', pR.data, '| error:', pR.error && pR.error.message);
    console.log('[Planner V2] necesidades:', nR.data, '| error:', nR.error && nR.error.message);
    if (mR.error) console.warn('[Planner V2] materias — ¿columnas V2 añadidas?', mR.error.message);
    if (nR.error) console.warn('[Planner V2] necesidades_lectivas — ¿tabla existente con columnas V2?', nR.error.message);

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
        '<button class="icon-btn-sm" onclick="plannerDeleteMateria(\'' + m.id + '\')">✕</button>' +
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
        '<td><button class="icon-btn-sm" onclick="plannerDeleteNec(\'' + n.id + '\')">✕</button></td>' +
        '</tr>';
    }).join('');

    el.innerHTML =
      '<div class="planner-section-hdr">' +
        '<div><div class="card-eyebrow">Configuración</div>' +
        '<h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Necesidades lectivas</h3></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:20px">' +
        '<input id="pn-grupo" class="planner-input" placeholder="Grupo (ej: 1ESOA)" style="width:130px">' +
        '<select id="pn-materia" class="planner-select">' + (matOpts || '<option value="">— sin materias —</option>') + '</select>' +
        '<select id="pn-profesor" class="planner-select">' + (profOpts || '<option value="">— sin profesores —</option>') + '</select>' +
        '<input id="pn-horas" type="number" min="1" max="10" value="3" class="planner-input" style="width:70px" placeholder="H/sem">' +
        '<select id="pn-bloque" class="planner-select" title="Bloque interdisciplinar LOMLOE">' + bloqueOpts + '</select>' +
        '<button class="btn-ink" onclick="plannerAddNec()">+ Añadir</button>' +
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

    /* HC-1: slot ya ocupado para el grupo */
    if (sched[dia][key]) return false;

    /* HC-2: misma materia no dos veces el mismo día (comprueba todas las materias del bloque) */
    const materiaIds = sess.type === 'codoce'
      ? sess.necs.map(function (n) { return n.materia_id; })
      : [sess.materia_id];
    for (var t = 0; t < TRAMOS.length; t++) {
      const s = sched[dia][String(TRAMOS[t])];
      if (s && materiaIds.indexOf(s.materia_id) !== -1) return false;
    }

    /* HC-3: disponibilidad + ocupación en otros grupos — todos los profesores implicados */
    const profIds = sess.type === 'codoce'
      ? sess.necs.map(function (n) { return n.profesor_id; }).filter(Boolean)
      : (sess.profesor_id ? [sess.profesor_id] : []);
    for (var i = 0; i < profIds.length; i++) {
      const pid = profIds[i];
      if (teacherBusy[pid] && teacherBusy[pid].has(dtKey))      return false;  /* ocupado otro grupo */
      if (_s.disponibilidad[pid] && _s.disponibilidad[pid].has(dtKey)) return false;  /* no disponible */
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
    var isFirst = tr === TRAMOS[0];
    var isLast  = tr === TRAMOS[TRAMOS.length - 1];

    var prev1 = sched[dia] && sched[dia][String(tr - 1)];
    var prev2 = sched[dia] && sched[dia][String(tr - 2)];

    /* SC-1: carga alta en hora extrema → -15 */
    if ((isFirst || isLast) && carga === 'alta') {
      score -= 15;
      reasons.push('penalización -15: carga alta en hora ' + (isFirst ? 'inicial' : 'final'));
    }
    /* SC-1b: carga baja o motriz en hora extrema → favorable (sin penalización) */
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

    /* SC-3b: alternación motriz tras estática → favorable */
    if (prev1 && prev1.tipo_dinamica === 'estatica' && din === 'motriz') {
      reasons.push('favorable: actividad motriz rompe sedentarismo');
    }

    /* SC-4: distribución semanal — muchas cargas altas en el mismo día → -10 */
    if (carga === 'alta') {
      var altasHoy = 0;
      for (var t = 0; t < TRAMOS.length; t++) {
        var s = sched[dia] && sched[dia][String(TRAMOS[t])];
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
    var tramoLabel = TRAMOS_HORA[tramo] || ('T' + tramo);
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

    var sess       = sessions[idx];
    var candidates = [];

    for (var di = 0; di < DIAS.length; di++) {
      var dia = DIAS[di];
      for (var ti = 0; ti < TRAMOS.length; ti++) {
        var tramo = TRAMOS[ti];
        if (_esHardValido(sess, dia, tramo, sched, teacherBusy)) {
          var scored = _scoreSoft(sess, dia, tramo, sched);
          candidates.push({ dia: dia, tramo: tramo, score: scored.score, reasons: scored.reasons });
        }
      }
    }

    /* Ordenar de mayor a menor puntuación (best-first) */
    candidates.sort(function (a, b) { return b.score - a.score; });

    for (var ci = 0; ci < candidates.length; ci++) {
      var c   = candidates[ci];
      var key = String(c.tramo);
      _placeSession(sess, c.dia, key, sched, teacherBusy, c.score, c.reasons, auditLog);
      var res = _resolverCSP_V2(sessions, idx + 1, sched, teacherBusy, auditLog);
      if (res) return res;
      _unplaceSession(sess, c.dia, key, sched, teacherBusy, auditLog);
    }

    return null; /* sin solución por este camino */
  }

  /* ── Expandir necesidades en sesiones individuales + co-docencia ── */
  function _buildSessions(grupo) {
    var necs = _s.necesidades.filter(function (n) { return n.grupo_horario === grupo; });

    /* Agrupar bloques co-docencia LOMLOE */
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

    /* Sesiones co-docencia: una por hora del bloque */
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

    /* Sesiones individuales: una por hora */
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

    /* MRV heuristic: más horas → más restrictiva → primero */
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
    DIAS.forEach(function (d) {
      TRAMOS.forEach(function (t) {
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
     TABLERO — Grid + Drag & Drop
  ════════════════════════════════ */
  function _renderTablero() {
    var el = document.getElementById('pt-tablero');
    if (!el) return;
    var grupoOpts = _s.grupos.map(function (g) {
      return '<option value="' + _esc(g) + '"' + (g === _s.currentGrupo ? ' selected' : '') + '>' + _esc(g) + '</option>';
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
        '<button class="btn-ink" id="planner-gen-btn" onclick="plannerGenerar()"' + (!_s.grupos.length ? ' disabled' : '') + '>' +
          '✨ Generar con IA' +
        '</button>' +
      '</div>' +
      (_s.grupos.length === 0
        ? '<div class="planner-empty">Define necesidades lectivas primero (pestaña Necesidades).</div>'
        : '<div id="planner-tablero-body">' +
            '<div style="overflow-x:auto">' + _buildGrid() + '</div>' +
            '<div class="unassigned-pool" id="planner-pool"' +
            ' ondragover="plannerDragOver(event)" ondragleave="plannerDragLeave(event)" ondrop="plannerDropPool(event)">' +
            '<div class="card-eyebrow" style="margin-bottom:6px">Zona libre — arrastra aquí para quitar una sesión</div>' +
            '<div id="planner-pool-inner" style="min-height:32px"></div>' +
            '</div>' +
          '</div>');

    /* Restaurar banner de puntuación si ya había horario generado */
    if (_s.currentGrupo && typeof _s.globalScore[_s.currentGrupo] === 'number') {
      _mostrarPuntuacion(_s.currentGrupo, _s.globalScore[_s.currentGrupo]);
    }
  }

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

    var rows = TRAMOS.map(function (tramo) {
      var key   = String(tramo);
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
          card =
            '<div class="class-card" draggable="true"' +
            ' style="border-left-color:' + _esc(slot.materia_color) + '"' +
            ' title="' + tooltip + '"' +
            ' data-dia="' + _esc(dia) + '" data-tramo="' + key + '" data-grupo="' + _esc(g) + '"' +
            ' ondragstart="plannerDragStart(event,this)" ondragend="plannerDragEnd(event)">' +
            '<div class="class-card__mat">' + _esc(slot.materia_nombre) + '</div>' +
            '<div class="class-card__prof">' + _esc(slot.profesor_nombre) + '</div>' +
            scBadge + codBadge +
            '</div>';
        }
        return '<div class="planner-cell" data-dia="' + _esc(dia) + '" data-tramo="' + key + '"' +
          ' ondragover="plannerDragOver(event)" ondragleave="plannerDragLeave(event)"' +
          ' ondrop="plannerDrop(event,\'' + _esc(g) + '\')">' + card + '</div>';
      }).join('');
      return '<div class="planner-row-label">' + _esc(TRAMOS_HORA[tramo]) + '</div>' + cells;
    }).join('');

    return '<div class="planner-grid" id="planner-grid" style="grid-template-columns:100px repeat(5,1fr)">' +
      '<div class="planner-hdr-cell planner-hdr-hora">Hora</div>' + hdrs + rows + '</div>';
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

  /* ── Generar con barra de progreso animada ── */
  window.plannerGenerar = function () {
    var g   = _s.currentGrupo;
    if (!g) return;
    var btn = document.getElementById('planner-gen-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Iniciando…'; }

    var steps    = [
      'Cargando disponibilidad…',
      'Aplicando hard constraints…',
      'Evaluando carga cognitiva…',
      'Resolviendo co-docencia LOMLOE…',
      'Optimizando soft constraints…',
      'Buscando solución óptima…'
    ];
    var stepIdx  = 0;
    var interval = setInterval(function () {
      stepIdx = (stepIdx + 1) % steps.length;
      if (btn) btn.textContent = '⏳ ' + steps[stepIdx];
    }, 700);

    setTimeout(function () {
      clearInterval(interval);
      var result = _generarHorario(g);
      if (btn) { btn.disabled = false; btn.textContent = '✨ Generar con IA'; }

      if (!result) {
        alert(
          'No se encontró solución con las restricciones actuales.\n\n' +
          'Comprueba:\n' +
          '• Disponibilidad de profesores (todos los tramos pueden estar bloqueados)\n' +
          '• Co-docencia: ambos profesores deben tener tramos libres coincidentes\n' +
          '• Total de horas ≤ ' + DIAS.length + ' días × ' + TRAMOS.length + ' tramos = ' + (DIAS.length * TRAMOS.length) + ' máx. por grupo'
        );
        return;
      }

      _s.schedule[g]    = result;
      _s.globalScore[g] = _calcGlobalScore(result);
      _guardarHorarioGenerado(g, result);
      _renderTablero(); /* _renderTablero llama a _mostrarPuntuacion si el score existe */
    }, 40);
  };

  /* ── Guardar horario_generado en Supabase (incluye log_auditoria) ── */
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
  window.plannerDragStart = function (e, el) {
    _s.dragData = { dia: el.dataset.dia, tramo: el.dataset.tramo, grupo: el.dataset.grupo };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(function () { if (el) el.style.opacity = '0.4'; }, 0);
  };

  window.plannerDragEnd = function () {
    if (_s.dragData) {
      var src = document.querySelector(
        '.class-card[data-dia="' + _s.dragData.dia + '"][data-tramo="' + _s.dragData.tramo + '"]');
      if (src) src.style.opacity = '';
    }
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
      var occupied = !!(_s.schedule[_s.currentGrupo] &&
                        _s.schedule[_s.currentGrupo][cell.dataset.dia] &&
                        _s.schedule[_s.currentGrupo][cell.dataset.dia][cell.dataset.tramo]);
      cell.classList.toggle('drag-over', !occupied);
      cell.classList.toggle('drag-error',  occupied);
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
    if (!_s.dragData) return;

    var srcDia   = _s.dragData.dia;
    var srcTramo = _s.dragData.tramo;
    var srcGrupo = _s.dragData.grupo;
    var tgtDia   = cell.dataset.dia;
    var tgtTramo = cell.dataset.tramo;
    _s.dragData  = null;

    if (srcDia === tgtDia && srcTramo === tgtTramo && srcGrupo === grupo) return;

    var srcSlot = _s.schedule[srcGrupo] && _s.schedule[srcGrupo][srcDia] && _s.schedule[srcGrupo][srcDia][srcTramo];
    if (!srcSlot) return;

    /* Verificar conflicto: algún profesor del slot origen ocupa el destino en otro grupo */
    var srcProfIds = srcSlot.codocente_prof_ids && srcSlot.codocente_prof_ids.length
      ? srcSlot.codocente_prof_ids : (srcSlot.profesor_id ? [srcSlot.profesor_id] : []);
    var conflict = false;
    Object.keys(_s.schedule).forEach(function (g) {
      if (g === srcGrupo) return;
      var other = _s.schedule[g] && _s.schedule[g][tgtDia] && _s.schedule[g][tgtDia][tgtTramo];
      if (!other) return;
      var otherIds = other.codocente_prof_ids && other.codocente_prof_ids.length
        ? other.codocente_prof_ids : (other.profesor_id ? [other.profesor_id] : []);
      if (srcProfIds.some(function (id) { return otherIds.indexOf(id) !== -1; })) conflict = true;
    });
    if (conflict) {
      alert('Conflicto: uno de los profesores ya tiene clase en ' + tgtDia + ' tramo ' + tgtTramo + ' con otro grupo.');
      return;
    }

    var tgtSlot = (_s.schedule[grupo] && _s.schedule[grupo][tgtDia] && _s.schedule[grupo][tgtDia][tgtTramo]) || null;

    if (!tgtSlot) {
      _s.schedule[grupo][tgtDia][tgtTramo] = srcSlot;
      delete _s.schedule[srcGrupo][srcDia][srcTramo];
    } else {
      /* Intercambio: verificar conflicto inverso */
      var tgtProfIds = tgtSlot.codocente_prof_ids && tgtSlot.codocente_prof_ids.length
        ? tgtSlot.codocente_prof_ids : (tgtSlot.profesor_id ? [tgtSlot.profesor_id] : []);
      var conflict2 = false;
      Object.keys(_s.schedule).forEach(function (g) {
        if (g === grupo) return;
        var other = _s.schedule[g] && _s.schedule[g][srcDia] && _s.schedule[g][srcDia][srcTramo];
        if (!other) return;
        var otherIds = other.codocente_prof_ids && other.codocente_prof_ids.length
          ? other.codocente_prof_ids : (other.profesor_id ? [other.profesor_id] : []);
        if (tgtProfIds.some(function (id) { return otherIds.indexOf(id) !== -1; })) conflict2 = true;
      });
      if (conflict2) {
        alert('Conflicto de intercambio: el profesor del slot destino ya tiene clase en esa posición.');
        return;
      }
      _s.schedule[grupo][tgtDia][tgtTramo]    = srcSlot;
      _s.schedule[srcGrupo][srcDia][srcTramo] = tgtSlot;
    }

    _renderTablero();
  };

  window.plannerDropPool = function (e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!_s.dragData) return;
    var dia   = _s.dragData.dia;
    var tramo = _s.dragData.tramo;
    var grupo = _s.dragData.grupo;
    _s.dragData = null;
    if (_s.schedule[grupo] && _s.schedule[grupo][dia]) {
      delete _s.schedule[grupo][dia][tramo];
    }
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
        '<div class="planner-warning">' +
          '<strong>⚠ Atención:</strong> Publicar reemplazará los registros actuales en ' +
          '<code>horarios_grupo</code> para los grupos generados. ' +
          'El chatbot y el resto de módulos usarán el nuevo horario inmediatamente.' +
        '</div>' +
        (total === 0
          ? '<div class="planner-empty">Ve al Tablero, selecciona un grupo y pulsa "✨ Generar con IA".</div>'
          : '<button class="btn-ink btn-danger" id="planner-pub-btn" onclick="plannerPublicar()">Publicar horario en el centro</button>') +
        '<div id="planner-pub-msg" style="margin-top:14px;font-size:14px"></div>' +
      '</div>';
  }

  window.plannerPublicar = function () {
    if (!confirm('¿Publicar? Se sobreescribirán los horarios_grupo de los grupos generados.')) return;
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
            dia:              dia,
            tramo:            tr,
            hora_inicio:      HORA_INICIO[tr],
            hora_fin:         HORA_FIN[tr],
            actividad_nombre: slot.materia_nombre,
            profesor_nombre:  slot.profesor_nombre,
            aula:             ''
          });
        });
      });
    });

    var grupos = [...new Set(rows.map(function (r) { return r.grupo_horario; }))];

    (async function () {
      try {
        for (var i = 0; i < grupos.length; i++) {
          await sb.from('horarios_grupo').delete().eq('centro_id', ctrId).eq('grupo_horario', grupos[i]);
        }
        if (rows.length) {
          var r = await sb.from('horarios_grupo').insert(rows);
          if (r.error) throw r.error;
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar horario en el centro'; }
        if (msg) msg.innerHTML =
          '<span style="color:var(--success)">✓ Horario publicado — ' + rows.length + ' sesiones en ' + grupos.length + ' grupos.</span>';
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar horario en el centro'; }
        if (msg) msg.innerHTML =
          '<span style="color:var(--danger)">Error al publicar: ' + _esc(err && err.message ? err.message : String(err)) + '</span>';
      }
    })();
  };

})();
