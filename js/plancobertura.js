/* Plan de cobertura del día — para jefatura: ve cada tramo sin cubrir, con un
   sustituto SUGERIDO (profesor libre con menos guardias) y asigna en un clic.
   Reutiliza helpers globales de admin.js (_sustCalcularLibres, _sustNombreNorm,
   _sustNombreCoincide, _sustDedupeNombres) y guardias.js (registrarGuardiaEnBD). */

function _pcEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _pcDiaLegible(f) {
  const DOW = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const d = new Date(f + "T12:00:00");
  return DOW[d.getDay()].charAt(0).toUpperCase() + DOW[d.getDay()].slice(1) + " " + d.getDate() + "/" + (d.getMonth() + 1);
}

window.planCoberturaDia = async function (fechaArg) {
  const fecha = fechaArg || document.getElementById("sust-fecha")?.value || new Date().toISOString().split("T")[0];
  _pcEnsureStyles();
  let ov = document.getElementById("pc-modal");
  if (ov) ov.remove();
  ov = document.createElement("div");
  ov.id = "pc-modal";
  ov.className = "pc-ov";
  ov.innerHTML = '<div class="pc-modal">' +
    '<div class="pc-hd">' +
      '<div><div class="pc-eyebrow">JEFATURA · COBERTURA</div><h3 class="pc-ttl">Plan de cobertura del día</h3></div>' +
      '<button class="pc-x" onclick="document.getElementById(\'pc-modal\').remove()">✕</button>' +
    '</div>' +
    '<div class="pc-nav">' +
      '<button class="pc-btn" onclick="window._pcNav(-1)">‹ Día anterior</button>' +
      '<input type="date" id="pc-fecha" value="' + fecha + '" onchange="window.planCoberturaDia(this.value)">' +
      '<button class="pc-btn" onclick="window._pcNav(1)">Día siguiente ›</button>' +
    '</div>' +
    '<div class="pc-bd" id="pc-bd"><div class="pc-loading">Calculando plan…</div></div>' +
    '<div class="pc-ft" id="pc-ft"></div>' +
  '</div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  window._pcFecha = fecha;
  await _pcCargar(fecha);
};

window._pcNav = function (delta) {
  const d = new Date((window._pcFecha || new Date().toISOString().split("T")[0]) + "T12:00:00");
  d.setDate(d.getDate() + delta);
  window.planCoberturaDia(d.toISOString().split("T")[0]);
};

async function _pcCargar(fecha) {
  const bd = document.getElementById("pc-bd");
  const ft = document.getElementById("pc-ft");
  if (!bd) return;
  bd.innerHTML = '<div class="pc-loading">Calculando plan…</div>';
  if (ft) ft.innerHTML = "";

  // 1. Sustituciones pendientes (sin sustituto) del día
  let { data } = await sb.from("sustituciones").select("*")
    .eq("centro_id", ctrId).eq("fecha", fecha)
    .or("cubierta.eq.false,cubierta.is.null");
  let pend = (data || []).filter(s => !s.profesor_sustituto);

  // 2. Expandir filas de DÍA COMPLETO (tramo=null) en filas por tramo reales
  const fullDay = pend.filter(s => s.tramo == null);
  if (fullDay.length) {
    await _pcExpandirDiaCompleto(fecha, fullDay);
    const r2 = await sb.from("sustituciones").select("*")
      .eq("centro_id", ctrId).eq("fecha", fecha).or("cubierta.eq.false,cubierta.is.null");
    pend = (r2.data || []).filter(s => !s.profesor_sustituto);
  }

  if (!pend.length) {
    bd.innerHTML = '<div class="pc-empty">✅ No hay tramos sin cubrir el ' + _pcDiaLegible(fecha) + '.</div>';
    return;
  }

  // Ordenar por tramo/hora
  pend.sort((a, b) => (parseInt(a.tramo) || 99) - (parseInt(b.tramo) || 99) || (a.hora_inicio || "").localeCompare(b.hora_inicio || ""));

  // 3. Calcular libres por hora distinta (cache para no repetir queries)
  const horas = [...new Set(pend.map(s => (s.hora_inicio || "").slice(0, 5) || "09:00"))];
  const libresPorHora = {};
  for (const h of horas) {
    try { libresPorHora[h] = await _sustCalcularLibres(fecha, h); }
    catch (e) { libresPorHora[h] = { lista: [], todos: [], deGuardia: false }; }
  }

  // 4. Render
  window._pcSlots = {};
  const filas = pend.map(s => {
    const h = (s.hora_inicio || "").slice(0, 5) || "09:00";
    const calc = libresPorHora[h] || { lista: [], todos: [] };
    const lista = calc.lista || [];
    const sugerido = lista[0] || null;
    window._pcSlots[s.id] = { s, lista, todos: calc.todos || [] };
    const horaTxt = s.hora_inicio ? s.hora_inicio.slice(0, 5) + "–" + (s.hora_fin || "").slice(0, 5) : ("Tramo " + (s.tramo || "—"));
    const opciones = lista.length
      ? lista.map((p, i) => '<option value="' + _pcEsc(p.nombre) + '"' + (i === 0 ? " selected" : "") + '>' + _pcEsc(p.nombre) + ' · ' + p.carga + ' g.' + (i === 0 ? " (sugerido)" : "") + '</option>').join("")
      : '<option value="">— sin profesores libres —</option>';
    return '<tr id="pc-row-' + s.id + '">' +
      '<td class="pc-tramo">' + _pcEsc(horaTxt) + '</td>' +
      '<td>' + _pcEsc(s.grupo_horario || "—") + '</td>' +
      '<td>' + _pcEsc(s.profesor_ausente || "—") + '</td>' +
      '<td><select class="pc-sel" id="pc-sel-' + s.id + '">' + opciones +
        '</select>' + (lista.length ? "" : ' <label class="pc-todos"><input type="checkbox" onchange="window._pcMostrarTodos(\'' + s.id + '\',this.checked)"> todos</label>') + '</td>' +
      '<td><button class="pc-btn pc-btn-ok" id="pc-asg-' + s.id + '" onclick="window._pcAsignar(\'' + s.id + '\')">Asignar</button></td>' +
    '</tr>';
  }).join("");

  bd.innerHTML = '<div class="pc-sub">' + _pcDiaLegible(fecha) + ' · ' + pend.length + ' tramo' + (pend.length !== 1 ? "s" : "") + ' sin cubrir' +
    (libresPorHora[horas[0]] && libresPorHora[horas[0]].deGuardia ? ' · sugerencias entre profesores de guardia' : ' · sugerencias entre profesores libres') + '</div>' +
    '<table class="pc-table"><thead><tr><th>Tramo</th><th>Grupo</th><th>Ausente</th><th>Sustituto sugerido</th><th></th></tr></thead><tbody>' +
    filas + '</tbody></table>';
  if (ft) ft.innerHTML = '<button class="pc-btn pc-btn-primary" onclick="window._pcAsignarTodas()">✓ Asignar todas las sugeridas</button>';
}

// Expande filas de día completo en filas por tramo según el horario real del ausente.
async function _pcExpandirDiaCompleto(fecha, fullDayRows) {
  const _ca = typeof cursoActivo !== "undefined" ? cursoActivo : "2025-26";
  const DOW = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  const dia = DOW[new Date(fecha + "T12:00:00").getDay()];
  const { data: hg } = await sb.from("horarios_grupo")
    .select("tramo,hora_inicio,hora_fin,grupo_horario,profesor_nombre,actividad_nombre")
    .eq("centro_id", ctrId).eq("curso_escolar", _ca).eq("dia", dia)
    .not("profesor_nombre", "is", null).limit(20000);
  const clases = hg || [];

  for (const row of fullDayRows) {
    // clases reales del ausente ese día (excluye guardias/recreos del propio profe)
    const suyas = clases.filter(c => _sustNombreCoincide(row.profesor_ausente, c.profesor_nombre)
      && !/guardia|recreo|patio|comedor|reunion/i.test(c.actividad_nombre || ""));
    if (!suyas.length) continue; // sin horario reconocible → se deja la fila tal cual

    // dedup por tramo
    const existKeys = new Set();
    const { data: ya } = await sb.from("sustituciones").select("tramo,grupo_horario")
      .eq("centro_id", ctrId).eq("fecha", fecha).not("tramo", "is", null);
    (ya || []).forEach(s => existKeys.add(String(s.tramo) + "|" + (s.grupo_horario || "")));

    const nuevas = [];
    suyas.forEach(c => {
      const k = String(c.tramo) + "|" + (c.grupo_horario || "");
      if (existKeys.has(k)) return;
      existKeys.add(k);
      nuevas.push({
        centro_id: ctrId, fecha, tramo: c.tramo,
        hora_inicio: c.hora_inicio, hora_fin: c.hora_fin,
        grupo_horario: c.grupo_horario, profesor_ausente: row.profesor_ausente,
        profesor_sustituto: null, cubierta: false,
        observaciones: row.observaciones || null, creado_por: currentUser.id,
      });
    });
    if (nuevas.length) await sb.from("sustituciones").insert(nuevas);
    // borrar la fila de día completo (ya expandida)
    await sb.from("sustituciones").delete().eq("id", row.id);
  }
}

window._pcMostrarTodos = function (id, checked) {
  const slot = (window._pcSlots || {})[id];
  const sel = document.getElementById("pc-sel-" + id);
  if (!slot || !sel) return;
  if (checked) {
    sel.innerHTML = '<option value="">Seleccionar profesor…</option>' +
      slot.todos.map(n => '<option value="' + _pcEsc(n) + '">' + _pcEsc(n) + '</option>').join("");
  } else {
    sel.innerHTML = slot.lista.length
      ? slot.lista.map((p, i) => '<option value="' + _pcEsc(p.nombre) + '"' + (i === 0 ? " selected" : "") + '>' + _pcEsc(p.nombre) + ' · ' + p.carga + ' g.' + (i === 0 ? " (sugerido)" : "") + '</option>').join("")
      : '<option value="">— sin profesores libres —</option>';
  }
};

window._pcAsignar = async function (id, silent) {
  const sel = document.getElementById("pc-sel-" + id);
  const nombre = sel ? sel.value.trim() : "";
  const slot = (window._pcSlots || {})[id];
  if (!nombre) { if (!silent) showToast("Selecciona un sustituto"); return false; }
  const btn = document.getElementById("pc-asg-" + id);
  if (btn) { btn.disabled = true; btn.textContent = "…"; }

  const { error } = await sb.from("sustituciones")
    .update({ profesor_sustituto: nombre, cubierta: true }).eq("id", id);
  if (error) { if (btn) { btn.disabled = false; btn.textContent = "Asignar"; } if (!silent) showToast("Error: " + error.message); return false; }

  const s = slot ? slot.s : null;
  if (s && typeof registrarGuardiaEnBD === "function") {
    try { registrarGuardiaEnBD(nombre, s.fecha, parseInt(s.tramo) || null, s.grupo_horario || null); } catch (e) {}
  }
  fetch(`${SB_URL}/functions/v1/notify-sustitucion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
    body: JSON.stringify({ sustitucion_id: id, evento: "asignacion" }),
  }).catch(() => {});
  (async () => {
    try {
      const { data: p } = await sb.from("profiles").select("user_id").eq("centro_id", ctrId)
        .ilike("full_name", `%${nombre.replace(/,/g, " ").trim().split(/\s+/)[0]}%`).limit(1);
      const uid = p?.[0]?.user_id;
      if (uid) fetch(`${SB_URL}/functions/v1/send-push`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ user_ids: [uid], title: "📋 Guardia asignada",
          body: `Tramo ${s?.tramo || "—"} · ${s?.grupo_horario || ""} · ${s?.fecha || ""}`, tag: "guardia" }),
      }).catch(() => {});
    } catch (e) {}
  })();

  const row = document.getElementById("pc-row-" + id);
  if (row) {
    row.style.opacity = ".55";
    row.querySelector("td:last-child").innerHTML = '<span class="pc-done">✓ ' + _pcEsc(nombre.split(/\s+/)[0]) + '</span>';
    if (sel) sel.disabled = true;
  }
  if (!silent) showToast("✅ " + nombre + " asignado y notificado");
  if (typeof loadSustituciones === "function") { try { loadSustituciones(typeof sustFiltroActivo !== "undefined" ? sustFiltroActivo : "hoy"); } catch (e) {} }
  return true;
};

window._pcAsignarTodas = async function () {
  const ids = Object.keys(window._pcSlots || {});
  let n = 0;
  for (const id of ids) {
    const row = document.getElementById("pc-row-" + id);
    if (row && row.style.opacity === "0.55") continue; // ya asignada
    const sel = document.getElementById("pc-sel-" + id);
    if (sel && sel.value) { const ok = await window._pcAsignar(id, true); if (ok) n++; }
  }
  showToast(n ? "✅ " + n + " tramo(s) asignados y notificados" : "No había sugerencias que asignar");
};

function _pcEnsureStyles() {
  if (document.getElementById("pc-styles")) return;
  const s = document.createElement("style");
  s.id = "pc-styles";
  s.textContent = [
    ".pc-ov{position:fixed;inset:0;background:rgba(20,20,30,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;}",
    ".pc-modal{background:var(--paper,#fff);border-radius:14px;max-width:760px;width:100%;border:1px solid var(--line,#e0e0e0);box-shadow:0 24px 70px rgba(0,0,0,.32);overflow:hidden;}",
    ".pc-hd{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--line,#e0e0e0);}",
    ".pc-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#888);margin-bottom:3px;}",
    ".pc-ttl{margin:0;font-size:19px;font-weight:700;color:var(--txt,#222);font-family:var(--font-display,inherit);}",
    ".pc-x{background:none;border:none;font-size:17px;color:var(--muted,#888);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".pc-x:hover{background:var(--surface-sunk,#eee);}",
    ".pc-nav{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 22px;border-bottom:1px solid var(--line,#e0e0e0);background:var(--paper-2,#f7f6f3);}",
    ".pc-nav input{padding:7px 10px;border:1px solid var(--line-2,#ccc);border-radius:8px;font-size:14px;}",
    ".pc-bd{padding:16px 22px;}",
    ".pc-loading,.pc-empty{text-align:center;padding:36px 16px;color:var(--muted,#888);font-size:14px;}",
    ".pc-sub{font-size:12.5px;color:var(--muted,#888);font-weight:600;margin-bottom:12px;}",
    ".pc-table{width:100%;border-collapse:collapse;font-size:13px;}",
    ".pc-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#888);padding:6px 8px;border-bottom:1px solid var(--line,#e0e0e0);}",
    ".pc-table td{padding:8px;border-bottom:1px solid var(--line,#eee);vertical-align:middle;}",
    ".pc-tramo{white-space:nowrap;font-weight:600;color:var(--txt,#222);}",
    ".pc-sel{max-width:230px;padding:7px 9px;border:1px solid var(--line-2,#ccc);border-radius:8px;font-size:12.5px;background:var(--paper,#fff);}",
    ".pc-todos{font-size:11px;color:var(--muted,#888);margin-left:6px;white-space:nowrap;}",
    ".pc-btn{padding:7px 13px;border-radius:8px;border:1px solid var(--line-2,#ccc);background:var(--paper,#fff);color:var(--txt2,#555);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".pc-btn:hover{background:var(--surface-sunk,#eee);}",
    ".pc-btn-ok{background:#e8f0fe;color:#1a56db;border-color:#cfe0fc;}",
    ".pc-btn-primary{background:var(--ink,#1a73e8);color:#fff;border-color:var(--ink,#1a73e8);}",
    ".pc-done{color:#1e6b3a;font-weight:700;font-size:12.5px;}",
    ".pc-ft{padding:14px 22px;border-top:1px solid var(--line,#e0e0e0);display:flex;justify-content:flex-end;}",
    "@media(max-width:600px){.pc-sel{max-width:130px;}.pc-table th:nth-child(2),.pc-table td:nth-child(2){display:none;}}",
  ].join("");
  document.head.appendChild(s);
}
