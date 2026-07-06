// ── PANEL DEL NEGOCIO + COPILOTO DE DIRECCIÓN ──
// Home del dueño (dirección): KPIs económicos, ocupación, retención y agenda en vivo.
// + Copiloto ⌘K: barra de comandos en lenguaje natural que responde y actúa.
// Solo lectura sobre tablas existentes. Filtra por ctrId. Sobrescribe los hooks
// que el inline script de app.html invoca (renderHomeMetrics / renderMiHorarioHoy).

function _pnEsc(s){ return escH(s); }
function _pnEur(n){ return (Math.round(Number(n)||0)).toLocaleString("es-ES")+" €"; }
function _pnHace(n){ return new Date(Date.now()-n*864e5).toISOString().slice(0,10); }
function _pnPeriodo(){ return new Date().toISOString().slice(0,7); }
function _pnNombre(a){ return a?([a.nombre,a.apellidos].filter(Boolean).join(" ")||"(alumno)"):"—"; }
const _PN_MES=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function _pnStyles(){
  if(document.getElementById("pn-styles")) return;
  const st=document.createElement("style"); st.id="pn-styles";
  st.textContent=`
    #negocio-root{padding:4px 2px 30px}
    .pn-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin:2px 0 14px}
    .pn-hd-t{font-family:var(--font-display,serif);font-size:22px;font-weight:600;margin:0}
    .pn-hd-s{font-size:12.5px;color:var(--muted,var(--txt3))}
    .pn-health{display:flex;align-items:center;gap:12px;background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:14px;padding:10px 16px}
    .pn-health-ring{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:15px;color:#fff;flex-shrink:0}
    .pn-health-l{font-size:11px;color:var(--muted,var(--txt3));text-transform:uppercase;letter-spacing:.04em}
    .pn-health-v{font-size:14px;font-weight:600}
    .pn-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
    .pn-kpi{background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:14px;padding:14px 16px;cursor:pointer;transition:.15s;position:relative}
    .pn-kpi:hover{border-color:var(--ink);transform:translateY(-1px)}
    .pn-kpi-ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:15px;margin-bottom:9px}
    .pn-kpi-n{font-family:var(--font-display,serif);font-size:26px;font-weight:600;line-height:1.05}
    .pn-kpi-l{font-size:12px;color:var(--muted,var(--txt3));margin-top:2px}
    .pn-kpi-sub{font-size:11px;margin-top:5px;font-weight:600}
    .pn-grid2{display:grid;grid-template-columns:1.35fr 1fr;gap:16px;margin-bottom:16px}
    @media(max-width:900px){.pn-grid2{grid-template-columns:1fr}}
    .pn-card{background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:14px;padding:15px 17px}
    .pn-card-t{font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .pn-card-t a{font-size:12px;color:var(--ink);cursor:pointer;font-weight:600}
    .pn-bars{display:flex;align-items:flex-end;gap:9px;height:120px;padding-top:6px}
    .pn-bar-w{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}
    .pn-bar{width:70%;border-radius:6px 6px 0 0;background:var(--ink);min-height:3px;transition:.2s}
    .pn-bar.prev{background:var(--line-strong,#c5bfb2);opacity:.55}
    .pn-bar-l{font-size:10.5px;color:var(--muted,var(--txt3))}
    .pn-bar-v{font-size:10.5px;font-weight:600}
    .pn-li{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line,var(--bdr));cursor:pointer}
    .pn-li:first-child{border-top:none}
    .pn-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
    .pn-li-n{font-size:13.5px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pn-li-m{font-size:11.5px;color:var(--muted,var(--txt3))}
    .pn-tag{font-size:10.5px;padding:2px 8px;border-radius:20px;font-weight:600}
    .pn-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:8px 0}
    .pn-ev{display:flex;gap:11px;padding:8px 0;border-top:1px solid var(--line,var(--bdr))}
    .pn-ev:first-child{border-top:none}
    .pn-ev-d{text-align:center;min-width:38px}
    .pn-ev-dd{font-family:var(--font-display,serif);font-size:19px;font-weight:600;line-height:1}
    .pn-ev-mm{font-size:10px;text-transform:uppercase;color:var(--muted,var(--txt3))}
    .pn-ev-t{font-size:13px;font-weight:600}
    .pn-ev-s{font-size:11.5px;color:var(--muted,var(--txt3))}
    .pn-cta{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}
    .pn-cta button{padding:7px 13px;border-radius:9px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:12.5px;font-weight:600}
    .pn-cta button.p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .pn-skel{height:14px;border-radius:6px;background:linear-gradient(90deg,var(--surface-sunk,#eee),var(--paper-2,#f4f2ee),var(--surface-sunk,#eee));background-size:200% 100%;animation:pnsk 1.2s infinite}
    @keyframes pnsk{0%{background-position:200% 0}100%{background-position:-200% 0}}
    /* Copiloto ⌘K */
    .cp-ov{position:fixed;inset:0;background:rgba(20,18,15,.42);backdrop-filter:blur(3px);z-index:9999;display:none;align-items:flex-start;justify-content:center;padding-top:11vh}
    .cp-ov.on{display:flex}
    .cp-box{width:min(640px,92vw);background:var(--srf,#fff);border:1px solid var(--line,var(--bdr));border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.28);overflow:hidden;max-height:76vh;display:flex;flex-direction:column}
    .cp-inp-row{display:flex;align-items:center;gap:10px;padding:15px 18px;border-bottom:1px solid var(--line,var(--bdr))}
    .cp-inp-row i{font-size:19px;color:var(--ink)}
    .cp-inp{flex:1;border:none;outline:none;font-size:16px;background:transparent;font-family:inherit;color:var(--txt,#222)}
    .cp-kbd{font-size:11px;color:var(--muted,var(--txt3));border:1px solid var(--line,var(--bdr));border-radius:6px;padding:2px 7px}
    .cp-body{overflow-y:auto;padding:8px}
    .cp-sec{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,var(--txt3));padding:9px 12px 4px;font-weight:700}
    .cp-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;cursor:pointer;font-size:13.5px}
    .cp-item:hover,.cp-item.sel{background:var(--paper-2,var(--srf2))}
    .cp-item i{font-size:17px;color:var(--ink);width:20px;text-align:center}
    .cp-item .cp-desc{font-size:11.5px;color:var(--muted,var(--txt3))}
    .cp-ans{padding:14px 18px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;border-top:1px solid var(--line,var(--bdr))}
    .cp-ans .cp-load{display:inline-flex;gap:5px}
    .cp-ans .cp-load span{width:6px;height:6px;border-radius:50%;background:var(--muted);animation:cpb 1s infinite}
    .cp-ans .cp-load span:nth-child(2){animation-delay:.15s}.cp-ans .cp-load span:nth-child(3){animation-delay:.3s}
    @keyframes cpb{0%,60%,100%{opacity:.3}30%{opacity:1}}
  `;
  document.head.appendChild(st);
}

// ───────────────────────── PANEL DEL NEGOCIO ─────────────────────────
let _pnData=null;

async function initNegocio(){
  _pnStyles();
  const host=document.getElementById("inicio-admin"); if(!host) return;
  let root=document.getElementById("negocio-root");
  if(!root){
    root=document.createElement("div"); root.id="negocio-root";
    const head=host.querySelector(".home-head");
    if(head&&head.nextSibling) host.insertBefore(root,head.nextSibling); else host.appendChild(root);
  }
  // ocultar bloques heredados (horario/métricas/briefing) en la home del dueño
  host.querySelectorAll(".home-horario,.home-metrics,#agent-briefing").forEach(el=>el.style.display="none");
  root.innerHTML=`<div class="pn-kpis">${Array(6).fill('<div class="pn-kpi"><div class="pn-skel" style="width:60%"></div><div class="pn-skel" style="width:80%;margin-top:10px;height:22px"></div></div>').join("")}</div>`;

  try{ await _pnLoad(); _pnRender(root); }
  catch(e){ root.innerHTML=`<div class="pn-empty">No se pudo cargar el panel: ${_pnEsc(e.message||String(e))}</div>`; }
}

async function _pnLoad(){
  const per=_pnPeriodo(), d30=_pnHace(30);
  const [al,mat,mg,gr,pg,asis,cal,inc,ev] = await Promise.all([
    sb.from("alumnos").select("id,nombre,apellidos,estado,fecha_alta,nivel_educativo").eq("centro_id",ctrId),
    sb.from("matriculas").select("id,alumno_id,estado,cuota_mensual,descuento").eq("centro_id",ctrId),
    sb.from("matricula_grupo").select("grupo_id,matricula_id").eq("centro_id",ctrId),
    sb.from("grupos").select("id,nombre,capacidad,cuota_mensual,activo").eq("centro_id",ctrId).eq("activo",true),
    sb.from("pagos").select("alumno_id,importe,estado,periodo,fecha").eq("centro_id",ctrId).gte("fecha",_pnHace(200)),
    sb.from("asistencia").select("alumno_id,estado").eq("centro_id",ctrId).gte("fecha",d30),
    sb.from("calificaciones").select("alumno_id,nota").eq("centro_id",ctrId).gte("fecha",_pnHace(60)),
    sb.from("incidencias").select("id,estado").eq("centro_id",ctrId).neq("estado","cerrada"),
    sb.from("eventos").select("titulo,fecha,hora,tipo").eq("centro_id",ctrId).gte("fecha",_pnHace(0)).order("fecha").limit(6),
  ]);
  _pnData={ per,
    alumnos:al.data||[], mat:mat.data||[], mg:mg.data||[], grupos:gr.data||[],
    pagos:pg.data||[], asis:asis.data||[], cal:cal.data||[], inc:inc.data||[], eventos:ev.data||[] };
  return _pnData;
}

function _pnCompute(){
  const d=_pnData, per=d.per;
  const activos=d.alumnos.filter(a=>a.estado==="activo");
  const nombreById={}; d.alumnos.forEach(a=>nombreById[a.id]=_pnNombre(a));
  // Económico mes
  const pagMes=d.pagos.filter(p=>(p.periodo||String(p.fecha).slice(0,7))===per);
  const cobrado=pagMes.filter(p=>p.estado==="pagado").reduce((s,p)=>s+Number(p.importe||0),0);
  const pendientes=pagMes.filter(p=>p.estado==="pendiente");
  const pendImporte=pendientes.reduce((s,p)=>s+Number(p.importe||0),0);
  const prevision=d.mat.filter(m=>m.estado==="activa").reduce((s,m)=>s+Number(m.cuota_mensual||0)*(1-Number(m.descuento||0)/100),0);
  // Ingresos 6 meses
  const serie=[]; const now=new Date();
  for(let i=5;i>=0;i--){ const dt=new Date(now.getFullYear(),now.getMonth()-i,1); const pk=dt.toISOString().slice(0,7);
    const v=d.pagos.filter(p=>(p.periodo||String(p.fecha).slice(0,7))===pk && p.estado==="pagado").reduce((s,p)=>s+Number(p.importe||0),0);
    serie.push({ pk, label:_PN_MES[dt.getMonth()], v }); }
  // Ocupación
  const cnt={}; d.mg.forEach(r=>cnt[r.grupo_id]=(cnt[r.grupo_id]||0)+1);
  const capTot=d.grupos.reduce((s,g)=>s+Number(g.capacidad||0),0);
  const ocupTot=d.grupos.reduce((s,g)=>s+(cnt[g.id]||0),0);
  const ocupPct=capTot?Math.round(ocupTot/capTot*100):0;
  // Riesgo (asistencia + notas + impago)
  const byAsis={}, byCal={};
  d.asis.forEach(r=>{ const s=byAsis[r.alumno_id]=byAsis[r.alumno_id]||{t:0,ok:0}; s.t++; if(r.estado==="presente"||r.estado==="retraso") s.ok++; });
  d.cal.forEach(r=>{ const s=byCal[r.alumno_id]=byCal[r.alumno_id]||{n:0,sum:0}; s.n++; s.sum+=Number(r.nota||0); });
  const impagoSet=new Set(pendientes.map(p=>p.alumno_id));
  const riesgo=[];
  activos.forEach(a=>{
    let score=0; const sig=[];
    const as=byAsis[a.id]; if(as&&as.t>=3){ const pct=Math.round(as.ok/as.t*100); if(pct<70){score+=3;sig.push("Asistencia "+pct+"%");} else if(pct<85){score+=1;sig.push("Asistencia "+pct+"%");} }
    const cl=byCal[a.id]; if(cl&&cl.n>=1){ const m=cl.sum/cl.n; if(m<5){score+=2;sig.push("Media "+m.toFixed(1));} else if(m<6){score+=1;sig.push("Media "+m.toFixed(1));} }
    if(impagoSet.has(a.id)){ score+=2; sig.push("Impago del mes"); }
    if(score>=3) riesgo.push({ id:a.id, nombre:_pnNombre(a), score, sig, nivel:score>=5?"alto":"medio" });
  });
  riesgo.sort((x,y)=>y.score-x.score);
  // Health score
  const cobroRate=prevision?Math.min(1,cobrado/prevision):(cobrado>0?1:0);
  const asisAll=d.asis.length?d.asis.filter(r=>r.estado==="presente"||r.estado==="retraso").length/d.asis.length:1;
  const retenRate=activos.length?1-Math.min(1,riesgo.length/activos.length):1;
  const health=Math.round((cobroRate*0.4 + asisAll*0.3 + retenRate*0.3)*100);
  return { per,activos,cobrado,pendientes,pendImporte,prevision,serie,ocupPct,ocupTot,capTot,
    grupos:d.grupos,cnt,riesgo,incAbiertas:d.inc.length,eventos:d.eventos,nombreById,
    asisPct:Math.round(asisAll*100),health };
}

function _pnRender(root){
  const c=_pnCompute(); _pnLast=c;
  const hColor=c.health>=75?"var(--success,#3F9367)":c.health>=50?"var(--warning,#D69540)":"var(--danger,#C24D2F)";
  const hTxt=c.health>=75?"Saludable":c.health>=50?"Atención":"Riesgo";
  const maxV=Math.max(1,...c.serie.map(s=>s.v), c.prevision);
  const kpi=(ic,bg,n,l,sub,subcolor,onclick)=>`<div class="pn-kpi" onclick="${onclick}"><div class="pn-kpi-ic" style="background:${bg}">${ic}</div><div class="pn-kpi-n">${n}</div><div class="pn-kpi-l">${l}</div>${sub?`<div class="pn-kpi-sub" style="color:${subcolor}">${sub}</div>`:""}</div>`;

  root.innerHTML=`
    <div class="pn-hd">
      <div>
        <h2 class="pn-hd-t">Panel del negocio</h2>
        <div class="pn-hd-s">${_pnEsc(ctrName||"Academia")} · ${_pnEsc(c.per)} · en tiempo real</div>
      </div>
      <div class="pn-health">
        <div class="pn-health-ring" style="background:${hColor}">${c.health}</div>
        <div><div class="pn-health-l">Salud del centro</div><div class="pn-health-v">${hTxt}</div></div>
      </div>
    </div>

    <div class="pn-kpis">
      ${kpi("💶","var(--success-soft,#e3f2ec)",_pnEur(c.cobrado),"Cobrado este mes",
        "de "+_pnEur(c.prevision)+" previsto","var(--muted)","showTab('cobros')")}
      ${kpi("⚠️","var(--danger-soft,#fae6e0)",c.pendientes.length,"Impagos del mes",
        c.pendientes.length?_pnEur(c.pendImporte)+" pendiente":"Todo al día",c.pendientes.length?"var(--danger,#C24D2F)":"var(--success,#3F9367)","showTab('cobros')")}
      ${kpi("🎓","var(--info-soft,#e3eafa)",c.activos.length,"Alumnos activos",
        "","","showTab('alumnos')")}
      ${kpi("📊","var(--accent-soft,#f3e1d5)",c.ocupPct+"%","Ocupación de grupos",
        c.ocupTot+"/"+c.capTot+" plazas","var(--muted)","showTab('grupos')")}
      ${kpi("📉","var(--warning-soft,#fbf0dc)",c.riesgo.length,"Alumnos en riesgo",
        c.riesgo.length?"Riesgo de baja":"Sin alertas",c.riesgo.length?"var(--warning,#D69540)":"var(--success,#3F9367)","showTab('riesgo')")}
      ${kpi("✅","var(--surface-sunk,#ececE4)",c.asisPct+"%","Asistencia (30 días)",
        "","","showTab('asistencia')")}
    </div>

    <div class="pn-grid2">
      <div class="pn-card">
        <div class="pn-card-t">Ingresos de los últimos 6 meses <a onclick="showTab('cobros')">Ver cobros →</a></div>
        <div class="pn-bars">
          ${c.serie.map(s=>`<div class="pn-bar-w"><div class="pn-bar-v">${s.v?Math.round(s.v/1000*10)/10+"k":""}</div><div class="pn-bar" style="height:${Math.round(s.v/maxV*100)}%"></div><div class="pn-bar-l">${s.label}</div></div>`).join("")}
        </div>
      </div>
      <div class="pn-card">
        <div class="pn-card-t">Próximos eventos <a onclick="showTab('calendario')">Agenda →</a></div>
        ${c.eventos.length?c.eventos.map(_pnEvHtml).join(""):`<div class="pn-empty">Sin eventos próximos.</div>`}
      </div>
    </div>

    <div class="pn-grid2">
      <div class="pn-card">
        <div class="pn-card-t">Alumnos en riesgo de baja <a onclick="showTab('riesgo')">Ver todos →</a></div>
        ${c.riesgo.length?c.riesgo.slice(0,5).map(r=>`
          <div class="pn-li" onclick="showTab('riesgo')">
            <span class="pn-dot" style="background:${r.nivel==="alto"?"var(--danger,#C24D2F)":"var(--warning,#D69540)"}"></span>
            <span class="pn-li-n">${_pnEsc(r.nombre)}</span>
            <span class="pn-li-m">${_pnEsc(r.sig.slice(0,2).join(" · "))}</span>
            <span class="pn-tag" style="background:${r.nivel==="alto"?"var(--danger-soft,#fae6e0);color:var(--danger,#C24D2F)":"var(--warning-soft,#fbf0dc);color:var(--warning,#B8860B)"}">${r.nivel}</span>
          </div>`).join(""):`<div class="pn-empty">✓ Ningún alumno con señales de baja.</div>`}
      </div>
      <div class="pn-card">
        <div class="pn-card-t">Impagos del mes ${c.pendientes.length?`<a onclick="_pnRecordar(this)">📧 Recordar</a>`:""}</div>
        ${c.pendientes.length?c.pendientes.slice(0,6).map(p=>`
          <div class="pn-li" onclick="showTab('cobros')">
            <span class="pn-dot" style="background:var(--danger,#C24D2F)"></span>
            <span class="pn-li-n">${_pnEsc(c.nombreById[p.alumno_id]||"Alumno")}</span>
            <span class="pn-li-m">${_pnEur(p.importe)}</span>
          </div>`).join(""):`<div class="pn-empty">✓ Todas las cuotas del mes están cobradas.</div>`}
        <div class="pn-cta">
          <button class="p" onclick="_cpOpen()">✨ Preguntar al copiloto</button>
          <button onclick="showTab('cobros')">Ir a cobros</button>
        </div>
      </div>
    </div>`;
}

function _pnEvHtml(e){
  const dt=new Date(e.fecha+"T00:00:00"); const dd=dt.getDate(); const mm=_PN_MES[dt.getMonth()];
  const tipo={reunion:"Reunión",pago:"Cobros",renovacion:"Renovación",otro:"Evento"}[e.tipo]||"Evento";
  return `<div class="pn-ev"><div class="pn-ev-d"><div class="pn-ev-dd">${dd}</div><div class="pn-ev-mm">${mm}</div></div>
    <div style="flex:1"><div class="pn-ev-t">${_pnEsc(e.titulo)}</div><div class="pn-ev-s">${tipo}${e.hora?" · "+String(e.hora).slice(0,5):""}</div></div></div>`;
}

let _pnLast=null;
async function _pnRecordar(el){
  if(el){ el.textContent="Enviando…"; }
  try{
    const { data, error } = await sb.functions.invoke("recordar-impagos",{ body:{ centro_id:ctrId, periodo:_pnPeriodo() } });
    if(error) throw error; if(data?.error) throw new Error(data.error);
    showToastGlobal("Recordatorio enviado a "+(data?.sent??0)+" familia(s)","success");
  }catch(e){ showToastGlobal("Error: "+(e.message||e),"error"); }
  if(el){ el.textContent="📧 Recordar"; }
}

// ───────────────────────── HOOKS DEL HOME ─────────────────────────
// El inline de app.html llama a renderHomeMetrics()/renderMiHorarioHoy() para staff/admin.
function renderHomeMetrics(){
  const r=(typeof role!=="undefined"?role:"")||"";
  const isAdmin=r==="admin"||r==="superadmin"||r==="admin_institucional";
  if(isAdmin){ try{ initNegocio(); }catch(e){} return; }
  // profesor: métricas simples reutilizando los data-metric del home staff
  _pnStaffMetrics();
}
async function _pnStaffMetrics(){
  try{
    const d30=_pnHace(7);
    const [inc,ev]=await Promise.all([
      sb.from("incidencias").select("id",{count:"exact",head:true}).eq("centro_id",ctrId).neq("estado","cerrada"),
      sb.from("eventos").select("id",{count:"exact",head:true}).eq("centro_id",ctrId).gte("fecha",_pnHace(0)),
    ]);
    document.querySelectorAll('#inicio-staff [data-metric="inc"]').forEach(e=>e.textContent=inc.count??0);
    document.querySelectorAll('#inicio-staff [data-metric="com"]').forEach(e=>e.textContent=ev.count??0);
    document.querySelectorAll('#inicio-staff [data-metric="sust"]').forEach(e=>e.textContent="—");
  }catch(e){}
}
async function renderMiHorarioHoy(){
  const bodies=document.querySelectorAll('#inicio-staff [data-horario-body]');
  if(!bodies.length) return;
  try{
    const dow=(new Date().getDay()||7); // 1..7
    const { data } = await sb.from("grupo_sesiones").select("hora_inicio,hora_fin,aula,grupos(nombre,asignatura)").eq("centro_id",ctrId).eq("dia_semana",dow).order("hora_inicio");
    const rows=data||[];
    const cnt=document.querySelectorAll('#inicio-staff [data-horario-count]');
    cnt.forEach(e=>e.textContent=rows.length?rows.length+" clase(s)":"");
    const html=rows.length?rows.map(s=>`<div style="display:flex;gap:12px;align-items:center;padding:7px 0;border-top:1px solid var(--line,var(--bdr))">
      <strong style="font-size:13px;min-width:96px">${String(s.hora_inicio).slice(0,5)}–${String(s.hora_fin).slice(0,5)}</strong>
      <span style="font-size:13.5px;flex:1">${_pnEsc(s.grupos?.nombre||s.grupos?.asignatura||"Clase")}</span>
      <span style="font-size:12px;color:var(--muted,var(--txt3))">${_pnEsc(s.aula||"")}</span></div>`).join("")
      :`<div class="home-horario-empty">No hay clases programadas para hoy.</div>`;
    bodies.forEach(b=>b.innerHTML=html);
  }catch(e){}
}

// ───────────────────────── COPILOTO DE DIRECCIÓN ⌘K ─────────────────────────
const _CP_CMDS=[
  { ic:"ti ti-report-money", t:"¿Cómo va el mes?", d:"Resumen económico y de actividad", act:"resumen_mes" },
  { ic:"ti ti-alert-triangle", t:"¿Qué alumnos están en riesgo?", d:"Retención y bajas probables", act:"riesgo" },
  { ic:"ti ti-mail-forward", t:"Recordar los impagos por email", d:"Envía aviso a las familias con cuota pendiente", act:"recordar" },
  { ic:"ti ti-calendar", t:"Resume mi semana", d:"Eventos, cobros y seguimiento", act:"semana" },
  { ic:"ti ti-chart-bar", t:"Ocupación de los grupos", d:"Plazas libres por grupo", act:"ocupacion" },
];

function _cpEnsure(){
  _pnStyles();
  if(document.getElementById("cp-ov")) return;
  const ov=document.createElement("div"); ov.className="cp-ov"; ov.id="cp-ov";
  ov.innerHTML=`
    <div class="cp-box" onclick="event.stopPropagation()">
      <div class="cp-inp-row">
        <i class="ti ti-sparkles"></i>
        <input class="cp-inp" id="cp-inp" placeholder="Pregunta o pide algo a la dirección…" autocomplete="off">
        <span class="cp-kbd">Esc</span>
      </div>
      <div class="cp-body" id="cp-body"></div>
    </div>`;
  ov.addEventListener("click",()=>_cpClose());
  document.body.appendChild(ov);
  const inp=ov.querySelector("#cp-inp");
  inp.addEventListener("input",()=>_cpList(inp.value));
  inp.addEventListener("keydown",e=>{
    if(e.key==="Escape") _cpClose();
    else if(e.key==="Enter"){ e.preventDefault(); _cpRun(inp.value); }
  });
}
function _cpOpen(){
  _cpEnsure();
  const ov=document.getElementById("cp-ov"); ov.classList.add("on");
  const inp=document.getElementById("cp-inp"); inp.value=""; _cpList("");
  setTimeout(()=>inp.focus(),30);
}
function _cpClose(){ const ov=document.getElementById("cp-ov"); if(ov) ov.classList.remove("on"); }
function _cpList(q){
  const body=document.getElementById("cp-body"); if(!body) return;
  const cmds=_CP_CMDS;
  body.innerHTML=`<div class="cp-sec">Sugerencias</div>${cmds.map(c=>`
    <div class="cp-item" onclick="_cpAct('${c.act}')"><i class="${c.ic}"></i>
      <div style="flex:1"><div>${_pnEsc(c.t)}</div><div class="cp-desc">${_pnEsc(c.d)}</div></div></div>`).join("")}
    ${q&&q.trim()?`<div class="cp-sec">Preguntar</div><div class="cp-item sel" onclick="_cpRun(document.getElementById('cp-inp').value)"><i class="ti ti-sparkles"></i><div style="flex:1"><div>Preguntar: "${_pnEsc(q.trim())}"</div><div class="cp-desc">Responde con IA usando los datos del centro</div></div></div>`:""}`;
}
function _cpAct(act){
  if(act==="riesgo"){ _cpClose(); showTab("riesgo"); return; }
  if(act==="ocupacion"){ _cpClose(); showTab("grupos"); return; }
  if(act==="recordar"){ _cpAnswer("Enviando recordatorios de impago…"); _pnRecordar(null).then(()=>_cpAnswer("✅ Recordatorios de impago enviados a las familias con cuota pendiente.")); return; }
  const map={resumen_mes:"¿Cómo va el mes?",semana:"Resume mi semana"};
  _cpRun(map[act]||act);
}
function _cpAnswer(html){
  const body=document.getElementById("cp-body"); if(!body) return;
  body.innerHTML=`<div class="cp-ans">${html}</div>`;
}

async function _cpRun(q){
  q=(q||"").trim(); if(!q) return;
  // intención directa: recordar impagos
  if(/impago|recordar|recordatorio/i.test(q) && /email|correo|recuerda|recordar|avisa|envia|envía/i.test(q)){
    _cpAnswer("Enviando recordatorios de impago…");
    await _pnRecordar(null); _cpAnswer("✅ Recordatorios de impago enviados a las familias con cuota pendiente."); return;
  }
  _cpAnswer(`<span class="cp-load"><span></span><span></span><span></span></span>`);
  try{
    const ctx=await _cpContext();
    const sys="Eres el copiloto de dirección de "+(ctrName||"una academia de repaso de ESO")+". Respondes al director/a en español, breve, concreto y accionable, con cifras. Usa SOLO los datos del contexto (no inventes). Si procede, sugiere una acción. Formato: frases cortas o lista con guiones. Máximo 130 palabras.";
    const user="DATOS DEL CENTRO (hoy):\n"+ctx+"\n\nPREGUNTA: "+q;
    const txt=await iaChat(sys,user);
    _cpAnswer(_pnEsc(txt||"Sin respuesta.")+`<div class="pn-cta" style="margin-top:12px"><button onclick="_cpClose()">Cerrar</button></div>`);
  }catch(e){
    _cpAnswer("No se pudo consultar la IA: "+_pnEsc(e.message||String(e))+"\n\n(Configura GEMINI_API_KEY en la Edge Function chat.)");
  }
}

async function _cpContext(){
  // reutiliza datos del panel si están frescos; si no, recarga
  if(!_pnData) await _pnLoad();
  const c=_pnCompute();
  const gruposLibres=c.grupos.map(g=>({n:g.nombre,libre:Number(g.capacidad||0)-(c.cnt[g.id]||0)})).filter(x=>x.libre>0).slice(0,8);
  const L=[];
  L.push("Alumnos activos: "+c.activos.length);
  L.push("Cobrado este mes: "+Math.round(c.cobrado)+" € de "+Math.round(c.prevision)+" € previstos");
  L.push("Impagos del mes: "+c.pendientes.length+" ("+Math.round(c.pendImporte)+" € pendientes)");
  L.push("Ocupación media de grupos: "+c.ocupPct+"% ("+c.ocupTot+"/"+c.capTot+" plazas)");
  L.push("Asistencia media (30 días): "+c.asisPct+"%");
  L.push("Incidencias abiertas: "+c.incAbiertas);
  L.push("Salud del centro: "+c.health+"/100");
  if(c.riesgo.length){ L.push("Alumnos en riesgo de baja ("+c.riesgo.length+"): "+c.riesgo.slice(0,8).map(r=>r.nombre+" ["+r.sig.join(", ")+"]").join("; ")); }
  else L.push("Alumnos en riesgo de baja: 0");
  if(gruposLibres.length) L.push("Grupos con plazas libres: "+gruposLibres.map(g=>g.n+" ("+g.libre+")").join("; "));
  if(c.eventos.length) L.push("Próximos eventos: "+c.eventos.map(e=>e.titulo+" ("+e.fecha+")").join("; "));
  return L.join("\n");
}

// atajo global ⌘K / Ctrl+K
function _cpInitGlobal(){
  if(window._cpBound) return; window._cpBound=true;
  document.addEventListener("keydown",e=>{
    if((e.metaKey||e.ctrlKey) && (e.key==="k"||e.key==="K")){
      const r=(typeof role!=="undefined"?role:"")||"";
      if(r==="familia") return; // copiloto solo para staff/dirección
      e.preventDefault(); _cpOpen();
    }
  });
  // clic en los buscadores del home abre el copiloto
  ["home-search-admin","home-search-staff"].forEach(id=>{
    const el=document.getElementById(id); if(el && !el._cpBound){ el._cpBound=true; el.addEventListener("click",_cpOpen); el.style.cursor="pointer"; }
  });
}

window.initNegocio=initNegocio;
window.renderHomeMetrics=renderHomeMetrics;
window.renderMiHorarioHoy=renderMiHorarioHoy;
window._pnRecordar=_pnRecordar;
window._cpOpen=_cpOpen; window._cpClose=_cpClose; window._cpList=_cpList; window._cpAct=_cpAct; window._cpRun=_cpRun;
document.addEventListener("DOMContentLoaded",()=>{ try{ _cpInitGlobal(); }catch(e){} });
setTimeout(()=>{ try{ _cpInitGlobal(); }catch(e){} },1500);
