/* Agente de sustituciones (modo asistido) — revisa el día, propone un plan de
   cobertura completo (un sustituto por tramo) y lo deja listo para confirmar.
   Cerebro determinista: prioriza profesores DE GUARDIA, luego libres por equidad,
   con asignación GLOBAL (un mismo profesor no cubre dos clases a la vez y reparte
   la carga del día). Reutiliza helpers de admin.js (_sustCalcularLibres,
   _sustNombreNorm) y guardias.js (registrarGuardiaEnBD). Prefijo _asu (único). */

function _asuEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _asuDiaLegible(f) {
  const DOW = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const d = new Date(f + "T12:00:00");
  return DOW[d.getDay()].charAt(0).toUpperCase() + DOW[d.getDay()].slice(1) + " " + d.getDate() + "/" + (d.getMonth() + 1);
}

window.agenteSustituciones = async function (fechaArg) {
  const fecha = fechaArg || document.getElementById("sust-fecha")?.value || new Date().toISOString().split("T")[0];
  _asuEnsureStyles();
  window._asuFecha = fecha;
  let ov = document.getElementById("asu-modal");
  if (ov) ov.remove();
  ov = document.createElement("div");
  ov.id = "asu-modal";
  ov.className = "asu-ov";
  ov.innerHTML = '<div class="asu-modal">' +
    '<div class="asu-hd"><div class="asu-bot"><div class="asu-avatar">🤖</div>' +
      '<div><div class="asu-eyebrow">AGENTE DE SUSTITUCIONES</div>' +
      '<h3 class="asu-ttl">Cobertura del día</h3></div></div>' +
      '<button class="asu-x" onclick="document.getElementById(\'asu-modal\').remove()">✕</button></div>' +
    '<div class="asu-nav">' +
      '<button class="asu-btn" onclick="window._asuNav(-1)">‹ Día ant.</button>' +
      '<input type="date" id="asu-fecha" value="' + fecha + '" onchange="window.agenteSustituciones(this.value)">' +
      '<button class="asu-btn" onclick="window._asuNav(1)">Día sig. ›</button>' +
    '</div>' +
    '<div class="asu-bd" id="asu-bd"><div class="asu-think">🤖 Analizando el día, ausencias y profesorado de guardia…</div></div>' +
    '<div class="asu-ft" id="asu-ft"></div>' +
  '</div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  await _asuPlanificar(fecha);
};

window._asuNav = function (delta) {
  const d = new Date((window._asuFecha || new Date().toISOString().split("T")[0]) + "T12:00:00");
  d.setDate(d.getDate() + delta);
  window.agenteSustituciones(d.toISOString().split("T")[0]);
};

async function _asuPlanificar(fecha) {
  const bd = document.getElementById("asu-bd");
  const ft = document.getElementById("asu-ft");
  if (!bd) return;
  if (ft) ft.innerHTML = "";

  // 1. Pendientes del día (sin sustituto) — expandiendo filas de día completo
  let r = await sb.from("sustituciones").select("*")
    .eq("centro_id", ctrId).eq("fecha", fecha).or("cubierta.eq.false,cubierta.is.null");
  let pend = (r.data || []).filter(s => !s.profesor_sustituto);
  const fullDay = pend.filter(s => s.tramo == null);
  if (fullDay.length && typeof _pcExpandirDiaCompleto === "function") {
    await _pcExpandirDiaCompleto(fecha, fullDay);
    const r2 = await sb.from("sustituciones").select("*")
      .eq("centro_id", ctrId).eq("fecha", fecha).or("cubierta.eq.false,cubierta.is.null");
    pend = (r2.data || []).filter(s => !s.profesor_sustituto);
  }
  if (!pend.length) {
    bd.innerHTML = '<div class="asu-ok">✅ ' + _asuDiaLegible(fecha) + ': no hay tramos sin cubrir. Nada que hacer.</div>';
    return;
  }
  pend.sort((a, b) => (parseInt(a.tramo) || 99) - (parseInt(b.tramo) || 99) || (a.hora_inicio || "").localeCompare(b.hora_inicio || ""));

  // 2. Candidatos por hora (guardia / libres), cache
  const horas = [...new Set(pend.map(s => (s.hora_inicio || "").slice(0, 5) || "09:00"))];
  const cache = {};
  for (const h of horas) {
    try { cache[h] = await _sustCalcularLibres(fecha, h); }
    catch (e) { cache[h] = { guardia: [], libres: [], deGuardia: false, todos: [] }; }
  }

  // 3. Asignación GLOBAL — escasez primero + equidad con reparto del día
  const load = {};   // normKey -> carga proyectada
  Object.values(cache).forEach(c => (c.guardia || []).concat(c.libres || []).forEach(x => {
    const k = _sustNombreNorm(x.nombre); if (!(k in load)) load[k] = x.carga || 0;
  }));
  const usedByHora = {};
  const slots = pend.map((s, i) => ({ s, h: (s.hora_inicio || "").slice(0, 5) || "09:00", i }));
  // tramos con menos candidatos se resuelven antes (evita quedarse sin opción)
  const nCand = h => ((cache[h].guardia || []).length + (cache[h].libres || []).length);
  slots.sort((a, b) => nCand(a.h) - nCand(b.h));

  slots.forEach(slot => {
    const used = usedByHora[slot.h] || (usedByHora[slot.h] = new Set());
    let pick = null, tipo = null;
    for (const [t, pool] of [["guardia", cache[slot.h].guardia || []], ["libre", cache[slot.h].libres || []]]) {
      const avail = pool.filter(c => !used.has(_sustNombreNorm(c.nombre)));
      if (!avail.length) continue;
      avail.sort((a, b) => {
        const la = load[_sustNombreNorm(a.nombre)] ?? a.carga, lb = load[_sustNombreNorm(b.nombre)] ?? b.carga;
        return la - lb || a.nombre.localeCompare(b.nombre, "es");
      });
      pick = avail[0]; tipo = t; break;
    }
    if (pick) {
      const k = _sustNombreNorm(pick.nombre);
      used.add(k); load[k] = (load[k] ?? pick.carga) + 1;
    }
    slot.propuesta = pick ? pick.nombre : "";
    slot.tipo = tipo;
    slot.carga = pick ? pick.carga : null;
  });
  slots.sort((a, b) => a.i - b.i); // volver a orden por tramo para mostrar
  window._asuSlots = slots;

  // 4. Briefing
  const total = slots.length;
  const cubiertos = slots.filter(s => s.propuesta).length;
  const conGuardia = slots.filter(s => s.tipo === "guardia").length;
  const conLibre = slots.filter(s => s.tipo === "libre").length;
  const sinCobertura = total - cubiertos;
  const ausentes = [...new Set(pend.map(s => s.profesor_ausente).filter(Boolean))];
  let brief = "He revisado el <strong>" + _asuDiaLegible(fecha) + "</strong>: " +
    "<strong>" + ausentes.length + "</strong> profesor" + (ausentes.length !== 1 ? "es" : "") + " de baja y <strong>" + total + "</strong> tramo" + (total !== 1 ? "s" : "") + " a cubrir. " +
    "Propongo <strong>" + conGuardia + "</strong> con profesorado de guardia" +
    (conLibre ? " y <strong>" + conLibre + "</strong> con profesorado libre (por equidad)" : "") + ". ";
  brief += sinCobertura
    ? '<span class="asu-warn">⚠ ' + sinCobertura + " tramo" + (sinCobertura !== 1 ? "s" : "") + " sin cobertura disponible — revísalo manualmente.</span>"
    : '<span class="asu-good">✅ Todo el día queda cubierto.</span>';

  // 5. Tabla con propuesta editable
  const filas = slots.map(slot => {
    const s = slot.s;
    const c = cache[slot.h] || { guardia: [], libres: [] };
    const horaTxt = s.hora_inicio ? s.hora_inicio.slice(0, 5) + "–" + (s.hora_fin || "").slice(0, 5) : ("Tramo " + (s.tramo || "—"));
    const opt = (nombre, tag, sel) => '<option value="' + _asuEsc(nombre) + '"' + (sel ? " selected" : "") + '>' + _asuEsc(nombre) + tag + '</option>';
    let opts = "";
    (c.guardia || []).forEach(p => opts += opt(p.nombre, " · 🛡 guardia (" + p.carga + ")", p.nombre === slot.propuesta));
    (c.libres || []).forEach(p => opts += opt(p.nombre, " · libre (" + p.carga + ")", p.nombre === slot.propuesta));
    if (!opts) opts = '<option value="">— sin profesores disponibles —</option>';
    const badge = slot.tipo === "guardia" ? '<span class="asu-tag asu-tag-g">🛡 guardia</span>'
                : slot.tipo === "libre" ? '<span class="asu-tag asu-tag-l">libre</span>'
                : '<span class="asu-tag asu-tag-x">sin cobertura</span>';
    return '<tr id="asu-row-' + s.id + '">' +
      '<td class="asu-tramo">' + _asuEsc(horaTxt) + '</td>' +
      '<td>' + _asuEsc(s.grupo_horario || "—") + '</td>' +
      '<td>' + _asuEsc(s.profesor_ausente || "—") + '</td>' +
      '<td><select class="asu-sel" id="asu-sel-' + s.id + '">' + opts + '</select><div class="asu-motivo">' + badge + '</div></td>' +
      '</tr>';
  }).join("");

  bd.innerHTML = '<div class="asu-brief">' + brief + '</div>' +
    '<table class="asu-table"><thead><tr><th>Tramo</th><th>Grupo</th><th>Ausente</th><th>Sustituto propuesto</th></tr></thead><tbody>' +
    filas + '</tbody></table>';
  if (ft) ft.innerHTML = '<div class="asu-disc">El agente propone; tú decides. Revisa los desplegables y confirma.</div>' +
    '<button class="asu-btn asu-btn-primary" onclick="window._asuConfirmar()">✓ Confirmar y asignar (' + cubiertos + ')</button>';
}

window._asuConfirmar = async function () {
  const slots = (window._asuSlots || []).filter(sl => {
    const sel = document.getElementById("asu-sel-" + sl.s.id);
    return sel && sel.value;
  });
  if (!slots.length) { showToast("No hay propuestas que asignar"); return; }
  let n = 0;
  for (const sl of slots) {
    const sel = document.getElementById("asu-sel-" + sl.s.id);
    const nombre = sel ? sel.value.trim() : "";
    if (!nombre) continue;
    const ok = await _asuAsignar(sl.s, nombre);
    if (ok) {
      n++;
      const row = document.getElementById("asu-row-" + sl.s.id);
      if (row) { row.style.opacity = ".5"; const c = row.querySelector("td:last-child"); if (c) c.innerHTML = '<span class="asu-done">✓ ' + _asuEsc(nombre) + '</span>'; }
    }
  }
  showToast(n ? "✅ " + n + " tramo(s) asignados y notificados" : "No se asignó nada");
  if (typeof loadSustituciones === "function") { try { loadSustituciones(typeof sustFiltroActivo !== "undefined" ? sustFiltroActivo : "hoy"); } catch (e) {} }
};

async function _asuAsignar(s, nombre) {
  const { error } = await sb.from("sustituciones")
    .update({ profesor_sustituto: nombre, cubierta: true }).eq("id", s.id);
  if (error) { showToast("Error: " + error.message); return false; }
  if (typeof registrarGuardiaEnBD === "function") {
    try { registrarGuardiaEnBD(nombre, s.fecha, parseInt(s.tramo) || null, s.grupo_horario || null); } catch (e) {}
  }
  fetch(`${SB_URL}/functions/v1/notify-sustitucion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
    body: JSON.stringify({ sustitucion_id: s.id, evento: "asignacion" }),
  }).catch(() => {});
  (async () => {
    try {
      const { data: p } = await sb.from("profiles").select("user_id").eq("centro_id", ctrId)
        .ilike("full_name", `%${nombre.replace(/,/g, " ").trim().split(/\s+/)[0]}%`).limit(1);
      const uid = p?.[0]?.user_id;
      if (uid) fetch(`${SB_URL}/functions/v1/send-push`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ user_ids: [uid], title: "📋 Guardia asignada", body: `Tramo ${s.tramo || "—"} · ${s.grupo_horario || ""} · ${s.fecha || ""}`, tag: "guardia" }),
      }).catch(() => {});
    } catch (e) {}
  })();
  return true;
}

function _asuEnsureStyles() {
  if (document.getElementById("asu-styles")) return;
  const s = document.createElement("style");
  s.id = "asu-styles";
  s.textContent = [
    ".asu-ov{position:fixed;inset:0;background:rgba(20,20,30,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;}",
    ".asu-modal{background:var(--paper,#fff);border-radius:16px;max-width:800px;width:100%;border:1px solid var(--line,#e0e0e0);box-shadow:0 24px 70px rgba(0,0,0,.34);overflow:hidden;}",
    ".asu-hd{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--line,#e0e0e0);}",
    ".asu-bot{display:flex;gap:12px;align-items:center;}",
    ".asu-avatar{width:40px;height:40px;border-radius:11px;background:var(--accent-soft,#f3e1d5);display:flex;align-items:center;justify-content:center;font-size:21px;flex:0 0 auto;}",
    ".asu-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#888);margin-bottom:2px;}",
    ".asu-ttl{margin:0;font-size:19px;font-weight:700;color:var(--txt,#222);font-family:var(--font-display,inherit);}",
    ".asu-x{background:none;border:none;font-size:17px;color:var(--muted,#888);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".asu-nav{display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 22px;border-bottom:1px solid var(--line,#e0e0e0);background:var(--paper-2,#f7f6f3);}",
    ".asu-nav input{padding:7px 10px;border:1px solid var(--line-2,#ccc);border-radius:8px;font-size:14px;}",
    ".asu-bd{padding:16px 22px;}",
    ".asu-think,.asu-ok{text-align:center;padding:34px 16px;color:var(--muted,#888);font-size:14px;}",
    ".asu-ok{color:#1e6b3a;font-weight:600;}",
    ".asu-brief{background:var(--accent-soft,#f3e1d5);color:var(--accent-ink,#7A3E1F);border-radius:12px;padding:14px 16px;font-size:13.5px;line-height:1.55;margin-bottom:16px;}",
    ".asu-warn{color:#9a3b12;font-weight:600;}",
    ".asu-good{color:#1e6b3a;font-weight:600;}",
    ".asu-table{width:100%;border-collapse:collapse;font-size:13px;}",
    ".asu-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#888);padding:6px 8px;border-bottom:1px solid var(--line,#e0e0e0);}",
    ".asu-table td{padding:9px 8px;border-bottom:1px solid var(--line,#eee);vertical-align:middle;}",
    ".asu-tramo{white-space:nowrap;font-weight:600;color:var(--txt,#222);}",
    ".asu-sel{max-width:280px;padding:7px 9px;border:1px solid var(--line-2,#ccc);border-radius:8px;font-size:12.5px;background:var(--paper,#fff);}",
    ".asu-motivo{margin-top:4px;}",
    ".asu-tag{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;}",
    ".asu-tag-g{background:#e3f2ec;color:#1e6b3a;}",
    ".asu-tag-l{background:#e3eafa;color:#3a5bbf;}",
    ".asu-tag-x{background:#fde8e8;color:#b83232;}",
    ".asu-done{color:#1e6b3a;font-weight:700;}",
    ".asu-ft{padding:14px 22px;border-top:1px solid var(--line,#e0e0e0);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}",
    ".asu-disc{font-size:11.5px;color:var(--muted,#888);}",
    ".asu-btn{padding:8px 14px;border-radius:8px;border:1px solid var(--line-2,#ccc);background:var(--paper,#fff);color:var(--txt2,#555);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".asu-btn-primary{background:var(--ink,#1a73e8);color:#fff;border-color:var(--ink,#1a73e8);}",
    "@media(max-width:680px){.asu-sel{max-width:150px;}.asu-table th:nth-child(2),.asu-table td:nth-child(2){display:none;}}",
  ].join("");
  document.head.appendChild(s);
}
