// ── CALIFICACIONES + TAREAS/EXÁMENES (Fase 2 · inc.3) ──
// Notas por grupo/alumno y gestión de deberes/exámenes. Filtra por ctrId; RLS por centro.
// Tab key "notas" para no colisionar con restos del código de Centros.

let _calGrupos = [], _calTab = "notas", _calAlumnos = [];
const _CAL_TIPOS = ["deber","examen","proyecto"];
function _calEsc(s){ return escH(s); }
function _calHoy(){ return new Date().toISOString().slice(0,10); }
function _calNombre(a){ return [a.nombre,a.apellidos].filter(Boolean).join(" ") || "(alumno)"; }

function _calEnsureStyles(){
  if (document.getElementById("cal2-styles")) return;
  const st=document.createElement("style"); st.id="cal2-styles";
  st.textContent=`
    #panel-notas{padding:0!important;overflow-y:auto}
    .cal-wrap{padding:22px 26px;max-width:920px}
    .cal-top{display:flex;gap:8px;border-bottom:1px solid var(--line,var(--bdr));margin-bottom:16px}
    .cal-tab{padding:9px 14px;font-size:13.5px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--muted,var(--txt3))}
    .cal-tab.on{color:var(--ink);border-color:var(--ink)}
    .cal-h{font-family:var(--font-display,serif);font-size:24px;margin:0 0 12px}
    .cal-ctrl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
    .cal-in,.cal-sel,.cal-ta{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);font-family:inherit}
    .cal-ta{width:100%;min-height:52px;resize:vertical}
    .cal-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600}
    .cal-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .cal-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--line,var(--bdr));border-radius:8px;margin-bottom:6px;background:var(--srf)}
    .cal-nom{font-size:14px;font-weight:600;flex:1;min-width:150px}
    .cal-nota{width:70px;padding:7px 9px;border:1px solid var(--line,var(--bdr));border-radius:7px;font-size:14px;text-align:center;background:var(--srf)}
    .cal-obs{flex:1;min-width:120px;padding:6px 9px;border:1px solid var(--line,var(--bdr));border-radius:7px;font-size:12.5px;background:var(--srf)}
    .cal-msg{font-size:13px}
    .cal-card{border:1px solid var(--line,var(--bdr));border-radius:9px;padding:10px 13px;margin-bottom:8px;background:var(--srf);display:flex;align-items:center;gap:10px}
    .cal-badge{font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--surface-sunk,#eee);color:var(--muted,var(--txt3))}
    .cal-b-examen{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .cal-b-proyecto{background:var(--info-soft,#e3eafa);color:var(--info,#4d6fa8)}
    .cal-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .cal-form{border:1px solid var(--line,var(--bdr));border-radius:10px;padding:14px;margin-bottom:14px;background:var(--paper-2,var(--srf2))}
    .cal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    @media(max-width:700px){.cal-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

async function initNotas(){
  _calEnsureStyles();
  const panel=document.getElementById("panel-notas"); if(!panel) return;
  const { data } = await sb.from("grupos").select("id,nombre").eq("centro_id",ctrId).eq("activo",true).order("nombre");
  _calGrupos=data||[];
  panel.innerHTML=`
    <div class="cal-wrap">
      <div class="cal-top">
        <div class="cal-tab ${_calTab==="notas"?"on":""}" onclick="_calSetTab('notas')">Notas</div>
        <div class="cal-tab ${_calTab==="tareas"?"on":""}" onclick="_calSetTab('tareas')">Tareas y exámenes</div>
      </div>
      <div id="cal-body"></div>
    </div>`;
  if(_calTab==="notas") _calRenderNotas(); else _calRenderTareas();
}
function _calSetTab(t){ _calTab=t; initNotas(); }
function _calGrupoSel(){
  return `<select class="cal-sel" id="cal-grupo">${_calGrupos.length?_calGrupos.map(g=>`<option value="${g.id}">${_calEsc(g.nombre)}</option>`).join(""):`<option value="">(crea grupos primero)</option>`}</select>`;
}

/* ── Notas ── */
function _calRenderNotas(){
  const b=document.getElementById("cal-body");
  b.innerHTML=`
    <h1 class="cal-h">Calificaciones</h1>
    <div class="cal-ctrl">
      ${_calGrupoSel()}
      <input class="cal-in" id="cal-eval" placeholder="Evaluación / prueba (ej: Examen tema 3)" style="min-width:220px">
      <input class="cal-in" id="cal-fecha" type="date" value="${_calHoy()}">
      <button class="cal-btn" onclick="_calCargarAlumnos()">Cargar alumnos</button>
    </div>
    <div id="cal-alumnos"></div>`;
  if(_calGrupos.length) _calCargarAlumnos();
}
async function _calCargarAlumnos(){
  const grupoId=document.getElementById("cal-grupo")?.value;
  const cont=document.getElementById("cal-alumnos");
  if(!grupoId){ cont.innerHTML=`<div class="cal-msg">Selecciona un grupo.</div>`; return; }
  cont.innerHTML=`<div class="cal-msg">Cargando…</div>`;
  const { data:links } = await sb.from("matricula_grupo").select("matriculas(alumnos(id,nombre,apellidos))").eq("grupo_id",grupoId).eq("centro_id",ctrId);
  _calAlumnos=(links||[]).map(l=>l.matriculas?.alumnos).filter(Boolean).sort((a,b)=>_calNombre(a).localeCompare(_calNombre(b)));
  if(!_calAlumnos.length){ cont.innerHTML=`<div class="cal-msg">Este grupo no tiene alumnos. Añádelos en <strong>Grupos</strong>.</div>`; return; }
  cont.innerHTML=_calAlumnos.map(a=>`
    <div class="cal-row">
      <span class="cal-nom">${_calEsc(_calNombre(a))}</span>
      <input class="cal-nota" id="cal-n-${a.id}" type="number" min="0" max="10" step="0.25" placeholder="—">
      <input class="cal-obs" id="cal-o-${a.id}" placeholder="Observación">
    </div>`).join("")
    + `<div style="margin-top:12px;display:flex;gap:10px;align-items:center"><button class="cal-btn cal-btn-p" onclick="_calGuardarNotas()">Guardar notas</button><span class="cal-msg" id="cal-save"></span></div>`;
}
async function _calGuardarNotas(){
  const grupoId=document.getElementById("cal-grupo")?.value;
  const evalN=(document.getElementById("cal-eval")?.value||"").trim();
  const fecha=document.getElementById("cal-fecha")?.value||_calHoy();
  const msg=document.getElementById("cal-save");
  const rows=[];
  _calAlumnos.forEach(a=>{
    const v=document.getElementById("cal-n-"+a.id)?.value;
    const o=(document.getElementById("cal-o-"+a.id)?.value||"").trim();
    if(v!==""&&v!=null){ rows.push({ centro_id:ctrId, alumno_id:a.id, grupo_id:grupoId, evaluacion:evalN||null, nota:Number(v), observacion:o||null, fecha }); }
  });
  if(!rows.length){ if(msg){msg.textContent="Introduce al menos una nota.";msg.style.color="var(--danger)";} return; }
  if(msg){msg.textContent="Guardando…";msg.style.color="var(--muted,var(--txt3))";}
  const { error } = await sb.from("calificaciones").insert(rows);
  if(error){ if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  if(typeof showToastGlobal==="function") showToastGlobal(`${rows.length} nota(s) guardadas`,"success");
  if(msg){msg.textContent=`${rows.length} nota(s) guardadas ✓`;msg.style.color="var(--success,#2e7d32)";}
  _calAlumnos.forEach(a=>{ const el=document.getElementById("cal-n-"+a.id); if(el) el.value=""; const o=document.getElementById("cal-o-"+a.id); if(o) o.value=""; });
}

/* ── Tareas / exámenes ── */
function _calRenderTareas(){
  const b=document.getElementById("cal-body");
  b.innerHTML=`
    <h1 class="cal-h">Tareas y exámenes</h1>
    <div class="cal-ctrl">${_calGrupoSel()}<button class="cal-btn" onclick="_calCargarTareas()">Ver</button></div>
    <div class="cal-form">
      <div class="cal-grid">
        <div><label class="cal-lbl">Título</label><input class="cal-in" id="cal-t-titulo" style="width:100%" placeholder="Ej: Examen unidad 4"></div>
        <div><label class="cal-lbl">Tipo</label><select class="cal-sel" id="cal-t-tipo" style="width:100%">${_CAL_TIPOS.map(t=>`<option value="${t}">${t}</option>`).join("")}</select></div>
        <div><label class="cal-lbl">Fecha de entrega/examen</label><input class="cal-in" id="cal-t-fecha" type="date" style="width:100%" value="${_calHoy()}"></div>
      </div>
      <label class="cal-lbl">Descripción</label><textarea class="cal-ta" id="cal-t-desc" placeholder="Detalles, temario…"></textarea>
      <div style="margin-top:10px;display:flex;gap:10px;align-items:center"><button class="cal-btn cal-btn-p" onclick="_calCrearTarea()">Añadir</button><span class="cal-msg" id="cal-t-msg"></span></div>
    </div>
    <div id="cal-tareas-list"></div>`;
  if(_calGrupos.length) _calCargarTareas();
}
async function _calCargarTareas(){
  const grupoId=document.getElementById("cal-grupo")?.value;
  const cont=document.getElementById("cal-tareas-list");
  if(!grupoId){ cont.innerHTML=`<div class="cal-msg">Selecciona un grupo.</div>`; return; }
  const { data } = await sb.from("tareas").select("*").eq("grupo_id",grupoId).eq("centro_id",ctrId).order("fecha_entrega",{ascending:true,nullsFirst:false});
  const rows=data||[];
  cont.innerHTML=rows.length?rows.map(t=>`
    <div class="cal-card">
      <span class="cal-badge cal-b-${t.tipo}">${_calEsc(t.tipo)}</span>
      <div style="flex:1"><div style="font-weight:600;font-size:13.5px">${_calEsc(t.titulo)}</div>
      ${t.descripcion?`<div style="font-size:12px;color:var(--muted,var(--txt3))">${_calEsc(t.descripcion)}</div>`:""}</div>
      <span class="cal-msg" style="color:var(--muted,var(--txt3))">${t.fecha_entrega?_calEsc(t.fecha_entrega):"sin fecha"}</span>
      <button class="cal-btn" style="padding:4px 9px;font-size:12px" onclick="_calBorrarTarea('${escArg(t.id)}')">✕</button>
    </div>`).join(""):`<div class="cal-msg">Sin tareas para este grupo.</div>`;
}
async function _calCrearTarea(){
  const grupoId=document.getElementById("cal-grupo")?.value;
  const titulo=(document.getElementById("cal-t-titulo")?.value||"").trim();
  const msg=document.getElementById("cal-t-msg");
  if(!grupoId){ if(msg){msg.textContent="Selecciona un grupo.";msg.style.color="var(--danger)";} return; }
  if(!titulo){ if(msg){msg.textContent="Pon un título.";msg.style.color="var(--danger)";} return; }
  const { error } = await sb.from("tareas").insert({
    centro_id:ctrId, grupo_id:grupoId, titulo, tipo:document.getElementById("cal-t-tipo")?.value||"deber",
    fecha_entrega:document.getElementById("cal-t-fecha")?.value||null, descripcion:(document.getElementById("cal-t-desc")?.value||"").trim()||null,
  });
  if(error){ if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  if(typeof showToastGlobal==="function") showToastGlobal("Tarea añadida","success");
  document.getElementById("cal-t-titulo").value=""; document.getElementById("cal-t-desc").value="";
  _calCargarTareas();
}
async function _calBorrarTarea(id){
  await sb.from("tareas").delete().eq("id",id).eq("centro_id",ctrId);
  _calCargarTareas();
}

window.initNotas=initNotas; window._calSetTab=_calSetTab; window._calCargarAlumnos=_calCargarAlumnos;
window._calGuardarNotas=_calGuardarNotas; window._calCargarTareas=_calCargarTareas;
window._calCrearTarea=_calCrearTarea; window._calBorrarTarea=_calBorrarTarea;
