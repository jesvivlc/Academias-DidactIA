/* js/planner.js — DidactIA Planner: generador de horarios con CSP + drag & drop */
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
    materias:    [],
    profesores:  [],
    necesidades: [],
    grupos:      [],
    schedule:    {},   // grupo → dia → String(tramo) → slot
    currentGrupo: null,
    dragData:    null,
    ptab:        'materias'
  };

  /* ════════════════════════════════
     INIT
  ════════════════════════════════ */
  window.initPlannerPanel = function () {
    _loadData().then(() => _showPTab(_s.ptab));
  };

  async function _loadData() {
    const [mR, pR, nR] = await Promise.all([
      sb.from('materias').select('*').eq('centro_id', ctrId).order('nombre'),
      sb.from('profesores').select('*').eq('centro_id', ctrId).eq('activo', true).order('nombre'),
      sb.from('necesidades_lectivas')
        .select('*, materias(nombre,color), profesores(nombre)')
        .eq('centro_id', ctrId)
    ]);
    _s.materias   = mR.data  || [];
    _s.profesores = pR.data  || [];
    _s.necesidades = (nR.data || []).map(n => ({
      ...n,
      materia_nombre:  n.materias?.nombre  || '?',
      materia_color:   n.materias?.color   || '#1a56db',
      profesor_nombre: n.profesores?.nombre || '?'
    }));
    _s.grupos = [...new Set(_s.necesidades.map(n => n.grupo_horario))].sort();
    if (!_s.currentGrupo && _s.grupos.length) _s.currentGrupo = _s.grupos[0];
  }

  /* ── Sub-tabs ── */
  window.showPTab = _showPTab;
  function _showPTab(tab) {
    _s.ptab = tab;
    document.querySelectorAll('#panel-planner .pt-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('#panel-planner .planner-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.ptab === tab));
    const panel = document.getElementById('pt-' + tab);
    if (!panel) return;
    panel.style.display = 'block';
    if (tab === 'materias')    _renderMaterias();
    if (tab === 'necesidades') _renderNecesidades();
    if (tab === 'tablero')     _renderTablero();
    if (tab === 'publicar')    _renderPublicar();
  }

  /* ════════════════════════════════
     MATERIAS — CRUD
  ════════════════════════════════ */
  function _renderMaterias() {
    const el = document.getElementById('pt-materias');
    if (!el) return;
    const rows = _s.materias.map(m => `
      <div class="planner-list-row">
        <span class="planner-color-dot" style="background:${_esc(m.color)}"></span>
        <span style="flex:1;font-weight:500">${_esc(m.nombre)}</span>
        <input type="color" value="${_esc(m.color)}" title="Cambiar color"
          onchange="plannerUpdateColor('${m.id}',this.value)"
          style="width:28px;height:28px;border:1px solid var(--line);border-radius:6px;cursor:pointer;padding:2px">
        <button class="icon-btn-sm" onclick="plannerDeleteMateria('${m.id}')">✕</button>
      </div>`).join('');
    el.innerHTML = `
      <div class="planner-section-hdr">
        <div>
          <div class="card-eyebrow">Configuración</div>
          <h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Materias del centro</h3>
        </div>
        <button class="btn-ink" onclick="plannerAddMateria()">+ Nueva materia</button>
      </div>
      <div class="planner-add-inline" style="margin-bottom:20px">
        <input id="pm-nombre" class="planner-input" placeholder="Nombre de la materia" style="flex:1;max-width:300px">
        <input id="pm-color" type="color" value="#1a56db" title="Color"
          style="width:38px;height:38px;border:1px solid var(--line);border-radius:8px;cursor:pointer;padding:3px">
        <button class="btn-ink" onclick="plannerAddMateria()">Añadir</button>
      </div>
      <div class="planner-list">
        ${_s.materias.length === 0
          ? '<div class="planner-empty">No hay materias. Añade la primera arriba.</div>'
          : rows}
      </div>`;
  }

  window.plannerAddMateria = function () {
    const nombre = (document.getElementById('pm-nombre')?.value || '').trim();
    const color  = document.getElementById('pm-color')?.value || '#1a56db';
    if (!nombre) { alert('Escribe el nombre de la materia.'); return; }
    sb.from('materias').insert({ centro_id: ctrId, nombre, color })
      .then(({ error }) => {
        if (error) return alert('Error: ' + error.message);
        if (document.getElementById('pm-nombre')) document.getElementById('pm-nombre').value = '';
        _loadData().then(() => _showPTab('materias'));
      });
  };

  window.plannerUpdateColor = function (id, color) {
    sb.from('materias').update({ color }).eq('id', id)
      .then(() => _loadData().then(() => _showPTab('materias')));
  };

  window.plannerDeleteMateria = function (id) {
    if (!confirm('¿Eliminar esta materia? Se borrarán también las necesidades asociadas.')) return;
    sb.from('materias').delete().eq('id', id)
      .then(() => _loadData().then(() => _showPTab('materias')));
  };

  /* ════════════════════════════════
     NECESIDADES LECTIVAS — CRUD
  ════════════════════════════════ */
  function _renderNecesidades() {
    const el = document.getElementById('pt-necesidades');
    if (!el) return;
    const matOpts = _s.materias.map(m =>
      `<option value="${m.id}">${_esc(m.nombre)}</option>`).join('');
    const profOpts = _s.profesores.map(p =>
      `<option value="${p.id}">${_esc(p.nombre)}</option>`).join('');
    const tbody = _s.necesidades.map(n => `
      <tr>
        <td><strong>${_esc(n.grupo_horario)}</strong></td>
        <td>
          <span class="planner-color-dot" style="background:${_esc(n.materia_color)};display:inline-block;vertical-align:middle;margin-right:6px"></span>
          ${_esc(n.materia_nombre)}
        </td>
        <td>${_esc(n.profesor_nombre)}</td>
        <td style="text-align:center;font-weight:500">${n.horas_semanales}</td>
        <td><button class="icon-btn-sm" onclick="plannerDeleteNec('${n.id}')">✕</button></td>
      </tr>`).join('');
    el.innerHTML = `
      <div class="planner-section-hdr">
        <div>
          <div class="card-eyebrow">Configuración</div>
          <h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Necesidades lectivas</h3>
        </div>
      </div>
      <div class="planner-form-inline" style="margin-bottom:20px;flex-wrap:wrap">
        <input id="pn-grupo" class="planner-input" placeholder="Grupo (ej: 1ESOA)" style="width:140px">
        <select id="pn-materia" class="planner-select">${matOpts || '<option value="">— sin materias —</option>'}</select>
        <select id="pn-profesor" class="planner-select">${profOpts || '<option value="">— sin profesores —</option>'}</select>
        <input id="pn-horas" type="number" min="1" max="10" value="3" class="planner-input" style="width:80px" placeholder="H/sem">
        <button class="btn-ink" onclick="plannerAddNec()">+ Añadir</button>
      </div>
      ${_s.necesidades.length === 0
        ? '<div class="planner-empty">No hay necesidades definidas. Añade la primera.</div>'
        : `<table class="planner-table">
            <thead><tr><th>Grupo</th><th>Materia</th><th>Profesor</th><th>H/sem</th><th></th></tr></thead>
            <tbody>${tbody}</tbody>
           </table>`}`;
  }

  window.plannerAddNec = function () {
    const grupo  = (document.getElementById('pn-grupo')?.value || '').trim().toUpperCase();
    const mat    = document.getElementById('pn-materia')?.value;
    const prof   = document.getElementById('pn-profesor')?.value;
    const horas  = parseInt(document.getElementById('pn-horas')?.value) || 0;
    if (!grupo || !mat || !prof || horas < 1) {
      alert('Completa todos los campos correctamente.'); return;
    }
    sb.from('necesidades_lectivas')
      .insert({ centro_id: ctrId, grupo_horario: grupo, materia_id: mat, profesor_id: prof, horas_semanales: horas })
      .then(({ error }) => {
        if (error) return alert('Error: ' + error.message);
        _loadData().then(() => _showPTab('necesidades'));
      });
  };

  window.plannerDeleteNec = function (id) {
    sb.from('necesidades_lectivas').delete().eq('id', id)
      .then(() => _loadData().then(() => _showPTab('necesidades')));
  };

  /* ════════════════════════════════
     MOTOR CSP — BACKTRACKING
  ════════════════════════════════ */

  function _generarHorario(grupo) {
    const necs = _s.necesidades.filter(n => n.grupo_horario === grupo);
    if (!necs.length) return null;

    // Expandir en sesiones individuales
    const sessions = [];
    necs.forEach(n => {
      for (let i = 0; i < n.horas_semanales; i++) {
        sessions.push({
          materia_id:      n.materia_id,
          materia_nombre:  n.materia_nombre,
          materia_color:   n.materia_color,
          profesor_id:     n.profesor_id,
          profesor_nombre: n.profesor_nombre
        });
      }
    });
    // Más restringidas primero (más sesiones de esa materia → más difícil colocar)
    sessions.sort((a, b) => {
      const cA = necs.find(n => n.materia_id === a.materia_id)?.horas_semanales || 0;
      const cB = necs.find(n => n.materia_id === b.materia_id)?.horas_semanales || 0;
      return cB - cA;
    });

    // Mapa de slots ocupados por profesores en OTROS grupos ya generados
    const teacherBusy = {};
    Object.keys(_s.schedule).forEach(g => {
      if (g === grupo) return;
      DIAS.forEach(d => {
        Object.keys(_s.schedule[g]?.[d] || {}).forEach(t => {
          const slot = _s.schedule[g][d][t];
          if (!slot) return;
          if (!teacherBusy[slot.profesor_id]) teacherBusy[slot.profesor_id] = new Set();
          teacherBusy[slot.profesor_id].add(d + '_' + t);
        });
      });
    });

    const grupoSched = {};
    DIAS.forEach(d => { grupoSched[d] = {}; });

    return _resolverCSP(sessions, 0, grupoSched, teacherBusy);
  }

  function _resolverCSP(sessions, idx, sched, teacherBusy) {
    if (idx >= sessions.length) return sched;
    const sess = sessions[idx];
    for (const dia of DIAS) {
      for (const tramo of TRAMOS) {
        const key = String(tramo);
        if (_esValido(sess, dia, key, sched, teacherBusy)) {
          sched[dia][key] = {
            materia_id:      sess.materia_id,
            materia_nombre:  sess.materia_nombre,
            materia_color:   sess.materia_color,
            profesor_id:     sess.profesor_id,
            profesor_nombre: sess.profesor_nombre
          };
          if (!teacherBusy[sess.profesor_id]) teacherBusy[sess.profesor_id] = new Set();
          teacherBusy[sess.profesor_id].add(dia + '_' + key);

          const res = _resolverCSP(sessions, idx + 1, sched, teacherBusy);
          if (res) return res;

          delete sched[dia][key];
          teacherBusy[sess.profesor_id].delete(dia + '_' + key);
        }
      }
    }
    return null;
  }

  function _esValido(sess, dia, key, sched, teacherBusy) {
    // ① Slot ya ocupado para el grupo
    if (sched[dia][key]) return false;
    // ② Profesor ocupado en otro grupo ese tramo
    if (teacherBusy[sess.profesor_id]?.has(dia + '_' + key)) return false;
    // ③ Misma materia no dos veces el mismo día
    for (const t of TRAMOS) {
      const s = sched[dia][String(t)];
      if (s && s.materia_id === sess.materia_id) return false;
    }
    return true;
  }

  /* ════════════════════════════════
     TABLERO — Grid + Drag & Drop
  ════════════════════════════════ */
  function _renderTablero() {
    const el = document.getElementById('pt-tablero');
    if (!el) return;
    const grupoOpts = _s.grupos.map(g =>
      `<option value="${_esc(g)}" ${g === _s.currentGrupo ? 'selected' : ''}>${_esc(g)}</option>`
    ).join('');
    el.innerHTML = `
      <div class="planner-section-hdr">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div>
            <div class="card-eyebrow">Generador</div>
            <h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Tablero de horario</h3>
          </div>
          ${_s.grupos.length
            ? `<select id="planner-grupo-sel" class="planner-select" onchange="plannerChangeGrupo(this.value)" style="margin-top:6px">${grupoOpts}</select>`
            : ''}
        </div>
        <button class="btn-ink" id="planner-gen-btn" onclick="plannerGenerar()" ${!_s.grupos.length ? 'disabled' : ''}>
          ✨ Generar con IA
        </button>
      </div>
      ${_s.grupos.length === 0
        ? '<div class="planner-empty">Define necesidades lectivas primero (pestaña Necesidades).</div>'
        : `<div style="overflow-x:auto">${_buildGrid()}</div>
           <div class="unassigned-pool" id="planner-pool"
             ondragover="plannerDragOver(event)"
             ondragleave="plannerDragLeave(event)"
             ondrop="plannerDropPool(event)">
             <div class="card-eyebrow" style="margin-bottom:6px">Zona libre — arrastra aquí para quitar una sesión</div>
             <div id="planner-pool-inner" style="min-height:32px"></div>
           </div>`}`;
  }

  function _buildGrid() {
    const g = _s.currentGrupo;
    if (!g) return '';
    if (!_s.schedule[g]) {
      _s.schedule[g] = {};
      DIAS.forEach(d => { _s.schedule[g][d] = {}; });
    }
    const hdrs = DIAS.map(d =>
      `<div class="planner-hdr-cell">${d.charAt(0).toUpperCase() + d.slice(1)}</div>`
    ).join('');
    const rows = TRAMOS.map(tramo => {
      const key = String(tramo);
      const cells = DIAS.map(dia => {
        const slot = _s.schedule[g]?.[dia]?.[key];
        const card = slot
          ? `<div class="class-card" draggable="true"
               style="border-left-color:${_esc(slot.materia_color)}"
               data-dia="${_esc(dia)}" data-tramo="${key}" data-grupo="${_esc(g)}"
               ondragstart="plannerDragStart(event,this)"
               ondragend="plannerDragEnd(event)">
               <div class="class-card__mat">${_esc(slot.materia_nombre)}</div>
               <div class="class-card__prof">${_esc(slot.profesor_nombre)}</div>
             </div>`
          : '';
        return `<div class="planner-cell" data-dia="${_esc(dia)}" data-tramo="${key}"
                  ondragover="plannerDragOver(event)"
                  ondragleave="plannerDragLeave(event)"
                  ondrop="plannerDrop(event,'${_esc(g)}')">${card}</div>`;
      }).join('');
      return `<div class="planner-row-label">${_esc(TRAMOS_HORA[tramo])}</div>${cells}`;
    }).join('');
    return `<div class="planner-grid"
              id="planner-grid"
              style="grid-template-columns:100px repeat(5,1fr)">
              <div class="planner-hdr-cell planner-hdr-hora">Hora</div>${hdrs}${rows}
            </div>`;
  }

  window.plannerChangeGrupo = function (g) {
    _s.currentGrupo = g;
    _renderTablero();
  };

  window.plannerGenerar = function () {
    const g = _s.currentGrupo;
    if (!g) return;
    const btn = document.getElementById('planner-gen-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }

    /* Cede el hilo para que el navegador actualice el botón */
    setTimeout(function () {
      const result = _generarHorario(g);
      if (btn) { btn.disabled = false; btn.textContent = '✨ Generar con IA'; }
      if (!result) {
        alert('No se encontró solución con las restricciones actuales.\n\nComprueba que ningún profesor esté asignado a más horas de las disponibles en la semana (5 días × 8 tramos = 40 máx.) y que no haya conflictos entre grupos.');
        return;
      }
      _s.schedule[g] = result;
      _guardarHorarioGenerado(g, result);
      _renderTablero();
    }, 40);
  };

  async function _guardarHorarioGenerado(grupo, sched) {
    await sb.from('horario_generado').delete().eq('centro_id', ctrId).eq('grupo_horario', grupo);
    const rows = [];
    DIAS.forEach(dia => {
      Object.keys(sched[dia] || {}).forEach(t => {
        const slot = sched[dia][t];
        if (!slot) return;
        rows.push({
          centro_id: ctrId, grupo_horario: grupo,
          materia_id: slot.materia_id, profesor_id: slot.profesor_id,
          dia_semana: dia, tramo_horario: parseInt(t)
        });
      });
    });
    if (rows.length) await sb.from('horario_generado').insert(rows);
  }

  /* ── Drag & Drop ── */
  window.plannerDragStart = function (e, el) {
    _s.dragData = {
      dia:   el.dataset.dia,
      tramo: el.dataset.tramo,
      grupo: el.dataset.grupo
    };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (el) el.style.opacity = '0.4'; }, 0);
  };

  window.plannerDragEnd = function () {
    if (_s.dragData) {
      const src = document.querySelector(
        `.class-card[data-dia="${_s.dragData.dia}"][data-tramo="${_s.dragData.tramo}"]`);
      if (src) src.style.opacity = '';
    }
    document.querySelectorAll('.planner-cell').forEach(c =>
      c.classList.remove('drag-over', 'drag-error'));
    document.getElementById('planner-pool')?.classList.remove('drag-over');
  };

  window.plannerDragOver = function (e) {
    e.preventDefault();
    const cell = e.currentTarget;
    if (cell.classList.contains('planner-cell')) {
      const occupied = !!_s.schedule[_s.currentGrupo]?.[cell.dataset.dia]?.[cell.dataset.tramo];
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
    const cell = e.currentTarget;
    cell.classList.remove('drag-over', 'drag-error');
    if (!_s.dragData) return;

    const { dia: srcDia, tramo: srcTramo, grupo: srcGrupo } = _s.dragData;
    const tgtDia   = cell.dataset.dia;
    const tgtTramo = cell.dataset.tramo;
    _s.dragData = null;

    if (srcDia === tgtDia && srcTramo === tgtTramo && srcGrupo === grupo) return;

    const srcSlot = _s.schedule[srcGrupo]?.[srcDia]?.[srcTramo];
    if (!srcSlot) return;

    // Verificar conflicto: el profesor del slot origen ocupa el slot destino en otro grupo
    let conflict = false;
    Object.keys(_s.schedule).forEach(g => {
      if (g === srcGrupo) return;
      if (_s.schedule[g]?.[tgtDia]?.[tgtTramo]?.profesor_id === srcSlot.profesor_id) {
        conflict = true;
      }
    });
    if (conflict) {
      alert('Conflicto: ese profesor ya tiene clase en ' + tgtDia + ' tramo ' + tgtTramo + ' con otro grupo.');
      return;
    }

    const tgtSlot = _s.schedule[grupo]?.[tgtDia]?.[tgtTramo] || null;

    // Destino vacío → mover
    if (!tgtSlot) {
      _s.schedule[grupo][tgtDia][tgtTramo] = srcSlot;
      delete _s.schedule[srcGrupo][srcDia][srcTramo];
    } else {
      // Intercambio — verificar que profesor del destino no ocupe el slot origen en otro grupo
      let conflict2 = false;
      Object.keys(_s.schedule).forEach(g => {
        if (g === grupo) return;
        if (_s.schedule[g]?.[srcDia]?.[srcTramo]?.profesor_id === tgtSlot.profesor_id) conflict2 = true;
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
    const { dia, tramo, grupo } = _s.dragData;
    _s.dragData = null;
    if (_s.schedule[grupo]?.[dia]) delete _s.schedule[grupo][dia][tramo];
    _renderTablero();
  };

  /* ════════════════════════════════
     PUBLICAR — escribir en horarios_grupo
  ════════════════════════════════ */
  function _renderPublicar() {
    const el = document.getElementById('pt-publicar');
    if (!el) return;
    const grupos = Object.keys(_s.schedule);
    const total  = grupos.reduce((acc, g) =>
      acc + DIAS.reduce((a, d) => a + Object.keys(_s.schedule[g]?.[d] || {}).length, 0), 0);

    el.innerHTML = `
      <div class="planner-section-hdr">
        <div>
          <div class="card-eyebrow">Paso final</div>
          <h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;margin:4px 0 0">Publicar horario</h3>
        </div>
      </div>
      <div class="planner-publish-summary">
        <div class="planner-stat-row">
          <div class="planner-stat">
            <div class="planner-stat-n">${grupos.length}</div>
            <div class="planner-stat-l">Grupos</div>
          </div>
          <div class="planner-stat">
            <div class="planner-stat-n">${total}</div>
            <div class="planner-stat-l">Sesiones</div>
          </div>
          <div class="planner-stat">
            <div class="planner-stat-n">${_s.necesidades.length}</div>
            <div class="planner-stat-l">Necesidades</div>
          </div>
        </div>
        <div class="planner-warning">
          <strong>⚠ Atención:</strong> Publicar reemplazará los registros actuales en
          <code>horarios_grupo</code> para los grupos generados.
          El chatbot y el resto de módulos usarán el nuevo horario inmediatamente.
        </div>
        ${total === 0
          ? '<div class="planner-empty">Ve al Tablero, selecciona un grupo y pulsa "✨ Generar con IA".</div>'
          : `<button class="btn-ink btn-danger" id="planner-pub-btn" onclick="plannerPublicar()">
               Publicar horario en el centro
             </button>`}
        <div id="planner-pub-msg" style="margin-top:14px;font-size:14px"></div>
      </div>`;
  }

  window.plannerPublicar = function () {
    if (!confirm('¿Publicar? Se sobreescribirán los horarios_grupo de los grupos generados.')) return;
    const btn = document.getElementById('planner-pub-btn');
    const msg = document.getElementById('planner-pub-msg');
    if (btn) { btn.disabled = true; btn.textContent = 'Publicando…'; }

    const rows = [];
    Object.keys(_s.schedule).forEach(grupo => {
      DIAS.forEach(dia => {
        Object.keys(_s.schedule[grupo]?.[dia] || {}).forEach(t => {
          const slot = _s.schedule[grupo][dia][t];
          if (!slot) return;
          const tr = parseInt(t);
          rows.push({
            centro_id: ctrId, grupo_horario: grupo, dia,
            tramo: tr,
            hora_inicio: HORA_INICIO[tr], hora_fin: HORA_FIN[tr],
            actividad_nombre: slot.materia_nombre,
            profesor_nombre:  slot.profesor_nombre,
            aula: ''
          });
        });
      });
    });

    const grupos = [...new Set(rows.map(r => r.grupo_horario))];

    (async () => {
      try {
        for (const g of grupos) {
          await sb.from('horarios_grupo').delete()
            .eq('centro_id', ctrId).eq('grupo_horario', g);
        }
        if (rows.length) {
          const { error } = await sb.from('horarios_grupo').insert(rows);
          if (error) throw error;
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar horario en el centro'; }
        if (msg) msg.innerHTML =
          `<span style="color:var(--success)">✓ Horario publicado — ${rows.length} sesiones en ${grupos.length} grupos.</span>`;
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar horario en el centro'; }
        if (msg) msg.innerHTML =
          `<span style="color:var(--danger)">Error al publicar: ${_esc(err.message)}</span>`;
      }
    })();
  };

})();
