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
  if (role === "profesional") {
    document.getElementById("sust-vista-admin").style.display = "none";
    document.getElementById("sust-vista-profesor").style.display = "flex";
    _sustProfesorInit();
    return;
  }

  // Admin / superadmin
  document.getElementById("sust-vista-admin").style.display = "flex";
  document.getElementById("sust-vista-profesor").style.display = "none";

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
    const v = el.value.trim();
    try {
      if (!v) {
        // Campo vaciado: eliminar la fila de Supabase si existía
        if (cache[k]) {
          const { error } = await sb.from("info_centro").delete().eq("id", cache[k].id);
          if (error) throw error;
          ok++;
        }
        continue;
      }
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
  // Sincronizar el banner de aviso en el DOM sin recargar la página
  const bannerEl = document.getElementById("banner-aviso");
  const bannerTxt = document.getElementById("banner-aviso-txt");
  if (bannerEl) {
    const avisoVal = cache.aviso_activo?.datos?.valor || "";
    if (avisoVal) {
      if (bannerTxt) bannerTxt.textContent = avisoVal;
      bannerEl.style.display = "flex";
    } else {
      bannerEl.style.display = "none";
    }
  }
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

  // Actualizar contador en el tab (solo pendientes sin cubrir)
  if (filtro === 'hoy') {
    const tabSust = document.getElementById("tab-sust");
    if (tabSust) {
      const sinCubrir = data ? data.filter(s => !s.cubierta).length : 0;
      tabSust.textContent = sinCubrir > 0 ? `🔄 Sustituciones (${sinCubrir})` : '🔄 Sustituciones';
    }
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
    profesor_sustituto: sustituto || null,
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
  // Usar la fecha del formulario si está disponible (puede ser un día futuro/pasado)
  const fechaFormVal = document.getElementById("sust-fecha")?.value;
  const fechaForm = fechaFormVal ? new Date(fechaFormVal + "T12:00:00") : ahora;
  const dia = diasNombre[fechaForm.getDay()];

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
    let ausentesOpciones = todosProfes;
    if (ausentesOpciones.length === 0) {
      const { data: profData } = await sb.from("profesores")
        .select("nombre").eq("centro_id", ctrId).eq("activo", true).order("nombre");
      ausentesOpciones = (profData || []).map(p => p.nombre).filter(Boolean);
    }
    selAus.innerHTML = '<option value="">Seleccionar profesor ausente…</option>'
      + ausentesOpciones.map(p => '<option value="' + p + '">' + p + '</option>').join("");
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
    await loadSustituciones(sustFiltroActivo);
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

  if (typeof XLSX === "undefined") { alert("La librería de exportación (Excel) no está disponible."); return; }

  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const aoa = [["Fecha","Día","Hora inicio","Hora fin","Tramo","Grupo","Profesor ausente","Profesor sustituto","Observaciones"]];

  data.forEach(s => {
    const fecha = s.fecha || "";
    const fechaObj = fecha ? new Date(fecha + "T12:00:00") : null;
    aoa.push([
      fecha,
      fechaObj ? dias[fechaObj.getDay()] : "",
      (s.hora_inicio || "").slice(0,5),
      (s.hora_fin || "").slice(0,5),
      s.tramo || "",
      s.grupo_horario || "",
      s.profesor_ausente || "",
      s.profesor_sustituto || "",
      s.observaciones || ""
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 },{ wch: 11 },{ wch: 10 },{ wch: 10 },{ wch: 7 },{ wch: 10 },{ wch: 22 },{ wch: 22 },{ wch: 34 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sustituciones");
  XLSX.writeFile(wb, "sustituciones_" + new Date().toISOString().slice(0,10) + ".xlsx");
}

// ── VISTA PROFESOR: NOTIFICACIÓN DE AUSENCIA ──────────────────────────────

async function _sustProfesorInit() {
  const hoy = new Date().toISOString().split("T")[0];
  const fechaEl = document.getElementById("notif-fecha");
  if (fechaEl) fechaEl.value = hoy;

  await _loadTramosNotif();
  await _loadGruposProfesor();
  await loadMisAusenciasNotificadas();
}

async function _loadTramosNotif() {
  const wrap = document.getElementById("notif-tramos-wrap");
  if (!wrap) return;

  const { data } = await sb.from("tramos_centro")
    .select("numero, hora_inicio, hora_fin, nombre, es_descanso")
    .eq("centro_id", ctrId)
    .order("numero");

  const tramosClase = (data || []).filter(t => !t.es_descanso);

  if (tramosClase.length) {
    wrap.innerHTML = tramosClase.map(t => {
      const hi = String(t.hora_inicio || "").slice(0, 5);
      const hf = String(t.hora_fin    || "").slice(0, 5);
      const etiq = t.nombre ? ` — ${t.nombre}` : "";
      return `<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;padding:4px 0;">
        <input type="checkbox" class="notif-tramo-chk" value="${t.numero}"
          style="width:16px;height:16px;cursor:pointer;" />
        <span>Tramo ${t.numero} · ${hi}–${hf}${etiq}</span>
      </label>`;
    }).join("");
  } else {
    // Fallback hardcoded si el centro aún no tiene tramos_centro configurados
    const fallback = [
      [1,"08:50","09:45"],[2,"09:45","10:40"],[3,"10:40","11:35"],
      [4,"12:00","12:55"],[5,"12:55","13:50"],[6,"13:50","14:45"],
      [7,"15:10","16:05"],[8,"16:05","17:00"]
    ];
    wrap.innerHTML = fallback.map(([n,hi,hf]) =>
      `<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;padding:4px 0;">
        <input type="checkbox" class="notif-tramo-chk" value="${n}"
          style="width:16px;height:16px;cursor:pointer;" />
        <span>Tramo ${n} · ${hi}–${hf}</span>
      </label>`
    ).join("");
  }
}

async function _loadGruposProfesor() {
  if (!currentUserName || !sb || !ctrId) return;
  const parte = currentUserName.trim().split(/\s+/).find(p => p.length > 2);
  if (!parte) return;
  const { data } = await sb.from("horarios_grupo")
    .select("grupo_horario")
    .eq("centro_id", ctrId)
    .ilike("profesor_nombre", `%${parte}%`);
  if (!data?.length) return;
  const grupos = [...new Set(data.map(r => r.grupo_horario).filter(Boolean))].sort();
  const el = document.getElementById("notif-grupos");
  if (el && !el.value) el.value = grupos.join(", ");
}

function _sustTipoChange() {
  const tipo = document.querySelector('input[name="notif-tipo"]:checked')?.value;
  const sec = document.getElementById("notif-tramos-section");
  if (sec) sec.style.display = tipo === "tramos" ? "block" : "none";
}

async function notificarAusenciaProfesor() {
  const fecha   = document.getElementById("notif-fecha")?.value;
  const tipo    = document.querySelector('input[name="notif-tipo"]:checked')?.value || "dia";
  const grupos  = document.getElementById("notif-grupos")?.value.trim();
  const instruc = document.getElementById("notif-instrucciones")?.value.trim();
  const msgEl   = document.getElementById("notif-msg");

  if (!fecha) { _sustNotifMsg(msgEl, "Indica la fecha de la ausencia.", "err"); return; }

  let tramosSeleccionados = [];
  if (tipo === "tramos") {
    tramosSeleccionados = [...document.querySelectorAll(".notif-tramo-chk:checked")]
      .map(c => parseInt(c.value));
    if (!tramosSeleccionados.length) {
      _sustNotifMsg(msgEl, "Selecciona al menos un tramo.", "err"); return;
    }
  }

  _sustNotifMsg(msgEl, "⟳ Enviando notificación…", "info");

  // Obtener horas reales de tramos_centro (con fallback hardcoded)
  const { data: tramosData } = await sb.from("tramos_centro")
    .select("numero, hora_inicio, hora_fin")
    .eq("centro_id", ctrId)
    .eq("es_descanso", false)
    .order("numero");

  const tramoMap = {};
  (tramosData || []).forEach(t => { tramoMap[t.numero] = t; });
  const fallbackMap = {
    1:{hora_inicio:"08:50",hora_fin:"09:45"}, 2:{hora_inicio:"09:45",hora_fin:"10:40"},
    3:{hora_inicio:"10:40",hora_fin:"11:35"}, 4:{hora_inicio:"12:00",hora_fin:"12:55"},
    5:{hora_inicio:"12:55",hora_fin:"13:50"}, 6:{hora_inicio:"13:50",hora_fin:"14:45"},
    7:{hora_inicio:"15:10",hora_fin:"16:05"}, 8:{hora_inicio:"16:05",hora_fin:"17:00"}
  };

  const rows = [];
  if (tipo === "dia") {
    rows.push({
      centro_id: ctrId,
      fecha,
      tramo: null,
      hora_inicio: "08:00",
      hora_fin: "17:00",
      grupo_horario: grupos || null,
      profesor_ausente: currentUserName,
      profesor_sustituto: null,
      observaciones: instruc || "(Ausencia todo el día)",
      cubierta: false,
      creado_por: currentUser.id,
    });
  } else {
    for (const n of tramosSeleccionados) {
      const t = tramoMap[n] || fallbackMap[n] || {};
      rows.push({
        centro_id: ctrId,
        fecha,
        tramo: n,
        hora_inicio: t.hora_inicio || null,
        hora_fin:    t.hora_fin    || null,
        grupo_horario: grupos || null,
        profesor_ausente: currentUserName,
        profesor_sustituto: null,
        observaciones: instruc || null,
        cubierta: false,
        creado_por: currentUser.id,
      });
    }
  }

  const { error } = await sb.from("sustituciones").insert(rows);
  if (error) { _sustNotifMsg(msgEl, "Error al guardar: " + error.message, "err"); return; }

  // Notificar al admin por email (fire-and-forget; si falla, el badge lo cubre)
  try {
    fetch(`${SB_URL}/functions/v1/notify-ausencia`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({
        centro_id: ctrId,
        profesor_nombre: currentUserName,
        fecha,
        tipo_ausencia: tipo === "dia" ? "todo el día" : `tramos ${tramosSeleccionados.join(", ")}`,
        grupos: grupos || "—",
        instrucciones: instruc || "Sin instrucciones específicas.",
      }),
    });
  } catch (_) {}

  _sustNotifMsg(msgEl, "✅ Jefatura ha sido notificada. Puedes ver el estado en tu historial.", "ok");

  // Limpiar formulario (mantener fecha)
  document.getElementById("notif-grupos").value = "";
  document.getElementById("notif-instrucciones").value = "";
  document.querySelectorAll(".notif-tramo-chk").forEach(c => { c.checked = false; });
  const radioDay = document.querySelector('input[name="notif-tipo"][value="dia"]');
  if (radioDay) { radioDay.checked = true; _sustTipoChange(); }

  await loadMisAusenciasNotificadas();
}

function _sustNotifMsg(el, txt, tipo) {
  if (!el) return;
  if (tipo === "err") {
    el.style.cssText = "display:block;color:var(--red);font-size:13px;";
  } else if (tipo === "ok") {
    el.style.cssText = "display:block;background:#e6f4ea;color:#1e6b3a;border-radius:var(--r-sm);padding:8px 12px;font-size:13px;";
  } else {
    el.style.cssText = "display:block;color:var(--txt2);font-size:13px;";
  }
  el.textContent = txt;
}

async function loadMisAusenciasNotificadas() {
  const c = document.getElementById("mis-ausencias-container");
  if (!c) return;
  c.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:8px 0;">Cargando…</div>';

  const { data, error } = await sb.from("sustituciones")
    .select("fecha, tramo, hora_inicio, hora_fin, grupo_horario, observaciones, cubierta, profesor_sustituto")
    .eq("centro_id", ctrId)
    .eq("profesor_ausente", currentUserName)
    .order("fecha", { ascending: false })
    .limit(30);

  if (error || !data?.length) {
    c.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:8px 0;">No tienes ausencias notificadas aún.</div>';
    return;
  }

  c.innerHTML = `<table class="tbl" style="margin-top:8px;">
    <thead><tr>
      <th>Fecha</th><th>Tramo</th><th>Grupo</th>
      <th>Instrucciones enviadas</th><th>Estado</th><th>Sustituto</th>
    </tr></thead>
    <tbody>${data.map(s => {
      const estado = s.cubierta
        ? '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 10px;font-size:11px;white-space:nowrap;">✓ Cubierta</span>'
        : '<span style="background:#fce8e6;color:#a50e0e;border-radius:12px;padding:2px 10px;font-size:11px;white-space:nowrap;">⏳ Pendiente</span>';
      const tramoTxt = s.tramo ? `T${s.tramo}` : "Todo el día";
      const hi = String(s.hora_inicio || "").slice(0, 5);
      const hf = String(s.hora_fin    || "").slice(0, 5);
      const horas = hi && hf && s.tramo ? `<br><span style="font-size:11px;color:var(--txt3);">${hi}–${hf}</span>` : "";
      const instrucTxt = s.observaciones
        ? `<span title="${s.observaciones.replace(/"/g,"&quot;")}" style="cursor:help;">
             ${s.observaciones.length > 60 ? s.observaciones.slice(0, 60) + "…" : s.observaciones}
           </span>`
        : '<span style="color:var(--txt3);">—</span>';
      return `<tr>
        <td style="white-space:nowrap;">${s.fecha || "—"}</td>
        <td>${tramoTxt}${horas}</td>
        <td>${s.grupo_horario || "—"}</td>
        <td style="font-size:12px;color:var(--txt2);max-width:220px;">${instrucTxt}</td>
        <td>${estado}</td>
        <td style="font-size:12px;">${s.profesor_sustituto || '<span style="color:var(--txt3);">Sin asignar</span>'}</td>
      </tr>`;
    }).join("")}
    </tbody>
  </table>`;
}
