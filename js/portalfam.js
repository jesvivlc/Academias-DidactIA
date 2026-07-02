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
    <h1 class="pf-h">Portal familiar</h1>
    <div class="pf-sub">Seguimiento de tus hijos en la academia</div>
    <div class="pf-hijos">${hijos.map(h=>`<span class="pf-hijo ${h.id===_pfHijo?"on":""}" onclick="_pfSel('${escArg(h.id)}')">${_pfEsc(h.nombre||"Hijo/a")}</span>`).join("")}</div>
    <div id="pf-body"><div class="pf-empty">Cargando…</div></div>
  </div>`;
  _pfRender();
}
function _pfSel(id){ _pfHijo=id; initPortalFam(); }

async function _pfRender(){
  const body=document.getElementById("pf-body"); if(!body) return;
  const hoy=_pfHoy(), en7=_pfMasDias(7), hace30=_pfHace(30);
  const [notas, asis, inc, tareas] = await Promise.all([
    sb.from("calificaciones").select("nota,evaluacion,fecha").eq("alumno_id",_pfHijo).order("fecha",{ascending:false}).limit(10),
    sb.from("asistencia").select("estado,fecha").eq("alumno_id",_pfHijo).gte("fecha",hace30).order("fecha",{ascending:false}),
    sb.from("incidencias").select("tipo,gravedad,estado,fecha,descripcion").eq("alumno_id",_pfHijo).order("fecha",{ascending:false}).limit(10),
    sb.from("tareas").select("titulo,tipo,fecha_entrega").gte("fecha_entrega",hoy).lte("fecha_entrega",en7).order("fecha_entrega"),
  ]);
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
    </div>`;
}

window.initPortalFam=initPortalFam; window._pfSel=_pfSel;
