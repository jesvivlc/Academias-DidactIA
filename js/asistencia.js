// ── CONTROL DE ASISTENCIA (Fase 2 · inc.1) ──
// Pasar lista por grupo+fecha (upsert) + informe con % de asistencia y ausencias
// repetidas. Filtra por ctrId; RLS por centro. El aviso real a familias queda
// pendiente de la Fase 3 (email/push): por ahora se marca notificado_familia.

let _asiGrupos = [], _asiTab = "lista", _asiEstados = {}, _asiObs = {}, _asiAlumnos = [];
const _ASI_ESTADOS = [
  { k:"presente", lbl:"Presente", c:"#3F9367" },
  { k:"retraso", lbl:"Retraso", c:"#D69540" },
  { k:"ausente", lbl:"Ausente", c:"#C24D2F" },
  { k:"justificada", lbl:"Justif.", c:"#4D6FA8" },
];
function _asiEsc(s){ return escH(s); }
function _asiHoy(){ return new Date().toISOString().slice(0,10); }
function _asiNombre(a){ return [a.nombre,a.apellidos].filter(Boolean).join(" ") || "(sin nombre)"; }

function _asiEnsureStyles(){
  if (document.getElementById("asi-styles")) return;
  const st=document.createElement("style"); st.id="asi-styles";
  st.textContent=`
    #panel-asistencia{padding:0!important;overflow-y:auto}
    .asi-wrap{padding:22px 26px;max-width:1000px}
    .asi-top{display:flex;gap:8px;border-bottom:1px solid var(--line,var(--bdr));margin-bottom:16px}
    .asi-tab{padding:9px 14px;font-size:13.5px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--muted,var(--txt3))}
    .asi-tab.on{color:var(--ink);border-color:var(--ink)}
    .asi-h{font-family:var(--font-display,serif);font-size:24px;margin:0 0 12px}
    .asi-ctrl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
    .asi-in,.asi-sel{padding:9px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13.5px;background:var(--srf)}
    .asi-btn{padding:9px 16px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13.5px;font-weight:600}
    .asi-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .asi-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line,var(--bdr));border-radius:8px;margin-bottom:7px;background:var(--srf)}
    .asi-nom{font-size:14px;font-weight:600;min-width:180px}
    .asi-states{display:flex;gap:5px;flex-wrap:wrap}
    .asi-s{padding:5px 11px;border-radius:20px;border:1px solid var(--line,var(--bdr));font-size:12px;cursor:pointer;background:var(--srf);color:var(--muted,var(--txt3))}
    .asi-s.on{color:#fff;border-color:transparent}
    .asi-obs{flex:1;min-width:120px;padding:6px 9px;border:1px solid var(--line,var(--bdr));border-radius:7px;font-size:12.5px;background:var(--srf)}
    .asi-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 16px}
    .asi-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:10px;padding:12px 16px;min-width:120px}
    .asi-kpi-n{font-family:var(--font-display,serif);font-size:26px;font-weight:600}
    .asi-kpi-l{font-size:11.5px;color:var(--muted,var(--txt3))}
    .asi-tbl{width:100%;border-collapse:collapse;font-size:13px}
    .asi-tbl th,.asi-tbl td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line,var(--bdr))}
    .asi-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,var(--txt3))}
    .asi-pct{font-weight:700}
    .asi-flag{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b);font-size:11px;padding:2px 7px;border-radius:20px}
    .asi-msg{font-size:13px}
  `;
  document.head.appendChild(st);
}

async function initAsistencia(){
  _asiEnsureStyles();
  const panel=document.getElementById("panel-asistencia"); if(!panel) return;
  const { data } = await sb.from("grupos").select("id,nombre").eq("centro_id",ctrId).eq("activo",true).order("nombre");
  _asiGrupos=data||[];
  panel.innerHTML=`
    <div class="asi-wrap">
      <div class="asi-top">
        <div class="asi-tab ${_asiTab==="lista"?"on":""}" onclick="_asiSetTab('lista')">Pasar lista</div>
        <div class="asi-tab ${_asiTab==="informe"?"on":""}" onclick="_asiSetTab('informe')">Informe</div>
      </div>
      <div id="asi-body"></div>
    </div>`;
  if(_asiTab==="lista") _asiRenderLista(); else _asiRenderInforme();
}
function _asiSetTab(t){ _asiTab=t; initAsistencia(); }

function _asiGrupoSel(id){
  return `<select class="asi-sel" id="asi-grupo">${_asiGrupos.length?_asiGrupos.map(g=>`<option value="${g.id}" ${g.id===id?"selected":""}>${_asiEsc(g.nombre)}</option>`).join(""):`<option value="">(crea grupos primero)</option>`}</select>`;
}

/* ── Pasar lista ── */
function _asiRenderLista(){
  const b=document.getElementById("asi-body");
  b.innerHTML=`
    <h1 class="asi-h">Pasar lista</h1>
    <div class="asi-ctrl">
      ${_asiGrupoSel(_asiGrupos[0]?.id)}
      <input class="asi-in" type="date" id="asi-fecha" value="${_asiHoy()}">
      <button class="asi-btn" onclick="_asiCargar()">Cargar</button>
      <span class="asi-msg" id="asi-msg"></span>
    </div>
    <div id="asi-lista"></div>`;
  if(_asiGrupos.length) _asiCargar();
}

async function _asiCargar(){
  const grupoId=document.getElementById("asi-grupo")?.value;
  const fecha=document.getElementById("asi-fecha")?.value||_asiHoy();
  const cont=document.getElementById("asi-lista");
  if(!grupoId){ cont.innerHTML=`<div class="asi-kpi-l">Selecciona un grupo.</div>`; return; }
  cont.innerHTML=`<div class="asi-kpi-l">Cargando…</div>`;
  // alumnos del grupo
  const { data:links } = await sb.from("matricula_grupo")
    .select("matriculas(alumnos(id,nombre,apellidos))").eq("grupo_id",grupoId).eq("centro_id",ctrId);
  _asiAlumnos=(links||[]).map(l=>l.matriculas?.alumnos).filter(Boolean)
    .sort((a,b)=>_asiNombre(a).localeCompare(_asiNombre(b)));
  // asistencia existente ese día
  const { data:exist } = await sb.from("asistencia").select("alumno_id,estado,observacion").eq("grupo_id",grupoId).eq("fecha",fecha).eq("centro_id",ctrId);
  _asiEstados={}; _asiObs={};
  (exist||[]).forEach(r=>{ _asiEstados[r.alumno_id]=r.estado; _asiObs[r.alumno_id]=r.observacion||""; });
  _asiAlumnos.forEach(a=>{ if(!_asiEstados[a.id]) _asiEstados[a.id]="presente"; });
  if(!_asiAlumnos.length){ cont.innerHTML=`<div class="asi-kpi-l">Este grupo no tiene alumnos asignados. Añádelos en <strong>Grupos</strong>.</div>`; return; }
  _asiRenderRows();
}

function _asiRenderRows(){
  const cont=document.getElementById("asi-lista");
  cont.innerHTML=_asiAlumnos.map(a=>`
    <div class="asi-row">
      <div class="asi-nom">${_asiEsc(_asiNombre(a))}</div>
      <div class="asi-states">
        ${_ASI_ESTADOS.map(e=>`<span class="asi-s ${_asiEstados[a.id]===e.k?"on":""}" style="${_asiEstados[a.id]===e.k?"background:"+e.c:""}" onclick="_asiSet('${escArg(a.id)}','${e.k}')">${e.lbl}</span>`).join("")}
      </div>
      <input class="asi-obs" placeholder="Observación" value="${_asiEsc(_asiObs[a.id]||"")}" onchange="_asiSetObs('${escArg(a.id)}',this.value)">
    </div>`).join("")
    + `<div style="margin-top:14px;display:flex;gap:10px;align-items:center"><button class="asi-btn asi-btn-p" onclick="_asiGuardar()">Guardar asistencia</button><span class="asi-msg" id="asi-save-msg"></span></div>`;
}
function _asiSet(id,k){ _asiEstados[id]=k; _asiRenderRows(); }
function _asiSetObs(id,v){ _asiObs[id]=v; }

async function _asiGuardar(){
  const grupoId=document.getElementById("asi-grupo")?.value;
  const fecha=document.getElementById("asi-fecha")?.value||_asiHoy();
  const msg=document.getElementById("asi-save-msg");
  const uid=(typeof currentUser!=="undefined"&&currentUser)?currentUser.id:null;
  const rows=_asiAlumnos.map(a=>({
    centro_id:ctrId, alumno_id:a.id, grupo_id:grupoId, fecha,
    estado:_asiEstados[a.id]||"presente", observacion:_asiObs[a.id]||null, registrado_por:uid,
    // Marca de aviso pendiente: las ausencias se notificarán a familias al activar
    // email/push en la Fase 3. Por ahora queda registrado el estado.
    notificado_familia:false,
  }));
  if(msg){msg.textContent="Guardando…";msg.style.color="var(--muted,var(--txt3))";}
  const { error } = await sb.from("asistencia").upsert(rows,{ onConflict:"centro_id,alumno_id,fecha,grupo_id" });
  if(error){ if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  const aus=rows.filter(r=>r.estado==="ausente").length;
  // Aviso a familias de los ausentes (email vía EF, fire-and-forget) + marca notificado
  const ausentes=_asiAlumnos.filter(a=>_asiEstados[a.id]==="ausente");
  ausentes.forEach(a=>{ try{ sb.functions.invoke("notify-ausencia",{ body:{ alumno_id:a.id, fecha } }); }catch(_){} });
  if(ausentes.length){ try{ await sb.from("asistencia").update({ notificado_familia:true }).eq("centro_id",ctrId).eq("grupo_id",grupoId).eq("fecha",fecha).eq("estado","ausente"); }catch(_){} }
  if(typeof showToastGlobal==="function") showToastGlobal("Asistencia guardada"+(aus?` · ${aus} ausencia(s) · familias avisadas`:""),"success");
  if(msg){msg.textContent="Guardado ✓"+(aus?` (${aus} ausencias, familias avisadas)`:"");msg.style.color="var(--success,#2e7d32)";}
}

/* ── Informe ── */
function _asiRenderInforme(){
  const b=document.getElementById("asi-body");
  const hace30=new Date(Date.now()-30*864e5).toISOString().slice(0,10);
  b.innerHTML=`
    <h1 class="asi-h">Informe de asistencia</h1>
    <div class="asi-ctrl">
      ${_asiGrupoSel(_asiGrupos[0]?.id)}
      <input class="asi-in" type="date" id="asi-desde" value="${hace30}">
      <input class="asi-in" type="date" id="asi-hasta" value="${_asiHoy()}">
      <button class="asi-btn" onclick="_asiInforme()">Ver</button>
    </div>
    <div id="asi-inf"></div>`;
  if(_asiGrupos.length) _asiInforme();
}

async function _asiInforme(){
  const grupoId=document.getElementById("asi-grupo")?.value;
  const desde=document.getElementById("asi-desde")?.value;
  const hasta=document.getElementById("asi-hasta")?.value;
  const cont=document.getElementById("asi-inf");
  if(!grupoId){ cont.innerHTML=`<div class="asi-kpi-l">Selecciona un grupo.</div>`; return; }
  cont.innerHTML=`<div class="asi-kpi-l">Calculando…</div>`;
  const { data:links } = await sb.from("matricula_grupo").select("matriculas(alumnos(id,nombre,apellidos))").eq("grupo_id",grupoId).eq("centro_id",ctrId);
  const alumnos=(links||[]).map(l=>l.matriculas?.alumnos).filter(Boolean);
  const { data:rows } = await sb.from("asistencia").select("alumno_id,estado,fecha").eq("grupo_id",grupoId).eq("centro_id",ctrId).gte("fecha",desde).lte("fecha",hasta);
  const stat={}; alumnos.forEach(a=>stat[a.id]={presente:0,retraso:0,ausente:0,justificada:0});
  (rows||[]).forEach(r=>{ if(stat[r.alumno_id] && stat[r.alumno_id][r.estado]!=null) stat[r.alumno_id][r.estado]++; });
  let totReg=0,totAus=0,repetidas=0;
  const filas=alumnos.map(a=>{
    const s=stat[a.id]; const tot=s.presente+s.retraso+s.ausente+s.justificada;
    const pct=tot?Math.round((s.presente+s.retraso)/tot*100):null;
    totReg+=tot; totAus+=s.ausente; if(s.ausente>=3) repetidas++;
    return {a,s,tot,pct};
  }).sort((x,y)=>y.s.ausente-x.s.ausente);
  const col=p=>p==null?"var(--muted,#888)":p>=90?"var(--success,#2e7d32)":p>=75?"var(--warning,#b8860b)":"var(--danger,#c0392b)";
  cont.innerHTML=`
    <div class="asi-kpis">
      <div class="asi-kpi"><div class="asi-kpi-n">${totReg}</div><div class="asi-kpi-l">Registros</div></div>
      <div class="asi-kpi"><div class="asi-kpi-n">${totAus}</div><div class="asi-kpi-l">Ausencias</div></div>
      <div class="asi-kpi"><div class="asi-kpi-n">${repetidas}</div><div class="asi-kpi-l">Alumnos con ≥3 ausencias</div></div>
    </div>
    ${filas.length?`<table class="asi-tbl"><thead><tr><th>Alumno</th><th>Pres.</th><th>Retr.</th><th>Aus.</th><th>Just.</th><th>% asist.</th><th></th></tr></thead><tbody>
      ${filas.map(f=>`<tr><td>${_asiEsc(_asiNombre(f.a))}</td><td>${f.s.presente}</td><td>${f.s.retraso}</td><td>${f.s.ausente}</td><td>${f.s.justificada}</td>
        <td class="asi-pct" style="color:${col(f.pct)}">${f.pct==null?"—":f.pct+"%"}</td>
        <td>${f.s.ausente>=3?`<span class="asi-flag">seguimiento</span>`:""}</td></tr>`).join("")}
    </tbody></table>`:`<div class="asi-kpi-l">Sin datos en el rango.</div>`}`;
}

window.initAsistencia=initAsistencia; window._asiSetTab=_asiSetTab; window._asiCargar=_asiCargar;
window._asiSet=_asiSet; window._asiSetObs=_asiSetObs; window._asiGuardar=_asiGuardar; window._asiInforme=_asiInforme;
