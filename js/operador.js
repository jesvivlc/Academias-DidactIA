// ── PANEL DE OPERADOR (Fase 14) ──
// La consola del dueño de la plataforma, no la de las academias: alta de
// clientes nuevos, cartera, uso frente al plan contratado y facturación
// recurrente. Solo rol superadmin. Tab `operador`.

let _opDatos = [], _opAlta = false, _opEditando = null, _opUltimaAlta = null;

const _opPlanes = [
  { k: "esencial", l: "Esencial", precio: 39, limite: 100 },
  { k: "academia", l: "Academia", precio: 79, limite: 300 },
  { k: "pro", l: "Pro", precio: 139, limite: 600 },
  { k: "amedida", l: "A medida", precio: 0, limite: null },
];
const _opEstados = [["trial", "En prueba"], ["activa", "Activa"], ["suspendida", "Suspendida"], ["baja", "Baja"]];

function _opEsc(s) { return escH(s); }
function _opEur(n) { return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €"; }
function _opPlanL(k) { return (_opPlanes.find(p => p.k === k) || { l: k || "—" }).l; }
function _opEstadoL(k) { return (_opEstados.find(e => e[0] === k) || [, k || "—"])[1]; }
function _opDias(iso) {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}
function _opDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function _opEnsureStyles() {
  if (document.getElementById("op-styles")) return;
  const st = document.createElement("style"); st.id = "op-styles";
  st.textContent = `
    #panel-operador{padding:0!important;overflow-y:auto}
    .op-wrap{padding:22px 26px;max-width:1180px}
    .op-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .op-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .op-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .op-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:140px}
    .op-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .op-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .op-kpi-mrr{background:var(--ink);border-color:var(--ink)}
    .op-kpi-mrr .op-kpi-n{color:#fff}
    .op-kpi-mrr .op-kpi-l{color:rgba(255,255,255,.7)}
    .op-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:22px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .op-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:16px;background:var(--paper-2,var(--srf2));margin-bottom:14px}
    .op-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .op-in,.op-sel{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit;color:var(--txt,inherit)}
    .op-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .op-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
    .op-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .op-btn-sm{padding:4px 10px;font-size:11.5px}
    .op-tbl{width:100%;border-collapse:collapse;font-size:13px}
    .op-tbl th,.op-tbl td{text-align:left;padding:9px;border-bottom:1px solid var(--line,var(--bdr));vertical-align:middle}
    .op-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,var(--txt3))}
    .op-tbl td.n,.op-tbl th.n{text-align:right}
    .op-tbl tr.susp{opacity:.5}
    .op-name{font-weight:600}
    .op-slug{font-size:11px;color:var(--muted,var(--txt3));font-family:ui-monospace,monospace}
    .op-pill{font-size:10.5px;padding:2px 8px;border-radius:20px;display:inline-block;white-space:nowrap}
    .op-p-ok{background:var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)}
    .op-p-tri{background:var(--info-soft,#e4ecf7);color:var(--info,#4D6FA8)}
    .op-p-warn{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .op-p-off{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .op-uso{min-width:104px}
    .op-bar{height:6px;border-radius:6px;background:var(--paper-2,var(--srf2));overflow:hidden;margin-top:3px}
    .op-bar i{display:block;height:100%;background:var(--ink)}
    .op-bar i.lleno{background:var(--danger,#c0392b)}
    .op-bar i.casi{background:var(--warning,#b8860b)}
    .op-avisos{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
    .op-aviso{border:1px solid var(--line,var(--bdr));border-left:3px solid var(--warning,#b8860b);border-radius:10px;padding:11px 14px;background:var(--srf);font-size:12.5px}
    .op-aviso h5{margin:0 0 5px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--warning,#b8860b)}
    .op-aviso.malo{border-left-color:var(--danger,#c0392b)}
    .op-aviso.malo h5{color:var(--danger,#c0392b)}
    .op-aviso ul{margin:0;padding-left:16px;color:var(--txt2,#555);line-height:1.7}
    .op-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:10px 0}
    .op-exito{border:1px solid var(--success,#2e7d32);background:var(--success-soft,#e3f2ec);border-radius:12px;padding:16px 18px;margin-bottom:14px}
    .op-cod{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:12.5px;margin-top:6px}
    .op-cod strong{font-family:ui-monospace,monospace;letter-spacing:.06em;user-select:all}
    .op-nota{font-size:12px;color:var(--muted,var(--txt3));margin-top:6px}
    @media(max-width:820px){.op-grid{grid-template-columns:1fr}.op-wrap{padding:16px 14px}.op-tbl{font-size:12px}.op-tbl th,.op-tbl td{padding:7px 5px}}
  `;
  document.head.appendChild(st);
}

async function initOperador() {
  _opEnsureStyles();
  const panel = document.getElementById("panel-operador"); if (!panel) return;
  if (typeof role !== "undefined" && role !== "superadmin") {
    panel.innerHTML = `<div class="op-wrap"><h1 class="op-h">Panel de operador</h1>
      <div class="op-sub">Esta pantalla es la consola de la plataforma y solo está disponible para el rol <strong>superadmin</strong>.</div></div>`;
    return;
  }
  panel.innerHTML = `<div class="op-wrap"><div class="op-sub">Cargando cartera…</div></div>`;
  const { data, error } = await sb.rpc("panel_operador");
  if (error) {
    panel.innerHTML = `<div class="op-wrap"><h1 class="op-h">Panel de operador</h1>
      <div class="op-sub" style="color:var(--danger)">No se ha podido cargar: ${_opEsc(error.message)}</div></div>`;
    return;
  }
  _opDatos = data || [];
  _opRender();
}

function _opRender() {
  const panel = document.getElementById("panel-operador"); if (!panel) return;
  const d = _opDatos;
  const activas = d.filter(a => a.estado_suscripcion === "activa");
  const trials = d.filter(a => a.estado_suscripcion === "trial");
  const suspendidas = d.filter(a => ["suspendida", "baja"].includes(a.estado_suscripcion));
  const mrr = activas.reduce((s, a) => s + Number(a.precio_mensual || 0), 0);
  const alumnos = d.reduce((s, a) => s + Number(a.alumnos_activos || 0), 0);
  const mesActual = new Date().toISOString().slice(0, 7);
  const altasMes = d.filter(a => String(a.fecha_alta || a.created_at).slice(0, 7) === mesActual).length;

  // Avisos accionables
  const trialCaduca = trials.filter(a => { const n = _opDias(a.trial_hasta); return n !== null && n <= 3; });
  const pasadas = d.filter(a => a.limite && a.alumnos_activos > a.limite);
  const dormidas = d.filter(a => a.estado_suscripcion !== "baja" && (_opDesde(a.ultima_actividad) === null || _opDesde(a.ultima_actividad) > 30));

  panel.innerHTML = `
    <div class="op-wrap">
      <h1 class="op-h">Panel de operador</h1>
      <div class="op-sub">Alta de academias, cartera de clientes y facturación recurrente</div>

      <div class="op-kpis">
        <div class="op-kpi op-kpi-mrr"><div class="op-kpi-n">${_opEur(mrr)}</div><div class="op-kpi-l">Ingreso recurrente / mes</div></div>
        <div class="op-kpi"><div class="op-kpi-n">${activas.length}</div><div class="op-kpi-l">Academias activas</div></div>
        <div class="op-kpi"><div class="op-kpi-n">${trials.length}</div><div class="op-kpi-l">En prueba</div></div>
        <div class="op-kpi"><div class="op-kpi-n">${altasMes}</div><div class="op-kpi-l">Altas este mes</div></div>
        <div class="op-kpi"><div class="op-kpi-n">${alumnos}</div><div class="op-kpi-l">Alumnos en la plataforma</div></div>
        ${suspendidas.length ? `<div class="op-kpi"><div class="op-kpi-n">${suspendidas.length}</div><div class="op-kpi-l">Suspendidas o de baja</div></div>` : ""}
      </div>

      ${(trialCaduca.length || pasadas.length || dormidas.length) ? `
      <div class="op-sec">Requiere tu atención</div>
      <div class="op-avisos">
        ${trialCaduca.length ? `<div class="op-aviso"><h5>Pruebas que terminan ya</h5><ul>${trialCaduca.map(a => {
          const n = _opDias(a.trial_hasta);
          return `<li>${_opEsc(a.nombre)} — ${n < 0 ? "caducada" : n === 0 ? "termina hoy" : "quedan " + n + " día(s)"}</li>`;
        }).join("")}</ul></div>` : ""}
        ${pasadas.length ? `<div class="op-aviso"><h5>Por encima de su plan</h5><ul>${pasadas.map(a =>
          `<li>${_opEsc(a.nombre)} — ${a.alumnos_activos} alumnos con límite de ${a.limite}. Toca subir de plan.</li>`).join("")}</ul></div>` : ""}
        ${dormidas.length ? `<div class="op-aviso malo"><h5>Sin actividad</h5><ul>${dormidas.map(a => {
          const n = _opDesde(a.ultima_actividad);
          return `<li>${_opEsc(a.nombre)} — ${n === null ? "nunca han empezado a usarla" : "nada desde hace " + n + " días"}</li>`;
        }).join("")}</ul></div>` : ""}
      </div>` : ""}

      ${_opUltimaAlta ? _opExitoHtml() : ""}

      <div class="op-sec">
        <span>Cartera · ${d.length} academia(s)</span>
        <span style="display:flex;gap:8px">
          ${d.length ? `<button class="op-btn" onclick="_opExportar()">📗 Exportar</button>` : ""}
          <button class="op-btn op-btn-p" onclick="_opToggleAlta()">${_opAlta ? "Cancelar" : "+ Dar de alta una academia"}</button>
        </span>
      </div>

      ${_opAlta ? _opAltaHtml() : ""}

      ${d.length ? `<div style="overflow-x:auto"><table class="op-tbl">
        <thead><tr>
          <th>Academia</th><th>Plan</th><th>Uso</th><th class="n">Grupos</th><th class="n">Equipo</th>
          <th class="n">Cobrado mes</th><th>Estado</th><th>Actividad</th><th></th>
        </tr></thead><tbody>
        ${d.map(a => _opFilaHtml(a)).join("")}
      </tbody></table></div>` : `<div class="op-empty">Todavía no hay ninguna academia dada de alta.</div>`}

      ${_opEditando ? _opEditarHtml() : ""}
    </div>`;
}

function _opFilaHtml(a) {
  const lim = a.limite, uso = Number(a.alumnos_activos || 0);
  const pct = lim ? Math.min(100, Math.round(uso / lim * 100)) : 0;
  const clase = lim && uso > lim ? "lleno" : lim && pct >= 85 ? "casi" : "";
  const dias = _opDesde(a.ultima_actividad);
  const est = a.estado_suscripcion;
  const pill = est === "activa" ? "op-p-ok" : est === "trial" ? "op-p-tri" : "op-p-off";
  const trialN = _opDias(a.trial_hasta);
  return `<tr class="${["suspendida", "baja"].includes(est) ? "susp" : ""}">
    <td><div class="op-name">${_opEsc(a.nombre)}</div><div class="op-slug">${_opEsc(a.slug)}</div></td>
    <td>${_opEsc(_opPlanL(a.plan))}<div class="op-slug">${_opEur(a.precio_mensual)}/${a.ciclo === "anual" ? "año" : "mes"}</div></td>
    <td class="op-uso">${uso}${lim ? ` / ${lim}` : ` <span class="op-slug">sin límite</span>`}
      ${lim ? `<div class="op-bar"><i class="${clase}" style="width:${pct}%"></i></div>` : ""}</td>
    <td class="n">${a.grupos || 0}</td>
    <td class="n">${a.staff || 0}</td>
    <td class="n">${_opEur(a.cobrado_mes)}</td>
    <td><span class="op-pill ${pill}">${_opEsc(_opEstadoL(est))}</span>
      ${est === "trial" && trialN !== null ? `<div class="op-slug">${trialN < 0 ? "caducada" : trialN + " d"}</div>` : ""}</td>
    <td class="op-slug">${dias === null ? "sin uso" : dias === 0 ? "hoy" : dias + " d"}</td>
    <td style="white-space:nowrap">
      <button class="op-btn op-btn-sm" onclick="_opEditar('${escArg(a.id)}')">Gestionar</button>
      <button class="op-btn op-btn-sm" onclick="_opInvitar('${escArg(a.id)}',this)">Invitar admin</button>
    </td></tr>`;
}

// ── Alta ───────────────────────────────────────────────────────────────────
function _opToggleAlta() { _opAlta = !_opAlta; _opUltimaAlta = null; _opRender(); }

function _opAltaHtml() {
  return `<div class="op-form">
    <div class="op-grid">
      <div style="grid-column:span 2"><label class="op-lbl">Nombre de la academia *</label><input class="op-in" id="op-nombre" placeholder="Academia Las Acacias" oninput="_opAutoSlug()"></div>
      <div><label class="op-lbl">Identificador web (slug)</label><input class="op-in" id="op-slug" placeholder="se genera solo"></div>
      <div><label class="op-lbl">Plan</label><select class="op-sel" id="op-plan" onchange="_opPrecioPorPlan()">${_opPlanes.map(p => `<option value="${p.k}" ${p.k === "academia" ? "selected" : ""}>${p.l}${p.limite ? ` · hasta ${p.limite}` : ""}</option>`).join("")}</select></div>
      <div><label class="op-lbl">Precio (€/mes)</label><input class="op-in" id="op-precio" type="number" step="0.01" value="79"></div>
      <div><label class="op-lbl">Ciclo</label><select class="op-sel" id="op-ciclo"><option value="mensual">Mensual</option><option value="anual">Anual (10 meses)</option></select></div>
      <div><label class="op-lbl">Días de prueba</label><input class="op-in" id="op-trial" type="number" min="0" value="14"></div>
      <div><label class="op-lbl">Color de marca</label><input class="op-in" id="op-color" type="color" value="#1F2C4F" style="height:36px;padding:3px"></div>
      <div></div>
    </div>
    <div class="op-grid">
      <div><label class="op-lbl">Persona de contacto</label><input class="op-in" id="op-cnombre" placeholder="Nombre y apellidos"></div>
      <div><label class="op-lbl">Email de contacto</label><input class="op-in" id="op-cemail" type="email" placeholder="direccion@academia.es"></div>
      <div><label class="op-lbl">Teléfono</label><input class="op-in" id="op-ctel"></div>
      <div style="grid-column:span 3"><label class="op-lbl">Notas internas</label><input class="op-in" id="op-notas" placeholder="Cómo llegó, qué necesita, qué se le ha prometido…"></div>
    </div>
    <div style="display:flex;gap:10px;align-items:center">
      <button class="op-btn op-btn-p" onclick="_opCrear(this)">Dar de alta</button>
      <span class="op-sub" id="op-msg"></span>
    </div>
    <div class="op-nota">Se crean la academia, sus tres códigos de registro y su suscripción. Después podrás invitar a su primer administrador desde la propia ficha.</div>
  </div>`;
}

function _opAutoSlug() {
  const n = document.getElementById("op-nombre"), s = document.getElementById("op-slug");
  if (!n || !s || s.dataset.tocado) return;
  s.value = n.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  s.oninput = () => { s.dataset.tocado = "1"; };
}
function _opPrecioPorPlan() {
  const p = _opPlanes.find(x => x.k === document.getElementById("op-plan")?.value);
  const i = document.getElementById("op-precio");
  if (p && i) i.value = p.precio;
}

async function _opCrear(btn) {
  const msg = document.getElementById("op-msg");
  const err = (t) => { if (msg) { msg.textContent = t; msg.style.color = "var(--danger)"; } };
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  if (!val("op-nombre")) return err("El nombre es obligatorio.");
  if (btn) { btn.disabled = true; btn.textContent = "Dando de alta…"; }
  try {
    const { data, error } = await sb.rpc("alta_academia", {
      p_nombre: val("op-nombre"),
      p_slug: val("op-slug") || null,
      p_plan: val("op-plan") || "academia",
      p_precio: val("op-precio") === "" ? null : Number(val("op-precio")),
      p_ciclo: val("op-ciclo") || "mensual",
      p_trial: Number(val("op-trial") || 0),
      p_color: val("op-color") || null,
      p_contacto_nombre: val("op-cnombre") || null,
      p_contacto_email: val("op-cemail") || null,
      p_contacto_tel: val("op-ctel") || null,
      p_notas: val("op-notas") || null,
    });
    if (error) throw new Error(error.message);
    if (!data || data.ok === false) throw new Error((data && data.error) || "No se ha podido crear");
    _opUltimaAlta = { ...data, nombre: val("op-nombre"), email: val("op-cemail") || "" };
    _opAlta = false;
    showToastGlobal("Academia dada de alta", "success");
    await initOperador();
  } catch (e) {
    err("Error: " + (e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = "Dar de alta"; }
  }
}

function _opExitoHtml() {
  const a = _opUltimaAlta;
  return `<div class="op-exito">
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">✓ ${_opEsc(a.nombre)} ya está dada de alta</div>
    <div class="op-sub">Guarda estos códigos: son los que usarán sus familias y su personal para registrarse.</div>
    <div class="op-cod"><span>Código de familias</span><strong>${_opEsc(a.codigo_familia)}</strong></div>
    <div class="op-cod"><span>Código de profesionales</span><strong>${_opEsc(a.codigo_profesional)}</strong></div>
    <div class="op-cod"><span>Código de acceso general</span><strong>${_opEsc(a.codigo_acceso)}</strong></div>
    <div class="op-cod"><span>Formulario de inscripción</span><strong>${_opEsc(location.origin)}/inscripcion.html?a=${_opEsc(a.slug)}</strong></div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
      <input class="op-in" id="op-inv-email" style="max-width:280px" placeholder="email del administrador" value="${_opEsc(a.email || "")}">
      <button class="op-btn op-btn-p op-btn-sm" onclick="_opInvitarDirecto('${escArg(a.centro_id)}',this)">Invitar a su administrador</button>
      <button class="op-btn op-btn-sm" onclick="_opCerrarExito()">Listo</button>
      <span class="op-sub" id="op-inv-msg"></span>
    </div>
  </div>`;
}
function _opCerrarExito() { _opUltimaAlta = null; _opRender(); }

// ── Invitación del primer administrador ────────────────────────────────────
async function _opInvitar(centroId, btn) {
  const a = _opDatos.find(x => x.id === centroId);
  const email = prompt(`Invitar administrador de ${a ? a.nombre : "la academia"}.\n\nEmail:`, a?.contacto_email || "");
  if (!email) return;
  await _opEnviarInvitacion(centroId, email.trim(), btn);
}
async function _opInvitarDirecto(centroId, btn) {
  const email = (document.getElementById("op-inv-email")?.value || "").trim();
  const msg = document.getElementById("op-inv-msg");
  if (!email) { if (msg) { msg.textContent = "Pon un email."; msg.style.color = "var(--danger)"; } return; }
  await _opEnviarInvitacion(centroId, email, btn);
}

async function _opEnviarInvitacion(centroId, email, btn) {
  const orig = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Invitando…"; }
  try {
    const { data, error } = await sb.functions.invoke("invite-user", {
      body: {
        email, centro_id: centroId, rol: "admin",
        full_name: email.split("@")[0],
        caller_user_id: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const enlace = data?.invite_link;
    if (enlace) {
      if (navigator.clipboard) await navigator.clipboard.writeText(enlace).catch(() => {});
      iaModal("Invitación creada para " + email,
        (data.created ? "Cuenta creada. " : "La cuenta ya existía, así que es un enlace de acceso. ") +
        "Este es el enlace que debes enviarle (ya está copiado al portapapeles):\n\n" + enlace);
    } else {
      showToastGlobal("Invitación creada, pero sin enlace devuelto", "error");
    }
  } catch (e) {
    showToastGlobal("No se ha podido invitar: " + (e.message || e), "error");
  } finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}

// ── Gestión de una academia ya dada de alta ────────────────────────────────
function _opEditar(id) { _opEditando = _opDatos.find(a => a.id === id) || null; _opRender(); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }
function _opCerrarEditar() { _opEditando = null; _opRender(); }

function _opEditarHtml() {
  const a = _opEditando;
  return `<div class="op-sec">Gestionar ${_opEsc(a.nombre)}</div>
    <div class="op-form">
      <div class="op-grid">
        <div><label class="op-lbl">Plan</label><select class="op-sel" id="op-e-plan" onchange="_opPrecioEdit()">${_opPlanes.map(p => `<option value="${p.k}" ${p.k === a.plan ? "selected" : ""}>${p.l}${p.limite ? ` · hasta ${p.limite}` : ""}</option>`).join("")}</select></div>
        <div><label class="op-lbl">Precio (€/mes)</label><input class="op-in" id="op-e-precio" type="number" step="0.01" value="${_opEsc(a.precio_mensual || 0)}"></div>
        <div><label class="op-lbl">Ciclo</label><select class="op-sel" id="op-e-ciclo"><option value="mensual" ${a.ciclo === "mensual" ? "selected" : ""}>Mensual</option><option value="anual" ${a.ciclo === "anual" ? "selected" : ""}>Anual</option></select></div>
        <div><label class="op-lbl">Estado</label><select class="op-sel" id="op-e-estado">${_opEstados.map(([k, l]) => `<option value="${k}" ${k === a.estado_suscripcion ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div style="grid-column:span 2"><label class="op-lbl">Notas internas</label><input class="op-in" id="op-e-notas" value="${_opEsc(a.notas || "")}"></div>
      </div>
      <div class="op-nota" style="margin-bottom:12px">
        Contacto: ${_opEsc(a.contacto_nombre || "—")}${a.contacto_email ? ` · <a href="mailto:${_opEsc(a.contacto_email)}" style="color:inherit">${_opEsc(a.contacto_email)}</a>` : ""}${a.contacto_tel ? ` · ${_opEsc(a.contacto_tel)}` : ""}
        · Alta el ${_opEsc(a.fecha_alta || String(a.created_at).slice(0, 10))}
        · ${a.alumnos_activos} alumnos activos, ${a.familias} familias, ${a.staff} del equipo
        · ${_opEur(a.pendiente)} pendientes de cobro en su academia
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="op-btn op-btn-p" onclick="_opGuardar(this)">Guardar cambios</button>
        <button class="op-btn" onclick="_opCerrarEditar()">Cerrar</button>
        <span class="op-sub" id="op-e-msg"></span>
      </div>
      <div class="op-nota">Al poner el estado en <strong>suspendida</strong> o <strong>baja</strong>, su gente deja de poder entrar en la aplicación, pero no se borra nada: al reactivarla lo recuperan todo tal cual.</div>
    </div>`;
}
function _opPrecioEdit() {
  const p = _opPlanes.find(x => x.k === document.getElementById("op-e-plan")?.value);
  const i = document.getElementById("op-e-precio");
  if (p && i && p.precio) i.value = p.precio;
}

async function _opGuardar(btn) {
  const a = _opEditando; if (!a) return;
  const msg = document.getElementById("op-e-msg");
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  const estado = val("op-e-estado");
  let motivo = null;
  if (estado === "baja" && a.estado_suscripcion !== "baja") {
    motivo = prompt("¿Motivo de la baja? (precio, cierre de la academia, se pasa a otro software…)");
    if (motivo === null) return;
  }
  if (["suspendida", "baja"].includes(estado) && !["suspendida", "baja"].includes(a.estado_suscripcion)) {
    if (!confirm(`Vas a dejar sin acceso a todo el personal y las familias de ${a.nombre}. ¿Seguro?`)) return;
  }
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  try {
    const { error } = await sb.rpc("actualizar_suscripcion", {
      p_centro: a.id, p_plan: val("op-e-plan"),
      p_precio: val("op-e-precio") === "" ? null : Number(val("op-e-precio")),
      p_ciclo: val("op-e-ciclo"), p_estado: estado,
      p_notas: val("op-e-notas") || null, p_motivo_baja: motivo,
    });
    if (error) throw new Error(error.message);
    showToastGlobal("Suscripción actualizada", "success");
    _opEditando = null;
    await initOperador();
  } catch (e) {
    if (msg) { msg.textContent = "Error: " + (e.message || e); msg.style.color = "var(--danger)"; }
    if (btn) { btn.disabled = false; btn.textContent = "Guardar cambios"; }
  }
}

function _opExportar() {
  if (typeof XLSX === "undefined") { showToastGlobal("No se pudo cargar el exportador Excel", "error"); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(_opDatos.map(a => ({
    Academia: a.nombre, Identificador: a.slug, Plan: _opPlanL(a.plan),
    "Precio mensual": Number(a.precio_mensual || 0), Ciclo: a.ciclo,
    Estado: _opEstadoL(a.estado_suscripcion), "Alta": a.fecha_alta,
    "Alumnos activos": a.alumnos_activos, "Límite del plan": a.limite || "sin límite",
    Grupos: a.grupos, Equipo: a.staff, Familias: a.familias,
    "Cobrado este mes": Number(a.cobrado_mes || 0),
    "Pendiente de cobro": Number(a.pendiente || 0),
    "Última actividad": a.ultima_actividad || "",
    Contacto: a.contacto_nombre || "", Email: a.contacto_email || "", Teléfono: a.contacto_tel || "",
    Notas: a.notas || "",
  }))), "Cartera");
  XLSX.writeFile(wb, "cartera-academias-" + new Date().toISOString().slice(0, 10) + ".xlsx");
}

window.initOperador = initOperador;
window._opToggleAlta = _opToggleAlta; window._opAutoSlug = _opAutoSlug; window._opPrecioPorPlan = _opPrecioPorPlan;
window._opCrear = _opCrear; window._opCerrarExito = _opCerrarExito;
window._opInvitar = _opInvitar; window._opInvitarDirecto = _opInvitarDirecto;
window._opEditar = _opEditar; window._opCerrarEditar = _opCerrarEditar; window._opPrecioEdit = _opPrecioEdit;
window._opGuardar = _opGuardar; window._opExportar = _opExportar;
