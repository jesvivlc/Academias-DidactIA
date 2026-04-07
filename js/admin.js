async function loadAdmin() { if (!sb || !ctrId) return; await Promise.all([loadInfoCentro(), loadHorarios()]); }

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
