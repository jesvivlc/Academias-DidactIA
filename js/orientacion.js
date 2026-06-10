// ── ORIENTACIÓN MODULE ──
// Vista principal: lista de expedientes de orientación del centro.
// Sigue el patrón de comedor.js (estado de módulo + load/render) y admin.js
// (tabla + filtros + export XLSX, igual que exportarSustituciones).
// Tablas: expedientes_orientacion, medidas_atencion, alertas_orientacion (ver
// supabase/migrations/orientacion_base.sql). Todo filtrado por centro_id (RLS + query).

let _oriExpedientes = [];          // expedientes ya enriquecidos para la tabla
let _oriFiltroEstado = "todos";    // todos | activo | archivado
let _oriFiltroRiesgo = "todos";    // todos | alto | medio | bajo | sin
let _oriFiltroMedida = "todos";    // todos | ACS | ACNS | NEE | NEAE | PECAI | otro | sin
let _oriAlumnoSel   = null;        // alumno elegido en el modal "Nuevo expediente"

// Gravedad de medidas: a mayor índice, más prioritaria al mostrar la "medida activa"
const _ORI_MEDIDA_ORDEN = ["otro", "PECAI", "NEAE", "NEE", "ACNS", "ACS"];

function _oriEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Toast — reutiliza el sistema existente (_calToast con tipo, o showToast global).
function _oriToast(msg, tipo) {
  if (typeof _calToast === "function") return _calToast(msg, tipo);
  if (typeof showToast === "function") return showToast(msg);
  try { alert(msg); } catch (e) {}
}

// Push — mismo patrón que admin.js (EF send-push). Silencioso, no bloquea el flujo.
function _oriPush(userIds, title, body, tag) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return;
    fetch(SB_URL + "/functions/v1/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY, "apikey": ANON_KEY },
      body: JSON.stringify({ user_ids: ids, title: title, body: body, tag: tag || "orientacion" })
    }).catch(() => {});
  } catch (e) { /* silencioso */ }
}

// IDs de personal del centro por rol (profiles.id = user_id = auth uid)
async function _oriStaffIds(roles) {
  try {
    const { data } = await sb.from("profiles").select("id").eq("centro_id", ctrId).in("rol", roles);
    return (data || []).map(p => p.id).filter(Boolean);
  } catch (e) { return []; }
}

// IDs de familias vinculadas a un alumno (familia_alumno.profile_id = auth uid)
async function _oriFamiliaIds(alumnoId) {
  try {
    const { data } = await sb.from("familia_alumno").select("profile_id").eq("alumno_id", alumnoId);
    return (data || []).map(v => v.profile_id).filter(Boolean);
  } catch (e) { return []; }
}

// CSS responsive inyectado una sola vez (no toca css/styles.css)
function _oriEnsureResponsiveCSS() {
  if (document.getElementById("ori-responsive-css")) return;
  const st = document.createElement("style");
  st.id = "ori-responsive-css";
  st.textContent =
    ".ori-mobile-only{display:none;}" +
    ".ori-ellipsis{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    "#ori-fab{display:none;}" +
    "@media(max-width:768px){" +
      ".ori-desktop-only{display:none!important;}" +
      ".ori-mobile-only{display:block;}" +
      ".ori-ellipsis{max-width:150px;}" +
      ".ori-card-table thead{display:none;}" +
      ".ori-card-table,.ori-card-table tbody,.ori-card-table tr,.ori-card-table td{display:block;width:auto;}" +
      ".ori-card-table tr{border:1px solid var(--bdr);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:var(--srf);}" +
      ".ori-card-table td{border:none!important;padding:3px 0;}" +
      ".ori-card-table td:first-child{font-size:16px;font-weight:600;margin-bottom:4px;}" +
      ".ori-card-table td .ori-ellipsis{max-width:100%;white-space:normal;}" +
      ".ori-card-table td button{width:100%;margin-top:6px;}" +
      "#ori-fab{display:flex;align-items:center;justify-content:center;position:fixed;right:18px;bottom:calc(80px + env(safe-area-inset-bottom,0));width:56px;height:56px;border-radius:50%;background:var(--ink);color:#fff;font-size:30px;line-height:1;border:none;box-shadow:0 6px 18px rgba(0,0,0,.28);z-index:900;cursor:pointer;}" +
      "#ori-modal>div{width:95%!important;max-height:90vh!important;}" +
    "}";
  document.head.appendChild(st);
}

// Estado vacío reutilizable (icono + texto + acción opcional)
function _oriEmptyState(icono, texto, accionHTML) {
  return '<div style="text-align:center;padding:40px 20px;color:var(--txt3);">' +
    '<div style="font-size:38px;margin-bottom:10px;">' + icono + '</div>' +
    '<div style="font-size:14px;margin-bottom:' + (accionHTML ? "16px" : "0") + ';">' + _oriEsc(texto) + '</div>' +
    (accionHTML || "") + '</div>';
}

// ── CARGA ──────────────────────────────────────────────────────────────────
async function initOrientacion() {
  const c = document.getElementById("ori-container");
  if (!c) return;
  _oriEnsureResponsiveCSS();
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;"><span class="spin">⟳</span> Cargando expedientes…</div>';
  await loadExpedientes();
}
window.initOrientacion = initOrientacion;

async function loadExpedientes() {
  // a) Expedientes del centro con JOIN a alumnos (nombre, grupo, curso)
  const { data: exps, error } = await sb.from("expedientes_orientacion")
    .select("id,alumno_id,orientador_id,fecha_apertura,estado,notas_internas,created_at,alumnos(nombre,grupo_horario,curso)")
    .eq("centro_id", ctrId)
    .order("created_at", { ascending: false });

  if (error) {
    const c = document.getElementById("ori-container");
    if (c) c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:24px;">Error al cargar expedientes: ' + _oriEsc(error.message) + '</div>';
    return;
  }

  // Nombres de orientador (profiles del centro) — consulta separada para evitar
  // ambigüedad de embedding y depender solo de la RLS de profiles.
  const orientadorMap = {};
  const orientadorIds = [...new Set((exps || []).map(e => e.orientador_id).filter(Boolean))];
  if (orientadorIds.length) {
    const { data: profs } = await sb.from("profiles").select("id,full_name").in("id", orientadorIds);
    (profs || []).forEach(p => { orientadorMap[p.id] = p.full_name; });
  }

  // Medidas activas por expediente → la más grave determina "Tipo medida activa"
  const medidasMap = {};
  const { data: medidas } = await sb.from("medidas_atencion")
    .select("expediente_id,tipo,activa")
    .eq("centro_id", ctrId).eq("activa", true);
  (medidas || []).forEach(m => {
    const prev = medidasMap[m.expediente_id];
    if (!prev || _ORI_MEDIDA_ORDEN.indexOf(m.tipo) > _ORI_MEDIDA_ORDEN.indexOf(prev)) {
      medidasMap[m.expediente_id] = m.tipo;
    }
  });

  // Última alerta activa por alumno → nivel de riesgo
  const riesgoMap = {};
  const { data: alertas } = await sb.from("alertas_orientacion")
    .select("alumno_id,nivel_riesgo,estado,created_at")
    .eq("centro_id", ctrId).neq("estado", "resuelta")
    .order("created_at", { ascending: false });
  (alertas || []).forEach(a => {
    if (!riesgoMap[a.alumno_id]) riesgoMap[a.alumno_id] = a.nivel_riesgo; // la primera = la más reciente
  });
  // Contador global de alertas sin resolver
  const alertasSinResolver = (alertas || []).length;

  _oriExpedientes = (exps || []).map(e => {
    const al = e.alumnos || {};
    return {
      id: e.id,
      alumno_id: e.alumno_id,
      alumno: al.nombre || "—",
      grupo: al.grupo_horario || al.curso || "—",
      orientador: e.orientador_id ? (orientadorMap[e.orientador_id] || "—") : "—",
      medida: medidasMap[e.id] || null,
      riesgo: riesgoMap[e.alumno_id] || null,
      estado: e.estado,
      fecha_apertura: e.fecha_apertura
    };
  });

  const activos = _oriExpedientes.filter(e => e.estado === "activo").length;
  const headEl = document.getElementById("ori-counters");
  if (headEl) headEl.textContent = activos + " expediente" + (activos === 1 ? "" : "s") + " activo" + (activos === 1 ? "" : "s") +
    " · " + alertasSinResolver + " alerta" + (alertasSinResolver === 1 ? "" : "s") + " sin resolver";

  renderExpedientes();
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function _oriRiesgoBadge(nivel) {
  const cfg = {
    alto:  { bg: "#fce8e6", fg: "#a50e0e", txt: "Alto" },
    medio: { bg: "#fef0e0", fg: "#b15c00", txt: "Medio" },
    bajo:  { bg: "#fef7e0", fg: "#8a6d00", txt: "Bajo" }
  };
  const c = cfg[nivel];
  if (!c) return '<span style="background:var(--srf2);color:var(--txt3);border-radius:12px;padding:2px 10px;font-size:11px;">Sin alerta</span>';
  return '<span style="background:' + c.bg + ';color:' + c.fg + ';border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;">' + c.txt + '</span>';
}

function _oriEstadoBadge(estado) {
  if (estado === "archivado")
    return '<span style="background:var(--srf2);color:var(--txt3);border-radius:12px;padding:2px 10px;font-size:11px;">Archivado</span>';
  return '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;">Activo</span>';
}

function _oriFiltrados() {
  return _oriExpedientes.filter(e => {
    if (_oriFiltroEstado !== "todos" && e.estado !== _oriFiltroEstado) return false;
    if (_oriFiltroRiesgo !== "todos") {
      if (_oriFiltroRiesgo === "sin" ? e.riesgo : e.riesgo !== _oriFiltroRiesgo) return false;
    }
    if (_oriFiltroMedida !== "todos") {
      if (_oriFiltroMedida === "sin" ? e.medida : e.medida !== _oriFiltroMedida) return false;
    }
    return true;
  });
}

function renderExpedientes() {
  const c = document.getElementById("ori-container");
  if (!c) return;

  const estadoOpts = [["todos", "Todos los estados"], ["activo", "Activos"], ["archivado", "Archivados"]];
  const riesgoOpts = [["todos", "Todo riesgo"], ["alto", "Alto"], ["medio", "Medio"], ["bajo", "Bajo"], ["sin", "Sin alerta"]];
  const medidaOpts = [["todos", "Toda medida"], ["ACS", "ACS"], ["ACNS", "ACNS"], ["NEE", "NEE"], ["NEAE", "NEAE"], ["PECAI", "PECAI"], ["otro", "Otra"], ["sin", "Sin medida"]];
  const sel = (id, opts, val) => '<select id="' + id + '" onchange="' +
    (id === "ori-f-estado" ? "_oriSetFiltro('estado',this.value)" :
     id === "ori-f-riesgo" ? "_oriSetFiltro('riesgo',this.value)" :
     "_oriSetFiltro('medida',this.value)") +
    '" style="padding:7px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--srf);color:var(--txt);">' +
    opts.map(o => '<option value="' + o[0] + '"' + (o[0] === val ? " selected" : "") + '>' + o[1] + '</option>').join("") + '</select>';

  _oriEnsureResponsiveCSS();
  const filtered = _oriFiltrados();

  let tabla;
  if (!_oriExpedientes.length) {
    // Estado vacío real (sin ningún expediente)
    tabla = _oriEmptyState("🧭", "No hay expedientes abiertos. ¿Empezamos?",
      '<button class="btn btn-p" onclick="abrirModalNuevoExpediente()">+ Nuevo expediente</button>');
  } else if (!filtered.length) {
    tabla = _oriEmptyState("🔍", "No hay expedientes que coincidan con los filtros.", "");
  } else {
    tabla = '<table class="tbl ori-card-table"><thead><tr>' +
      '<th>Alumno</th><th>Grupo</th><th>Medida activa</th><th>Nivel riesgo</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      filtered.map(e =>
        '<tr>' +
        '<td style="font-weight:500;"><span class="ori-ellipsis" title="' + _oriEsc(e.alumno) + '">' + _oriEsc(e.alumno) + '</span></td>' +
        '<td>' + _oriEsc(e.grupo) + '</td>' +
        '<td><span class="ori-ellipsis" title="' + _oriEsc(e.medida || "") + '">' + (e.medida ? _oriEsc(e.medida) : '<span style="color:var(--txt3);">—</span>') + '</span></td>' +
        '<td>' + _oriRiesgoBadge(e.riesgo) + '</td>' +
        '<td>' + _oriEstadoBadge(e.estado) + '</td>' +
        '<td><button onclick="oriAbrirExpediente(\'' + e.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">Ver expediente</button></td>' +
        '</tr>'
      ).join("") +
      '</tbody></table>';
  }

  c.innerHTML =
    '<div class="pg-hdr" style="margin-bottom:18px;">' +
      '<div><div class="pg-title">🧭 Orientación</div><div class="pg-sub" id="ori-counters">—</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn" onclick="oriPanelRiesgo()" style="border:1px solid var(--bdr);background:var(--srf);">📊 Panel de riesgo</button>' +
        '<button class="btn" onclick="oriEstadisticas()" style="border:1px solid var(--bdr);background:var(--srf);">📈 Estadísticas</button>' +
        '<button class="btn btn-p ori-desktop-only" onclick="abrirModalNuevoExpediente()">+ Nuevo expediente</button>' +
        '<button class="btn" onclick="exportarOrientacion()" style="border:1px solid var(--bdr);background:var(--srf);">⬇ Exportar</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
      sel("ori-f-estado", estadoOpts, _oriFiltroEstado) +
      sel("ori-f-riesgo", riesgoOpts, _oriFiltroRiesgo) +
      sel("ori-f-medida", medidaOpts, _oriFiltroMedida) +
    '</div>' +
    tabla +
    '<button id="ori-fab" class="ori-mobile-only" onclick="abrirModalNuevoExpediente()" title="Nuevo expediente">+</button>';

  // Recolocar contador (el innerHTML lo reescribió)
  const activos = _oriExpedientes.filter(e => e.estado === "activo").length;
  const headEl = document.getElementById("ori-counters");
  if (headEl && headEl.textContent === "—") headEl.textContent = activos + " expediente" + (activos === 1 ? "" : "s") + " activo" + (activos === 1 ? "" : "s");
}

function _oriSetFiltro(cual, val) {
  if (cual === "estado") _oriFiltroEstado = val;
  else if (cual === "riesgo") _oriFiltroRiesgo = val;
  else if (cual === "medida") _oriFiltroMedida = val;
  // Re-render conservando los contadores actuales
  const c = document.getElementById("ori-container");
  const prevCount = document.getElementById("ori-counters")?.textContent;
  renderExpedientes();
  const headEl = document.getElementById("ori-counters");
  if (headEl && prevCount) headEl.textContent = prevCount;
}
window._oriSetFiltro = _oriSetFiltro;

// ════════════════════════════════════════════════════════════════════════════
//  VISTA DE EXPEDIENTE INDIVIDUAL (4 pestañas)
//  Reemplaza el contenido de #ori-container; "← Volver" restaura la lista.
//  Todas las queries filtran por centro_id (ctrId) además de la RLS.
// ════════════════════════════════════════════════════════════════════════════

let _oriExpActual = null;          // { id, alumno_id, alumno, grupo, tutor, orientador, estado, fecha_apertura }
let _oriTabActiva = "resumen";     // resumen | informes | adaptaciones | tramites
let _oriTramiteFiltroTipo = "todos";

function _oriFmtFecha(d) {
  if (!d) return "—";
  try {
    const o = new Date(String(d).length <= 10 ? d + "T12:00:00" : d);
    return o.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) { return String(d); }
}

function _oriAsignaturas(jsonbVal) {
  if (!jsonbVal) return [];
  if (Array.isArray(jsonbVal)) return jsonbVal.filter(Boolean);
  try { const p = JSON.parse(jsonbVal); return Array.isArray(p) ? p.filter(Boolean) : []; }
  catch (e) { return String(jsonbVal).split(",").map(s => s.trim()).filter(Boolean); }
}

// Modal genérico reutilizable (un único overlay #ori-modal)
function _oriShowModal(innerHTML, maxw) {
  _oriEnsureResponsiveCSS();
  let overlay = document.getElementById("ori-modal");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "ori-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;";
  overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
  overlay.innerHTML =
    '<div style="position:relative;background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);max-width:' + (maxw || 460) + 'px;width:100%;max-height:88vh;overflow-y:auto;padding:24px;box-shadow:var(--sh-lg);">' +
      '<button onclick="_oriCloseModal()" aria-label="Cerrar" style="position:sticky;float:right;top:0;margin:-8px -8px 0 0;background:var(--srf2);border:1px solid var(--bdr);border-radius:8px;width:30px;height:30px;font-size:16px;line-height:1;cursor:pointer;color:var(--txt2);z-index:2;">×</button>' +
      innerHTML + '</div>';
  document.body.appendChild(overlay);
  return overlay;
}
function _oriCloseModal() { const o = document.getElementById("ori-modal"); if (o) o.remove(); }
window._oriCloseModal = _oriCloseModal;

async function _oriProfileName(id) {
  if (!id) return "—";
  const { data } = await sb.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return (data && data.full_name) || "—";
}

// ── IA: llamada a la Edge Function 'chat' en modo texto puro ─────────────────
// Pasa role:"familia" para que la EF NO active function calling (tools solo para
// admin/profesional/superadmin) → respuesta de texto limpio { type:"text", text }.
// NUNCA persiste nada: el llamador decide qué hacer con el texto devuelto.
async function _oriGemini(systemPrompt, userPrompt) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + ANON_KEY,
      "apikey": ANON_KEY
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      system_prompt: systemPrompt,
      centro_id: ctrId,
      role: "familia",
      user_name: currentUserName || "",
      user_id: currentUser ? currentUser.id : ""
    })
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.text || (d.candidates && d.candidates[0] && d.candidates[0].content &&
    d.candidates[0].content.parts && d.candidates[0].content.parts[0] &&
    d.candidates[0].content.parts[0].text) || "";
}

// Formatea respuestas de cuestionarios completados por asignatura/docente
async function _oriCuestionariosTexto(expedienteId, nameMapOut) {
  const { data: cuests } = await sb.from("cuestionarios_docentes")
    .select("*").eq("centro_id", ctrId).eq("expediente_id", expedienteId).eq("estado", "completado");
  if (!cuests || !cuests.length) return "";
  const ids = [...new Set(cuests.map(c => c.profesor_id).filter(Boolean))];
  const nameMap = {};
  if (ids.length) {
    const { data: profs } = await sb.from("profiles").select("id,full_name").in("id", ids);
    (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
  }
  if (nameMapOut) Object.assign(nameMapOut, nameMap);
  return cuests.map(c => {
    const r = c.respuestas || {};
    return "— " + (nameMap[c.profesor_id] || "Docente") + " (" + (c.asignatura || "asignatura") + "):\n" +
      "  · Dificultades: " + (r.dificultades || "—") + "\n" +
      "  · Metodologías que funcionan: " + (r.metodologias || "—") + "\n" +
      "  · Contenidos no consolidados: " + (r.lagunas || "—") + "\n" +
      "  · Observaciones: " + (r.observaciones || "—");
  }).join("\n\n");
}

// ── ENTRADA ──────────────────────────────────────────────────────────────────
async function oriAbrirExpediente(expedienteId) {
  const c = document.getElementById("ori-container");
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;"><span class="spin">⟳</span> Cargando expediente…</div>';

  const { data: exp, error } = await sb.from("expedientes_orientacion")
    .select("id,alumno_id,orientador_id,fecha_apertura,estado,notas_internas,alumnos(nombre,grupo_horario,curso)")
    .eq("id", expedienteId).eq("centro_id", ctrId).single();

  if (error || !exp) {
    c.innerHTML = '<div style="padding:24px;color:var(--txt3);font-size:13px;">No se pudo cargar el expediente. <a href="#" onclick="loadExpedientes();return false;" style="color:var(--ink);">Volver</a></div>';
    return;
  }

  const al = exp.alumnos || {};
  const orientador = await _oriProfileName(exp.orientador_id);

  // Tutor: profiles rol=tutor del centro. Sin vínculo grupo↔tutor fiable → "—".
  let tutor = "—";
  try {
    const { data: tut } = await sb.from("profiles")
      .select("full_name").eq("centro_id", ctrId).eq("rol", "tutor").limit(1);
    if (tut && tut.length === 1) tutor = tut[0].full_name || "—";
  } catch (e) { /* sin tutor identificable */ }

  _oriExpActual = {
    id: exp.id,
    alumno_id: exp.alumno_id,
    alumno: al.nombre || "—",
    grupo: al.grupo_horario || al.curso || "—",
    tutor: tutor,
    orientador_id: exp.orientador_id || null,
    orientador: orientador,
    estado: exp.estado,
    fecha_apertura: exp.fecha_apertura
  };
  _oriTabActiva = "resumen";
  _oriRenderExpedienteShell();
  _oriRenderTab("resumen");
}
window.oriAbrirExpediente = oriAbrirExpediente;

function _oriRenderExpedienteShell() {
  const c = document.getElementById("ori-container");
  if (!c) return;
  _oriEnsureResponsiveCSS();
  const e = _oriExpActual;
  const tabs = [["resumen", "Resumen"], ["informes", "Informes"], ["adaptaciones", "Adaptaciones"], ["tramites", "Trámites"]];

  const puedeExportar = ["admin", "director", "jefatura", "superadmin"].indexOf(role) !== -1;
  const exportBtn = puedeExportar
    ? '<button onclick="oriExportarExpedienteCompleto()" style="margin-left:auto;background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:6px 12px;font-size:13px;cursor:pointer;">📥 Exportar expediente completo</button>'
    : '';

  c.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">' +
      '<button onclick="loadExpedientes()" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:6px 12px;font-size:13px;cursor:pointer;color:var(--txt2);">← Volver</button>' +
      exportBtn +
    '</div>' +
    '<div class="pg-hdr" style="margin-bottom:14px;">' +
      '<div><div class="pg-title">' + _oriEsc(e.alumno) + '</div>' +
      '<div class="pg-sub">' + _oriEsc(e.grupo) + ' · Expediente abierto el ' + _oriFmtFecha(e.fecha_apertura) + '</div></div>' +
      '<div>' + _oriEstadoBadge(e.estado) + '</div>' +
    '</div>' +
    // Desktop: tabs horizontales · Móvil: <select>
    '<select class="ori-mobile-only" onchange="_oriRenderTab(this.value)" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:18px;">' +
      tabs.map(t => '<option value="' + t[0] + '"' + (t[0] === _oriTabActiva ? " selected" : "") + '>' + t[1] + '</option>').join("") +
    '</select>' +
    '<div class="ori-desktop-only" style="display:flex;gap:4px;border-bottom:1px solid var(--bdr);margin-bottom:18px;flex-wrap:wrap;">' +
      tabs.map(t =>
        '<button id="ori-tab-' + t[0] + '" onclick="_oriRenderTab(\'' + t[0] + '\')" ' +
          'style="background:none;border:none;border-bottom:2px solid transparent;padding:9px 14px;font-size:13px;cursor:pointer;color:var(--txt2);">' +
          t[1] + '</button>'
      ).join("") +
    '</div>' +
    '<div id="ori-exp-body"><div style="text-align:center;color:var(--txt3);font-size:13px;padding:30px;"><span class="spin">⟳</span> Cargando…</div></div>';
}

function _oriTabHighlight(which) {
  ["resumen", "informes", "adaptaciones", "tramites"].forEach(t => {
    const b = document.getElementById("ori-tab-" + t);
    if (!b) return;
    const act = t === which;
    b.style.borderBottomColor = act ? "var(--ink)" : "transparent";
    b.style.color = act ? "var(--ink)" : "var(--txt2)";
    b.style.fontWeight = act ? "600" : "400";
  });
}

async function _oriRenderTab(which) {
  _oriTabActiva = which;
  _oriTabHighlight(which);
  const body = document.getElementById("ori-exp-body");
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:30px;"><span class="spin">⟳</span> Cargando…</div>';
  if (which === "resumen") return _oriTabResumen();
  if (which === "informes") return _oriTabInformes();
  if (which === "adaptaciones") return _oriTabAdaptaciones();
  if (which === "tramites") return _oriTabTramites();
}
window._oriRenderTab = _oriRenderTab;

function _oriTipoBadge(txt, bg, fg) {
  return '<span style="background:' + bg + ';color:' + fg + ';border-radius:12px;padding:2px 9px;font-size:11px;font-weight:500;">' + _oriEsc(txt) + '</span>';
}
function _oriMedidaBadge(tipo) { return _oriTipoBadge(tipo, "#e8eefc", "#1a3a8a"); }

// ── ESTADO DEL EXPEDIENTE ────────────────────────────────────────────────────
async function oriCambiarEstado() {
  if (!_oriExpActual) return;
  const nuevo = _oriExpActual.estado === "activo" ? "archivado" : "activo";
  const msg = nuevo === "archivado"
    ? "¿Archivar este expediente? Dejará de contar como activo (podrás reactivarlo después)."
    : "¿Reactivar este expediente?";
  if (!confirm(msg)) return;
  const { error } = await sb.from("expedientes_orientacion")
    .update({ estado: nuevo }).eq("id", _oriExpActual.id).eq("centro_id", ctrId);
  if (error) { _oriToast("Error al cambiar el estado: " + error.message, "error"); return; }
  _oriToast(nuevo === "archivado" ? "Expediente archivado" : "Expediente reactivado", "ok");
  _oriExpActual.estado = nuevo;
  _oriRenderExpedienteShell();
  _oriRenderTab(_oriTabActiva);
}
window.oriCambiarEstado = oriCambiarEstado;

// ════════════════════════════════════════════════════════════════════════════
//  PESTAÑA 1 — RESUMEN
// ════════════════════════════════════════════════════════════════════════════
async function _oriTabResumen() {
  const e = _oriExpActual;
  const body = document.getElementById("ori-exp-body");
  if (!body) return;

  const [medRes, alertRes, tramRes] = await Promise.all([
    sb.from("medidas_atencion").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).eq("activa", true).order("created_at", { ascending: false }),
    sb.from("alertas_orientacion").select("*").eq("centro_id", ctrId).eq("alumno_id", e.alumno_id).neq("estado", "resuelta").order("created_at", { ascending: false }),
    sb.from("tramites_orientacion").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).order("created_at", { ascending: false })
  ]);
  const medidas = medRes.data || [];
  const alertas = alertRes.data || [];
  const tramites = tramRes.data || [];

  const ficha =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r);padding:16px;margin-bottom:18px;">' +
      _oriDato("Alumno", e.alumno) +
      _oriDato("Grupo", e.grupo) +
      _oriDato("Tutor", e.tutor) +
      _oriDato("Orientador/a", e.orientador) +
      _oriDato("Fecha de apertura", _oriFmtFecha(e.fecha_apertura)) +
      '<div><div style="font-size:11px;color:var(--txt3);margin-bottom:4px;">Estado</div>' +
        _oriEstadoBadge(e.estado) +
        ' <button onclick="oriCambiarEstado()" style="margin-left:6px;background:none;border:none;color:var(--ink);font-size:11px;cursor:pointer;text-decoration:underline;">' +
        (e.estado === "activo" ? "Archivar" : "Reactivar") + '</button></div>' +
    '</div>';

  // Medidas activas
  const medidasHTML = medidas.length
    ? medidas.map(m => {
        const asigs = _oriAsignaturas(m.asignaturas_afectadas);
        return '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' + _oriMedidaBadge(m.tipo) +
          '<span style="color:var(--txt3);font-size:11px;margin-left:auto;">Desde ' + _oriFmtFecha(m.fecha_inicio) + '</span>' +
          '<button onclick="oriDesactivarMedida(\'' + m.id + '\')" style="background:#fce8e6;color:#a50e0e;border:none;border-radius:10px;padding:2px 9px;font-size:11px;cursor:pointer;">Desactivar</button></div>' +
          (m.descripcion ? '<div style="font-size:13px;color:var(--txt);margin-bottom:' + (asigs.length ? "6px" : "0") + ';">' + _oriEsc(m.descripcion) + '</div>' : '') +
          (asigs.length ? '<div style="font-size:12px;color:var(--txt2);">Asignaturas: ' + asigs.map(a => _oriEsc(a)).join(", ") + '</div>' : '') +
        '</div>';
      }).join("")
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin medidas activas.</div>';

  // Alertas activas
  const alertasHTML = alertas.length
    ? alertas.map(a =>
        '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            _oriTipoBadge(a.tipo, "var(--srf2)", "var(--txt2)") + _oriRiesgoBadge(a.nivel_riesgo) +
            '<span style="color:var(--txt3);font-size:11px;margin-left:auto;">' + _oriFmtFecha(a.created_at) + '</span>' +
            '<button onclick="oriResolverAlerta(\'' + a.id + '\')" style="background:#e6f4ea;color:#1e6b3a;border:none;border-radius:10px;padding:2px 9px;font-size:11px;cursor:pointer;">Marcar resuelta</button></div>' +
          (a.descripcion_ia ? '<div style="font-size:13px;color:var(--txt);">' + _oriEsc(a.descripcion_ia) + '</div>' : '') +
        '</div>'
      ).join("")
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin alertas activas.</div>';

  // Trámites en curso
  const tramHTML = tramites.length
    ? tramites.map(t => _oriTramiteCard(t, false)).join("")
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin trámites registrados.</div>';

  body.innerHTML = ficha +
    _oriSeccion("Medidas activas", '<button class="btn btn-p" onclick="oriModalAddMedida()" style="font-size:12px;padding:5px 11px;">+ Añadir medida</button>', medidasHTML) +
    _oriSeccion("Alertas activas", "", alertasHTML) +
    _oriSeccion("Trámites en curso", '<button class="btn btn-p" onclick="oriModalAddTramite()" style="font-size:12px;padding:5px 11px;">+ Añadir trámite</button>', tramHTML);
}

function _oriDato(label, val) {
  return '<div><div style="font-size:11px;color:var(--txt3);margin-bottom:4px;">' + _oriEsc(label) + '</div>' +
    '<div style="font-size:14px;color:var(--txt);font-weight:500;">' + _oriEsc(val) + '</div></div>';
}
function _oriSeccion(titulo, accionHTML, contenidoHTML) {
  return '<div style="margin-bottom:22px;">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
      '<div style="font-size:14px;font-weight:600;color:var(--txt);">' + _oriEsc(titulo) + '</div>' +
      (accionHTML ? '<div style="margin-left:auto;">' + accionHTML + '</div>' : '') +
    '</div>' + contenidoHTML + '</div>';
}

async function oriDesactivarMedida(id) {
  if (!confirm("¿Desactivar esta medida de atención? Dejará de figurar como activa en el expediente.")) return;
  const { error } = await sb.from("medidas_atencion").update({ activa: false }).eq("id", id).eq("centro_id", ctrId);
  if (error) { _oriToast("Error: " + error.message, "error"); return; }
  _oriToast("Medida desactivada", "ok");
  _oriRenderTab(_oriTabActiva);
}
window.oriDesactivarMedida = oriDesactivarMedida;

async function oriResolverAlerta(id) {
  if (!confirm("¿Marcar la alerta de riesgo como resuelta? Dejará de aparecer en el panel de riesgo.")) return;
  const { error } = await sb.from("alertas_orientacion").update({ estado: "resuelta" }).eq("id", id).eq("centro_id", ctrId);
  if (error) { _oriToast("Error: " + error.message, "error"); return; }
  _oriToast("Alerta resuelta", "ok");
  _oriRenderTab(_oriTabActiva);
}
window.oriResolverAlerta = oriResolverAlerta;

function oriModalAddMedida() {
  const tipos = ["ACNS", "ACS", "NEE", "NEAE", "PECAI", "otro"];
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Añadir medida</div>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Tipo</label>' +
    '<select id="ori-med-tipo" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
      tipos.map(t => '<option value="' + t + '">' + t + '</option>').join("") + '</select>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Descripción</label>' +
    '<textarea id="ori-med-desc" rows="3" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;resize:vertical;"></textarea>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Asignaturas afectadas (separadas por comas)</label>' +
    '<input id="ori-med-asig" placeholder="Matemáticas, Lengua…" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Fecha de inicio</label>' +
    '<input id="ori-med-fecha" type="date" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:16px;">' +
    '<div id="ori-med-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriGuardarMedida()">Guardar</button>' +
    '</div>'
  );
}
window.oriModalAddMedida = oriModalAddMedida;

async function oriGuardarMedida() {
  const tipo = document.getElementById("ori-med-tipo")?.value;
  const desc = document.getElementById("ori-med-desc")?.value.trim() || null;
  const asigs = (document.getElementById("ori-med-asig")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
  const fecha = document.getElementById("ori-med-fecha")?.value || null;
  const errEl = document.getElementById("ori-med-err");
  if (!tipo) { if (errEl) { errEl.textContent = "Selecciona un tipo."; errEl.style.display = "block"; } return; }

  const { error } = await sb.from("medidas_atencion").insert({
    centro_id: ctrId, expediente_id: _oriExpActual.id,
    tipo, descripcion: desc, asignaturas_afectadas: asigs,
    activa: true, fecha_inicio: fecha
  });
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }
  _oriCloseModal();
  _oriToast("Medida añadida", "ok");
  _oriRenderTab(_oriTabActiva);
}
window.oriGuardarMedida = oriGuardarMedida;

// ── TRÁMITES (tarjeta + modales, compartidos por Resumen y pestaña Trámites) ──
function _oriTramiteCard(t, conEditar) {
  return '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
      _oriTipoBadge(t.tipo, "#ece6f7", "#5a3a96") +
      '<span style="font-size:12px;color:var(--txt2);">' + _oriEsc(t.estado_tramite || "—") + '</span>' +
      (t.visible_familia ? '<span style="background:#e8f0fe;color:#1a56db;border-radius:10px;padding:2px 8px;font-size:10px;">👁 Visible para familia</span>' : '') +
      '<span style="color:var(--txt3);font-size:11px;margin-left:auto;">' + (t.fecha_estimada ? "Est. " + _oriFmtFecha(t.fecha_estimada) : "") + '</span>' +
      (conEditar ? '<button onclick="oriModalEditTramite(\'' + t.id + '\')" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:10px;padding:2px 9px;font-size:11px;cursor:pointer;color:var(--txt2);">Editar</button>' : '') +
    '</div>' +
    (t.descripcion ? '<div style="font-size:13px;color:var(--txt);">' + _oriEsc(t.descripcion) + '</div>' : '') +
  '</div>';
}

function _oriTramiteForm(t) {
  const tipos = ["dictamen", "escolarizacion", "alta_capacidades", "otro"];
  t = t || {};
  return '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Tipo</label>' +
    '<select id="ori-tram-tipo" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
      tipos.map(x => '<option value="' + x + '"' + (t.tipo === x ? " selected" : "") + '>' + x + '</option>').join("") + '</select>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Estado del trámite</label>' +
    '<input id="ori-tram-estado" value="' + _oriEsc(t.estado_tramite || "iniciado") + '" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Descripción</label>' +
    '<textarea id="ori-tram-desc" rows="3" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;resize:vertical;">' + _oriEsc(t.descripcion || "") + '</textarea>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Fecha estimada</label>' +
    '<input id="ori-tram-fecha" type="date" value="' + _oriEsc(t.fecha_estimada || "") + '" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);margin-bottom:16px;cursor:pointer;">' +
      '<input id="ori-tram-vis" type="checkbox"' + (t.visible_familia ? " checked" : "") + ' style="width:16px;height:16px;accent-color:var(--ink);"> Visible para la familia</label>' +
    '<div id="ori-tram-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>';
}

function oriModalAddTramite() {
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Añadir trámite</div>' +
    _oriTramiteForm(null) +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriGuardarTramite()">Guardar</button>' +
    '</div>'
  );
}
window.oriModalAddTramite = oriModalAddTramite;

function _oriLeerTramiteForm() {
  return {
    tipo: document.getElementById("ori-tram-tipo")?.value,
    estado_tramite: document.getElementById("ori-tram-estado")?.value.trim() || "iniciado",
    descripcion: document.getElementById("ori-tram-desc")?.value.trim() || null,
    fecha_estimada: document.getElementById("ori-tram-fecha")?.value || null,
    visible_familia: !!document.getElementById("ori-tram-vis")?.checked
  };
}

async function oriGuardarTramite() {
  const f = _oriLeerTramiteForm();
  const errEl = document.getElementById("ori-tram-err");
  if (!f.tipo) { if (errEl) { errEl.textContent = "Selecciona un tipo."; errEl.style.display = "block"; } return; }
  const { error } = await sb.from("tramites_orientacion").insert({
    centro_id: ctrId, expediente_id: _oriExpActual.id, ...f
  });
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }
  if (f.visible_familia) _oriNotificarTramiteFamilia(f.estado_tramite);
  _oriCloseModal();
  _oriToast("Trámite guardado", "ok");
  _oriRenderTab(_oriTabActiva);
}
window.oriGuardarTramite = oriGuardarTramite;

// PUSH D) Trámite visible para familia → familias vinculadas al alumno
async function _oriNotificarTramiteFamilia(estadoTramite) {
  try {
    const e = _oriExpActual;
    if (!e || !e.alumno_id) return;
    const ids = await _oriFamiliaIds(e.alumno_id);   // familia_alumno.profile_id = auth uid
    _oriPush(ids, "📋 Actualización de trámite escolar",
      "Hay una actualización en el expediente de " + e.alumno + ": " + (estadoTramite || "—"),
      "ori-tramite");
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
//  PESTAÑA 2 — INFORMES
// ════════════════════════════════════════════════════════════════════════════
const _ORI_INFORME_TIPOS = ["evaluacion_inicial", "revision", "dictamen", "otro"];

function _oriInformeEstadoBadge(estado) {
  if (estado === "firmado") return _oriTipoBadge("Firmado", "#e6f4ea", "#1e6b3a");
  if (estado === "validado") return _oriTipoBadge("Validado", "#e8f0fe", "#1a56db");
  return _oriTipoBadge("Borrador", "var(--srf2)", "var(--txt3)");
}

async function _oriTabInformes() {
  const e = _oriExpActual;
  const body = document.getElementById("ori-exp-body");
  if (!body) return;

  const { data: informes } = await sb.from("informes_psicopedagogicos")
    .select("*").eq("centro_id", ctrId).eq("expediente_id", e.id)
    .order("created_at", { ascending: false });

  // Nombres de creadores
  const ids = [...new Set((informes || []).map(i => i.creado_por).filter(Boolean))];
  const nameMap = {};
  if (ids.length) {
    const { data: profs } = await sb.from("profiles").select("id,full_name").in("id", ids);
    (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
  }

  const lista = (informes && informes.length)
    ? informes.map(i =>
        '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
            _oriTipoBadge(i.tipo, "#ece6f7", "#5a3a96") + _oriInformeEstadoBadge(i.estado) +
            '<span style="color:var(--txt3);font-size:11px;">' + _oriFmtFecha(i.created_at) + '</span>' +
            '<span style="color:var(--txt3);font-size:11px;">· ' + _oriEsc(nameMap[i.creado_por] || "—") + '</span>' +
            '<span style="margin-left:auto;display:flex;gap:6px;">' +
              '<button onclick="oriModalVerInforme(\'' + i.id + '\')" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:10px;padding:3px 10px;font-size:11px;cursor:pointer;color:var(--txt2);">Ver/Editar</button>' +
              '<button onclick="oriExportarInformePDF(\'' + i.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:10px;padding:3px 10px;font-size:11px;cursor:pointer;">Exportar PDF</button>' +
            '</span>' +
          '</div>' +
        '</div>'
      ).join("")
    : _oriEmptyState("📄", "Aún no hay informes para este expediente",
        '<button class="btn btn-p" onclick="oriModalNuevoInforme()">+ Nuevo informe</button>');

  body.innerHTML = _oriSeccion("Informes psicopedagógicos",
    '<button class="btn btn-p" onclick="oriModalNuevoInforme()" style="font-size:12px;padding:5px 11px;">+ Nuevo informe</button>',
    lista);
}

function oriModalNuevoInforme() {
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Nuevo informe</div>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Tipo</label>' +
    '<select id="ori-inf-tipo" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
      _ORI_INFORME_TIPOS.map(t => '<option value="' + t + '">' + t + '</option>').join("") + '</select>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Borrador inicial (opcional)</label>' +
    '<textarea id="ori-inf-texto" rows="8" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:16px;resize:vertical;"></textarea>' +
    '<div id="ori-inf-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriCrearInforme()">Crear</button>' +
    '</div>', 560
  );
}
window.oriModalNuevoInforme = oriModalNuevoInforme;

async function oriCrearInforme() {
  const tipo = document.getElementById("ori-inf-tipo")?.value;
  const texto = document.getElementById("ori-inf-texto")?.value.trim() || null;
  const errEl = document.getElementById("ori-inf-err");
  if (!tipo) { if (errEl) { errEl.textContent = "Selecciona un tipo."; errEl.style.display = "block"; } return; }
  const { error } = await sb.from("informes_psicopedagogicos").insert({
    centro_id: ctrId, expediente_id: _oriExpActual.id,
    tipo, borrador_texto: texto, estado: "borrador",
    creado_por: (currentUser && currentUser.id) || null
  });
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }
  _oriCloseModal();
  _oriToast("Informe creado", "ok");
  _oriRenderTab("informes");
}
window.oriCrearInforme = oriCrearInforme;

async function oriModalVerInforme(id) {
  const { data: inf } = await sb.from("informes_psicopedagogicos")
    .select("*").eq("id", id).eq("centro_id", ctrId).single();
  if (!inf) { alert("No se pudo cargar el informe."); return; }

  const firmado = inf.estado === "firmado";
  const texto = (inf.texto_final || inf.borrador_texto || "");

  let footer;
  if (firmado) {
    footer = '<div style="font-size:12px;color:var(--txt3);margin-bottom:12px;">🔒 Informe firmado — solo lectura.</div>' +
      '<div style="display:flex;justify-content:flex-end;"><button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cerrar</button></div>';
  } else {
    footer = '<div id="ori-inf-edit-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">' +
        '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
        '<button class="btn" onclick="oriGuardarBorradorInforme(\'' + id + '\')" style="border:1px solid var(--bdr);background:var(--srf2);">Guardar borrador</button>' +
        '<button class="btn btn-p" onclick="oriValidarInforme(\'' + id + '\')">Validar informe</button>' +
      '</div>';
  }

  // Botón de IA solo en estado 'borrador' (no validado ni firmado)
  const iaBtn = (inf.estado === "borrador")
    ? '<div style="margin-bottom:10px;"><button id="ori-ia-btn" onclick="oriGenerarBorradorIA(\'' + id + '\')" ' +
        'style="background:var(--accent,#C76B3D);color:#fff;border:none;border-radius:var(--r-sm);padding:7px 13px;font-size:13px;cursor:pointer;">' +
        '✨ Generar borrador con IA</button></div>'
    : '';

  _oriShowModal(
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">' +
      '<div style="font-size:16px;font-weight:600;color:var(--txt);">Informe — ' + _oriEsc(inf.tipo) + '</div>' +
      _oriInformeEstadoBadge(inf.estado) + '</div>' +
    iaBtn +
    '<textarea id="ori-inf-edit" rows="14"' + (firmado ? " readonly" : "") +
      ' style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:' + (firmado ? "var(--srf2)" : "var(--bg)") + ';color:var(--txt);margin-bottom:6px;resize:vertical;line-height:1.5;">' +
      _oriEsc(texto) + '</textarea>' +
    '<div id="ori-ia-nota" style="display:none;font-size:12px;color:var(--warning,#D69540);margin-bottom:12px;">⚠️ Texto generado por IA. Revisa y valida antes de guardar.</div>' +
    footer, 640
  );
}
window.oriModalVerInforme = oriModalVerInforme;

// Genera un borrador de informe con IA y lo vuelca en el textarea (NO guarda).
async function oriGenerarBorradorIA(id) {
  const btn = document.getElementById("ori-ia-btn");
  const ta = document.getElementById("ori-inf-edit");
  if (!ta) return;

  // a) Contexto del expediente
  const { data: inf } = await sb.from("informes_psicopedagogicos")
    .select("tipo,borrador_texto").eq("id", id).eq("centro_id", ctrId).single();
  if (!inf) { alert("No se pudo cargar el informe."); return; }

  const e = _oriExpActual;
  const { data: medidas } = await sb.from("medidas_atencion")
    .select("tipo,descripcion").eq("centro_id", ctrId).eq("expediente_id", e.id).eq("activa", true);
  const medidasTxt = (medidas && medidas.length)
    ? medidas.map(m => "- " + m.tipo + (m.descripcion ? ": " + m.descripcion : "")).join("\n")
    : "Ninguna registrada.";
  const cuestTxt = await _oriCuestionariosTexto(e.id);

  // f) Aviso si faltan datos, pero permite continuar
  if ((!medidas || !medidas.length) && !cuestTxt) {
    alert("Para generar un borrador más preciso, añade medidas activas o completa cuestionarios de los docentes.");
  }

  const sys = "Eres un asistente experto en orientación psicopedagógica escolar española. " +
    "Redactas informes psicopedagógicos siguiendo la normativa LOMLOE: enfoque competencial, " +
    "redacción en positivo, sin etiquetas diagnósticas limitantes, lenguaje técnico pero " +
    "comprensible. NUNCA uses términos como 'distraído', 'vago', 'problema de conducta' " +
    "sin contextualizar. Describe siempre las barreras de aprendizaje, no los déficits del " +
    "alumno. El informe debe tener estas secciones: 1) Datos del alumno y contexto escolar, " +
    "2) Motivo de evaluación, 3) Información recogida (fuentes), 4) Valoración de competencias, " +
    "5) Conclusiones y propuesta de intervención. Responde SOLO con el texto del informe, " +
    "sin explicaciones adicionales ni markdown.";

  const usr = "Genera un borrador de informe psicopedagógico de tipo " + (inf.tipo || "otro") + " para el siguiente alumno:\n" +
    "Nombre: " + (e.alumno || "—") + ", Grupo: " + (e.grupo || "—") + ".\n" +
    "Medidas de atención activas: " + medidasTxt + "\n" +
    "Observaciones de los docentes: " + (cuestTxt || "Sin cuestionarios completados.") + "\n" +
    "Texto previo del orientador (si existe): " + (inf.borrador_texto || "Ninguno.");

  if (btn) { btn.disabled = true; btn.textContent = "⟳ Generando…"; }
  try {
    const texto = await _oriGemini(sys, usr);
    if (!texto) { alert("La IA no devolvió texto. Inténtalo de nuevo."); return; }
    ta.value = texto;               // e) vuelca sin guardar
    const nota = document.getElementById("ori-ia-nota");
    if (nota) nota.style.display = "block";
  } catch (err) {
    alert("Error al generar el borrador: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✨ Generar borrador con IA"; }
  }
}
window.oriGenerarBorradorIA = oriGenerarBorradorIA;

async function oriGuardarBorradorInforme(id) {
  const errEl = document.getElementById("ori-inf-edit-err");
  // Guardia: nunca tocar un informe firmado
  const { data: cur } = await sb.from("informes_psicopedagogicos").select("estado").eq("id", id).eq("centro_id", ctrId).single();
  if (cur && cur.estado === "firmado") { if (errEl) { errEl.textContent = "El informe está firmado: no se puede modificar."; errEl.style.display = "block"; } return; }
  const texto = document.getElementById("ori-inf-edit")?.value || "";
  const { error } = await sb.from("informes_psicopedagogicos")
    .update({ borrador_texto: texto, estado: "borrador" })
    .eq("id", id).eq("centro_id", ctrId);
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }
  _oriCloseModal();
  _oriToast("Borrador guardado", "ok");
  _oriRenderTab("informes");
}
window.oriGuardarBorradorInforme = oriGuardarBorradorInforme;

async function oriValidarInforme(id) {
  const errEl = document.getElementById("ori-inf-edit-err");
  // Guardia crítica: NUNCA sobreescribir texto_final si el informe está firmado
  const { data: cur } = await sb.from("informes_psicopedagogicos").select("estado").eq("id", id).eq("centro_id", ctrId).single();
  if (cur && cur.estado === "firmado") { if (errEl) { errEl.textContent = "El informe está firmado: no se puede revalidar."; errEl.style.display = "block"; } return; }
  const texto = document.getElementById("ori-inf-edit")?.value || "";
  const { data: infData } = await sb.from("informes_psicopedagogicos").select("tipo").eq("id", id).eq("centro_id", ctrId).single();
  const { error } = await sb.from("informes_psicopedagogicos")
    .update({ borrador_texto: texto, texto_final: texto, estado: "validado", fecha_validacion: new Date().toISOString() })
    .eq("id", id).eq("centro_id", ctrId);
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }

  // PUSH C) Informe validado → director/admin del centro
  (async () => {
    try {
      const ids = await _oriStaffIds(["director", "admin"]);
      const e = _oriExpActual;
      _oriPush(ids, "✅ Informe psicopedagógico validado",
        "Informe de " + ((infData && infData.tipo) || "orientación") + " para " + (e ? e.alumno : "un alumno") + " pendiente de revisión final",
        "ori-informe");
    } catch (_) {}
  })();

  _oriCloseModal();
  _oriToast("Informe validado", "ok");
  _oriRenderTab("informes");
}
window.oriValidarInforme = oriValidarInforme;

// ── PDF del informe (cabecera del centro, patrón de plannerExportarPDF) ───────
function _oriEnsureJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
function _oriHexToRgb(hex) {
  let h = String(hex || "#1a73e8").replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (isNaN(n)) return { r: 26, g: 115, b: 232 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function _oriImgToDataURL(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve({ dataURL: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
      } catch (e) { resolve(null); }
    };
    img.onerror = function () { resolve(null); };
    img.src = url;
  });
}
async function _oriCentroInfo() {
  try {
    const r = await sb.from("centros").select("nombre,color_primario,logo_url").eq("id", ctrId).single();
    if (r.data) return { nombre: r.data.nombre || "Centro", color: r.data.color_primario || "#1a73e8", logo: r.data.logo_url || "" };
  } catch (e) { /* ignore */ }
  return { nombre: (typeof ctrName !== "undefined" && ctrName) || "Centro", color: "#1a73e8", logo: "" };
}

async function oriExportarInformePDF(id) {
  const { data: inf } = await sb.from("informes_psicopedagogicos")
    .select("*").eq("id", id).eq("centro_id", ctrId).single();
  if (!inf) { alert("No se pudo cargar el informe."); return; }

  try { await _oriEnsureJsPDF(); }
  catch (e) { alert("No se pudo cargar la librería de PDF."); return; }

  const info = await _oriCentroInfo();
  const rgb = _oriHexToRgb(info.color);
  const logo = await _oriImgToDataURL(info.logo);
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const alumno = (_oriExpActual && _oriExpActual.alumno) || "alumno";

  // Cabecera con banda de color + logo + nombre del centro
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.rect(0, 0, pageW, 26, "F");
  if (logo) {
    let w = 16, h = 16 * (logo.h / logo.w);
    if (h > 18) { h = 18; w = 18 * (logo.w / logo.h); }
    doc.addImage(logo.dataURL, "PNG", 12, 4, w, h);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(info.nombre, logo ? 34 : 12, 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Informe psicopedagógico", logo ? 34 : 12, 19);

  // Metadatos
  doc.setTextColor(40, 40, 40);
  let y = 38;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Informe — " + (inf.tipo || ""), 14, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text("Alumno: " + alumno, 14, y); y += 6;
  doc.text("Fecha: " + _oriFmtFecha(inf.created_at), 14, y); y += 6;
  doc.text("Estado: " + (inf.estado || ""), 14, y); y += 10;

  // Cuerpo
  doc.setTextColor(30, 30, 30); doc.setFontSize(11);
  const texto = inf.texto_final || inf.borrador_texto || "(Sin contenido)";
  const lines = doc.splitTextToSize(texto, pageW - 28);
  const lineH = 6, bottom = doc.internal.pageSize.getHeight() - 16;
  lines.forEach(ln => {
    if (y > bottom) { doc.addPage(); y = 20; }
    doc.text(ln, 14, y); y += lineH;
  });

  const safe = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  doc.save("informe-" + safe(inf.tipo) + "-" + safe(alumno) + "-" + new Date().toISOString().slice(0, 10) + ".pdf");
}
window.oriExportarInformePDF = oriExportarInformePDF;

// ════════════════════════════════════════════════════════════════════════════
//  PESTAÑA 3 — ADAPTACIONES (medidas detalladas + cuestionarios docentes)
// ════════════════════════════════════════════════════════════════════════════
const _ORI_CUEST_PREGUNTAS = [
  ["dificultades", "¿Qué dificultades específicas observas en esta asignatura?"],
  ["metodologias", "¿Qué metodologías han funcionado mejor con este alumno?"],
  ["lagunas", "¿Qué contenidos o competencias no ha consolidado?"],
  ["observaciones", "Observaciones adicionales"]
];

async function _oriTabAdaptaciones() {
  const e = _oriExpActual;
  const body = document.getElementById("ori-exp-body");
  if (!body) return;

  const [medRes, cuestRes] = await Promise.all([
    sb.from("medidas_atencion").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).order("activa", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("cuestionarios_docentes").select("*").eq("centro_id", ctrId).eq("expediente_id", e.id).order("created_at", { ascending: false })
  ]);
  const medidas = medRes.data || [];
  const cuests = cuestRes.data || [];

  // Nombres de profesores
  const ids = [...new Set(cuests.map(c => c.profesor_id).filter(Boolean))];
  const nameMap = {};
  if (ids.length) {
    const { data: profs } = await sb.from("profiles").select("id,full_name").in("id", ids);
    (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
  }

  const medidasHTML = medidas.length
    ? medidas.map(m => {
        const asigs = _oriAsignaturas(m.asignaturas_afectadas);
        return '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;' + (m.activa ? "" : "opacity:.6;") + '">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' + _oriMedidaBadge(m.tipo) +
            (m.activa ? _oriTipoBadge("Activa", "#e6f4ea", "#1e6b3a") : _oriTipoBadge("Inactiva", "var(--srf2)", "var(--txt3)")) +
            '<span style="color:var(--txt3);font-size:11px;">Desde ' + _oriFmtFecha(m.fecha_inicio) + (m.fecha_fin ? " hasta " + _oriFmtFecha(m.fecha_fin) : "") + '</span>' +
            (m.activa ? '<button onclick="oriDesactivarMedida(\'' + m.id + '\')" style="margin-left:auto;background:#fce8e6;color:#a50e0e;border:none;border-radius:10px;padding:2px 9px;font-size:11px;cursor:pointer;">Desactivar</button>' : '') +
          '</div>' +
          (m.descripcion ? '<div style="font-size:13px;color:var(--txt);margin-bottom:' + (asigs.length ? "6px" : "0") + ';">' + _oriEsc(m.descripcion) + '</div>' : '') +
          (asigs.length ? '<div style="font-size:12px;color:var(--txt2);">Asignaturas: ' + asigs.map(a => _oriEsc(a)).join(", ") + '</div>' : '') +
        '</div>';
      }).join("")
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin medidas registradas.</div>';

  const cuestHTML = cuests.length
    ? cuests.map(c => {
        const estBadge = c.estado === "completado"
          ? _oriTipoBadge("Completado", "#e6f4ea", "#1e6b3a")
          : _oriTipoBadge("Pendiente", "#fef0e0", "#b15c00");
        const accion = c.estado === "completado"
          ? '<button onclick="oriVerRespuestas(\'' + c.id + '\')" style="margin-left:auto;background:var(--srf2);border:1px solid var(--bdr);border-radius:10px;padding:3px 10px;font-size:11px;cursor:pointer;color:var(--txt2);">Ver respuestas</button>'
          : '<button onclick="oriRellenarCuestionario(\'' + c.id + '\')" style="margin-left:auto;background:var(--ink);color:#fff;border:none;border-radius:10px;padding:3px 10px;font-size:11px;cursor:pointer;">Rellenar</button>';
        return '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<span style="font-size:13px;font-weight:500;color:var(--txt);">' + _oriEsc(nameMap[c.profesor_id] || "—") + '</span>' +
            '<span style="font-size:12px;color:var(--txt2);">' + _oriEsc(c.asignatura || "—") + '</span>' +
            estBadge +
            '<span style="color:var(--txt3);font-size:11px;">' + _oriFmtFecha(c.created_at) + '</span>' +
            accion +
          '</div>' +
        '</div>';
      }).join("")
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin cuestionarios.</div>';

  const completados = cuests.filter(c => c.estado === "completado").length;
  const sintBtn = (completados >= 2)
    ? '<button onclick="oriSintetizarCuestionarios()" style="background:var(--accent,#C76B3D);color:#fff;border:none;border-radius:var(--r-sm);padding:5px 11px;font-size:12px;cursor:pointer;margin-right:8px;">✨ Sintetizar observaciones docentes</button>'
    : '';
  const cuestAccion = sintBtn +
    '<button class="btn btn-p" onclick="oriModalEnviarCuestionario()" style="font-size:12px;padding:5px 11px;">+ Enviar cuestionario</button>';

  body.innerHTML =
    _oriSeccion("Medidas de atención a la diversidad", '<button class="btn btn-p" onclick="oriModalAddMedida()" style="font-size:12px;padding:5px 11px;">+ Añadir medida</button>', medidasHTML) +
    _oriSeccion("Cuestionarios a docentes", cuestAccion, cuestHTML);
}

// Síntesis IA de los cuestionarios completados → modal editable (NO guarda)
async function oriSintetizarCuestionarios() {
  const e = _oriExpActual;
  const cuestTxt = await _oriCuestionariosTexto(e.id);
  if (!cuestTxt) { alert("No hay cuestionarios completados para sintetizar."); return; }

  const sys = "Eres un orientador escolar experto en adaptaciones curriculares según la normativa " +
    "LOMLOE. A partir de las observaciones de varios docentes sobre un mismo alumno, " +
    "sintetizas un resumen coherente que identifica patrones comunes, barreras de " +
    "aprendizaje transversales y propuestas de adaptación curricular concretas y " +
    "accionables. Redacta en positivo, sin etiquetas. Responde SOLO con la síntesis, " +
    "sin explicaciones ni markdown.";
  const usr = "Sintetiza las siguientes observaciones de docentes sobre el alumno " +
    (e.alumno || "—") + ", grupo " + (e.grupo || "—") + ", para elaborar una propuesta de adaptación curricular:\n" +
    cuestTxt;

  // Modal con spinner mientras genera
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Síntesis de observaciones docentes</div>' +
    '<div id="ori-sint-body" style="text-align:center;color:var(--txt3);font-size:13px;padding:30px;"><span class="spin">⟳</span> Generando síntesis…</div>', 600
  );

  let texto = "";
  try { texto = await _oriGemini(sys, usr); }
  catch (err) {
    const b = document.getElementById("ori-sint-body");
    if (b) b.innerHTML = '<div style="color:#a50e0e;font-size:13px;">Error al generar la síntesis: ' + _oriEsc(err.message) + '</div>';
    return;
  }
  const b = document.getElementById("ori-sint-body");
  if (!b) return;
  b.innerHTML =
    '<textarea id="ori-sint-text" rows="12" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:6px;resize:vertical;line-height:1.5;">' + _oriEsc(texto) + '</textarea>' +
    '<div style="font-size:12px;color:var(--warning,#D69540);margin-bottom:14px;">⚠️ Síntesis generada por IA. Revisa antes de usar.</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cerrar</button>' +
      '<button class="btn" onclick="oriCopiarSintesis()" style="border:1px solid var(--bdr);background:var(--srf2);">Copiar síntesis</button>' +
      '<button class="btn btn-p" onclick="oriCrearInformeDesdeSintesis()">Crear informe con esta síntesis</button>' +
    '</div>';
}
window.oriSintetizarCuestionarios = oriSintetizarCuestionarios;

function oriCopiarSintesis() {
  const ta = document.getElementById("ori-sint-text");
  if (!ta) return;
  const done = () => { alert("Síntesis copiada al portapapeles."); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).then(done).catch(() => { ta.select(); document.execCommand("copy"); done(); });
  } else { ta.select(); document.execCommand("copy"); done(); }
}
window.oriCopiarSintesis = oriCopiarSintesis;

async function oriCrearInformeDesdeSintesis() {
  const ta = document.getElementById("ori-sint-text");
  const texto = ta ? ta.value : "";
  const { error } = await sb.from("informes_psicopedagogicos").insert({
    centro_id: ctrId, expediente_id: _oriExpActual.id,
    tipo: "dictamen", borrador_texto: texto, estado: "borrador",
    creado_por: (currentUser && currentUser.id) || null
  });
  if (error) { _oriToast("Error al crear el informe: " + error.message, "error"); return; }
  _oriCloseModal();
  _oriToast("Informe creado desde la síntesis", "ok");
  _oriRenderTab("informes");
}
window.oriCrearInformeDesdeSintesis = oriCrearInformeDesdeSintesis;

async function oriVerRespuestas(id) {
  const { data: c } = await sb.from("cuestionarios_docentes").select("respuestas").eq("id", id).eq("centro_id", ctrId).single();
  const r = (c && c.respuestas) || {};
  const filas = _ORI_CUEST_PREGUNTAS.map(p =>
    '<div style="margin-bottom:14px;">' +
      '<div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:4px;">' + _oriEsc(p[1]) + '</div>' +
      '<div style="font-size:13px;color:var(--txt);white-space:pre-wrap;">' + _oriEsc(r[p[0]] || "—") + '</div>' +
    '</div>'
  ).join("");
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Respuestas del cuestionario</div>' +
    filas +
    '<div style="display:flex;justify-content:flex-end;"><button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cerrar</button></div>', 560
  );
}
window.oriVerRespuestas = oriVerRespuestas;

function oriRellenarCuestionario(id) {
  const campos = _ORI_CUEST_PREGUNTAS.map(p =>
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">' + _oriEsc(p[1]) + '</label>' +
    '<textarea id="ori-cuest-' + p[0] + '" rows="3" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;resize:vertical;"></textarea>'
  ).join("");
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Rellenar cuestionario</div>' +
    campos +
    '<div id="ori-cuest-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriGuardarCuestionario(\'' + id + '\')">Guardar</button>' +
    '</div>', 560
  );
}
window.oriRellenarCuestionario = oriRellenarCuestionario;

async function oriGuardarCuestionario(id) {
  const respuestas = {};
  _ORI_CUEST_PREGUNTAS.forEach(p => { respuestas[p[0]] = document.getElementById("ori-cuest-" + p[0])?.value.trim() || ""; });
  const { error } = await sb.from("cuestionarios_docentes")
    .update({ respuestas, estado: "completado" }).eq("id", id).eq("centro_id", ctrId);
  if (error) {
    const errEl = document.getElementById("ori-cuest-err");
    if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; }
    _oriToast("Error al guardar: " + error.message, "error");
    return;
  }

  // PUSH A) Cuestionario completado → orientador del expediente
  (async () => {
    try {
      const e = _oriExpActual;
      if (!e || !e.orientador_id) return;
      const { data: c } = await sb.from("cuestionarios_docentes")
        .select("asignatura,profesor_id").eq("id", id).eq("centro_id", ctrId).single();
      const profNombre = c && c.profesor_id ? await _oriProfileName(c.profesor_id) : "Un docente";
      _oriPush([e.orientador_id], "📝 Cuestionario completado",
        profNombre + " ha completado el cuestionario de " + ((c && c.asignatura) || "una asignatura") + " para " + e.alumno,
        "ori-cuestionario");
    } catch (_) {}
  })();

  _oriCloseModal();
  _oriToast("Cuestionario guardado", "ok");
  _oriRenderTab("adaptaciones");
}
window.oriGuardarCuestionario = oriGuardarCuestionario;

async function oriModalEnviarCuestionario() {
  const { data: profes } = await sb.from("profiles")
    .select("id,full_name,rol").eq("centro_id", ctrId)
    .in("rol", ["profesional", "tutor"]).order("full_name");
  const opts = (profes || []).map(p =>
    '<option value="' + p.id + '">' + _oriEsc(p.full_name || "—") + '</option>'
  ).join("");
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Enviar cuestionario a docente</div>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Profesor/a</label>' +
    '<select id="ori-cuest-prof" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
      '<option value="">— Selecciona —</option>' + opts + '</select>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Asignatura</label>' +
    '<input id="ori-cuest-asig" placeholder="Ej. Matemáticas" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:16px;">' +
    '<div id="ori-cuestenv-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriEnviarCuestionario()">Enviar</button>' +
    '</div>'
  );
}
window.oriModalEnviarCuestionario = oriModalEnviarCuestionario;

async function oriEnviarCuestionario() {
  const profId = document.getElementById("ori-cuest-prof")?.value || null;
  const asig = document.getElementById("ori-cuest-asig")?.value.trim() || null;
  const errEl = document.getElementById("ori-cuestenv-err");
  if (!profId) { if (errEl) { errEl.textContent = "Selecciona un profesor."; errEl.style.display = "block"; } return; }
  const { error } = await sb.from("cuestionarios_docentes").insert({
    centro_id: ctrId, expediente_id: _oriExpActual.id,
    profesor_id: profId, asignatura: asig, respuestas: {}, estado: "pendiente"
  });
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }
  _oriCloseModal();
  _oriToast("Cuestionario enviado al docente", "ok");
  _oriRenderTab("adaptaciones");
}
window.oriEnviarCuestionario = oriEnviarCuestionario;

// ════════════════════════════════════════════════════════════════════════════
//  PESTAÑA 4 — TRÁMITES
// ════════════════════════════════════════════════════════════════════════════
async function _oriTabTramites() {
  const e = _oriExpActual;
  const body = document.getElementById("ori-exp-body");
  if (!body) return;

  const { data: tramites } = await sb.from("tramites_orientacion")
    .select("*").eq("centro_id", ctrId).eq("expediente_id", e.id)
    .order("created_at", { ascending: false });

  window._oriTramitesCache = tramites || [];
  const tipos = ["todos", "dictamen", "escolarizacion", "alta_capacidades", "otro"];
  const filtro = '<select onchange="_oriSetTramiteFiltro(this.value)" style="padding:7px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--srf);color:var(--txt);">' +
    tipos.map(t => '<option value="' + t + '"' + (t === _oriTramiteFiltroTipo ? " selected" : "") + '>' + (t === "todos" ? "Todos los tipos" : t) + '</option>').join("") + '</select>';

  const filtrados = (tramites || []).filter(t => _oriTramiteFiltroTipo === "todos" || t.tipo === _oriTramiteFiltroTipo);
  const lista = filtrados.length
    ? filtrados.map(t => _oriTramiteCard(t, true)).join("")
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin trámites para este filtro.</div>';

  body.innerHTML = _oriSeccion("Trámites administrativos",
    '<div style="display:flex;gap:8px;align-items:center;">' + filtro +
      '<button class="btn btn-p" onclick="oriModalAddTramite()" style="font-size:12px;padding:5px 11px;">+ Añadir trámite</button></div>',
    lista);
}

function _oriSetTramiteFiltro(v) { _oriTramiteFiltroTipo = v; _oriRenderTab("tramites"); }
window._oriSetTramiteFiltro = _oriSetTramiteFiltro;

function oriModalEditTramite(id) {
  const t = (window._oriTramitesCache || []).find(x => x.id === id);
  if (!t) { alert("No se encontró el trámite."); return; }
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Editar trámite</div>' +
    _oriTramiteForm(t) +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriActualizarTramite(\'' + id + '\')">Guardar cambios</button>' +
    '</div>'
  );
}
window.oriModalEditTramite = oriModalEditTramite;

async function oriActualizarTramite(id) {
  const f = _oriLeerTramiteForm();
  const errEl = document.getElementById("ori-tram-err");
  if (!f.tipo) { if (errEl) { errEl.textContent = "Selecciona un tipo."; errEl.style.display = "block"; } return; }
  const { error } = await sb.from("tramites_orientacion").update(f).eq("id", id).eq("centro_id", ctrId);
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }
  if (f.visible_familia) _oriNotificarTramiteFamilia(f.estado_tramite);
  _oriCloseModal();
  _oriToast("Trámite actualizado", "ok");
  _oriRenderTab("tramites");
}
window.oriActualizarTramite = oriActualizarTramite;

// ── NUEVO EXPEDIENTE (modal) ─────────────────────────────────────────────────
async function abrirModalNuevoExpediente() {
  _oriAlumnoSel = null;

  // Alumnos del centro que NO tengan ya un expediente
  const { data: alumnos } = await sb.from("alumnos")
    .select("id,nombre,curso,grupo_horario")
    .eq("centro_id", ctrId).order("curso").order("nombre");
  const conExpediente = new Set(_oriExpedientes.map(e => e.alumno_id));
  const disponibles = (alumnos || []).filter(a => !conExpediente.has(a.id));

  // Orientadores: profesionales del centro con rol orientador / jefatura / admin
  const { data: orientadores } = await sb.from("profiles")
    .select("id,full_name,rol")
    .eq("centro_id", ctrId)
    .in("rol", ["orientador", "jefatura", "admin"])
    .order("full_name");

  // Guardamos los disponibles para el autocomplete
  window._oriAlumnosDisponibles = disponibles;

  const orientadorOpts = (orientadores || []).map(o =>
    '<option value="' + o.id + '">' + _oriEsc(o.full_name || "—") + ' (' + _oriEsc(o.rol) + ')</option>'
  ).join("");

  let overlay = document.getElementById("ori-modal");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "ori-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;";
  overlay.onclick = (ev) => { if (ev.target === overlay) cerrarModalNuevoExpediente(); };
  overlay.innerHTML =
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);max-width:440px;width:100%;padding:24px;box-shadow:var(--sh-lg);">' +
      '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:4px;">Nuevo expediente</div>' +
      '<div style="font-size:13px;color:var(--txt3);margin-bottom:18px;">Solo aparecen alumnos sin expediente abierto.</div>' +
      '<div style="margin-bottom:14px;position:relative;">' +
        '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Alumno</label>' +
        '<input id="ori-alumno-inp" autocomplete="off" placeholder="Buscar alumno…" oninput="_oriFiltrarAlumnos(this.value)" ' +
          'style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);">' +
        '<div id="ori-alumno-res" style="position:absolute;left:0;right:0;top:100%;background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r-sm);margin-top:2px;max-height:180px;overflow-y:auto;z-index:5;display:none;box-shadow:var(--sh);"></div>' +
      '</div>' +
      '<div style="margin-bottom:18px;">' +
        '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Orientador/a</label>' +
        '<select id="ori-orientador-sel" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);">' +
          '<option value="">— Sin asignar —</option>' + orientadorOpts +
        '</select>' +
      '</div>' +
      '<div id="ori-modal-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button class="btn" onclick="cerrarModalNuevoExpediente()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
        '<button class="btn btn-p" onclick="guardarNuevoExpediente()">Crear expediente</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  setTimeout(() => { const i = document.getElementById("ori-alumno-inp"); if (i) i.focus(); }, 50);
}
window.abrirModalNuevoExpediente = abrirModalNuevoExpediente;

function _oriFiltrarAlumnos(q) {
  const res = document.getElementById("ori-alumno-res");
  if (!res) return;
  _oriAlumnoSel = null;
  const term = (q || "").trim().toLowerCase();
  if (!term) { res.style.display = "none"; res.innerHTML = ""; return; }
  const lista = (window._oriAlumnosDisponibles || [])
    .filter(a => (a.nombre || "").toLowerCase().includes(term))
    .slice(0, 30);
  if (!lista.length) {
    res.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--txt3);">Sin coincidencias</div>';
    res.style.display = "";
    return;
  }
  res.innerHTML = lista.map(a =>
    '<div onmousedown="_oriElegirAlumno(\'' + a.id + '\')" style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--bdr);" ' +
      'onmouseover="this.style.background=\'var(--srf2)\'" onmouseout="this.style.background=\'\'">' +
      _oriEsc(a.nombre) + ' <span style="color:var(--txt3);font-size:11px;">' + _oriEsc(a.grupo_horario || a.curso || "") + '</span></div>'
  ).join("");
  res.style.display = "";
}
window._oriFiltrarAlumnos = _oriFiltrarAlumnos;

function _oriElegirAlumno(id) {
  const a = (window._oriAlumnosDisponibles || []).find(x => x.id === id);
  if (!a) return;
  _oriAlumnoSel = a;
  const inp = document.getElementById("ori-alumno-inp");
  if (inp) inp.value = a.nombre;
  const res = document.getElementById("ori-alumno-res");
  if (res) { res.style.display = "none"; res.innerHTML = ""; }
}
window._oriElegirAlumno = _oriElegirAlumno;

function cerrarModalNuevoExpediente() {
  const o = document.getElementById("ori-modal");
  if (o) o.remove();
}
window.cerrarModalNuevoExpediente = cerrarModalNuevoExpediente;

async function guardarNuevoExpediente() {
  const errEl = document.getElementById("ori-modal-err");
  const showErr = (m) => { if (errEl) { errEl.textContent = m; errEl.style.display = "block"; } };
  if (errEl) errEl.style.display = "none";

  if (!_oriAlumnoSel) { showErr("Selecciona un alumno de la lista."); return; }
  const orientadorId = document.getElementById("ori-orientador-sel")?.value || null;

  const { error } = await sb.from("expedientes_orientacion").insert({
    centro_id: ctrId,
    alumno_id: _oriAlumnoSel.id,
    orientador_id: orientadorId || null
  });
  if (error) { showErr("Error al crear el expediente: " + error.message); _oriToast("Error: " + error.message, "error"); return; }

  cerrarModalNuevoExpediente();
  _oriToast("Expediente creado", "ok");
  await loadExpedientes();
}
window.guardarNuevoExpediente = guardarNuevoExpediente;

// ── EXPORT (XLSX, igual que exportarSustituciones) ───────────────────────────
function exportarOrientacion() {
  const filtered = _oriFiltrados();
  if (!filtered.length) { alert("No hay expedientes para exportar."); return; }
  if (typeof XLSX === "undefined") { alert("La librería de exportación (Excel) no está disponible."); return; }

  const aoa = [["Alumno", "Grupo", "Medida activa", "Nivel riesgo", "Estado"]];
  const riesgoTxt = { alto: "Alto", medio: "Medio", bajo: "Bajo" };
  filtered.forEach(e => {
    aoa.push([
      e.alumno || "",
      e.grupo || "",
      e.medida || "",
      e.riesgo ? (riesgoTxt[e.riesgo] || e.riesgo) : "Sin alerta",
      e.estado === "archivado" ? "Archivado" : "Activo"
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orientación");
  XLSX.writeFile(wb, "orientacion_" + new Date().toISOString().slice(0, 10) + ".xlsx");
}
window.exportarOrientacion = exportarOrientacion;

// ════════════════════════════════════════════════════════════════════════════
//  PASO 4 — PANEL DE RIESGO (vista propia, fuera del expediente)
// ════════════════════════════════════════════════════════════════════════════
let _oriRiesgoDetectados = [];   // resultados de la detección IA pendientes de confirmar

const _ORI_NIVEL_ORDEN = { alto: 0, medio: 1, bajo: 2 };

async function oriPanelRiesgo() {
  const c = document.getElementById("ori-container");
  if (!c) return;
  _oriEnsureResponsiveCSS();
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;"><span class="spin">⟳</span> Cargando panel de riesgo…</div>';

  // Alertas activas del centro + alumno
  const { data: alertas } = await sb.from("alertas_orientacion")
    .select("*,alumnos(nombre,grupo_horario,curso)")
    .eq("centro_id", ctrId).neq("estado", "resuelta")
    .order("created_at", { ascending: false });

  // Mapa alumno_id → expediente_id (para "Ver expediente" vs "Crear expediente")
  const { data: exps } = await sb.from("expedientes_orientacion")
    .select("id,alumno_id").eq("centro_id", ctrId);
  const expMap = {};
  (exps || []).forEach(e => { expMap[e.alumno_id] = e.id; });

  const lista = (alertas || []).slice().sort((a, b) => {
    const na = _ORI_NIVEL_ORDEN[a.nivel_riesgo] ?? 9, nb = _ORI_NIVEL_ORDEN[b.nivel_riesgo] ?? 9;
    if (na !== nb) return na - nb;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  const filas = lista.length
    ? lista.map(a => {
        const al = a.alumnos || {};
        const expId = expMap[a.alumno_id];
        const verBtn = expId
          ? '<button onclick="oriAbrirExpediente(\'' + expId + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:5px 11px;font-size:12px;cursor:pointer;">Ver expediente</button>'
          : '<button onclick="oriCrearExpedientePara(\'' + a.alumno_id + '\')" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:5px 11px;font-size:12px;cursor:pointer;color:var(--txt2);">Crear expediente</button>';
        return '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
            '<span style="font-size:14px;font-weight:600;color:var(--txt);">' + _oriEsc(al.nombre || "—") + '</span>' +
            '<span style="font-size:12px;color:var(--txt2);">' + _oriEsc(al.grupo_horario || al.curso || "—") + '</span>' +
            _oriRiesgoBadge(a.nivel_riesgo) + _oriTipoBadge(a.tipo, "var(--srf2)", "var(--txt2)") +
            '<span style="color:var(--txt3);font-size:11px;">' + _oriFmtFecha(a.created_at) + '</span>' +
            '<span style="margin-left:auto;display:flex;gap:6px;">' + verBtn +
              '<button onclick="oriResolverAlertaPanel(\'' + a.id + '\')" style="background:#e6f4ea;color:#1e6b3a;border:none;border-radius:var(--r-sm);padding:5px 11px;font-size:12px;cursor:pointer;">Marcar resuelta</button>' +
            '</span>' +
          '</div>' +
          (a.descripcion_ia ? '<div style="font-size:13px;color:var(--txt);">' + _oriEsc(a.descripcion_ia) + '</div>' : '') +
        '</div>';
      }).join("")
    : _oriEmptyState("✅", "No hay alertas activas en este momento", "");

  c.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">' +
      '<button onclick="loadExpedientes()" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:6px 12px;font-size:13px;cursor:pointer;color:var(--txt2);">← Volver</button>' +
    '</div>' +
    '<div class="pg-hdr" style="margin-bottom:18px;">' +
      '<div><div class="pg-title">📊 Panel de riesgo</div><div class="pg-sub">' + lista.length + ' alerta' + (lista.length === 1 ? "" : "s") + ' activa' + (lista.length === 1 ? "" : "s") + '</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn" onclick="oriDetectarRiesgosIA()" style="border:1px solid var(--bdr);background:var(--srf);">✨ Detectar riesgos automáticamente</button>' +
        '<button class="btn btn-p" onclick="oriModalAlertaManual()">+ Generar alerta manual</button>' +
      '</div>' +
    '</div>' +
    filas;
}
window.oriPanelRiesgo = oriPanelRiesgo;

async function oriResolverAlertaPanel(id) {
  if (!confirm("¿Marcar la alerta de riesgo como resuelta? Dejará de aparecer en el panel.")) return;
  const { error } = await sb.from("alertas_orientacion").update({ estado: "resuelta" }).eq("id", id).eq("centro_id", ctrId);
  if (error) { _oriToast("Error: " + error.message, "error"); return; }
  _oriToast("Alerta resuelta", "ok");
  oriPanelRiesgo();
}
window.oriResolverAlertaPanel = oriResolverAlertaPanel;

async function oriCrearExpedientePara(alumnoId) {
  if (!confirm("¿Crear un expediente de orientación para este alumno?")) return;
  const { data, error } = await sb.from("expedientes_orientacion")
    .insert({ centro_id: ctrId, alumno_id: alumnoId, orientador_id: null })
    .select("id").single();
  if (error) { _oriToast("Error al crear el expediente: " + error.message, "error"); return; }
  _oriToast("Expediente creado", "ok");
  if (data && data.id) oriAbrirExpediente(data.id);
}
window.oriCrearExpedientePara = oriCrearExpedientePara;

// ── Alerta manual ────────────────────────────────────────────────────────────
async function oriModalAlertaManual() {
  const { data: alumnos } = await sb.from("alumnos")
    .select("id,nombre,curso,grupo_horario").eq("centro_id", ctrId).order("nombre");
  const opts = (alumnos || []).map(a =>
    '<option value="' + a.id + '">' + _oriEsc(a.nombre) + ' (' + _oriEsc(a.grupo_horario || a.curso || "") + ')</option>'
  ).join("");
  const tipos = ["rendimiento", "asistencia", "conducta", "combinada"];
  const niveles = ["alto", "medio", "bajo"];
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Generar alerta manual</div>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Alumno</label>' +
    '<select id="ori-al-alumno" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
      '<option value="">— Selecciona —</option>' + opts + '</select>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Tipo</label>' +
    '<select id="ori-al-tipo" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
      tipos.map(t => '<option value="' + t + '">' + t + '</option>').join("") + '</select>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Nivel de riesgo</label>' +
    '<select id="ori-al-nivel" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:14px;">' +
      niveles.map(n => '<option value="' + n + '">' + n + '</option>').join("") + '</select>' +
    '<label style="display:block;font-size:12px;color:var(--txt2);margin-bottom:6px;">Descripción</label>' +
    '<textarea id="ori-al-desc" rows="3" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:var(--bg);color:var(--txt);margin-bottom:16px;resize:vertical;"></textarea>' +
    '<div id="ori-al-err" style="display:none;color:#a50e0e;font-size:12px;margin-bottom:10px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriGuardarAlertaManual()">Crear alerta</button>' +
    '</div>'
  );
}
window.oriModalAlertaManual = oriModalAlertaManual;

async function oriGuardarAlertaManual() {
  const alumnoId = document.getElementById("ori-al-alumno")?.value || null;
  const tipo = document.getElementById("ori-al-tipo")?.value;
  const nivel = document.getElementById("ori-al-nivel")?.value;
  const desc = document.getElementById("ori-al-desc")?.value.trim() || null;
  const errEl = document.getElementById("ori-al-err");
  if (!alumnoId) { if (errEl) { errEl.textContent = "Selecciona un alumno."; errEl.style.display = "block"; } return; }
  const { error } = await sb.from("alertas_orientacion").insert({
    centro_id: ctrId, alumno_id: alumnoId, tipo, nivel_riesgo: nivel,
    descripcion_ia: desc, estado: "nueva"
  });
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } _oriToast("Error: " + error.message, "error"); return; }

  // PUSH B) Nueva alerta → orientadores/jefatura/director/admin del centro
  (async () => {
    try {
      const sel = document.getElementById("ori-al-alumno");
      const nombre = (sel && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || "Un alumno";
      await _oriNotificarAlerta(nombre, nivel, tipo, desc);
    } catch (_) {}
  })();

  _oriCloseModal();
  _oriToast("Alerta creada", "ok");
  oriPanelRiesgo();
}
window.oriGuardarAlertaManual = oriGuardarAlertaManual;

// Notifica una nueva alerta de riesgo al equipo de orientación/dirección del centro
async function _oriNotificarAlerta(nombreAlumno, nivel, tipo, descripcion) {
  const emoji = nivel === "alto" ? "🔴" : nivel === "medio" ? "🟠" : "🟡";
  const ids = await _oriStaffIds(["orientador", "jefatura", "director", "admin"]);
  const desc = (descripcion || "").slice(0, 80);
  _oriPush(ids, emoji + " Nueva alerta de riesgo " + (nivel || ""),
    (nombreAlumno || "Alumno") + " — " + (tipo || "") + (desc ? ": " + desc : ""),
    "ori-alerta");
}

// ── Detección automática de riesgos con IA ───────────────────────────────────
async function oriDetectarRiesgosIA() {
  _oriShowModal(
    '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:16px;">Detección automática de riesgos</div>' +
    '<div id="ori-det-body" style="text-align:center;color:var(--txt3);font-size:13px;padding:30px;"><span class="spin">⟳</span> Analizando datos de los últimos 30 días…</div>', 600
  );

  const desde = new Date(); desde.setDate(desde.getDate() - 30);
  const desdeStr = desde.toISOString().slice(0, 10);

  // a) Datos operativos del centro (últimos 30 días)
  const [almRes, asisRes, sustRes] = await Promise.all([
    sb.from("alumnos").select("id,nombre,grupo_horario,curso").eq("centro_id", ctrId),
    sb.from("asistencia_comedor").select("alumno_id,fecha,se_queda").eq("centro_id", ctrId).gte("fecha", desdeStr).limit(50000),
    sb.from("sustituciones").select("grupo_horario,fecha,cubierta").eq("centro_id", ctrId).gte("fecha", desdeStr)
  ]);
  const alumnos = almRes.data || [];
  const asistencia = asisRes.data || [];
  const sustituciones = sustRes.data || [];

  // Ausencias de comedor por alumno (señal indirecta)
  const ausComedor = {};
  asistencia.forEach(a => { if (a.se_queda === false) ausComedor[a.alumno_id] = (ausComedor[a.alumno_id] || 0) + 1; });
  // Sustituciones sin cubrir por grupo
  const sustSinCubrir = {};
  sustituciones.forEach(s => { if (!s.cubierta && s.grupo_horario) sustSinCubrir[s.grupo_horario] = (sustSinCubrir[s.grupo_horario] || 0) + 1; });

  const hayDatos = asistencia.length || sustituciones.length;
  const body = () => document.getElementById("ori-det-body");
  if (!hayDatos || !alumnos.length) {
    if (body()) body().innerHTML = '<div style="color:var(--txt3);font-size:13px;">No hay suficientes datos operativos en los últimos 30 días para generar alertas automáticas.</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cerrar</button></div>';
    return;
  }

  // b) Resumen para la IA (limitado a los alumnos con señales)
  const resumen = alumnos
    .map(a => {
      const aus = ausComedor[a.id] || 0;
      const sust = sustSinCubrir[a.grupo_horario] || 0;
      if (!aus && !sust) return null;
      return "alumno_id=" + a.id + " | " + a.nombre + " | grupo=" + (a.grupo_horario || a.curso || "—") +
        " | ausencias_comedor_30d=" + aus + " | sustituciones_sin_cubrir_en_su_grupo_30d=" + sust;
    })
    .filter(Boolean);

  if (!resumen.length) {
    if (body()) body().innerHTML = '<div style="color:var(--txt3);font-size:13px;">No hay suficientes datos operativos en los últimos 30 días para generar alertas automáticas.</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cerrar</button></div>';
    return;
  }

  const sys = "Eres un orientador escolar experto en detección temprana de riesgo " +
    "de abandono escolar. A partir de datos operativos del centro, identificas alumnos " +
    "que podrían necesitar atención prioritaria. Sé conservador: solo señala riesgos " +
    "claros con evidencia en los datos. Responde en JSON con este formato exacto: " +
    "[{alumno_id, nombre, grupo, nivel_riesgo, tipo, descripcion}] " +
    "Sin explicaciones fuera del JSON.";
  const usr = "Datos operativos de los últimos 30 días (una línea por alumno con señales):\n" + resumen.join("\n") +
    "\n\nValores permitidos: nivel_riesgo ∈ {bajo,medio,alto}; tipo ∈ {rendimiento,asistencia,conducta,combinada}.";

  let texto = "";
  try { texto = await _oriGemini(sys, usr); }
  catch (err) {
    if (body()) body().innerHTML = '<div style="color:#a50e0e;font-size:13px;">Error al analizar: ' + _oriEsc(err.message) + '</div>';
    return;
  }

  // c) Parsear JSON (tolerante a fences ```json)
  let arr = [];
  try {
    const limpio = texto.replace(/```json/gi, "").replace(/```/g, "").trim();
    const ini = limpio.indexOf("["), fin = limpio.lastIndexOf("]");
    arr = JSON.parse(ini >= 0 && fin >= 0 ? limpio.slice(ini, fin + 1) : limpio);
  } catch (e) { arr = []; }
  // Validar contra alumnos reales del centro
  const validIds = new Set(alumnos.map(a => a.id));
  _oriRiesgoDetectados = (Array.isArray(arr) ? arr : []).filter(x => x && validIds.has(x.alumno_id));

  if (!_oriRiesgoDetectados.length) {
    if (body()) body().innerHTML = '<div style="color:var(--txt3);font-size:13px;">La IA no identificó riesgos claros con los datos disponibles.</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cerrar</button></div>';
    return;
  }

  const items = _oriRiesgoDetectados.map((x, i) =>
    '<label style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--bdr);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
      '<input type="checkbox" class="ori-det-chk" data-i="' + i + '" checked style="margin-top:3px;width:16px;height:16px;accent-color:var(--ink);">' +
      '<div style="flex:1;">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">' +
          '<span style="font-size:13px;font-weight:600;color:var(--txt);">' + _oriEsc(x.nombre || "—") + '</span>' +
          '<span style="font-size:12px;color:var(--txt2);">' + _oriEsc(x.grupo || "—") + '</span>' +
          _oriRiesgoBadge(x.nivel_riesgo) + _oriTipoBadge(x.tipo || "—", "var(--srf2)", "var(--txt2)") +
        '</div>' +
        '<div style="font-size:13px;color:var(--txt);">' + _oriEsc(x.descripcion || "") + '</div>' +
      '</div>' +
    '</label>'
  ).join("");

  if (body()) body().innerHTML =
    '<div style="font-size:13px;color:var(--txt2);margin-bottom:12px;">⚠️ Propuestas generadas por IA. Selecciona las que quieras confirmar:</div>' +
    items +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">' +
      '<button class="btn" onclick="_oriCloseModal()" style="border:1px solid var(--bdr);background:var(--srf);">Cancelar</button>' +
      '<button class="btn btn-p" onclick="oriCrearAlertasSeleccionadas()">Crear alertas seleccionadas</button>' +
    '</div>';
}
window.oriDetectarRiesgosIA = oriDetectarRiesgosIA;

async function oriCrearAlertasSeleccionadas() {
  const chks = Array.from(document.querySelectorAll(".ori-det-chk")).filter(ch => ch.checked);
  if (!chks.length) { alert("No has seleccionado ninguna alerta."); return; }
  const rows = chks.map(ch => {
    const x = _oriRiesgoDetectados[parseInt(ch.dataset.i, 10)];
    return {
      centro_id: ctrId, alumno_id: x.alumno_id,
      tipo: ["rendimiento", "asistencia", "conducta", "combinada"].includes(x.tipo) ? x.tipo : "combinada",
      nivel_riesgo: ["bajo", "medio", "alto"].includes(x.nivel_riesgo) ? x.nivel_riesgo : "medio",
      descripcion_ia: x.descripcion || null, estado: "nueva"
    };
  });
  const { error } = await sb.from("alertas_orientacion").insert(rows);
  if (error) { _oriToast("Error al crear las alertas: " + error.message, "error"); return; }

  // PUSH B) cada alerta confirmada → equipo de orientación/dirección
  (async () => {
    try {
      for (const ch of chks) {
        const x = _oriRiesgoDetectados[parseInt(ch.dataset.i, 10)];
        if (x) await _oriNotificarAlerta(x.nombre, x.nivel_riesgo, x.tipo, x.descripcion);
      }
    } catch (_) {}
  })();

  _oriCloseModal();
  _oriToast(rows.length + " alerta(s) creada(s)", "ok");
  oriPanelRiesgo();
}
window.oriCrearAlertasSeleccionadas = oriCrearAlertasSeleccionadas;

// ════════════════════════════════════════════════════════════════════════════
//  PASO 5 — PORTAL DE FAMILIAS: trámites visibles de los hijos vinculados
//  Autocontenido: se inyecta en la home de la familia sin tocar otros archivos.
//  Solo muestra trámites con visible_familia=true. NUNCA datos clínicos.
// ════════════════════════════════════════════════════════════════════════════
const _ORI_TRAMITE_FAMILIA_LABEL = {
  dictamen: "Dictamen de escolarización",
  escolarizacion: "Proceso de escolarización",
  alta_capacidades: "Valoración de altas capacidades",
  otro: "Trámite de orientación"
};

async function oriRenderTramitesFamilia() {
  if (typeof role === "undefined" || role !== "familia") return;
  const sec = document.getElementById("ori-tramites-familia-container");
  const list = document.getElementById("ori-tramites-familia-list");
  if (!sec || !list) return;

  // Alumnos vinculados: primero currentUserAlumnos; si no, familia_alumno por profile_id
  let alumnoIds = (currentUserAlumnos || []).map(a => a && a.id).filter(Boolean);
  if (!alumnoIds.length && currentUser) {
    const { data: vin } = await sb.from("familia_alumno")
      .select("alumno_id").eq("profile_id", currentUser.id);
    alumnoIds = (vin || []).map(v => v.alumno_id).filter(Boolean);
  }
  if (!alumnoIds.length) { sec.style.display = "none"; return; }

  // Expedientes de esos alumnos en este centro
  const { data: exps } = await sb.from("expedientes_orientacion")
    .select("id,alumno_id").eq("centro_id", ctrId).in("alumno_id", alumnoIds);
  const expIds = (exps || []).map(e => e.id);
  if (!expIds.length) { sec.style.display = "none"; return; }

  // Solo trámites visibles para la familia (sin datos clínicos)
  const { data: tramites } = await sb.from("tramites_orientacion")
    .select("tipo,estado_tramite,descripcion,fecha_estimada")
    .eq("centro_id", ctrId).eq("visible_familia", true).in("expediente_id", expIds)
    .order("created_at", { ascending: false });

  if (!tramites || !tramites.length) { sec.style.display = "none"; return; }

  list.innerHTML = tramites.map(t =>
    '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:10px 12px;text-align:left;background:var(--srf);">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">' +
        '<span style="font-size:13px;font-weight:600;color:var(--txt);">' + _oriEsc(_ORI_TRAMITE_FAMILIA_LABEL[t.tipo] || "Trámite de orientación") + '</span>' +
        '<span style="font-size:11px;color:var(--txt2);background:var(--srf2);border-radius:10px;padding:2px 8px;">' + _oriEsc(t.estado_tramite || "—") + '</span>' +
        (t.fecha_estimada ? '<span style="font-size:11px;color:var(--txt3);margin-left:auto;">Previsto: ' + _oriFmtFecha(t.fecha_estimada) + '</span>' : '') +
      '</div>' +
      (t.descripcion ? '<div style="font-size:12px;color:var(--txt2);">' + _oriEsc(t.descripcion) + '</div>' : '') +
    '</div>'
  ).join("");
  sec.style.display = "block";
}
window.oriRenderTramitesFamilia = oriRenderTramitesFamilia;

// Inyecta la sección "Trámites orientación" en la home de la familia.
(function _oriFamiliaHook() {
  function tryInject() {
    if (typeof role === "undefined" || role !== "familia") return;
    const welcome = document.getElementById("welcome");
    if (!welcome) return;
    if (document.getElementById("ori-tramites-familia-container")) return; // ya inyectado
    const anchor = document.getElementById("mis-hijos-container") || welcome.lastElementChild || welcome;
    const sec = document.createElement("div");
    sec.id = "ori-tramites-familia-container";
    sec.style.cssText = "display:none;margin-top:14px;";
    sec.innerHTML =
      '<div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);margin-bottom:6px;text-align:left;">📋 Trámites orientación</div>' +
      '<div id="ori-tramites-familia-list" style="display:flex;flex-direction:column;gap:6px;"></div>';
    if (anchor === welcome) welcome.appendChild(sec); else anchor.insertAdjacentElement("afterend", sec);
    oriRenderTramitesFamilia();
  }
  window.addEventListener("DOMContentLoaded", function () {
    const main = document.getElementById("app-main") || document.body;
    try {
      const obs = new MutationObserver(function () { tryInject(); });
      obs.observe(main, { childList: true, subtree: true });
    } catch (e) { /* sin observer */ }
    tryInject();
  });
})();

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
