// ── COMUNICACIONES (Fase 3 · inc.2) ──
// Cola de comunicaciones a familias. SIN envío real: quedan en estado 'pendiente'
// hasta configurar Resend (email) / VAPID (push) / WhatsApp Business API.
// Filtra por ctrId; RLS por centro.

let _cmuGrupos = [], _cmuAlumnos = [], _cmuData = [];
function _cmuEsc(s){ return escH(s); }
function _cmuNombre(a){ return [a.nombre,a.apellidos].filter(Boolean).join(" ") || "(alumno)"; }

function _cmuEnsureStyles(){
  if (document.getElementById("cmu-styles")) return;
  const st=document.createElement("style"); st.id="cmu-styles";
  st.textContent=`
    #panel-comunicaciones{padding:0!important;overflow-y:auto}
    .cmu-wrap{padding:22px 26px;max-width:860px}
    .cmu-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .cmu-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .cmu-note{background:var(--warning-soft,#fbf0dc);border:1px solid var(--warning,#d69540);color:var(--warning-ink,#8a5a00);border-radius:10px;padding:10px 13px;font-size:12.5px;margin:14px 0}
    .cmu-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:16px;background:var(--paper-2,var(--srf2));margin-bottom:18px}
    .cmu-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .cmu-in,.cmu-sel,.cmu-ta{padding:9px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit}
    .cmu-ta{min-height:80px;resize:vertical}
    .cmu-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .cmu-btn{padding:9px 16px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600}
    .cmu-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .cmu-card{border:1px solid var(--line,var(--bdr));border-radius:9px;padding:11px 14px;margin-bottom:8px;background:var(--srf)}
    .cmu-card-top{display:flex;align-items:center;gap:8px}
    .cmu-tit{font-weight:600;font-size:13.5px}
    .cmu-badge{font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--surface-sunk,#eee);color:var(--muted,var(--txt3))}
    .cmu-est{margin-left:auto;font-size:10.5px;padding:2px 8px;border-radius:20px}
    .cmu-e-pendiente{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .cmu-e-enviada{background:var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)}
    .cmu-body{font-size:12.5px;color:var(--txt);margin-top:5px}
    .cmu-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
  `;
  document.head.appendChild(st);
}

async function initComunicaciones(){
  _cmuEnsureStyles();
  const panel=document.getElementById("panel-comunicaciones"); if(!panel) return;
  panel.innerHTML=`<div class="cmu-wrap"><div class="cmu-sub">Cargando…</div></div>`;
  const [g,a,c]=await Promise.all([
    sb.from("grupos").select("id,nombre").eq("centro_id",ctrId).eq("activo",true).order("nombre"),
    sb.from("alumnos").select("id,nombre,apellidos").eq("centro_id",ctrId).eq("estado","activo").order("nombre"),
    sb.from("comunicaciones").select("*").eq("centro_id",ctrId).order("created_at",{ascending:false}).limit(50),
  ]);
  _cmuGrupos=g.data||[]; _cmuAlumnos=a.data||[]; _cmuData=c.data||[];
  _cmuRender();
}

function _cmuRender(){
  const panel=document.getElementById("panel-comunicaciones");
  panel.innerHTML=`
    <div class="cmu-wrap">
      <h1 class="cmu-h">Comunicaciones</h1>
      <div class="cmu-sub">Avisos a familias: horarios, pagos, vacaciones, cambios…</div>
      <div class="cmu-note">📧 Las comunicaciones por <strong>email</strong> se envían a las familias destinatarias vía Resend. <em>Nota: hasta verificar un dominio en Resend, la entrega real solo llega al email de la cuenta.</em> Push/WhatsApp aún pendientes.</div>
      <div class="cmu-form">
        <div class="cmu-grid">
          <div><label class="cmu-lbl">Destinatario</label>
            <select class="cmu-sel" id="cmu-dest" onchange="_cmuDestChange()">
              <option value="todos">Todas las familias</option>
              <option value="grupo">Un grupo</option>
              <option value="alumno">Una familia (alumno)</option>
            </select></div>
          <div id="cmu-ref-wrap" style="display:none"><label class="cmu-lbl">¿Cuál?</label>
            <select class="cmu-sel" id="cmu-ref"></select></div>
          <div><label class="cmu-lbl">Canal</label>
            <select class="cmu-sel" id="cmu-canal"><option value="email">Email</option><option value="push">Push</option><option value="whatsapp">WhatsApp</option></select></div>
        </div>
        <label class="cmu-lbl">Título</label><input class="cmu-in" id="cmu-tit" placeholder="Ej: Cambio de horario del martes" style="margin-bottom:10px">
        <label class="cmu-lbl">Mensaje</label><textarea class="cmu-ta" id="cmu-cuerpo" placeholder="Escribe el comunicado…"></textarea>
        <div style="margin-top:10px;display:flex;gap:10px;align-items:center">
          <button class="cmu-btn cmu-btn-p" onclick="_cmuCrear()">Guardar en cola</button>
          <span class="cmu-sub" id="cmu-msg"></span>
        </div>
      </div>
      <div class="cmu-sub" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Historial</div>
      <div id="cmu-list">${_cmuData.length?_cmuData.map(_cmuCard).join(""):`<div class="cmu-empty">Aún no hay comunicaciones.</div>`}</div>
    </div>`;
}

function _cmuDestChange(){
  const dest=document.getElementById("cmu-dest").value;
  const wrap=document.getElementById("cmu-ref-wrap");
  const ref=document.getElementById("cmu-ref");
  if(dest==="todos"){ wrap.style.display="none"; return; }
  wrap.style.display="block";
  const opts = dest==="grupo"
    ? _cmuGrupos.map(g=>`<option value="${g.id}">${_cmuEsc(g.nombre)}</option>`)
    : _cmuAlumnos.map(a=>`<option value="${a.id}">${_cmuEsc(_cmuNombre(a))}</option>`);
  ref.innerHTML = opts.join("") || `<option value="">(sin opciones)</option>`;
}

function _cmuDestLabel(c){
  if(c.destinatario==="todos") return "Todas las familias";
  if(c.destinatario==="grupo"){ const g=_cmuGrupos.find(x=>x.id===c.destinatario_ref); return "Grupo: "+(g?g.nombre:"—"); }
  const a=_cmuAlumnos.find(x=>x.id===c.destinatario_ref); return "Alumno: "+(a?_cmuNombre(a):"—");
}
function _cmuCard(c){
  return `<div class="cmu-card">
    <div class="cmu-card-top">
      <span class="cmu-tit">${_cmuEsc(c.titulo)}</span>
      <span class="cmu-badge">${_cmuEsc(c.canal)}</span>
      <span class="cmu-badge">${_cmuEsc(_cmuDestLabel(c))}</span>
      <span class="cmu-est cmu-e-${c.estado}">${_cmuEsc(c.estado)}</span>
    </div>
    ${c.cuerpo?`<div class="cmu-body">${_cmuEsc(c.cuerpo)}</div>`:""}
    ${c.estado==="pendiente"&&c.canal==="email"?`<div style="margin-top:8px"><button class="cmu-btn cmu-btn-p" style="padding:5px 12px;font-size:12px" onclick="_cmuEnviar('${escArg(c.id)}',this)">📧 Enviar ahora</button></div>`:""}
  </div>`;
}

async function _cmuEnviar(id, btn){
  if(btn){ btn.disabled=true; btn.textContent="Enviando…"; }
  try{
    const { data, error } = await sb.functions.invoke("send-comunicacion", { body:{ comunicacion_id:id } });
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    if(typeof showToastGlobal==="function") showToastGlobal("Enviada a "+(data?.sent??0)+" familia(s)","success");
  }catch(e){
    if(typeof showToastGlobal==="function") showToastGlobal("Error al enviar: "+(e.message||e),"error");
  }
  await initComunicaciones();
}

async function _cmuCrear(){
  const msg=document.getElementById("cmu-msg");
  const titulo=(document.getElementById("cmu-tit")?.value||"").trim();
  const dest=document.getElementById("cmu-dest")?.value||"todos";
  const ref=dest==="todos"?null:(document.getElementById("cmu-ref")?.value||null);
  if(!titulo){ if(msg){msg.textContent="Pon un título.";msg.style.color="var(--danger)";} return; }
  if(dest!=="todos"&&!ref){ if(msg){msg.textContent="Elige el destinatario.";msg.style.color="var(--danger)";} return; }
  const uid=(typeof currentUser!=="undefined"&&currentUser)?currentUser.id:null;
  const { data:ins, error } = await sb.from("comunicaciones").insert({
    centro_id:ctrId, titulo, cuerpo:(document.getElementById("cmu-cuerpo")?.value||"").trim()||null,
    destinatario:dest, destinatario_ref:ref, canal:document.getElementById("cmu-canal")?.value||"email",
    estado:"pendiente", created_by:uid,
  }).select("id").single();
  if(error){ if(msg){msg.textContent="Error: "+error.message;msg.style.color="var(--danger)";} return; }
  // Enviar por email inmediatamente (canal email)
  let enviada=false, sent=0;
  if((document.getElementById("cmu-canal")?.value||"email")==="email" && ins?.id){
    try{
      const { data:sd, error:se } = await sb.functions.invoke("send-comunicacion", { body:{ comunicacion_id:ins.id } });
      if(!se && !sd?.error){ enviada=true; sent=sd?.sent??0; }
    }catch(_){}
  }
  if(typeof showToastGlobal==="function") showToastGlobal(enviada?("Comunicación enviada a "+sent+" familia(s)"):"Comunicación guardada (pendiente de envío)","success");
  await initComunicaciones();
}

window.initComunicaciones=initComunicaciones; window._cmuDestChange=_cmuDestChange; window._cmuCrear=_cmuCrear; window._cmuEnviar=_cmuEnviar;
