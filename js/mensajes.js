// ── MENSAJERÍA familia ↔ centro (vista staff) — #2 ──
// Hilos por alumno. La familia escribe desde el Portal familia. Filtra por ctrId.
let _mg2Data = [], _mg2Sel = null;
function _mg2Esc(s){ return escH(s); }
function _mg2Nom(a){ return a?([a.nombre,a.apellidos].filter(Boolean).join(" ")||"(alumno)"):"—"; }

function _mg2Styles(){
  if(document.getElementById("mg2-styles")) return;
  const st=document.createElement("style"); st.id="mg2-styles";
  st.textContent=`
    #panel-mensajes2{padding:0!important}
    .mg2-wrap{display:flex;height:100%;min-height:0}
    .mg2-list{width:300px;border-right:1px solid var(--line,var(--bdr));display:flex;flex-direction:column;background:var(--paper-2,var(--srf2))}
    .mg2-hdr{padding:14px 16px 8px}
    .mg2-h{font-family:var(--font-display,serif);font-size:20px;margin:0}
    .mg2-items{flex:1;overflow-y:auto;padding:6px}
    .mg2-thread{padding:10px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px}
    .mg2-thread:hover{background:var(--srf)}
    .mg2-thread.sel{background:var(--ink-ll,rgba(0,0,0,.05));box-shadow:inset 3px 0 0 var(--ink)}
    .mg2-tn{font-size:13.5px;font-weight:600}
    .mg2-ts{font-size:11.5px;color:var(--muted,var(--txt3));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
    .mg2-unread{margin-left:auto;background:var(--danger,#c24d2f);color:#fff;font-size:10px;border-radius:20px;padding:1px 7px}
    .mg2-conv{flex:1;display:flex;flex-direction:column;min-width:0}
    .mg2-msgs{flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:10px}
    .mg2-b{max-width:75%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap}
    .mg2-fam{align-self:flex-start;background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-bottom-left-radius:3px}
    .mg2-staff{align-self:flex-end;background:var(--ink,#1F2C4F);color:#fff;border-bottom-right-radius:3px}
    .mg2-t{font-size:10.5px;color:var(--muted,var(--txt3));margin-top:2px}
    .mg2-inp{border-top:1px solid var(--line,var(--bdr));padding:12px 18px;display:flex;gap:10px}
    .mg2-ta{flex:1;padding:10px 12px;border:1px solid var(--line,var(--bdr));border-radius:10px;font-size:14px;background:var(--srf);resize:none;font-family:inherit}
    .mg2-send{padding:10px 18px;border:none;border-radius:10px;background:var(--ink,#1F2C4F);color:#fff;font-weight:600;cursor:pointer}
    .mg2-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted,var(--txt3));font-size:14px}
  `;
  document.head.appendChild(st);
}

async function initMensajes2(){
  _mg2Styles();
  const panel=document.getElementById("panel-mensajes2"); if(!panel) return;
  const { data } = await sb.from("mensajes").select("*,alumnos(nombre,apellidos)").eq("centro_id",ctrId).order("created_at",{ascending:true});
  _mg2Data=data||[];
  panel.innerHTML=`<div class="mg2-wrap">
    <div class="mg2-list"><div class="mg2-hdr"><h1 class="mg2-h">Mensajes</h1><div class="mg2-ts">Familias ↔ centro</div></div>
      <div class="mg2-items" id="mg2-items"></div></div>
    <div class="mg2-conv" id="mg2-conv"><div class="mg2-empty">Selecciona una conversación.</div></div>
  </div>`;
  _mg2RenderList();
}

function _mg2Threads(){
  const by={};
  _mg2Data.forEach(m=>{ (by[m.alumno_id]=by[m.alumno_id]||{alumno_id:m.alumno_id,alumnos:m.alumnos,msgs:[]}).msgs.push(m); });
  return Object.values(by).sort((a,b)=> new Date(b.msgs[b.msgs.length-1].created_at)-new Date(a.msgs[a.msgs.length-1].created_at));
}
function _mg2RenderList(){
  const cont=document.getElementById("mg2-items"); if(!cont) return;
  const threads=_mg2Threads();
  if(!threads.length){ cont.innerHTML=`<div class="mg2-ts" style="padding:12px">Aún no hay mensajes de familias.</div>`; return; }
  cont.innerHTML=threads.map(t=>{
    const last=t.msgs[t.msgs.length-1];
    const unread=t.msgs.filter(m=>m.de_familia&&!m.leido).length;
    return `<div class="mg2-thread ${t.alumno_id===_mg2Sel?"sel":""}" onclick="_mg2Open('${escArg(t.alumno_id)}')">
      <div style="min-width:0"><div class="mg2-tn">${_mg2Esc(_mg2Nom(t.alumnos))}</div><div class="mg2-ts">${_mg2Esc((last.texto||"").slice(0,32))}</div></div>
      ${unread?`<span class="mg2-unread">${unread}</span>`:""}</div>`;
  }).join("");
}

async function _mg2Open(alumnoId){
  _mg2Sel=alumnoId; _mg2RenderList();
  const t=_mg2Threads().find(x=>x.alumno_id===alumnoId); if(!t) return;
  const conv=document.getElementById("mg2-conv");
  conv.innerHTML=`
    <div class="mg2-msgs" id="mg2-msgs">${t.msgs.map(_mg2Bubble).join("")}</div>
    <div class="mg2-inp"><textarea class="mg2-ta" id="mg2-txt" rows="1" placeholder="Responder a la familia…"></textarea>
      <button class="mg2-send" onclick="_mg2Enviar('${escArg(alumnoId)}')">Enviar</button></div>`;
  const m=document.getElementById("mg2-msgs"); if(m) m.scrollTop=m.scrollHeight;
  // marcar leídos los de familia
  const unreadIds=t.msgs.filter(x=>x.de_familia&&!x.leido).map(x=>x.id);
  if(unreadIds.length){ await sb.from("mensajes").update({leido:true}).in("id",unreadIds); unreadIds.forEach(id=>{ const mm=_mg2Data.find(y=>y.id===id); if(mm) mm.leido=true; }); _mg2RenderList(); }
}
function _mg2Bubble(m){
  return `<div><div class="mg2-b ${m.de_familia?"mg2-fam":"mg2-staff"}">${_mg2Esc(m.texto)}</div>
    <div class="mg2-t" style="text-align:${m.de_familia?"left":"right"}">${_mg2Esc(new Date(m.created_at).toLocaleString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}))}</div></div>`;
}
async function _mg2Enviar(alumnoId){
  const ta=document.getElementById("mg2-txt"); const txt=(ta?.value||"").trim(); if(!txt) return;
  const uid=(typeof currentUser!=="undefined"&&currentUser)?currentUser.id:null;
  const { data, error } = await sb.from("mensajes").insert({ centro_id:ctrId, alumno_id:alumnoId, remitente_id:uid, de_familia:false, texto:txt }).select("*,alumnos(nombre,apellidos)").single();
  if(error){ if(typeof showToastGlobal==="function") showToastGlobal("Error: "+error.message,"error"); return; }
  _mg2Data.push(data); ta.value=""; _mg2Open(alumnoId);
}

window.initMensajes2=initMensajes2; window._mg2Open=_mg2Open; window._mg2Enviar=_mg2Enviar;
