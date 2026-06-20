// ── CALIFICACIONES MODULE ──
// Gradebook. Dos vistas según rol:
//   · profesional  → vista profesor (entrada/edición de notas de su grupo)
//   · admin/superadmin (y jefatura/director si existieran) → vista consulta + export
// Patrón calcado de comedor.js / admin.js (globals sb, ctrId, role, currentUser…).

const CAL_EVALS = ['1ª Evaluación', '2ª Evaluación', '3ª Evaluación', 'Final'];

let _calAlumnos       = [];   // alumnos del grupo cargado (vista profesor)
let _calData          = [];   // calificaciones cargadas (vista admin)
let _calGrupos        = [];   // grupos del centro
let _calCentros       = [];   // centros (solo superadmin)
let _calCentroSel     = null;  // centro activo en la vista admin
let _calSelectedAlumno = null; // alumno seleccionado en vista split

function _calEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _calEsAdmin() { return ['admin', 'superadmin', 'jefatura', 'director'].includes(role); }
function _calEsProfesor() { return role === 'profesional' || role === 'profesor'; }

// Toast (no hay helper global en el proyecto; mismo estilo que planner/comedor)
function _calToast(msg, tipo) {
  var bg = tipo === 'error' ? 'var(--danger, #c0392b)'
         : tipo === 'warn'  ? 'var(--warning, #d69540)'
         : 'var(--success, #2e7d32)';
  var t = document.createElement('div');
  t.style.cssText =
    'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0));transform:translateX(-50%);' +
    'z-index:9500;background:' + bg + ';color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;' +
    'font-family:var(--font-ui);box-shadow:var(--sh-lg, 0 8px 24px rgba(0,0,0,.18));max-width:90vw;text-align:center;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2600);
  setTimeout(function () { if (t.parentNode) t.remove(); }, 3100);
}

// Grupos distintos del centro (desde alumnos.grupo_horario)
async function _calCargarGrupos(centroId) {
  var r = await sb.from('alumnos').select('grupo_horario')
    .eq('centro_id', centroId).not('grupo_horario', 'is', null).limit(5000);
  _calGrupos = [...new Set((r.data || []).map(function (a) { return a.grupo_horario; }).filter(Boolean))]
    .sort(function (a, b) { return a.localeCompare(b, 'es'); });
  return _calGrupos;
}

// ── INICIALIZACIÓN ──
async function initCalificaciones() {
  var cont = document.getElementById('cal-container');
  if (!cont) return;
  cont.style.flexDirection = 'column'; // reset antes de cada vista
  _calSelectedAlumno = null;
  cont.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;"><span class="spin">⟳</span> Cargando…</div>';
  if (_calEsAdmin()) await _calRenderAdmin();
  else if (_calEsProfesor()) await _calRenderProfesor();
  else if (role === 'familia') await _calRenderFamilia();
  else cont.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;">No tienes acceso a las calificaciones.</div>';
}

/* ════════════════════════════════════════════════════
   VISTA FAMILIA — solo lectura de las notas de los hijos
   ════════════════════════════════════════════════════ */
var _calFamHijoIdx = 0;

async function _calRenderFamilia() {
  var cont = document.getElementById('cal-container');
  if (!cont) return;
  var hijos = (typeof currentUserAlumnos !== 'undefined' && currentUserAlumnos) ? currentUserAlumnos : [];
  if (!hijos.length) {
    cont.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;">No hay alumnos vinculados a tu cuenta.</div>';
    return;
  }
  if (_calFamHijoIdx >= hijos.length) _calFamHijoIdx = 0;
  var hijo = hijos[_calFamHijoIdx];

  var selectorHtml = '';
  if (hijos.length > 1) {
    selectorHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' +
      hijos.map(function(h, i) {
        var active = (i === _calFamHijoIdx);
        return '<button onclick="_calFamSelectHijo(' + i + ')" style="border-radius:20px;padding:5px 14px;font-size:13px;cursor:pointer;font-family:var(--font-ui);' +
          (active ? 'background:var(--ink);color:#fff;border:1px solid var(--ink);' : 'background:var(--paper-2,var(--srf));color:var(--txt);border:1px solid var(--line,var(--bdr));') +
          '">' + _calEsc(h.nombre) + '</button>';
      }).join('') + '</div>';
  }

  cont.innerHTML =
    '<div style="flex:1;padding:28px;display:flex;flex-direction:column;gap:8px;background:var(--bg);overflow-y:auto;">' +
      '<div class="pg-hdr"><div><div class="pg-title">Calificaciones</div>' +
        '<div class="pg-sub">' + _calEsc(hijo.nombre) + (hijo.grupo_horario ? ' · ' + _calEsc(hijo.grupo_horario) : '') + '</div></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-s" id="cal-bol-btn" onclick="_calBoletinPDF()">⬇ Boletín PDF</button>' +
          '<button class="btn btn-p" onclick="initCalificaciones()">↺ Actualizar</button>' +
        '</div></div>' +
      selectorHtml +
      '<div id="cal-fam-tabla"><div style="text-align:center;color:var(--txt3);padding:30px;"><span class="spin">⟳</span> Cargando…</div></div>' +
    '</div>';

  var box = document.getElementById('cal-fam-tabla');
  try {
    var r = await sb.from('calificaciones')
      .select('asignatura,evaluacion,nota,observaciones,profesor_nombre')
      .eq('centro_id', ctrId).eq('alumno_id', hijo.id);
    var data = r.data || [];
    if (!data.length) {
      box.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:14px;padding:36px;">Aún no hay calificaciones publicadas.</div>';
      return;
    }
    var EVALS = ['1ª Evaluación', '2ª Evaluación', '3ª Evaluación', 'Final'];
    var EVALS_LBL = ['1ª Ev.', '2ª Ev.', '3ª Ev.', 'Final'];
    // Pivot por asignatura
    var porAsig = {};
    data.forEach(function(c) {
      var k = c.asignatura || '—';
      if (!porAsig[k]) porAsig[k] = { obs: '', prof: c.profesor_nombre || '' };
      porAsig[k][c.evaluacion] = c.nota;
      if (c.observaciones) porAsig[k].obs = c.observaciones;
    });
    var asigs = Object.keys(porAsig).sort(function(a, b) { return a.localeCompare(b, 'es'); });

    var celNota = function(n) {
      if (n == null || n === '') return '<span style="color:var(--txt3);">—</span>';
      var num = Number(n);
      var col = num < 5 ? 'var(--danger,#C24D2F)' : 'var(--success,#3F9367)';
      return '<span style="font-weight:600;color:' + col + ';">' + _calEsc(num) + '</span>';
    };
    var rows = asigs.map(function(a) {
      var row = porAsig[a];
      return '<tr style="border-bottom:1px solid var(--line,var(--bdr));">' +
        '<td style="padding:10px 12px;font-weight:500;color:var(--txt);">' + _calEsc(a) +
          (row.prof ? '<div style="font-size:11px;color:var(--txt3);font-weight:400;">' + _calEsc(row.prof) + '</div>' : '') + '</td>' +
        EVALS.map(function(e) { return '<td style="padding:10px 12px;text-align:center;">' + celNota(row[e]) + '</td>'; }).join('') +
        '</tr>';
    }).join('');

    box.innerHTML =
      '<div style="overflow-x:auto;background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:var(--r);">' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;min-width:520px;">' +
          '<thead><tr style="text-align:left;border-bottom:2px solid var(--line,var(--bdr));background:var(--paper-2,var(--srf2));">' +
            '<th style="padding:9px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);">Asignatura</th>' +
            EVALS_LBL.map(function(e) { return '<th style="padding:9px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);text-align:center;">' + _calEsc(e) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + rows + '</tbody>' +
        '</table></div>';
  } catch (e) {
    box.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:14px;padding:36px;">No se pudieron cargar las calificaciones.</div>';
  }
}

function _calFamSelectHijo(idx) {
  _calFamHijoIdx = idx;
  _calRenderFamilia();
}

// Boletín de notas en PDF. `hijo` opcional: si no se pasa, usa el hijo
// seleccionado (vista familia). Consulta por alumno_id si existe, si no por
// alumno_nombre+grupo (vista dirección). Reutiliza helpers de informes.js.
async function _calBoletinPDF(hijo, btnId) {
  btnId = btnId || 'cal-bol-btn';
  var btn = document.getElementById(btnId);
  var rest = function () { if (btn) { btn.disabled = false; btn.textContent = '⬇ Boletín PDF'; } };
  if (typeof _infEnsureLibs !== 'function') { _calToast('Exportación no disponible', 'error'); return; }
  if (!hijo) {
    var hijos = (typeof currentUserAlumnos !== 'undefined' && currentUserAlumnos) ? currentUserAlumnos : [];
    hijo = hijos[_calFamHijoIdx];
  }
  if (!hijo) { _calToast('Sin alumno seleccionado', 'warn'); return; }
  var grupoLbl = hijo.grupo_horario || hijo.grupo || '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    await _infEnsureLibs();
    var centro  = await _infCentroInfo();
    var logoImg = await _infImgToDataURL(centro.logo);
    var rgb     = _infHexToRgb(centro.color);

    var q = sb.from('calificaciones')
      .select('asignatura,evaluacion,nota,observaciones,profesor_nombre')
      .eq('centro_id', ctrId);
    if (hijo.id) q = q.eq('alumno_id', hijo.id);
    else q = q.eq('alumno_nombre', hijo.nombre).eq('grupo', grupoLbl);
    var r = await q;
    var data = r.data || [];

    var EVALS = ['1ª Evaluación', '2ª Evaluación', '3ª Evaluación', 'Final'];
    var EVALS_LBL = ['1ª Ev.', '2ª Ev.', '3ª Ev.', 'Final'];
    var porAsig = {};
    var obsList = [];   // observaciones (comentarios) no vacías, para el boletín
    data.forEach(function (c) {
      var k = c.asignatura || '—';
      if (!porAsig[k]) porAsig[k] = { prof: c.profesor_nombre || '' };
      porAsig[k][c.evaluacion] = c.nota;
      if (c.observaciones && String(c.observaciones).trim()) {
        obsList.push({ asig: k, eval: c.evaluacion || '', obs: String(c.observaciones).trim() });
      }
    });
    obsList.sort(function (a, b) { return a.asig.localeCompare(b.asig, 'es'); });
    var asigs = Object.keys(porAsig).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var body = asigs.map(function (a) {
      var row = porAsig[a];
      var cell = function (e) { var n = row[e]; return (n == null || n === '') ? '—' : String(n); };
      return [a, cell(EVALS[0]), cell(EVALS[1]), cell(EVALS[2]), cell(EVALS[3]), row.prof || ''];
    });

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var fechaEmision = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    var pageDraw = function () {
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(0, 0, W, 26, 'F');
      var x = 12;
      if (logoImg && logoImg.dataURL) {
        try {
          var h = 16, w = h * (logoImg.w / logoImg.h);
          if (w > 38) { w = 38; h = w * (logoImg.h / logoImg.w); }
          doc.addImage(logoImg.dataURL, 'PNG', 12, 5, w, h); x = 12 + w + 6;
        } catch (e) {}
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13); doc.setFont(undefined, 'bold');
      doc.text(centro.nombre || 'Centro', x, 11);
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      doc.text('BOLETÍN DE CALIFICACIONES', x, 18);
      doc.setFontSize(8.5);
      doc.text(fechaEmision, W - 12, 11, { align: 'right' });
      var pg = 1; try { pg = doc.internal.getCurrentPageInfo().pageNumber; } catch (e) {}
      doc.setTextColor(130, 130, 130); doc.setFontSize(8);
      doc.text(centro.nombre || 'Centro', 12, H - 8);
      doc.text('Página ' + pg, W - 12, H - 8, { align: 'right' });
      doc.setTextColor(40, 40, 40);
    };

    pageDraw();
    var y = 38;
    doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(40, 40, 40);
    doc.text(hijo.nombre || 'Alumno', 12, y);
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(90, 90, 90);
    doc.text((hijo.curso || '') + (grupoLbl ? '   ·   Grupo ' + grupoLbl : ''), 12, y + 6);
    y += 14;

    if (!body.length) {
      doc.setFontSize(11); doc.setTextColor(120, 120, 120);
      doc.text('Aún no hay calificaciones publicadas.', 12, y);
    } else {
      doc.autoTable({
        head: [['Asignatura'].concat(EVALS_LBL).concat(['Profesor/a'])],
        body: body, startY: y,
        margin: { top: 32, bottom: 16 },
        styles: { fontSize: 9, cellPadding: 2.2 },
        headStyles: { fillColor: [rgb.r, rgb.g, rgb.b], textColor: 255, fontSize: 9 },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } },
        alternateRowStyles: { fillColor: [244, 242, 238] },
        didDrawPage: pageDraw
      });
    }

    // Sección de observaciones / comentarios del profesorado
    if (obsList.length) {
      var oy = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 12;
      if (oy > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); oy = 38; }
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text('Observaciones del profesorado', 12, oy);
      doc.autoTable({
        body: obsList.map(function (o) { return [o.asig + (o.eval ? ' · ' + o.eval : ''), o.obs]; }),
        startY: oy + 3,
        margin: { top: 32, bottom: 16 },
        styles: { fontSize: 9, cellPadding: 2.2, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', textColor: [60, 60, 60] }, 1: { textColor: [40, 40, 40] } },
        theme: 'plain',
        didDrawPage: pageDraw
      });
    }

    // Sección de evaluación competencial LOMLOE (si la tabla existe y hay datos)
    try {
      var rComp = await sb.from('comentarios_competenciales')
        .select('asignatura,evaluacion,niveles,comentario')
        .eq('centro_id', ctrId)
        .eq('alumno_nombre', hijo.nombre || '');
      var compData = rComp.data || [];
      if (compData.length) {
        compData.sort(function (a, b) {
          return (a.asignatura || '').localeCompare(b.asignatura || '', 'es') ||
                 (a.evaluacion || '').localeCompare(b.evaluacion || '', 'es');
        });
        var cy = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 12;
        if (cy > H - 50) { doc.addPage(); pageDraw(); cy = 38; }
        doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(rgb.r, rgb.g, rgb.b);
        doc.text('Evaluación por competencias clave (LOMLOE)', 12, cy);
        var _NIV_LBL = ['', 'Iniciado', 'En proceso', 'Adquirido', 'Avanzado'];
        var compBody = compData.map(function (d) {
          var niv = Object.entries(d.niveles || {}).map(function (kv) {
            return kv[0] + ': ' + (_NIV_LBL[kv[1]] || '');
          }).join('\n');
          return [d.asignatura || '—', d.evaluacion || '—', niv || '—', d.comentario || '—'];
        });
        doc.autoTable({
          head: [['Asignatura', 'Evaluación', 'Competencias', 'Observación']],
          body: compBody,
          startY: cy + 4,
          margin: { top: 32, bottom: 16 },
          styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
          headStyles: { fillColor: [rgb.r, rgb.g, rgb.b], textColor: 255, fontSize: 8 },
          columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 22 }, 2: { cellWidth: 58 } },
          didDrawPage: pageDraw
        });
      }
    } catch (_) { /* tabla aún no existe — se omite la sección */ }

    var safe = (hijo.nombre || 'alumno').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
    doc.save('boletin_' + safe + '_' + new Date().toISOString().split('T')[0] + '.pdf');
    _calToast('✅ Boletín descargado', 'ok');
  } catch (e) {
    _calToast('No se pudo generar el boletín', 'error');
  } finally {
    rest();
  }
}

/* ════════════════════════════════════════════════════
   VISTA PROFESOR — entrada/edición de notas
   ════════════════════════════════════════════════════ */
async function _calRenderProfesor() {
  var cont = document.getElementById('cal-container');
  await _calCargarGrupos(ctrId);

  var grupoOpts = '<option value="">Grupo…</option>' +
    _calGrupos.map(function (g) { return '<option value="' + _calEsc(g) + '">' + _calEsc(g) + '</option>'; }).join('');
  var evalOpts = '<option value="">Evaluación…</option>' +
    CAL_EVALS.map(function (e) { return '<option value="' + _calEsc(e) + '">' + _calEsc(e) + '</option>'; }).join('');

  cont.innerHTML =
    '<div style="flex:1;overflow-y:auto;padding:28px;display:flex;flex-direction:column;gap:22px;box-sizing:border-box;background:var(--bg);">' +
    '<div class="pg-hdr">' +
      '<div><div class="pg-title">Calificaciones</div>' +
      '<div class="pg-sub">Introduce y guarda las notas de tu grupo</div></div>' +
    '</div>' +

    '<div class="card">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div style="flex:1;min-width:150px;"><label class="lbl">Grupo</label>' +
          '<select class="fi" id="cal-prof-grupo" onchange="_calProfAutoCargar()">' + grupoOpts + '</select></div>' +
        '<div style="flex:1;min-width:150px;"><label class="lbl">Asignatura</label>' +
          '<input class="fi" id="cal-prof-asig" placeholder="Ej: Matemáticas" oninput="_calProfAutoCargar()"></div>' +
        '<div style="flex:1;min-width:150px;"><label class="lbl">Evaluación</label>' +
          '<select class="fi" id="cal-prof-eval" onchange="_calProfAutoCargar()">' + evalOpts + '</select></div>' +
        '<button class="btn btn-p" onclick="calCargarAlumnos()">Cargar alumnos</button>' +
      '</div>' +
    '</div>' +

    '<div id="cal-prof-tabla"></div>' +
    '</div>';
}

// Carga automática cuando los tres campos están completos
function _calProfAutoCargar() {
  var g = (document.getElementById('cal-prof-grupo') || {}).value;
  var a = ((document.getElementById('cal-prof-asig') || {}).value || '').trim();
  var e = (document.getElementById('cal-prof-eval') || {}).value;
  if (g && a && e) calCargarAlumnos();
}

async function calCargarAlumnos() {
  var grupo = (document.getElementById('cal-prof-grupo') || {}).value;
  var asig  = ((document.getElementById('cal-prof-asig') || {}).value || '').trim();
  var evalu = (document.getElementById('cal-prof-eval') || {}).value;
  var box   = document.getElementById('cal-prof-tabla');
  if (!box) return;
  if (!grupo || !asig || !evalu) {
    box.innerHTML = '<div class="card" style="text-align:center;color:var(--txt3);font-size:13px;">Selecciona grupo, asignatura y evaluación.</div>';
    return;
  }
  box.innerHTML = '<div class="card" style="text-align:center;color:var(--txt3);font-size:13px;"><span class="spin">⟳</span> Cargando alumnos…</div>';

  // Alumnos del grupo
  var rAl = await sb.from('alumnos').select('id,nombre,grupo_horario')
    .eq('centro_id', ctrId).eq('grupo_horario', grupo).order('nombre');
  _calAlumnos = rAl.data || [];

  if (!_calAlumnos.length) {
    box.innerHTML = '<div class="card" style="text-align:center;color:var(--txt3);font-size:13px;">No hay alumnos en ' + _calEsc(grupo) + '.</div>';
    return;
  }

  // Calificaciones ya guardadas para grupo/asignatura/evaluación
  var rCal = await sb.from('calificaciones').select('alumno_id,nota,observaciones')
    .eq('centro_id', ctrId).eq('grupo', grupo).eq('asignatura', asig).eq('evaluacion', evalu);
  var prev = {};
  (rCal.data || []).forEach(function (c) { prev[c.alumno_id] = c; });

  var rows = _calAlumnos.map(function (al) {
    var p = prev[al.id] || {};
    var nota = (p.nota === null || p.nota === undefined) ? '' : p.nota;
    var obs  = p.observaciones || '';
    return '<tr data-alumno-id="' + _calEsc(al.id) + '" data-alumno-nombre="' + _calEsc(al.nombre) + '" data-nota-orig="' + _calEsc(nota) + '">' +
      '<td style="font-weight:500;">' + _calEsc(al.nombre) + '</td>' +
      '<td style="width:110px;"><input class="fi cal-nota" type="number" min="0" max="10" step="0.01" ' +
        'value="' + _calEsc(nota) + '" placeholder="—" style="text-align:center;padding:6px 8px;"></td>' +
      '<td><input class="fi cal-obs" type="text" value="' + _calEsc(obs) + '" placeholder="Observaciones…" style="padding:6px 8px;"></td>' +
    '</tr>';
  }).join('');

  box.innerHTML =
    '<div class="card">' +
      '<div class="card-hdr"><div class="card-ico g">📝</div>' +
        '<div><div class="card-title">' + _calEsc(grupo) + ' · ' + _calEsc(asig) + ' · ' + _calEsc(evalu) + '</div>' +
        '<div class="card-desc">' + _calAlumnos.length + ' alumnos · nota de 0 a 10 (vacío = sin calificar)</div></div>' +
      '</div>' +
      '<div style="overflow-x:auto;"><table class="tbl">' +
        '<thead><tr><th>Alumno</th><th style="width:110px;text-align:center;">Nota</th><th>Observaciones</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap;">' +
        '<button class="btn btn-s" id="cal-ia-btn" onclick="_calGenComentarios()" title="Genera un comentario para cada alumno con nota a partir de su calificación (rellena solo las observaciones vacías; editable)">✨ Comentarios IA</button>' +
        '<button class="btn btn-s" id="cal-comp-btn" onclick="_calGenCompetencial()" title="Genera una valoración por competencias LOMLOE (CCL, STEM, CD, CPSAA…) para cada alumno con nota">🎯 Competencial IA</button>' +
        '<button class="btn btn-p" onclick="calGuardar()">💾 Guardar calificaciones</button>' +
      '</div>' +
    '</div>';
}

// Llamada a Gemini (EF chat) en modo texto plano (role:familia → sin function calling).
async function _calIA(systemPrompt, userMsg) {
  try {
    var r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY, 'apikey': ANON_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        system_prompt: systemPrompt,
        centro_id: ctrId || '',
        role: 'familia',
        user_name: (typeof currentUserName !== 'undefined' ? currentUserName : ''),
        user_id: (currentUser ? currentUser.id : ''),
      }),
    });
    if (!r.ok) return null;
    var j = await r.json();
    return j.type === 'text' ? j.text : null;
  } catch (e) { return null; }
}

// Genera comentarios de evaluación con IA para los alumnos con nota.
// Rellena SOLO las observaciones vacías (no pisa lo que el profe ya escribió).
// Empareja por NÚMERO de orden (no por nombre) y procesa en lotes para evitar
// que la respuesta de Gemini se trunque con grupos grandes.
async function _calGenComentarios() {
  var asig  = ((document.getElementById('cal-prof-asig') || {}).value || '').trim();
  var evalu = (document.getElementById('cal-prof-eval') || {}).value;
  var btn = document.getElementById('cal-ia-btn');
  var trs = document.querySelectorAll('#cal-prof-tabla tr[data-alumno-id]');

  // Recopilar alumnos con nota y observación vacía
  var pend = [];
  for (var i = 0; i < trs.length; i++) {
    var tr = trs[i];
    var nota = ((tr.querySelector('.cal-nota') || {}).value || '').trim();
    var obs  = ((tr.querySelector('.cal-obs') || {}).value || '').trim();
    if (nota !== '' && obs === '') pend.push({ tr: tr, nombre: tr.dataset.alumnoNombre, nota: nota });
  }
  if (!pend.length) { _calToast('No hay alumnos con nota y observación vacía.', 'warn'); return; }
  if (typeof API === 'undefined') { _calToast('IA no disponible.', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '✨ Generando…'; }
  var rest = function () { if (btn) { btn.disabled = false; btn.textContent = '✨ Comentarios IA'; } };

  var sys = 'Eres un docente español redactando los comentarios del boletín de notas de la asignatura "' + asig + '" (' + evalu + '). ' +
    'Recibes una lista NUMERADA de alumnos con su nota. Para CADA alumno de la lista escribe UNA observación breve (máx. 18 palabras), ' +
    'en español, en tercera persona, con un tono constructivo y profesional acorde a la nota: ' +
    'felicita y anima si la nota es alta (≥7), reconoce el esfuerzo y señala áreas de mejora si es media (5–6.9), y motiva con tacto sin ser duro si es baja (<5). ' +
    'No menciones el número de la nota. Es OBLIGATORIO devolver un objeto por CADA número de la lista. ' +
    'Devuelve EXCLUSIVAMENTE un array JSON válido con la forma [{"n":1,"comentario":"…"},{"n":2,"comentario":"…"}], ' +
    'donde "n" es el número que precede al alumno. Sin texto adicional ni markdown.';

  // Procesa un lote (chunk de pend, con su offset global) y rellena observaciones.
  async function genLote(chunk, offset) {
    var lista = chunk.map(function (p, idx) { return (idx + 1) + '. ' + p.nombre + ' — nota: ' + p.nota; }).join('\n');
    var txt = await _calIA(sys, 'Alumnos y notas:\n' + lista);
    if (!txt) return 0;
    var clean = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
    var arr = null;
    try { arr = JSON.parse(clean); } catch (e) {
      var m = clean.match(/\[[\s\S]*\]/);
      if (m) { try { arr = JSON.parse(m[0]); } catch (e2) { arr = null; } }
    }
    if (!Array.isArray(arr)) return 0;
    var done = 0;
    arr.forEach(function (o) {
      if (!o) return;
      var num = parseInt(o.n, 10);
      if (isNaN(num)) return;
      var p = chunk[num - 1];               // número 1-based dentro del lote
      if (!p) return;
      var c = String(o.comentario || '').trim();
      var inp = p.tr.querySelector('.cal-obs');
      if (c && inp && !inp.value.trim()) { inp.value = c; done++; }
    });
    return done;
  }

  try {
    var CH = 20, total = 0;
    for (var s = 0; s < pend.length; s += CH) {
      total += await genLote(pend.slice(s, s + CH), s);
    }
    var faltan = pend.length - total;
    if (total === 0) {
      _calToast('La IA no devolvió comentarios. Inténtalo de nuevo.', 'error');
    } else {
      _calToast('✨ ' + total + ' comentario(s) generado(s)' + (faltan > 0 ? ' (' + faltan + ' sin generar — reintenta)' : '') + '. Revísalos y guarda.', faltan > 0 ? 'warn' : 'ok');
    }
  } catch (e) {
    _calToast('Error al generar comentarios.', 'error');
  } finally {
    rest();
  }
}

// ── COMENTARIOS COMPETENCIALES IA (LOMLOE) ──────────────────────────────────────
// Para cada alumno con nota: selector de nivel por competencia (●●○○) + comentario
// generado por IA. Los datos se persisten en la tabla comentarios_competenciales.

var _CAL_COMP_MAP = [
  { re: /matem|álgebra|cálculo|estadíst/i,        comps: ['STEM','CPSAA','CCL']  },
  { re: /física|química|biolog|ciencias nat/i,      comps: ['STEM','CCL','CPSAA'] },
  { re: /lengua|literatura|español|castellan/i,     comps: ['CCL','CPSAA','CCEC'] },
  { re: /inglés|francés|alemán|idioma|lengua ex/i,  comps: ['CCL','CP','CPSAA']   },
  { re: /historia|geografía|sociales|económ/i,      comps: ['CC','CCL','CPSAA']   },
  { re: /música|plástica|arte|expresión/i,          comps: ['CCEC','CE','CPSAA']  },
  { re: /tecnolog|informát|robótic|program/i,       comps: ['STEM','CD','CE']     },
  { re: /educación física|ef\b|deport/i,            comps: ['CPSAA','CC','CCEC']  },
  { re: /filosofía|ética|valores/i,                 comps: ['CC','CPSAA','CCL']   },
  { re: /religión/i,                                comps: ['CCEC','CC','CPSAA']  },
  { re: /economía|empresa/i,                        comps: ['CE','STEM','CC']     },
];

var _CAL_COMP_LABELS = {
  CCL:   'Comunicación lingüística (CCL)',
  CP:    'Plurilingüe (CP)',
  STEM:  'Matemática y científico-tecnológica (STEM)',
  CD:    'Digital (CD)',
  CPSAA: 'Personal, social y de aprender a aprender (CPSAA)',
  CC:    'Ciudadana (CC)',
  CE:    'Emprendedora (CE)',
  CCEC:  'Conciencia y expresión cultural (CCEC)',
};

// 1-indexed: 1=Iniciado 2=En proceso 3=Adquirido 4=Avanzado
var _COMP_NIVEL_LBL = ['', 'Iniciado', 'En proceso', 'Adquirido', 'Avanzado'];

// Estado del modal: { studentIdx: { COMP: nivel (1-4) } }
var _calCompNiveles = {};

function _calDetectarCompetencias(asig) {
  for (var i = 0; i < _CAL_COMP_MAP.length; i++) {
    if (_CAL_COMP_MAP[i].re.test(asig)) return _CAL_COMP_MAP[i].comps;
  }
  return ['CPSAA', 'CCL', 'STEM'];
}

// Genera un comentario de plantilla a partir de los niveles actuales del alumno idx.
// Se llama automáticamente al cambiar un dot (salvo que el usuario haya editado el textarea).
function _calCompAutoComment(idx) {
  var comps = window._calCompComps || [];
  var ns    = _calCompNiveles[idx] || {};
  var vals  = comps.map(function (c) { return ns[c] || 2; });
  var avg   = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 2;
  var bajas = comps.filter(function (c) { return (ns[c] || 2) <= 2; });
  var altas = comps.filter(function (c) { return (ns[c] || 2) >= 4; });
  var frase;
  if (avg >= 3.5) {
    frase = 'Demuestra un nivel avanzado o adquirido en las competencias clave evaluadas';
    if (altas.length) frase += ', con especial dominio en ' + altas.join(' y ');
    if (bajas.length) frase += '. Puede reforzar ' + bajas.join(' y ');
    frase += '.';
  } else if (avg >= 2.5) {
    frase = 'Ha adquirido satisfactoriamente las competencias clave evaluadas';
    if (bajas.length) frase += ', aunque puede mejorar en ' + bajas.join(' y ');
    frase += '.';
  } else if (avg >= 1.5) {
    frase = 'Se encuentra en proceso de adquisición de las competencias clave';
    if (bajas.length) frase += ', con mayor necesidad de apoyo en ' + bajas.join(' y ');
    frase += '. Progresa con esfuerzo.';
  } else {
    frase = 'Muestra un nivel inicial en las competencias clave evaluadas';
    if (bajas.length) frase += ', especialmente en ' + bajas.join(' y ');
    frase += '. Se recomienda refuerzo adicional.';
  }
  return frase;
}

function _calRenderNivelDots(idx, comp, curVal) {
  var html = '<div style="display:inline-flex;gap:1px;">';
  for (var n = 1; n <= 4; n++) {
    var filled = n <= curVal;
    html += '<button class="cal-ndot" data-idx="' + idx + '" data-comp="' + _calEsc(comp) + '" ' +
      'onclick="window._calCompSetNivel(' + idx + ',\'' + _calEsc(comp) + '\',' + n + ')" ' +
      'title="' + _calEsc(_COMP_NIVEL_LBL[n]) + '" ' +
      'style="background:none;border:none;cursor:pointer;padding:1px 2px;font-size:15px;line-height:1;color:' +
        (filled ? 'var(--ink)' : 'var(--muted-2)') + ';transition:color .12s;">' +
      (filled ? '●' : '○') +
    '</button>';
  }
  return html + '</div>';
}

async function _calGenCompetencial() {
  var asig  = ((document.getElementById('cal-prof-asig') || {}).value || '').trim();
  var evalu = (document.getElementById('cal-prof-eval') || {}).value;
  var btn   = document.getElementById('cal-comp-btn');
  var trs   = document.querySelectorAll('#cal-prof-tabla tr[data-alumno-id]');

  var pend = [];
  for (var i = 0; i < trs.length; i++) {
    var tr   = trs[i];
    var nota = ((tr.querySelector('.cal-nota') || {}).value || '').trim();
    if (nota !== '') pend.push({ tr: tr, nombre: tr.dataset.alumnoNombre, alumnoId: tr.dataset.alumnoId, nota: nota, idx: pend.length });
  }
  if (!pend.length) { _calToast('Carga alumnos con nota primero.', 'warn'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '🎯 Generando…'; }
  var rest = function () { if (btn) { btn.disabled = false; btn.textContent = '🎯 Competencial IA'; } };

  var comps = _calDetectarCompetencias(asig);
  var compLabels = comps.map(function (c) { return _CAL_COMP_LABELS[c] || c; }).join(', ');

  // Carga datos guardados previos para pre-rellenar niveles y comentario
  var savedData = {};
  try {
    var rs = await sb.from('comentarios_competenciales')
      .select('alumno_nombre,niveles,comentario')
      .eq('centro_id', ctrId).eq('asignatura', asig).eq('evaluacion', evalu);
    (rs.data || []).forEach(function (row) { savedData[row.alumno_nombre] = row; });
  } catch (e) {}

  var sys = 'Eres un docente español elaborando el informe de evaluación por competencias clave LOMLOE. ' +
    'Asignatura: "' + asig + '" (' + evalu + '). ' +
    'Las competencias clave más relevantes para esta asignatura son: ' + compLabels + '. ' +
    'Para CADA alumno escribe exactamente 2 frases en español, en tercera persona, que: ' +
    '(1) valoren el progreso en las competencias indicadas según la nota (alta ≥7, media 5-6.9, baja <5); ' +
    '(2) mencionen al menos 1 competencia clave con su sigla entre paréntesis, ej: "…ha demostrado buenas capacidades en STEM…". ' +
    'Tono profesional y constructivo. Máximo 40 palabras por alumno. ' +
    'Es OBLIGATORIO devolver un objeto por CADA número de la lista. ' +
    'Devuelve EXCLUSIVAMENTE un array JSON: [{"n":1,"comentario":"…"},{"n":2,"comentario":"…"}]. Sin markdown.';

  try {
    var resultados = {};
    var CH = 20;
    for (var s = 0; s < pend.length; s += CH) {
      var chunk = pend.slice(s, s + CH);
      var lista = chunk.map(function (p, idx) { return (idx + 1) + '. ' + p.nombre + ' — nota: ' + p.nota; }).join('\n');
      var txt = await _calIA(sys, 'Alumnos y notas:\n' + lista);
      if (txt) {
        var clean = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
        var arr = null;
        try { arr = JSON.parse(clean); } catch (e) {
          var m = clean.match(/\[[\s\S]*\]/);
          if (m) try { arr = JSON.parse(m[0]); } catch (e2) {}
        }
        if (Array.isArray(arr)) {
          arr.forEach(function (o) {
            var num = parseInt(o.n, 10);
            if (!isNaN(num) && chunk[num - 1]) resultados[chunk[num - 1].idx] = String(o.comentario || '').trim();
          });
        }
      }
    }
    _calAbrirModalCompetencial(pend, resultados, savedData, asig, evalu, comps);
  } catch (e) {
    _calToast('Error al generar informe competencial.', 'error');
  } finally {
    rest();
  }
}

function _calAbrirModalCompetencial(pend, resultados, savedData, asig, evalu, comps) {
  var prev = document.getElementById('cal-comp-modal');
  if (prev) prev.remove();

  // Inicializar estado de niveles (guardado > default 2 "En proceso")
  _calCompNiveles = {};
  pend.forEach(function (p, i) {
    _calCompNiveles[i] = {};
    var saved = savedData[p.nombre];
    comps.forEach(function (c) {
      _calCompNiveles[i][c] = (saved && saved.niveles && saved.niveles[c]) ? saved.niveles[c] : 2;
    });
  });

  var compPills = comps.map(function (c) {
    return '<span style="display:inline-block;background:var(--info-soft);color:var(--info);border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600;margin-right:4px;">' + _calEsc(c) + '</span>';
  }).join('');

  var rows = pend.map(function (p, i) {
    var saved = savedData[p.nombre];
    // IA primero; si no hay resultado de IA, usar el guardado previamente
    var comentario = resultados[p.idx] || (saved ? (saved.comentario || '') : '');
    var hasSaved   = saved && (saved.comentario || (saved.niveles && Object.keys(saved.niveles).length));

    var nivelRows = comps.map(function (c) {
      var cur = _calCompNiveles[i][c] || 2;
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">' +
        '<span style="font-size:11px;font-weight:700;color:var(--muted);min-width:52px;">' + _calEsc(c) + '</span>' +
        _calRenderNivelDots(i, c, cur) +
        '<span id="cal-nlbl-' + i + '-' + _calEsc(c) + '" style="font-size:11px;color:var(--muted);min-width:72px;">' + _calEsc(_COMP_NIVEL_LBL[cur]) + '</span>' +
      '</div>';
    }).join('');

    return '<div style="border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:10px;background:var(--paper)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<span style="font-weight:600;font-size:13px;color:var(--txt);">' + _calEsc(p.nombre) +
          (hasSaved ? '<span style="font-size:10px;color:var(--success);background:var(--success-soft);padding:1px 7px;border-radius:10px;margin-left:6px;">Guardado</span>' : '') +
        '</span>' +
        '<span style="font-size:12px;color:var(--muted);">Nota: ' + _calEsc(p.nota) + '</span>' +
      '</div>' +
      '<div style="background:var(--paper-2);border-radius:8px;padding:8px 10px;margin-bottom:10px;">' + nivelRows + '</div>' +
      '<textarea id="cal-comp-txt-' + i + '" rows="3" oninput="this.dataset.manualEdit=\'1\'" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;color:var(--txt);background:var(--paper-2);box-sizing:border-box;resize:vertical;font-family:var(--font-ui);">' +
        _calEsc(comentario) +
      '</textarea>' +
      '<div style="text-align:right;margin-top:6px;">' +
        '<button onclick="window._calCompAplicarUno(' + i + ')" style="font-size:12px;padding:4px 12px;border:1px solid var(--ink);border-radius:6px;background:transparent;color:var(--ink);cursor:pointer;font-family:var(--font-ui);">Aplicar como observación</button>' +
      '</div>' +
    '</div>';
  }).join('');

  var asigEsc  = _calEsc(asig).replace(/'/g, "\\'");
  var evaluEsc = _calEsc(evalu).replace(/'/g, "\\'");

  var modal = document.createElement('div');
  modal.id = 'cal-comp-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:8500;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;background:rgba(0,0,0,.45);overflow-y:auto;';
  modal.innerHTML =
    '<div style="background:var(--paper);border-radius:16px;width:100%;max-width:720px;box-shadow:var(--sh-lg);overflow:hidden;">' +
      '<div style="padding:20px 24px 16px;border-bottom:1px solid var(--line);">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">INFORME COMPETENCIAL · LOMLOE</div>' +
        '<h2 style="font-family:var(--font-display);font-size:22px;margin:0 0 6px;color:var(--txt);">' + _calEsc(asig) + ' · ' + _calEsc(evalu) + '</h2>' +
        '<div>' + compPills + '</div>' +
      '</div>' +
      '<div style="padding:20px 24px;max-height:60vh;overflow-y:auto;">' + rows + '</div>' +
      '<div style="padding:16px 24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button onclick="window._calGuardarCompetencialModal(' + pend.length + ',\'' + asigEsc + '\',\'' + evaluEsc + '\')" ' +
            'style="padding:9px 18px;border-radius:8px;background:var(--ink);color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-ui);">💾 Guardar</button>' +
          '<button onclick="window._calCompAplicarTodo(' + pend.length + ')" ' +
            'style="padding:9px 18px;border-radius:8px;background:var(--success);color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-ui);">✅ Aplicar al boletín</button>' +
          '<button onclick="window._calCompCopiarAlexia(' + pend.length + ',\'' + asigEsc + '\',\'' + evaluEsc + '\')" ' +
            'style="padding:9px 18px;border-radius:8px;background:var(--surface-sunk);color:var(--txt2);border:none;font-size:13px;cursor:pointer;font-family:var(--font-ui);">📋 Copiar para Alexia</button>' +
        '</div>' +
        '<button onclick="document.getElementById(\'cal-comp-modal\').remove()" ' +
          'style="padding:9px 18px;border-radius:8px;background:var(--surface-sunk);color:var(--txt2);border:none;font-size:13px;cursor:pointer;font-family:var(--font-ui);">Cerrar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  window._calCompPend  = pend;
  window._calCompComps = comps;
}

// Actualiza los dots de nivel en el modal al hacer clic y regenera el comentario de plantilla.
window._calCompSetNivel = function (idx, comp, val) {
  if (!_calCompNiveles[idx]) _calCompNiveles[idx] = {};
  _calCompNiveles[idx][comp] = val;
  document.querySelectorAll('.cal-ndot[data-idx="' + idx + '"][data-comp="' + comp + '"]').forEach(function (d, i) {
    var filled = (i + 1) <= val;
    d.textContent = filled ? '●' : '○';
    d.style.color = filled ? 'var(--ink)' : 'var(--muted-2)';
  });
  var lbl = document.getElementById('cal-nlbl-' + idx + '-' + comp);
  if (lbl) lbl.textContent = _COMP_NIVEL_LBL[val] || '';
  // Actualiza el comentario solo si el usuario no ha editado manualmente el textarea
  var txt = document.getElementById('cal-comp-txt-' + idx);
  if (txt && txt.dataset.manualEdit !== '1') {
    txt.value = _calCompAutoComment(idx);
  }
};

window._calCompAplicarUno = function (i) {
  var pend = window._calCompPend || [];
  var p    = pend[i];
  if (!p) return;
  var txt = (document.getElementById('cal-comp-txt-' + i) || {}).value || '';
  var inp = p.tr ? p.tr.querySelector('.cal-obs') : null;
  if (inp) { inp.value = txt; }
  _calToast('Aplicado a ' + _calEsc(p.nombre) + '.', 'ok');
};

window._calCompAplicarTodo = function (total) {
  var pend = window._calCompPend || [];
  var n = 0;
  for (var i = 0; i < total; i++) {
    var p   = pend[i]; if (!p) continue;
    var txt = (document.getElementById('cal-comp-txt-' + i) || {}).value || '';
    var inp = p.tr ? p.tr.querySelector('.cal-obs') : null;
    if (inp && txt) { inp.value = txt; n++; }
  }
  _calToast('✅ ' + n + ' comentario(s) competenciales aplicados. Recuerda guardar.', 'ok');
  var modal = document.getElementById('cal-comp-modal');
  if (modal) modal.remove();
};

// Persiste niveles + comentarios en comentarios_competenciales
window._calGuardarCompetencialModal = async function (total, asig, evalu) {
  var pend  = window._calCompPend  || [];
  var comps = window._calCompComps || [];
  var grupo = (document.getElementById('cal-prof-grupo') || {}).value || '';
  var rows  = [];
  for (var i = 0; i < total; i++) {
    var p = pend[i]; if (!p) continue;
    var txt = ((document.getElementById('cal-comp-txt-' + i) || {}).value || '').trim();
    var nivObj = {};
    comps.forEach(function (c) { nivObj[c] = (_calCompNiveles[i] && _calCompNiveles[i][c]) ? _calCompNiveles[i][c] : 2; });
    rows.push({
      centro_id:     ctrId,
      alumno_id:     (p.tr ? p.tr.dataset.alumnoId : (p.alumnoId || null)) || null,
      alumno_nombre: p.nombre,
      grupo:         grupo,
      asignatura:    asig,
      evaluacion:    evalu,
      niveles:       nivObj,
      comentario:    txt || null,
      generado_por:  currentUser ? currentUser.id : null,
      updated_at:    new Date().toISOString()
    });
  }
  if (!rows.length) return;
  try {
    var r = await sb.from('comentarios_competenciales')
      .upsert(rows, { onConflict: 'centro_id,alumno_nombre,asignatura,evaluacion', ignoreDuplicates: false });
    if (r.error) { _calToast('Error al guardar: ' + r.error.message, 'error'); return; }
    _calToast('✅ Evaluación competencial guardada para ' + rows.length + ' alumno(s).', 'ok');
  } catch (e) {
    _calToast('Error al guardar.', 'error');
  }
};

// Formatea los datos en texto plano listo para pegar en Alexia u otro SGA
window._calCompCopiarAlexia = function (total, asig, evalu) {
  var pend  = window._calCompPend  || [];
  var comps = window._calCompComps || [];
  var lines = [
    'INFORME DE EVALUACIÓN POR COMPETENCIAS CLAVE (LOMLOE)',
    asig + ' — ' + evalu,
    ''
  ];
  for (var i = 0; i < total; i++) {
    var p = pend[i]; if (!p) continue;
    var txt = ((document.getElementById('cal-comp-txt-' + i) || {}).value || '').trim();
    var ns  = _calCompNiveles[i] || {};
    lines.push('Alumno/a: ' + p.nombre + '  (Nota: ' + p.nota + ')');
    comps.forEach(function (c) {
      lines.push('  ' + c + ': ' + (_COMP_NIVEL_LBL[ns[c] || 2] || ''));
    });
    if (txt) lines.push('  Observación: ' + txt);
    lines.push('');
  }
  var text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function () {
    _calToast('📋 Copiado al portapapeles.', 'ok');
  }).catch(function () {
    _calToast('No se pudo copiar automáticamente (usa Ctrl+C).', 'warn');
  });
};
// ────────────────────────────────────────────────────────────────────────────────

async function calGuardar() {
  var grupo = (document.getElementById('cal-prof-grupo') || {}).value;
  var asig  = ((document.getElementById('cal-prof-asig') || {}).value || '').trim();
  var evalu = (document.getElementById('cal-prof-eval') || {}).value;
  if (!grupo || !asig || !evalu) { _calToast('Faltan grupo, asignatura o evaluación.', 'error'); return; }

  var trs = document.querySelectorAll('#cal-prof-tabla tr[data-alumno-id]');
  var rows = [];
  var cambios = [];   // alumnos cuya nota cambia (para avisar a la familia)
  var ahora = new Date().toISOString();
  for (var i = 0; i < trs.length; i++) {
    var tr = trs[i];
    var notaInp = tr.querySelector('.cal-nota');
    var obsInp  = tr.querySelector('.cal-obs');
    var raw = (notaInp.value || '').trim().replace(',', '.');
    var nota = null;
    if (raw !== '') {
      nota = parseFloat(raw);
      if (isNaN(nota) || nota < 0 || nota > 10) {
        _calToast('Nota inválida en "' + tr.dataset.alumnoNombre + '" (debe ser 0–10).', 'error');
        notaInp.focus();
        return;
      }
      nota = Math.round(nota * 100) / 100;
    }
    // ¿cambió respecto a lo cargado? (orig es el value precargado, '' = sin nota)
    var origRaw = (tr.dataset.notaOrig || '').trim().replace(',', '.');
    if (nota !== null && String(nota) !== origRaw) {
      cambios.push({ alumno_id: tr.dataset.alumnoId, alumno_nombre: tr.dataset.alumnoNombre });
    }
    rows.push({
      centro_id:       ctrId,
      alumno_id:       tr.dataset.alumnoId,
      alumno_nombre:   tr.dataset.alumnoNombre,
      grupo:           grupo,
      asignatura:      asig,
      evaluacion:      evalu,
      nota:            nota,
      observaciones:   (obsInp.value || '').trim() || null,
      profesor_id:     currentUser ? currentUser.id : null,
      profesor_nombre: currentUserName || null,
      updated_at:      ahora
    });
  }

  if (!rows.length) { _calToast('No hay alumnos que guardar.', 'warn'); return; }

  var r = await sb.from('calificaciones').upsert(rows, { onConflict: 'centro_id,alumno_id,asignatura,evaluacion' });
  if (r.error) { _calToast('Error al guardar: ' + r.error.message, 'error'); return; }
  // Refrescar las notas "originales" en el DOM para no re-avisar en un segundo guardado
  for (var k = 0; k < trs.length; k++) {
    var ni = trs[k].querySelector('.cal-nota');
    var nr = (ni.value || '').trim().replace(',', '.');
    trs[k].dataset.notaOrig = (nr === '' ? '' : String(Math.round(parseFloat(nr) * 100) / 100));
  }
  _calToast('✅ ' + rows.length + ' calificaciones guardadas' +
    (cambios.length ? ' · ' + cambios.length + ' familia(s) avisada(s)' : '') + '.', 'ok');
  if (cambios.length) _calNotificarFamilias(cambios, asig, evalu); // fire-and-forget
}

// Push a las familias de los alumnos cuya nota cambió (solo aviso de que hay
// nueva nota — NO el valor; la nota real queda tras login con su RLS).
async function _calNotificarFamilias(cambios, asig, evalu) {
  try {
    var ids = cambios.map(function (c) { return c.alumno_id; });
    var r = await sb.from('familia_alumno').select('alumno_id,profile_id').in('alumno_id', ids);
    var byAlumno = {};
    (r.data || []).forEach(function (x) { (byAlumno[x.alumno_id] = byAlumno[x.alumno_id] || []).push(x.profile_id); });
    cambios.forEach(function (c) {
      var fams = byAlumno[c.alumno_id];
      if (!fams || !fams.length) return;
      var primer = (c.alumno_nombre || '').split(',')[0].trim() || 'Tu hijo/a';
      fetch(SB_URL + '/functions/v1/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY },
        body: JSON.stringify({
          user_ids: fams,
          title: '📝 Nueva calificación',
          body: primer + ' tiene una nueva nota de ' + asig + ' (' + evalu + ').',
          tag: 'nota-' + c.alumno_id,
          url: '/app.html'
        })
      }).catch(function () {});
    });
  } catch (e) { /* silencioso */ }
}

/* ════════════════════════════════════════════════════
   VISTA ADMIN / JEFATURA / DIRECTOR / SUPERADMIN — consulta + export
   ════════════════════════════════════════════════════ */
async function _calRenderAdmin() {
  var cont = document.getElementById('cal-container');
  _calCentroSel = _calCentroSel || ctrId;
  _calSelectedAlumno = null;
  cont.style.flexDirection = 'row';

  var centroSelHtml = '';
  if (role === 'superadmin') {
    var rc = await sb.from('centros').select('id,nombre').order('nombre');
    _calCentros = rc.data || [];
    var opts = _calCentros.map(function (c) {
      return '<option value="' + _calEsc(c.id) + '"' + (c.id === _calCentroSel ? ' selected' : '') + '>' + _calEsc(c.nombre) + '</option>';
    }).join('');
    centroSelHtml =
      '<div style="min-width:120px;flex:1;"><label class="lbl" style="font-size:10.5px;">Centro</label>' +
        '<select class="fi" id="cal-f-centro" onchange="calChangeCentro(this.value)" style="height:32px;font-size:12px;">' + opts + '</select></div>';
  }

  cont.innerHTML =
    '<div class="cal-list-panel">' +
      '<div class="cal-list-hdr">' +
        '<div>' +
          '<div style="font-family:var(--font-display);font-size:22px;font-weight:400;letter-spacing:-.02em;">Calificaciones</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:2px;">Consulta y exportación</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button class="btn btn-s" onclick="calExportarCSV()" style="font-size:12px;padding:5px 10px;">📥 CSV</button>' +
          '<button class="btn btn-s" onclick="calExportarPDF()" style="font-size:12px;padding:5px 10px;">📄 PDF</button>' +
          '<button class="btn btn-p" onclick="calAdminCargar()" style="font-size:12px;padding:5px 10px;" title="Actualizar">↺</button>' +
        '</div>' +
      '</div>' +
      '<div class="cal-filtros-wrap">' +
        centroSelHtml +
        '<div style="min-width:90px;flex:1;"><label class="lbl" style="font-size:10.5px;">Grupo</label><select class="fi" id="cal-f-grupo" onchange="_calRenderTablaAdmin()" style="height:32px;font-size:12px;"><option value="">Todos</option></select></div>' +
        '<div style="min-width:100px;flex:1;"><label class="lbl" style="font-size:10.5px;">Asignatura</label><select class="fi" id="cal-f-asig" onchange="_calRenderTablaAdmin()" style="height:32px;font-size:12px;"><option value="">Todas</option></select></div>' +
        '<div style="min-width:100px;flex:1;"><label class="lbl" style="font-size:10.5px;">Evaluación</label><select class="fi" id="cal-f-eval" onchange="_calRenderTablaAdmin()" style="height:32px;font-size:12px;"><option value="">Todas</option></select></div>' +
        '<div style="min-width:100px;flex:1;"><label class="lbl" style="font-size:10.5px;">Profesor</label><select class="fi" id="cal-f-prof" onchange="_calRenderTablaAdmin()" style="height:32px;font-size:12px;"><option value="">Todos</option></select></div>' +
        '<button class="btn btn-s" onclick="_calLimpiarFiltros()" style="flex-shrink:0;height:32px;align-self:flex-end;font-size:12px;padding:0 10px;" title="Limpiar filtros">✕</button>' +
      '</div>' +
      '<div class="cal-list-scroll"><div id="cal-admin-tabla"></div></div>' +
    '</div>' +
    '<div class="cal-detail-panel">' +
      '<div id="cal-alumno-panel" class="cal-alumno-empty">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--muted-2);"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>' +
        '<p style="font-size:14px;color:var(--muted);max-width:180px;line-height:1.5;margin:0;">Selecciona un alumno para ver su expediente de notas</p>' +
      '</div>' +
    '</div>';

  await calAdminCargar();
}

function calChangeCentro(id) { _calCentroSel = id; calAdminCargar(); }

async function calAdminCargar() {
  var box = document.getElementById('cal-admin-tabla');
  if (box) box.innerHTML = '<div class="card" style="text-align:center;color:var(--txt3);font-size:13px;"><span class="spin">⟳</span> Cargando calificaciones…</div>';

  var r = await sb.from('calificaciones').select('*')
    .eq('centro_id', _calCentroSel || ctrId)
    .order('grupo').order('alumno_nombre').limit(10000);

  if (r.error) {
    if (box) box.innerHTML = '<div class="card" style="color:var(--red);font-size:13px;">Error: ' + _calEsc(r.error.message) + '</div>';
    return;
  }
  _calData = r.data || [];

  // Poblar dropdowns de filtros a partir de los datos
  var fill = function (id, vals, ph) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + ph + '</option>' +
      vals.map(function (v) { return '<option value="' + _calEsc(v) + '">' + _calEsc(v) + '</option>'; }).join('');
    sel.value = cur;
  };
  var uniq = function (key) {
    return [...new Set(_calData.map(function (c) { return c[key]; }).filter(Boolean))]
      .sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); });
  };
  fill('cal-f-grupo', uniq('grupo'), 'Todos');
  fill('cal-f-asig', uniq('asignatura'), 'Todas');
  fill('cal-f-eval', CAL_EVALS, 'Todas');
  fill('cal-f-prof', uniq('profesor_nombre'), 'Todos');

  _calRenderTablaAdmin();
}

function _calLimpiarFiltros() {
  ['cal-f-grupo', 'cal-f-asig', 'cal-f-eval', 'cal-f-prof'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  _calRenderTablaAdmin();
}

function _calFiltradas() {
  var fg = (document.getElementById('cal-f-grupo') || {}).value || '';
  var fa = (document.getElementById('cal-f-asig')  || {}).value || '';
  var fe = (document.getElementById('cal-f-eval')  || {}).value || '';
  var fp = (document.getElementById('cal-f-prof')  || {}).value || '';
  return _calData.filter(function (c) {
    return (!fg || c.grupo === fg) && (!fa || c.asignatura === fa) &&
           (!fe || c.evaluacion === fe) && (!fp || c.profesor_nombre === fp);
  });
}

function _calFechaCorta(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(iso).slice(0, 10); }
}

function _calRenderTablaAdmin() {
  var box = document.getElementById('cal-admin-tabla');
  if (!box) return;
  var rows = _calFiltradas();

  if (!rows.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:24px;">No hay calificaciones que mostrar.</div>';
    return;
  }

  var body = rows.map(function (c) {
    var notaTxt = (c.nota === null || c.nota === undefined) ? '—' : String(c.nota);
    var notaCol = (c.nota !== null && c.nota !== undefined)
      ? (Number(c.nota) < 5 ? 'color:var(--danger);' : 'color:var(--success);')
      : '';
    var sel = _calSelectedAlumno && c.alumno_nombre === _calSelectedAlumno;
    return '<tr data-alumno="' + _calEsc(c.alumno_nombre || '') + '" data-grupo="' + _calEsc(c.grupo || '') + '" onclick="_calClicarFila(this)"' + (sel ? ' class="cal-row-sel"' : '') + '>' +
      '<td style="font-weight:500;">' + _calEsc(c.alumno_nombre || '—') + '</td>' +
      '<td>' + _calEsc(c.grupo || '—') + '</td>' +
      '<td>' + _calEsc(c.asignatura || '—') + '</td>' +
      '<td>' + _calEsc(c.evaluacion || '—') + '</td>' +
      '<td style="text-align:center;font-weight:600;' + notaCol + '">' + _calEsc(notaTxt) + '</td>' +
      '<td>' + _calEsc(c.profesor_nombre || '—') + '</td>' +
      '<td style="font-size:11px;color:var(--txt3);">' + _calEsc(_calFechaCorta(c.updated_at || c.created_at)) + '</td>' +
    '</tr>';
  }).join('');

  box.innerHTML =
    '<div style="font-size:12px;color:var(--txt3);padding:10px 4px 6px;">' + rows.length + ' calificaciones</div>' +
    '<div style="overflow-x:auto;"><table class="tbl">' +
      '<thead><tr><th>Alumno</th><th>Grupo</th><th>Asignatura</th><th>Evaluación</th>' +
      '<th style="text-align:center;">Nota</th><th>Profesor</th><th style="font-size:11px;">Modificado</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
}

function _calClicarFila(tr) {
  _calAbrirAlumno(tr.dataset.alumno, tr.dataset.grupo);
}

function _calAbrirAlumno(nombre, grupo) {
  _calSelectedAlumno = nombre;
  document.querySelectorAll('#cal-admin-tabla .tbl tbody tr[data-alumno]').forEach(function(r) {
    r.classList.toggle('cal-row-sel', r.dataset.alumno === nombre);
  });

  var panel = document.getElementById('cal-alumno-panel');
  if (!panel) return;

  var notas = _calData.filter(function(c) { return c.alumno_nombre === nombre; });
  if (!notas.length) {
    panel.className = 'cal-alumno-empty';
    panel.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--muted-2);"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>' +
      '<p style="font-size:14px;color:var(--muted);margin:0;">Sin calificaciones para este alumno.</p>';
    return;
  }

  panel.className = 'cal-alumno-content';

  var EVALS = ['1ª Evaluación', '2ª Evaluación', '3ª Evaluación', 'Final'];
  var EVALS_LBL = ['1ª Ev.', '2ª Ev.', '3ª Ev.', 'Final'];
  var grupoAlumno = grupo || notas[0].grupo || '';
  // Alumno activo para el boletín PDF (la vista admin no maneja alumno_id)
  window._calAdminAlumno = { nombre: nombre, grupo: grupoAlumno };

  var porAsig = {};
  notas.forEach(function(c) {
    var k = c.asignatura || '—';
    if (!porAsig[k]) porAsig[k] = { prof: c.profesor_nombre || '' };
    porAsig[k][c.evaluacion] = c.nota;
  });
  var asigs = Object.keys(porAsig).sort(function(a, b) { return a.localeCompare(b, 'es'); });

  var allNotas = notas.filter(function(c) { return c.nota !== null && c.nota !== undefined; }).map(function(c) { return Number(c.nota); });
  var avg = allNotas.length ? (allNotas.reduce(function(a, b) { return a + b; }, 0) / allNotas.length) : null;
  var avgStr = avg !== null ? avg.toFixed(1) : null;
  var avgCol = avgStr ? (Number(avgStr) < 5 ? 'var(--danger)' : 'var(--success)') : 'var(--muted)';

  var celNota = function(n) {
    if (n === null || n === undefined || n === '') return '<span style="color:var(--muted-2);">—</span>';
    var num = Number(n);
    var col = num < 5 ? 'var(--danger)' : 'var(--success)';
    return '<span style="font-weight:700;font-size:15px;color:' + col + ';">' + _calEsc(String(num)) + '</span>';
  };

  var html = '';

  // Cabecera alumno
  html += '<div style="padding:20px 20px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">';
  html += '<div><div style="font-family:var(--font-display);font-size:21px;letter-spacing:-.02em;color:var(--txt);margin-bottom:4px;">' + _calEsc(nombre) + '</div>';
  if (grupoAlumno) html += '<div style="font-size:13px;color:var(--muted);">' + _calEsc(grupoAlumno) + '</div>';
  html += '</div>';
  html += '<button class="btn btn-s" id="cal-bol-btn-admin" style="white-space:nowrap;" onclick="_calBoletinPDF(window._calAdminAlumno, \'cal-bol-btn-admin\')">⬇ Boletín PDF</button>';
  html += '</div>';

  // Stat media
  if (avgStr) {
    html += '<div style="display:flex;align-items:center;gap:16px;margin:14px 20px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 16px;">';
    html += '<div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Media general</div>';
    html += '<div style="font-size:32px;font-family:var(--font-display);font-weight:400;color:' + avgCol + ';line-height:1;">' + _calEsc(avgStr) + '</div></div>';
    html += '<div style="margin-left:auto;text-align:right;">';
    html += '<div style="font-size:12px;color:var(--muted);">' + asigs.length + ' asignaturas</div>';
    html += '<div style="font-size:12px;color:var(--muted);">' + allNotas.length + ' notas</div>';
    html += '</div></div>';
  }

  // Tabla pivote asignatura × evaluación
  html += '<div style="padding:0 20px 20px;overflow-x:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px;background:var(--paper);border-radius:10px;border:1px solid var(--line);overflow:hidden;min-width:280px;">';
  html += '<thead><tr style="background:var(--paper-2);">';
  html += '<th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line);">Asignatura</th>';
  EVALS_LBL.forEach(function(e) {
    html += '<th style="padding:9px 8px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line);min-width:46px;">' + _calEsc(e) + '</th>';
  });
  html += '</tr></thead><tbody>';
  asigs.forEach(function(a, idx) {
    html += '<tr' + (idx < asigs.length - 1 ? ' style="border-bottom:1px solid var(--line);"' : '') + '>';
    html += '<td style="padding:10px 12px;font-weight:500;color:var(--txt);">' + _calEsc(a);
    if (porAsig[a].prof) html += '<div style="font-size:10.5px;color:var(--muted);font-weight:400;">' + _calEsc(porAsig[a].prof) + '</div>';
    html += '</td>';
    EVALS.forEach(function(e) {
      html += '<td style="padding:10px 8px;text-align:center;">' + celNota(porAsig[a][e]) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  panel.innerHTML = html;
  _calLoadCompetencialAdmin(panel, nombre);
}

// Carga y muestra la sección competencial LOMLOE en el panel de detalle del alumno (admin/director).
// Fire-and-forget: no bloquea el render inicial de notas.
async function _calLoadCompetencialAdmin(panel, nombre) {
  try {
    var r = await sb.from('comentarios_competenciales')
      .select('asignatura,evaluacion,niveles,comentario')
      .eq('centro_id', ctrId)
      .eq('alumno_nombre', nombre);
    var data = r.data || [];
    if (!data.length) return;
    if (_calSelectedAlumno !== nombre) return; // el usuario cambió de alumno mientras cargaba
    data.sort(function (a, b) {
      return (a.asignatura || '').localeCompare(b.asignatura || '', 'es') ||
             (a.evaluacion || '').localeCompare(b.evaluacion || '', 'es');
    });
    var _NL = ['', 'Iniciado', 'En proceso', 'Adquirido', 'Avanzado'];
    var _NC = ['', 'var(--danger)', 'var(--warning)', 'var(--info)', 'var(--success)'];
    var _NB = ['', 'var(--danger-soft)', 'var(--warning-soft)', 'var(--info-soft)', 'var(--success-soft)'];
    var h = '<div style="padding:0 20px 20px;">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;padding-top:4px;">Competencias clave · LOMLOE</div>';
    data.forEach(function (d) {
      var pills = Object.entries(d.niveles || {}).map(function (kv) {
        var n = kv[1]; var lbl = _NL[n] || '';
        return '<span style="display:inline-block;background:' + (_NB[n]||'var(--surface-sunk)') + ';color:' + (_NC[n]||'var(--muted)') + ';border-radius:20px;padding:2px 8px;font-size:10px;font-weight:600;margin:2px 2px 2px 0;">' +
          _calEsc(kv[0]) + ' · ' + _calEsc(lbl) + '</span>';
      }).join('');
      h += '<div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<span style="font-weight:600;font-size:13px;color:var(--txt);">' + _calEsc(d.asignatura || '—') + '</span>' +
          '<span style="font-size:11px;color:var(--muted);">' + _calEsc(d.evaluacion || '—') + '</span>' +
        '</div>';
      if (pills) h += '<div style="margin-bottom:' + (d.comentario ? '7px' : '0') + ';">' + pills + '</div>';
      if (d.comentario) h += '<div style="font-size:12px;color:var(--txt2);padding-top:7px;border-top:1px solid var(--line);">' + _calEsc(d.comentario) + '</div>';
      h += '</div>';
    });
    h += '</div>';
    if (document.getElementById('cal-alumno-panel') === panel && _calSelectedAlumno === nombre) {
      panel.insertAdjacentHTML('beforeend', h);
    }
  } catch (_) { /* tabla aún no aplicada — se omite sin error */ }
}

// ── EXPORT CSV (SheetJS) ──
function calExportarCSV() {
  if (typeof XLSX === 'undefined') { _calToast('La librería de exportación (Excel) no está disponible.', 'error'); return; }
  var rows = _calFiltradas();
  if (!rows.length) { _calToast('No hay calificaciones para exportar.', 'warn'); return; }
  var aoa = [['Alumno', 'Grupo', 'Asignatura', 'Evaluación', 'Nota', 'Observaciones', 'Profesor', 'Fecha']];
  rows.forEach(function (c) {
    aoa.push([
      c.alumno_nombre || '', c.grupo || '', c.asignatura || '', c.evaluacion || '',
      (c.nota === null || c.nota === undefined) ? '' : c.nota,
      c.observaciones || '', c.profesor_nombre || '', _calFechaCorta(c.updated_at || c.created_at)
    ]);
  });
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 7 }, { wch: 30 }, { wch: 22 }, { wch: 18 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Calificaciones');
  XLSX.writeFile(wb, 'calificaciones_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// ── EXPORT PDF (jsPDF on-demand) ──
async function calExportarPDF() {
  var rows = _calFiltradas();
  if (!rows.length) { _calToast('No hay calificaciones para exportar.', 'warn'); return; }
  if (typeof window.jspdf === 'undefined') {
    await new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(function () {});
  }
  if (typeof window.jspdf === 'undefined') { _calToast('No se pudo cargar el generador de PDF.', 'error'); return; }

  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  var W = doc.internal.pageSize.getWidth();
  var H = doc.internal.pageSize.getHeight();
  var M = 12;

  doc.setFontSize(15); doc.setTextColor(31, 44, 79);
  doc.text('Calificaciones — ' + (ctrName || 'Centro'), M, 16);
  doc.setFontSize(9); doc.setTextColor(120, 120, 120);
  doc.text('Generado: ' + new Date().toLocaleDateString('es-ES') + '  ·  ' + rows.length + ' calificaciones', M, 22);

  var cols = [
    { t: 'Alumno', w: 60 }, { t: 'Grupo', w: 22 }, { t: 'Asignatura', w: 45 },
    { t: 'Evaluación', w: 32 }, { t: 'Nota', w: 16 }, { t: 'Profesor', w: 50 }, { t: 'Fecha', w: 38 }
  ];
  var y = 30, rowH = 7;
  var drawHead = function () {
    doc.setFillColor(31, 44, 79); doc.setTextColor(255, 255, 255); doc.setFontSize(8.5);
    var x = M;
    cols.forEach(function (c) { doc.rect(x, y, c.w, rowH, 'F'); doc.text(c.t, x + 1.5, y + 4.8); x += c.w; });
    y += rowH;
    doc.setTextColor(40, 40, 40);
  };
  drawHead();

  rows.forEach(function (c, i) {
    if (y + rowH > H - M) { doc.addPage(); y = M; drawHead(); }
    if (i % 2 === 0) { doc.setFillColor(244, 242, 238); doc.rect(M, y, W - 2 * M, rowH, 'F'); }
    doc.setFontSize(8); doc.setTextColor(40, 40, 40);
    var vals = [
      c.alumno_nombre || '', c.grupo || '', c.asignatura || '', c.evaluacion || '',
      (c.nota === null || c.nota === undefined) ? '—' : String(c.nota),
      c.profesor_nombre || '', _calFechaCorta(c.updated_at || c.created_at)
    ];
    var x = M;
    cols.forEach(function (col, ci) {
      doc.text(doc.splitTextToSize(String(vals[ci]), col.w - 2)[0] || '', x + 1.5, y + 4.8);
      x += col.w;
    });
    y += rowH;
  });

  doc.save('calificaciones_' + new Date().toISOString().slice(0, 10) + '.pdf');
}
