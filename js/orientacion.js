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
        '<td><button onclick="verExpediente(\'' + e.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">Ver expediente</button></td>' +
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

// Placeholder — el expediente completo llega en el Prompt 2
function verExpediente(id) {
  alert("Expediente " + id + "\n\nLa vista completa del expediente se implementa en el siguiente paso.");
}
window.verExpediente = verExpediente;

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
