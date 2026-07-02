// ── GRUPOS + PROFESORES (Fase 1 · inc.2) ──
// CRUD de grupos, sus sesiones semanales y los alumnos asignados (vía
// matricula_grupo), + gestión ligera de profesores. Filtra por ctrId; RLS por centro.

let _grpData = [], _grpProfes = [], _grpSelId = null, _grpTab = "grupos";
let _grpSesiones = [];   // sesiones en edición del grupo abierto
const _DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function _grpEsc(s) { return escH(s); }
function _grpCurso() { return typeof cursoActivo !== "undefined" ? cursoActivo : "2025-26"; }

function _grpEnsureStyles() {
  if (document.getElementById("grp-styles")) return;
  const st = document.createElement("style");
  st.id = "grp-styles";
  st.textContent = `
    #panel-grupos{padding:0!important}
    .grp-top{display:flex;gap:8px;padding:14px 18px 0;border-bottom:1px solid var(--line,var(--bdr));background:var(--paper-2,var(--srf2))}
    .grp-tab{padding:9px 14px;font-size:13.5px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--muted,var(--txt3))}
    .grp-tab.on{color:var(--ink);border-color:var(--ink)}
    .grp-wrap{display:flex;height:calc(100% - 46px);min-height:0}
    .grp-list{width:320px;border-right:1px solid var(--line,var(--bdr));display:flex;flex-direction:column;background:var(--paper-2,var(--srf2))}
    .grp-list-hdr{padding:14px 16px 8px}
    .grp-items{flex:1;overflow-y:auto;padding:6px}
    .grp-item{padding:10px 12px;border-radius:8px;cursor:pointer}
    .grp-item:hover{background:var(--srf)}
    .grp-item.sel{background:var(--ink-ll,rgba(0,0,0,.05));box-shadow:inset 3px 0 0 var(--ink)}
    .grp-it-nom{font-size:13.5px;font-weight:600}
    .grp-it-sub{font-size:11.5px;color:var(--muted,var(--txt3))}
    .grp-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
    .grp-detail{flex:1;overflow-y:auto;padding:24px 28px}
    .grp-empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted,var(--txt3))}
    .grp-h{font-family:var(--font-display,serif);font-size:23px;margin:0 0 12px}
    .grp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px 16px}
    .grp-fld{display:flex;flex-direction:column;gap:4px}
    .grp-fld.full{grid-column:1/-1}
    .grp-lbl{font-size:11.5px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;letter-spacing:.04em}
    .grp-in,.grp-sel{padding:9px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13.5px;background:var(--srf);font-family:inherit}
    .grp-sec{margin-top:22px;font-size:12px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line,var(--bdr));padding-bottom:6px;display:flex;justify-content:space-between;align-items:center}
    .grp-ses{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr auto;gap:8px;align-items:center;margin-top:8px}
    .grp-ses input,.grp-ses select{padding:7px 9px;border:1px solid var(--line,var(--bdr));border-radius:7px;font-size:12.5px;background:var(--srf)}
    .grp-x{cursor:pointer;color:var(--danger,#c0392b);border:none;background:none;font-size:16px}
    .grp-al{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--line,var(--bdr));border-radius:8px;margin-top:6px;font-size:13px}
    .grp-btn{padding:9px 16px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600}
    .grp-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .grp-btn-sm{padding:5px 10px;font-size:12px}
    .grp-actions{margin-top:22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .grp-msg{font-size:13px;margin-left:auto}
    .grp-prof-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line,var(--bdr))}
    @media(max-width:860px){.grp-list{width:100%}.grp-wrap{flex-direction:column}.grp-grid{grid-template-columns:1fr}.grp-ses{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(st);
}

async function initGrupos() {
  _grpEnsureStyles();
  const panel = document.getElementById("panel-grupos");
  if (!panel) return;
  panel.innerHTML = `
    <div class="grp-top">
      <div class="grp-tab ${_grpTab==="grupos"?"on":""}" onclick="_grpSetTab('grupos')">Grupos</div>
      <div class="grp-tab ${_grpTab==="profes"?"on":""}" onclick="_grpSetTab('profes')">Profesores</div>
    </div>
    <div id="grp-body"></div>`;
  await _grpLoadProfes();
  if (_grpTab === "grupos") await _grpRenderGrupos(); else _grpRenderProfes();
}

function _grpSetTab(t) { _grpTab = t; initGrupos(); }

async function _grpLoadProfes() {
  const { data } = await sb.from("profesores").select("*").eq("centro_id", ctrId).order("nombre");
  _grpProfes = data || [];
}

/* ───────── GRUPOS ───────── */
async function _grpRenderGrupos() {
  const body = document.getElementById("grp-body");
  body.innerHTML = `
    <div class="grp-wrap">
      <div class="grp-list">
        <div class="grp-list-hdr"><h1 class="grp-h" style="font-size:20px;margin:0">Grupos</h1>
          <div class="grp-it-sub">Clases por asignatura y nivel</div></div>
        <div class="grp-items" id="grp-items"><div class="grp-it-sub" style="padding:12px">Cargando…</div></div>
        <div style="padding:12px"><button class="grp-btn grp-btn-p" style="width:100%" onclick="_grpNuevo()">+ Nuevo grupo</button></div>
      </div>
      <div class="grp-detail" id="grp-detail"><div class="grp-empty">Selecciona un grupo o crea uno nuevo.</div></div>
    </div>`;
  await _grpLoad();
}

async function _grpLoad() {
  const { data, error } = await sb.from("grupos").select("*").eq("centro_id", ctrId).eq("curso_escolar", _grpCurso()).order("nombre");
  const cont = document.getElementById("grp-items");
  if (error) { if(cont) cont.innerHTML = `<div style="padding:12px;color:var(--danger)">${_grpEsc(error.message)}</div>`; return; }
  _grpData = data || [];
  // conteo de alumnos por grupo
  const { data: mg } = await sb.from("matricula_grupo").select("grupo_id").eq("centro_id", ctrId);
  const counts = {}; (mg||[]).forEach(r => counts[r.grupo_id] = (counts[r.grupo_id]||0)+1);
  if (!cont) return;
  if (!_grpData.length) { cont.innerHTML = `<div class="grp-it-sub" style="padding:12px">Aún no hay grupos.</div>`; return; }
  cont.innerHTML = _grpData.map(g => `
    <div class="grp-item ${g.id===_grpSelId?"sel":""}" onclick="_grpSelect('${escArg(g.id)}')">
      <div class="grp-it-nom"><span class="grp-dot" style="background:${_grpEsc(g.color||"#888")}"></span>${_grpEsc(g.nombre)}</div>
      <div class="grp-it-sub">${_grpEsc(g.asignatura||"—")}${g.nivel?" · "+_grpEsc(g.nivel):""} · ${counts[g.id]||0} alumnos</div>
    </div>`).join("");
}

function _grpNuevo() { _grpSelId = null; _grpSesiones = []; _grpRenderFicha(null); }

function _grpSelect(id) {
  _grpSelId = id;
  const g = _grpData.find(x => x.id === id);
  _grpLoad();
  if (g) _grpRenderFicha(g);
}

async function _grpRenderFicha(g) {
  const nuevo = !g; g = g || {};
  const det = document.getElementById("grp-detail");
  // sesiones existentes
  if (!nuevo) {
    const { data } = await sb.from("grupo_sesiones").select("*").eq("grupo_id", g.id).order("dia_semana").order("hora_inicio");
    _grpSesiones = (data||[]).map(s => ({ dia_semana:s.dia_semana, hora_inicio:(s.hora_inicio||"").slice(0,5), hora_fin:(s.hora_fin||"").slice(0,5), aula:s.aula||"" }));
  } else { _grpSesiones = _grpSesiones.length ? _grpSesiones : []; }
  const profOpts = `<option value="">— Sin asignar —</option>` + _grpProfes.map(p =>
    `<option value="${p.id}" ${p.id===g.profesor_id?"selected":""}>${_grpEsc([p.nombre,p.apellidos].filter(Boolean).join(" "))}</option>`).join("");
  det.innerHTML = `
    <h2 class="grp-h">${nuevo?"Nuevo grupo":_grpEsc(g.nombre)}</h2>
    <div class="grp-grid">
      <div class="grp-fld"><label class="grp-lbl">Nombre *</label><input class="grp-in" id="grp-nombre" value="${_grpEsc(g.nombre||"")}"></div>
      <div class="grp-fld"><label class="grp-lbl">Asignatura</label><input class="grp-in" id="grp-asignatura" value="${_grpEsc(g.asignatura||"")}"></div>
      <div class="grp-fld"><label class="grp-lbl">Nivel</label><input class="grp-in" id="grp-nivel" value="${_grpEsc(g.nivel||"")}"></div>
      <div class="grp-fld"><label class="grp-lbl">Profesor</label><select class="grp-sel" id="grp-profesor_id">${profOpts}</select></div>
      <div class="grp-fld"><label class="grp-lbl">Aula</label><input class="grp-in" id="grp-aula" value="${_grpEsc(g.aula||"")}"></div>
      <div class="grp-fld"><label class="grp-lbl">Capacidad</label><input class="grp-in" id="grp-capacidad" type="number" value="${g.capacidad!=null?g.capacidad:""}"></div>
      <div class="grp-fld"><label class="grp-lbl">Cuota mensual (€)</label><input class="grp-in" id="grp-cuota_mensual" type="number" value="${g.cuota_mensual!=null?g.cuota_mensual:""}"></div>
      <div class="grp-fld"><label class="grp-lbl">Color</label><input class="grp-in" id="grp-color" type="color" value="${_grpEsc(g.color||"#2A7DA3")}"></div>
    </div>

    <div class="grp-sec">Sesiones semanales <button class="grp-btn grp-btn-sm" onclick="_grpAddSesion()">+ Añadir</button></div>
    <div id="grp-sesiones"></div>

    ${nuevo ? "" : `<div class="grp-sec">Alumnos del grupo <span id="grp-al-count" class="grp-it-sub"></span></div>
    <div id="grp-alumnos"></div>`}

    <div class="grp-actions">
      <button class="grp-btn grp-btn-p" onclick="_grpGuardar()">${nuevo?"Crear grupo":"Guardar cambios"}</button>
      ${nuevo?"":`<button class="grp-btn" onclick="_grpEliminar('${escArg(g.id)}')">Eliminar</button>`}
      <span class="grp-msg" id="grp-msg"></span>
    </div>`;
  _grpRenderSesiones();
  if (!nuevo) _grpRenderAlumnos(g.id);
}

function _grpRenderSesiones() {
  const cont = document.getElementById("grp-sesiones");
  if (!cont) return;
  if (!_grpSesiones.length) { cont.innerHTML = `<div class="grp-it-sub" style="margin-top:8px">Sin sesiones. Añade día y horario.</div>`; return; }
  cont.innerHTML = _grpSesiones.map((s,i) => `
    <div class="grp-ses">
      <select onchange="_grpSesSet(${i},'dia_semana',this.value)">${[1,2,3,4,5,6,7].map(d=>`<option value="${d}" ${d===s.dia_semana?"selected":""}>${_DIAS[d]}</option>`).join("")}</select>
      <input type="time" value="${_grpEsc(s.hora_inicio)}" onchange="_grpSesSet(${i},'hora_inicio',this.value)">
      <input type="time" value="${_grpEsc(s.hora_fin)}" onchange="_grpSesSet(${i},'hora_fin',this.value)">
      <input placeholder="Aula" value="${_grpEsc(s.aula)}" onchange="_grpSesSet(${i},'aula',this.value)">
      <button class="grp-x" onclick="_grpDelSesion(${i})">✕</button>
    </div>`).join("");
}
function _grpAddSesion() { _grpSesiones.push({ dia_semana:1, hora_inicio:"16:00", hora_fin:"17:00", aula:"" }); _grpRenderSesiones(); }
function _grpDelSesion(i) { _grpSesiones.splice(i,1); _grpRenderSesiones(); }
function _grpSesSet(i,k,v) { if(_grpSesiones[i]) _grpSesiones[i][k] = (k==="dia_semana")?Number(v):v; }

async function _grpRenderAlumnos(grupoId) {
  const cont = document.getElementById("grp-alumnos");
  if (!cont) return;
  // alumnos ya en el grupo
  const { data: links } = await sb.from("matricula_grupo")
    .select("id, matricula_id, matriculas(alumno_id, alumnos(id,nombre,apellidos,estado))")
    .eq("grupo_id", grupoId).eq("centro_id", ctrId);
  const inGrupo = (links||[]).map(l => ({ linkId:l.id, al:l.matriculas?.alumnos })).filter(x => x.al);
  const inIds = new Set(inGrupo.map(x => x.al.id));
  const cnt = document.getElementById("grp-al-count"); if (cnt) cnt.textContent = `(${inGrupo.length})`;
  // alumnos activos disponibles
  const { data: activos } = await sb.from("alumnos").select("id,nombre,apellidos").eq("centro_id", ctrId).eq("estado","activo").order("nombre");
  const disp = (activos||[]).filter(a => !inIds.has(a.id));
  cont.innerHTML =
    `<div style="display:flex;gap:8px;margin-top:8px">
       <select class="grp-sel" id="grp-add-alumno" style="flex:1">${disp.length?disp.map(a=>`<option value="${a.id}">${_grpEsc([a.nombre,a.apellidos].filter(Boolean).join(" "))}</option>`).join(""):`<option value="">(no hay alumnos activos libres)</option>`}</select>
       <button class="grp-btn grp-btn-sm" onclick="_grpAddAlumno('${escArg(grupoId)}')" ${disp.length?"":"disabled"}>Añadir</button>
     </div>` +
    (inGrupo.length ? inGrupo.map(x => `<div class="grp-al"><span>${_grpEsc([x.al.nombre,x.al.apellidos].filter(Boolean).join(" "))}</span><button class="grp-x" style="margin-left:auto" onclick="_grpDelAlumno('${escArg(x.linkId)}','${escArg(grupoId)}')">✕</button></div>`).join("") : `<div class="grp-it-sub" style="margin-top:8px">Aún no hay alumnos en este grupo.</div>`);
}

async function _grpAddAlumno(grupoId) {
  const sel = document.getElementById("grp-add-alumno");
  const alumnoId = sel && sel.value;
  if (!alumnoId) return;
  // matrícula del alumno (la más reciente); si no tiene, se crea una activa
  let { data: m } = await sb.from("matriculas").select("id").eq("alumno_id", alumnoId).order("created_at",{ascending:false}).limit(1);
  let matId = (m||[])[0]?.id;
  if (!matId) {
    const { data: nm } = await sb.from("matriculas").insert({ centro_id:ctrId, alumno_id:alumnoId, estado:"activa" }).select("id").single();
    matId = nm?.id;
  }
  const { error } = await sb.from("matricula_grupo").insert({ centro_id:ctrId, matricula_id:matId, grupo_id:grupoId });
  if (error && error.code !== "23505" && typeof showToastGlobal==="function") showToastGlobal("Error: "+error.message,"error");
  _grpRenderAlumnos(grupoId); _grpLoad();
}
async function _grpDelAlumno(linkId, grupoId) {
  await sb.from("matricula_grupo").delete().eq("id", linkId);
  _grpRenderAlumnos(grupoId); _grpLoad();
}

function _gv(id){const e=document.getElementById("grp-"+id);return e?e.value.trim():"";}
function _gnum(id){const v=_gv(id);return v===""?null:Number(v);}

async function _grpGuardar() {
  const msg = document.getElementById("grp-msg");
  const nombre = _gv("nombre");
  if (!nombre) { if(msg){msg.textContent="El nombre es obligatorio.";msg.style.color="var(--danger)";} return; }
  // solape de sesiones dentro del mismo grupo
  for (let i=0;i<_grpSesiones.length;i++) for (let j=i+1;j<_grpSesiones.length;j++){
    const a=_grpSesiones[i],b=_grpSesiones[j];
    if(a.dia_semana===b.dia_semana && a.hora_inicio<b.hora_fin && b.hora_inicio<a.hora_fin){
      if(msg){msg.textContent="Hay sesiones que se solapan el "+_DIAS[a.dia_semana]+".";msg.style.color="var(--danger)";} return;
    }
  }
  const payload = {
    centro_id:ctrId, nombre, asignatura:_gv("asignatura")||null, nivel:_gv("nivel")||null,
    profesor_id:_gv("profesor_id")||null, aula:_gv("aula")||null, capacidad:_gnum("capacidad"),
    cuota_mensual:_gnum("cuota_mensual"), color:_gv("color")||null, curso_escolar:_grpCurso(),
  };
  if(msg){msg.textContent="Guardando…";msg.style.color="var(--muted,var(--txt3))";}
  try {
    let gid = _grpSelId;
    if (gid) { const {error}=await sb.from("grupos").update(payload).eq("id",gid).eq("centro_id",ctrId); if(error)throw error; }
    else { const {data,error}=await sb.from("grupos").insert(payload).select("id").single(); if(error)throw error; gid=data.id; }
    // sesiones: borrar y reinsertar
    await sb.from("grupo_sesiones").delete().eq("grupo_id", gid);
    if (_grpSesiones.length) {
      const rows = _grpSesiones.filter(s=>s.hora_inicio&&s.hora_fin).map(s=>({centro_id:ctrId,grupo_id:gid,dia_semana:s.dia_semana,hora_inicio:s.hora_inicio,hora_fin:s.hora_fin,aula:s.aula||null}));
      if (rows.length) { const {error}=await sb.from("grupo_sesiones").insert(rows); if(error)throw error; }
    }
    if(typeof showToastGlobal==="function") showToastGlobal("Grupo guardado","success");
    _grpSelId = gid;
    await _grpLoad();
    const g = _grpData.find(x=>x.id===gid); if(g)_grpRenderFicha(g);
  } catch(e){ if(msg){msg.textContent="Error: "+(e.message||e);msg.style.color="var(--danger)";} }
}

async function _grpEliminar(id) {
  if (!confirm("¿Eliminar este grupo y sus sesiones? Los alumnos no se borran, solo dejan de estar asignados.")) return;
  const { error } = await sb.from("grupos").delete().eq("id",id).eq("centro_id",ctrId);
  if(typeof showToastGlobal==="function") showToastGlobal(error?("Error: "+error.message):"Grupo eliminado", error?"error":"success");
  _grpSelId=null; await _grpLoad();
  const det=document.getElementById("grp-detail"); if(det) det.innerHTML=`<div class="grp-empty">Selecciona un grupo o crea uno nuevo.</div>`;
}

/* ───────── PROFESORES ───────── */
function _grpRenderProfes() {
  const body = document.getElementById("grp-body");
  body.innerHTML = `
    <div style="padding:24px 28px;max-width:760px">
      <h2 class="grp-h">Profesores</h2>
      <div id="grp-prof-list"></div>
      <div class="grp-sec">Nuevo profesor</div>
      <div class="grp-grid" style="margin-top:12px">
        <div class="grp-fld"><label class="grp-lbl">Nombre *</label><input class="grp-in" id="grp-p-nombre"></div>
        <div class="grp-fld"><label class="grp-lbl">Apellidos</label><input class="grp-in" id="grp-p-apellidos"></div>
        <div class="grp-fld"><label class="grp-lbl">Especialidad</label><input class="grp-in" id="grp-p-especialidad"></div>
        <div class="grp-fld"><label class="grp-lbl">Email</label><input class="grp-in" id="grp-p-email" type="email"></div>
        <div class="grp-fld"><label class="grp-lbl">Teléfono</label><input class="grp-in" id="grp-p-telefono"></div>
        <div class="grp-fld"><label class="grp-lbl">Tarifa/hora (€)</label><input class="grp-in" id="grp-p-tarifa" type="number"></div>
      </div>
      <div class="grp-actions"><button class="grp-btn grp-btn-p" onclick="_grpAddProfe()">Añadir profesor</button><span class="grp-msg" id="grp-p-msg"></span></div>
    </div>`;
  _grpRenderProfList();
}
function _grpRenderProfList() {
  const cont = document.getElementById("grp-prof-list");
  if (!cont) return;
  if (!_grpProfes.length) { cont.innerHTML = `<div class="grp-it-sub" style="padding:10px 0">Aún no hay profesores.</div>`; return; }
  cont.innerHTML = _grpProfes.map(p => `
    <div class="grp-prof-row">
      <div><div class="grp-it-nom">${_grpEsc([p.nombre,p.apellidos].filter(Boolean).join(" "))}</div>
      <div class="grp-it-sub">${_grpEsc(p.especialidad||"—")}${p.email?" · "+_grpEsc(p.email):""}</div></div>
      <button class="grp-x" style="margin-left:auto" onclick="_grpDelProfe('${escArg(p.id)}')">✕</button>
    </div>`).join("");
}
async function _grpAddProfe() {
  const msg = document.getElementById("grp-p-msg");
  const nombre = (document.getElementById("grp-p-nombre")?.value||"").trim();
  if (!nombre) { if(msg){msg.textContent="El nombre es obligatorio.";msg.style.color="var(--danger)";} return; }
  const g = id => (document.getElementById("grp-p-"+id)?.value||"").trim() || null;
  const tarifa = document.getElementById("grp-p-tarifa")?.value;
  const { error } = await sb.from("profesores").insert({
    centro_id:ctrId, nombre, apellidos:g("apellidos"), especialidad:g("especialidad"),
    email:g("email"), telefono:g("telefono"), tarifa_hora: tarifa? Number(tarifa): null,
  });
  if (error) { if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  if(typeof showToastGlobal==="function") showToastGlobal("Profesor añadido","success");
  await _grpLoadProfes(); _grpRenderProfes();
}
async function _grpDelProfe(id) {
  if(!confirm("¿Eliminar profesor? Los grupos que lo tenían quedarán sin profesor.")) return;
  await sb.from("profesores").delete().eq("id",id).eq("centro_id",ctrId);
  await _grpLoadProfes(); _grpRenderProfList();
}

window.initGrupos=initGrupos; window._grpSetTab=_grpSetTab; window._grpNuevo=_grpNuevo;
window._grpSelect=_grpSelect; window._grpGuardar=_grpGuardar; window._grpEliminar=_grpEliminar;
window._grpAddSesion=_grpAddSesion; window._grpDelSesion=_grpDelSesion; window._grpSesSet=_grpSesSet;
window._grpAddAlumno=_grpAddAlumno; window._grpDelAlumno=_grpDelAlumno;
window._grpAddProfe=_grpAddProfe; window._grpDelProfe=_grpDelProfe;
