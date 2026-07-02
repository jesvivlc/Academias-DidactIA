// ── INCIDENCIAS (Fase 2 · inc.2) ──
// Registro y seguimiento de incidencias de alumnos. Filtra por ctrId; RLS por centro.

let _incData = [], _incAlumnos = [], _incFEstado = "todas", _incFGrav = "todas", _incNuevo = false;
const _INC_TIPOS = ["conducta","academica","material","retraso","otro"];
const _INC_GRAV = ["leve","moderada","grave"];
function _incEsc(s){ return escH(s); }
function _incHoy(){ return new Date().toISOString().slice(0,10); }
function _incNombre(a){ return a ? ([a.nombre,a.apellidos].filter(Boolean).join(" ")||"(alumno)") : "General"; }

function _incEnsureStyles(){
  if (document.getElementById("inc-styles")) return;
  const st=document.createElement("style"); st.id="inc-styles";
  st.textContent=`
    #panel-incidencias2{padding:0!important;overflow-y:auto}
    .inc-wrap{padding:22px 26px;max-width:920px}
    .inc-h{font-family:var(--font-display,serif);font-size:24px;margin:0 0 4px}
    .inc-sub{font-size:12px;color:var(--muted,var(--txt3))}
    .inc-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}
    .inc-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:10px;padding:11px 15px;min-width:110px}
    .inc-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .inc-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .inc-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
    .inc-sel,.inc-in,.inc-ta{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);font-family:inherit}
    .inc-ta{width:100%;min-height:60px;resize:vertical}
    .inc-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600}
    .inc-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .inc-btn-sm{padding:4px 10px;font-size:12px}
    .inc-card{border:1px solid var(--line,var(--bdr));border-radius:10px;padding:12px 14px;margin-bottom:9px;background:var(--srf)}
    .inc-card.grave{border-left:4px solid var(--danger,#c0392b)}
    .inc-card.moderada{border-left:4px solid var(--warning,#b8860b)}
    .inc-card.leve{border-left:4px solid var(--muted,#888)}
    .inc-card-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .inc-al{font-size:14px;font-weight:600}
    .inc-badge{font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--surface-sunk,#eee);color:var(--muted,var(--txt3))}
    .inc-b-grave{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .inc-b-moderada{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .inc-est{font-size:10.5px;padding:2px 8px;border-radius:20px;margin-left:auto}
    .inc-e-abierta{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .inc-e-en_seguimiento{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .inc-e-cerrada{background:var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)}
    .inc-desc{font-size:13px;margin-top:6px;color:var(--txt)}
    .inc-actions{margin-top:9px;display:flex;gap:7px;flex-wrap:wrap}
    .inc-form{border:1px solid var(--line,var(--bdr));border-radius:10px;padding:14px;margin-bottom:16px;background:var(--paper-2,var(--srf2))}
    .inc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:10px}
    .inc-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    @media(max-width:700px){.inc-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

async function initIncidencias2(){
  _incEnsureStyles();
  const panel=document.getElementById("panel-incidencias2"); if(!panel) return;
  panel.innerHTML=`<div class="inc-wrap"><div class="inc-sub">Cargando…</div></div>`;
  const [al, inc] = await Promise.all([
    sb.from("alumnos").select("id,nombre,apellidos").eq("centro_id",ctrId).eq("estado","activo").order("nombre"),
    sb.from("incidencias").select("*,alumnos(nombre,apellidos)").eq("centro_id",ctrId).order("created_at",{ascending:false}),
  ]);
  _incAlumnos=al.data||[]; _incData=inc.data||[];
  _incRender();
}

function _incRender(){
  const panel=document.getElementById("panel-incidencias2");
  const abiertas=_incData.filter(i=>i.estado==="abierta").length;
  const seg=_incData.filter(i=>i.estado==="en_seguimiento").length;
  const graves=_incData.filter(i=>i.gravedad==="grave"&&i.estado!=="cerrada").length;
  let rows=_incData.slice();
  if(_incFEstado!=="todas") rows=rows.filter(i=>i.estado===_incFEstado);
  if(_incFGrav!=="todas") rows=rows.filter(i=>i.gravedad===_incFGrav);
  panel.innerHTML=`
    <div class="inc-wrap">
      <h1 class="inc-h">Incidencias</h1>
      <div class="inc-sub">Registro y seguimiento de conducta, material y retrasos</div>
      <div class="inc-kpis">
        <div class="inc-kpi"><div class="inc-kpi-n">${abiertas}</div><div class="inc-kpi-l">Abiertas</div></div>
        <div class="inc-kpi"><div class="inc-kpi-n">${seg}</div><div class="inc-kpi-l">En seguimiento</div></div>
        <div class="inc-kpi"><div class="inc-kpi-n">${graves}</div><div class="inc-kpi-l">Graves activas</div></div>
      </div>
      <div class="inc-bar">
        <select class="inc-sel" onchange="_incSetF('estado',this.value)">
          <option value="todas">Todos los estados</option><option value="abierta" ${_incFEstado==="abierta"?"selected":""}>Abiertas</option>
          <option value="en_seguimiento" ${_incFEstado==="en_seguimiento"?"selected":""}>En seguimiento</option><option value="cerrada" ${_incFEstado==="cerrada"?"selected":""}>Cerradas</option>
        </select>
        <select class="inc-sel" onchange="_incSetF('grav',this.value)">
          <option value="todas">Toda gravedad</option>${_INC_GRAV.map(g=>`<option value="${g}" ${_incFGrav===g?"selected":""}>${g}</option>`).join("")}
        </select>
        <button class="inc-btn inc-btn-p" style="margin-left:auto" onclick="_incToggleNuevo()">${_incNuevo?"Cancelar":"+ Nueva incidencia"}</button>
      </div>
      ${_incNuevo?_incForm():""}
      <div id="inc-list">${rows.length?rows.map(_incCard).join(""):`<div class="inc-sub">Sin incidencias${_incFEstado!=="todas"||_incFGrav!=="todas"?" con esos filtros":""}.</div>`}</div>
    </div>`;
}

function _incForm(){
  return `<div class="inc-form">
    <div class="inc-grid">
      <div><label class="inc-lbl">Alumno</label><select class="inc-sel" id="inc-alumno" style="width:100%">
        <option value="">— General (sin alumno) —</option>
        ${_incAlumnos.map(a=>`<option value="${a.id}">${_incEsc(_incNombre(a))}</option>`).join("")}
      </select></div>
      <div><label class="inc-lbl">Fecha</label><input class="inc-in" id="inc-fecha" type="date" value="${_incHoy()}" style="width:100%"></div>
      <div><label class="inc-lbl">Tipo</label><select class="inc-sel" id="inc-tipo" style="width:100%">${_INC_TIPOS.map(t=>`<option value="${t}">${t}</option>`).join("")}</select></div>
      <div><label class="inc-lbl">Gravedad</label><select class="inc-sel" id="inc-grav" style="width:100%">${_INC_GRAV.map(g=>`<option value="${g}">${g}</option>`).join("")}</select></div>
    </div>
    <label class="inc-lbl">Descripción</label>
    <textarea class="inc-ta" id="inc-desc" placeholder="Qué ha pasado…"></textarea>
    <div style="margin-top:10px;display:flex;gap:10px;align-items:center">
      <button class="inc-btn inc-btn-p" onclick="_incCrear()">Registrar</button>
      <span class="inc-sub" id="inc-msg"></span>
    </div>
  </div>`;
}

function _incCard(i){
  const al=i.alumnos;
  return `<div class="inc-card ${i.gravedad}">
    <div class="inc-card-top">
      <span class="inc-al">${_incEsc(_incNombre(al))}</span>
      <span class="inc-badge">${_incEsc(i.tipo)}</span>
      <span class="inc-badge inc-b-${i.gravedad}">${_incEsc(i.gravedad)}</span>
      <span class="inc-sub">${_incEsc(i.fecha)}</span>
      <span class="inc-est inc-e-${i.estado}">${_incEsc(i.estado.replace("_"," "))}</span>
    </div>
    ${i.descripcion?`<div class="inc-desc">${_incEsc(i.descripcion)}</div>`:""}
    <div class="inc-actions">
      ${i.estado!=="en_seguimiento"?`<button class="inc-btn inc-btn-sm" onclick="_incEstado('${escArg(i.id)}','en_seguimiento')">En seguimiento</button>`:""}
      ${i.estado!=="cerrada"?`<button class="inc-btn inc-btn-sm" onclick="_incEstado('${escArg(i.id)}','cerrada')">Cerrar</button>`:`<button class="inc-btn inc-btn-sm" onclick="_incEstado('${escArg(i.id)}','abierta')">Reabrir</button>`}
      <button class="inc-btn inc-btn-sm" onclick="_incBorrar('${escArg(i.id)}')">Eliminar</button>
    </div>
  </div>`;
}

function _incSetF(k,v){ if(k==="estado")_incFEstado=v; else _incFGrav=v; _incRender(); }
function _incToggleNuevo(){ _incNuevo=!_incNuevo; _incRender(); }

async function _incCrear(){
  const msg=document.getElementById("inc-msg");
  const desc=(document.getElementById("inc-desc")?.value||"").trim();
  const alumnoId=document.getElementById("inc-alumno")?.value||null;
  if(!desc){ if(msg){msg.textContent="Añade una descripción.";msg.style.color="var(--danger)";} return; }
  const uid=(typeof currentUser!=="undefined"&&currentUser)?currentUser.id:null;
  const { error } = await sb.from("incidencias").insert({
    centro_id:ctrId, alumno_id:alumnoId||null, fecha:document.getElementById("inc-fecha")?.value||_incHoy(),
    tipo:document.getElementById("inc-tipo")?.value||"conducta", gravedad:document.getElementById("inc-grav")?.value||"leve",
    descripcion:desc, estado:"abierta", registrado_por:uid,
  });
  if(error){ if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  if(typeof showToastGlobal==="function") showToastGlobal("Incidencia registrada","success");
  _incNuevo=false; await initIncidencias2();
}
async function _incEstado(id,estado){
  const { error } = await sb.from("incidencias").update({estado}).eq("id",id).eq("centro_id",ctrId);
  if(!error){ const it=_incData.find(x=>x.id===id); if(it) it.estado=estado; _incRender(); }
  else if(typeof showToastGlobal==="function") showToastGlobal("Error: "+error.message,"error");
}
async function _incBorrar(id){
  if(!confirm("¿Eliminar esta incidencia?")) return;
  await sb.from("incidencias").delete().eq("id",id).eq("centro_id",ctrId);
  _incData=_incData.filter(x=>x.id!==id); _incRender();
}

window.initIncidencias2=initIncidencias2; window._incSetF=_incSetF; window._incToggleNuevo=_incToggleNuevo;
window._incCrear=_incCrear; window._incEstado=_incEstado; window._incBorrar=_incBorrar;
