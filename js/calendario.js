// ── CALENDARIO + RECORDATORIOS + RESUMEN SEMANAL (Fase 2 · inc.5) ──
// Eventos del centro (reuniones, pagos, vacaciones…) + un resumen determinista
// de la semana que junta eventos, exámenes y tareas próximas. Filtra por ctrId.

let _cevEventos = [], _cevNuevo = false, _cevGrupos = {};
const _CEV_TIPOS = ["reunion","pago","vacaciones","inicio_trimestre","renovacion","recordatorio","otro"];
const _CEV_ICON = { reunion:"👥", pago:"💶", vacaciones:"🏖️", inicio_trimestre:"📚", renovacion:"🔁", recordatorio:"⏰", otro:"📌", examen:"📝", tarea:"✏️" };
const _CEV_DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const _CEV_MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function _cevEsc(s){ return escH(s); }
function _cevHoy(){ return new Date().toISOString().slice(0,10); }
function _cevMasDias(n){ return new Date(Date.now()+n*864e5).toISOString().slice(0,10); }
function _cevFechaLarga(iso){ const d=new Date(iso+"T00:00:00"); return `${_CEV_DIAS[d.getDay()]} ${d.getDate()} ${_CEV_MESES[d.getMonth()]}`; }

function _cevEnsureStyles(){
  if (document.getElementById("cev-styles")) return;
  const st=document.createElement("style"); st.id="cev-styles";
  st.textContent=`
    #panel-calendario{padding:0!important;overflow-y:auto}
    .cev-wrap{padding:22px 26px;max-width:900px}
    .cev-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .cev-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .cev-week{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px 16px;margin:16px 0;background:var(--paper-2,var(--srf2))}
    .cev-week h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink)}
    .cev-day{margin-top:10px}
    .cev-day-t{font-size:12px;font-weight:700;color:var(--muted,var(--txt3));text-transform:capitalize;border-bottom:1px solid var(--line,var(--bdr));padding-bottom:3px;margin-bottom:5px}
    .cev-line{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 0}
    .cev-line .t{font-weight:600;min-width:52px;font-size:12px;color:var(--muted,var(--txt3))}
    .cev-tag{font-size:10.5px;padding:1px 7px;border-radius:20px;background:var(--surface-sunk,#eee);color:var(--muted,var(--txt3));margin-left:auto}
    .cev-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:18px 0 8px;display:flex;justify-content:space-between;align-items:center}
    .cev-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600}
    .cev-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .cev-btn-sm{padding:4px 9px;font-size:12px}
    .cev-card{display:flex;align-items:center;gap:10px;border:1px solid var(--line,var(--bdr));border-radius:9px;padding:10px 13px;margin-bottom:7px;background:var(--srf)}
    .cev-ico{font-size:18px}
    .cev-tit{font-weight:600;font-size:13.5px}
    .cev-meta{font-size:11.5px;color:var(--muted,var(--txt3))}
    .cev-form{border:1px solid var(--line,var(--bdr));border-radius:10px;padding:14px;margin-bottom:14px;background:var(--paper-2,var(--srf2))}
    .cev-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
    .cev-in,.cev-sel,.cev-ta{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit}
    .cev-ta{min-height:48px;resize:vertical}
    .cev-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .cev-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
    @media(max-width:700px){.cev-grid{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(st);
}

async function initCalendario(){
  _cevEnsureStyles();
  const panel=document.getElementById("panel-calendario"); if(!panel) return;
  panel.innerHTML=`<div class="cev-wrap"><div class="cev-sub">Cargando…</div></div>`;
  const hoy=_cevHoy(), en7=_cevMasDias(7);
  const [ev, tar, gr] = await Promise.all([
    sb.from("eventos").select("*").eq("centro_id",ctrId).gte("fecha",hoy).order("fecha").order("hora",{nullsFirst:true}),
    sb.from("tareas").select("titulo,tipo,fecha_entrega,grupo_id").eq("centro_id",ctrId).gte("fecha_entrega",hoy).lte("fecha_entrega",en7),
    sb.from("grupos").select("id,nombre").eq("centro_id",ctrId),
  ]);
  _cevEventos=ev.data||[];
  _cevGrupos=Object.fromEntries((gr.data||[]).map(g=>[g.id,g.nombre]));
  _cevRender(tar.data||[]);
}

function _cevRender(tareas){
  const panel=document.getElementById("panel-calendario");
  const en7=_cevMasDias(7);
  // Resumen semana: eventos ≤7d + tareas (examen/otras) ≤7d, agrupado por día
  const items=[];
  _cevEventos.filter(e=>e.fecha<=en7).forEach(e=>items.push({ fecha:e.fecha, hora:e.hora, titulo:e.titulo, tipo:e.tipo, tag:e.tipo }));
  (tareas||[]).forEach(t=>items.push({ fecha:t.fecha_entrega, hora:null, titulo:t.titulo, tipo:t.tipo==="examen"?"examen":"tarea", tag:(_cevGrupos[t.grupo_id]||"") }));
  items.sort((a,b)=> a.fecha.localeCompare(b.fecha) || String(a.hora||"").localeCompare(String(b.hora||"")));
  const porDia={}; items.forEach(i=>{ (porDia[i.fecha]=porDia[i.fecha]||[]).push(i); });
  const dias=Object.keys(porDia).sort();
  const week = dias.length ? dias.map(d=>`
    <div class="cev-day"><div class="cev-day-t">${_cevEsc(_cevFechaLarga(d))}</div>
      ${porDia[d].map(i=>`<div class="cev-line"><span class="cev-ico" style="font-size:14px">${_CEV_ICON[i.tipo]||"📌"}</span>
        <span class="t">${i.hora?_cevEsc(String(i.hora).slice(0,5)):"—"}</span><span>${_cevEsc(i.titulo)}</span>
        ${i.tag?`<span class="cev-tag">${_cevEsc(i.tag)}</span>`:""}</div>`).join("")}
    </div>`).join("") : `<div class="cev-empty">Nada en los próximos 7 días.</div>`;

  const futuros=_cevEventos.map(e=>`
    <div class="cev-card">
      <span class="cev-ico">${_CEV_ICON[e.tipo]||"📌"}</span>
      <div style="flex:1"><div class="cev-tit">${_cevEsc(e.titulo)}</div>${e.descripcion?`<div class="cev-meta">${_cevEsc(e.descripcion)}</div>`:""}</div>
      <div class="cev-meta" style="text-align:right">${_cevEsc(_cevFechaLarga(e.fecha))}${e.hora?" · "+_cevEsc(String(e.hora).slice(0,5)):""}<br><span class="cev-tag">${_cevEsc(e.tipo.replace("_"," "))}</span></div>
      <button class="cev-btn cev-btn-sm" onclick="_cevBorrar('${escArg(e.id)}')">✕</button>
    </div>`).join("");

  panel.innerHTML=`
    <div class="cev-wrap">
      <h1 class="cev-h">Calendario</h1>
      <div class="cev-sub">Eventos, recordatorios y resumen de la semana</div>
      <div class="cev-week"><h3>🗓️ Resumen de la semana</h3>${week}</div>
      <div class="cev-sec">Próximos eventos
        <button class="cev-btn cev-btn-p" onclick="_cevToggle()">${_cevNuevo?"Cancelar":"+ Nuevo evento"}</button></div>
      ${_cevNuevo?_cevForm():""}
      ${_cevEventos.length?futuros:`<div class="cev-empty">No hay eventos futuros. Crea reuniones, fechas de pago, vacaciones…</div>`}
    </div>`;
}

function _cevForm(){
  return `<div class="cev-form">
    <div class="cev-grid">
      <div style="grid-column:1/3"><label class="cev-lbl">Título</label><input class="cev-in" id="cev-tit" placeholder="Ej: Reunión de padres"></div>
      <div><label class="cev-lbl">Fecha</label><input class="cev-in" id="cev-fecha" type="date" value="${_cevHoy()}"></div>
      <div><label class="cev-lbl">Hora (opc.)</label><input class="cev-in" id="cev-hora" type="time"></div>
      <div><label class="cev-lbl">Tipo</label><select class="cev-sel" id="cev-tipo">${_CEV_TIPOS.map(t=>`<option value="${t}">${t.replace("_"," ")}</option>`).join("")}</select></div>
      <div style="grid-column:2/5"><label class="cev-lbl">Descripción</label><input class="cev-in" id="cev-desc" placeholder="Detalles (opcional)"></div>
    </div>
    <div style="display:flex;gap:10px;align-items:center"><button class="cev-btn cev-btn-p" onclick="_cevCrear()">Guardar</button><span class="cev-sub" id="cev-msg"></span></div>
  </div>`;
}
function _cevToggle(){ _cevNuevo=!_cevNuevo; initCalendario(); }

async function _cevCrear(){
  const msg=document.getElementById("cev-msg");
  const titulo=(document.getElementById("cev-tit")?.value||"").trim();
  const fecha=document.getElementById("cev-fecha")?.value;
  if(!titulo||!fecha){ if(msg){msg.textContent="Título y fecha son obligatorios.";msg.style.color="var(--danger)";} return; }
  const { error } = await sb.from("eventos").insert({
    centro_id:ctrId, titulo, fecha, hora:document.getElementById("cev-hora")?.value||null,
    tipo:document.getElementById("cev-tipo")?.value||"otro", descripcion:(document.getElementById("cev-desc")?.value||"").trim()||null,
  });
  if(error){ if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  if(typeof showToastGlobal==="function") showToastGlobal("Evento guardado","success");
  _cevNuevo=false; initCalendario();
}
async function _cevBorrar(id){
  await sb.from("eventos").delete().eq("id",id).eq("centro_id",ctrId);
  _cevEventos=_cevEventos.filter(e=>e.id!==id); initCalendario();
}

window.initCalendario=initCalendario; window._cevToggle=_cevToggle; window._cevCrear=_cevCrear; window._cevBorrar=_cevBorrar;
