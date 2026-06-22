/* Módulo Agenda del Centro — vista de calendario unificado */

window.initAgenda = function () {
  const el = document.getElementById('panel-agenda');
  if (!el) return;
  _agEnsureStyles();

  const now = new Date();
  window._agYear   = now.getFullYear();
  window._agMonth  = now.getMonth();
  window._agEvents = [];
  window._agSelFecha = now.toISOString().split('T')[0];

  el.innerHTML = `
    <div class="ag-page">
      <div class="ag-hdr" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div class="ag-eyebrow">CENTRO · AGENDA</div>
          <h1 class="ag-title">Agenda del Centro</h1>
          <p class="ag-sub">Sustituciones · Tutorías · Salidas · Ausencias · Eventos del centro</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${_agPuedeGestionar() ? '<button class="ag-nav-btn" style="white-space:nowrap;font-size:12px;padding:7px 12px;background:#1F7A8C;color:#fff;border-color:#1F7A8C;" onclick="window._agNuevoEvento()">+ Nuevo evento</button>' : ''}
          <button class="ag-nav-btn" style="white-space:nowrap;font-size:12px;padding:7px 12px;" onclick="window._agExportICS()" title="Exportar el mes a tu calendario (Google/Apple/Outlook)">📅 Exportar .ics</button>
        </div>
      </div>
      <div class="ag-body">
        <div class="ag-split">
          <div class="ag-left" id="ag-left"><div class="ag-loading">Cargando…</div></div>
          <div class="ag-right" id="ag-right">
            <div class="ag-day-placeholder">← Selecciona un día del calendario</div>
          </div>
        </div>
      </div>
    </div>`;

  _agLoadMonth();
};

/* ── NAVEGACIÓN ── */
window._agNavMonth = function (delta) {
  window._agMonth += delta;
  if (window._agMonth < 0)  { window._agMonth = 11; window._agYear--; }
  if (window._agMonth > 11) { window._agMonth = 0;  window._agYear++; }
  _agLoadMonth();
};

async function _agLoadMonth() {
  const y = window._agYear;
  const m = window._agMonth;
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastD = new Date(y, m + 1, 0).getDate();
  const to   = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;

  const left = document.getElementById('ag-left');
  if (!left) return;
  left.innerHTML = '<div class="ag-loading">Cargando…</div>';

  try {
    window._agEvents = await _agFetchEvents(from, to);
  } catch (e) {
    window._agEvents = [];
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const isFamilia = window.role === 'familia';

  left.innerHTML = `
    <div class="ag-cal-nav">
      <button class="ag-nav-btn" onclick="window._agNavMonth(-1)">‹</button>
      <span class="ag-cal-ttl">${MESES[m]} ${y}</span>
      <button class="ag-nav-btn" onclick="window._agNavMonth(1)">›</button>
    </div>
    <div class="ag-legend">
      <span class="ag-leg"><span class="ag-dot ag-c-danger"></span>Sust. sin cubrir</span>
      <span class="ag-leg"><span class="ag-dot ag-c-ok"></span>Sust. cubiertas</span>
      <span class="ag-leg"><span class="ag-dot ag-c-tut"></span>Tutorías</span>
      <span class="ag-leg"><span class="ag-dot ag-c-info"></span>Salidas</span>
      <span class="ag-leg"><span class="ag-dot ag-c-evt"></span>Eventos</span>
      ${!isFamilia ? '<span class="ag-leg"><span class="ag-dot ag-c-warning"></span>Ausencias</span>' : ''}
    </div>
    ${_agBuildGrid(y, m, window._agEvents)}`;

  // Auto-select today or previously selected date if in range
  const today = new Date().toISOString().split('T')[0];
  const sel = (window._agSelFecha >= from && window._agSelFecha <= to) ? window._agSelFecha : (today >= from && today <= to ? today : null);
  if (sel) _agShowDay(sel, false);
}

/* ── GRILLA DEL MES ── */
function _agBuildGrid(y, m, events) {
  const dayMap = {};
  events.forEach(e => { (dayMap[e.fecha] = dayMap[e.fecha] || []).push(e); });

  const firstDow = new Date(y, m, 1).getDay(); // 0=Sun
  const leading  = firstDow === 0 ? 6 : firstDow - 1; // Mon=0
  const totalD   = new Date(y, m + 1, 0).getDate();
  const today    = new Date().toISOString().split('T')[0];

  let html = '<div class="ag-cal-grid">';
  ['L','M','X','J','V','S','D'].forEach(d => html += `<div class="ag-cal-hdr">${d}</div>`);
  for (let i = 0; i < leading; i++) html += '<div class="ag-cal-cell ag-cell-empty"></div>';

  for (let d = 1; d <= totalD; d++) {
    const fecha = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs   = dayMap[fecha] || [];
    const isT   = fecha === today;
    const isS   = fecha === window._agSelFecha;
    const dots  = evs.slice(0, 5).map(e => `<span class="ag-dot ag-c-${e.color}"></span>`).join('');
    const more  = evs.length > 5 ? `<span class="ag-more">+${evs.length - 5}</span>` : '';
    html += `<div class="ag-cal-cell${isT ? ' ag-today' : ''}${isS ? ' ag-sel' : ''}" onclick="window._agClickDay('${fecha}')">
      <span class="ag-day-num">${d}</span>
      <div class="ag-dots">${dots}${more}</div>
    </div>`;
  }

  const total   = leading + totalD;
  const trail   = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < trail; i++) html += '<div class="ag-cal-cell ag-cell-empty"></div>';
  html += '</div>';
  return html;
}

/* ── CLIC DÍA ── */
window._agClickDay = function (fecha) {
  window._agSelFecha = fecha;
  document.querySelectorAll('.ag-cal-cell:not(.ag-cell-empty)').forEach(el => el.classList.remove('ag-sel'));
  const d = parseInt(fecha.split('-')[2]) - 1;
  const cells = document.querySelectorAll('.ag-cal-cell:not(.ag-cell-empty)');
  if (cells[d]) cells[d].classList.add('ag-sel');
  _agShowDay(fecha, true);
};

function _agShowDay(fecha, scrollToRight) {
  const right = document.getElementById('ag-right');
  if (!right) return;
  window._agSelFecha = fecha;

  const evs = (window._agEvents || []).filter(e => e.fecha === fecha);
  const [, mm, dd] = fecha.split('-');
  const MESES2 = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const titulo = `${parseInt(dd)} de ${MESES2[parseInt(mm) - 1]}`;
  const DOW    = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const diaSem = DOW[new Date(fecha + 'T12:00:00').getDay()];

  if (!evs.length) {
    right.innerHTML = `
      <div class="ag-day-hdr">
        <div><h3 class="ag-day-title">${titulo}</h3><div style="font-size:12px;color:var(--muted);text-transform:capitalize">${diaSem}</div></div>
      </div>
      <div class="ag-day-empty">Sin eventos este día.</div>`;
    if (scrollToRight && window.innerWidth <= 768) right.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const ORDER = { evento: 0, salida: 1, sust: 2, tut: 3, ausencia: 4 };
  evs.sort((a, b) => (ORDER[a.type] || 9) - (ORDER[b.type] || 9) || (a.hora || '').localeCompare(b.hora || ''));

  const ICONS = { sust: '🔄', tut: '📅', salida: '🚌', ausencia: '🏥', evento: '🗓️' };
  const NAVS  = { sust: "showTab('sust')", tut: "showTab('tutorias')", salida: "showTab('salidas')", ausencia: "showTab('rrhh')" };
  const puedeGest = _agPuedeGestionar();

  right.innerHTML = `
    <div class="ag-day-hdr">
      <div>
        <h3 class="ag-day-title">${titulo}</h3>
        <div style="font-size:12px;color:var(--muted);text-transform:capitalize">${diaSem}</div>
      </div>
      <span style="font-size:12px;color:var(--muted);background:var(--surface-sunk);padding:4px 10px;border-radius:20px">${evs.length} evento${evs.length > 1 ? 's' : ''}</span>
    </div>
    ${evs.map(e => {
      const esEvt = e.type === 'evento';
      const nav = esEvt ? '' : (NAVS[e.type] || '');
      const borrable = esEvt && puedeGest && e._id;
      return `
      <div class="ag-ev-card ag-ev-${e.color}"${nav ? ` onclick="${nav}"` : ' style="cursor:default"'}>
        <span class="ag-ev-icon">${ICONS[e.type] || '📌'}</span>
        <div class="ag-ev-body">
          <div class="ag-ev-label">${e.hora ? `<span style="color:var(--muted);font-weight:600">${_agEsc(e.hora)} · </span>` : ''}${_agEsc(e.label)}</div>
          <div class="ag-ev-detail">${_agEsc(e.detail)}</div>
        </div>
        ${borrable
          ? `<button class="ag-nav-btn" style="padding:3px 8px;font-size:12px;color:var(--danger)" title="Eliminar evento" onclick="event.stopPropagation();window._agBorrarEvento('${e._id}')">✕</button>`
          : (nav ? '<span class="ag-ev-arr">›</span>' : '')}
      </div>`;
    }).join('')}`;

  if (scrollToRight && window.innerWidth <= 768) right.scrollIntoView({ behavior: 'smooth' });
}

/* ── CARGA DE EVENTOS ── */
async function _agFetchEvents(from, to) {
  const ctrId    = window.ctrId;
  const isFam    = window.role === 'familia';
  const isProf   = window.role === 'profesional';
  const userId   = window.currentUser?.id;

  const [sustR, tutR, salR, ausR, evtR] = await Promise.all([
    // Sustituciones (familia: RLS filtra a grupos de sus hijos)
    window.sb.from('sustituciones')
      .select('id,fecha,tramo,grupo_horario,profesor_ausente,profesor_sustituto,cubierta')
      .eq('centro_id', ctrId).gte('fecha', from).lte('fecha', to).limit(500),

    // Tutorías (familia: RLS devuelve solo las suyas; staff: todas del centro)
    window.sb.from('tutoria_citas')
      .select('id,fecha,hora_inicio,hora_fin,alumno_nombre,grupo_horario,estado,tutor_id,familia_id')
      .eq('centro_id', ctrId).not('estado', 'eq', 'cancelada')
      .gte('fecha', from).lte('fecha', to).limit(300),

    // Salidas (familia: RLS devuelve solo publicadas)
    window.sb.from('salidas_didacticas')
      .select('id,titulo,fecha_salida,estado')
      .eq('centro_id', ctrId).gte('fecha_salida', from).lte('fecha_salida', to).limit(100),

    // Ausencias (solo staff — familia no tiene acceso por RLS)
    !isFam
      ? window.sb.from('ausencias_profesor')
          .select('id,fecha,fecha_fin,tipo,estado')
          .eq('centro_id', ctrId)
          .lte('fecha', to).gte('fecha_fin', from)
          .in('estado', ['pendiente', 'aprobada']).limit(200)
      : Promise.resolve({ data: [] }),

    // Eventos del centro (RLS: familia solo los visible_para='todos')
    window.sb.from('eventos_centro')
      .select('id,titulo,fecha,hora,tipo,descripcion,visible_para')
      .eq('centro_id', ctrId).gte('fecha', from).lte('fecha', to).limit(300),
  ]);

  const sust    = sustR.data || [];
  let   tut     = tutR.data  || [];
  const salidas = salR.data  || [];
  const aus     = ausR.data  || [];
  const eventos = evtR.data  || [];

  // Profesional: solo sus propias tutorías en el calendario personal
  if (isProf) tut = tut.filter(t => t.tutor_id === userId);

  const events = [];

  sust.forEach(s => events.push({
    type: 'sust', fecha: s.fecha, hora: s.tramo || '',
    color: s.cubierta ? 'ok' : 'danger',
    label: `Sustitución — ${s.grupo_horario || '—'}${s.tramo ? ' · ' + s.tramo : ''}`,
    detail: s.cubierta
      ? `✓ Cubierto por ${s.profesor_sustituto || '—'}`
      : `⚠ Ausente: ${s.profesor_ausente || '—'} · Sin cubrir`,
  }));

  tut.forEach(t => events.push({
    type: 'tut', fecha: t.fecha, hora: t.hora_inicio || '',
    color: 'tut',
    label: `Tutoría — ${t.alumno_nombre || 'Alumno'}${t.grupo_horario ? ' · ' + t.grupo_horario : ''}`,
    detail: `${(t.hora_inicio || '').slice(0, 5)}–${(t.hora_fin || '').slice(0, 5)} · ${t.estado || ''}`,
  }));

  salidas.forEach(s => events.push({
    type: 'salida', fecha: s.fecha_salida, hora: '07:00',
    color: 'info',
    label: s.titulo || 'Salida didáctica',
    detail: `Estado: ${s.estado || '—'}`,
  }));

  // Ausencias: expandir rango a días individuales
  aus.forEach(a => {
    if (!a.fecha) return;
    const dI = new Date(a.fecha + 'T12:00:00');
    const dF = new Date((a.fecha_fin || a.fecha) + 'T12:00:00');
    for (let d = new Date(dI); d <= dF; d.setDate(d.getDate() + 1)) {
      const fecha = d.toISOString().split('T')[0];
      if (fecha >= from && fecha <= to) {
        events.push({
          type: 'ausencia', fecha, hora: '08:00',
          color: a.estado === 'aprobada' ? 'warning' : 'muted',
          label: `Ausencia prof. — ${a.tipo || '—'}`,
          detail: a.estado === 'aprobada' ? 'Aprobada' : 'Pendiente de aprobación',
        });
      }
    }
  });

  const EVT_TIPO = {
    evento: 'Evento', reunion: 'Reunión', festivo: 'Festivo',
    evaluacion: 'Evaluación', plazo: 'Plazo', otro: 'Otro',
  };
  eventos.forEach(e => events.push({
    type: 'evento', fecha: e.fecha, hora: (e.hora || '').slice(0, 5),
    color: 'evt',
    label: e.titulo || 'Evento del centro',
    detail: [EVT_TIPO[e.tipo] || 'Evento', e.descripcion].filter(Boolean).join(' · '),
    _id: e.id, _gestionable: true,
  }));

  return events;
}

/* ── EXPORTAR A iCal (.ics) ── */
window._agExportICS = function () {
  const evs = window._agEvents || [];
  if (!evs.length) { if (typeof showToast === 'function') showToast('No hay eventos este mes'); return; }
  const escT = s => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DidactIA//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  evs.forEach((e, i) => {
    if (!e.fecha) return;
    const d = e.fecha.replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:didactia-' + e.type + '-' + i + '-' + d + '@didactia.eu');
    if (e.hora && /^\d{2}:\d{2}/.test(e.hora)) {
      const hh = parseInt(e.hora.slice(0, 2), 10), mm = parseInt(e.hora.slice(3, 5), 10);
      const pad = n => String(n).padStart(2, '0');
      lines.push('DTSTART:' + d + 'T' + pad(hh) + pad(mm) + '00');
      lines.push('DTEND:' + d + 'T' + pad((hh + 1) % 24) + pad(mm) + '00');
    } else {
      lines.push('DTSTART;VALUE=DATE:' + d);
    }
    lines.push('SUMMARY:' + escT(e.label));
    if (e.detail) lines.push('DESCRIPTION:' + escT(e.detail));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'agenda_didactia.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  if (typeof showToast === 'function') showToast('📅 Agenda exportada (.ics)');
};

/* ── EVENTOS DEL CENTRO (crear / borrar) ── */
function _agPuedeGestionar() {
  return ['admin', 'admin_institucional', 'director', 'jefatura', 'superadmin'].includes(window.role);
}

window._agNuevoEvento = function () {
  if (!_agPuedeGestionar()) return;
  const fecha = window._agSelFecha || new Date().toISOString().split('T')[0];
  const old = document.getElementById('ag-evt-modal');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'ag-evt-modal';
  wrap.className = 'ag-modal-ov';
  wrap.innerHTML = `
    <div class="ag-modal">
      <div class="ag-modal-hd">
        <h3>🗓️ Nuevo evento del centro</h3>
        <button class="ag-x" onclick="document.getElementById('ag-evt-modal').remove()">✕</button>
      </div>
      <div class="ag-modal-bd">
        <label class="ag-fl">Título *</label>
        <input id="ag-evt-titulo" class="ag-in" type="text" placeholder="Claustro, reunión, festivo…" maxlength="120">
        <div style="display:flex;gap:10px;">
          <div style="flex:1;">
            <label class="ag-fl">Fecha *</label>
            <input id="ag-evt-fecha" class="ag-in" type="date" value="${fecha}">
          </div>
          <div style="flex:1;">
            <label class="ag-fl">Hora <span style="color:var(--muted);font-weight:400">(opcional)</span></label>
            <input id="ag-evt-hora" class="ag-in" type="time">
          </div>
        </div>
        <div style="display:flex;gap:10px;">
          <div style="flex:1;">
            <label class="ag-fl">Tipo</label>
            <select id="ag-evt-tipo" class="ag-in">
              <option value="evento">Evento</option>
              <option value="reunion">Reunión / Claustro</option>
              <option value="evaluacion">Evaluación</option>
              <option value="plazo">Plazo</option>
              <option value="festivo">Festivo / No lectivo</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div style="flex:1;">
            <label class="ag-fl">Visible para</label>
            <select id="ag-evt-vis" class="ag-in">
              <option value="todos">Todos (incl. familias)</option>
              <option value="staff">Solo personal del centro</option>
            </select>
          </div>
        </div>
        <label class="ag-fl">Descripción <span style="color:var(--muted);font-weight:400">(opcional)</span></label>
        <textarea id="ag-evt-desc" class="ag-in" rows="2" placeholder="Detalles del evento…" maxlength="500"></textarea>
      </div>
      <div class="ag-modal-ft">
        <button class="ag-nav-btn" onclick="document.getElementById('ag-evt-modal').remove()">Cancelar</button>
        <button class="ag-nav-btn" style="background:#1F7A8C;color:#fff;border-color:#1F7A8C;" onclick="window._agGuardarEvento(this)">Guardar evento</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  setTimeout(() => { const t = document.getElementById('ag-evt-titulo'); if (t) t.focus(); }, 50);
};

window._agGuardarEvento = async function (btn) {
  const titulo = (document.getElementById('ag-evt-titulo')?.value || '').trim();
  const fecha  = document.getElementById('ag-evt-fecha')?.value || '';
  const horaR  = document.getElementById('ag-evt-hora')?.value || '';
  const tipo   = document.getElementById('ag-evt-tipo')?.value || 'evento';
  const vis    = document.getElementById('ag-evt-vis')?.value || 'todos';
  const desc   = (document.getElementById('ag-evt-desc')?.value || '').trim();
  if (!titulo) { if (typeof showToast === 'function') showToast('Indica un título'); return; }
  if (!fecha)  { if (typeof showToast === 'function') showToast('Indica una fecha'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  const { error } = await window.sb.from('eventos_centro').insert({
    centro_id:   window.ctrId,
    titulo,
    fecha,
    hora:        horaR || null,
    tipo,
    descripcion: desc || null,
    visible_para: vis,
    creado_por:  window.currentUser?.id || null,
  });
  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar evento'; }
    if (typeof showToast === 'function') showToast('Error: ' + error.message);
    return;
  }
  const modal = document.getElementById('ag-evt-modal');
  if (modal) modal.remove();
  if (typeof showToast === 'function') showToast('🗓️ Evento creado');
  window._agSelFecha = fecha;
  // Si el evento es de otro mes, navegar a él
  const d = new Date(fecha + 'T12:00:00');
  window._agYear = d.getFullYear();
  window._agMonth = d.getMonth();
  _agLoadMonth();
};

window._agBorrarEvento = async function (id) {
  if (!id || !_agPuedeGestionar()) return;
  if (!confirm('¿Eliminar este evento del centro?')) return;
  const { error } = await window.sb.from('eventos_centro').delete().eq('id', id);
  if (error) { if (typeof showToast === 'function') showToast('Error: ' + error.message); return; }
  if (typeof showToast === 'function') showToast('Evento eliminado');
  _agLoadMonth();
};

/* ── HELPERS ── */
function _agEsc(s) { return escH(s); } // delegado a utils.js

/* ── CSS ── */
function _agEnsureStyles() {
  if (document.getElementById('ag-styles')) return;
  const st = document.createElement('style');
  st.id = 'ag-styles';
  st.textContent = `
    .ag-page { display:flex;flex-direction:column;height:100%;overflow:hidden; }
    .ag-hdr  { flex:0 0 auto;padding:24px 28px 16px;border-bottom:1px solid var(--line);background:var(--paper); }
    .ag-eyebrow { font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px; }
    .ag-title { font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--txt);margin:0 0 2px; }
    .ag-sub   { font-size:13px;color:var(--muted);margin:0; }
    .ag-body  { flex:1;overflow:hidden;display:flex; }
    .ag-split { display:flex;width:100%;height:100%;overflow:hidden; }
    .ag-left  { width:340px;flex:0 0 340px;border-right:1px solid var(--line);overflow-y:auto;padding:18px 16px;background:var(--paper); }
    .ag-right { flex:1;min-width:0;overflow-y:auto;padding:20px 24px;background:var(--bg); }

    /* Nav mes */
    .ag-cal-nav { display:flex;align-items:center;justify-content:space-between;margin-bottom:10px; }
    .ag-cal-ttl { font-weight:700;font-size:15px;color:var(--txt); }
    .ag-nav-btn { background:none;border:1px solid var(--line);border-radius:8px;padding:5px 11px;cursor:pointer;font-size:15px;color:var(--txt2);transition:background .12s; }
    .ag-nav-btn:hover { background:var(--surface-sunk); }

    /* Leyenda */
    .ag-legend { display:flex;flex-wrap:wrap;gap:6px 10px;margin-bottom:12px; }
    .ag-leg    { display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted); }
    .ag-dot    { display:inline-block;width:7px;height:7px;border-radius:50%;flex:0 0 auto; }
    .ag-c-danger  { background:var(--danger); }
    .ag-c-ok      { background:var(--success); }
    .ag-c-tut     { background:#7A5C9E; }
    .ag-c-info    { background:var(--info); }
    .ag-c-warning { background:var(--warning); }
    .ag-c-evt     { background:#1F7A8C; }
    .ag-c-muted   { background:var(--muted-2); }

    /* Grid mes */
    .ag-cal-grid { display:grid;grid-template-columns:repeat(7,1fr);gap:2px; }
    .ag-cal-hdr  { text-align:center;padding:4px 2px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase; }
    .ag-cal-cell { min-height:52px;border:1px solid var(--line);border-radius:6px;padding:4px 5px;cursor:pointer;transition:background .12s,border-color .12s;background:var(--paper); }
    .ag-cal-cell:hover { background:var(--surface-sunk);border-color:var(--line-2); }
    .ag-cell-empty { background:transparent!important;border-color:transparent!important;cursor:default;pointer-events:none; }
    .ag-today { border-color:var(--ink)!important;background:color-mix(in srgb,var(--ink) 7%,var(--paper))!important; }
    .ag-sel   { background:color-mix(in srgb,var(--ink) 14%,var(--paper))!important;border-color:var(--ink)!important; }
    .ag-day-num { font-size:11px;font-weight:600;color:var(--txt2);display:block;margin-bottom:2px; }
    .ag-today .ag-day-num { color:var(--ink);font-weight:800; }
    .ag-sel .ag-day-num   { color:var(--ink); }
    .ag-dots  { display:flex;flex-wrap:wrap;gap:2px;align-items:center; }
    .ag-more  { font-size:8px;color:var(--muted-2);margin-left:1px; }

    /* Panel derecho */
    .ag-day-placeholder { text-align:center;padding:60px 20px;color:var(--muted);font-size:14px; }
    .ag-day-hdr  { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line); }
    .ag-day-title { font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--txt);margin:0;text-transform:capitalize; }
    .ag-day-empty { text-align:center;padding:40px 20px;color:var(--muted);font-size:14px; }

    /* Tarjetas de evento */
    .ag-ev-card { display:flex;align-items:center;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:13px 16px;margin-bottom:10px;cursor:pointer;transition:border-color .15s,background .15s;border-left:3px solid; }
    .ag-ev-card:hover { background:var(--surface-sunk);border-left-width:4px; }
    .ag-ev-danger  { border-left-color:var(--danger); }
    .ag-ev-ok      { border-left-color:var(--success); }
    .ag-ev-tut     { border-left-color:#7A5C9E; }
    .ag-ev-info    { border-left-color:var(--info); }
    .ag-ev-warning { border-left-color:var(--warning); }
    .ag-ev-evt     { border-left-color:#1F7A8C; }
    .ag-ev-muted   { border-left-color:var(--muted-2); }
    .ag-ev-icon  { font-size:18px;flex:0 0 auto; }
    .ag-ev-body  { flex:1;min-width:0; }
    .ag-ev-label { font-weight:600;font-size:13px;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    .ag-ev-detail{ font-size:12px;color:var(--muted);margin-top:2px; }
    .ag-ev-arr   { color:var(--muted-2);font-size:16px;flex:0 0 auto; }

    .ag-loading { text-align:center;padding:40px;color:var(--muted);font-size:13px; }

    /* Modal nuevo evento */
    .ag-modal-ov { position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px; }
    .ag-modal    { background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:480px;max-height:92vh;overflow:auto;border:1px solid var(--line); }
    .ag-modal-hd { display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line); }
    .ag-modal-hd h3 { margin:0;font-size:16px;font-weight:700;color:var(--txt); }
    .ag-x        { background:none;border:none;font-size:16px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px; }
    .ag-x:hover  { background:var(--surface-sunk); }
    .ag-modal-bd { padding:16px 18px;display:flex;flex-direction:column;gap:4px; }
    .ag-fl       { font-size:12px;font-weight:600;color:var(--txt2);margin:8px 0 3px; }
    .ag-in       { width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line-2);border-radius:8px;font-size:14px;font-family:inherit;background:var(--paper);color:var(--txt); }
    .ag-in:focus { outline:none;border-color:#1F7A8C;box-shadow:0 0 0 3px rgba(31,122,140,.12); }
    .ag-modal-ft { display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid var(--line); }

    @media(max-width:768px){
      .ag-split { flex-direction:column;overflow:auto; }
      .ag-left  { width:100%;flex:0 0 auto;border-right:none;border-bottom:1px solid var(--line); }
      .ag-right { flex:1; }
      .ag-hdr   { padding:16px 16px 12px; }
      .ag-cal-cell { min-height:44px; }
    }
  `;
  document.head.appendChild(st);
}
