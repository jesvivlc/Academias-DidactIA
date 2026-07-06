// ── DETECCIÓN DE RIESGO (Fase 5) ──
// Detección temprana DETERMINISTA (sin IA): cruza asistencia, incidencias y notas
// de los últimos 30 días para señalar alumnos en riesgo. Solo lectura. Por ctrId.
// Los botones de IA (plan de refuerzo / recursos / tutor) son hooks: requieren Gemini.

function _rgEsc(s){ return escH(s); }
function _rgHace(n){ return new Date(Date.now()-n*864e5).toISOString().slice(0,10); }
function _rgNombre(a){ return [a.nombre,a.apellidos].filter(Boolean).join(" ") || "(alumno)"; }

function _rgEnsureStyles(){
  if (document.getElementById("rg-styles")) return;
  const st=document.createElement("style"); st.id="rg-styles";
  st.textContent=`
    #panel-riesgo{padding:0!important;overflow-y:auto}
    .rg-wrap{padding:22px 26px;max-width:920px}
    .rg-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .rg-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .rg-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .rg-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:130px}
    .rg-kpi-n{font-family:var(--font-display,serif);font-size:26px;font-weight:600}
    .rg-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .rg-card{border:1px solid var(--line,var(--bdr));border-radius:11px;padding:12px 15px;margin-bottom:9px;background:var(--srf);display:flex;align-items:flex-start;gap:12px}
    .rg-card.alto{border-left:5px solid var(--danger,#c24d2f)}
    .rg-card.medio{border-left:5px solid var(--warning,#d69540)}
    .rg-sem{width:12px;height:12px;border-radius:50%;margin-top:5px;flex-shrink:0}
    .rg-sem.alto{background:var(--danger,#c24d2f)}
    .rg-sem.medio{background:var(--warning,#d69540)}
    .rg-nom{font-size:15px;font-weight:600}
    .rg-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    .rg-chip{font-size:11px;padding:2px 9px;border-radius:20px;background:var(--surface-sunk,#eee);color:var(--muted,var(--txt3))}
    .rg-chip.bad{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .rg-data{font-size:12px;color:var(--muted,var(--txt3));margin-top:5px}
    .rg-acts{margin-left:auto;display:flex;flex-direction:column;gap:6px}
    .rg-btn{padding:5px 11px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap}
    .rg-empty{font-size:13px;color:var(--success,#2e7d32);padding:10px 0}
    .rg-note{font-size:11.5px;color:var(--muted,var(--txt3));margin-top:16px;border-top:1px solid var(--line,var(--bdr));padding-top:10px}
  `;
  document.head.appendChild(st);
}

async function initRiesgo(){
  _rgEnsureStyles();
  const panel=document.getElementById("panel-riesgo"); if(!panel) return;
  panel.innerHTML=`<div class="rg-wrap"><div class="rg-sub">Analizando…</div></div>`;
  const d30=_rgHace(30), per=new Date().toISOString().slice(0,7);
  const [al, asis, inc, cal, mat, pag] = await Promise.all([
    sb.from("alumnos").select("id,nombre,apellidos,fecha_alta").eq("centro_id",ctrId).eq("estado","activo"),
    sb.from("asistencia").select("alumno_id,estado").eq("centro_id",ctrId).gte("fecha",d30),
    sb.from("incidencias").select("alumno_id,gravedad,estado").eq("centro_id",ctrId).neq("estado","cerrada"),
    sb.from("calificaciones").select("alumno_id,nota").eq("centro_id",ctrId).gte("fecha",_rgHace(60)),
    sb.from("matriculas").select("alumno_id,estado,fecha_alta").eq("centro_id",ctrId).eq("estado","activa"),
    sb.from("pagos").select("alumno_id,estado,periodo,fecha").eq("centro_id",ctrId).gte("fecha",_rgHace(90)),
  ]);
  const alumnos=al.data||[];
  const byAsis={}, byCal={};
  (asis.data||[]).forEach(r=>{ const s=byAsis[r.alumno_id]=byAsis[r.alumno_id]||{tot:0,ok:0}; s.tot++; if(r.estado==="presente"||r.estado==="retraso") s.ok++; });
  (cal.data||[]).forEach(r=>{ const s=byCal[r.alumno_id]=byCal[r.alumno_id]||{n:0,sum:0}; s.n++; s.sum+=Number(r.nota||0); });
  const incCount={}; (inc.data||[]).forEach(r=>{ if(r.gravedad==="grave"||r.gravedad==="moderada") incCount[r.alumno_id]=(incCount[r.alumno_id]||0)+1; });
  // impago del mes en curso
  const impagoSet=new Set((pag.data||[]).filter(p=>((p.periodo||String(p.fecha).slice(0,7))===per)&&p.estado==="pendiente").map(p=>p.alumno_id));
  const altaById={}; alumnos.forEach(a=>altaById[a.id]=a.fecha_alta);
  (mat.data||[]).forEach(m=>{ if(m.fecha_alta) altaById[m.alumno_id]=m.fecha_alta; });

  const filas=[];
  alumnos.forEach(a=>{
    const señales=[]; const asisS=byAsis[a.id]; const calS=byCal[a.id]; const nInc=incCount[a.id]||0;
    let pct=null, media=null, score=0, impago=impagoSet.has(a.id);
    if(asisS && asisS.tot>=3){ pct=Math.round(asisS.ok/asisS.tot*100); if(pct<70){señales.push("asistencia");score+=3;} else if(pct<85){señales.push("asistencia");score+=1;} }
    if(nInc>0){ señales.push("conducta"); score+=nInc>=2?2:1; }
    if(calS && calS.n>=1){ media=calS.sum/calS.n; if(media<5){señales.push("rendimiento");score+=2;} else if(media<6){señales.push("rendimiento");score+=1;} }
    if(impago){ señales.push("impago"); score+=2; }
    // recién matriculados con señal = más frágiles
    const diasAlta=altaById[a.id]?Math.round((Date.now()-new Date(altaById[a.id]).getTime())/864e5):999;
    if(diasAlta<60 && score>0){ señales.push("nuevo"); score+=1; }
    if(score>=3) filas.push({ a, señales, pct, media, nInc, impago, score, diasAlta, nivel: score>=5?"alto":"medio" });
  });
  filas.sort((x,y)=> y.score-x.score || (x.media??10)-(y.media??10));

  const alto=filas.filter(f=>f.nivel==="alto").length;
  const medio=filas.filter(f=>f.nivel==="medio").length;
  const retencion=alumnos.length?Math.round((1-filas.length/alumnos.length)*100):100;

  panel.innerHTML=`
    <div class="rg-wrap">
      <h1 class="rg-h">Predicción de bajas</h1>
      <div class="rg-sub">Retención: alumnos con probabilidad de no renovar, cruzando asistencia, notas, impagos, conducta y antigüedad</div>
      <div class="rg-kpis">
        <div class="rg-kpi"><div class="rg-kpi-n" style="color:var(--danger,#c24d2f)">${alto}</div><div class="rg-kpi-l">Riesgo alto de baja</div></div>
        <div class="rg-kpi"><div class="rg-kpi-n" style="color:var(--warning,#d69540)">${medio}</div><div class="rg-kpi-l">Riesgo medio</div></div>
        <div class="rg-kpi"><div class="rg-kpi-n" style="color:var(--success,#3f9367)">${retencion}%</div><div class="rg-kpi-l">Retención estimada</div></div>
        <div class="rg-kpi"><div class="rg-kpi-n">${alumnos.length}</div><div class="rg-kpi-l">Alumnos activos</div></div>
      </div>
      ${filas.length?filas.map(_rgCard).join(""):`<div class="rg-empty">✓ Ningún alumno activo presenta señales de baja ahora mismo.</div>`}
      <div class="rg-note">Modelo de retención por reglas ponderadas (asistencia &lt;70% = +3, impago del mes = +2, media &lt;5 = +2, incidencia = +1/+2, alumno nuevo con señal = +1). Umbral de baja probable ≥ 3 puntos. Los planes de refuerzo con IA usan Gemini.</div>
    </div>`;
}

function _rgCard(f){
  const señal=k=>f.señales.includes(k);
  return `<div class="rg-card ${f.nivel}">
    <span class="rg-sem ${f.nivel}"></span>
    <div style="flex:1">
      <div class="rg-nom">${_rgEsc(_rgNombre(f.a))} ${señal("nuevo")?`<span class="rg-chip">nuevo</span>`:""}</div>
      <div class="rg-chips">
        ${señal("asistencia")?`<span class="rg-chip bad">Asistencia ${f.pct}%</span>`:""}
        ${señal("impago")?`<span class="rg-chip bad">Impago del mes</span>`:""}
        ${señal("conducta")?`<span class="rg-chip bad">${f.nInc} incidencia(s)</span>`:""}
        ${señal("rendimiento")?`<span class="rg-chip bad">Media ${f.media.toFixed(1)}</span>`:""}
      </div>
      <div class="rg-data">${f.pct!=null?`Asistencia ${f.pct}% · `:""}${f.media!=null?`Nota media ${f.media.toFixed(1)} · `:""}${f.impago?"cuota pendiente · ":""}${f.nInc} incidencia(s) abierta(s)</div>
    </div>
    <div class="rg-acts">
      <button class="rg-btn" onclick="_rgIA('retencion','${escArg(_rgNombre(f.a))}','${escArg(_rgResumen(f))}',this)">✨ Plan de retención</button>
      <button class="rg-btn" onclick="_rgIA('plan','${escArg(_rgNombre(f.a))}','${escArg(_rgResumen(f))}',this)">✨ Plan de refuerzo</button>
    </div>
  </div>`;
}

function _rgResumen(f){
  const p=[];
  if(f.pct!=null) p.push("asistencia "+f.pct+"%");
  if(f.media!=null) p.push("nota media "+f.media.toFixed(1));
  if(f.impago) p.push("cuota del mes pendiente");
  if(f.nInc) p.push(f.nInc+" incidencia(s) abierta(s)");
  if(f.señales.includes("nuevo")) p.push("alumno reciente (<2 meses)");
  return p.join(", ")||"sin datos";
}

async function _rgIA(tipo, nombre, resumen, btn){
  const orig = btn ? btn.textContent : "";
  if(btn){ btn.disabled=true; btn.textContent="Generando…"; }
  const acad = (typeof ctrName!=="undefined" && ctrName) ? ctrName : "la academia";
  const sys = "Eres un orientador pedagógico de "+acad+". Responde en español, concreto y accionable, en un tono cercano para el profesorado. No inventes datos que no te den.";
  const user = tipo==="plan"
    ? `El alumno ${nombre} presenta señales de riesgo (${resumen}). Redacta un PLAN DE REFUERZO breve: 3-4 objetivos, acciones concretas semanales y cómo hacer seguimiento. Máximo 180 palabras.`
    : tipo==="retencion"
    ? `El alumno ${nombre} tiene riesgo de darse de baja en la academia (${resumen}). Como dirección, propón un PLAN DE RETENCIÓN: 3 acciones concretas para recuperar a la familia (contacto, seguimiento, propuesta de valor) y redacta además un mensaje breve y cercano para enviar a la familia proponiendo una reunión. Español. Máximo 180 palabras.`
    : `Para el alumno ${nombre} con estas dificultades (${resumen}), propón RECURSOS y ACTIVIDADES concretas (ejercicios, técnicas de estudio, materiales) para la próxima clase. Lista breve y práctica. Máximo 180 palabras.`;
  try{
    const txt = await iaChat(sys, user);
    iaModal((tipo==="plan"?"Plan de refuerzo · ":tipo==="retencion"?"Plan de retención · ":"Recursos · ")+nombre, txt || "Sin respuesta.");
  }catch(e){
    if(typeof showToastGlobal==="function") showToastGlobal("Error IA: "+e.message,"error");
    else alert("Error IA: "+e.message);
  }finally{
    if(btn){ btn.disabled=false; btn.textContent=orig; }
  }
}

window.initRiesgo=initRiesgo; window._rgIA=_rgIA;
