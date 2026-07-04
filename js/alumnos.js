// ── ALUMNOS / MATRÍCULA (Fase 1) ──
// Directorio de alumnado + ficha completa + alta/baja + NEE + RGPD + cuota.
// Escapes centralizados en utils.js (escH / escArg). Filtra siempre por ctrId.

let _almData = [];
let _almSelId = null;
let _almFiltro = "activo";

function _almEsc(s) { return escH(s); }

function _almEnsureStyles() {
  if (document.getElementById("alm-styles")) return;
  const st = document.createElement("style");
  st.id = "alm-styles";
  st.textContent = `
    #panel-alumnos{padding:0!important}
    .alm-wrap{display:flex;height:100%;min-height:0}
    .alm-list{width:340px;border-right:1px solid var(--line,var(--bdr));display:flex;flex-direction:column;background:var(--paper-2,var(--srf2))}
    .alm-list-hdr{padding:16px 16px 10px}
    .alm-h1{font-family:var(--font-display,serif);font-size:22px;margin:0 0 2px}
    .alm-sub{font-size:12px;color:var(--muted,var(--txt3))}
    .alm-search{width:100%;margin-top:10px;padding:9px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf)}
    .alm-filtros{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
    .alm-chip{font-size:12px;padding:4px 10px;border-radius:20px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;color:var(--muted,var(--txt3))}
    .alm-chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
    .alm-items{flex:1;overflow-y:auto;padding:6px}
    .alm-item{padding:10px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px}
    .alm-item:hover{background:var(--srf)}
    .alm-item.sel{background:var(--ink-ll,rgba(0,0,0,.05));box-shadow:inset 3px 0 0 var(--ink)}
    .alm-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#fff;flex-shrink:0}
    .alm-it-nom{font-size:13.5px;font-weight:600}
    .alm-it-sub{font-size:11.5px;color:var(--muted,var(--txt3))}
    .alm-badge{font-size:10px;padding:2px 7px;border-radius:20px;margin-left:auto;white-space:nowrap}
    .alm-b-activo{background:var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)}
    .alm-b-baja{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .alm-b-prospecto{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .alm-detail{flex:1;overflow-y:auto;padding:26px 30px}
    .alm-empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted,var(--txt3));font-size:14px}
    .alm-form-h{font-family:var(--font-display,serif);font-size:24px;margin:0 0 2px}
    .alm-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px 16px;margin-top:14px}
    .alm-fld{display:flex;flex-direction:column;gap:4px}
    .alm-fld.full{grid-column:1/-1}
    .alm-lbl{font-size:11.5px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;letter-spacing:.04em}
    .alm-in,.alm-sel,.alm-ta{padding:9px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13.5px;background:var(--srf);font-family:inherit}
    .alm-ta{min-height:60px;resize:vertical}
    .alm-sec{margin-top:22px;font-size:12px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line,var(--bdr));padding-bottom:6px}
    .alm-chkrow{display:flex;align-items:center;gap:8px;font-size:13px}
    .alm-actions{margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .alm-btn{padding:10px 18px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13.5px;font-weight:600}
    .alm-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .alm-btn-d{color:var(--danger,#c0392b);border-color:var(--danger,#c0392b)}
    .alm-msg{font-size:13px;margin-left:auto}
    @media(max-width:820px){.alm-list{width:100%}.alm-wrap{flex-direction:column}.alm-detail{display:none}.alm-wrap.showdetail .alm-list{display:none}.alm-wrap.showdetail .alm-detail{display:block}}
  `;
  document.head.appendChild(st);
}

function _almColor(nombre) {
  const c = ["#2A7DA3","#7A5C9E","#3F9367","#C76B3D","#4D6FA8","#B8860B","#A32D2D","#0E7C7B"];
  let h = 0; for (const ch of (nombre||"?")) h = (h*31 + ch.charCodeAt(0)) & 0xffff;
  return c[h % c.length];
}
function _almIniciales(a) {
  const n = (a.nombre||"").trim(), ap = (a.apellidos||"").trim();
  return ((n[0]||"") + (ap[0]||n[1]||"")).toUpperCase() || "?";
}
function _almNombreCompleto(a) {
  return [a.nombre, a.apellidos].filter(Boolean).join(" ") || "(sin nombre)";
}

async function initAlumnos() {
  _almEnsureStyles();
  const panel = document.getElementById("panel-alumnos");
  if (!panel) return;
  panel.innerHTML = `
    <div class="alm-wrap" id="alm-wrap">
      <div class="alm-list">
        <div class="alm-list-hdr">
          <h1 class="alm-h1">Alumnos</h1>
          <div class="alm-sub">Matrícula y ficha del alumnado</div>
          <input class="alm-search" id="alm-search" placeholder="Buscar por nombre…" oninput="_almFiltrar()">
          <div class="alm-filtros">
            <span class="alm-chip on" data-f="activo" onclick="_almSetFiltro('activo')">Activos</span>
            <span class="alm-chip" data-f="prospecto" onclick="_almSetFiltro('prospecto')">Prospectos</span>
            <span class="alm-chip" data-f="baja" onclick="_almSetFiltro('baja')">Bajas</span>
            <span class="alm-chip" data-f="todos" onclick="_almSetFiltro('todos')">Todos</span>
          </div>
        </div>
        <div class="alm-items" id="alm-items"><div class="alm-sub" style="padding:12px">Cargando…</div></div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:8px"><button class="alm-btn alm-btn-p" style="width:100%" onclick="_almNuevo()">+ Nuevo alumno</button>
        ${["admin","admin_institucional","director","jefatura","superadmin"].includes(role)?`<button class="alm-btn" style="width:100%" onclick="_almRenovarCurso(this)">🔁 Renovar curso</button>`:""}</div>
      </div>
      <div class="alm-detail" id="alm-detail"><div class="alm-empty">Selecciona un alumno o crea uno nuevo.</div></div>
    </div>`;
  await _almLoad();
}

async function _almLoad() {
  const { data, error } = await sb.from("alumnos")
    .select("*").eq("centro_id", ctrId).order("apellidos", { nullsFirst: false }).order("nombre");
  if (error) { document.getElementById("alm-items").innerHTML = `<div class="alm-sub" style="padding:12px;color:var(--danger)">${_almEsc(error.message)}</div>`; return; }
  _almData = data || [];
  _almRenderList();
}

function _almSetFiltro(f) {
  _almFiltro = f;
  document.querySelectorAll(".alm-chip").forEach(c => c.classList.toggle("on", c.dataset.f === f));
  _almRenderList();
}
function _almFiltrar() { _almRenderList(); }

function _almRenderList() {
  const cont = document.getElementById("alm-items");
  if (!cont) return;
  const q = (document.getElementById("alm-search")?.value || "").toLowerCase().trim();
  let rows = _almData.filter(a => _almFiltro === "todos" || (a.estado || "activo") === _almFiltro);
  if (q) rows = rows.filter(a => _almNombreCompleto(a).toLowerCase().includes(q));
  if (!rows.length) { cont.innerHTML = `<div class="alm-sub" style="padding:12px">Sin alumnos${q?" para “"+_almEsc(q)+"”":""}.</div>`; return; }
  cont.innerHTML = rows.map(a => {
    const est = a.estado || "activo";
    return `<div class="alm-item ${a.id===_almSelId?"sel":""}" onclick="_almSelect('${escArg(a.id)}')">
      <div class="alm-av" style="background:${_almColor(a.nombre)}">${_almEsc(_almIniciales(a))}</div>
      <div style="min-width:0">
        <div class="alm-it-nom">${_almEsc(_almNombreCompleto(a))}</div>
        <div class="alm-it-sub">${_almEsc(a.nivel_educativo || a.curso || "—")}${a.nee?" · NEE":""}</div>
      </div>
      <span class="alm-badge alm-b-${est}">${est}</span>
    </div>`;
  }).join("");
}

function _almSelect(id) {
  _almSelId = id;
  _almRenderList();
  const a = _almData.find(x => x.id === id);
  if (a) _almRenderFicha(a);
  document.getElementById("alm-wrap")?.classList.add("showdetail");
}

function _almNuevo() {
  _almSelId = null;
  _almRenderList();
  _almRenderFicha(null);
  document.getElementById("alm-wrap")?.classList.add("showdetail");
}

function _fld(label, id, val, type, full) {
  return `<div class="alm-fld ${full?"full":""}"><label class="alm-lbl">${label}</label>
    <input class="alm-in" id="alm-${id}" type="${type||"text"}" value="${_almEsc(val==null?"":val)}"></div>`;
}
function _sel(label, id, val, opts) {
  return `<div class="alm-fld"><label class="alm-lbl">${label}</label>
    <select class="alm-sel" id="alm-${id}">${opts.map(o=>`<option value="${o}" ${o===val?"selected":""}>${o}</option>`).join("")}</select></div>`;
}

async function _almRenderFicha(a) {
  const det = document.getElementById("alm-detail");
  const nuevo = !a; a = a || {};
  // Matrícula asociada (la más reciente)
  let mat = null;
  if (!nuevo) {
    const { data } = await sb.from("matriculas").select("*").eq("alumno_id", a.id).order("created_at", { ascending:false }).limit(1);
    mat = (data || [])[0] || null;
  }
  det.innerHTML = `
    <h2 class="alm-form-h">${nuevo ? "Nuevo alumno" : _almEsc(_almNombreCompleto(a))}</h2>
    <div class="alm-sub">${nuevo ? "Alta de matrícula" : "Alta: "+(a.fecha_alta||"—")+(a.estado==="baja"?(" · Baja: "+(a.fecha_baja||"—")):"")}</div>

    <div class="alm-sec">Datos personales</div>
    <div class="alm-grid">
      ${_fld("Nombre *","nombre",a.nombre)}
      ${_fld("Apellidos","apellidos",a.apellidos)}
      ${_fld("Fecha de nacimiento","fecha_nacimiento",a.fecha_nacimiento,"date")}
      ${_fld("Teléfono","telefono",a.telefono,"tel")}
      ${_fld("Email de contacto","email_contacto",a.email_contacto,"email")}
      ${_fld("Dirección","direccion",a.direccion)}
    </div>

    <div class="alm-sec">Datos académicos</div>
    <div class="alm-grid">
      ${_fld("Nivel educativo","nivel_educativo",a.nivel_educativo)}
      ${_fld("Centro escolar de procedencia","centro_escolar",a.centro_escolar)}
      <div class="alm-fld full">
        <label class="alm-chkrow"><input type="checkbox" id="alm-nee" ${a.nee?"checked":""} onchange="document.getElementById('alm-nee_detalle').style.display=this.checked?'block':'none'"> Necesidades educativas especiales (NEE)</label>
        <textarea class="alm-ta" id="alm-nee_detalle" placeholder="Detalle de la NEE y adaptaciones" style="${a.nee?"":"display:none"}">${_almEsc(a.nee_detalle||"")}</textarea>
      </div>
    </div>

    <div class="alm-sec">Matrícula</div>
    <div class="alm-grid">
      ${_sel("Estado","estado",a.estado||"activo",["activo","prospecto","baja"])}
      ${_fld("Cuota mensual (€)","cuota_mensual",mat?.cuota_mensual,"number")}
      ${_sel("Forma de pago","forma_pago",mat?.forma_pago||"transferencia",["transferencia","efectivo","domiciliacion"])}
      ${_fld("Descuento (€)","descuento",mat?.descuento||0,"number")}
    </div>

    <div class="alm-sec">Protección de datos (RGPD)</div>
    <div class="alm-grid">
      <label class="alm-chkrow full"><input type="checkbox" id="alm-consentimiento_rgpd" ${a.consentimiento_rgpd?"checked":""}> Consentimiento de tratamiento de datos</label>
      <label class="alm-chkrow full"><input type="checkbox" id="alm-consentimiento_imagen" ${a.consentimiento_imagen?"checked":""}> Consentimiento de uso de imagen</label>
    </div>

    <div class="alm-sec">Notas</div>
    <div class="alm-grid"><div class="alm-fld full"><textarea class="alm-ta" id="alm-notas">${_almEsc(a.notas||"")}</textarea></div></div>

    <div class="alm-actions">
      <button class="alm-btn alm-btn-p" onclick="_almGuardar()">${nuevo?"Crear alumno":"Guardar cambios"}</button>
      ${!nuevo && a.estado!=="baja" ? `<button class="alm-btn alm-btn-d" onclick="_almBaja('${escArg(a.id)}')">Dar de baja</button>` : ""}
      ${!nuevo && a.estado==="baja" ? `<button class="alm-btn" onclick="_almReactivar('${escArg(a.id)}')">Reactivar</button>` : ""}
      <span class="alm-msg" id="alm-msg"></span>
    </div>`;
}

function _v(id) { const el = document.getElementById("alm-"+id); return el ? el.value.trim() : ""; }
function _chk(id) { const el = document.getElementById("alm-"+id); return !!(el && el.checked); }
function _num(id) { const v = _v(id); return v==="" ? null : Number(v); }

async function _almGuardar() {
  const msg = document.getElementById("alm-msg");
  const nombre = _v("nombre");
  if (!nombre) { if(msg){msg.textContent="El nombre es obligatorio."; msg.style.color="var(--danger)";} return; }
  const alumno = {
    centro_id: ctrId, nombre, apellidos: _v("apellidos") || null,
    fecha_nacimiento: _v("fecha_nacimiento") || null, telefono: _v("telefono") || null,
    email_contacto: _v("email_contacto") || null, direccion: _v("direccion") || null,
    nivel_educativo: _v("nivel_educativo") || null, centro_escolar: _v("centro_escolar") || null,
    nee: _chk("nee"), nee_detalle: _chk("nee") ? (_v("nee_detalle") || null) : null,
    estado: _v("estado") || "activo",
    consentimiento_rgpd: _chk("consentimiento_rgpd"), consentimiento_imagen: _chk("consentimiento_imagen"),
    notas: _v("notas") || null,
  };
  if (msg) { msg.textContent = "Guardando…"; msg.style.color = "var(--muted,var(--txt3))"; }
  let alumnoId = _almSelId;
  try {
    if (alumnoId) {
      const { error } = await sb.from("alumnos").update(alumno).eq("id", alumnoId).eq("centro_id", ctrId);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from("alumnos").insert(alumno).select("id").single();
      if (error) throw error;
      alumnoId = data.id;
    }
    // Matrícula (una por alumno; upsert de la más reciente)
    const matPayload = {
      centro_id: ctrId, alumno_id: alumnoId,
      estado: alumno.estado === "baja" ? "baja" : "activa",
      cuota_mensual: _num("cuota_mensual"), descuento: _num("descuento") || 0,
      forma_pago: _v("forma_pago") || null,
    };
    const { data: mExist } = await sb.from("matriculas").select("id").eq("alumno_id", alumnoId).order("created_at",{ascending:false}).limit(1);
    if ((mExist||[]).length) await sb.from("matriculas").update(matPayload).eq("id", mExist[0].id);
    else await sb.from("matriculas").insert(matPayload);

    if (typeof showToastGlobal === "function") showToastGlobal("Alumno guardado", "success");
    _almSelId = alumnoId;
    await _almLoad();
    const a = _almData.find(x => x.id === alumnoId);
    if (a) _almRenderFicha(a);
  } catch (e) {
    if (msg) { msg.textContent = "Error: " + (e.message || e); msg.style.color = "var(--danger)"; }
  }
}

async function _almBaja(id) {
  const motivo = prompt("Motivo de la baja (opcional):") || null;
  const { error } = await sb.from("alumnos").update({ estado:"baja", fecha_baja: new Date().toISOString().slice(0,10), motivo_baja: motivo }).eq("id", id).eq("centro_id", ctrId);
  if (!error) await sb.from("matriculas").update({ estado:"baja", fecha_baja: new Date().toISOString().slice(0,10) }).eq("alumno_id", id);
  if (typeof showToastGlobal === "function") showToastGlobal(error?("Error: "+error.message):"Alumno dado de baja", error?"error":"success");
  await _almLoad(); const a = _almData.find(x => x.id === id); if (a) _almRenderFicha(a);
}

async function _almReactivar(id) {
  const { error } = await sb.from("alumnos").update({ estado:"activo", fecha_baja:null, motivo_baja:null }).eq("id", id).eq("centro_id", ctrId);
  if (!error) await sb.from("matriculas").update({ estado:"activa", fecha_baja:null }).eq("alumno_id", id);
  if (typeof showToastGlobal === "function") showToastGlobal(error?("Error: "+error.message):"Alumno reactivado", error?"error":"success");
  await _almLoad(); const a = _almData.find(x => x.id === id); if (a) _almRenderFicha(a);
}

async function _almRenovarCurso(btn){
  const actual = (typeof cursoActivo!=="undefined" && cursoActivo) ? cursoActivo : "2025-26";
  // sugerencia de curso siguiente (2025-26 -> 2026-27)
  let sug=actual; const m=actual.match(/^(\d{4})-(\d{2})$/);
  if(m){ const a=parseInt(m[1],10)+1; sug=a+"-"+String((a+1)%100).padStart(2,"0"); }
  const nuevo=(window.prompt("Nuevo curso escolar para la renovación (ej "+sug+"):", sug)||"").trim();
  if(!nuevo) return;
  const { data:mats, error:e1 } = await sb.from("matriculas").select("id,alumno_id,cuota_mensual,forma_pago,descuento").eq("centro_id",ctrId).eq("estado","activa");
  if(e1){ if(typeof showToastGlobal==="function") showToastGlobal("Error: "+e1.message,"error"); return; }
  const lista=mats||[];
  if(!lista.length){ if(typeof showToastGlobal==="function") showToastGlobal("No hay matrículas activas que renovar","info"); return; }
  if(!confirm("¿Renovar "+lista.length+" matrícula(s) activa(s) al curso "+nuevo+"?\nLas actuales pasarán a 'renovada' y se crearán nuevas matrículas activas.")) return;
  if(btn){ btn.disabled=true; btn.textContent="Renovando…"; }
  try{
    const nuevas=lista.map(x=>({ centro_id:ctrId, alumno_id:x.alumno_id, estado:"activa", cuota_mensual:x.cuota_mensual, forma_pago:x.forma_pago, descuento:x.descuento||0, curso_escolar:nuevo }));
    const { error:e2 } = await sb.from("matriculas").insert(nuevas); if(e2) throw e2;
    const { error:e3 } = await sb.from("matriculas").update({ estado:"renovada" }).in("id", lista.map(x=>x.id)); if(e3) throw e3;
    if(typeof showToastGlobal==="function") showToastGlobal(lista.length+" matrícula(s) renovadas al curso "+nuevo,"success");
  }catch(e){
    if(typeof showToastGlobal==="function") showToastGlobal("Error al renovar: "+(e.message||e),"error");
  }finally{ if(btn){ btn.disabled=false; btn.textContent="🔁 Renovar curso"; } await _almLoad(); }
}
window._almRenovarCurso=_almRenovarCurso;

window.initAlumnos = initAlumnos;
window._almSelect = _almSelect;
window._almNuevo = _almNuevo;
window._almSetFiltro = _almSetFiltro;
window._almFiltrar = _almFiltrar;
window._almGuardar = _almGuardar;
window._almBaja = _almBaja;
window._almReactivar = _almReactivar;
