// ── CAPTACIÓN / CRM (Fase 9) ──
// Embudo comercial de la academia: interesado → contactado → clase de prueba →
// matriculado (o perdido). Recoge solicitudes del formulario público
// (inscripcion.html) y convierte a alumno+matrícula con un clic.

const _crEstados = [
  { k: "nuevo",       l: "Nuevos",           c: "#4D6FA8" },
  { k: "contactado",  l: "Contactados",      c: "#B8860B" },
  { k: "prueba",      l: "Clase de prueba",  c: "#7A5C9E" },
  { k: "matriculado", l: "Matriculados",     c: "#2E8B7A" },
  { k: "perdido",     l: "Perdidos",         c: "#A32D2D" },
];
const _crOrigenes = ["web", "telefono", "presencial", "recomendacion", "rrss", "otro"];

let _crLeads = [], _crGrupos = [], _crSlug = "", _crNuevo = false, _crFiltro = "";

function _crEsc(s) { return escH(s); }
function _crHoy() { return new Date().toISOString().slice(0, 10); }
function _crEur(n) { return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €"; }
function _crNombre(l) { return [l.nombre, l.apellidos].filter(Boolean).join(" ") || "(sin nombre)"; }
function _crUrlPublica() {
  return _crSlug ? `${location.origin}/inscripcion.html?a=${encodeURIComponent(_crSlug)}` : "";
}
function _crDiasDesde(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return isNaN(d) ? 0 : d;
}

function _crEnsureStyles() {
  if (document.getElementById("cr-styles")) return;
  const st = document.createElement("style"); st.id = "cr-styles";
  st.textContent = `
    #panel-captacion{padding:0!important;overflow-y:auto}
    .cr-wrap{padding:22px 26px;max-width:1240px}
    .cr-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .cr-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .cr-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .cr-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:132px}
    .cr-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .cr-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .cr-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .cr-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px;background:var(--paper-2,var(--srf2));margin-bottom:14px}
    .cr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .cr-in,.cr-sel{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit}
    .cr-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .cr-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
    .cr-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .cr-btn-sm{padding:3px 9px;font-size:11.5px;border-radius:6px}
    .cr-board{display:grid;grid-template-columns:repeat(5,minmax(190px,1fr));gap:12px;align-items:start;overflow-x:auto;padding-bottom:8px}
    .cr-col{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:10px;min-height:120px;transition:background .12s}
    .cr-col.drag{background:var(--srf);border-style:dashed}
    .cr-col-h{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;padding-left:6px;border-left:3px solid var(--col,#888)}
    .cr-col-n{background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:20px;padding:0 7px;font-size:11px;color:var(--muted,var(--txt3))}
    .cr-card{background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:10px;padding:10px 11px;margin-bottom:8px;cursor:grab;font-size:12.5px}
    .cr-card:active{cursor:grabbing}
    .cr-card-n{font-weight:600;font-size:13px;margin-bottom:2px}
    .cr-card-m{color:var(--muted,var(--txt3));font-size:11.5px;line-height:1.5}
    .cr-card-acts{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
    .cr-tag{display:inline-block;font-size:10.5px;padding:1px 7px;border-radius:20px;background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));color:var(--muted,var(--txt3))}
    .cr-viejo{color:var(--danger,#c0392b)}
    .cr-link{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid var(--line,var(--bdr));border-radius:10px;padding:11px 13px;background:var(--paper-2,var(--srf2));font-size:12.5px}
    .cr-link code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;background:var(--srf);padding:3px 7px;border-radius:6px;border:1px solid var(--line,var(--bdr));word-break:break-all}
    .cr-empty{font-size:12px;color:var(--muted,var(--txt3));padding:8px 6px;text-align:center}
    @media(max-width:900px){.cr-grid{grid-template-columns:1fr}.cr-board{grid-template-columns:repeat(5,minmax(180px,1fr))}.cr-wrap{padding:16px 14px}}
  `;
  document.head.appendChild(st);
}

async function initCaptacion() {
  _crEnsureStyles();
  const panel = document.getElementById("panel-captacion"); if (!panel) return;
  panel.innerHTML = `<div class="cr-wrap"><div class="cr-sub">Cargando…</div></div>`;
  const [le, gr, ce] = await Promise.all([
    sb.from("leads").select("*").eq("centro_id", ctrId).order("created_at", { ascending: false }).limit(500),
    sb.from("grupos").select("id,nombre,asignatura,nivel,cuota_mensual,capacidad,publicado").eq("centro_id", ctrId).eq("activo", true).order("nombre"),
    sb.from("centros").select("slug").eq("id", ctrId).maybeSingle(),
  ]);
  _crLeads = le.data || []; _crGrupos = gr.data || []; _crSlug = ce.data?.slug || "";
  _crRender();
}

function _crRender() {
  const panel = document.getElementById("panel-captacion"); if (!panel) return;
  const per = new Date().toISOString().slice(0, 7);
  const delMes = _crLeads.filter(l => String(l.created_at).slice(0, 7) === per);
  const abiertos = _crLeads.filter(l => ["nuevo", "contactado", "prueba"].includes(l.estado));
  const cerrados = _crLeads.filter(l => ["matriculado", "perdido"].includes(l.estado));
  const matriculados = _crLeads.filter(l => l.estado === "matriculado");
  const conversion = cerrados.length ? Math.round(matriculados.length / cerrados.length * 100) : 0;
  const pipeline = abiertos.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
  const publicados = _crGrupos.filter(g => g.publicado).length;

  const q = _crFiltro.trim().toLowerCase();
  const visibles = q
    ? _crLeads.filter(l => (_crNombre(l) + " " + (l.email || "") + " " + (l.telefono || "") + " " + (l.interes || "")).toLowerCase().includes(q))
    : _crLeads;

  panel.innerHTML = `
    <div class="cr-wrap">
      <h1 class="cr-h">Captación</h1>
      <div class="cr-sub">De interesado a alumno matriculado, sin perder ninguno por el camino</div>

      <div class="cr-kpis">
        <div class="cr-kpi"><div class="cr-kpi-n">${delMes.length}</div><div class="cr-kpi-l">Interesados este mes</div></div>
        <div class="cr-kpi"><div class="cr-kpi-n">${abiertos.length}</div><div class="cr-kpi-l">En el embudo</div></div>
        <div class="cr-kpi"><div class="cr-kpi-n">${conversion}%</div><div class="cr-kpi-l">Tasa de conversión</div></div>
        <div class="cr-kpi"><div class="cr-kpi-n">${_crEur(pipeline)}</div><div class="cr-kpi-l">Pipeline (cuota/mes)</div></div>
        <div class="cr-kpi"><div class="cr-kpi-n">${matriculados.length}</div><div class="cr-kpi-l">Matriculados</div></div>
      </div>

      <div class="cr-sec">Tu formulario de inscripción</div>
      ${_crSlug ? `<div class="cr-link">
        <span>Comparte este enlace en tu web, Google e Instagram:</span>
        <code id="cr-url">${_crEsc(_crUrlPublica())}</code>
        <button class="cr-btn cr-btn-sm" onclick="_crCopiarUrl(this)">Copiar</button>
        <a class="cr-btn cr-btn-sm" href="${_crEsc(_crUrlPublica())}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">Abrir</a>
        <span class="cr-sub" style="margin-left:auto">${publicados} clase(s) publicadas en el catálogo</span>
      </div>
      ${!publicados ? `<div class="cr-sub" style="margin-top:8px">Ningún grupo está publicado todavía: el formulario funcionará igual, pero sin catálogo de clases. Marca los grupos que quieras mostrar en <strong>Grupos</strong>.</div>` : ""}`
      : `<div class="cr-sub">Esta academia no tiene identificador público (slug) configurado.</div>`}

      <div class="cr-sec">
        <span>Embudo</span>
        <span style="display:flex;gap:8px;align-items:center">
          <input class="cr-in" style="width:200px" id="cr-q" placeholder="Buscar…" value="${_crEsc(_crFiltro)}" oninput="_crBuscar(this.value)">
          <button class="cr-btn cr-btn-p" onclick="_crToggle()">${_crNuevo ? "Cancelar" : "+ Nuevo interesado"}</button>
        </span>
      </div>

      ${_crNuevo ? `<div class="cr-form">
        <div class="cr-grid">
          <div><label class="cr-lbl">Nombre *</label><input class="cr-in" id="cr-n-nombre"></div>
          <div><label class="cr-lbl">Teléfono</label><input class="cr-in" id="cr-n-tel"></div>
          <div><label class="cr-lbl">Email</label><input class="cr-in" id="cr-n-email" type="email"></div>
          <div><label class="cr-lbl">Origen</label><select class="cr-sel" id="cr-n-origen">${_crOrigenes.map(o => `<option value="${o}">${o}</option>`).join("")}</select></div>
          <div><label class="cr-lbl">Nivel / curso</label><input class="cr-in" id="cr-n-nivel" placeholder="3º ESO"></div>
          <div><label class="cr-lbl">Grupo de interés</label><select class="cr-sel" id="cr-n-grupo"><option value="">—</option>${_crGrupos.map(g => `<option value="${g.id}">${_crEsc(g.nombre)}</option>`).join("")}</select></div>
          <div style="grid-column:span 3"><label class="cr-lbl">Qué busca</label><input class="cr-in" id="cr-n-interes" placeholder="Refuerzo de matemáticas, prepara selectividad…"></div>
        </div>
        <div style="display:flex;gap:10px;align-items:center"><button class="cr-btn cr-btn-p" onclick="_crCrear()">Guardar</button><span class="cr-sub" id="cr-n-msg"></span></div>
      </div>` : ""}

      <div class="cr-board">
        ${_crEstados.map(e => _crColumnaHtml(e, visibles.filter(l => l.estado === e.k))).join("")}
      </div>
    </div>`;
  _crCablearDnD();
}

function _crColumnaHtml(e, leads) {
  return `<div class="cr-col" data-estado="${e.k}" style="--col:${e.c}">
    <div class="cr-col-h" style="color:${e.c}">${e.l}<span class="cr-col-n">${leads.length}</span></div>
    ${leads.length ? leads.map(l => _crCardHtml(l, e)).join("") : `<div class="cr-empty">—</div>`}
  </div>`;
}

function _crCardHtml(l, e) {
  const dias = _crDiasDesde(l.created_at);
  const frio = ["nuevo", "contactado"].includes(l.estado) && dias >= 7;
  const grupo = _crGrupos.find(g => g.id === l.grupo_id);
  return `<div class="cr-card" draggable="true" data-id="${_crEsc(l.id)}">
    <div class="cr-card-n">${_crEsc(_crNombre(l))}</div>
    <div class="cr-card-m">
      ${l.telefono ? `<div>📞 <a href="tel:${_crEsc(l.telefono)}" style="color:inherit">${_crEsc(l.telefono)}</a></div>` : ""}
      ${l.email ? `<div>✉️ <a href="mailto:${_crEsc(l.email)}" style="color:inherit">${_crEsc(l.email)}</a></div>` : ""}
      ${l.interes ? `<div style="margin-top:3px">${_crEsc(l.interes)}</div>` : ""}
      ${grupo ? `<div style="margin-top:3px">${_crEsc(grupo.nombre)}</div>` : ""}
      ${l.fecha_prueba ? `<div style="margin-top:3px">🗓 Prueba: ${_crEsc(l.fecha_prueba)}${l.hora_prueba ? " " + _crEsc(String(l.hora_prueba).slice(0, 5)) : ""}</div>` : ""}
      ${l.motivo_perdida ? `<div style="margin-top:3px">${_crEsc(l.motivo_perdida)}</div>` : ""}
    </div>
    <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap;align-items:center">
      <span class="cr-tag">${_crEsc(l.origen)}</span>
      <span class="cr-tag ${frio ? "cr-viejo" : ""}">${dias === 0 ? "hoy" : dias + " d"}</span>
      ${l.valor_estimado ? `<span class="cr-tag">${_crEur(l.valor_estimado)}/mes</span>` : ""}
    </div>
    <div class="cr-card-acts">
      ${l.estado === "nuevo" ? `<button class="cr-btn cr-btn-sm" onclick="_crMover('${escArg(l.id)}','contactado')">Contactado</button>` : ""}
      ${["nuevo", "contactado"].includes(l.estado) ? `<button class="cr-btn cr-btn-sm" onclick="_crPrueba('${escArg(l.id)}')">Clase de prueba</button>` : ""}
      ${["nuevo", "contactado", "prueba"].includes(l.estado) ? `<button class="cr-btn cr-btn-sm cr-btn-p" onclick="_crConvertir('${escArg(l.id)}')">Matricular</button>` : ""}
      ${["nuevo", "contactado", "prueba"].includes(l.estado) ? `<button class="cr-btn cr-btn-sm" onclick="_crPerder('${escArg(l.id)}')">Perdido</button>` : ""}
      ${l.estado !== "matriculado" ? `<button class="cr-btn cr-btn-sm" title="Redactar mensaje de seguimiento con IA" onclick="_crSeguimiento('${escArg(l.id)}',this)">✨</button>` : ""}
    </div>
  </div>`;
}

// Arrastrar tarjetas entre columnas
function _crCablearDnD() {
  let arrastrado = null;
  document.querySelectorAll("#panel-captacion .cr-card").forEach(card => {
    card.addEventListener("dragstart", () => { arrastrado = card.dataset.id; card.style.opacity = ".4"; });
    card.addEventListener("dragend", () => { card.style.opacity = ""; });
  });
  document.querySelectorAll("#panel-captacion .cr-col").forEach(col => {
    col.addEventListener("dragover", (ev) => { ev.preventDefault(); col.classList.add("drag"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag"));
    col.addEventListener("drop", (ev) => {
      ev.preventDefault(); col.classList.remove("drag");
      const id = arrastrado; arrastrado = null;
      if (!id) return;
      const destino = col.dataset.estado;
      const lead = _crLeads.find(l => l.id === id);
      if (!lead || lead.estado === destino) return;
      if (destino === "matriculado") { _crConvertir(id); return; }
      if (destino === "perdido") { _crPerder(id); return; }
      _crMover(id, destino);
    });
  });
}

function _crToggle() { _crNuevo = !_crNuevo; _crRender(); }
function _crBuscar(v) {
  _crFiltro = v;
  clearTimeout(window._crT);
  window._crT = setTimeout(() => {
    _crRender();
    const i = document.getElementById("cr-q");
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }, 250);
}

function _crCopiarUrl(btn) {
  const url = _crUrlPublica(); if (!url || !navigator.clipboard) return;
  navigator.clipboard.writeText(url).then(() => {
    const t = btn.textContent; btn.textContent = "¡Copiado!";
    setTimeout(() => { btn.textContent = t; }, 1600);
  }).catch(() => {});
}

async function _crCrear() {
  const msg = document.getElementById("cr-n-msg");
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  if (!val("cr-n-nombre")) { if (msg) { msg.textContent = "Indica el nombre."; msg.style.color = "var(--danger)"; } return; }
  if (!val("cr-n-tel") && !val("cr-n-email")) { if (msg) { msg.textContent = "Pon al menos un teléfono o un email."; msg.style.color = "var(--danger)"; } return; }
  const grupoId = val("cr-n-grupo") || null;
  const grupo = _crGrupos.find(g => g.id === grupoId);
  const { error } = await sb.from("leads").insert({
    centro_id: ctrId, nombre: val("cr-n-nombre"),
    telefono: val("cr-n-tel") || null, email: val("cr-n-email").toLowerCase() || null,
    origen: val("cr-n-origen") || "otro", nivel: val("cr-n-nivel") || null,
    interes: val("cr-n-interes") || null, grupo_id: grupoId,
    valor_estimado: grupo?.cuota_mensual || null,
    estado: "nuevo",
    responsable: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
  });
  if (error) { if (msg) { msg.textContent = "Error: " + error.message; msg.style.color = "var(--danger)"; } return; }
  showToastGlobal("Interesado registrado", "success");
  _crNuevo = false;
  await initCaptacion();
}

async function _crMover(id, estado) {
  const { error } = await sb.from("leads").update({ estado, updated_at: new Date().toISOString() }).eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  await initCaptacion();
}

async function _crPrueba(id) {
  const l = _crLeads.find(x => x.id === id); if (!l) return;
  const fecha = prompt("Fecha de la clase de prueba (AAAA-MM-DD):", _crHoy());
  if (!fecha) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { showToastGlobal("Formato de fecha no válido", "error"); return; }
  const hora = prompt("Hora (HH:MM), opcional:", "17:00") || null;
  const { error } = await sb.from("leads").update({
    estado: "prueba", fecha_prueba: fecha,
    hora_prueba: hora && /^\d{1,2}:\d{2}$/.test(hora) ? hora : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  showToastGlobal("Clase de prueba programada para el " + fecha, "success");
  await initCaptacion();
}

async function _crPerder(id) {
  const motivo = prompt("¿Por qué se ha perdido? (precio, horario, distancia, no contesta…)");
  if (motivo === null) return;
  const { error } = await sb.from("leads").update({
    estado: "perdido", motivo_perdida: motivo || null, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  await initCaptacion();
}

async function _crConvertir(id) {
  const l = _crLeads.find(x => x.id === id); if (!l) return;
  const sug = l.valor_estimado || "";
  const cuota = prompt(`Matricular a ${_crNombre(l)}.\n\nCuota mensual (€):`, sug);
  if (cuota === null) return;
  try {
    const { error } = await sb.rpc("convertir_lead", { p_lead: id, p_cuota: cuota === "" ? null : Number(cuota) });
    if (error) throw new Error(error.message);
    showToastGlobal(_crNombre(l) + " matriculado/a · ficha de alumno creada", "success");
    await initCaptacion();
  } catch (e) { showToastGlobal("Error: " + (e.message || e), "error"); }
}

// ✨ Mensaje de seguimiento redactado por IA
async function _crSeguimiento(id, btn) {
  const l = _crLeads.find(x => x.id === id); if (!l) return;
  const orig = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    const grupo = _crGrupos.find(g => g.id === l.grupo_id);
    const ctx = [
      `Academia: ${ctrName || "la academia"}`,
      `Interesado: ${_crNombre(l)}`,
      l.nivel ? `Curso: ${l.nivel}` : "",
      l.interes ? `Busca: ${l.interes}` : "",
      grupo ? `Grupo de interés: ${grupo.nombre}${grupo.cuota_mensual ? ` (${grupo.cuota_mensual} €/mes)` : ""}` : "",
      l.mensaje ? `Nos escribió: "${l.mensaje}"` : "",
      `Estado actual: ${l.estado}`,
      `Días desde el primer contacto: ${_crDiasDesde(l.created_at)}`,
      l.fecha_prueba ? `Clase de prueba el ${l.fecha_prueba}` : "",
    ].filter(Boolean).join("\n");
    const texto = await iaChat(
      "Eres el responsable de una academia de refuerzo en España. Redacta un mensaje BREVE (máximo 90 palabras) de seguimiento comercial para enviar por WhatsApp a una familia interesada. Tono cercano, profesional y nada agresivo, de tú. Sin emojis excesivos (máximo uno). Termina con una pregunta concreta que facilite la respuesta. Devuelve SOLO el mensaje, sin encabezados ni comillas.",
      ctx
    );
    iaModal("Seguimiento de " + _crNombre(l), texto);
  } catch (e) {
    showToastGlobal("No se pudo generar el mensaje: " + (e.message || e), "error");
  } finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}

window.initCaptacion = initCaptacion;
window._crToggle = _crToggle; window._crCrear = _crCrear; window._crBuscar = _crBuscar;
window._crMover = _crMover; window._crPrueba = _crPrueba; window._crPerder = _crPerder;
window._crConvertir = _crConvertir; window._crSeguimiento = _crSeguimiento; window._crCopiarUrl = _crCopiarUrl;
