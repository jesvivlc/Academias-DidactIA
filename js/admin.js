let sustFiltroActivo = 'hoy';

function detectarTramoActual() {
  const ahora = new Date();
  const hhmm = ahora.getHours() * 100 + ahora.getMinutes();
  if (hhmm >= 850  && hhmm < 945)  return 1;
  if (hhmm >= 945  && hhmm < 1040) return 2;
  if (hhmm >= 1040 && hhmm < 1135) return 3;
  if (hhmm >= 1200 && hhmm < 1255) return 4;
  if (hhmm >= 1255 && hhmm < 1350) return 5;
  if (hhmm >= 1350 && hhmm < 1445) return 6;
  if (hhmm >= 1510 && hhmm < 1605) return 7;
  if (hhmm >= 1605 && hhmm < 1700) return 8;
  return 1;
}

function initSustPanel() {
  const hoy = new Date().toISOString().split("T")[0];
  const fechaInput = document.getElementById("sust-fecha");
  if (fechaInput) fechaInput.value = hoy;
  const tramo = detectarTramoActual();
  const tramoSel = document.getElementById("sust-tramo");
  if (tramoSel) tramoSel.value = tramo;
  cargarProfesoresLibresEnSelect(tramo);
  loadSustituciones('hoy');
  if (typeof loadBolsaGuardias === "function") loadBolsaGuardias();
}

async function loadAdmin() {
  if (!sb || !ctrId) return;
  await Promise.all([loadInfoCentro(), loadHorarios()]);
}

async function loadInfoCentro() {
  const c = document.getElementById("info-fields");
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:12px;"><span class="spin">⟳</span> Cargando de Supabase…</div>';
  try {
    const { data, error } = await sb.from("info_centro").select("*").eq("centro_id", ctrId);
    if (error) throw error;
    cache = {}; data.forEach(r => { cache[r.nombre_config] = r; });
    document.getElementById("s-info").textContent = data.length;
    const fields = [
      { k:"horario_comedor",   l:"Horario del comedor",              def:"todos" },
      { k:"proxima_reunion",   l:"Próxima reunión de familias",      def:"todos" },
      { k:"telefono",          l:"Teléfono y horario de secretaría", def:"todos" },
      { k:"aviso_activo",      l:"Aviso importante activo",          def:"todos",         ta:true },
      { k:"extraescolares",    l:"Actividades extraescolares",       def:"todos",         ta:true },
      { k:"menu_semanal",      l:"Menú semanal",                     def:"todos",         ta:true },
      { k:"claustro",          l:"Próximo claustro",                 def:"profesional" },
      { k:"solicitud_materiales", l:"Solicitud de materiales",       def:"profesional",   ta:true },
      { k:"incidencias_info",  l:"Info sobre incidencias",           def:"profesional",   ta:true },
      { k:"informacion_general", l:"Información general del centro (contexto para el chatbot)", def:"todos", ta:true },
    ];
    const visOpts = `<option value="todos">👥 Todos</option><option value="familia">👨‍👩‍👧 Solo familias</option><option value="profesional">👩‍🏫 Solo profesionales</option>`;
    c.innerHTML = fields.map(f => {
      const v = cache[f.k]?.datos?.valor || "";
      const vis = cache[f.k]?.visible_para || f.def;
      const visSelect = `<select class="fi" id="vis-${f.k}" style="width:auto;font-size:11px;padding:4px 8px;">${visOpts}</select>`;
      const input = f.ta
        ? `<textarea class="fa" id="f-${f.k}" placeholder="Sin datos aún…">${v}</textarea>`
        : `<input class="fi" id="f-${f.k}" value="${v.replace(/"/g,"&quot;")}" placeholder="Sin datos aún…" />`;
      return `<div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <label class="lbl" style="margin:0;">${f.l}</label>
          <select class="fi" id="vis-${f.k}" style="width:auto;font-size:11px;padding:4px 8px;height:auto;">
            <option value="todos" ${vis==="todos"?"selected":""}>👥 Todos</option>
            <option value="familia" ${vis==="familia"?"selected":""}>👨‍👩‍👧 Solo familias</option>
            <option value="profesional" ${vis==="profesional"?"selected":""}>👩‍🏫 Solo profesionales</option>
          </select>
        </div>
        ${input}
      </div>`;
    }).join("");
  } catch(e) { c.innerHTML = `<div style="color:var(--red);font-size:13px;">Error: ${e.message}</div>`; }
}

async function saveInfo() {
  const msg = document.getElementById("save-msg");
  msg.textContent = "⟳ Guardando…"; msg.style.display = "block"; msg.style.color = "var(--txt2)";
  const keys = ["horario_comedor","proxima_reunion","telefono","aviso_activo","extraescolares","menu_semanal","claustro","solicitud_materiales","incidencias_info","informacion_general"];
  let ok = 0, err = 0;
  for (const k of keys) {
    const el = document.getElementById("f-"+k); if (!el) continue;
    const v = el.value.trim(); if (!v) continue;
    try {
      if (cache[k]) {
        const vp = document.getElementById("vis-"+k)?.value || "todos";
        const { error } = await sb.from("info_centro").update({ datos:{valor:v}, visible_para:vp, actualizado_el:new Date().toISOString() }).eq("id", cache[k].id);
        if (error) throw error;
      } else {
        const vp = document.getElementById("vis-"+k)?.value || "todos";
        const { error } = await sb.from("info_centro").insert({ centro_id:ctrId, nombre_config:k, datos:{valor:v}, visible_para:vp, actualizado_el:new Date().toISOString() });
        if (error) throw error;
      }
      ok++;
    } catch(e) { err++; }
  }
  msg.textContent = err === 0 ? `✅ ${ok} campos guardados en Supabase` : `⚠️ ${ok} guardados, ${err} errores`;
  msg.style.color = err === 0 ? "var(--ink)" : "var(--amb)";
  await loadInfoCentro();
}

async function loadHorarios() {
  const c = document.getElementById("hor-container");
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:12px;"><span class="spin">⟳</span> Cargando…</div>';
  try {
    const { data, error } = await sb.from("horarios").select("*").eq("centro_id", ctrId).order("dia").order("hora");
    if (error) throw error;
    document.getElementById("s-hor").textContent = data.length;
    if (!data.length) { c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay horarios registrados para este centro.</div>'; return; }
    c.innerHTML = `<table class="tbl"><thead><tr><th>Día</th><th>Hora</th><th>Profesor</th><th>Actividad</th></tr></thead><tbody>
      ${data.map(h=>`<tr><td>${h.dia||"—"}</td><td>${h.hora||"—"}</td><td>${h.profesor||"—"}</td><td>${h.actividad||"—"}</td></tr>`).join("")}
    </tbody></table>`;
  } catch(e) { c.innerHTML = `<div style="color:var(--red);font-size:13px;">Error: ${e.message}</div>`; }
}

async function loadSustituciones(filtro) {
  if (!filtro) filtro = 'hoy';
  sustFiltroActivo = filtro;

  // Estado visual de botones de filtro
  ['hoy', 'semana', 'todo'].forEach(k => {
    const btn = document.getElementById('sust-btn-' + k);
    if (!btn) return;
    btn.style.background   = k === filtro ? 'var(--ink)' : 'white';
    btn.style.color        = k === filtro ? '#fff' : '';
    btn.style.borderColor  = k === filtro ? 'var(--ink)' : '#e0e0e0';
  });

  const c = document.getElementById("sust-container");
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:12px;"><span class="spin">⟳</span> Cargando…</div>';

  const hoy = new Date().toISOString().split("T")[0];

  let query = sb.from("sustituciones").select("*").eq("centro_id", ctrId);
  if (filtro === 'hoy') {
    query = query.eq("fecha", hoy).order("hora_inicio", { ascending: true });
  } else if (filtro === 'semana') {
    const hace6 = new Date(); hace6.setDate(hace6.getDate() - 6);
    query = query.gte("fecha", hace6.toISOString().split("T")[0]).lte("fecha", hoy)
      .order("fecha", { ascending: false }).order("hora_inicio", { ascending: true });
  } else {
    query = query.order("fecha", { ascending: false }).order("hora_inicio", { ascending: true }).limit(50);
  }

  const { data, error } = await query;

  // Actualizar contador en el tab
  if (filtro === 'hoy') {
    const tabSust = document.getElementById("tab-sust");
    if (tabSust) tabSust.textContent = (data && data.length) ? `🔄 Sustituciones (${data.length})` : '🔄 Sustituciones';
  }

  if (error || !data || !data.length) {
    c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay sustituciones registradas.</div>';
    return;
  }
  c.innerHTML = `<table class="tbl"><thead><tr><th>Fecha</th><th>Tramo</th><th>Grupo</th><th>Ausente</th><th>Sustituto</th><th>Obs.</th><th>Estado</th><th></th></tr></thead><tbody>
    ${data.map(s => {
      const cubierta = s.cubierta
        ? `<button onclick="toggleCubierta('${s.id}',true)" style="background:#e6f4ea;color:#1e6b3a;border:none;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;cursor:pointer;">✓ Cubierta</button>`
        : `<button onclick="toggleCubierta('${s.id}',false)" style="background:#fce8e6;color:#a50e0e;border:none;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;cursor:pointer;">⚠ Pendiente</button>`;
      return `<tr>
        <td>${s.fecha || "—"}</td>
        <td>${s.hora_inicio ? s.hora_inicio.slice(0,5) + "–" + (s.hora_fin||"").slice(0,5) : "—"}</td>
        <td>${s.grupo_horario || "—"}</td>
        <td>${s.profesor_ausente || "—"}</td>
        <td>${s.profesor_sustituto || "—"}</td>
        <td>${s.observaciones || "—"}</td>
        <td>${cubierta}</td>
        <td><button onclick="eliminarSustitucion('${s.id}')" style="background:none;border:none;cursor:pointer;color:#a50e0e;font-size:12px;padding:4px 8px;border-radius:8px;" title="Eliminar">✕</button></td>
      </tr>`;
    }).join("")}
  </tbody></table>`;
}

async function registrarSustitucion() {
  const ausente = document.getElementById("sust-ausente").value.trim();
  const sustituto = document.getElementById("sust-sustituto").value.trim();
  const grupo = document.getElementById("sust-grupo").value.trim();
  const tramo = document.getElementById("sust-tramo").value;
  const obs = document.getElementById("sust-obs").value.trim();
  const msg = document.getElementById("sust-msg");

  if (!ausente || !sustituto) {
    msg.textContent = "Indica el profesor ausente y el sustituto.";
    msg.style.color = "var(--red)";
    msg.style.display = "block";
    return;
  }

  const tramoData = {
    1: { hi: "08:50", hf: "09:45" }, 2: { hi: "09:45", hf: "10:40" },
    3: { hi: "10:40", hf: "11:35" }, 4: { hi: "12:00", hf: "12:55" },
    5: { hi: "12:55", hf: "13:50" }, 6: { hi: "13:50", hf: "14:45" },
    7: { hi: "15:10", hf: "16:05" }, 8: { hi: "16:05", hf: "17:00" }
  };

  const t = tramoData[parseInt(tramo)] || { hi: "00:00", hf: "00:00" };
  msg.textContent = "⟳ Guardando…";
  msg.style.color = "var(--txt2)";
  msg.style.display = "block";

  const { error } = await sb.from("sustituciones").insert({
    centro_id: ctrId,
    fecha: document.getElementById("sust-fecha")?.value || new Date().toISOString().split("T")[0],
    hora_inicio: t.hi,
    hora_fin: t.hf,
    tramo: parseInt(tramo),
    grupo_horario: grupo || null,
    profesor_ausente: ausente,
    profesor_sustituto: sustituto,
    observaciones: obs || null,
    creado_por: currentUser.id
  });

  if (error) {
    msg.style.cssText = "display:block;color:var(--red);font-size:13px;padding:8px 12px;";
    msg.textContent = "Error: " + error.message;
  } else {
    msg.style.cssText = "display:block;background:#e6f4ea;color:#1e6b3a;border-radius:var(--r-sm);padding:8px 12px;font-size:13px;";
    msg.textContent = "✅ Sustitución registrada correctamente";
    const _fecha = document.getElementById("sust-fecha")?.value || new Date().toISOString().split("T")[0];
    document.getElementById("sust-ausente").value = "";
    document.getElementById("sust-sustituto").value = "";
    document.getElementById("sust-grupo").value = "";
    document.getElementById("sust-obs").value = "";
    // Registrar guardia realizada para equidad
    if (typeof registrarGuardiaEnBD === "function") {
      registrarGuardiaEnBD(sustituto, _fecha, parseInt(tramo), grupo || null);
    }
    setTimeout(() => { msg.style.display = "none"; }, 3000);
    await loadSustituciones(sustFiltroActivo);
    if (typeof loadBolsaGuardias === "function") loadBolsaGuardias();
  }
}

async function cargarProfesoresLibresEnSelect(tramoOverride) {
  const tramoData = {
    1: { hi: "08:50", hf: "09:45" }, 2: { hi: "09:45", hf: "10:40" },
    3: { hi: "10:40", hf: "11:35" }, 4: { hi: "12:00", hf: "12:55" },
    5: { hi: "12:55", hf: "13:50" }, 6: { hi: "13:50", hf: "14:45" },
    7: { hi: "15:10", hf: "16:05" }, 8: { hi: "16:05", hf: "17:00" }
  };

  const ahora = new Date();
  const diasNombre = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  const dia = diasNombre[ahora.getDay()];

  let horaRef = String(ahora.getHours()).padStart(2,"0") + ":" + String(ahora.getMinutes()).padStart(2,"0");
  if (tramoOverride && tramoData[tramoOverride]) {
    horaRef = tramoData[tramoOverride].hi;
  }

  const { data: todos } = await sb.from("horarios_grupo").select("profesor_nombre").eq("centro_id", ctrId).not("profesor_nombre", "is", null);
  if (!todos) return;
  const todosProfes = [...new Set(todos.map(r => r.profesor_nombre).filter(Boolean))].sort();

  const { data: conClase } = await sb.from("horarios_grupo").select("profesor_nombre").eq("centro_id", ctrId).eq("dia", dia)
    .filter("hora_inicio", "lte", horaRef + ":00")
    .filter("hora_fin", "gt", horaRef + ":00");

  const ocupados = new Set((conClase || []).map(r => r.profesor_nombre).filter(Boolean));
  const libres = todosProfes.filter(p => !ocupados.has(p));
  const ocupadosList = todosProfes.filter(p => ocupados.has(p));

  const diaActual = dia;
  const horaRefGuardia = tramoOverride && tramoData[tramoOverride] ? tramoData[tramoOverride].hi : horaRef;

  const { data: conGuardia } = await sb.from("horarios_grupo")
    .select("profesor_nombre")
    .eq("centro_id", ctrId)
    .eq("dia", diaActual)
    .ilike("actividad", "%guardia%")
    .filter("hora_inicio", "lte", horaRefGuardia + ":00")
    .filter("hora_fin", "gt", horaRefGuardia + ":00");

  const profesGuardia = new Set((conGuardia || []).map(r => r.profesor_nombre).filter(Boolean));
  const disponibles = profesGuardia.size > 0 ? libres.filter(p => profesGuardia.has(p)) : libres;

  // Equity sorting: order by fewest guards done this trimester
  let guardCounts = {};
  if (typeof getGuardiaCountsByName === "function") {
    try { guardCounts = await getGuardiaCountsByName(); } catch(e) {}
  }
  const disponiblesOrdenados = disponibles
    .map(p => ({ n: p, c: guardCounts[p] || 0 }))
    .sort((a, b) => a.c - b.c || a.n.localeCompare(b.n, "es"));

  const selSust = document.getElementById("sust-sustituto");
  const selAus = document.getElementById("sust-ausente");
  if (selSust) {
    const etiqueta = profesGuardia.size > 0 ? "Seleccionar de guardia (por equidad)…" : "Seleccionar libre (por equidad)…";
    selSust.innerHTML = '<option value="">' + etiqueta + '</option>'
      + disponiblesOrdenados.map(p => '<option value="' + p.n + '">' + p.n + ' (' + p.c + ' g.)</option>').join("");
  }
  if (selAus) {
    selAus.innerHTML = '<option value="">Seleccionar profesor ausente…</option>'
      + ocupadosList.map(p => '<option value="' + p + '">' + p + '</option>').join("");
  }
}

async function toggleCubierta(id, estadoActual) {
  const { error } = await sb.from("sustituciones").update({ cubierta: !estadoActual }).eq("id", id);
  if (error) {
    alert("Error al actualizar: " + error.message);
  } else {
    await loadSustituciones(sustFiltroActivo);
  }
}

async function eliminarSustitucion(id) {
  if (!confirm("¿Eliminar esta sustitución?")) return;
  const { error } = await sb.from("sustituciones").delete().eq("id", id);
  if (error) {
    alert("Error al eliminar: " + error.message);
  } else {
    await loadSustituciones();
  }
}

async function exportarSustituciones() {
  const { data, error } = await sb.from("sustituciones")
    .select("*")
    .eq("centro_id", ctrId)
    .order("fecha", { ascending: false })
    .order("hora_inicio", { ascending: true });

  if (error || !data || !data.length) {
    alert("No hay sustituciones registradas para exportar.");
    return;
  }

  const cabecera = ["Fecha","Día","Hora inicio","Hora fin","Tramo","Grupo","Profesor ausente","Profesor sustituto","Observaciones"];

  const filas = data.map(s => {
    const fecha = s.fecha || "";
    const fechaObj = fecha ? new Date(fecha) : null;
    const diasSemana = fechaObj ? ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][fechaObj.getDay()] : "";
    return [
      fecha,
      diasSemana,
      (s.hora_inicio || "").slice(0,5),
      (s.hora_fin || "").slice(0,5),
      s.tramo || "",
      s.grupo_horario || "",
      s.profesor_ausente || "",
      s.profesor_sustituto || "",
      s.observaciones || ""
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",");
  });

  const csv = "﻿" + cabecera.join(",") + "\n" + filas.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sustituciones_" + new Date().toISOString().slice(0,10) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
