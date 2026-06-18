let sustFiltroActivo = 'hoy';

// Cache de tramos del centro activo (invalida automáticamente al cambiar ctrId)
let _tramosCache = null;
let _tramosCacheCtrId = null;
async function _getTramosData() {
  if (_tramosCache && _tramosCacheCtrId === ctrId) return _tramosCache;
  const { data } = await sb.from("tramos_centro")
    .select("numero,hora_inicio,hora_fin")
    .eq("centro_id", ctrId)
    .eq("es_descanso", false)
    .order("numero");
  _tramosCache = {};
  _tramosCacheCtrId = ctrId;
  (data || []).forEach(t => {
    _tramosCache[t.numero] = {
      hi: String(t.hora_inicio || "").slice(0, 5),
      hf: String(t.hora_fin    || "").slice(0, 5)
    };
  });
  return _tramosCache;
}

async function detectarTramoActual() {
  const tm = await _getTramosData();
  const ahora = new Date();
  const hhmm = ahora.getHours() * 100 + ahora.getMinutes();
  const ordenados = Object.entries(tm)
    .map(([n, t]) => ({ n: parseInt(n), hi: t.hi, hf: t.hf }))
    .sort((a, b) => a.n - b.n);
  for (const { n, hi, hf } of ordenados) {
    const [hh1, mm1] = hi.split(":").map(Number);
    const [hh2, mm2] = hf.split(":").map(Number);
    if (hhmm >= hh1 * 100 + mm1 && hhmm < hh2 * 100 + mm2) return n;
  }
  return ordenados[0]?.n || 1;
}

async function initSustPanel() {
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

  // Repoblar selector de tramos con los del centro activo
  const tm = await _getTramosData();
  const tramoSel = document.getElementById("sust-tramo");
  if (tramoSel && Object.keys(tm).length) {
    tramoSel.innerHTML = Object.entries(tm)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([n, t]) => `<option value="${n}">${n} — ${t.hi} a ${t.hf}</option>`)
      .join("");
  }

  const tramo = await detectarTramoActual();
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
  window._sustData = data;
  c.innerHTML = `<table class="tbl"><thead><tr><th>Fecha</th><th>Tramo</th><th>Grupo</th><th>Ausente</th><th>Sustituto</th><th>Instrucciones</th><th>Justificante</th><th>Estado</th><th></th></tr></thead><tbody>
    ${data.map(s => {
      const cubierta = s.cubierta
        ? `<button onclick="toggleCubierta('${s.id}',true)" style="background:#e6f4ea;color:#1e6b3a;border:none;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;cursor:pointer;">✓ Cubierta</button>`
        : `<button onclick="toggleCubierta('${s.id}',false)" style="background:#fce8e6;color:#a50e0e;border:none;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;cursor:pointer;">⚠ Pendiente</button>`;
      const instrText = _instrLimpias(s.observaciones);
      const justPath  = _justPath(s.observaciones);
      const justCell  = justPath
        ? `<button onclick="window._descargarJustificante('${justPath.replace(/'/g,"\\'")}')" style="background:#e8f0fe;color:#1a56db;border:none;border-radius:12px;padding:2px 10px;font-size:11px;cursor:pointer;">📎 Ver</button>`
        : '<span style="color:var(--txt3);font-size:11px;">—</span>';
      const sustCell = s.profesor_sustituto
        ? s.profesor_sustituto
        : `<button onclick="window._sustAsignar('${s.id}')" style="background:#e8f0fe;color:#1a56db;border:none;border-radius:12px;padding:3px 12px;font-size:11px;font-weight:600;cursor:pointer;">+ Asignar</button>`;
      return `<tr>
        <td style="white-space:nowrap;">${s.fecha || "—"}</td>
        <td>${s.hora_inicio ? s.hora_inicio.slice(0,5) + "–" + (s.hora_fin||"").slice(0,5) : "—"}</td>
        <td>${s.grupo_horario || "—"}</td>
        <td>${s.profesor_ausente || "—"}</td>
        <td>${sustCell}</td>
        <td style="font-size:12px;color:var(--txt2);max-width:180px;" title="${(instrText||"").replace(/"/g,"&quot;")}">${instrText ? (instrText.length>60?instrText.slice(0,60)+"…":instrText) : "—"}</td>
        <td>${justCell}</td>
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

  const _td = await _getTramosData();
  const t = _td[parseInt(tramo)] || { hi: "00:00", hf: "00:00" };
  msg.textContent = "⟳ Guardando…";
  msg.style.color = "var(--txt2)";
  msg.style.display = "block";

  const { data: inserted, error } = await sb.from("sustituciones").insert({
    centro_id: ctrId,
    fecha: document.getElementById("sust-fecha")?.value || new Date().toISOString().split("T")[0],
    hora_inicio: t.hi,
    hora_fin: t.hf,
    tramo: parseInt(tramo),
    grupo_horario: grupo || null,
    profesor_ausente: ausente,
    profesor_sustituto: sustituto || null,
    observaciones: obs || null,
    cubierta: false,
    creado_por: currentUser.id
  }).select("id").single();

  if (error) {
    msg.style.cssText = "display:block;color:var(--red);font-size:13px;padding:8px 12px;";
    msg.textContent = "Error: " + error.message;
  } else {
    msg.style.cssText = "display:block;background:#e6f4ea;color:#1e6b3a;border-radius:var(--r-sm);padding:8px 12px;font-size:13px;";
    msg.textContent = "✅ Sustitución registrada correctamente";
    // Notificar a ausente y sustituto por email + push (fire-and-forget)
    if (inserted?.id && sustituto) {
      fetch(`${SB_URL}/functions/v1/notify-sustitucion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ sustitucion_id: inserted.id, evento: "asignacion" }),
      }).catch(() => {});
      // Push al sustituto si tiene cuenta en el sistema
      (async () => {
        try {
          const tramoParsed = parseInt(tramo) || null;
          const fechaVal = document.getElementById("sust-fecha")?.value || new Date().toISOString().split("T")[0];
          // Buscar user_id del sustituto por nombre
          const { data: perfil } = await sb.from("profiles")
            .select("user_id").eq("centro_id", ctrId)
            .ilike("full_name", `%${sustituto.trim().split(/\s+/)[0]}%`).limit(1);
          const sustUserId = perfil?.[0]?.user_id;
          if (sustUserId) {
            fetch(`${SB_URL}/functions/v1/send-push`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
              body: JSON.stringify({
                user_ids: [sustUserId],
                title: "📋 Guardia asignada",
                body: `Tramo ${tramoParsed || "—"} · Grupo ${grupo || "—"} · ${fechaVal}`,
                tag: "guardia",
              }),
            }).catch(() => {});
          }
        } catch(_) {}
      })();
    }
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

// ── AGENTE: buscar profesor libre (EF agent-sustituciones) ──
// Lee fecha+tramo del formulario y llama a la EF con el JWT del usuario.
// No modifica registrarSustitucion ni initSustPanel.
async function buscarProfesorLibreAgente() {
  const btn = document.getElementById("agent-buscar-btn");
  const out = document.getElementById("agent-result");
  if (!out) return;

  const fecha = document.getElementById("sust-fecha")?.value;
  const tramo = document.getElementById("sust-tramo")?.value;

  const _mostrar = (html) => { out.innerHTML = html; out.style.display = "block"; };
  const _error = (txt) =>
    _mostrar('<div style="margin-top:10px;color:var(--danger,#c0392b);font-size:13px;">' + txt + '</div>');

  if (!fecha) { _error("Selecciona una fecha primero."); return; }
  if (!tramo) { _error("Selecciona un tramo primero."); return; }

  const _label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Buscando…"; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) { _error("Sesión no válida. Vuelve a iniciar sesión."); return; }

    const res = await fetch(`${SB_URL}/functions/v1/agent-sustituciones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({ centro_id: ctrId, fecha, tramo: parseInt(tramo, 10) }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      _error("Error: " + (data.error || `el agente respondió ${res.status}`));
      return;
    }

    const content = data.content || "Sin respuesta del agente.";
    _mostrar(
      '<div style="margin-top:10px;background:var(--paper-2);border:1px solid var(--line);' +
      'border-radius:var(--r-sm);padding:12px 14px;font-size:13px;color:var(--txt);white-space:pre-wrap;">' +
      '<div style="font-size:11px;color:var(--txt3);margin-bottom:6px;">🤖 Agente de sustituciones</div>' +
      content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
      '</div>'
    );
  } catch (e) {
    _error("Error de conexión con el agente. Inténtalo de nuevo.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _label || "🤖 Buscar profesor libre"; }
  }
}

// Normaliza un nombre de profesor para comparar/deduplicar: mayúsculas, sin
// tildes, sin comas (Buñol tiene "APELLIDOS NOMBRE" y "APELLIDOS, NOMBRE" como
// dos variantes del MISMO profesor) y espacios colapsados.
function _sustNombreNorm(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/,/g, " ").replace(/\s+/g, " ").trim();
}
// Devuelve un Map normKey → nombre a mostrar (prefiere la variante SIN coma).
function _sustDedupeNombres(arr) {
  const m = new Map();
  (arr || []).forEach(n => {
    if (!n) return;
    const k = _sustNombreNorm(n);
    const prev = m.get(k);
    if (!prev || (prev.includes(",") && !n.includes(","))) m.set(k, n);
  });
  return m;
}

// ¿Una actividad del horario es una GUARDIA? Acepta cualquier grafía: "Guardia",
// "Guàrdia" (valenciano), "Guardia de pati/biblioteca", "Vigilància", "G", "GD"…
// (insensible a tildes y mayúsculas).
function _sustEsGuardia(act) {
  const n = String(act || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return n.indexOf("guardia") >= 0 || n.indexOf("vigilanc") >= 0
      || n === "g" || n === "gd" || n === "g." || n === "guar";
}

// Tokens significativos (len>2) normalizados de un nombre.
function _sustTokens(name) { return _sustNombreNorm(name).split(" ").filter(t => t.length > 2); }
// ¿El nombre "suelto" (p.ej. profiles.full_name "Bruno Sánchez") corresponde a un
// nombre de horario ("SÁNCHEZ GONZÁLEZ BRUNO")? True si TODOS los tokens del suelto
// aparecen en el del horario (tolera orden invertido, tildes, comas, apellidos extra).
function _sustNombreCoincide(loose, horario) {
  const lt = _sustTokens(loose);
  if (!lt.length) return false;
  const ht = new Set(_sustTokens(horario));
  return lt.every(t => ht.has(t));
}
// De una lista de nombres de horario, los que corresponden al nombre suelto (deduplicados).
function _sustHorarioNombresDe(loose, horarioNombres) {
  const map = _sustDedupeNombres((horarioNombres || []).filter(n => _sustNombreCoincide(loose, n)));
  return [...map.values()];
}

// Núcleo reutilizable: profesores libres (y de guardia) para una fecha + hora,
// deduplicados por nombre normalizado y ordenados por equidad de guardias.
// Excluye a los profesores que ESTÁN ausentes ese día/tramo (no se pueden sugerir).
async function _sustCalcularLibres(fecha, horaRefRaw, excluirExtra) {
  const _ca = typeof cursoActivo !== "undefined" ? cursoActivo : "2025-26";
  const diasNombre = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  const dia = diasNombre[new Date(fecha + "T12:00:00").getDay()];
  const horaRef = String(horaRefRaw || "00:00").slice(0, 5);
  const horaSql = horaRef + ":00";

  const { data: todos } = await sb.from("horarios_grupo").select("profesor_nombre")
    .eq("centro_id", ctrId).eq("curso_escolar", _ca).not("profesor_nombre", "is", null);
  const todosMap = _sustDedupeNombres((todos || []).map(r => r.profesor_nombre));

  // Una sola consulta del tramo con la actividad → clasificar en JS:
  // - GUARDIA  → el profesor está de guardia (DISPONIBLE para sustituir, prioritario)
  // - cualquier otra (asignatura) → ocupado dando clase
  const { data: enSlot } = await sb.from("horarios_grupo").select("profesor_nombre,actividad_nombre")
    .eq("centro_id", ctrId).eq("curso_escolar", _ca).eq("dia", dia)
    .filter("hora_inicio", "lte", horaSql).filter("hora_fin", "gt", horaSql);
  const ocupadosKeys = new Set();
  const guardiaKeys = new Set();
  (enSlot || []).forEach(r => {
    const k = _sustNombreNorm(r.profesor_nombre);
    if (!k) return;
    if (_sustEsGuardia(r.actividad_nombre)) guardiaKeys.add(k);
    else ocupadosKeys.add(k);
  });
  // Si un profe tiene clase y guardia en el mismo tramo (dato inconsistente), prevalece guardia.
  guardiaKeys.forEach(k => ocupadosKeys.delete(k));

  // Profesores que ESE día están ausentes en un tramo que solapa esta hora → excluir.
  const ausentesKeys = new Set();
  try {
    const { data: aus } = await sb.from("sustituciones")
      .select("profesor_ausente,hora_inicio,hora_fin,tramo")
      .eq("centro_id", ctrId).eq("fecha", fecha);
    (aus || []).forEach(s => {
      if (!s.profesor_ausente) return;
      const hi = (s.hora_inicio || "").slice(0, 8), hf = (s.hora_fin || "").slice(0, 8);
      // solapa si la franja cubre horaRef, o si la fila es de día completo (sin tramo)
      const solapa = (!s.tramo) || (hi && hf && hi <= horaSql && hf > horaSql);
      if (solapa) {
        // El nombre del ausente puede venir en formato "suelto"; excluir todas sus variantes de horario
        _sustHorarioNombresDe(s.profesor_ausente, [...todosMap.values()]).forEach(n => ausentesKeys.add(_sustNombreNorm(n)));
        ausentesKeys.add(_sustNombreNorm(s.profesor_ausente));
      }
    });
  } catch (e) {}
  (excluirExtra || []).forEach(n => {
    _sustHorarioNombresDe(n, [...todosMap.values()]).forEach(x => ausentesKeys.add(_sustNombreNorm(x)));
    ausentesKeys.add(_sustNombreNorm(n));
  });

  let guardCounts = {};
  if (typeof getGuardiaCountsByName === "function") { try { guardCounts = await getGuardiaCountsByName(); } catch (e) {} }
  const countNorm = {};
  Object.keys(guardCounts || {}).forEach(n => { const k = _sustNombreNorm(n); countNorm[k] = (countNorm[k] || 0) + (guardCounts[n] || 0); });

  // Disponibles = no dan clase ni están ausentes. Se separan en:
  //  · guardia → asignados a guardia ese tramo (prioritarios)
  //  · libres  → tienen hueco (ni clase ni guardia)
  const dispKeys = [...todosMap.keys()].filter(k => !ocupadosKeys.has(k) && !ausentesKeys.has(k));
  const _mk = (k) => ({ nombre: todosMap.get(k), carga: countNorm[k] || 0 });
  const _byEquidad = (a, b) => a.carga - b.carga || a.nombre.localeCompare(b.nombre, "es");
  const guardia = dispKeys.filter(k => guardiaKeys.has(k)).map(_mk).sort(_byEquidad);
  const libres  = dispKeys.filter(k => !guardiaKeys.has(k)).map(_mk).sort(_byEquidad);
  const deGuardia = guardiaKeys.size > 0;
  const todosDisplay = [...todosMap.values()].sort((a, b) => a.localeCompare(b, "es"));

  // Compat: `lista` = lo que ya consumían el formulario y el modal "+ Asignar".
  const lista = deGuardia ? guardia : guardia.concat(libres);
  return { lista, guardia, libres, todos: todosDisplay, deGuardia };
}

async function cargarProfesoresLibresEnSelect(tramoOverride) {
  const _td = await _getTramosData();
  const fechaFormVal = document.getElementById("sust-fecha")?.value;
  const fecha = fechaFormVal || new Date().toISOString().split("T")[0];
  let horaRef;
  if (tramoOverride && _td[tramoOverride]) horaRef = _td[tramoOverride].hi;
  else { const a = new Date(); horaRef = String(a.getHours()).padStart(2,"0") + ":" + String(a.getMinutes()).padStart(2,"0"); }

  const { lista, todos, deGuardia } = await _sustCalcularLibres(fecha, horaRef);
  const _opt = (v, t) => '<option value="' + String(v).replace(/"/g, "&quot;") + '">' + t + '</option>';

  const selSust = document.getElementById("sust-sustituto");
  if (selSust) {
    const etiqueta = deGuardia ? "Seleccionar de guardia (por equidad)…" : "Seleccionar libre (por equidad)…";
    selSust.innerHTML = '<option value="">' + etiqueta + '</option>'
      + lista.map(p => _opt(p.nombre, p.nombre + " (" + p.carga + " g.)")).join("");
  }
  const selAus = document.getElementById("sust-ausente");
  if (selAus) {
    let ausentes = todos;
    if (!ausentes.length) {
      const { data: profData } = await sb.from("profesores").select("nombre").eq("centro_id", ctrId).eq("activo", true).order("nombre");
      ausentes = [..._sustDedupeNombres((profData || []).map(p => p.nombre)).values()].sort((a, b) => a.localeCompare(b, "es"));
    }
    selAus.innerHTML = '<option value="">Seleccionar profesor ausente…</option>'
      + ausentes.map(p => _opt(p, p)).join("");
  }
}

// ── Asignar sustituto a una fila PENDIENTE existente (sin crear duplicados) ──
window._sustAsignar = async function (id) {
  const s = (window._sustData || []).find(x => String(x.id) === String(id));
  if (!s) { alert("No se encontró la sustitución."); return; }
  const _td = await _getTramosData();
  const horaRef = (s.hora_inicio && s.hora_inicio.slice(0, 5)) || (_td[parseInt(s.tramo)] && _td[parseInt(s.tramo)].hi) || "09:00";

  let ov = document.getElementById("sust-asignar-modal");
  if (ov) ov.remove();
  ov = document.createElement("div");
  ov.id = "sust-asignar-modal";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
  ov.innerHTML = '<div style="background:var(--paper,#fff);border-radius:14px;max-width:440px;width:100%;border:1px solid var(--line,#e0e0e0);box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;">' +
    '<div style="padding:16px 20px;border-bottom:1px solid var(--line,#e0e0e0);font-weight:700;font-size:16px;">Asignar sustituto</div>' +
    '<div style="padding:16px 20px;">' +
      '<div style="font-size:13px;color:var(--txt2,#555);margin-bottom:12px;">' +
        '<strong>' + (s.profesor_ausente || "—") + '</strong> · ' + (s.fecha || "—") +
        ' · Tramo ' + (s.tramo || "—") + (s.grupo_horario ? " · " + s.grupo_horario : "") + '</div>' +
      '<label style="font-size:12px;font-weight:600;color:var(--txt2,#555);display:block;margin-bottom:4px;">Sustituto</label>' +
      '<select id="sust-asignar-sel" style="width:100%;padding:9px 11px;border:1px solid var(--line-2,#ccc);border-radius:8px;font-size:14px;"><option value="">Calculando…</option></select>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txt2,#555);margin-top:10px;cursor:pointer;"><input type="checkbox" id="sust-asignar-todos"> Mostrar todos los profesores (no solo libres)</label>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line,#e0e0e0);">' +
      '<button onclick="document.getElementById(\'sust-asignar-modal\').remove()" style="padding:8px 14px;border-radius:8px;border:1px solid var(--line-2,#ccc);background:#fff;font-size:13px;font-weight:600;cursor:pointer;">Cancelar</button>' +
      '<button id="sust-asignar-ok" onclick="window._sustConfirmarAsignar(\'' + id + '\')" style="padding:8px 14px;border-radius:8px;border:none;background:var(--ink,#1a73e8);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Asignar y notificar</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });

  const { lista, todos } = await _sustCalcularLibres(s.fecha, horaRef);
  window._sustAsignarLibres = lista;
  window._sustAsignarTodos = todos;
  const _render = (usarTodos) => {
    const sel = document.getElementById("sust-asignar-sel");
    if (!sel) return;
    const _o = (v, t) => '<option value="' + String(v).replace(/"/g, "&quot;") + '">' + t + '</option>';
    if (usarTodos) {
      sel.innerHTML = '<option value="">Seleccionar profesor…</option>' + todos.map(n => _o(n, n)).join("");
    } else if (lista.length) {
      sel.innerHTML = '<option value="">Seleccionar libre (por equidad)…</option>' + lista.map(p => _o(p.nombre, p.nombre + " (" + p.carga + " g.)")).join("");
    } else {
      sel.innerHTML = '<option value="">No hay profesores libres — marca "mostrar todos"</option>';
    }
  };
  _render(false);
  const chk = document.getElementById("sust-asignar-todos");
  if (chk) chk.addEventListener("change", () => _render(chk.checked));
};

window._sustConfirmarAsignar = async function (id) {
  const sel = document.getElementById("sust-asignar-sel");
  const nombre = sel ? sel.value.trim() : "";
  if (!nombre) { alert("Selecciona un sustituto."); return; }
  const s = (window._sustData || []).find(x => String(x.id) === String(id));
  const okBtn = document.getElementById("sust-asignar-ok");
  if (okBtn) { okBtn.disabled = true; okBtn.textContent = "Asignando…"; }

  const { error } = await sb.from("sustituciones")
    .update({ profesor_sustituto: nombre, cubierta: true }).eq("id", id);
  if (error) { if (okBtn) { okBtn.disabled = false; okBtn.textContent = "Asignar y notificar"; } alert("Error: " + error.message); return; }

  // Equidad
  if (s && typeof registrarGuardiaEnBD === "function") {
    try { registrarGuardiaEnBD(nombre, s.fecha, parseInt(s.tramo) || null, s.grupo_horario || null); } catch (e) {}
  }
  // Email a ausente + sustituto (la EF maneja ambos)
  fetch(`${SB_URL}/functions/v1/notify-sustitucion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
    body: JSON.stringify({ sustitucion_id: id, evento: "asignacion" }),
  }).catch(() => {});
  // Push al sustituto si tiene cuenta
  (async () => {
    try {
      const { data: perfil } = await sb.from("profiles").select("user_id").eq("centro_id", ctrId)
        .ilike("full_name", `%${nombre.replace(/,/g, " ").trim().split(/\s+/)[0]}%`).limit(1);
      const uid = perfil?.[0]?.user_id;
      if (uid) {
        fetch(`${SB_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
          body: JSON.stringify({ user_ids: [uid], title: "📋 Guardia asignada",
            body: `Tramo ${s?.tramo || "—"} · ${s?.grupo_horario || ""} · ${s?.fecha || ""}`, tag: "guardia" }),
        }).catch(() => {});
      }
    } catch (e) {}
  })();

  const ov = document.getElementById("sust-asignar-modal");
  if (ov) ov.remove();
  if (typeof showToast === "function") showToast("✅ " + nombre + " asignado y notificado");
  await loadSustituciones(sustFiltroActivo);
};

async function toggleCubierta(id, estadoActual) {
  const nuevoEstado = !estadoActual;
  const { error } = await sb.from("sustituciones").update({ cubierta: nuevoEstado }).eq("id", id);
  if (error) { alert("Error al actualizar: " + error.message); return; }
  // Cuando se marca cubierta, notificar al ausente (y al sustituto si lo hay)
  if (nuevoEstado) {
    fetch(`${SB_URL}/functions/v1/notify-sustitucion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
      body: JSON.stringify({ sustitucion_id: id, evento: "cobertura" }),
    }).catch(() => {});
  }
  await loadSustituciones(sustFiltroActivo);
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
  const iniEl = document.getElementById("notif-fecha-ini");
  const finEl = document.getElementById("notif-fecha-fin");
  if (iniEl) iniEl.value = hoy;
  if (finEl) finEl.value = hoy;

  // Fetch profile ID (shared global _rrhhMiProfileId declared in rrhh.js)
  if (typeof _rrhhMiProfileId !== "undefined" && !_rrhhMiProfileId) {
    const { data: p } = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
    _rrhhMiProfileId = p ? p.id : null;
  }

  await _loadTramosNotif();
  await _loadGruposProfesor();
  await loadMisAusenciasNotificadas();
}

function _sustFechaFinChange() {
  const ini = document.getElementById("notif-fecha-ini")?.value;
  const fin = document.getElementById("notif-fecha-fin")?.value;
  const tipoWrap    = document.getElementById("notif-tipo-wrap");
  const tramosSection = document.getElementById("notif-tramos-section");
  const isMultiDay  = fin && ini && fin > ini;
  if (tipoWrap) tipoWrap.style.display = isMultiDay ? "none" : "";
  if (isMultiDay) {
    if (tramosSection) tramosSection.style.display = "none";
    const radioDay = document.querySelector('input[name="notif-tipo"][value="dia"]');
    if (radioDay) radioDay.checked = true;
  }
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
    // Fallback genérico si el centro aún no tiene tramos_centro configurados
    const fallback = [
      [1,"08:00","09:00"],[2,"09:00","10:00"],[3,"10:00","11:00"],
      [4,"11:30","12:30"],[5,"12:30","13:30"],[6,"13:30","14:30"],
      [7,"15:00","16:00"],[8,"16:00","17:00"]
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
  // El campo "grupos afectados" se eliminó: el grupo se deriva del horario por
  // tramo al notificar. Si el campo no existe, no hacemos nada.
  if (!document.getElementById("notif-grupos")) return;
  if (!currentUserName || !sb || !ctrId) return;
  const parte = currentUserName.trim().split(/\s+/).find(p => p.length > 2);
  if (!parte) return;
  const { data } = await sb.from("horarios_grupo")
    .select("grupo_horario")
    .eq("centro_id", ctrId)
    .eq("curso_escolar", typeof cursoActivo !== "undefined" ? cursoActivo : "2025-26")
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
  const fechaIni = document.getElementById("notif-fecha-ini")?.value;
  const fechaFin = document.getElementById("notif-fecha-fin")?.value || fechaIni;
  const motivoTipo = document.getElementById("notif-motivo")?.value || "asunto_propio";
  const tipoDia  = document.querySelector('input[name="notif-tipo"]:checked')?.value || "dia";
  const instruc  = document.getElementById("notif-instrucciones")?.value.trim();
  const msgEl    = document.getElementById("notif-msg");
  const multiDay = !!fechaFin && fechaFin > fechaIni;

  if (!fechaIni) { _sustNotifMsg(msgEl, "Indica la fecha de inicio.", "err"); return; }
  if (fechaFin && fechaFin < fechaIni) { _sustNotifMsg(msgEl, "La fecha fin no puede ser anterior al inicio.", "err"); return; }

  let tramosSeleccionados = [];
  if (tipoDia === "tramos" && !multiDay) {
    tramosSeleccionados = [...document.querySelectorAll(".notif-tramo-chk:checked")].map(c => parseInt(c.value));
    if (!tramosSeleccionados.length) { _sustNotifMsg(msgEl, "Selecciona al menos un tramo.", "err"); return; }
  }

  _sustNotifMsg(msgEl, "⟳ Enviando notificación…", "info");

  // Asegurar profile ID (global de rrhh.js)
  if (typeof _rrhhMiProfileId !== "undefined" && !_rrhhMiProfileId) {
    const { data: p } = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
    _rrhhMiProfileId = p ? p.id : null;
  }

  // ── 1. Crear registro administrativo en ausencias_profesor (RRHH) ──────
  let ausenciaId = null;
  if (typeof _rrhhMiProfileId !== "undefined" && _rrhhMiProfileId) {
    const { data: ausRow, error: ausErr } = await sb.from("ausencias_profesor").insert({
      centro_id:       ctrId,
      profile_id:      _rrhhMiProfileId,
      fecha:         fechaIni,
      fecha_fin:     fechaFin || fechaIni,
      tipo:          motivoTipo,
      motivo:        instruc || null,
      estado:        "pendiente",
      trimestre:     (function(){ var m=new Date().getMonth()+1; return m>=9?1:m<=3?2:3; })(),
      curso_escolar: (function(){ var y=new Date().getFullYear(),m=new Date().getMonth()+1; return m>=9?y+"-"+(y+1):(y-1)+"-"+y; })(),
    }).select("id").single();
    if (ausErr) { _sustNotifMsg(msgEl, "Error al registrar expediente RRHH: " + ausErr.message, "err"); return; }
    ausenciaId = ausRow?.id ?? null;
  }

  // ── 2. Crear filas en sustituciones (operativo) ───────────────────────
  const { data: tramosData } = await sb.from("tramos_centro")
    .select("numero,hora_inicio,hora_fin").eq("centro_id", ctrId).eq("es_descanso", false).order("numero");
  const tramoMap = {};
  (tramosData || []).forEach(t => { tramoMap[t.numero] = t; });
  const fallbackMap = {
    1:{hora_inicio:"08:00",hora_fin:"09:00"},2:{hora_inicio:"09:00",hora_fin:"10:00"},
    3:{hora_inicio:"10:00",hora_fin:"11:00"},4:{hora_inicio:"11:30",hora_fin:"12:30"},
    5:{hora_inicio:"12:30",hora_fin:"13:30"},6:{hora_inicio:"13:30",hora_fin:"14:30"},
    7:{hora_inicio:"15:00",hora_fin:"16:00"},8:{hora_inicio:"16:00",hora_fin:"17:00"}
  };

  // Grupo afectado por tramo: se deriva del horario del profesor ese día
  // (sustituye al antiguo campo manual "grupos afectados").
  let tramoGrupo = {};
  if (tipoDia === "tramos" && !multiDay && tramosSeleccionados.length) {
    const DIAS = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    const diaNom = DIAS[new Date(fechaIni + "T12:00:00").getDay()];
    const parte = (currentUserName || "").trim().split(/\s+/).find(p => p.length > 2) || currentUserName || "";
    const { data: hg } = await sb.from("horarios_grupo")
      .select("tramo,grupo_horario")
      .eq("centro_id", ctrId)
      .eq("curso_escolar", typeof cursoActivo !== "undefined" ? cursoActivo : "2025-26")
      .eq("dia", diaNom)
      .ilike("profesor_nombre", `%${parte}%`);
    (hg || []).forEach(h => { if (h.tramo != null && h.grupo_horario) tramoGrupo[String(h.tramo)] = h.grupo_horario; });
  }
  const gruposDeriv = [...new Set(tramosSeleccionados.map(n => tramoGrupo[String(n)]).filter(Boolean))].join(", ");

  const obsMeta  = ausenciaId ? `\n§RRHH§${ausenciaId}` : "";
  const obsBase  = instruc || "";

  const rows = [];
  const d    = new Date(fechaIni + "T12:00:00");
  const dFin = new Date((fechaFin || fechaIni) + "T12:00:00");

  while (d <= dFin) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const fecha = d.toISOString().split("T")[0];
      if (!multiDay && tipoDia === "tramos" && tramosSeleccionados.length) {
        // Tramos específicos: crea una fila por tramo de inmediato
        for (const n of tramosSeleccionados) {
          const t = tramoMap[n] || fallbackMap[n] || {};
          rows.push({
            centro_id: ctrId, fecha, tramo: n,
            hora_inicio: t.hora_inicio || null, hora_fin: t.hora_fin || null,
            grupo_horario: tramoGrupo[String(n)] || null, profesor_ausente: currentUserName,
            profesor_sustituto: null, cubierta: false, creado_por: currentUser.id,
            observaciones: (obsBase || "(Ausencia — tramos concretos)") + obsMeta,
          });
        }
      }
      // "Todo el día" o multi-día: NO crea placeholder con tramo=null.
      // El admin aprobará en RRHH y _crearSustituciones generará las filas
      // reales consultando el horario del profesor en horarios_grupo.
    }
    d.setDate(d.getDate() + 1);
  }

  if (rows.length) {
    const { error: sustErr } = await sb.from("sustituciones").insert(rows);
    if (sustErr) { _sustNotifMsg(msgEl, "Error al registrar sustituciones: " + sustErr.message, "err"); return; }
  }

  // ── 3. Justificante opcional subido en el formulario ─────────────────
  const justFile = document.getElementById("notif-justificante-file")?.files[0];
  if (justFile && ausenciaId) {
    const ext  = justFile.name.split(".").pop().toLowerCase();
    const path = `justificantes/${ctrId}/rrhh_${ausenciaId}.${ext}`;
    const { error: justErr } = await sb.storage.from("documentos")
      .upload(path, justFile, { upsert: true, contentType: justFile.type });
    if (justErr) console.warn("[justificante] no se pudo subir:", justErr.message || justErr);
  }

  // ── 4. Notificación consolidada a admins del centro ───────────────────
  const MOTIVO_LABELS = {
    baja_medica:"Enfermedad / Baja médica", permiso:"Cita médica / Permiso",
    formacion:"Formación", asunto_propio:"Asunto personal", sindical:"Asunto sindical", otros:"Otro"
  };
  const tipoAusencia = multiDay
    ? `todo el día · ${fechaIni}${fechaFin !== fechaIni ? " → " + fechaFin : ""}`
    : (tramosSeleccionados.length ? `tramos ${tramosSeleccionados.join(", ")}` : "todo el día");

  fetch(`${SB_URL}/functions/v1/notify-ausencia`, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${ANON_KEY}`, "apikey":ANON_KEY },
    body: JSON.stringify({
      centro_id: ctrId,
      profesor_nombre: currentUserName,
      fecha: fechaIni,
      fecha_fin: fechaFin || fechaIni,
      tipo_ausencia: tipoAusencia,
      motivo: MOTIVO_LABELS[motivoTipo] || motivoTipo,
      grupos: gruposDeriv || "—",
      instrucciones: instruc || "Sin instrucciones específicas.",
    }),
  }).catch(() => {});

  _sustNotifMsg(msgEl, "✅ Ausencia notificada a jefatura. Estado visible en tu historial.", "ok");

  // Limpiar formulario (mantener fechas)
  document.getElementById("notif-instrucciones").value = "";
  const jf = document.getElementById("notif-justificante-file");
  if (jf) jf.value = "";
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

  // Asegurar profile ID
  if (typeof _rrhhMiProfileId !== "undefined" && !_rrhhMiProfileId) {
    const { data: p } = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
    _rrhhMiProfileId = p ? p.id : null;
  }

  // Datos operativos (sustituciones)
  const { data: susts, error: sustErr } = await sb.from("sustituciones")
    .select("id,fecha,tramo,hora_inicio,hora_fin,grupo_horario,observaciones,cubierta,profesor_sustituto")
    .eq("centro_id", ctrId)
    .eq("profesor_ausente", currentUserName)
    .order("fecha", { ascending: false })
    .limit(50);

  // Datos administrativos (ausencias_profesor), indexados por ID
  const ausenciasMap = {};
  const miProfileId = typeof _rrhhMiProfileId !== "undefined" ? _rrhhMiProfileId : null;
  if (miProfileId) {
    const { data: aus } = await sb.from("ausencias_profesor")
      .select("id,fecha,fecha_fin,tipo,estado,motivo_rechazo")
      .eq("centro_id", ctrId).eq("profile_id", miProfileId)
      .order("fecha", { ascending: false }).limit(50);
    (aus || []).forEach(a => { ausenciasMap[a.id] = a; });
  }

  if (sustErr || !susts?.length) {
    c.innerHTML = '<div style="color:var(--txt3);font-size:13px;padding:8px 0;">No tienes ausencias notificadas aún.</div>';
    return;
  }

  const TIPO_LBL = {
    baja_medica:"🏥 Baja médica", permiso:"🩺 Cita médica", formacion:"📚 Formación",
    asunto_propio:"🗂️ Asunto personal", sindical:"⚖️ Sindical", otros:"📝 Otro"
  };

  c.innerHTML = `<div style="overflow-x:auto;"><table class="tbl" style="margin-top:8px;">
    <thead><tr>
      <th>Fecha</th><th>Tramo</th><th>Grupo</th><th>Instrucciones</th>
      <th>Cobertura</th><th>Motivo / Estado RRHH</th><th>Justificante</th>
    </tr></thead>
    <tbody>${susts.map(s => {
      const coberturaCell = s.cubierta
        ? `<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 8px;font-size:11px;white-space:nowrap;">✓ Cubierta${s.profesor_sustituto ? "<br><span style='font-size:10px;'>" + s.profesor_sustituto + "</span>" : ""}</span>`
        : '<span style="background:#fce8e6;color:#a50e0e;border-radius:12px;padding:2px 8px;font-size:11px;white-space:nowrap;">⏳ Pendiente</span>';

      const rrhhId = _rrhhIdFromObs(s.observaciones);
      const aus = rrhhId ? ausenciasMap[rrhhId] : null;
      let rrhhCell = '<span style="color:var(--txt3);font-size:12px;">—</span>';
      if (aus) {
        const tipoLbl = TIPO_LBL[aus.tipo] || aus.tipo || "—";
        const est = aus.estado || "pendiente";
        const estadoBadge = est === "aprobada"
          ? '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:1px 8px;font-size:10px;">✓ Aprobada</span>'
          : est === "rechazada"
          ? '<span style="background:#fde8e8;color:#b83232;border-radius:12px;padding:1px 8px;font-size:10px;">✕ Rechazada</span>'
          : '<span style="background:#fff9c4;color:#f57f17;border-radius:12px;padding:1px 8px;font-size:10px;">⏳ Pendiente</span>';
        rrhhCell = `<span style="font-size:12px;display:block;">${tipoLbl}</span>${estadoBadge}`
          + (aus.motivo_rechazo ? `<div style="font-size:11px;color:var(--red);margin-top:2px;">${aus.motivo_rechazo}</div>` : "");
      }

      const tramoTxt = s.tramo ? `T${s.tramo}` : "Todo el día";
      const hi = String(s.hora_inicio || "").slice(0, 5);
      const hf = String(s.hora_fin    || "").slice(0, 5);
      const horas = hi && hf && s.tramo ? `<br><span style="font-size:10px;color:var(--txt3);">${hi}–${hf}</span>` : "";

      const instrText = _instrLimpias(s.observaciones);
      const instrucTxt = instrText
        ? `<span title="${instrText.replace(/"/g,"&quot;")}" style="cursor:help;font-size:12px;color:var(--txt2);">${instrText.length > 45 ? instrText.slice(0, 45) + "…" : instrText}</span>`
        : '<span style="color:var(--txt3);">—</span>';

      const justPath = _justPath(s.observaciones);
      const justCell = justPath
        ? '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 8px;font-size:11px;white-space:nowrap;">✓ Entregado</span>'
        : `<button onclick="window._subirJustificante('${s.id}','${s.fecha}')"
             style="background:#f1f3f4;border:none;border-radius:12px;padding:3px 10px;font-size:11px;cursor:pointer;color:var(--txt2);">📎 Adjuntar</button>`;

      return `<tr>
        <td style="white-space:nowrap;">${s.fecha || "—"}</td>
        <td>${tramoTxt}${horas}</td>
        <td>${s.grupo_horario || "—"}</td>
        <td style="max-width:170px;">${instrucTxt}</td>
        <td>${coberturaCell}</td>
        <td>${rrhhCell}</td>
        <td>${justCell}</td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>`;
}

// ── JUSTIFICANTES: helpers ───────────────────────────────────────────────

// Extrae el storage path de justificante (§JUST§<path>)
function _justPath(obs) {
  const m = String(obs || "").match(/\n§JUST§([^\n]+)/);
  return m ? m[1].trim() : null;
}

// Extrae el ID de ausencias_profesor vinculado (§RRHH§<uuid>)
function _rrhhIdFromObs(obs) {
  const m = String(obs || "").match(/\n§RRHH§([^\n]+)/);
  return m ? m[1].trim() : null;
}

// Devuelve las instrucciones limpias, sin ningún marcador de metadata
function _instrLimpias(obs) {
  return String(obs || "")
    .replace(/\n§JUST§[^\n]*/g, "")
    .replace(/\n§RRHH§[^\n]*/g, "")
    .trim();
}

// Sube un PDF/imagen al bucket "documentos" y marca la ausencia en observaciones
window._subirJustificante = async function(sustId, fecha) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,image/*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split(".").pop().toLowerCase();
    const path = `justificantes/${ctrId}/${sustId}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("documentos")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) { alert("Error al subir el justificante: " + upErr.message); return; }

    // Append marker to observaciones
    const { data: row } = await sb.from("sustituciones")
      .select("observaciones").eq("id", sustId).single();
    const obsLimpia = _instrLimpias(row?.observaciones || "");
    const newObs = obsLimpia + `\n§JUST§${path}`;

    const { error: updErr } = await sb.from("sustituciones")
      .update({ observaciones: newObs }).eq("id", sustId);
    if (updErr) { alert("Justificante subido pero error al registrar: " + updErr.message); return; }

    alert("✅ Justificante adjuntado correctamente.");
    await loadMisAusenciasNotificadas();
  };
  input.click();
};

// Genera URL firmada (1h) y abre el justificante en nueva pestaña
window._descargarJustificante = async function(path) {
  const { data, error } = await sb.storage
    .from("documentos")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    alert("No se pudo obtener el enlace de descarga. Comprueba que el archivo existe en Storage.");
    return;
  }
  window.open(data.signedUrl, "_blank");
};
