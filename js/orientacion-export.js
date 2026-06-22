// ── ORIENTACIÓN — Exportación RGPD del expediente + estadísticas ──
// Extraído de orientacion.js (2026-06-22) para reducir su tamaño. Funciones
// top-level (globales) auto-registradas en window; cargado DESPUÉS de
// orientacion.js en app.html. Usa helpers/estado globales de orientacion.js
// (_oriEsc, _oriCentroInfo, _oriEnsureJsPDF, _oriExpedientes, etc.).

// ════════════════════════════════════════════════════════════════════════════
//  PASO 2 — EXPORTACIÓN COMPLETA DEL EXPEDIENTE (derecho de acceso RGPD)
//  Un único PDF (jsPDF + jspdf-autotable) con TODO el expediente.
//  Solo admin/director/jefatura/superadmin (botón role-gated + guardia aquí).
// ════════════════════════════════════════════════════════════════════════════
async function _oriEnsureAutoTable() {
  await _oriEnsureJsPDF();
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!(jsPDF && jsPDF.API && typeof jsPDF.API.autoTable === "function")) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
}

function _oriCursoStart() {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 8 ? y : y - 1;   // septiembre = mes 8
  return startYear + "-09-01";
}

function _oriSlug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "centro";
}
function _oriApellido(nombre) {
  if (!nombre) return "alumno";
  const n = String(nombre).trim();
  const ap = n.indexOf(",") !== -1 ? n.split(",")[0] : n.split(/\s+/).slice(-1)[0];
  return _oriSlug(ap) || "alumno";
}

function _oriPdfBand(doc, centro, logo, rgb, titulo, subtitulo) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.rect(0, 0, W, 28, "F");
  let x = 12;
  if (logo && logo.dataURL) {
    try {
      let h = 18, w = h * (logo.w / logo.h);
      if (w > 42) { w = 42; h = w * (logo.h / logo.w); }
      doc.addImage(logo.dataURL, "PNG", 12, 5, w, h); x = 12 + w + 7;
    } catch (e) { /* logo opcional */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.setFont(undefined, "bold");
  doc.text(centro.nombre || "Centro", x, 13);
  doc.setFontSize(11); doc.setFont(undefined, "normal");
  doc.text(titulo, x, 21);
  if (subtitulo) { doc.setFontSize(9); doc.text(subtitulo, W - 12, 13, { align: "right" }); }
  doc.setTextColor(40, 40, 40);
}

function _oriPdfFooters(doc, centroNombre) {
  const total = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(130, 130, 130);
    doc.text(centroNombre || "Centro", 12, H - 8);
    doc.text("Página " + p + " / " + total, W - 12, H - 8, { align: "right" });
  }
}

function _oriPdfHeading(doc, texto, y, rgb) {
  const H = doc.internal.pageSize.getHeight();
  const W = doc.internal.pageSize.getWidth();
  if (y > H - 34) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.setTextColor(rgb.r, rgb.g, rgb.b);
  doc.text(texto, 14, y); y += 2;
  doc.setDrawColor(rgb.r, rgb.g, rgb.b); doc.setLineWidth(0.4); doc.line(14, y, W - 14, y);
  y += 6; doc.setTextColor(40, 40, 40); doc.setFont(undefined, "normal");
  return y;
}

function _oriPdfParrafo(doc, texto, y, opts) {
  opts = opts || {};
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14, bottom = H - 16;
  doc.setFontSize(opts.size || 10);
  doc.setFont(undefined, opts.bold ? "bold" : "normal");
  doc.setTextColor.apply(doc, opts.color || [40, 40, 40]);
  const lines = doc.splitTextToSize(String(texto == null ? "" : texto), W - 2 * M);
  const lh = opts.lh || 5;
  lines.forEach(ln => {
    if (y > bottom) { doc.addPage(); y = 20; }
    doc.text(ln, M, y); y += lh;
  });
  return y;
}

async function _oriNombresProfiles(ids) {
  const map = {};
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return map;
  const { data } = await sb.from("profiles").select("id,full_name").in("id", uniq);
  (data || []).forEach(p => { map[p.id] = p.full_name; });
  return map;
}

async function oriExportarExpedienteCompleto() {
  if (!_oriExpActual) return;
  if (["admin", "director", "jefatura", "superadmin"].indexOf(role) === -1) {
    alert("No tienes permiso para exportar el expediente completo."); return;
  }
  const e = _oriExpActual;

  // Recoge TODO el expediente (no solo lo visible en pantalla)
  const [medRes, infRes, cuestRes, tramRes, alertRes, centro] = await Promise.all([
    sb.from("medidas_atencion").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).order("fecha_inicio", { ascending: false }),
    sb.from("informes_psicopedagogicos").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).order("created_at", { ascending: false }),
    sb.from("cuestionarios_docentes").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).eq("estado", "completado").order("created_at", { ascending: false }),
    sb.from("tramites_orientacion").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).order("created_at", { ascending: false }),
    sb.from("alertas_orientacion").select("*").eq("centro_id", ctrId).eq("alumno_id", e.alumno_id).order("created_at", { ascending: false }),
    _oriCentroInfo()
  ]);
  const medidas = medRes.data || [], informes = infRes.data || [], cuests = cuestRes.data || [],
        tramites = tramRes.data || [], alertas = alertRes.data || [];
  const nameMap = await _oriNombresProfiles(
    informes.map(i => i.creado_por).concat(cuests.map(c => c.profesor_id))
  );

  try { await _oriEnsureAutoTable(); }
  catch (err) { alert("No se pudo cargar la librería de PDF."); return; }

  const rgb = _oriHexToRgb(centro.color);
  const logo = await _oriImgToDataURL(centro.logo);
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const tablaOpts = { styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [rgb.r, rgb.g, rgb.b] }, margin: { left: 14, right: 14 } };

  // ── PÁGINA 1 — PORTADA ──
  _oriPdfBand(doc, centro, logo, rgb, "EXPEDIENTE DE ORIENTACIÓN PSICOPEDAGÓGICA", "");
  let y = 40;
  doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.setTextColor(194, 77, 47);
  doc.text("DOCUMENTO CONFIDENCIAL — Uso restringido al personal autorizado", 14, y); y += 10;
  doc.setTextColor(40, 40, 40);
  y = _oriPdfParrafo(doc, "Alumno/a: " + e.alumno, y, { bold: true, size: 12, lh: 7 });
  y = _oriPdfParrafo(doc, "Grupo: " + e.grupo, y, { lh: 6 });
  y = _oriPdfParrafo(doc, "Centro: " + (centro.nombre || "—"), y, { lh: 6 });
  y = _oriPdfParrafo(doc, "Orientador/a responsable: " + (e.orientador || "—"), y, { lh: 6 });
  y = _oriPdfParrafo(doc, "Fecha de apertura del expediente: " + _oriFmtFecha(e.fecha_apertura), y, { lh: 6 });
  y += 2;
  y = _oriPdfParrafo(doc, "Fecha de exportación: " + new Date().toLocaleString("es-ES"), y, { lh: 6 });
  y += 4;
  y = _oriPdfParrafo(doc,
    "Documento generado en ejercicio del derecho de acceso (Art. 15 RGPD). " +
    "Contiene datos de categoría especial. Tratamiento conforme a LOPDGDD.",
    y, { size: 9, color: [110, 110, 110], lh: 5 });

  // ── SECCIÓN 1 — MEDIDAS DE ATENCIÓN ──
  y = _oriPdfHeading(doc, "1. Medidas de atención a la diversidad", y, rgb);
  if (medidas.length) {
    doc.autoTable(Object.assign({}, tablaOpts, {
      startY: y,
      head: [["Tipo", "Descripción", "Asignaturas", "Fecha inicio", "Estado"]],
      body: medidas.map(m => [
        m.tipo || "", m.descripcion || "",
        _oriAsignaturas(m.asignaturas_afectadas).join(", "),
        _oriFmtFecha(m.fecha_inicio), m.activa ? "Activa" : "Inactiva"
      ])
    }));
    y = doc.lastAutoTable.finalY + 4;
  } else { y = _oriPdfParrafo(doc, "Sin medidas registradas.", y, { color: [120, 120, 120] }); }

  // ── SECCIÓN 2 — INFORMES ──
  y = _oriPdfHeading(doc, "2. Informes psicopedagógicos", y, rgb);
  if (informes.length) {
    informes.forEach((inf, idx) => {
      if (idx > 0) {
        const W = doc.internal.pageSize.getWidth();
        if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 20; }
        doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2); doc.line(14, y, W - 14, y); y += 6;
      }
      y = _oriPdfParrafo(doc,
        (inf.tipo || "") + "  ·  " + (inf.estado || "") + "  ·  " + _oriFmtFecha(inf.created_at) +
        "  ·  " + (nameMap[inf.creado_por] || "—"),
        y, { bold: true, size: 10, lh: 6 });
      y = _oriPdfParrafo(doc, inf.texto_final || inf.borrador_texto || "(Sin contenido)", y, { size: 10, lh: 5 });
      y += 2;
    });
  } else { y = _oriPdfParrafo(doc, "Sin informes registrados.", y, { color: [120, 120, 120] }); }

  // ── SECCIÓN 3 — OBSERVACIONES DOCENTES ──
  y = _oriPdfHeading(doc, "3. Observaciones docentes (cuestionarios)", y, rgb);
  if (cuests.length) {
    cuests.forEach(c => {
      const r = c.respuestas || {};
      y = _oriPdfParrafo(doc,
        (nameMap[c.profesor_id] || "Docente") + "  ·  " + (c.asignatura || "—") + "  ·  " + _oriFmtFecha(c.created_at),
        y, { bold: true, size: 10, lh: 6 });
      _ORI_CUEST_PREGUNTAS.forEach(p => {
        y = _oriPdfParrafo(doc, p[1], y, { bold: true, size: 9, color: [90, 90, 90], lh: 5 });
        y = _oriPdfParrafo(doc, r[p[0]] || "—", y, { size: 10, lh: 5 });
      });
      y += 3;
    });
  } else { y = _oriPdfParrafo(doc, "Sin cuestionarios completados.", y, { color: [120, 120, 120] }); }

  // ── SECCIÓN 4 — TRÁMITES ──
  y = _oriPdfHeading(doc, "4. Trámites administrativos", y, rgb);
  if (tramites.length) {
    doc.autoTable(Object.assign({}, tablaOpts, {
      startY: y,
      head: [["Tipo", "Estado", "Descripción", "Fecha estimada", "Visible familia"]],
      body: tramites.map(t => [
        t.tipo || "", t.estado_tramite || "", t.descripcion || "",
        _oriFmtFecha(t.fecha_estimada), t.visible_familia ? "Sí" : "No"
      ])
    }));
    y = doc.lastAutoTable.finalY + 4;
  } else { y = _oriPdfParrafo(doc, "Sin trámites registrados.", y, { color: [120, 120, 120] }); }

  // ── SECCIÓN 5 — ALERTAS ──
  y = _oriPdfHeading(doc, "5. Alertas de riesgo", y, rgb);
  if (alertas.length) {
    doc.autoTable(Object.assign({}, tablaOpts, {
      startY: y,
      head: [["Tipo", "Nivel", "Descripción", "Fecha", "Estado"]],
      body: alertas.map(a => [
        a.tipo || "", a.nivel_riesgo || "", a.descripcion_ia || "",
        _oriFmtFecha(a.created_at), a.estado || ""
      ])
    }));
    y = doc.lastAutoTable.finalY + 4;
  } else { y = _oriPdfParrafo(doc, "Sin alertas registradas.", y, { color: [120, 120, 120] }); }

  // ── NOTA DE CIERRE ──
  if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 20; }
  y += 6;
  const total = doc.getNumberOfPages();
  y = _oriPdfParrafo(doc, "Fin del expediente. Total de páginas: " + total + ".", y, { bold: true, size: 10, lh: 6 });
  y = _oriPdfParrafo(doc, "Exportado por: " + (currentUserName || "—") + " el " + new Date().toLocaleString("es-ES") + ".", y, { size: 9, color: [110, 110, 110], lh: 5 });

  _oriPdfFooters(doc, centro.nombre);
  doc.save("expediente-orientacion-" + _oriApellido(e.alumno) + "-" + new Date().toISOString().slice(0, 10) + ".pdf");
}
window.oriExportarExpedienteCompleto = oriExportarExpedienteCompleto;

// ════════════════════════════════════════════════════════════════════════════
//  PASO 3 — ESTADÍSTICAS DEL DEPARTAMENTO DE ORIENTACIÓN
// ════════════════════════════════════════════════════════════════════════════
let _oriStatsData = null;
window._oriCharts = window._oriCharts || {};

const _ORI_MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

async function _oriComputeStats() {
  const cursoStart = _oriCursoStart();
  const seis = new Date(); seis.setDate(1); seis.setMonth(seis.getMonth() - 5);
  const seisStr = seis.toISOString().slice(0, 10);

  const [expRes, alertRes, infRes, cuestRes, medRes, tramRes] = await Promise.all([
    sb.from("expedientes_orientacion").select("id,estado").eq("centro_id", ctrId),
    sb.from("alertas_orientacion").select("id,nivel_riesgo,estado,created_at").eq("centro_id", ctrId),
    sb.from("informes_psicopedagogicos").select("id,estado,fecha_validacion,created_at").eq("centro_id", ctrId),
    sb.from("cuestionarios_docentes").select("id,profesor_id,estado").eq("centro_id", ctrId),
    sb.from("medidas_atencion").select("expediente_id,tipo,activa").eq("centro_id", ctrId).eq("activa", true),
    sb.from("tramites_orientacion").select("estado_tramite,created_at").eq("centro_id", ctrId)
  ]);
  const exps = expRes.data || [], alertas = alertRes.data || [], informes = infRes.data || [],
        cuests = cuestRes.data || [], medidas = medRes.data || [], tramites = tramRes.data || [];

  // BLOQUE 1 — Resumen general
  const block1 = {
    expActivos: exps.filter(e => e.estado === "activo").length,
    alertasSinResolver: alertas.filter(a => a.estado !== "resuelta").length,
    informesValidadosCurso: informes.filter(i =>
      (i.estado === "validado" || i.estado === "firmado") &&
      String(i.fecha_validacion || i.created_at || "").slice(0, 10) >= cursoStart).length,
    cuestPendientes: cuests.filter(c => c.estado === "pendiente").length
  };

  // BLOQUE 2 — Expedientes por tipo de medida más grave activa
  const expMedida = {};
  medidas.forEach(m => {
    const prev = expMedida[m.expediente_id];
    if (!prev || _ORI_MEDIDA_ORDEN.indexOf(m.tipo) > _ORI_MEDIDA_ORDEN.indexOf(prev)) expMedida[m.expediente_id] = m.tipo;
  });
  const cats = ["ACS", "ACNS", "NEE", "NEAE", "PECAI", "Sin medida"];
  const catCount = {}; cats.forEach(c => catCount[c] = 0);
  exps.forEach(e => { const t = expMedida[e.id] || "Sin medida"; catCount[cats.indexOf(t) !== -1 ? t : "Sin medida"]++; });
  const block2 = { labels: cats, data: cats.map(c => catCount[c]) };

  // BLOQUE 3 — Evolución de alertas por mes (últimos 6 meses) y nivel
  const meses = [];
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() - 5);
  for (let i = 0; i < 6; i++) { const d = new Date(base); d.setMonth(base.getMonth() + i); meses.push({ key: d.toISOString().slice(0, 7), label: _ORI_MES_CORTO[d.getMonth()] + " " + String(d.getFullYear()).slice(2) }); }
  const niveles = ["alto", "medio", "bajo"];
  const serie = {}; niveles.forEach(n => serie[n] = meses.map(() => 0));
  alertas.forEach(a => {
    if (String(a.created_at || "").slice(0, 10) < seisStr) return;
    const ym = String(a.created_at || "").slice(0, 7);
    const idx = meses.findIndex(m => m.key === ym);
    if (idx !== -1 && serie[a.nivel_riesgo]) serie[a.nivel_riesgo][idx]++;
  });
  const block3 = { labels: meses.map(m => m.label), series: serie };

  // BLOQUE 4 — Estado de informes
  const estInf = { borrador: 0, validado: 0, firmado: 0 };
  informes.forEach(i => { if (estInf[i.estado] != null) estInf[i.estado]++; });
  const totalInf = informes.length || 1;
  const block4 = {
    labels: ["borrador", "validado", "firmado"],
    data: [estInf.borrador, estInf.validado, estInf.firmado],
    pct: [estInf.borrador, estInf.validado, estInf.firmado].map(n => Math.round(n / totalInf * 100))
  };

  // BLOQUE 5 — Top 10 profesores con más cuestionarios pendientes
  const porProf = {};
  cuests.forEach(c => {
    if (!c.profesor_id) return;
    if (!porProf[c.profesor_id]) porProf[c.profesor_id] = { pend: 0, comp: 0 };
    if (c.estado === "completado") porProf[c.profesor_id].comp++; else porProf[c.profesor_id].pend++;
  });
  const nameMap = await _oriNombresProfiles(Object.keys(porProf));
  const block5 = Object.keys(porProf).map(id => {
    const o = porProf[id], tot = o.pend + o.comp;
    return { nombre: nameMap[id] || "—", pend: o.pend, comp: o.comp, pct: tot ? Math.round(o.comp / tot * 100) : 0 };
  }).sort((a, b) => b.pend - a.pend).slice(0, 10);

  // BLOQUE 6 — Trámites por estado
  const porEstado = {};
  tramites.forEach(t => {
    const k = t.estado_tramite || "—";
    if (!porEstado[k]) porEstado[k] = { n: 0, oldest: null };
    porEstado[k].n++;
    const f = String(t.created_at || "").slice(0, 10);
    if (f && (!porEstado[k].oldest || f < porEstado[k].oldest)) porEstado[k].oldest = f;
  });
  const block6 = Object.keys(porEstado).sort().map(k => ({ estado: k, n: porEstado[k].n, oldest: porEstado[k].oldest }));

  _oriStatsData = { block1, block2, block3, block4, block5, block6 };
  return _oriStatsData;
}

async function oriEstadisticas() {
  const c = document.getElementById("ori-container");
  if (!c) return;
  _oriEnsureResponsiveCSS();
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;"><span class="spin">⟳</span> Calculando estadísticas…</div>';
  const s = await _oriComputeStats();

  const card = (label, val, color) =>
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px;">' +
      '<div style="font-size:28px;font-weight:700;color:' + (color || "var(--ink)") + ';line-height:1;">' + val + '</div>' +
      '<div style="font-size:12px;color:var(--txt3);margin-top:6px;">' + _oriEsc(label) + '</div>' +
    '</div>';

  const b5 = s.block5.length
    ? '<table class="tbl"><thead><tr><th>Profesor</th><th>Pendientes</th><th>Completados</th><th>% completado</th></tr></thead><tbody>' +
        s.block5.map(r => '<tr><td>' + _oriEsc(r.nombre) + '</td><td>' + r.pend + '</td><td>' + r.comp + '</td><td>' + r.pct + '%</td></tr>').join("") +
      '</tbody></table>'
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin cuestionarios registrados.</div>';

  const b6 = s.block6.length
    ? '<table class="tbl"><thead><tr><th>Estado</th><th>Cantidad</th><th>Más antiguo sin resolver</th></tr></thead><tbody>' +
        s.block6.map(r => '<tr><td>' + _oriEsc(r.estado) + '</td><td>' + r.n + '</td><td>' + (r.oldest ? _oriFmtFecha(r.oldest) : "—") + '</td></tr>').join("") +
      '</tbody></table>'
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin trámites registrados.</div>';

  c.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">' +
      '<button onclick="loadExpedientes()" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:6px 12px;font-size:13px;cursor:pointer;color:var(--txt2);">← Volver</button>' +
    '</div>' +
    '<div class="pg-hdr" style="margin-bottom:18px;">' +
      '<div><div class="pg-title">📈 Estadísticas de orientación</div><div class="pg-sub">Departamento de orientación · centro activo</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn" onclick="oriExportarEstadisticasPDF()" style="border:1px solid var(--bdr);background:var(--srf);">⬇ PDF</button>' +
        '<button class="btn" onclick="oriExportarEstadisticasExcel()" style="border:1px solid var(--bdr);background:var(--srf);">⬇ Excel</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">' +
      card("Expedientes activos", s.block1.expActivos) +
      card("Alertas sin resolver", s.block1.alertasSinResolver, "#C24D2F") +
      card("Informes validados (curso)", s.block1.informesValidadosCurso, "#1e6b3a") +
      card("Cuestionarios pendientes", s.block1.cuestPendientes, "#D69540") +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-bottom:24px;">' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--txt);">Expedientes por tipo de medida</div><div style="height:220px;"><canvas id="ori-chart-medidas"></canvas></div></div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--txt);">Evolución de alertas (6 meses)</div><div style="height:220px;"><canvas id="ori-chart-alertas"></canvas></div></div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--txt);">Estado de informes</div><div style="height:220px;"><canvas id="ori-chart-informes"></canvas></div></div>' +
    '</div>' +
    '<div style="margin-bottom:22px;"><div style="font-size:14px;font-weight:600;color:var(--txt);margin-bottom:10px;">Cuestionarios docentes — Top 10 pendientes</div>' + b5 + '</div>' +
    '<div style="margin-bottom:22px;"><div style="font-size:14px;font-weight:600;color:var(--txt);margin-bottom:10px;">Trámites por estado</div>' + b6 + '</div>';

  requestAnimationFrame(() => _oriRenderCharts(s));
}
window.oriEstadisticas = oriEstadisticas;

function _oriRenderCharts(s) {
  if (typeof Chart === "undefined") return;
  Object.values(window._oriCharts).forEach(c => { try { c.destroy(); } catch (e) {} });
  window._oriCharts = {};
  const opt = { responsive: true, maintainAspectRatio: false };

  const c1 = document.getElementById("ori-chart-medidas");
  if (c1) window._oriCharts.medidas = new Chart(c1.getContext("2d"), {
    type: "bar",
    data: { labels: s.block2.labels, datasets: [{ data: s.block2.data, backgroundColor: ["#4D6FA8", "#3F9367", "#C76B3D", "#D69540", "#8a6d8a", "#B0B5C4"] }] },
    options: Object.assign({}, opt, { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } })
  });

  const c2 = document.getElementById("ori-chart-alertas");
  if (c2) window._oriCharts.alertas = new Chart(c2.getContext("2d"), {
    type: "line",
    data: {
      labels: s.block3.labels,
      datasets: [
        { label: "Alto", data: s.block3.series.alto, borderColor: "#C24D2F", backgroundColor: "#C24D2F", tension: .3 },
        { label: "Medio", data: s.block3.series.medio, borderColor: "#D69540", backgroundColor: "#D69540", tension: .3 },
        { label: "Bajo", data: s.block3.series.bajo, borderColor: "#C9A227", backgroundColor: "#C9A227", tension: .3 }
      ]
    },
    options: Object.assign({}, opt, { plugins: { legend: { position: "bottom" } }, scales: { y: { ticks: { precision: 0 } } } })
  });

  const c3 = document.getElementById("ori-chart-informes");
  if (c3) window._oriCharts.informes = new Chart(c3.getContext("2d"), {
    type: "doughnut",
    data: { labels: s.block4.labels.map((l, i) => l + " (" + s.block4.pct[i] + "%)"), datasets: [{ data: s.block4.data, backgroundColor: ["#B0B5C4", "#4D6FA8", "#3F9367"] }] },
    options: Object.assign({}, opt, { plugins: { legend: { position: "bottom" } } })
  });
}

async function oriExportarEstadisticasPDF() {
  const s = _oriStatsData || await _oriComputeStats();
  try { await _oriEnsureAutoTable(); }
  catch (e) { alert("No se pudo cargar la librería de PDF."); return; }
  const centro = await _oriCentroInfo();
  const rgb = _oriHexToRgb(centro.color);
  const logo = await _oriImgToDataURL(centro.logo);
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const topts = { styles: { fontSize: 9, cellPadding: 1.6 }, headStyles: { fillColor: [rgb.r, rgb.g, rgb.b] }, margin: { left: 14, right: 14 } };

  _oriPdfBand(doc, centro, logo, rgb, "INFORME ESTADÍSTICO — DEPARTAMENTO DE ORIENTACIÓN", new Date().toLocaleDateString("es-ES"));
  let y = 38;

  doc.autoTable(Object.assign({}, topts, { startY: y, head: [["Resumen general", "Valor"]],
    body: [
      ["Expedientes activos", String(s.block1.expActivos)],
      ["Alertas sin resolver", String(s.block1.alertasSinResolver)],
      ["Informes validados (curso)", String(s.block1.informesValidadosCurso)],
      ["Cuestionarios pendientes", String(s.block1.cuestPendientes)]
    ] }));
  y = doc.lastAutoTable.finalY + 6;

  doc.autoTable(Object.assign({}, topts, { startY: y, head: [["Tipo de medida", "Expedientes"]],
    body: s.block2.labels.map((l, i) => [l, String(s.block2.data[i])]) }));
  y = doc.lastAutoTable.finalY + 6;

  doc.autoTable(Object.assign({}, topts, { startY: y,
    head: [["Mes"].concat(s.block3.labels)],
    body: [
      ["Alto"].concat(s.block3.series.alto.map(String)),
      ["Medio"].concat(s.block3.series.medio.map(String)),
      ["Bajo"].concat(s.block3.series.bajo.map(String))
    ] }));
  y = doc.lastAutoTable.finalY + 6;

  doc.autoTable(Object.assign({}, topts, { startY: y, head: [["Estado informe", "Cantidad", "%"]],
    body: s.block4.labels.map((l, i) => [l, String(s.block4.data[i]), s.block4.pct[i] + "%"]) }));
  y = doc.lastAutoTable.finalY + 6;

  doc.autoTable(Object.assign({}, topts, { startY: y, head: [["Profesor", "Pendientes", "Completados", "% completado"]],
    body: s.block5.length ? s.block5.map(r => [r.nombre, String(r.pend), String(r.comp), r.pct + "%"]) : [["—", "—", "—", "—"]] }));
  y = doc.lastAutoTable.finalY + 6;

  doc.autoTable(Object.assign({}, topts, { startY: y, head: [["Estado trámite", "Cantidad", "Más antiguo sin resolver"]],
    body: s.block6.length ? s.block6.map(r => [r.estado, String(r.n), r.oldest ? _oriFmtFecha(r.oldest) : "—"]) : [["—", "—", "—"]] }));

  _oriPdfFooters(doc, centro.nombre);
  doc.save("estadisticas-orientacion-" + _oriSlug(centro.nombre) + "-" + new Date().toISOString().slice(0, 10) + ".pdf");
}
window.oriExportarEstadisticasPDF = oriExportarEstadisticasPDF;

async function oriExportarEstadisticasExcel() {
  if (typeof XLSX === "undefined") { alert("La librería de exportación (Excel) no está disponible."); return; }
  const s = _oriStatsData || await _oriComputeStats();
  const centro = await _oriCentroInfo();
  const wb = XLSX.utils.book_new();

  const add = (name, aoa, cols) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (cols) ws["!cols"] = cols;
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add("Resumen", [
    ["Indicador", "Valor"],
    ["Expedientes activos", s.block1.expActivos],
    ["Alertas sin resolver", s.block1.alertasSinResolver],
    ["Informes validados (curso)", s.block1.informesValidadosCurso],
    ["Cuestionarios pendientes", s.block1.cuestPendientes]
  ], [{ wch: 30 }, { wch: 12 }]);

  add("Por medida", [["Tipo de medida", "Expedientes"]].concat(s.block2.labels.map((l, i) => [l, s.block2.data[i]])), [{ wch: 16 }, { wch: 12 }]);

  add("Alertas 6 meses", [["Nivel"].concat(s.block3.labels)].concat([
    ["Alto"].concat(s.block3.series.alto),
    ["Medio"].concat(s.block3.series.medio),
    ["Bajo"].concat(s.block3.series.bajo)
  ]), [{ wch: 10 }].concat(s.block3.labels.map(() => ({ wch: 9 }))));

  add("Informes", [["Estado", "Cantidad", "%"]].concat(s.block4.labels.map((l, i) => [l, s.block4.data[i], s.block4.pct[i] + "%"])), [{ wch: 12 }, { wch: 10 }, { wch: 8 }]);

  add("Cuestionarios", [["Profesor", "Pendientes", "Completados", "% completado"]].concat(s.block5.map(r => [r.nombre, r.pend, r.comp, r.pct + "%"])), [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]);

  add("Tramites", [["Estado", "Cantidad", "Más antiguo sin resolver"]].concat(s.block6.map(r => [r.estado, r.n, r.oldest || "—"])), [{ wch: 18 }, { wch: 10 }, { wch: 22 }]);

  XLSX.writeFile(wb, "estadisticas-orientacion-" + _oriSlug(centro.nombre) + "-" + new Date().toISOString().slice(0, 10) + ".xlsx");
}
window.oriExportarEstadisticasExcel = oriExportarEstadisticasExcel;
