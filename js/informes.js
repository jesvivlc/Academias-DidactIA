// ── INFORMES DE DIRECCIÓN ──
// PDF consolidado por periodo (jsPDF + jspdf-autotable). Solo lectura de tablas existentes.
// Reutiliza las estructuras de datos de exportarSustituciones/Rrhh/Guardias/Incidencias/Comedor
// y el patrón de logo + color del centro de plannerExportarPDF. Globals: sb, ctrId, ctrName, role.

function _infEsAdmin() { return ['admin', 'director', 'jefatura', 'superadmin'].includes(role); }

function _infFmt(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _infHuman(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : (iso || ''); }
function _infRangoLabel(from, to) { return _infHuman(from) + ' – ' + _infHuman(to); }
function _infDias(ini, fin) {
  if (!ini) return 0;
  var a = new Date(ini + 'T12:00:00'), b = new Date((fin || ini) + 'T12:00:00');
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// ── INICIALIZACIÓN ──
function initInformes() {
  var cont = document.getElementById('inf-container');
  if (!cont) return;
  cont.innerHTML =
    '<div class="pg-hdr"><div><div class="pg-title">Informes de dirección</div>' +
      '<div class="pg-sub">PDF consolidado del centro por periodo</div></div></div>' +
    '<div class="card">' +
      '<div class="card-eyebrow">PERIODO</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px;">' +
        '<button class="btn btn-s inf-preset" data-p="semana"    onclick="infPreset(\'semana\')">Esta semana</button>' +
        '<button class="btn btn-s inf-preset" data-p="mes"       onclick="infPreset(\'mes\')">Este mes</button>' +
        '<button class="btn btn-s inf-preset" data-p="trimestre" onclick="infPreset(\'trimestre\')">Este trimestre</button>' +
        '<button class="btn btn-s inf-preset" data-p="curso"     onclick="infPreset(\'curso\')">Este curso</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div><label class="lbl">Desde</label><input class="fi" type="date" id="inf-from" onchange="infClearPreset()"></div>' +
        '<div><label class="lbl">Hasta</label><input class="fi" type="date" id="inf-to" onchange="infClearPreset()"></div>' +
        '<button class="btn btn-p" id="inf-gen-btn" onclick="informeGenerarPDF()">📄 Generar informe PDF</button>' +
      '</div>' +
      '<div id="inf-msg" style="display:none;font-size:13px;margin-top:10px;"></div>' +
    '</div>';
  infPreset('mes');
}

function infClearPreset() {
  document.querySelectorAll('.inf-preset').forEach(function (b) { b.classList.remove('active'); });
}

// Presets de periodo → calculan from/to y rellenan los inputs
function infPreset(p) {
  var now = new Date(), from, to;
  if (p === 'semana') {
    var lun = (now.getDay() + 6) % 7; // lunes = 0
    from = new Date(now); from.setDate(now.getDate() - lun);
    to = new Date(from); to.setDate(from.getDate() + 6);
  } else if (p === 'mes') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (p === 'trimestre') {
    var m = now.getMonth();
    if (m >= 8)      { from = new Date(now.getFullYear(), 8, 1);  to = new Date(now.getFullYear(), 11, 31); } // sep–dic
    else if (m <= 2) { from = new Date(now.getFullYear(), 0, 1);  to = new Date(now.getFullYear(), 2, 31);  } // ene–mar
    else             { from = new Date(now.getFullYear(), 3, 1);  to = new Date(now.getFullYear(), 5, 30);  } // abr–jun
  } else { // curso
    var y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    from = new Date(y, 8, 1); to = new Date(y + 1, 5, 30);
  }
  var fi = document.getElementById('inf-from'), ti = document.getElementById('inf-to');
  if (fi) fi.value = _infFmt(from);
  if (ti) ti.value = _infFmt(to);
  document.querySelectorAll('.inf-preset').forEach(function (b) { b.classList.toggle('active', b.dataset.p === p); });
}

// ── Centro (logo + color), mismo patrón que plannerExportarPDF ──
async function _infCentroInfo() {
  try {
    var r = await sb.from('centros').select('nombre,color_primario,logo_url').eq('id', ctrId).single();
    if (r.data) return { nombre: r.data.nombre || 'Centro', color: r.data.color_primario || '#1a73e8', logo: r.data.logo_url || '' };
  } catch (e) { /* ignore */ }
  return { nombre: (typeof ctrName !== 'undefined' && ctrName) || 'Centro', color: '#1a73e8', logo: '' };
}
function _infHexToRgb(hex) {
  var h = String(hex || '#1a73e8').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  if (isNaN(n)) return { r: 26, g: 115, b: 232 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function _infImgToDataURL(url) {
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
async function _infEnsureLibs() { return pdfEnsureLibs(); } // delegado a pdf-utils.js (lógica idéntica)

// ── Queries por sección (centro_id + rango from/to; campo de fecha adaptado) ──
async function _infQSustituciones(from, to) {
  var r = await sb.from('sustituciones')
    .select('fecha,tramo,profesor_ausente,grupo_horario,profesor_sustituto')
    .eq('centro_id', ctrId).gte('fecha', from).lte('fecha', to)
    .order('fecha', { ascending: true });
  var data = r.data || [];
  var rows = data.map(function (s) {
    return [s.fecha || '', String(s.tramo || ''), s.profesor_ausente || '', s.grupo_horario || '', s.profesor_sustituto || '—'];
  });
  return { length: data.length, rows: rows };
}
async function _infQAusencias(from, to) {
  var r = await sb.from('ausencias_profesor')
    .select('profile_id,fecha,fecha_fin,tipo,estado')
    .eq('centro_id', ctrId).gte('fecha', from).lte('fecha', to)
    .order('fecha', { ascending: true });
  var data = r.data || [];
  var ids = [...new Set(data.map(function (a) { return a.profile_id; }).filter(Boolean))];
  var nameById = {};
  if (ids.length) {
    var p = await sb.from('profiles').select('id,full_name').in('id', ids);
    (p.data || []).forEach(function (x) { nameById[x.id] = x.full_name || '—'; });
  }
  var TIPOS = { baja_medica: 'Baja médica', permiso: 'Permiso', asunto_propio: 'Asunto propio', formacion: 'Formación', sindical: 'Sindical', otros: 'Otros' };
  var rows = data.map(function (a) {
    return [nameById[a.profile_id] || '—', TIPOS[a.tipo] || a.tipo || '', a.fecha || '', String(_infDias(a.fecha, a.fecha_fin))];
  });
  return { length: data.length, rows: rows };
}
async function _infQGuardias(from, to) {
  var r = await sb.from('sustituciones').select('profesor_sustituto')
    .eq('centro_id', ctrId).gte('fecha', from).lte('fecha', to);
  var count = {};
  (r.data || []).forEach(function (s) { var n = (s.profesor_sustituto || '').trim(); if (n) count[n] = (count[n] || 0) + 1; });
  var nombres = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b, 'es'); });
  var rows = nombres.map(function (n) { return [n, String(count[n])]; });
  var total = nombres.reduce(function (acc, n) { return acc + count[n]; }, 0);
  return { rows: rows, totalSesiones: total };
}
async function _infQIncidencias(from, to) {
  var r = await sb.from('incidencias')
    .select('fecha,tipo,gravedad,alumno_nombre,grupo_horario,estado')
    .eq('centro_id', ctrId).gte('fecha', from).lte('fecha', to)
    .order('fecha', { ascending: true });
  var data = r.data || [];
  var rows = data.map(function (i) {
    var ag = [i.alumno_nombre, i.grupo_horario].filter(Boolean).join(' · ') || '—';
    return [i.fecha || '', ag, i.tipo || '', i.gravedad || '', i.estado || ''];
  });
  return { length: data.length, rows: rows };
}
async function _infQComedor(from, to) {
  var r = await sb.from('asistencia_comedor')
    .select('fecha,se_queda,alumnos(grupo_horario,curso)')
    .eq('centro_id', ctrId).eq('se_queda', true).gte('fecha', from).lte('fecha', to).limit(50000);
  var agg = {};
  (r.data || []).forEach(function (x) {
    var al = x.alumnos || {};
    var g = al.grupo_horario || al.curso || 'Sin grupo';
    var k = (x.fecha || '') + '|' + g;
    agg[k] = (agg[k] || 0) + 1;
  });
  var keys = Object.keys(agg).sort();
  var rows = keys.map(function (k) { var p = k.split('|'); return [p[0], p[1], String(agg[k])]; });
  var total = keys.reduce(function (acc, k) { return acc + agg[k]; }, 0);
  return { rows: rows, totalComensales: total };
}

// ── Generar el PDF ──
async function informeGenerarPDF() {
  var from = (document.getElementById('inf-from') || {}).value;
  var to   = (document.getElementById('inf-to')   || {}).value;
  var msg  = document.getElementById('inf-msg');
  var setMsg = function (t, c) { if (msg) { msg.textContent = t; msg.style.display = 'block'; msg.style.color = c || 'var(--txt2)'; } };
  if (!from || !to) { setMsg('Selecciona un periodo (desde y hasta).', 'var(--danger)'); return; }
  if (from > to)    { setMsg('La fecha "Desde" no puede ser posterior a "Hasta".', 'var(--danger)'); return; }

  var btn = document.getElementById('inf-gen-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    await _infEnsureLibs();
    var centro  = await _infCentroInfo();
    var logoImg = await _infImgToDataURL(centro.logo);
    var rgb     = _infHexToRgb(centro.color);
    var periodo = _infRangoLabel(from, to);

    setMsg('Consultando datos…');
    var sust  = await _infQSustituciones(from, to);
    var aus   = await _infQAusencias(from, to);
    var guard = await _infQGuardias(from, to);
    var inci  = await _infQIncidencias(from, to);
    var come  = await _infQComedor(from, to);

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();

    // Cabecera (banda color + logo + título + periodo) y pie en cada página
    var pageDraw = function () {
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(0, 0, W, 26, 'F');
      var x = 12;
      if (logoImg && logoImg.dataURL) {
        try {
          var h = 16, w = h * (logoImg.w / logoImg.h);
          if (w > 38) { w = 38; h = w * (logoImg.h / logoImg.w); }
          doc.addImage(logoImg.dataURL, 'PNG', 12, 5, w, h); x = 12 + w + 6;
        } catch (e) { /* logo opcional */ }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13); doc.setFont(undefined, 'bold');
      doc.text(centro.nombre || 'Centro', x, 11);
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      doc.text('INFORME DE DIRECCIÓN', x, 18);
      doc.setFontSize(8.5);
      doc.text('Periodo: ' + periodo, W - 12, 11, { align: 'right' });
      // pie
      var pg = 1;
      try { pg = doc.internal.getCurrentPageInfo().pageNumber; } catch (e) {}
      doc.setTextColor(130, 130, 130); doc.setFontSize(8); doc.setFont(undefined, 'normal');
      doc.text(centro.nombre || 'Centro', 12, H - 8);
      doc.text('Página ' + pg, W - 12, H - 8, { align: 'right' });
      doc.setTextColor(40, 40, 40);
    };

    var y = 40;
    var section = function (titulo, head, rows) {
      if (y > H - 32) { doc.addPage(); y = 40; }
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text(titulo, 12, y);
      var body = (rows && rows.length)
        ? rows
        : [[{ content: 'Sin registros en este período', colSpan: head.length, styles: { halign: 'center', textColor: [140, 140, 140], fontStyle: 'italic' } }]];
      doc.autoTable({
        head: [head], body: body, startY: y + 3,
        margin: { top: 32, bottom: 16 },
        styles: { fontSize: 8.5, cellPadding: 1.8 },
        headStyles: { fillColor: [rgb.r, rgb.g, rgb.b], textColor: 255, fontSize: 9 },
        alternateRowStyles: { fillColor: [244, 242, 238] },
        didDrawPage: pageDraw
      });
      y = doc.lastAutoTable.finalY + 10;
    };

    // 1. RESUMEN
    section('1. Resumen', ['Módulo', 'Total registros', 'Período'], [
      ['Sustituciones',          String(sust.length),          periodo],
      ['Ausencias RRHH',         String(aus.length),           periodo],
      ['Guardias (sesiones)',    String(guard.totalSesiones),  periodo],
      ['Incidencias',            String(inci.length),          periodo],
      ['Comedor (comensales)',   String(come.totalComensales), periodo]
    ]);
    section('2. Sustituciones', ['Fecha', 'Tramo', 'Docente ausente', 'Grupo', 'Sustituto'], sust.rows);
    section('3. Ausencias RRHH', ['Docente', 'Tipo', 'Fecha inicio', 'Días'], aus.rows);
    section('4. Guardias', ['Docente', 'Sesiones en el período'], guard.rows);
    section('5. Incidencias', ['Fecha', 'Alumno/Grupo', 'Tipo', 'Gravedad', 'Estado'], inci.rows);
    section('6. Comedor', ['Fecha', 'Grupo', 'Comensales'], come.rows);

    doc.save('informe-direccion-' + String(centro.nombre || 'centro').replace(/[^a-zA-Z0-9]+/g, '_') + '-' + _infFmt(new Date()) + '.pdf');
    setMsg('✅ Informe generado.', 'var(--success)');
  } catch (err) {
    console.error('[Informes]', err);
    setMsg('Error al generar el informe: ' + (err && err.message ? err.message : err), 'var(--danger)');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 Generar informe PDF'; }
  }
}
