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

// ── CARGA ──────────────────────────────────────────────────────────────────
async function initOrientacion() {
  const c = document.getElementById("ori-container");
  if (!c) return;
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

  const filtered = _oriFiltrados();

  let tabla;
  if (!filtered.length) {
    tabla = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:24px;">No hay expedientes que coincidan con los filtros.</div>';
  } else {
    tabla = '<table class="tbl"><thead><tr>' +
      '<th>Alumno</th><th>Grupo</th><th>Medida activa</th><th>Nivel riesgo</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      filtered.map(e =>
        '<tr>' +
        '<td style="font-weight:500;">' + _oriEsc(e.alumno) + '</td>' +
        '<td>' + _oriEsc(e.grupo) + '</td>' +
        '<td>' + (e.medida ? _oriEsc(e.medida) : '<span style="color:var(--txt3);">—</span>') + '</td>' +
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
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn btn-p" onclick="abrirModalNuevoExpediente()">+ Nuevo expediente</button>' +
        '<button class="btn" onclick="exportarOrientacion()" style="border:1px solid var(--bdr);background:var(--srf);">⬇ Exportar</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
      sel("ori-f-estado", estadoOpts, _oriFiltroEstado) +
      sel("ori-f-riesgo", riesgoOpts, _oriFiltroRiesgo) +
      sel("ori-f-medida", medidaOpts, _oriFiltroMedida) +
    '</div>' +
    tabla;

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
  let overlay = document.getElementById("ori-modal");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "ori-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;";
  overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
  overlay.innerHTML =
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);max-width:' + (maxw || 460) + 'px;width:100%;max-height:88vh;overflow-y:auto;padding:24px;box-shadow:var(--sh-lg);">' +
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
  const e = _oriExpActual;
  const tabs = [["resumen", "Resumen"], ["informes", "Informes"], ["adaptaciones", "Adaptaciones"], ["tramites", "Trámites"]];

  c.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">' +
      '<button onclick="loadExpedientes()" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:6px 12px;font-size:13px;cursor:pointer;color:var(--txt2);">← Volver</button>' +
    '</div>' +
    '<div class="pg-hdr" style="margin-bottom:14px;">' +
      '<div><div class="pg-title">' + _oriEsc(e.alumno) + '</div>' +
      '<div class="pg-sub">' + _oriEsc(e.grupo) + ' · Expediente abierto el ' + _oriFmtFecha(e.fecha_apertura) + '</div></div>' +
      '<div>' + _oriEstadoBadge(e.estado) + '</div>' +
    '</div>' +
    '<div style="display:flex;gap:4px;border-bottom:1px solid var(--bdr);margin-bottom:18px;flex-wrap:wrap;">' +
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
  if (!confirm("¿Cambiar el estado del expediente a '" + nuevo + "'?")) return;
  const { error } = await sb.from("expedientes_orientacion")
    .update({ estado: nuevo }).eq("id", _oriExpActual.id).eq("centro_id", ctrId);
  if (error) { alert("Error al cambiar el estado: " + error.message); return; }
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
  if (!confirm("¿Desactivar esta medida?")) return;
  const { error } = await sb.from("medidas_atencion").update({ activa: false }).eq("id", id).eq("centro_id", ctrId);
  if (error) { alert("Error: " + error.message); return; }
  _oriRenderTab(_oriTabActiva);
}
window.oriDesactivarMedida = oriDesactivarMedida;

async function oriResolverAlerta(id) {
  if (!confirm("¿Marcar la alerta como resuelta?")) return;
  const { error } = await sb.from("alertas_orientacion").update({ estado: "resuelta" }).eq("id", id).eq("centro_id", ctrId);
  if (error) { alert("Error: " + error.message); return; }
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
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  _oriCloseModal();
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
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  _oriCloseModal();
  _oriRenderTab(_oriTabActiva);
}
window.oriGuardarTramite = oriGuardarTramite;

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
    : '<div style="color:var(--txt3);font-size:13px;padding:6px 0;">Sin informes registrados.</div>';

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
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  _oriCloseModal();
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

  _oriShowModal(
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">' +
      '<div style="font-size:16px;font-weight:600;color:var(--txt);">Informe — ' + _oriEsc(inf.tipo) + '</div>' +
      _oriInformeEstadoBadge(inf.estado) + '</div>' +
    '<textarea id="ori-inf-edit" rows="14"' + (firmado ? " readonly" : "") +
      ' style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:14px;background:' + (firmado ? "var(--srf2)" : "var(--bg)") + ';color:var(--txt);margin-bottom:14px;resize:vertical;line-height:1.5;">' +
      _oriEsc(texto) + '</textarea>' +
    footer, 640
  );
}
window.oriModalVerInforme = oriModalVerInforme;

async function oriGuardarBorradorInforme(id) {
  const errEl = document.getElementById("ori-inf-edit-err");
  // Guardia: nunca tocar un informe firmado
  const { data: cur } = await sb.from("informes_psicopedagogicos").select("estado").eq("id", id).eq("centro_id", ctrId).single();
  if (cur && cur.estado === "firmado") { if (errEl) { errEl.textContent = "El informe está firmado: no se puede modificar."; errEl.style.display = "block"; } return; }
  const texto = document.getElementById("ori-inf-edit")?.value || "";
  const { error } = await sb.from("informes_psicopedagogicos")
    .update({ borrador_texto: texto, estado: "borrador" })
    .eq("id", id).eq("centro_id", ctrId);
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  _oriCloseModal();
  _oriRenderTab("informes");
}
window.oriGuardarBorradorInforme = oriGuardarBorradorInforme;

async function oriValidarInforme(id) {
  const errEl = document.getElementById("ori-inf-edit-err");
  // Guardia crítica: NUNCA sobreescribir texto_final si el informe está firmado
  const { data: cur } = await sb.from("informes_psicopedagogicos").select("estado").eq("id", id).eq("centro_id", ctrId).single();
  if (cur && cur.estado === "firmado") { if (errEl) { errEl.textContent = "El informe está firmado: no se puede revalidar."; errEl.style.display = "block"; } return; }
  const texto = document.getElementById("ori-inf-edit")?.value || "";
  const { error } = await sb.from("informes_psicopedagogicos")
    .update({ borrador_texto: texto, texto_final: texto, estado: "validado", fecha_validacion: new Date().toISOString() })
    .eq("id", id).eq("centro_id", ctrId);
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  _oriCloseModal();
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

  body.innerHTML =
    _oriSeccion("Medidas de atención a la diversidad", '<button class="btn btn-p" onclick="oriModalAddMedida()" style="font-size:12px;padding:5px 11px;">+ Añadir medida</button>', medidasHTML) +
    _oriSeccion("Cuestionarios a docentes", '<button class="btn btn-p" onclick="oriModalEnviarCuestionario()" style="font-size:12px;padding:5px 11px;">+ Enviar cuestionario</button>', cuestHTML);
}

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
    return;
  }
  _oriCloseModal();
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
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  _oriCloseModal();
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
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  _oriCloseModal();
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
  if (error) { showErr("Error al crear el expediente: " + error.message); return; }

  cerrarModalNuevoExpediente();
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
