// ── MÓDULO IB ──
// Panel CAS, Extended Essay y Plazos IB para centros con Diploma IB

// Filtra filas de cálculo/agrupación importadas por error desde hojas de cálculo
function _ibEsAlumnoReal(a) {
  return !/^total(es)?\b/i.test((a.nombre || '').trim());
}

function _ibEsc(s) { return escH(s); } // delegado a utils.js

// Carga alumnos IB reales del centro (1IB/2IB por defecto), ordenados.
async function _ibLoadAlumnos(grupos) {
  const { data } = await sb.from("alumnos")
    .select("id,nombre,grupo_horario")
    .eq("centro_id", ctrId)
    .in("grupo_horario", grupos || ["1IB", "2IB"])
    .order("grupo_horario").order("nombre");
  return (data || []).filter(_ibEsAlumnoReal);
}

// Matriz oficial de puntos core del Diploma (TOK × EE → 0..3, "F" = condición de fallo).
function _ibCorePoints(tok, ee) {
  const M = {
    A: { A: 3, B: 3, C: 2, D: 2, E: "F" },
    B: { A: 3, B: 2, C: 2, D: 1, E: "F" },
    C: { A: 2, B: 2, C: 1, D: 0, E: "F" },
    D: { A: 2, B: 1, C: 0, D: 0, E: "F" },
    E: { A: "F", B: "F", C: "F", D: "F", E: "F" },
  };
  const t = (tok || "").toUpperCase(), e = (ee || "").toUpperCase();
  if (!M[t] || M[t][e] === undefined) return null; // faltan notas
  return M[t][e]; // número 0-3 o "F"
}

const IB_LOS = ["LO1","LO2","LO3","LO4","LO5","LO6","LO7"];
const IB_LO_DESC = {
  LO1: "Identifica fortalezas y áreas de mejora",
  LO2: "Afronta y supera desafíos",
  LO3: "Iniciativa y planificación",
  LO4: "Compromiso y perseverancia",
  LO5: "Trabajo colaborativo",
  LO6: "Compromiso global y ético",
  LO7: "Ética de decisiones y acciones"
};

async function loadIbPanel() {
  const container = document.getElementById("ib-container");
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--txt3);"><span class="spin">⟳</span> Cargando módulo IB…</div>';

  try {
    await Promise.all([_renderIbPanels()]);
  } catch (e) {
    container.innerHTML = '<div style="color:var(--red);padding:16px;">Error cargando módulo IB: ' + e.message + '</div>';
  }
}

async function _renderIbPanels() {
  const container = document.getElementById("ib-container");

  // Pestañas del módulo IB. 'coord' (Coordinador) es la vista global por defecto.
  const tabs = [
    { id: "coord",   label: "🧭 Coordinador" },
    { id: "cas",     label: "🎭 CAS" },
    { id: "tok",     label: "🧠 TOK" },
    { id: "ee",      label: "📄 Extended Essay" },
    { id: "result",  label: "🎯 Predicciones/Resultados" },
    { id: "plazos",  label: "📅 Plazos" },
  ];
  const DEFAULT_TAB = "coord";

  container.innerHTML = `
    <div class="pg-hdr" style="margin-bottom:8px;">
      <div>
        <div class="pg-title">Diploma IB</div>
        <div class="pg-sub">Coordinación, CAS, TOK, Extended Essay, predicciones/resultados y plazos</div>
      </div>
      <button class="btn btn-p" onclick="loadIbPanel()">↺ Recargar</button>
    </div>
    <div style="display:flex;gap:6px;border-bottom:2px solid var(--bdr);margin-bottom:20px;flex-wrap:wrap;" id="ib-subtabs">
      ${tabs.map(t => {
        const act = t.id === DEFAULT_TAB;
        return `<div class="ib-stab${act ? ' active' : ''}" onclick="ibShowTab('${t.id}')" id="ib-stab-${t.id}" style="padding:8px 16px;cursor:pointer;font-size:13px;font-weight:${act ? 600 : 500};color:${act ? 'var(--ink)' : 'var(--txt3)'};border-bottom:2px solid ${act ? 'var(--ink)' : 'transparent'};margin-bottom:-2px;">${t.label}</div>`;
      }).join("")}
    </div>
    ${tabs.map(t => `<div id="ib-panel-${t.id}"${t.id === DEFAULT_TAB ? '' : ' style="display:none;"'}></div>`).join("")}
  `;

  await Promise.all([
    _loadCoordinadorPanel(),
    _loadCasPanel(),
    _loadTokPanel(),
    _loadEePanel(),
    _loadResultadosPanel(),
    _loadPlazosPanel()
  ]);
}

function ibShowTab(tab) {
  ["coord","cas","tok","ee","result","plazos"].forEach(t => {
    const panel = document.getElementById("ib-panel-" + t);
    const stab = document.getElementById("ib-stab-" + t);
    if (!panel || !stab) return;
    const isActive = t === tab;
    panel.style.display = isActive ? "block" : "none";
    stab.style.color = isActive ? "var(--ink)" : "var(--txt3)";
    stab.style.fontWeight = isActive ? "600" : "500";
    stab.style.borderBottom = isActive ? "2px solid var(--ink)" : "2px solid transparent";
  });
}

// ── CAS PANEL ──
async function _loadCasPanel() {
  const container = document.getElementById("ib-panel-cas");
  if (!container) return;

  const { data: alumnosRaw } = await sb.from("alumnos")
    .select("id,nombre,grupo_horario")
    .eq("centro_id", ctrId)
    .in("grupo_horario", ["1IB","2IB"])
    .order("grupo_horario").order("nombre");

  const alumnos = (alumnosRaw || []).filter(_ibEsAlumnoReal);

  if (alumnos.length === 0) {
    container.innerHTML = '<div style="color:var(--txt3);padding:16px;font-size:13px;">No hay alumnos IB registrados en este centro.</div>';
    return;
  }

  const alumnoIds = alumnos.map(a => a.id);
  const { data: actividades } = await sb.from("cas_actividades")
    .select("*")
    .eq("centro_id", ctrId)
    .in("alumno_id", alumnoIds)
    .order("alumno_id").order("tipo");

  const byAlumno = {};
  alumnos.forEach(a => { byAlumno[a.id] = { alumno: a, acts: [] }; });
  (actividades || []).forEach(act => {
    if (byAlumno[act.alumno_id]) byAlumno[act.alumno_id].acts.push(act);
  });

  const tipoColor = { creatividad: "#6c3eb8", actividad: "#1565c0", servicio: "#1e6b3a" };
  const estadoBadge = (e) => e === "completada"
    ? '<span style="background:#e8f5e9;color:#1e6b3a;border:1px solid #a5d6a7;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">✓ Completada</span>'
    : '<span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">⏳ En curso</span>';

  const canEdit = ["admin","superadmin"].includes(role);

  let html = '';
  if (canEdit) {
    html += `<button class="btn btn-p" onclick="ibNuevaActividad()" style="margin-bottom:16px;">+ Nueva actividad CAS</button>`;
  }

  Object.values(byAlumno).forEach(({ alumno, acts }) => {
    const totalHoras = acts.reduce((s, a) => s + (a.horas || 0), 0);
    const losUsados = new Set(acts.flatMap(a => a.los_trabajados || []));
    const losBadges = IB_LOS.map(lo =>
      `<span title="${IB_LO_DESC[lo]}" style="padding:2px 7px;border-radius:20px;font-size:11px;font-weight:600;background:${losUsados.has(lo) ? 'var(--ink-l)' : 'var(--srf2)'};color:${losUsados.has(lo) ? 'var(--ink)' : 'var(--txt3)'};border:1px solid ${losUsados.has(lo) ? 'var(--ink-l)' : 'var(--bdr)'};">${lo}</span>`
    ).join("");

    html += `
      <div class="card" style="margin-bottom:16px;">
        <div class="card-hdr" style="cursor:pointer;" onclick="ibToggleCas('cas-${alumno.id}')">
          <div class="card-ico b" style="width:36px;height:36px;font-size:16px;display:flex;align-items:center;justify-content:center;">👤</div>
          <div style="flex:1;">
            <div class="card-title" style="font-size:14px;">${alumno.nombre}</div>
            <div style="font-size:12px;color:var(--txt3);">${alumno.grupo_horario} · ${acts.length} actividad${acts.length!==1?'es':''} · ${totalHoras}h</div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${losBadges}</div>
          <div style="margin-left:8px;color:var(--txt3);font-size:18px;" id="cas-arr-${alumno.id}">▸</div>
        </div>
        <div id="cas-${alumno.id}" style="display:none;margin-top:12px;">
          ${acts.length === 0
            ? '<div style="color:var(--txt3);font-size:13px;padding:8px 0;">Sin actividades registradas.</div>'
            : acts.map(act => `
                <div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;background:var(--bg);">
                  <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">
                    <span style="background:${tipoColor[act.tipo] || '#666'};color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600;white-space:nowrap;">${_ibEsc(act.tipo)}</span>
                    <div style="flex:1;">
                      <div style="font-size:13px;font-weight:600;color:var(--txt);">${_ibEsc(act.titulo)}</div>
                      ${act.descripcion ? `<div style="font-size:12px;color:var(--txt3);margin-top:2px;">${_ibEsc(act.descripcion)}</div>` : ''}
                      ${act.reflexion ? `<div style="font-size:12px;color:var(--txt2);margin-top:4px;font-style:italic;">"${_ibEsc(act.reflexion)}"</div>` : ''}
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                      ${estadoBadge(act.estado)}
                      <div style="font-size:11px;color:var(--txt3);margin-top:4px;">${act.horas || 0}h</div>
                    </div>
                  </div>
                  ${act.los_trabajados?.length ? `
                    <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">
                      ${(act.los_trabajados||[]).map(lo => `<span title="${IB_LO_DESC[lo]}" style="padding:1px 7px;border-radius:20px;font-size:10px;font-weight:600;background:var(--ink-l);color:var(--ink);border:1px solid var(--ink-l);">${lo}</span>`).join('')}
                    </div>` : ''}
                  ${canEdit ? `
                    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
                      ${act.estado !== 'completada' ? `<button class="btn btn-p" style="font-size:11px;padding:4px 10px;" onclick="ibAprobarCas('${act.id}')">✓ Aprobar</button>` : ''}
                      <button class="btn btn-s" style="font-size:11px;padding:4px 10px;" onclick="ibEditarLOs('${act.id}', '${alumno.id}')">🏷 Editar LOs</button>
                      ${act.estado !== 'completada' ? `<button style="background:var(--red-l);color:var(--red);border:1px solid var(--red-l);border-radius:var(--r-sm);font-size:11px;padding:4px 10px;cursor:pointer;" onclick="ibRechazarCas('${act.id}')">✕ Rechazar</button>` : ''}
                    </div>` : ''}
                </div>
              `).join('')
          }
          ${canEdit ? `<button class="btn btn-s" style="font-size:12px;margin-top:4px;" onclick="ibNuevaActividadAlumno('${alumno.id}', '${alumno.nombre}')">+ Añadir actividad</button>` : ''}
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

function ibToggleCas(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const alumnoId = id.replace("cas-", "");
  const arr = document.getElementById("cas-arr-" + alumnoId);
  const open = el.style.display !== "none";
  el.style.display = open ? "none" : "block";
  if (arr) arr.textContent = open ? "▸" : "▾";
}

async function ibAprobarCas(actId) {
  const { error } = await sb.from("cas_actividades").update({ estado: "completada" }).eq("id", actId).eq("centro_id", ctrId);
  if (!error) _loadCasPanel();
  else alert("Error: " + error.message);
}

async function ibRechazarCas(actId) {
  if (!confirm("¿Rechazar y eliminar esta actividad CAS?")) return;
  const { error } = await sb.from("cas_actividades").delete().eq("id", actId).eq("centro_id", ctrId);
  if (!error) _loadCasPanel();
  else alert("Error: " + error.message);
}

async function ibEditarLOs(actId, alumnoId) {
  const { data: act } = await sb.from("cas_actividades")
    .select("titulo,descripcion,reflexion,tipo,los_trabajados")
    .eq("id", actId).eq("centro_id", ctrId).single();
  const current = act?.los_trabajados || [];
  const selected = new Set(current);

  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;";
  div.innerHTML = `
    <div id="ib-los-modal" style="background:var(--srf);border-radius:var(--r);padding:24px;width:100%;max-width:min(400px,calc(100vw - 24px));box-shadow:var(--sh-lg);">
      <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Learning Outcomes</div>
      <div style="font-size:12px;color:var(--txt3);margin-bottom:12px;">${act?.titulo || ''}</div>
      <button id="btn-sugerir-ia" class="btn btn-s" onclick="ibSugerirLOs('${actId}')"
        style="width:100%;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;">
        ✨ Sugerir etiquetas con IA
      </button>
      <div id="los-ia-msg" style="display:none;font-size:12px;margin-bottom:10px;padding:7px 10px;border-radius:var(--r-sm);"></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
        ${IB_LOS.map(lo => `
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
            <input type="checkbox" class="ib-lo-check" value="${lo}" ${selected.has(lo) ? 'checked' : ''} style="width:15px;height:15px;" />
            <span><strong>${lo}</strong> — ${IB_LO_DESC[lo]}</span>
          </label>`).join('')}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-p" onclick="ibGuardarLOs('${actId}')" style="flex:1;">Guardar</button>
        <button class="btn btn-s" onclick="this.closest('[style*=fixed]').remove()" style="flex:1;">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function ibSugerirLOs(actId) {
  const btn = document.getElementById("btn-sugerir-ia");
  const msg = document.getElementById("los-ia-msg");
  if (!btn || !msg) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⟳</span> Analizando con IA…';
  msg.style.display = "none";

  try {
    const { data: act } = await sb.from("cas_actividades")
      .select("titulo,descripcion,reflexion,tipo")
      .eq("id", actId).eq("centro_id", ctrId).single();

    const { data, error } = await sb.functions.invoke("cas-analyzer", {
      body: { actividad: act }
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    const sugeridos = data.los || [];
    if (sugeridos.length === 0) throw new Error("La IA no pudo determinar LOs para esta actividad");

    // Pre-check suggested LOs (keep existing + add suggestions)
    document.querySelectorAll("#ib-los-modal .ib-lo-check").forEach(chk => {
      if (sugeridos.includes(chk.value)) chk.checked = true;
    });

    msg.style.cssText = "display:block;background:var(--ink-ll);color:var(--ink);border:1px solid var(--ink-l);font-size:12px;padding:7px 10px;border-radius:var(--r-sm);margin-bottom:10px;";
    msg.textContent = "✨ IA sugiere: " + sugeridos.join(", ") + " — revisa y ajusta si es necesario.";
  } catch (e) {
    msg.style.cssText = "display:block;background:var(--red-l);color:var(--red);border:1px solid var(--red-l);font-size:12px;padding:7px 10px;border-radius:var(--r-sm);margin-bottom:10px;";
    msg.textContent = "Error: " + e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = "✨ Sugerir etiquetas con IA";
  }
}

async function ibGuardarLOs(actId) {
  const checks = document.querySelectorAll("#ib-los-modal .ib-lo-check:checked");
  const los = Array.from(checks).map(c => c.value);
  const { error } = await sb.from("cas_actividades").update({ los_trabajados: los }).eq("id", actId).eq("centro_id", ctrId);
  if (error) { alert("Error: " + error.message); return; }
  document.querySelector("[style*='fixed'][style*='z-index:2000']")?.remove();
  _loadCasPanel();
}

function ibNuevaActividadAlumno(alumnoId, alumnoNombre) {
  _ibModalActividad(alumnoId, alumnoNombre);
}

function ibNuevaActividad() {
  _ibModalActividad(null, null);
}

async function _ibModalActividad(preAlumnoId, preAlumnoNombre) {
  let alumnosOpts = "";
  if (!preAlumnoId) {
    const { data: alumnosRaw } = await sb.from("alumnos")
      .select("id,nombre,grupo_horario").eq("centro_id", ctrId)
      .in("grupo_horario", ["1IB","2IB"]).order("nombre");
    alumnosOpts = (alumnosRaw || []).filter(_ibEsAlumnoReal)
      .map(a => `<option value="${a.id}">${a.nombre} (${a.grupo_horario})</option>`).join("");
  }

  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;";
  div.innerHTML = `
    <div style="background:var(--srf);border-radius:var(--r);padding:24px;width:100%;max-width:min(480px,calc(100vw - 24px));max-height:90vh;overflow-y:auto;box-shadow:var(--sh-lg);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="font-size:16px;font-weight:600;">Nueva actividad CAS</div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt3);">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${preAlumnoId
          ? `<div><label class="lbl">Alumno</label><div style="font-size:13px;padding:8px;background:var(--srf2);border-radius:var(--r-sm);">${preAlumnoNombre}</div></div>`
          : `<div><label class="lbl">Alumno *</label><select class="fi" id="modal-cas-alumno"><option value="">Selecciona alumno…</option>${alumnosOpts}</select></div>`}
        <div><label class="lbl">Título *</label><input class="fi" id="modal-cas-titulo" placeholder="Título de la actividad" /></div>
        <div><label class="lbl">Tipo *</label>
          <select class="fi" id="modal-cas-tipo">
            <option value="creatividad">🎨 Creatividad</option>
            <option value="actividad">⚽ Actividad</option>
            <option value="servicio">🤝 Servicio</option>
          </select>
        </div>
        <div><label class="lbl">Descripción</label><textarea class="fi" id="modal-cas-desc" rows="2" placeholder="Descripción breve…"></textarea></div>
        <div><label class="lbl">Horas estimadas</label><input class="fi" id="modal-cas-horas" type="number" min="0" max="500" value="0" /></div>
        <div>
          <label class="lbl">Learning Outcomes</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
            ${IB_LOS.map(lo => `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;"><input type="checkbox" value="${lo}" class="modal-cas-lo" /> ${lo}</label>`).join('')}
          </div>
        </div>
        <button class="btn btn-p" onclick="ibGuardarActividad('${preAlumnoId || ''}')">Guardar actividad</button>
        <div id="modal-cas-err" style="display:none;color:var(--red);font-size:12px;"></div>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function ibGuardarActividad(preAlumnoId) {
  const errEl = document.getElementById("modal-cas-err");
  if (errEl) errEl.style.display = "none";

  const alumnoId = preAlumnoId || document.getElementById("modal-cas-alumno")?.value;
  const titulo = document.getElementById("modal-cas-titulo")?.value.trim();
  const tipo = document.getElementById("modal-cas-tipo")?.value;
  const desc = document.getElementById("modal-cas-desc")?.value.trim();
  const horas = parseInt(document.getElementById("modal-cas-horas")?.value) || 0;
  const los = Array.from(document.querySelectorAll(".modal-cas-lo:checked")).map(c => c.value);

  if (!alumnoId || !titulo) {
    if (errEl) { errEl.textContent = "Alumno y título son obligatorios."; errEl.style.display = "block"; }
    return;
  }

  const { error } = await sb.from("cas_actividades").insert({
    centro_id: ctrId,
    alumno_id: alumnoId,
    titulo,
    tipo,
    descripcion: desc || null,
    horas,
    los_trabajados: los,
    estado: "en_curso",
    fecha_inicio: new Date().toISOString().slice(0,10)
  });

  if (error) {
    if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; }
    return;
  }
  document.querySelector("[style*='fixed'][style*='z-index:2000']")?.remove();
  _loadCasPanel();
}

// ── EXTENDED ESSAY PANEL ──
async function _loadEePanel() {
  const container = document.getElementById("ib-panel-ee");
  if (!container) return;

  const { data: alumnosRaw } = await sb.from("alumnos")
    .select("id,nombre,grupo_horario")
    .eq("centro_id", ctrId)
    .eq("grupo_horario", "2IB")
    .order("nombre");

  const alumnos = (alumnosRaw || []).filter(_ibEsAlumnoReal);

  if (alumnos.length === 0) {
    container.innerHTML = '<div style="color:var(--txt3);padding:16px;font-size:13px;">No hay alumnos de 2IB registrados en este centro.</div>';
    return;
  }

  const alumnoIds = alumnos.map(a => a.id);
  const { data: essays } = await sb.from("extended_essay")
    .select("*")
    .eq("centro_id", ctrId)
    .in("alumno_id", alumnoIds);

  const eeByAlumno = {};
  (essays || []).forEach(ee => { eeByAlumno[ee.alumno_id] = ee; });

  const estadoConfig = {
    en_proceso: { color: "#e65100", bg: "#fff3e0", label: "En proceso", icon: "🟡" },
    primer_borrador: { color: "#1565c0", bg: "#e3f2fd", label: "Primer borrador", icon: "🔵" },
    borrador_final: { color: "#6a1b9a", bg: "#f3e5f5", label: "Borrador final", icon: "🟣" },
    entregado: { color: "#1e6b3a", bg: "#e8f5e9", label: "Entregado", icon: "🟢" },
    sin_empezar: { color: "#b71c1c", bg: "#ffebee", label: "Sin empezar", icon: "🔴" }
  };

  const canEdit = ["admin","superadmin"].includes(role);
  const today = new Date();

  let html = `<div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:var(--srf2);">
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">Alumno</th>
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">Título EE</th>
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">Asignatura</th>
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">Supervisor</th>
          <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">Estado</th>
          <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">Entrega</th>
          <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);"></th>
        </tr>
      </thead>
      <tbody>`;

  alumnos.forEach(alumno => {
    const ee = eeByAlumno[alumno.id];
    const cfg = estadoConfig[ee?.estado || "sin_empezar"] || estadoConfig.sin_empezar;
    let diasStr = "—";
    let diasColor = "var(--txt3)";
    if (ee?.fecha_entrega_limite) {
      const limit = new Date(ee.fecha_entrega_limite);
      const dias = Math.ceil((limit - today) / 86400000);
      diasStr = dias < 0 ? `Vencido (${Math.abs(dias)}d)` : `${dias}d`;
      diasColor = dias < 0 ? "var(--red)" : dias <= 30 ? "var(--amb)" : "var(--txt2)";
    }

    html += `
      <tr style="border-bottom:1px solid var(--bdr);cursor:pointer;" onclick="ibVerEe('${alumno.id}','${alumno.nombre}')" onmouseover="this.style.background='var(--srf2)'" onmouseout="this.style.background=''">
        <td style="padding:10px 12px;font-weight:500;color:var(--txt);">${alumno.nombre}</td>
        <td style="padding:10px 12px;color:var(--txt2);">${ee?.titulo || '<span style="color:var(--txt3);">Sin título</span>'}</td>
        <td style="padding:10px 12px;color:var(--txt2);">${ee?.asignatura || '—'}</td>
        <td style="padding:10px 12px;color:var(--txt2);">${ee?.supervisor_nombre || '—'}</td>
        <td style="padding:10px 12px;text-align:center;">
          <span title="${cfg.label}" style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}20;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;white-space:nowrap;">${cfg.icon} ${cfg.label}</span>
        </td>
        <td style="padding:10px 12px;text-align:center;font-weight:600;color:${diasColor};font-size:13px;">${diasStr}</td>
        <td style="padding:10px 12px;text-align:center;"><span style="color:var(--ink);font-size:12px;">Ver ›</span></td>
      </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

async function ibVerEe(alumnoId, alumnoNombre) {
  const { data: ee } = await sb.from("extended_essay").select("*").eq("centro_id", ctrId).eq("alumno_id", alumnoId).single();
  const canEdit = ["admin","superadmin"].includes(role);
  const today = new Date();

  // Borradores + feedback del supervisor (solo si el EE ya existe)
  let borradores = [];
  if (ee && ee.id) {
    const { data: br } = await sb.from("ee_borradores")
      .select("*").eq("centro_id", ctrId).eq("extended_essay_id", ee.id)
      .order("version", { ascending: false });
    borradores = br || [];
  }

  const estadoOpts = [
    { val: "sin_empezar", label: "Sin empezar" },
    { val: "en_proceso", label: "En proceso" },
    { val: "primer_borrador", label: "Primer borrador" },
    { val: "borrador_final", label: "Borrador final" },
    { val: "entregado", label: "Entregado" }
  ];

  const estadoConfig = {
    en_proceso: { color: "#e65100", bg: "#fff3e0", label: "En proceso" },
    primer_borrador: { color: "#1565c0", bg: "#e3f2fd", label: "Primer borrador" },
    borrador_final: { color: "#6a1b9a", bg: "#f3e5f5", label: "Borrador final" },
    entregado: { color: "#1e6b3a", bg: "#e8f5e9", label: "Entregado" },
    sin_empezar: { color: "#b71c1c", bg: "#ffebee", label: "Sin empezar" }
  };

  let diasHtml = "";
  if (ee?.fecha_entrega_limite) {
    const limit = new Date(ee.fecha_entrega_limite);
    const dias = Math.ceil((limit - today) / 86400000);
    const color = dias < 0 ? "#b71c1c" : dias <= 30 ? "#e65100" : "#1e6b3a";
    diasHtml = `<div style="background:${color}18;border:1px solid ${color}40;border-radius:var(--r-sm);padding:10px 14px;font-size:13px;color:${color};font-weight:600;">
      ${dias < 0 ? `⚠️ Plazo vencido hace ${Math.abs(dias)} días` : `📅 ${dias} días para la entrega (${ee.fecha_entrega_limite})`}
    </div>`;
  }

  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;";
  div.innerHTML = `
    <div style="background:var(--srf);border-radius:var(--r);padding:28px;width:100%;max-width:min(520px,calc(100vw - 24px));max-height:90vh;overflow-y:auto;box-shadow:var(--sh-lg);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
        <div>
          <div style="font-size:17px;font-weight:600;color:var(--txt);">${alumnoNombre}</div>
          <div style="font-size:12px;color:var(--txt3);">Extended Essay · 2IB</div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt3);">✕</button>
      </div>
      ${diasHtml}
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:${diasHtml ? '14px' : '0'};">
        <div><label class="lbl">Título</label><input class="fi" id="ee-titulo" value="${ee?.titulo || ''}" ${canEdit ? '' : 'disabled'} /></div>
        <div><label class="lbl">Asignatura</label><input class="fi" id="ee-asig" value="${ee?.asignatura || ''}" ${canEdit ? '' : 'disabled'} /></div>
        <div><label class="lbl">Supervisor</label><input class="fi" id="ee-sup" value="${ee?.supervisor_nombre || ''}" ${canEdit ? '' : 'disabled'} /></div>
        <div><label class="lbl">Palabras actuales</label><input class="fi" id="ee-palabras" type="number" value="${ee?.palabras_actuales || 0}" ${canEdit ? '' : 'disabled'} /></div>
        <div><label class="lbl">Fecha límite</label><input class="fi" id="ee-fecha" type="date" value="${ee?.fecha_entrega_limite || ''}" ${canEdit ? '' : 'disabled'} /></div>
        <div>
          <label class="lbl">Estado</label>
          <select class="fi" id="ee-estado" ${canEdit ? '' : 'disabled'}>
            ${estadoOpts.map(o => `<option value="${o.val}" ${(ee?.estado || 'sin_empezar') === o.val ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="lbl">Nota final EE (A–E)</label>
          <select class="fi" id="ee-nota" ${canEdit ? '' : 'disabled'}>
            <option value="">Sin nota</option>
            ${['A','B','C','D','E'].map(n => `<option value="${n}" ${ee?.nota === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        ${canEdit ? `
          <button class="btn btn-p" onclick="ibGuardarEe('${alumnoId}', ${ee ? `'${ee.id}'` : 'null'})">💾 Guardar cambios</button>
          <div id="ee-err" style="display:none;color:var(--red);font-size:12px;"></div>` : ''}

        ${ee && ee.id ? `
        <div style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:14px;">
          <div style="font-size:13px;font-weight:600;color:var(--txt);margin-bottom:8px;">Borradores y feedback (${borradores.length})</div>
          ${borradores.length ? borradores.map(b => `
            <div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:8px 10px;margin-bottom:6px;font-size:12px;">
              <div style="display:flex;gap:8px;color:var(--txt2);flex-wrap:wrap;"><strong>v${b.version}</strong><span>${b.fecha || ''}</span>${b.palabras != null ? `<span>· ${b.palabras} palabras</span>` : ''}</div>
              ${b.comentario_supervisor ? `<div style="margin-top:4px;color:var(--txt);white-space:pre-wrap;">${_ibEsc(b.comentario_supervisor)}</div>` : ''}
            </div>`).join('') : '<div style="font-size:12px;color:var(--txt3);">Aún no hay borradores registrados.</div>'}
          ${canEdit ? `
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
              <input class="fi" id="ee-br-palabras" type="number" placeholder="Palabras de este borrador" />
              <textarea class="fi" id="ee-br-coment" rows="2" placeholder="Feedback del supervisor sobre este borrador…" style="resize:vertical;"></textarea>
              <button class="btn" onclick="ibAddBorrador('${ee.id}','${alumnoId}','${_ibEsc(alumnoNombre).replace(/'/g, "\\'")}', ${borradores.length})" style="border:1px solid var(--bdr);background:var(--srf2);font-size:12px;">+ Registrar borrador + feedback</button>
            </div>` : ''}
        </div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function ibAddBorrador(eeId, alumnoId, alumnoNombre, prevCount) {
  const pal = parseInt(document.getElementById("ee-br-palabras")?.value) || null;
  const com = document.getElementById("ee-br-coment")?.value.trim() || null;
  if (!pal && !com) return;
  const { error } = await sb.from("ee_borradores").insert({
    centro_id: ctrId, extended_essay_id: eeId,
    version: (prevCount || 0) + 1, palabras: pal, comentario_supervisor: com,
  });
  if (error) { alert("Error: " + error.message); return; }
  document.querySelector("[style*='fixed'][style*='z-index:2000']")?.remove();
  ibVerEe(alumnoId, alumnoNombre);
}

async function ibGuardarEe(alumnoId, eeId) {
  const errEl = document.getElementById("ee-err");
  if (errEl) errEl.style.display = "none";

  const payload = {
    centro_id: ctrId,
    alumno_id: alumnoId,
    titulo: document.getElementById("ee-titulo")?.value.trim() || null,
    asignatura: document.getElementById("ee-asig")?.value.trim() || null,
    supervisor_nombre: document.getElementById("ee-sup")?.value.trim() || null,
    palabras_actuales: parseInt(document.getElementById("ee-palabras")?.value) || 0,
    fecha_entrega_limite: document.getElementById("ee-fecha")?.value || null,
    estado: document.getElementById("ee-estado")?.value || "sin_empezar",
    nota: document.getElementById("ee-nota")?.value || null
  };

  let error;
  if (eeId && eeId !== 'null') {
    ({ error } = await sb.from("extended_essay").update(payload).eq("id", eeId).eq("centro_id", ctrId));
  } else {
    ({ error } = await sb.from("extended_essay").insert(payload));
  }

  if (error) {
    if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; }
    return;
  }
  document.querySelector("[style*='fixed'][style*='z-index:2000']")?.remove();
  _loadEePanel();
}

// ── PLAZOS IB PANEL ──
async function _loadPlazosPanel() {
  const container = document.getElementById("ib-panel-plazos");
  if (!container) return;

  const { data: plazos } = await sb.from("plazos_ib")
    .select("*")
    .eq("centro_id", ctrId)
    .order("fecha_limite");

  const canEdit = ["admin","superadmin"].includes(role);
  const today = new Date();
  today.setHours(0,0,0,0);

  const tipoLabel = {
    entrega_ia: "IA", tok: "TOK", cas: "CAS", examen: "Examen",
    formulario: "Formulario", reunion: "Reunión", otro: "Otro"
  };

  const pendientes = (plazos || []).filter(p => p.estado === "pendiente");
  const completados = (plazos || []).filter(p => p.estado === "completado");

  let html = '';

  if (canEdit) {
    html += `<button class="btn btn-p" onclick="ibNuevoPlazo()" style="margin-bottom:16px;">+ Nuevo plazo</button>`;
  }

  if (pendientes.length === 0 && completados.length === 0) {
    html += '<div style="color:var(--txt3);padding:16px;font-size:13px;">No hay plazos registrados para este centro.</div>';
    container.innerHTML = html;
    return;
  }

  if (pendientes.length > 0) {
    html += '<div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--txt3);margin-bottom:10px;">Pendientes</div>';
    pendientes.forEach(p => {
      const limit = new Date(p.fecha_limite);
      const dias = Math.ceil((limit - today) / 86400000);
      let borderColor, bgColor, textColor, diasLabel;

      if (dias < 0) {
        borderColor = "#b71c1c"; bgColor = "#ffebee"; textColor = "#b71c1c";
        diasLabel = `Vencido (${Math.abs(dias)}d)`;
      } else if (dias <= 7) {
        borderColor = "#b71c1c"; bgColor = "#ffebee"; textColor = "#b71c1c";
        diasLabel = dias === 0 ? "Hoy" : `${dias}d`;
      } else if (dias <= 30) {
        borderColor = "#e65100"; bgColor = "#fff3e0"; textColor = "#e65100";
        diasLabel = `${dias}d`;
      } else {
        borderColor = "#1e6b3a"; bgColor = "#e8f5e9"; textColor = "#1e6b3a";
        diasLabel = `${dias}d`;
      }

      html += `
        <div style="border-left:4px solid ${borderColor};background:var(--srf);border-radius:0 var(--r-sm) var(--r-sm) 0;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;align-items:flex-start;gap:12px;">
          <div style="background:${bgColor};color:${textColor};border-radius:var(--r-sm);padding:6px 10px;text-align:center;min-width:56px;flex-shrink:0;">
            <div style="font-size:18px;font-weight:700;line-height:1;">${diasLabel}</div>
            <div style="font-size:10px;font-weight:600;margin-top:2px;">${dias < 0 ? '🚨' : dias <= 7 ? '⚠️' : dias <= 30 ? '🔶' : '✅'}</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;color:var(--txt);">${p.titulo}</div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap;">
              <span style="background:var(--srf2);color:var(--txt3);border:1px solid var(--bdr);border-radius:20px;padding:1px 8px;font-size:11px;">${tipoLabel[p.tipo] || p.tipo}</span>
              <span style="font-size:12px;color:var(--txt3);">👤 ${p.afecta_a}</span>
              <span style="font-size:12px;color:var(--txt3);">📅 ${p.fecha_limite}</span>
            </div>
            ${p.descripcion ? `<div style="font-size:12px;color:var(--txt2);margin-top:6px;">${p.descripcion}</div>` : ''}
          </div>
          ${canEdit ? `<button class="btn btn-p" style="flex-shrink:0;font-size:11px;padding:5px 12px;" onclick="ibMarcarPlazo('${p.id}')">✓ Completado</button>` : ''}
        </div>`;
    });
  }

  if (completados.length > 0) {
    html += `
      <div style="margin-top:20px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--txt3);margin-bottom:10px;cursor:pointer;" onclick="ibTogglePlazosComp()">
          Completados (${completados.length}) <span id="plazos-comp-arr">▸</span>
        </div>
        <div id="plazos-comp-list" style="display:none;">
          ${completados.map(p => `
            <div style="border-left:4px solid var(--bdr);background:var(--srf);border-radius:0 var(--r-sm) var(--r-sm) 0;padding:12px 16px;margin-bottom:8px;opacity:.65;display:flex;align-items:center;gap:12px;">
              <div style="font-size:18px;">✅</div>
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:500;color:var(--txt);text-decoration:line-through;">${p.titulo}</div>
                <div style="font-size:12px;color:var(--txt3);">📅 ${p.fecha_limite} · ${tipoLabel[p.tipo] || p.tipo}</div>
              </div>
              ${canEdit ? `<button class="btn btn-s" style="font-size:11px;padding:3px 10px;" onclick="ibReabrirPlazo('${p.id}')">↺ Reabrir</button>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

function ibTogglePlazosComp() {
  const list = document.getElementById("plazos-comp-list");
  const arr = document.getElementById("plazos-comp-arr");
  if (!list) return;
  const open = list.style.display !== "none";
  list.style.display = open ? "none" : "block";
  if (arr) arr.textContent = open ? "▸" : "▾";
}

async function ibMarcarPlazo(id) {
  const { error } = await sb.from("plazos_ib").update({ estado: "completado" }).eq("id", id).eq("centro_id", ctrId);
  if (!error) _loadPlazosPanel();
  else alert("Error: " + error.message);
}

async function ibReabrirPlazo(id) {
  const { error } = await sb.from("plazos_ib").update({ estado: "pendiente" }).eq("id", id).eq("centro_id", ctrId);
  if (!error) _loadPlazosPanel();
  else alert("Error: " + error.message);
}

function ibNuevoPlazo() {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;";
  div.innerHTML = `
    <div style="background:var(--srf);border-radius:var(--r);padding:24px;width:100%;max-width:440px;max-height:90vh;overflow-y:auto;box-shadow:var(--sh-lg);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="font-size:16px;font-weight:600;">Nuevo plazo IB</div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt3);">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div><label class="lbl">Título *</label><input class="fi" id="np-titulo" placeholder="Ej: Entrega IA Física" /></div>
        <div><label class="lbl">Tipo *</label>
          <select class="fi" id="np-tipo">
            <option value="entrega_ia">IA (Evaluación interna)</option>
            <option value="tok">TOK</option>
            <option value="cas">CAS</option>
            <option value="examen">Examen</option>
            <option value="formulario">Formulario</option>
            <option value="reunion">Reunión</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div><label class="lbl">Fecha límite *</label><input class="fi" id="np-fecha" type="date" /></div>
        <div><label class="lbl">Afecta a</label><input class="fi" id="np-afecta" placeholder="coordinador, alumnos, supervisores…" value="coordinador" /></div>
        <div><label class="lbl">Descripción</label><textarea class="fi" id="np-desc" rows="2" placeholder="Descripción opcional…"></textarea></div>
        <div><label class="lbl">Curso escolar</label><input class="fi" id="np-curso" value="2024-2025" /></div>
        <button class="btn btn-p" onclick="ibGuardarPlazo()">Guardar plazo</button>
        <div id="np-err" style="display:none;color:var(--red);font-size:12px;"></div>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function ibGuardarPlazo() {
  const errEl = document.getElementById("np-err");
  if (errEl) errEl.style.display = "none";

  const titulo = document.getElementById("np-titulo")?.value.trim();
  const tipo = document.getElementById("np-tipo")?.value;
  const fecha = document.getElementById("np-fecha")?.value;
  const afecta = document.getElementById("np-afecta")?.value.trim() || "coordinador";
  const desc = document.getElementById("np-desc")?.value.trim();
  const curso = document.getElementById("np-curso")?.value.trim() || "2024-2025";

  if (!titulo || !fecha) {
    if (errEl) { errEl.textContent = "Título y fecha límite son obligatorios."; errEl.style.display = "block"; }
    return;
  }

  const { error } = await sb.from("plazos_ib").insert({
    centro_id: ctrId,
    titulo,
    tipo,
    fecha_limite: fecha,
    afecta_a: afecta,
    descripcion: desc || null,
    curso_escolar: curso,
    estado: "pendiente"
  });

  if (error) {
    if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; }
    return;
  }
  document.querySelector("[style*='fixed'][style*='z-index:2000']")?.remove();
  _loadPlazosPanel();
}

// ════════════════════════════════════════════════════════════════════════════
//  TOK (Theory of Knowledge) — ensayo + exhibición
// ════════════════════════════════════════════════════════════════════════════
const IB_TOK_EST = {
  pendiente: { bg: "#ffebee", color: "#b71c1c", label: "Pendiente" },
  borrador:  { bg: "#fff3e0", color: "#e65100", label: "Borrador" },
  entregado: { bg: "#e3f2fd", color: "#1565c0", label: "Entregado" },
  evaluado:  { bg: "#e8f5e9", color: "#1e6b3a", label: "Evaluado" },
};
function _ibTokBadge(est) {
  const c = IB_TOK_EST[est || "pendiente"] || IB_TOK_EST.pendiente;
  return `<span style="background:${c.bg};color:${c.color};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;white-space:nowrap;">${c.label}</span>`;
}

async function _loadTokPanel() {
  const container = document.getElementById("ib-panel-tok");
  if (!container) return;
  const alumnos = await _ibLoadAlumnos(["1IB", "2IB"]);
  if (!alumnos.length) { container.innerHTML = '<div style="color:var(--txt3);padding:16px;font-size:13px;">No hay alumnos IB registrados.</div>'; return; }
  const { data: toks } = await sb.from("ib_tok").select("*").eq("centro_id", ctrId).in("alumno_id", alumnos.map(a => a.id));
  const byAl = {}; (toks || []).forEach(t => byAl[t.alumno_id] = t);

  let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:var(--srf2);">' +
    ["Alumno", "Ensayo", "Nota", "Exhibición", "Nota", ""].map(h => `<th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">${h}</th>`).join("") +
    "</tr></thead><tbody>";
  alumnos.forEach(a => {
    const t = byAl[a.id] || {};
    html += `<tr style="border-bottom:1px solid var(--bdr);cursor:pointer;" onclick="ibVerTok('${a.id}','${_ibEsc(a.nombre).replace(/'/g, "\\'")}')" onmouseover="this.style.background='var(--srf2)'" onmouseout="this.style.background=''">
      <td style="padding:10px 12px;font-weight:500;color:var(--txt);">${_ibEsc(a.nombre)} <span style="color:var(--txt3);font-size:11px;">${a.grupo_horario}</span></td>
      <td style="padding:10px 12px;">${_ibTokBadge(t.ensayo_estado)}</td>
      <td style="padding:10px 12px;font-weight:600;color:var(--ink);">${t.ensayo_nota || "—"}</td>
      <td style="padding:10px 12px;">${_ibTokBadge(t.exhibicion_estado)}</td>
      <td style="padding:10px 12px;font-weight:600;color:var(--ink);">${t.exhibicion_nota || "—"}</td>
      <td style="padding:10px 12px;color:var(--ink);font-size:12px;">Ver ›</td></tr>`;
  });
  container.innerHTML = html + "</tbody></table></div>";
}

async function ibVerTok(alumnoId, alumnoNombre) {
  const { data: t } = await sb.from("ib_tok").select("*").eq("centro_id", ctrId).eq("alumno_id", alumnoId).maybeSingle();
  const canEdit = ["admin", "superadmin"].includes(role);
  const estOpts = ["pendiente", "borrador", "entregado", "evaluado"];
  const notaOpts = ["", "A", "B", "C", "D", "E"];
  const selEst = (id, val) => `<select class="fi" id="${id}" ${canEdit ? "" : "disabled"}>${estOpts.map(o => `<option value="${o}" ${(val || "pendiente") === o ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  const selNota = (id, val) => `<select class="fi" id="${id}" ${canEdit ? "" : "disabled"}>${notaOpts.map(o => `<option value="${o}" ${(val || "") === o ? "selected" : ""}>${o || "Sin nota"}</option>`).join("")}</select>`;
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;";
  div.innerHTML = `<div style="background:var(--srf);border-radius:var(--r);padding:28px;width:100%;max-width:min(520px,calc(100vw - 24px));max-height:90vh;overflow-y:auto;box-shadow:var(--sh-lg);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div><div style="font-size:17px;font-weight:600;color:var(--txt);">${_ibEsc(alumnoNombre)}</div><div style="font-size:12px;color:var(--txt3);">Theory of Knowledge</div></div>
      <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt3);">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--txt2);">📝 Ensayo TOK</div>
      <div><label class="lbl">Título / pregunta prescrita</label><input class="fi" id="tok-ens-tit" value="${_ibEsc(t?.ensayo_titulo || "")}" ${canEdit ? "" : "disabled"}/></div>
      <div style="display:flex;gap:10px;"><div style="flex:1;"><label class="lbl">Estado</label>${selEst("tok-ens-est", t?.ensayo_estado)}</div><div style="width:120px;"><label class="lbl">Nota</label>${selNota("tok-ens-nota", t?.ensayo_nota)}</div></div>
      <div style="font-size:12px;font-weight:700;color:var(--txt2);border-top:1px solid var(--bdr);padding-top:12px;">🖼️ Exhibición TOK</div>
      <div><label class="lbl">Tema / pregunta IA</label><input class="fi" id="tok-exh-tema" value="${_ibEsc(t?.exhibicion_tema || "")}" ${canEdit ? "" : "disabled"}/></div>
      <div style="display:flex;gap:10px;"><div style="flex:1;"><label class="lbl">Estado</label>${selEst("tok-exh-est", t?.exhibicion_estado)}</div><div style="width:120px;"><label class="lbl">Nota</label>${selNota("tok-exh-nota", t?.exhibicion_nota)}</div></div>
      <div><label class="lbl">Comentarios</label><textarea class="fi" id="tok-coment" rows="2" style="resize:vertical;" ${canEdit ? "" : "disabled"}>${_ibEsc(t?.comentarios || "")}</textarea></div>
      ${canEdit ? `<button class="btn btn-p" onclick="ibGuardarTok('${alumnoId}')">💾 Guardar</button><div id="tok-err" style="display:none;color:var(--red);font-size:12px;"></div>` : ""}
    </div></div>`;
  document.body.appendChild(div);
}

async function ibGuardarTok(alumnoId) {
  const errEl = document.getElementById("tok-err");
  if (errEl) errEl.style.display = "none";
  const payload = {
    centro_id: ctrId, alumno_id: alumnoId,
    ensayo_titulo: document.getElementById("tok-ens-tit")?.value.trim() || null,
    ensayo_estado: document.getElementById("tok-ens-est")?.value || "pendiente",
    ensayo_nota: document.getElementById("tok-ens-nota")?.value || null,
    exhibicion_tema: document.getElementById("tok-exh-tema")?.value.trim() || null,
    exhibicion_estado: document.getElementById("tok-exh-est")?.value || "pendiente",
    exhibicion_nota: document.getElementById("tok-exh-nota")?.value || null,
    comentarios: document.getElementById("tok-coment")?.value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("ib_tok").upsert(payload, { onConflict: "centro_id,alumno_id" });
  if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  document.querySelector("[style*='fixed'][style*='z-index:2000']")?.remove();
  _loadTokPanel(); _loadCoordinadorPanel();
}

// ════════════════════════════════════════════════════════════════════════════
//  PREDICCIONES / RESULTADOS (IBIS-adjacent)
// ════════════════════════════════════════════════════════════════════════════
async function _loadResultadosPanel() {
  const container = document.getElementById("ib-panel-result");
  if (!container) return;
  const alumnos = await _ibLoadAlumnos(["1IB", "2IB"]);
  if (!alumnos.length) { container.innerHTML = '<div style="color:var(--txt3);padding:16px;font-size:13px;">No hay alumnos IB registrados.</div>'; return; }
  const { data: res } = await sb.from("ib_resultados").select("*").eq("centro_id", ctrId).in("alumno_id", alumnos.map(a => a.id));
  const byAl = {}; (res || []).forEach(r => { (byAl[r.alumno_id] = byAl[r.alumno_id] || []).push(r); });

  let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:var(--srf2);">' +
    ["Alumno", "Asignaturas", "Σ Predicción", "Σ Final", ""].map(h => `<th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);">${h}</th>`).join("") +
    "</tr></thead><tbody>";
  alumnos.forEach(a => {
    const rs = byAl[a.id] || [];
    const sumP = rs.reduce((s, r) => s + (r.prediccion || 0), 0);
    const sumF = rs.reduce((s, r) => s + (r.nota_final || 0), 0);
    html += `<tr style="border-bottom:1px solid var(--bdr);cursor:pointer;" onclick="ibVerResultados('${a.id}','${_ibEsc(a.nombre).replace(/'/g, "\\'")}')" onmouseover="this.style.background='var(--srf2)'" onmouseout="this.style.background=''">
      <td style="padding:10px 12px;font-weight:500;color:var(--txt);">${_ibEsc(a.nombre)} <span style="color:var(--txt3);font-size:11px;">${a.grupo_horario}</span></td>
      <td style="padding:10px 12px;color:var(--txt2);">${rs.length}</td>
      <td style="padding:10px 12px;font-weight:600;color:var(--ink);">${sumP || "—"}</td>
      <td style="padding:10px 12px;font-weight:600;color:#1e6b3a;">${sumF || "—"}</td>
      <td style="padding:10px 12px;color:var(--ink);font-size:12px;">Editar ›</td></tr>`;
  });
  container.innerHTML = html + "</tbody></table></div>";
}

async function ibVerResultados(alumnoId, alumnoNombre) {
  const { data: rs } = await sb.from("ib_resultados").select("*").eq("centro_id", ctrId).eq("alumno_id", alumnoId).order("asignatura");
  const canEdit = ["admin", "superadmin"].includes(role);
  window._ibResRows = (rs || []).map(r => ({ ...r }));
  const div = document.createElement("div");
  div.id = "ib-res-modal";
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;";
  div.innerHTML = `<div style="background:var(--srf);border-radius:var(--r);padding:28px;width:100%;max-width:min(620px,calc(100vw - 24px));max-height:90vh;overflow-y:auto;box-shadow:var(--sh-lg);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
      <div><div style="font-size:17px;font-weight:600;color:var(--txt);">${_ibEsc(alumnoNombre)}</div><div style="font-size:12px;color:var(--txt3);">Predicciones y resultados (1–7 por asignatura)</div></div>
      <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt3);">✕</button>
    </div>
    <div id="ib-res-body"></div>
    ${canEdit ? `<button class="btn" onclick="ibAddResRow()" style="border:1px solid var(--bdr);background:var(--srf2);font-size:12px;margin-top:8px;">+ Añadir asignatura</button>
    <button class="btn btn-p" onclick="ibGuardarResultados('${alumnoId}')" style="margin-top:8px;width:100%;">💾 Guardar todo</button>
    <div id="ib-res-err" style="display:none;color:var(--red);font-size:12px;margin-top:6px;"></div>` : ""}
  </div>`;
  document.body.appendChild(div);
  _ibRenderResRows(canEdit);
}

function _ibRenderResRows(canEdit) {
  const body = document.getElementById("ib-res-body");
  if (!body) return;
  const rows = window._ibResRows || [];
  if (!rows.length) { body.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:6px 0;">Sin asignaturas. Añade una.</div>'; return; }
  const niveles = ["HL", "SL"];
  body.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>' +
    ["Asignatura", "Nivel", "Predic.", "Final", ""].map(h => `<th style="text-align:left;padding:4px;color:var(--txt3);">${h}</th>`).join("") + "</tr></thead><tbody>" +
    rows.map((r, i) => `<tr>
      <td style="padding:3px;"><input class="fi" style="font-size:12px;padding:5px 8px;" value="${_ibEsc(r.asignatura || "")}" oninput="window._ibResRows[${i}].asignatura=this.value" ${canEdit ? "" : "disabled"}/></td>
      <td style="padding:3px;width:70px;"><select class="fi" style="font-size:12px;padding:5px;" onchange="window._ibResRows[${i}].nivel=this.value" ${canEdit ? "" : "disabled"}>${niveles.map(n => `<option ${r.nivel === n ? "selected" : ""}>${n}</option>`).join("")}</select></td>
      <td style="padding:3px;width:64px;"><input class="fi" type="number" min="1" max="7" style="font-size:12px;padding:5px;" value="${r.prediccion ?? ""}" oninput="window._ibResRows[${i}].prediccion=this.value?parseInt(this.value):null" ${canEdit ? "" : "disabled"}/></td>
      <td style="padding:3px;width:64px;"><input class="fi" type="number" min="1" max="7" style="font-size:12px;padding:5px;" value="${r.nota_final ?? ""}" oninput="window._ibResRows[${i}].nota_final=this.value?parseInt(this.value):null" ${canEdit ? "" : "disabled"}/></td>
      <td style="padding:3px;">${canEdit ? `<button onclick="window._ibResRows.splice(${i},1);_ibRenderResRows(true)" style="background:none;border:none;cursor:pointer;color:var(--red);">✕</button>` : ""}</td>
    </tr>`).join("") + "</tbody></table>";
}

function ibAddResRow() {
  window._ibResRows = window._ibResRows || [];
  window._ibResRows.push({ asignatura: "", nivel: "HL", prediccion: null, nota_final: null });
  _ibRenderResRows(true);
}

async function ibGuardarResultados(alumnoId) {
  const errEl = document.getElementById("ib-res-err");
  if (errEl) errEl.style.display = "none";
  const rows = (window._ibResRows || []).filter(r => (r.asignatura || "").trim());
  const payload = rows.map(r => ({
    centro_id: ctrId, alumno_id: alumnoId, asignatura: r.asignatura.trim(),
    nivel: r.nivel || "HL", prediccion: r.prediccion ?? null, nota_final: r.nota_final ?? null,
    updated_at: new Date().toISOString(),
  }));
  if (payload.length) {
    const { error } = await sb.from("ib_resultados").upsert(payload, { onConflict: "centro_id,alumno_id,asignatura" });
    if (error) { if (errEl) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; } return; }
  }
  // Borrar asignaturas que se quitaron de la rejilla (la rejilla es la fuente de verdad)
  const { data: existentes } = await sb.from("ib_resultados").select("id,asignatura").eq("centro_id", ctrId).eq("alumno_id", alumnoId);
  const keep = new Set(payload.map(p => p.asignatura.toLowerCase()));
  const borrar = (existentes || []).filter(e => !keep.has((e.asignatura || "").toLowerCase())).map(e => e.id);
  if (borrar.length) await sb.from("ib_resultados").delete().in("id", borrar);

  document.getElementById("ib-res-modal")?.remove();
  _loadResultadosPanel(); _loadCoordinadorPanel();
}

// ════════════════════════════════════════════════════════════════════════════
//  COORDINADOR IB — vista global de todos los alumnos IB
// ════════════════════════════════════════════════════════════════════════════
function _ibKpi(val, label) {
  return `<div style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;"><div style="font-size:22px;font-weight:700;color:var(--ink);">${val}</div><div style="font-size:11px;color:var(--txt3);margin-top:2px;">${label}</div></div>`;
}
function _ibEstadoCorto(est) {
  const m = { en_proceso: "En proceso", primer_borrador: "1er borr.", borrador_final: "Borr. final", entregado: "Entregado", sin_empezar: "Sin empezar" };
  return `<span style="color:var(--txt2);font-size:11px;">${m[est] || est}</span>`;
}

async function _loadCoordinadorPanel() {
  const container = document.getElementById("ib-panel-coord");
  if (!container) return;
  const alumnos = await _ibLoadAlumnos(["1IB", "2IB"]);
  if (!alumnos.length) { container.innerHTML = '<div style="color:var(--txt3);padding:16px;font-size:13px;">No hay alumnos IB registrados en este centro.</div>'; return; }
  const ids = alumnos.map(a => a.id);

  const [cas, ee, tok, res] = await Promise.all([
    sb.from("cas_actividades").select("alumno_id,estado").eq("centro_id", ctrId).in("alumno_id", ids),
    sb.from("extended_essay").select("alumno_id,estado,nota").eq("centro_id", ctrId).in("alumno_id", ids),
    sb.from("ib_tok").select("alumno_id,ensayo_estado,ensayo_nota").eq("centro_id", ctrId).in("alumno_id", ids),
    sb.from("ib_resultados").select("alumno_id,prediccion,nota_final").eq("centro_id", ctrId).in("alumno_id", ids),
  ]);
  const casBy = {}, eeBy = {}, tokBy = {}, resBy = {};
  (cas.data || []).forEach(c => { (casBy[c.alumno_id] = casBy[c.alumno_id] || { tot: 0, comp: 0 }); casBy[c.alumno_id].tot++; if (c.estado === "completada") casBy[c.alumno_id].comp++; });
  (ee.data || []).forEach(e => eeBy[e.alumno_id] = e);
  (tok.data || []).forEach(t => tokBy[t.alumno_id] = t);
  (res.data || []).forEach(r => { (resBy[r.alumno_id] = resBy[r.alumno_id] || { p: 0, f: 0 }); resBy[r.alumno_id].p += (r.prediccion || 0); resBy[r.alumno_id].f += (r.nota_final || 0); });

  const n = alumnos.length;
  const eeEntregados = (ee.data || []).filter(e => e.estado === "entregado").length;
  const tokConNota = (tok.data || []).filter(t => t.ensayo_nota).length;

  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px;">
    ${_ibKpi(n, "Alumnos IB")}${_ibKpi(eeEntregados + "/" + n, "EE entregados")}${_ibKpi(tokConNota + "/" + n, "TOK con nota")}
  </div>`;
  html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:var(--srf2);">' +
    ["Alumno", "Grupo", "CAS", "EE", "TOK", "Σ Pred.", "Σ Final", "Core", "Total /45"].map(h => `<th style="text-align:left;padding:9px 10px;font-weight:600;color:var(--txt2);border-bottom:2px solid var(--bdr);white-space:nowrap;">${h}</th>`).join("") +
    "</tr></thead><tbody>";
  alumnos.forEach(a => {
    const c = casBy[a.id] || { tot: 0, comp: 0 }, e = eeBy[a.id] || {}, t = tokBy[a.id] || {}, r = resBy[a.id] || { p: 0, f: 0 };
    const core = _ibCorePoints(t.ensayo_nota, e.nota);
    const coreStr = core == null ? "—" : core === "F" ? '<span style="color:var(--red);font-weight:700;">F</span>' : core;
    const total = (core == null || core === "F") ? (r.p || 0) : (r.p || 0) + core;
    const totalStr = r.p ? (core === "F" ? `<span style="color:var(--red);">${total} ⚠</span>` : `${total}`) : "—";
    html += `<tr style="border-bottom:1px solid var(--bdr);">
      <td style="padding:9px 10px;font-weight:500;color:var(--txt);">${_ibEsc(a.nombre)}</td>
      <td style="padding:9px 10px;color:var(--txt3);">${a.grupo_horario}</td>
      <td style="padding:9px 10px;">${c.comp}/${c.tot || "—"}</td>
      <td style="padding:9px 10px;">${e.nota ? `<strong>${e.nota}</strong>` : (e.estado ? _ibEstadoCorto(e.estado) : "—")}</td>
      <td style="padding:9px 10px;">${t.ensayo_nota ? `<strong>${t.ensayo_nota}</strong>` : (t.ensayo_estado || "—")}</td>
      <td style="padding:9px 10px;font-weight:600;">${r.p || "—"}</td>
      <td style="padding:9px 10px;font-weight:600;color:#1e6b3a;">${r.f || "—"}</td>
      <td style="padding:9px 10px;">${coreStr}</td>
      <td style="padding:9px 10px;font-weight:700;color:var(--ink);">${totalStr}</td></tr>`;
  });
  html += '</tbody></table></div><div style="font-size:11px;color:var(--txt3);margin-top:8px;">Total /45 = Σ predicción (asignaturas) + puntos core (matriz TOK×EE). "F" = condición de no diploma (nota E en TOK o EE).</div>';
  container.innerHTML = html;
}
