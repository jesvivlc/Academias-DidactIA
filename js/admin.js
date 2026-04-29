async function loadAdmin() {
  if (!sb || !ctrId) return;
  await Promise.all([loadInfoCentro(), loadHorarios()]);
  await Promise.all([loadSustituciones(), cargarProfesoresLibresEnSelect()]);
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

async function loadSustituciones() {
  const c = document.getElementById("sust-container");
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:12px;"><span class="spin">⟳</span> Cargando…</div>';
  const { data, error } = await sb.from("sustituciones").select("*").eq("centro_id", ctrId).order("created_at", { ascending: false }).limit(50);
  if (error || !data || !data.length) {
    c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay sustituciones registradas.</div>';
    return;
  }
  c.innerHTML = `<table class="tbl"><thead><tr><th>Fecha</th><th>Tramo</th><th>Grupo</th><th>Ausente</th><th>Sustituto</th><th>Obs.</th></tr></thead><tbody>
    ${data.map(s => `<tr>
      <td>${s.fecha || "—"}</td>
      <td>${s.hora_inicio ? s.hora_inicio.slice(0,5) + "–" + (s.hora_fin||"").slice(0,5) : "—"}</td>
      <td>${s.grupo_horario || "—"}</td>
      <td>${s.profesor_ausente || "—"}</td>
      <td>${s.profesor_sustituto || "—"}</td>
      <td>${s.observaciones || "—"}</td>
    </tr>`).join("")}
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
    fecha: new Date().toISOString().split("T")[0],
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
    msg.textContent = "Error: " + error.message;
    msg.style.color = "var(--red)";
  } else {
    msg.textContent = "✅ Sustitución registrada";
    msg.style.color = "var(--ink)";
    document.getElementById("sust-ausente").value = "";
    document.getElementById("sust-sustituto").value = "";
    document.getElementById("sust-grupo").value = "";
    document.getElementById("sust-obs").value = "";
    await loadSustituciones();
  }
}

async function cargarProfesoresLibresEnSelect() {
  const ahora = new Date();
  const diasNombre = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  const dia = diasNombre[ahora.getDay()];
  const hora = String(ahora.getHours()).padStart(2,"0") + ":" + String(ahora.getMinutes()).padStart(2,"0");
  const { data: todos } = await sb.from("horarios_grupo").select("profesor_nombre").eq("centro_id", ctrId).not("profesor_nombre", "is", null);
  if (!todos) return;
  const todosProfes = [...new Set(todos.map(r => r.profesor_nombre).filter(Boolean))].sort();
  const { data: conClase } = await sb.from("horarios_grupo").select("profesor_nombre").eq("centro_id", ctrId).eq("dia", dia).filter("hora_inicio", "lte", hora + ":00").filter("hora_fin", "gt", hora + ":00");
  const ocupados = new Set((conClase || []).map(r => r.profesor_nombre).filter(Boolean));
  const libres = todosProfes.filter(p => !ocupados.has(p));
  const selSust = document.getElementById("sust-sustituto");
  const selAus = document.getElementById("sust-ausente");
  if (selSust) {
    selSust.innerHTML = '<option value="">Seleccionar profesor libre…</option>' + libres.map(p => `<option value="${p}">${p}</option>`).join("");
  }
  if (selAus) {
    selAus.innerHTML = '<option value="">Seleccionar profesor ausente…</option>' + (ocupados.size ? [...ocupados].sort().map(p => `<option value="${p}">${p}</option>`).join("") : todosProfes.map(p => `<option value="${p}">${p}</option>`).join(""));
  }
}
