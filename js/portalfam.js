// ── PORTAL FAMILIA (Fase 3 · inc.1) ──
// Visible solo a rol 'familia'. Usa la global currentUserAlumnos (cargada en
// auth.js). Lee datos de los hijos gracias a las políticas RLS *_fam_read.
// Selector de hijo + bloques asistencia/notas/incidencias/tareas.

let _pfHijo = null;
function _pfEsc(s){ return escH(s); }
function _pfHoy(){ return new Date().toISOString().slice(0,10); }
function _pfMasDias(n){ return new Date(Date.now()+n*864e5).toISOString().slice(0,10); }
function _pfHace(n){ return new Date(Date.now()-n*864e5).toISOString().slice(0,10); }

function _pfEnsureStyles(){
  if (document.getElementById("pf-styles")) return;
  const st=document.createElement("style"); st.id="pf-styles";
  st.textContent=`
    #panel-famportal{padding:0!important;overflow-y:auto}
    .pf-wrap{padding:22px 26px;max-width:900px}
    .pf-h{font-family:var(--font-display,serif);font-size:26px;margin:0 0 2px}
    .pf-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .pf-hijos{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
    .pf-hijo{padding:7px 14px;border-radius:20px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;color:var(--muted,var(--txt3))}
    .pf-hijo.on{background:var(--ink);color:#fff;border-color:var(--ink)}
    .pf-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}
    .pf-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:110px}
    .pf-kpi-n{font-family:var(--font-display,serif);font-size:26px;font-weight:600}
    .pf-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .pf-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .pf-sec{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px 16px;background:var(--srf)}
    .pf-sec h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink)}
    .pf-item{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line,var(--bdr));font-size:13px}
    .pf-item:last-child{border-bottom:none}
    .pf-badge{font-size:10.5px;padding:2px 8px;border-radius:20px;margin-left:auto;white-space:nowrap}
    .pf-b-ok{background:var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)}
    .pf-b-warn{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .pf-b-bad{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .pf-b-info{background:var(--info-soft,#e3eafa);color:var(--info,#4d6fa8)}
    .pf-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
    @media(max-width:760px){.pf-cols{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

function _pfHijos(){ return (typeof currentUserAlumnos!=="undefined" && Array.isArray(currentUserAlumnos)) ? currentUserAlumnos : []; }

async function initPortalFam(){
  _pfEnsureStyles();
  const panel=document.getElementById("panel-famportal"); if(!panel) return;
  const hijos=_pfHijos();
  if(!hijos.length){
    panel.innerHTML=`<div class="pf-wrap"><h1 class="pf-h">Portal familiar</h1>
      <div class="pf-empty">No tienes alumnos vinculados a tu cuenta todavía. Contacta con la academia para vincular a tu hijo/a.</div></div>`;
    return;
  }
  if(!_pfHijo || !hijos.find(h=>h.id===_pfHijo)) _pfHijo=hijos[0].id;
  panel.innerHTML=`<div class="pf-wrap">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
      <div><h1 class="pf-h">Portal familiar</h1><div class="pf-sub">Seguimiento de tus hijos en la academia</div></div>
      <button class="pf-hijo" style="cursor:pointer" onclick="_pfInforme(this)">✨ Informe de evolución</button>
    </div>
    <div class="pf-hijos">${hijos.map(h=>`<span class="pf-hijo ${h.id===_pfHijo?"on":""}" onclick="_pfSel('${escArg(h.id)}')">${_pfEsc(h.nombre||"Hijo/a")}</span>`).join("")}</div>
    <div id="pf-body"><div class="pf-empty">Cargando…</div></div>
  </div>`;
  _pfRender();
}
function _pfSel(id){ _pfHijo=id; initPortalFam(); }

async function _pfRender(){
  const body=document.getElementById("pf-body"); if(!body) return;
  const hoy=_pfHoy(), en7=_pfMasDias(7), hace30=_pfHace(30);
  const [notas, asis, inc, tareas, pagos, eventos, mensajes] = await Promise.all([
    sb.from("calificaciones").select("nota,evaluacion,fecha").eq("alumno_id",_pfHijo).order("fecha",{ascending:false}).limit(10),
    sb.from("asistencia").select("estado,fecha").eq("alumno_id",_pfHijo).gte("fecha",hace30).order("fecha",{ascending:false}),
    sb.from("incidencias").select("tipo,gravedad,estado,fecha,descripcion").eq("alumno_id",_pfHijo).order("fecha",{ascending:false}).limit(10),
    sb.from("tareas").select("titulo,tipo,fecha_entrega").gte("fecha_entrega",hoy).lte("fecha_entrega",en7).order("fecha_entrega"),
    sb.from("pagos").select("concepto,importe,fecha,estado,metodo").eq("alumno_id",_pfHijo).order("fecha",{ascending:false}).limit(8),
    sb.from("eventos").select("titulo,fecha,hora,tipo").gte("fecha",hoy).order("fecha").limit(8),
    sb.from("mensajes").select("*").eq("alumno_id",_pfHijo).order("created_at",{ascending:true}),
  ]);
  window._pfMsgs = mensajes.data||[];
  const A=asis.data||[]; const tot=A.length;
  const asistio=A.filter(r=>r.estado==="presente"||r.estado==="retraso").length;
  const pct=tot?Math.round(asistio/tot*100):null;
  const N=notas.data||[]; const media=N.length?(N.reduce((s,r)=>s+Number(r.nota||0),0)/N.length):null;
  const incAbiertas=(inc.data||[]).filter(i=>i.estado!=="cerrada").length;

  const bTareas=(tareas.data||[]).length?(tareas.data).map(t=>`<div class="pf-item"><span>${_pfEsc(t.titulo)}</span>
    <span class="pf-badge ${t.tipo==="examen"?"pf-b-bad":"pf-b-info"}">${_pfEsc(t.tipo)} · ${_pfEsc(t.fecha_entrega)}</span></div>`).join(""):`<div class="pf-empty">Nada en los próximos 7 días.</div>`;
  const bNotas=N.length?N.map(r=>`<div class="pf-item"><span>${_pfEsc(r.evaluacion||"Nota")}</span><span class="pf-sub">${_pfEsc(r.fecha)}</span>
    <span class="pf-badge ${Number(r.nota)>=5?"pf-b-ok":"pf-b-bad"}">${_pfEsc(String(r.nota))}</span></div>`).join(""):`<div class="pf-empty">Sin notas registradas.</div>`;
  const bAsis=A.length?A.slice(0,10).map(r=>`<div class="pf-item"><span>${_pfEsc(r.fecha)}</span>
    <span class="pf-badge ${r.estado==="presente"?"pf-b-ok":r.estado==="ausente"?"pf-b-bad":"pf-b-warn"}">${_pfEsc(r.estado)}</span></div>`).join(""):`<div class="pf-empty">Sin registros de asistencia.</div>`;
  const bInc=(inc.data||[]).length?(inc.data).map(i=>`<div class="pf-item"><span>${_pfEsc(i.tipo)}${i.descripcion?" · "+_pfEsc(i.descripcion.slice(0,40)):""}</span>
    <span class="pf-badge ${i.gravedad==="grave"?"pf-b-bad":"pf-b-warn"}">${_pfEsc(i.gravedad)}</span></div>`).join(""):`<div class="pf-empty">Sin incidencias.</div>`;
  const _eur=n=>(Number(n)||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
  const bPagos=(pagos.data||[]).length?(pagos.data).map(p=>`<div class="pf-item"><span>${_pfEsc(p.concepto||"Cuota")}</span><span class="pf-sub">${_pfEsc(p.fecha)}</span>
    <span class="pf-badge ${p.estado==="pagado"?"pf-b-ok":"pf-b-warn"}">${_eur(p.importe)} · ${_pfEsc(p.estado)}</span></div>`).join(""):`<div class="pf-empty">Sin recibos registrados.</div>`;
  const _EVI={reunion:"👥",pago:"💶",vacaciones:"🏖️",inicio_trimestre:"📚",renovacion:"🔁",recordatorio:"⏰",otro:"📌"};
  const bEventos=(eventos.data||[]).length?(eventos.data).map(e=>`<div class="pf-item"><span>${_EVI[e.tipo]||"📌"} ${_pfEsc(e.titulo)}</span>
    <span class="pf-badge pf-b-info">${_pfEsc(e.fecha)}${e.hora?" · "+_pfEsc(String(e.hora).slice(0,5)):""}</span></div>`).join(""):`<div class="pf-empty">Sin eventos próximos.</div>`;

  body.innerHTML=`
    <div class="pf-kpis">
      <div class="pf-kpi"><div class="pf-kpi-n">${pct==null?"—":pct+"%"}</div><div class="pf-kpi-l">Asistencia (30d)</div></div>
      <div class="pf-kpi"><div class="pf-kpi-n">${media==null?"—":media.toFixed(1)}</div><div class="pf-kpi-l">Nota media</div></div>
      <div class="pf-kpi"><div class="pf-kpi-n">${incAbiertas}</div><div class="pf-kpi-l">Incidencias abiertas</div></div>
    </div>
    <div class="pf-cols">
      <div class="pf-sec"><h3>📝 Próximas tareas y exámenes</h3>${bTareas}</div>
      <div class="pf-sec"><h3>📊 Últimas notas</h3>${bNotas}</div>
      <div class="pf-sec"><h3>🗓️ Asistencia reciente</h3>${bAsis}</div>
      <div class="pf-sec"><h3>⚠ Incidencias</h3>${bInc}</div>
      <div class="pf-sec"><h3>💶 Recibos</h3>${bPagos}</div>
      <div class="pf-sec"><h3>📅 Calendario del centro</h3>${bEventos}</div>
    </div>
    <div class="pf-sec" style="margin-top:16px">
      <h3>✉️ Mensajes con el centro</h3>
      <div id="pf-msgs" style="display:flex;flex-direction:column;gap:7px;margin-bottom:10px;max-height:260px;overflow-y:auto">${_pfMsgsHtml()}</div>
      <div style="display:flex;gap:8px">
        <textarea id="pf-msg-txt" rows="1" placeholder="Escribe al centro sobre tu hijo/a…" style="flex:1;padding:9px 11px;border:1px solid var(--line,var(--bdr));border-radius:9px;font-size:14px;background:var(--srf);resize:none;font-family:inherit"></textarea>
        <button onclick="_pfMsgEnviar(this)" style="padding:9px 16px;border:none;border-radius:9px;background:var(--ink,#1F2C4F);color:#fff;font-weight:600;cursor:pointer">Enviar</button>
      </div>
    </div>`;
}

function _pfMsgsHtml(){
  const ms=window._pfMsgs||[];
  if(!ms.length) return `<div class="pf-empty">Aún no hay mensajes. Escribe al centro cuando lo necesites.</div>`;
  return ms.map(m=>`<div style="align-self:${m.de_familia?"flex-end":"flex-start"};max-width:80%;padding:8px 11px;border-radius:11px;font-size:13.5px;white-space:pre-wrap;${m.de_familia?"background:var(--ink,#1F2C4F);color:#fff":"background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr))"}">${_pfEsc(m.texto)}</div>`).join("");
}

async function _pfMsgEnviar(btn){
  const ta=document.getElementById("pf-msg-txt"); const txt=(ta?.value||"").trim(); if(!txt||!_pfHijo) return;
  const uid=(typeof currentUser!=="undefined"&&currentUser)?currentUser.id:null;
  if(btn){ btn.disabled=true; }
  const { data, error } = await sb.from("mensajes").insert({ centro_id:ctrId, alumno_id:_pfHijo, remitente_id:uid, de_familia:true, texto:txt }).select("*").single();
  if(btn){ btn.disabled=false; }
  if(error){ if(typeof showToastGlobal==="function") showToastGlobal("Error: "+error.message,"error"); return; }
  (window._pfMsgs=window._pfMsgs||[]).push(data); if(ta) ta.value="";
  const cont=document.getElementById("pf-msgs"); if(cont){ cont.innerHTML=_pfMsgsHtml(); cont.scrollTop=cont.scrollHeight; }
}
window._pfMsgEnviar=_pfMsgEnviar;

async function _pfInforme(btn){
  if(!_pfHijo){ return; }
  const hijo=_pfHijos().find(h=>h.id===_pfHijo);
  const nombre=hijo?(hijo.nombre||"Alumno/a"):"Alumno/a";
  const orig=btn?btn.textContent:""; if(btn){ btn.disabled=true; btn.textContent="Generando…"; }
  try{
    const hace30=_pfHace(30);
    const [notas, asis, inc] = await Promise.all([
      sb.from("calificaciones").select("nota,evaluacion,fecha").eq("alumno_id",_pfHijo).order("fecha",{ascending:false}).limit(15),
      sb.from("asistencia").select("estado").eq("alumno_id",_pfHijo).gte("fecha",hace30),
      sb.from("incidencias").select("tipo,gravedad,estado,descripcion").eq("alumno_id",_pfHijo).order("fecha",{ascending:false}).limit(10),
    ]);
    const A=asis.data||[]; const tot=A.length; const okp=A.filter(r=>r.estado==="presente"||r.estado==="retraso").length;
    const pct=tot?Math.round(okp/tot*100):null;
    const N=notas.data||[]; const media=N.length?(N.reduce((s,r)=>s+Number(r.nota||0),0)/N.length):null;
    const notasTxt=N.length?N.map(r=>`- ${r.evaluacion||"Nota"}: ${r.nota}`).join("\n"):"(sin notas)";
    const incTxt=(inc.data||[]).length?(inc.data).map(i=>`- ${i.tipo} (${i.gravedad}): ${i.descripcion||""}`).join("\n"):"(sin incidencias)";
    const sys="Eres orientador pedagógico de una academia. Con estos datos redacta un informe para la familia con secciones: Fortalezas, Aspectos a reforzar, Recomendaciones de estudio y Objetivos. Español, cercano y constructivo, sin inventar datos.";
    const user=`Alumno/a: ${nombre}\nNota media (últimas): ${media==null?"s/d":media.toFixed(1)}\nAsistencia 30 días: ${pct==null?"s/d":pct+"%"}\nNOTAS:\n${notasTxt}\nINCIDENCIAS:\n${incTxt}`;
    const txt=await iaChat(sys,user);
    iaModal("Informe de evolución · "+nombre, txt||"Sin respuesta.");
  }catch(e){
    if(typeof showToastGlobal==="function") showToastGlobal("Error IA: "+e.message,"error"); else alert("Error IA: "+e.message);
  }finally{ if(btn){ btn.disabled=false; btn.textContent=orig; } }
}

window.initPortalFam=initPortalFam; window._pfSel=_pfSel; window._pfInforme=_pfInforme;
