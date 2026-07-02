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
  const d30=_rgHace(30);
  const [al, asis, inc, cal] = await Promise.all([
    sb.from("alumnos").select("id,nombre,apellidos").eq("centro_id",ctrId).eq("estado","activo"),
    sb.from("asistencia").select("alumno_id,estado").eq("centro_id",ctrId).gte("fecha",d30),
    sb.from("incidencias").select("alumno_id,gravedad,estado").eq("centro_id",ctrId).eq("gravedad","grave").neq("estado","cerrada"),
    sb.from("calificaciones").select("alumno_id,nota").eq("centro_id",ctrId).gte("fecha",d30),
  ]);
  const alumnos=al.data||[];
  const byAsis={}, byCal={}, incSet={};
  (asis.data||[]).forEach(r=>{ const s=byAsis[r.alumno_id]=byAsis[r.alumno_id]||{tot:0,ok:0}; s.tot++; if(r.estado==="presente"||r.estado==="retraso") s.ok++; });
  (cal.data||[]).forEach(r=>{ const s=byCal[r.alumno_id]=byCal[r.alumno_id]||{n:0,sum:0}; s.n++; s.sum+=Number(r.nota||0); });
  const incCount={}; (inc.data||[]).forEach(r=>{ incCount[r.alumno_id]=(incCount[r.alumno_id]||0)+1; });

  const filas=[];
  alumnos.forEach(a=>{
    const señales=[]; const asisS=byAsis[a.id]; const calS=byCal[a.id]; const nInc=incCount[a.id]||0;
    let pct=null, media=null;
    if(asisS && asisS.tot>=4){ pct=Math.round(asisS.ok/asisS.tot*100); if(pct<80) señales.push("asistencia"); }
    if(nInc>0) señales.push("conducta");
    if(calS && calS.n>=1){ media=calS.sum/calS.n; if(media<5) señales.push("rendimiento"); }
    if(señales.length) filas.push({ a, señales, pct, media, nInc, nivel: señales.length>=2?"alto":"medio" });
  });
  filas.sort((x,y)=> y.señales.length-x.señales.length || (x.media??10)-(y.media??10));

  const alto=filas.filter(f=>f.nivel==="alto").length;
  const medio=filas.filter(f=>f.nivel==="medio").length;

  panel.innerHTML=`
    <div class="rg-wrap">
      <h1 class="rg-h">Detección de riesgo</h1>
      <div class="rg-sub">Alertas tempranas cruzando asistencia, conducta y rendimiento (últimos 30 días)</div>
      <div class="rg-kpis">
        <div class="rg-kpi"><div class="rg-kpi-n">${alto}</div><div class="rg-kpi-l">Riesgo alto</div></div>
        <div class="rg-kpi"><div class="rg-kpi-n">${medio}</div><div class="rg-kpi-l">Riesgo medio</div></div>
        <div class="rg-kpi"><div class="rg-kpi-n">${alumnos.length}</div><div class="rg-kpi-l">Alumnos analizados</div></div>
      </div>
      ${filas.length?filas.map(_rgCard).join(""):`<div class="rg-empty">✓ Ningún alumno activo presenta señales de riesgo ahora mismo.</div>`}
      <div class="rg-note">Detección determinista por reglas (asistencia &lt;80%, incidencia grave abierta, media &lt;5). Los planes de refuerzo y la generación de recursos con IA requieren configurar <strong>GEMINI_API_KEY</strong>.</div>
    </div>`;
}

function _rgCard(f){
  const señal=k=>f.señales.includes(k);
  return `<div class="rg-card ${f.nivel}">
    <span class="rg-sem ${f.nivel}"></span>
    <div style="flex:1">
      <div class="rg-nom">${_rgEsc(_rgNombre(f.a))}</div>
      <div class="rg-chips">
        ${señal("asistencia")?`<span class="rg-chip bad">Asistencia ${f.pct}%</span>`:""}
        ${señal("conducta")?`<span class="rg-chip bad">${f.nInc} incidencia(s) grave(s)</span>`:""}
        ${señal("rendimiento")?`<span class="rg-chip bad">Media ${f.media.toFixed(1)}</span>`:""}
      </div>
      <div class="rg-data">${f.pct!=null?`Asistencia ${f.pct}% · `:""}${f.media!=null?`Nota media ${f.media.toFixed(1)} · `:""}${f.nInc} incidencia(s) grave(s) abierta(s)</div>
    </div>
    <div class="rg-acts">
      <button class="rg-btn" onclick="_rgIA()">✨ Plan de refuerzo IA</button>
      <button class="rg-btn" onclick="_rgIA()">✨ Generar recursos</button>
    </div>
  </div>`;
}

function _rgIA(){
  const msg="Función con IA (Gemini): genera un plan de refuerzo / recursos personalizados a partir de los datos del alumno.\n\nRequiere configurar GEMINI_API_KEY y desplegar la Edge Function correspondiente. Queda como hook listo para enchufar.";
  if(typeof showToastGlobal==="function") showToastGlobal("Requiere GEMINI_API_KEY (hook)","info");
  alert(msg);
}

window.initRiesgo=initRiesgo; window._rgIA=_rgIA;
