// ── PORTAL PROFESOR · "Mi docencia" (Fase 2 · inc.4) ──
// Panel de solo lectura: grupos + horario de hoy + avisos del día (próximos
// exámenes, ausencias recientes, notas bajas). Sin SQL nuevo. Filtra por ctrId.
// Nota: aún no hay vínculo fiable profile↔profesores, así que muestra la docencia
// de TODO el centro (dirección/profesor ven lo mismo). Se acotará al asociar cuentas.

function _docEsc(s){ return escH(s); }
function _docHoy(){ return new Date().toISOString().slice(0,10); }
function _docDiaSemana(){ const d=new Date().getDay(); return d===0?7:d; } // 1=lun..7=dom
const _DOC_DIAS=["","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
function _docNombre(a){ return a?([a.nombre,a.apellidos].filter(Boolean).join(" ")||"(alumno)"):"—"; }

function _docEnsureStyles(){
  if (document.getElementById("doc-styles")) return;
  const st=document.createElement("style"); st.id="doc-styles";
  st.textContent=`
    #panel-docencia{padding:0!important;overflow-y:auto}
    .doc-wrap{padding:22px 26px;max-width:1000px}
    .doc-h{font-family:var(--font-display,serif);font-size:26px;margin:0 0 2px}
    .doc-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .doc-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .doc-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:120px}
    .doc-kpi-n{font-family:var(--font-display,serif);font-size:28px;font-weight:600}
    .doc-kpi-l{font-size:11.5px;color:var(--muted,var(--txt3))}
    .doc-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .doc-sec{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px 16px;background:var(--srf)}
    .doc-sec h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink)}
    .doc-item{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--line,var(--bdr));font-size:13px}
    .doc-item:last-child{border-bottom:none}
    .doc-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
    .doc-time{font-weight:700;font-size:12.5px;min-width:96px}
    .doc-badge{font-size:10.5px;padding:2px 8px;border-radius:20px;margin-left:auto;white-space:nowrap}
    .doc-b-exam{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .doc-b-aus{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .doc-b-nota{background:var(--info-soft,#e3eafa);color:var(--info,#4d6fa8)}
    .doc-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
    @media(max-width:820px){.doc-cols{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

async function initDocencia(){
  _docEnsureStyles();
  const panel=document.getElementById("panel-docencia"); if(!panel) return;
  panel.innerHTML=`<div class="doc-wrap"><div class="doc-sub">Cargando…</div></div>`;
  const hoy=_docHoy(), dia=_docDiaSemana();
  const hace7=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
  const hace30=new Date(Date.now()-30*864e5).toISOString().slice(0,10);
  const en7=new Date(Date.now()+7*864e5).toISOString().slice(0,10);

  // Si el usuario es profesor vinculado a una ficha, acotar a SUS grupos.
  let pid=null, misGrupos=null;
  if(typeof role!=="undefined" && role==="profesional" && typeof currentUser!=="undefined" && currentUser){
    const { data:pf } = await sb.from("profesores").select("id").eq("profile_id",currentUser.id).eq("centro_id",ctrId).limit(1);
    pid=(pf&&pf[0])?pf[0].id:null;
    if(pid){ const { data:gs } = await sb.from("grupos").select("id").eq("centro_id",ctrId).eq("profesor_id",pid); misGrupos=(gs||[]).map(g=>g.id); }
  }
  window._docFiltrado = !!pid;
  const _byGrupo=(qb)=> misGrupos!==null ? qb.in("grupo_id", misGrupos.length?misGrupos:["00000000-0000-0000-0000-000000000000"]) : qb;
  let gq=sb.from("grupos").select("id,nombre,color,aula").eq("centro_id",ctrId).eq("activo",true);
  if(pid) gq=gq.eq("profesor_id",pid);
  const [grupos, ses, exams, aus, notas] = await Promise.all([
    gq,
    _byGrupo(sb.from("grupo_sesiones").select("grupo_id,dia_semana,hora_inicio,hora_fin,aula").eq("centro_id",ctrId).eq("dia_semana",dia)),
    _byGrupo(sb.from("tareas").select("titulo,tipo,fecha_entrega,grupo_id").eq("centro_id",ctrId).eq("tipo","examen").gte("fecha_entrega",hoy).lte("fecha_entrega",en7).order("fecha_entrega")),
    _byGrupo(sb.from("asistencia").select("fecha,alumnos(nombre,apellidos)").eq("centro_id",ctrId).eq("estado","ausente").gte("fecha",hace7).order("fecha",{ascending:false}).limit(30)),
    _byGrupo(sb.from("calificaciones").select("nota,evaluacion,fecha,alumnos(nombre,apellidos)").eq("centro_id",ctrId).lt("nota",5).gte("fecha",hace30).order("fecha",{ascending:false}).limit(30)),
  ]);
  const gById=Object.fromEntries((grupos.data||[]).map(g=>[g.id,g]));
  const sesiones=(ses.data||[]).map(s=>({...s,g:gById[s.grupo_id]||{}})).sort((a,b)=>String(a.hora_inicio).localeCompare(String(b.hora_inicio)));

  const kpis=[
    { n:(grupos.data||[]).length, l:"Grupos activos" },
    { n:sesiones.length, l:"Clases hoy" },
    { n:(exams.data||[]).length, l:"Exámenes (7 días)" },
    { n:(aus.data||[]).length, l:"Ausencias (7 días)" },
  ];

  const hhmm=t=>String(t||"").slice(0,5);
  const panelHoy=sesiones.length?sesiones.map(s=>`
    <div class="doc-item"><span class="doc-dot" style="background:${_docEsc(s.g.color||'#888')}"></span>
      <span class="doc-time">${_docEsc(hhmm(s.hora_inicio))}–${_docEsc(hhmm(s.hora_fin))}</span>
      <span>${_docEsc(s.g.nombre||'Grupo')}</span>
      <span class="doc-badge" style="background:var(--surface-sunk,#eee)">${_docEsc(s.aula||s.g.aula||'aula —')}</span>
    </div>`).join(""):`<div class="doc-empty">Hoy (${_DOC_DIAS[dia]}) no hay clases programadas.</div>`;

  const panelExam=(exams.data||[]).length?(exams.data).map(e=>`
    <div class="doc-item"><span>${_docEsc(e.titulo)}</span><span class="doc-sub">${_docEsc((gById[e.grupo_id]||{}).nombre||'')}</span>
      <span class="doc-badge doc-b-exam">${_docEsc(e.fecha_entrega)}</span></div>`).join(""):`<div class="doc-empty">Sin exámenes en los próximos 7 días.</div>`;

  const panelAus=(aus.data||[]).length?(aus.data).slice(0,12).map(r=>`
    <div class="doc-item"><span>${_docEsc(_docNombre(r.alumnos))}</span>
      <span class="doc-badge doc-b-aus">falta · ${_docEsc(r.fecha)}</span></div>`).join(""):`<div class="doc-empty">Sin ausencias recientes.</div>`;

  const panelNotas=(notas.data||[]).length?(notas.data).slice(0,12).map(r=>`
    <div class="doc-item"><span>${_docEsc(_docNombre(r.alumnos))}</span>
      <span class="doc-sub">${_docEsc(r.evaluacion||'')}</span>
      <span class="doc-badge doc-b-nota">${_docEsc(String(r.nota))}</span></div>`).join(""):`<div class="doc-empty">Sin notas bajas (&lt;5) en 30 días.</div>`;

  panel.innerHTML=`
    <div class="doc-wrap">
      <h1 class="doc-h">Mi docencia</h1>
      <div class="doc-sub">Resumen del día · ${_DOC_DIAS[dia]} ${_docEsc(hoy)}</div>
      <div class="doc-kpis">${kpis.map(k=>`<div class="doc-kpi"><div class="doc-kpi-n">${k.n}</div><div class="doc-kpi-l">${k.l}</div></div>`).join("")}</div>
      <div class="doc-cols">
        <div class="doc-sec"><h3>🕘 Horario de hoy</h3>${panelHoy}</div>
        <div class="doc-sec"><h3>📝 Próximos exámenes</h3>${panelExam}</div>
        <div class="doc-sec"><h3>⚠ Ausencias recientes</h3>${panelAus}</div>
        <div class="doc-sec"><h3>📉 Notas para reforzar</h3>${panelNotas}</div>
      </div>
      <div class="doc-sub" style="margin-top:14px">${window._docFiltrado?"Mostrando solo tus grupos (cuenta vinculada a tu ficha de profesor).":"Muestra la docencia de todo el centro. Vincula cada cuenta de profesor a su ficha (Usuarios → Editar) para acotarla a sus grupos."}</div>
    </div>`;
}

window.initDocencia=initDocencia;
