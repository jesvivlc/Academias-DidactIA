// ── COBROS (Fase 4) ──
// Pagos, impagos, KPIs, factura PDF (jsPDF) y bloque económico. Filtra por ctrId; RLS.

let _cbPagos = [], _cbMatriculas = [], _cbAlumnos = [], _cbNuevo = false;
function _cbEsc(s){ return escH(s); }
function _cbHoy(){ return new Date().toISOString().slice(0,10); }
function _cbPeriodo(){ return new Date().toISOString().slice(0,7); } // YYYY-MM
function _cbNombre(a){ return a?([a.nombre,a.apellidos].filter(Boolean).join(" ")||"(alumno)"):"—"; }
function _cbEur(n){ return (Number(n)||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"; }

function _cbEnsureStyles(){
  if (document.getElementById("cb-styles")) return;
  const st=document.createElement("style"); st.id="cb-styles";
  st.textContent=`
    #panel-cobros{padding:0!important;overflow-y:auto}
    .cb-wrap{padding:22px 26px;max-width:960px}
    .cb-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .cb-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .cb-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .cb-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:130px}
    .cb-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .cb-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .cb-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px;display:flex;justify-content:space-between;align-items:center}
    .cb-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px;background:var(--paper-2,var(--srf2));margin-bottom:14px}
    .cb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .cb-in,.cb-sel{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit}
    .cb-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .cb-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600}
    .cb-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .cb-btn-sm{padding:4px 10px;font-size:12px}
    .cb-tbl{width:100%;border-collapse:collapse;font-size:13px}
    .cb-tbl th,.cb-tbl td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line,var(--bdr))}
    .cb-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,var(--txt3))}
    .cb-imp{background:var(--danger-soft,#fae6e0);border:1px solid var(--danger,#c24d2f);border-radius:10px;padding:12px 14px;margin-top:6px}
    .cb-imp h4{margin:0 0 8px;font-size:13px;color:var(--danger,#c0392b)}
    .cb-imp-row{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0}
    .cb-eco{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .cb-eco-box{border:1px solid var(--line,var(--bdr));border-radius:10px;padding:12px 14px;background:var(--srf)}
    .cb-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
    @media(max-width:700px){.cb-grid,.cb-eco{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

async function initCobros(){
  _cbEnsureStyles();
  const panel=document.getElementById("panel-cobros"); if(!panel) return;
  panel.innerHTML=`<div class="cb-wrap"><div class="cb-sub">Cargando…</div></div>`;
  const [p,m,a]=await Promise.all([
    sb.from("pagos").select("*,alumnos(nombre,apellidos)").eq("centro_id",ctrId).order("fecha",{ascending:false}).limit(200),
    sb.from("matriculas").select("id,alumno_id,cuota_mensual,estado,fecha_baja,alumnos(nombre,apellidos,estado,fecha_baja)").eq("centro_id",ctrId),
    sb.from("alumnos").select("id,nombre,apellidos,estado,fecha_baja").eq("centro_id",ctrId).order("nombre"),
  ]);
  _cbPagos=p.data||[]; _cbMatriculas=m.data||[]; _cbAlumnos=a.data||[];
  _cbRender();
}

function _cbRender(){
  const panel=document.getElementById("panel-cobros");
  const per=_cbPeriodo(), mesIni=per+"-01";
  const pagadosMes=_cbPagos.filter(x=>x.estado==="pagado"&&(x.periodo===per||String(x.fecha).slice(0,7)===per));
  const ingresosMes=pagadosMes.reduce((s,x)=>s+Number(x.importe||0),0);

  // Impagos: matrículas activas con cuota>0 sin pago 'pagado' del periodo actual
  const pagadoSet=new Set(pagadosMes.map(x=>x.alumno_id));
  const impagos=_cbMatriculas.filter(m=>m.estado==="activa" && Number(m.cuota_mensual||0)>0 && (m.alumnos?.estado||"activo")!=="baja" && !pagadoSet.has(m.alumno_id));

  // Economía
  const previsionMes=_cbMatriculas.filter(m=>m.estado==="activa").reduce((s,m)=>s+Number(m.cuota_mensual||0),0);
  const bajasMes=_cbAlumnos.filter(a=>a.estado==="baja" && String(a.fecha_baja||"").slice(0,7)===per).length;
  const porMetodo={};
  pagadosMes.forEach(x=>{ porMetodo[x.metodo]=(porMetodo[x.metodo]||0)+Number(x.importe||0); });

  const alumnosActivos=_cbAlumnos.filter(a=>a.estado==="activo");
  const kpis=[
    { n:_cbEur(ingresosMes), l:"Ingresos del mes" },
    { n:pagadosMes.length, l:"Pagos este mes" },
    { n:impagos.length, l:"Impagos del mes" },
    { n:_cbEur(previsionMes), l:"Previsión mensual" },
  ];

  panel.innerHTML=`
    <div class="cb-wrap">
      <h1 class="cb-h">Cobros</h1>
      <div class="cb-sub">Pagos, impagos y economía · periodo ${_cbEsc(per)}</div>
      <div class="cb-kpis">${kpis.map(k=>`<div class="cb-kpi"><div class="cb-kpi-n">${k.n}</div><div class="cb-kpi-l">${k.l}</div></div>`).join("")}</div>

      <div class="cb-sec">Registrar pago <span style="display:flex;gap:8px"><button class="cb-btn" onclick="_cbGenerarRecibos(this)">🧾 Generar recibos del mes</button><button class="cb-btn cb-btn-p" onclick="_cbToggle()">${_cbNuevo?"Cancelar":"+ Nuevo pago"}</button></span></div>
      ${_cbNuevo?`<div class="cb-form">
        <div class="cb-grid">
          <div><label class="cb-lbl">Alumno</label><select class="cb-sel" id="cb-alumno">${alumnosActivos.map(a=>`<option value="${a.id}">${_cbEsc(_cbNombre(a))}</option>`).join("")||`<option value="">(sin alumnos activos)</option>`}</select></div>
          <div><label class="cb-lbl">Concepto</label><input class="cb-in" id="cb-concepto" value="Cuota ${_cbEsc(per)}"></div>
          <div><label class="cb-lbl">Importe (€)</label><input class="cb-in" id="cb-importe" type="number" step="0.01" placeholder="0.00"></div>
          <div><label class="cb-lbl">Método</label><select class="cb-sel" id="cb-metodo"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="domiciliacion">Domiciliación</option></select></div>
          <div><label class="cb-lbl">Fecha</label><input class="cb-in" id="cb-fecha" type="date" value="${_cbHoy()}"></div>
          <div><label class="cb-lbl">Periodo</label><input class="cb-in" id="cb-periodo" value="${_cbEsc(per)}"></div>
        </div>
        <div style="display:flex;gap:10px;align-items:center"><button class="cb-btn cb-btn-p" onclick="_cbCrear()">Guardar pago</button><span class="cb-sub" id="cb-msg"></span></div>
      </div>`:""}

      <div class="cb-sec">Impagos del mes</div>
      ${impagos.length?`<div class="cb-imp"><h4>${impagos.length} alumno(s) sin pago registrado en ${_cbEsc(per)}</h4>
        ${impagos.map(m=>`<div class="cb-imp-row"><span>${_cbEsc(_cbNombre(m.alumnos))}</span><span class="cb-sub">cuota ${_cbEur(m.cuota_mensual)}</span>
          <button class="cb-btn cb-btn-sm" style="margin-left:auto" onclick="_cbCobrar('${escArg(m.alumno_id)}','${escArg(m.id)}',${Number(m.cuota_mensual||0)})">Registrar cobro</button></div>`).join("")}
      </div>`:`<div class="cb-empty">✓ Todas las matrículas activas con cuota están al día este mes.</div>`}

      <div class="cb-sec">Economía del mes</div>
      <div class="cb-eco">
        <div class="cb-eco-box"><div class="cb-kpi-l">Ingresos cobrados</div><div class="cb-kpi-n" style="font-size:22px">${_cbEur(ingresosMes)}</div></div>
        <div class="cb-eco-box"><div class="cb-kpi-l">Previsión (cuotas activas)</div><div class="cb-kpi-n" style="font-size:22px">${_cbEur(previsionMes)}</div></div>
        <div class="cb-eco-box"><div class="cb-kpi-l">Bajas del mes</div><div class="cb-kpi-n" style="font-size:22px">${bajasMes}</div></div>
        <div class="cb-eco-box"><div class="cb-kpi-l">Por método</div>${Object.keys(porMetodo).length?Object.entries(porMetodo).map(([k,v])=>`<div style="font-size:13px;display:flex;justify-content:space-between"><span>${_cbEsc(k)}</span><strong>${_cbEur(v)}</strong></div>`).join(""):`<div class="cb-empty">Sin cobros aún.</div>`}</div>
      </div>

      <div class="cb-sec">Pagos y recibos</div>
      ${_cbPagos.length?`<table class="cb-tbl"><thead><tr><th>Fecha</th><th>Alumno</th><th>Concepto</th><th>Método</th><th>Importe</th><th>Estado</th><th></th></tr></thead><tbody>
        ${_cbPagos.slice(0,60).map(x=>`<tr><td>${_cbEsc(x.fecha)}</td><td>${_cbEsc(_cbNombre(x.alumnos))}</td><td>${_cbEsc(x.concepto||"—")}</td><td>${_cbEsc(x.metodo)}</td><td>${_cbEur(x.importe)}</td>
          <td><span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${x.estado==="pagado"?"var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)":"var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)"}">${_cbEsc(x.estado)}</span></td>
          <td>${x.estado==="pendiente"?`<button class="cb-btn cb-btn-sm" onclick="_cbMarcarPagado('${escArg(x.id)}')">Marcar pagado</button> `:""}<button class="cb-btn cb-btn-sm" onclick="_cbFactura('${escArg(x.id)}')">Factura PDF</button></td></tr>`).join("")}
      </tbody></table>`:`<div class="cb-empty">Sin pagos registrados.</div>`}
    </div>`;
}

function _cbToggle(){ _cbNuevo=!_cbNuevo; _cbRender(); }
function _cbCobrar(alumnoId, matriculaId, importe){
  _cbNuevo=true; _cbRender();
  setTimeout(()=>{ const s=document.getElementById("cb-alumno"); if(s) s.value=alumnoId; const i=document.getElementById("cb-importe"); if(i) i.value=importe||""; },30);
}

async function _cbCrear(){
  const msg=document.getElementById("cb-msg");
  const alumnoId=document.getElementById("cb-alumno")?.value;
  const importe=document.getElementById("cb-importe")?.value;
  if(!alumnoId){ if(msg){msg.textContent="Selecciona un alumno.";msg.style.color="var(--danger)";} return; }
  if(importe===""||importe==null){ if(msg){msg.textContent="Pon el importe.";msg.style.color="var(--danger)";} return; }
  const uid=(typeof currentUser!=="undefined"&&currentUser)?currentUser.id:null;
  const { error } = await sb.from("pagos").insert({
    centro_id:ctrId, alumno_id:alumnoId, concepto:(document.getElementById("cb-concepto")?.value||"").trim()||null,
    importe:Number(importe), metodo:document.getElementById("cb-metodo")?.value||"transferencia",
    fecha:document.getElementById("cb-fecha")?.value||_cbHoy(), periodo:(document.getElementById("cb-periodo")?.value||"").trim()||_cbPeriodo(),
    estado:"pagado", created_by:uid,
  });
  if(error){ if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  if(typeof showToastGlobal==="function") showToastGlobal("Pago registrado","success");
  _cbNuevo=false; await initCobros();
}

function _cbFactura(id){
  const p=_cbPagos.find(x=>x.id===id); if(!p) return;
  if(!window.jspdf||!window.jspdf.jsPDF){ if(typeof showToastGlobal==="function") showToastGlobal("No se pudo cargar el generador PDF","error"); return; }
  const doc=new window.jspdf.jsPDF();
  const num="F-"+String(p.periodo||_cbPeriodo())+"-"+String(p.id).slice(0,6).toUpperCase();
  const nombre=_cbNombre(p.alumnos);
  doc.setFontSize(18); doc.text(String(ctrName||"Academia"),20,22);
  doc.setFontSize(11); doc.setTextColor(120); doc.text("Factura / recibo",20,30);
  doc.setTextColor(0); doc.setFontSize(11);
  doc.text("Nº factura: "+num,20,45);
  doc.text("Fecha: "+String(p.fecha),20,52);
  doc.text("Alumno/a: "+nombre,20,59);
  doc.text("Método de pago: "+String(p.metodo),20,66);
  doc.setDrawColor(200); doc.line(20,74,190,74);
  doc.setFontSize(12);
  doc.text("Concepto",20,84); doc.text("Importe",160,84);
  doc.setFontSize(11);
  doc.text(String(p.concepto||"Cuota"),20,94);
  doc.text(_cbEur(p.importe),160,94);
  doc.line(20,102,190,102);
  doc.setFontSize(13); doc.text("TOTAL:",130,112); doc.text(_cbEur(p.importe),160,112);
  doc.setFontSize(9); doc.setTextColor(140);
  doc.text("Documento generado por DidactIA Academias.",20,285);
  doc.save("factura-"+num+".pdf");
}

async function _cbGenerarRecibos(btn){
  const per=_cbPeriodo(); const uid=(typeof currentUser!=="undefined"&&currentUser)?currentUser.id:null;
  // alumnos que YA tienen un pago de este periodo (cualquier estado)
  const conPago=new Set(_cbPagos.filter(p=>p.periodo===per||String(p.fecha).slice(0,7)===per).map(p=>p.alumno_id));
  const nuevos=_cbMatriculas.filter(m=>m.estado==="activa" && Number(m.cuota_mensual||0)>0 && (m.alumnos?.estado||"activo")!=="baja" && !conPago.has(m.alumno_id))
    .map(m=>({ centro_id:ctrId, alumno_id:m.alumno_id, matricula_id:m.id, concepto:"Cuota "+per, importe:Number(m.cuota_mensual), estado:"pendiente", periodo:per, fecha:_cbHoy(), created_by:uid }));
  if(!nuevos.length){ if(typeof showToastGlobal==="function") showToastGlobal("No hay recibos que generar (todos tienen recibo del mes o sin cuota)","info"); return; }
  if(!confirm("¿Generar "+nuevos.length+" recibo(s) pendiente(s) de la cuota de "+per+"?")) return;
  if(btn){ btn.disabled=true; btn.textContent="Generando…"; }
  const { error } = await sb.from("pagos").insert(nuevos);
  if(error){ if(typeof showToastGlobal==="function") showToastGlobal("Error: "+error.message,"error"); if(btn){btn.disabled=false;} return; }
  if(typeof showToastGlobal==="function") showToastGlobal(nuevos.length+" recibo(s) generados","success");
  await initCobros();
}
async function _cbMarcarPagado(id){
  const { error } = await sb.from("pagos").update({ estado:"pagado", fecha:_cbHoy() }).eq("id",id).eq("centro_id",ctrId);
  if(error){ if(typeof showToastGlobal==="function") showToastGlobal("Error: "+error.message,"error"); return; }
  if(typeof showToastGlobal==="function") showToastGlobal("Marcado como pagado","success");
  await initCobros();
}

window.initCobros=initCobros; window._cbToggle=_cbToggle; window._cbCrear=_cbCrear;
window._cbCobrar=_cbCobrar; window._cbFactura=_cbFactura; window._cbGenerarRecibos=_cbGenerarRecibos; window._cbMarcarPagado=_cbMarcarPagado;
