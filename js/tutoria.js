/* Módulo Tutorías — reserva de citas tutor-familia */

window.initTutorias = function () {
  const el = document.getElementById('panel-tutorias');
  if (!el) return;
  _tutEnsureStyles();
  const r = window.role;
  if (r === 'profesional') _tutRenderProfesor(el);
  else if (r === 'familia') _tutRenderFamilia(el);
  else _tutRenderAdmin(el);
};

/* ── HELPERS ── */
function _tutEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _tutArg(s) {
  // Escapa para un string JS entre comillas simples dentro de un atributo on…="…"
  // (comillas dobles → &quot; para no romper el atributo; p.ej. nombres con ").
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
function _tutFechaLegible(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${meses[parseInt(m) - 1]} ${y}`;
}
function _tutEstadoBadge(estado) {
  const map = {
    solicitada: ['var(--warning-soft)', 'var(--warning)', 'Solicitada'],
    confirmada: ['var(--info-soft)', 'var(--info)', 'Confirmada'],
    realizada: ['var(--success-soft)', 'var(--success)', 'Realizada'],
    cancelada: ['var(--danger-soft)', 'var(--danger)', 'Cancelada'],
  };
  const [bg, c, label] = map[estado] || ['var(--surface-sunk)', 'var(--muted)', estado];
  return `<span style="background:${bg};color:${c};padding:2px 10px;border-radius:6px;font-size:11px;font-weight:600">${label}</span>`;
}
async function _tutPush(userIds, title, body) {
  try {
    const ids = (userIds || []).filter(Boolean);
    if (!ids.length) return;
    await fetch(`${window.SB_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.ANON_KEY}` },
      body: JSON.stringify({ user_ids: ids, title, body, tag: 'tutorias' }),
    });
  } catch (e) {}
}
function _tutToast(msg, isErr) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: isErr ? 'var(--danger)' : '#222', color: '#fff',
    padding: '10px 22px', borderRadius: '10px', fontSize: '13px', zIndex: '9999',
    boxShadow: '0 4px 20px rgba(0,0,0,.2)', maxWidth: '400px', textAlign: 'center',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ── CSS ── */
function _tutEnsureStyles() {
  if (document.getElementById('tut-styles')) return;
  const s = document.createElement('style');
  s.id = 'tut-styles';
  s.textContent = `
    .tut-page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .tut-hdr  { flex:0 0 auto; padding:24px 28px 0; border-bottom:1px solid var(--line); background:var(--paper); }
    .tut-eyebrow { font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px; }
    .tut-title { font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--txt);margin:0 0 2px; }
    .tut-sub   { font-size:13px;color:var(--muted);margin:0 0 16px; }
    .tut-tabs  { display:flex;gap:0;margin-top:0; }
    .tut-tab   { background:none;border:none;padding:10px 18px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;transition:color .15s,border-color .15s; }
    .tut-tab.tut-act { color:var(--ink);border-bottom-color:var(--ink);font-weight:600; }
    .tut-body  { flex:1;overflow-y:auto;padding:24px 28px;background:var(--bg); }
    .tut-card  { background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;margin-bottom:12px; }
    .tut-card-hdr { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px; }
    .tut-card-name { font-weight:600;font-size:14px;color:var(--txt); }
    .tut-card-meta { font-size:12px;color:var(--muted);margin-top:3px; }
    .tut-actions   { display:flex;gap:8px;margin-top:12px;flex-wrap:wrap; }
    .tut-btn       { border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s; }
    .tut-btn:hover { opacity:.82; }
    .tut-btn-ok     { background:var(--success);color:#fff; }
    .tut-btn-cancel { background:var(--danger-soft);color:var(--danger); }
    .tut-btn-done   { background:var(--surface-sunk);color:var(--txt2); }
    .tut-btn-ink    { background:var(--ink);color:#fff; }
    .tut-empty { text-align:center;padding:48px 20px;color:var(--muted);font-size:14px; }
    .tut-form  { display:flex;flex-direction:column;gap:14px;max-width:520px; }
    .tut-form label { font-size:12px;font-weight:600;color:var(--muted);margin-bottom:3px;display:block; }
    .tut-form input, .tut-form select, .tut-form textarea
      { width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;background:var(--paper);color:var(--txt);box-sizing:border-box; }
    .tut-form textarea { min-height:72px;resize:vertical; }
    .tut-r2 { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
    .tut-slot-grid { display:flex;flex-wrap:wrap;gap:8px;margin:10px 0; }
    .tut-slot { padding:8px 14px;border:1px solid var(--line);border-radius:8px;font-size:13px;cursor:pointer;background:var(--paper);transition:background .12s,border-color .12s; }
    .tut-slot:hover { border-color:var(--ink);background:var(--accent-soft); }
    .tut-slot.tut-slot-sel { background:var(--ink);color:#fff;border-color:var(--ink); }
    .tut-slot.tut-slot-taken { background:var(--surface-sunk);color:var(--muted-2);cursor:not-allowed;text-decoration:line-through; }
    .tut-disp-row { display:flex;align-items:center;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-bottom:8px; }
    .tut-disp-info { flex:1; }
    .tut-disp-label { font-weight:600;font-size:13px;color:var(--txt); }
    .tut-disp-hora  { font-size:12px;color:var(--muted);margin-top:2px; }
    .tut-chips { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px; }
    .tut-chip { padding:6px 14px;border-radius:20px;border:1px solid var(--line);font-size:12px;font-weight:500;cursor:pointer;background:var(--paper);color:var(--txt2);transition:background .12s,color .12s; }
    .tut-chip.tut-chip-act { background:var(--ink);color:#fff;border-color:var(--ink); }
    .tut-info-box { background:var(--info-soft);border:1px solid var(--info);border-radius:10px;padding:14px 16px;margin-bottom:18px; }
    .tut-info-box strong { font-size:13px;font-weight:600;color:var(--info);display:block;margin-bottom:4px; }
    .tut-info-box span { font-size:13px;color:var(--txt); }
    .tut-section-lbl { font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:0 0 12px; }
    .tut-notes-inp { width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-size:12px;background:var(--paper);color:var(--txt);box-sizing:border-box; }
    @media(max-width:640px){
      .tut-hdr { padding:18px 16px 0; }
      .tut-body { padding:16px; }
      .tut-r2 { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════ VISTA PROFESIONAL ═══════════════════════ */
async function _tutRenderProfesor(el) {
  el.innerHTML = `
    <div class="tut-page">
      <div class="tut-hdr">
        <div class="tut-eyebrow">DOCENCIA · TUTORÍAS</div>
        <h1 class="tut-title">Tutorías</h1>
        <p class="tut-sub">Gestiona tus citas con familias y configura tu horario de disponibilidad.</p>
        <div class="tut-tabs">
          <button class="tut-tab tut-act" onclick="window._tutProfTab('citas',this)">📅 Mis citas</button>
          <button class="tut-tab" onclick="window._tutProfTab('disp',this)">🕐 Mi disponibilidad</button>
        </div>
      </div>
      <div class="tut-body">
        <div id="tut-pane-citas"></div>
        <div id="tut-pane-disp" style="display:none"></div>
      </div>
    </div>`;
  _tutLoadCitasProfesor();
}

window._tutProfTab = function (tab, btn) {
  document.querySelectorAll('.tut-tab').forEach(b => b.classList.remove('tut-act'));
  btn.classList.add('tut-act');
  const pc = document.getElementById('tut-pane-citas');
  const pd = document.getElementById('tut-pane-disp');
  if (pc) pc.style.display = tab === 'citas' ? '' : 'none';
  if (pd) pd.style.display = tab === 'disp' ? '' : 'none';
  if (tab === 'disp') _tutLoadDispProfesor();
};

async function _tutLoadCitasProfesor() {
  const pane = document.getElementById('tut-pane-citas');
  if (!pane) return;
  pane.innerHTML = '<p style="color:var(--muted);font-size:13px">Cargando…</p>';
  try {
    const { data, error } = await window.sb.from('tutoria_citas')
      .select('*')
      .eq('centro_id', window.ctrId)
      .eq('tutor_id', window.currentUser.id)
      .not('estado', 'eq', 'cancelada')
      .order('fecha').order('hora_inicio')
      .limit(300);
    if (error) throw error;
    if (!data.length) { pane.innerHTML = '<div class="tut-empty">No tienes citas próximas.</div>'; return; }
    window._tutCitasCache = {};
    data.forEach(c => { window._tutCitasCache[c.id] = c; });
    const today = new Date().toISOString().split('T')[0];
    const upcoming = data.filter(c => c.fecha >= today);
    const atrasadas = data.filter(c => c.fecha < today && c.estado !== 'realizada');
    let html = '';
    if (upcoming.length) {
      html += `<h3 class="tut-section-lbl" style="margin-top:0">Próximas (${upcoming.length})</h3>`;
      html += upcoming.map(_tutCitaCardProf).join('');
    }
    if (atrasadas.length) {
      html += `<h3 class="tut-section-lbl" style="margin-top:20px">Sin confirmar / atrasadas</h3>`;
      html += atrasadas.map(_tutCitaCardProf).join('');
    }
    pane.innerHTML = html;
  } catch (e) {
    pane.innerHTML = '<div class="tut-empty">Error al cargar citas.</div>';
  }
}

function _tutCitaCardProf(c) {
  const acciones = [];
  if (c.estado === 'solicitada') {
    acciones.push(`<button class="tut-btn tut-btn-ok" onclick="window._tutConfirmar('${_tutArg(c.id)}','${_tutArg(c.familia_id)}','${_tutArg(c.alumno_nombre)}','${_tutArg(c.fecha)}','${_tutArg(c.hora_inicio)}')">✓ Confirmar</button>`);
    acciones.push(`<button class="tut-btn tut-btn-cancel" onclick="window._tutCancelarProf('${_tutArg(c.id)}','${_tutArg(c.familia_id)}','${_tutArg(c.alumno_nombre)}','${_tutArg(c.fecha)}','${_tutArg(c.hora_inicio)}')">✕ Cancelar</button>`);
  } else if (c.estado === 'confirmada') {
    acciones.push(`<button class="tut-btn tut-btn-done" onclick="window._tutMarcarRealizada('${_tutArg(c.id)}')">✓ Realizada</button>`);
    acciones.push(`<button class="tut-btn tut-btn-cancel" onclick="window._tutCancelarProf('${_tutArg(c.id)}','${_tutArg(c.familia_id)}','${_tutArg(c.alumno_nombre)}','${_tutArg(c.fecha)}','${_tutArg(c.hora_inicio)}')">✕ Cancelar</button>`);
  }
  // Acta PDF disponible en citas confirmadas o ya realizadas
  if (c.estado === 'confirmada' || c.estado === 'realizada') {
    acciones.push(`<button class="tut-btn" style="background:var(--surface-sunk);color:var(--txt2);" onclick="window._tutActaPDF('${_tutArg(c.id)}')">📄 Acta PDF</button>`);
  }
  const motivoHtml = c.motivo ? `<div style="font-size:12px;color:var(--muted);margin-top:4px">💬 ${_tutEsc(c.motivo)}</div>` : '';
  const notasHtml = `<div style="margin-top:10px"><input class="tut-notes-inp" id="notas-${c.id}" placeholder="Notas internas (solo para ti)…" value="${_tutEsc(c.notas_tutor || '')}" onblur="window._tutGuardarNotas('${_tutArg(c.id)}',this.value)"></div>`;
  return `
    <div class="tut-card" id="tut-cita-${c.id}">
      <div class="tut-card-hdr">
        <div>
          <div class="tut-card-name">${_tutEsc(c.alumno_nombre || 'Alumno')}${c.grupo_horario ? ' · ' + _tutEsc(c.grupo_horario) : ''}</div>
          <div class="tut-card-meta">📅 ${_tutFechaLegible(c.fecha)} · ⏰ ${(c.hora_inicio || '').slice(0, 5)}–${(c.hora_fin || '').slice(0, 5)}</div>
          ${motivoHtml}
        </div>
        <div>${_tutEstadoBadge(c.estado)}</div>
      </div>
      ${notasHtml}
      ${acciones.length ? `<div class="tut-actions">${acciones.join('')}</div>` : ''}
    </div>`;
}

window._tutConfirmar = async function (citaId, familiaId, alumnoNombre, fecha, horaIni) {
  const { error } = await window.sb.from('tutoria_citas')
    .update({ estado: 'confirmada' })
    .eq('id', citaId).eq('centro_id', window.ctrId);
  if (error) return _tutToast('Error al confirmar', true);
  _tutToast('✓ Cita confirmada');
  _tutPush([familiaId], '📅 Cita confirmada',
    `Tu cita para ${alumnoNombre} el ${_tutFechaLegible(fecha)} a las ${(horaIni || '').slice(0, 5)} ha sido confirmada.`);
  _tutLoadCitasProfesor();
};

window._tutCancelarProf = async function (citaId, familiaId, alumnoNombre, fecha, horaIni) {
  if (!confirm('¿Cancelar esta cita?')) return;
  const { error } = await window.sb.from('tutoria_citas')
    .update({ estado: 'cancelada', cancelada_por: 'tutor' })
    .eq('id', citaId).eq('centro_id', window.ctrId);
  if (error) return _tutToast('Error al cancelar', true);
  _tutToast('Cita cancelada');
  _tutPush([familiaId], '⚠️ Cita cancelada',
    `El tutor ha cancelado la cita de ${alumnoNombre} el ${_tutFechaLegible(fecha)} a las ${(horaIni || '').slice(0, 5)}.`);
  _tutLoadCitasProfesor();
};

window._tutMarcarRealizada = async function (citaId) {
  await window.sb.from('tutoria_citas')
    .update({ estado: 'realizada' })
    .eq('id', citaId).eq('centro_id', window.ctrId);
  _tutToast('✓ Marcada como realizada');
  _tutLoadCitasProfesor();
};

window._tutGuardarNotas = async function (citaId, notas) {
  await window.sb.from('tutoria_citas')
    .update({ notas_tutor: notas || null })
    .eq('id', citaId).eq('centro_id', window.ctrId);
  // Mantener la caché al día para el acta PDF
  if (window._tutCitasCache && window._tutCitasCache[citaId]) window._tutCitasCache[citaId].notas_tutor = notas || null;
};

// Acta de tutoría en PDF (cabecera logo+color del centro, reutiliza helpers de informes.js).
window._tutActaPDF = async function (citaId) {
  const c = (window._tutCitasCache || {})[citaId];
  if (!c) { _tutToast('No se encontró la cita.', true); return; }
  if (typeof _infEnsureLibs !== 'function') { _tutToast('Exportación no disponible.', true); return; }
  try {
    await _infEnsureLibs();
    const centro = await _infCentroInfo();
    const logoImg = await _infImgToDataURL(centro.logo);
    const rgb = _infHexToRgb(centro.color);
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Cabecera
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(0, 0, W, 26, 'F');
    let x = 12;
    if (logoImg && logoImg.dataURL) {
      try {
        let h = 16, w = h * (logoImg.w / logoImg.h);
        if (w > 38) { w = 38; h = w * (logoImg.h / logoImg.w); }
        doc.addImage(logoImg.dataURL, 'PNG', 12, 5, w, h); x = 12 + w + 6;
      } catch (e) {}
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont(undefined, 'bold');
    doc.text(centro.nombre || 'Centro', x, 11);
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text('ACTA DE TUTORÍA', x, 18);
    const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.setFontSize(8.5); doc.text(hoy, W - 12, 11, { align: 'right' });

    // Cuerpo: campos
    let y = 40;
    const field = (label, val) => {
      if (y > H - 30) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text(String(label).toUpperCase(), 12, y);
      doc.setFont(undefined, 'normal'); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(String(val || '—'), W - 24);
      doc.text(lines, 12, y + 6);
      y += 6 + lines.length * 5.6 + 6;
    };
    field('Alumno/a', (c.alumno_nombre || '—') + (c.grupo_horario ? ' · Grupo ' + c.grupo_horario : ''));
    field('Tutor/a', (typeof window.currentUserName !== 'undefined' ? window.currentUserName : '') || '—');
    field('Fecha y hora de la tutoría', _tutFechaLegible(c.fecha) + ' · ' + (c.hora_inicio || '').slice(0, 5) + '–' + (c.hora_fin || '').slice(0, 5));
    if (c.motivo) field('Motivo', c.motivo);
    field('Acuerdos y observaciones', c.notas_tutor || '(Sin notas registradas en la tutoría.)');

    // Firma
    y = Math.max(y + 6, H - 38);
    doc.setDrawColor(180, 180, 180); doc.line(12, y, 80, y);
    doc.setFontSize(9); doc.setTextColor(110, 110, 110); doc.text('Firma del tutor/a', 12, y + 5);

    // Pie
    doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text(centro.nombre || 'Centro', 12, H - 8);
    doc.text('Generado por DidactIA', W - 12, H - 8, { align: 'right' });

    const safe = (c.alumno_nombre || 'alumno').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
    doc.save('acta_tutoria_' + safe + '_' + c.fecha + '.pdf');
    _tutToast('✓ Acta descargada');
  } catch (e) {
    _tutToast('No se pudo generar el acta.', true);
  }
};

/* ── DISPONIBILIDAD TUTOR ── */
const _DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

async function _tutLoadDispProfesor() {
  const pane = document.getElementById('tut-pane-disp');
  if (!pane) return;
  pane.innerHTML = '<p style="color:var(--muted);font-size:13px">Cargando…</p>';
  try {
    const [{ data: disp }, { data: hg }] = await Promise.all([
      window.sb.from('tutoria_disponibilidad')
        .select('*').eq('centro_id', window.ctrId).eq('tutor_id', window.currentUser.id)
        .order('dia_semana').order('hora_inicio'),
      window.sb.from('horarios_grupo')
        .select('grupo_horario')
        .eq('centro_id', window.ctrId)
        .eq('curso_escolar', window.cursoActivo || '2025-26')
        .ilike('profesor_nombre', `%${(window.currentUserName || '').split(' ')[0]}%`),
    ]);
    const grupos = [...new Set((hg || []).map(r => r.grupo_horario))].sort();
    const gruposOpts = grupos.length
      ? grupos.map(g => `<option value="${_tutEsc(g)}">${_tutEsc(g)}</option>`).join('')
      : '<option value="">— Sin grupos en horarios —</option>';

    let html = '';
    if (disp && disp.length) {
      html += `<h3 class="tut-section-lbl" style="margin-top:0">Mis horarios configurados</h3>`;
      disp.forEach(d => {
        html += `<div class="tut-disp-row">
          <div class="tut-disp-info">
            <div class="tut-disp-label">${_DIAS[d.dia_semana]} · ${_tutEsc(d.grupo_horario || 'General')} · ${d.duracion_min} min/cita</div>
            <div class="tut-disp-hora">⏰ ${(d.hora_inicio || '').slice(0, 5)} – ${(d.hora_fin || '').slice(0, 5)}${d.activo ? '' : ' <span style="color:var(--muted-2)">(inactivo)</span>'}</div>
          </div>
          <button class="tut-btn tut-btn-cancel" onclick="window._tutBorrarDisp('${_tutArg(d.id)}')">Eliminar</button>
        </div>`;
      });
    } else {
      html += '<div class="tut-empty" style="padding:20px 0 28px">Aún no has configurado ningún horario de tutoría.</div>';
    }

    html += `
      <h3 class="tut-section-lbl" style="margin-top:20px">➕ Añadir disponibilidad</h3>
      <div class="tut-form">
        <div class="tut-r2">
          <div><label>Grupo horario</label><select id="tut-f-grupo">${gruposOpts}</select></div>
          <div><label>Día de la semana</label>
            <select id="tut-f-dia">
              <option value="1">Lunes</option><option value="2">Martes</option>
              <option value="3">Miércoles</option><option value="4">Jueves</option>
              <option value="5">Viernes</option>
            </select>
          </div>
        </div>
        <div class="tut-r2">
          <div><label>Hora inicio</label><input type="time" id="tut-f-hinicio" value="16:00"></div>
          <div><label>Hora fin</label><input type="time" id="tut-f-hfin" value="18:00"></div>
        </div>
        <div>
          <label>Duración por cita</label>
          <select id="tut-f-dur">
            <option value="15">15 minutos</option>
            <option value="20" selected>20 minutos</option>
            <option value="30">30 minutos</option>
            <option value="45">45 minutos</option>
          </select>
        </div>
        <button class="tut-btn tut-btn-ink" onclick="window._tutGuardarDisp()">Guardar disponibilidad</button>
      </div>`;
    pane.innerHTML = html;
  } catch (e) {
    pane.innerHTML = '<div class="tut-empty">Error al cargar disponibilidad.</div>';
  }
}

window._tutGuardarDisp = async function () {
  const grupo = document.getElementById('tut-f-grupo')?.value;
  const dia = parseInt(document.getElementById('tut-f-dia')?.value || '1');
  const hinicio = document.getElementById('tut-f-hinicio')?.value;
  const hfin = document.getElementById('tut-f-hfin')?.value;
  const dur = parseInt(document.getElementById('tut-f-dur')?.value || '20');
  if (!grupo || !hinicio || !hfin) return _tutToast('Completa todos los campos', true);
  if (hinicio >= hfin) return _tutToast('La hora de inicio debe ser anterior a la fin', true);
  const { error } = await window.sb.from('tutoria_disponibilidad').insert({
    centro_id: window.ctrId, tutor_id: window.currentUser.id,
    grupo_horario: grupo, dia_semana: dia,
    hora_inicio: hinicio, hora_fin: hfin, duracion_min: dur, activo: true,
  });
  if (error) return _tutToast('Error al guardar: ' + error.message, true);
  _tutToast('✓ Disponibilidad guardada');
  _tutLoadDispProfesor();
};

window._tutBorrarDisp = async function (dispId) {
  if (!confirm('¿Eliminar esta disponibilidad?\nLas citas existentes no se cancelarán automáticamente.')) return;
  await window.sb.from('tutoria_disponibilidad').delete()
    .eq('id', dispId).eq('centro_id', window.ctrId);
  _tutToast('Disponibilidad eliminada');
  _tutLoadDispProfesor();
};

/* ═══════════════════════ VISTA FAMILIA ═══════════════════════ */
let _tutFamHijoIdx = 0;
let _tutFamHijos = [];
let _tutFamSlotSel = null;
let _tutFamDisp = null;

async function _tutRenderFamilia(el) {
  el.innerHTML = `
    <div class="tut-page">
      <div class="tut-hdr">
        <div class="tut-eyebrow">FAMILIAS · TUTORÍAS</div>
        <h1 class="tut-title">Cita con el tutor</h1>
        <p class="tut-sub">Reserva una reunión con el tutor de tu hijo.</p>
        <div class="tut-tabs">
          <button class="tut-tab tut-act" onclick="window._tutFamTab('solicitar',this)">📅 Solicitar cita</button>
          <button class="tut-tab" onclick="window._tutFamTab('miscitas',this)">📋 Mis citas</button>
        </div>
      </div>
      <div class="tut-body">
        <div id="tut-pane-solicitar"></div>
        <div id="tut-pane-miscitas" style="display:none"></div>
      </div>
    </div>`;
  const { data: fa } = await window.sb.from('familia_alumno')
    .select('alumno_id, alumnos(id,nombre,grupo_horario)')
    .eq('profile_id', window.currentUser.id);
  _tutFamHijos = (fa || []).map(r => r.alumnos).filter(Boolean);
  _tutFamHijoIdx = 0;
  _tutFamSlotSel = null;
  _tutFamRenderSolicitar();
  _tutFamLoadMisCitas();
}

window._tutFamTab = function (tab, btn) {
  document.querySelectorAll('.tut-tab').forEach(b => b.classList.remove('tut-act'));
  btn.classList.add('tut-act');
  const ps = document.getElementById('tut-pane-solicitar');
  const pm = document.getElementById('tut-pane-miscitas');
  if (ps) ps.style.display = tab === 'solicitar' ? '' : 'none';
  if (pm) pm.style.display = tab === 'miscitas' ? '' : 'none';
};

function _tutFamRenderSolicitar() {
  const pane = document.getElementById('tut-pane-solicitar');
  if (!pane) return;
  if (!_tutFamHijos.length) {
    pane.innerHTML = '<div class="tut-empty">No tienes hijos vinculados en este centro.</div>';
    return;
  }
  const chips = _tutFamHijos.map((h, i) =>
    `<button class="tut-chip${i === _tutFamHijoIdx ? ' tut-chip-act' : ''}" onclick="window._tutFamSelHijo(${i})">${_tutEsc(h.nombre)}</button>`
  ).join('');
  pane.innerHTML = `
    ${_tutFamHijos.length > 1 ? `<div class="tut-chips">${chips}</div>` : ''}
    <div id="tut-fam-booking"></div>`;
  _tutFamLoadBooking(_tutFamHijos[_tutFamHijoIdx]);
}

window._tutFamSelHijo = function (idx) {
  _tutFamHijoIdx = idx;
  _tutFamSlotSel = null;
  _tutFamDisp = null;
  _tutFamRenderSolicitar();
};

async function _tutFamLoadBooking(hijo) {
  const div = document.getElementById('tut-fam-booking');
  if (!div) return;
  div.innerHTML = '<p style="color:var(--muted);font-size:13px">Buscando disponibilidad del tutor…</p>';
  try {
    const { data: disp } = await window.sb.from('tutoria_disponibilidad')
      .select('*')
      .eq('centro_id', window.ctrId)
      .eq('grupo_horario', hijo.grupo_horario)
      .eq('activo', true);
    if (!disp || !disp.length) {
      div.innerHTML = `<div class="tut-empty">El tutor del grupo <strong>${_tutEsc(hijo.grupo_horario)}</strong> aún no ha configurado su horario de tutorías.<br><span style="font-size:12px;color:var(--muted-2)">Consulta con el centro para más información.</span></div>`;
      return;
    }
    _tutFamDisp = disp;
    const diasDisp = [...new Set(disp.map(d => _DIAS[d.dia_semana]))].join(', ');
    const durMin = disp[0].duracion_min;
    div.innerHTML = `
      <div class="tut-info-box">
        <strong>📅 Disponibilidad del tutor de ${_tutEsc(hijo.nombre)}</strong>
        <span>${_tutEsc(diasDisp)} · citas de ${durMin} min · ${(disp[0].hora_inicio || '').slice(0, 5)} a ${(disp[disp.length - 1].hora_fin || '').slice(0, 5)}</span>
      </div>
      <div class="tut-form">
        <div>
          <label>Selecciona una fecha</label>
          <input type="date" id="tut-f-fecha" min="${new Date().toISOString().split('T')[0]}" onchange="window._tutFamOnFecha(this.value)">
        </div>
        <div id="tut-slots-wrap" style="display:none">
          <label>Horarios disponibles</label>
          <div class="tut-slot-grid" id="tut-slot-grid"></div>
        </div>
        <div id="tut-motivo-wrap" style="display:none">
          <label>Motivo de la cita (opcional)</label>
          <textarea id="tut-f-motivo" placeholder="Ej: Seguimiento del rendimiento académico…"></textarea>
          <button class="tut-btn tut-btn-ink" style="margin-top:6px" onclick="window._tutFamSolicitar('${_tutArg(hijo.id)}','${_tutArg(hijo.nombre)}','${_tutArg(hijo.grupo_horario)}')">📅 Solicitar cita</button>
        </div>
      </div>`;
  } catch (e) {
    div.innerHTML = '<div class="tut-empty">Error al cargar disponibilidad.</div>';
  }
}

window._tutFamOnFecha = async function (fecha) {
  if (!fecha || !_tutFamDisp) return;
  _tutFamSlotSel = null;
  const sw = document.getElementById('tut-slots-wrap');
  const mw = document.getElementById('tut-motivo-wrap');
  const grid = document.getElementById('tut-slot-grid');
  if (!sw || !grid) return;
  if (mw) mw.style.display = 'none';

  // getDay: 0=dom,1=lun...5=vie,6=sáb; our dia_semana: 1=lun...5=vie
  const dow = new Date(fecha + 'T12:00:00').getDay();
  const matching = _tutFamDisp.filter(d => d.dia_semana === dow);
  sw.style.display = 'block';
  if (!matching.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-size:13px">No hay disponibilidad de tutoría este día. Prueba con otro día.</p>';
    return;
  }

  // Generate sub-slots
  const allSlots = [];
  matching.forEach(d => {
    const [sh, sm] = (d.hora_inicio || '00:00').split(':').map(Number);
    const [eh, em] = (d.hora_fin || '00:00').split(':').map(Number);
    let cur = sh * 60 + sm;
    const end = eh * 60 + em;
    while (cur + d.duracion_min <= end) {
      const hI = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
      const hF = `${String(Math.floor((cur + d.duracion_min) / 60)).padStart(2, '0')}:${String((cur + d.duracion_min) % 60).padStart(2, '0')}`;
      allSlots.push({ disp_id: d.id, tutor_id: d.tutor_id, hora_inicio: hI, hora_fin: hF });
      cur += d.duracion_min;
    }
  });

  if (!allSlots.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-size:13px">No hay franjas en el horario configurado.</p>';
    return;
  }

  // Check taken slots
  const dispIds = matching.map(d => d.id);
  const { data: taken } = await window.sb.from('tutoria_citas')
    .select('disp_id,hora_inicio')
    .in('disp_id', dispIds)
    .eq('fecha', fecha)
    .not('estado', 'eq', 'cancelada');
  // Las columnas `time` vuelven con segundos ("09:00:00"); los slots generados
  // son "HH:MM" → normalizar a HH:MM para que los ocupados se marquen bien.
  const takenSet = new Set((taken || []).map(t => `${t.disp_id}_${(t.hora_inicio || '').slice(0, 5)}`));

  grid.innerHTML = allSlots.map((s, i) => {
    const key = `${s.disp_id}_${s.hora_inicio}`;
    const isTaken = takenSet.has(key);
    const cls = isTaken ? 'tut-slot tut-slot-taken' : 'tut-slot';
    const onclick = isTaken ? '' : `onclick="window._tutFamSelSlot(this,${i})"`;
    return `<button class="${cls}" ${isTaken ? 'disabled' : ''} ${onclick} data-idx="${i}">${s.hora_inicio}–${s.hora_fin}${isTaken ? ' ✕' : ''}</button>`;
  }).join('');
  window._tutSlots = allSlots; // store for later
};

window._tutFamSelSlot = function (btn, idx) {
  document.querySelectorAll('.tut-slot').forEach(b => b.classList.remove('tut-slot-sel'));
  btn.classList.add('tut-slot-sel');
  _tutFamSlotSel = (window._tutSlots || [])[idx] || null;
  const mw = document.getElementById('tut-motivo-wrap');
  if (mw) mw.style.display = '';
};

window._tutFamSolicitar = async function (alumnoId, alumnoNombre, grupoHorario) {
  if (!_tutFamSlotSel) return _tutToast('Selecciona un horario primero', true);
  const fecha = document.getElementById('tut-f-fecha')?.value;
  if (!fecha) return _tutToast('Selecciona una fecha', true);
  const motivo = (document.getElementById('tut-f-motivo')?.value || '').trim() || null;
  const { error } = await window.sb.from('tutoria_citas').insert({
    centro_id: window.ctrId,
    disp_id: _tutFamSlotSel.disp_id,
    tutor_id: _tutFamSlotSel.tutor_id,
    alumno_id: alumnoId,
    alumno_nombre: alumnoNombre,
    grupo_horario: grupoHorario,
    familia_id: window.currentUser.id,
    fecha,
    hora_inicio: _tutFamSlotSel.hora_inicio,
    hora_fin: _tutFamSlotSel.hora_fin,
    motivo,
    estado: 'solicitada',
  });
  if (error) {
    if (error.code === '23505') return _tutToast('Ese horario acaba de ser reservado. Elige otro.', true);
    return _tutToast('Error al solicitar la cita', true);
  }
  _tutToast('✓ Cita solicitada. El tutor la confirmará próximamente.');
  _tutPush([_tutFamSlotSel.tutor_id], '📅 Nueva solicitud de tutoría',
    `${window.currentUserName || 'Una familia'} solicita cita para ${alumnoNombre} el ${_tutFechaLegible(fecha)} a las ${_tutFamSlotSel.hora_inicio}.`);
  _tutFamSlotSel = null;
  _tutFamLoadBooking(_tutFamHijos[_tutFamHijoIdx]);
  _tutFamLoadMisCitas();
};

async function _tutFamLoadMisCitas() {
  const pane = document.getElementById('tut-pane-miscitas');
  if (!pane) return;
  pane.innerHTML = '<p style="color:var(--muted);font-size:13px">Cargando…</p>';
  try {
    const { data, error } = await window.sb.from('tutoria_citas')
      .select('*')
      .eq('centro_id', window.ctrId)
      .eq('familia_id', window.currentUser.id)
      .order('fecha', { ascending: false }).order('hora_inicio')
      .limit(100);
    if (error) throw error;
    if (!data.length) { pane.innerHTML = '<div class="tut-empty">No tienes citas registradas.</div>'; return; }
    pane.innerHTML = data.map(c => {
      const canCancel = c.estado === 'solicitada' || c.estado === 'confirmada';
      return `<div class="tut-card">
        <div class="tut-card-hdr">
          <div>
            <div class="tut-card-name">${_tutEsc(c.alumno_nombre || 'Alumno')}${c.grupo_horario ? ' · ' + _tutEsc(c.grupo_horario) : ''}</div>
            <div class="tut-card-meta">📅 ${_tutFechaLegible(c.fecha)} · ⏰ ${(c.hora_inicio || '').slice(0, 5)}–${(c.hora_fin || '').slice(0, 5)}</div>
            ${c.motivo ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">💬 ${_tutEsc(c.motivo)}</div>` : ''}
          </div>
          <div>${_tutEstadoBadge(c.estado)}</div>
        </div>
        ${canCancel ? `<div class="tut-actions"><button class="tut-btn tut-btn-cancel" onclick="window._tutFamCancelar('${_tutArg(c.id)}','${_tutArg(c.tutor_id)}','${_tutArg(c.alumno_nombre)}','${_tutArg(c.fecha)}','${_tutArg(c.hora_inicio)}')">Cancelar cita</button></div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    pane.innerHTML = '<div class="tut-empty">Error al cargar citas.</div>';
  }
}

window._tutFamCancelar = async function (citaId, tutorId, alumnoNombre, fecha, horaIni) {
  if (!confirm('¿Cancelar esta cita?')) return;
  const { error } = await window.sb.from('tutoria_citas')
    .update({ estado: 'cancelada', cancelada_por: 'familia' })
    .eq('id', citaId).eq('centro_id', window.ctrId);
  if (error) return _tutToast('Error al cancelar', true);
  _tutToast('Cita cancelada');
  _tutPush([tutorId], '⚠️ Cita cancelada por familia',
    `La familia ha cancelado la cita de ${alumnoNombre} el ${_tutFechaLegible(fecha)} a las ${(horaIni || '').slice(0, 5)}.`);
  _tutFamLoadMisCitas();
};

/* ═══════════════════════ VISTA ADMIN/DIRECCIÓN ═══════════════════════ */
async function _tutRenderAdmin(el) {
  el.innerHTML = `
    <div class="tut-page">
      <div class="tut-hdr">
        <div class="tut-eyebrow">DIRECCIÓN · TUTORÍAS</div>
        <h1 class="tut-title">Tutorías</h1>
        <p class="tut-sub">Vista general de todas las citas de tutoría del centro.</p>
      </div>
      <div class="tut-body" id="tut-admin-body">
        <p style="color:var(--muted);font-size:13px">Cargando…</p>
      </div>
    </div>`;
  const pane = document.getElementById('tut-admin-body');
  try {
    const { data, error } = await window.sb.from('tutoria_citas')
      .select('*')
      .eq('centro_id', window.ctrId)
      .order('fecha', { ascending: false }).order('hora_inicio')
      .limit(500);
    if (error) throw error;
    if (!data.length) { pane.innerHTML = '<div class="tut-empty">No hay citas registradas en este centro.</div>'; return; }
    const cols = ['Alumno', 'Grupo', 'Fecha', 'Hora', 'Estado', 'Motivo'];
    pane.innerHTML = `
      <p style="font-size:13px;color:var(--muted);margin:0 0 14px">${data.length} citas totales</p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr>${cols.map(c => `<th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--line);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">${c}</th>`).join('')}</tr></thead>
          <tbody>${data.map(c => `<tr style="border-bottom:1px solid var(--line)">
            <td style="padding:8px 12px;font-weight:500">${_tutEsc(c.alumno_nombre || '—')}</td>
            <td style="padding:8px 12px">${_tutEsc(c.grupo_horario || '—')}</td>
            <td style="padding:8px 12px;white-space:nowrap">${_tutFechaLegible(c.fecha)}</td>
            <td style="padding:8px 12px;white-space:nowrap">${(c.hora_inicio || '').slice(0, 5)}–${(c.hora_fin || '').slice(0, 5)}</td>
            <td style="padding:8px 12px">${_tutEstadoBadge(c.estado)}</td>
            <td style="padding:8px 12px;color:var(--muted);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_tutEsc(c.motivo || '—')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  } catch (e) {
    pane.innerHTML = '<div class="tut-empty">Error al cargar citas.</div>';
  }
}
