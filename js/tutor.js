// ── TUTOR IA (para el alumno / familia) ──
// Mini-chat pedagógico multivuelta sobre Gemini (EF chat). Resuelve dudas, explica
// conceptos de varias formas, genera ejercicios, prepara exámenes, técnicas de estudio.

let _tuHist = [];      // [{role:'user'|'model', text}]
let _tuBusy = false;
function _tuEsc(s){ return escH(s); }

function _tuEnsureStyles(){
  if (document.getElementById("tu-styles")) return;
  const st=document.createElement("style"); st.id="tu-styles";
  st.textContent=`
    #panel-tutor{padding:0!important;display:flex;flex-direction:column;height:100%}
    .tu-hdr{padding:16px 22px 10px;border-bottom:1px solid var(--line,var(--bdr))}
    .tu-h{font-family:var(--font-display,serif);font-size:22px;margin:0}
    .tu-sub{font-size:12px;color:var(--muted,var(--txt3))}
    .tu-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
    .tu-chip{font-size:12px;padding:5px 11px;border-radius:20px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;color:var(--txt2,#444)}
    .tu-chip:hover{border-color:var(--ink);color:var(--ink)}
    .tu-msgs{flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:12px}
    .tu-msg{max-width:80%;padding:10px 13px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap}
    .tu-user{align-self:flex-end;background:var(--ink,#1F2C4F);color:#fff;border-bottom-right-radius:3px}
    .tu-bot{align-self:flex-start;background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-bottom-left-radius:3px}
    .tu-welcome{align-self:center;text-align:center;color:var(--muted,var(--txt3));font-size:13px;max-width:420px;margin-top:20px}
    .tu-inp-wrap{border-top:1px solid var(--line,var(--bdr));padding:12px 22px;display:flex;gap:10px;align-items:flex-end}
    .tu-inp{flex:1;padding:11px 13px;border:1px solid var(--line,var(--bdr));border-radius:10px;font-size:14px;background:var(--srf);font-family:inherit;resize:none;max-height:120px}
    .tu-send{padding:11px 18px;border-radius:10px;border:none;background:var(--ink,#1F2C4F);color:#fff;cursor:pointer;font-weight:600;font-size:14px}
    .tu-send:disabled{opacity:.5;cursor:default}
    .tu-typing{align-self:flex-start;color:var(--muted,var(--txt3));font-size:13px;font-style:italic}
  `;
  document.head.appendChild(st);
}

const _TU_CHIPS = [
  { t:"Explícame un concepto", q:"Explícame de forma sencilla el concepto de " },
  { t:"Genera ejercicios", q:"Genera 5 ejercicios (con soluciones al final) sobre " },
  { t:"Prepara un examen", q:"Ayúdame a preparar un examen de " },
  { t:"Técnicas de estudio", q:"Dame técnicas de estudio para " },
  { t:"Organiza mi estudio", q:"Ayúdame a organizar mi tiempo de estudio esta semana para " },
];

function initTutor(){
  _tuEnsureStyles();
  const panel=document.getElementById("panel-tutor"); if(!panel) return;
  panel.innerHTML=`
    <div class="tu-hdr">
      <h1 class="tu-h">🎓 Tutor IA</h1>
      <div class="tu-sub">Tu profesor particular 24/7: dudas, explicaciones, ejercicios y preparación de exámenes</div>
      <div class="tu-chips">${_TU_CHIPS.map((c,i)=>`<span class="tu-chip" onclick="_tuChip(${i})">${_tuEsc(c.t)}</span>`).join("")}</div>
    </div>
    <div class="tu-msgs" id="tu-msgs">${_tuHist.length?_tuHist.map(_tuBubble).join(""):`<div class="tu-welcome">Pregúntame lo que quieras: <em>“¿Cómo se resuelve una ecuación de segundo grado?”</em>, <em>“ponme ejercicios de present perfect”</em>, <em>“explícame la fotosíntesis con un ejemplo”</em>…</div>`}</div>
    <div class="tu-inp-wrap">
      <textarea class="tu-inp" id="tu-inp" rows="1" placeholder="Escribe tu duda…" onkeydown="_tuKey(event)" oninput="_tuGrow(this)"></textarea>
      <button class="tu-send" id="tu-send" onclick="_tuEnviar()">Enviar</button>
    </div>`;
  _tuScroll();
}

function _tuBubble(m){ return `<div class="tu-msg ${m.role==="user"?"tu-user":"tu-bot"}">${_tuEsc(m.text)}</div>`; }
function _tuScroll(){ const m=document.getElementById("tu-msgs"); if(m) m.scrollTop=m.scrollHeight; }
function _tuGrow(el){ el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,120)+"px"; }
function _tuKey(e){ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); _tuEnviar(); } }
function _tuChip(i){ const el=document.getElementById("tu-inp"); if(el){ el.value=_TU_CHIPS[i].q; el.focus(); _tuGrow(el); } }

async function _tuEnviar(){
  if(_tuBusy) return;
  const inp=document.getElementById("tu-inp"); const txt=(inp?.value||"").trim(); if(!txt) return;
  inp.value=""; _tuGrow(inp);
  _tuHist.push({role:"user",text:txt});
  const msgs=document.getElementById("tu-msgs");
  const w=msgs.querySelector(".tu-welcome"); if(w) w.remove();
  msgs.insertAdjacentHTML("beforeend", _tuBubble({role:"user",text:txt}));
  msgs.insertAdjacentHTML("beforeend", `<div class="tu-typing" id="tu-typing">El tutor está pensando…</div>`);
  _tuScroll();
  _tuBusy=true; const btn=document.getElementById("tu-send"); if(btn) btn.disabled=true;

  const sys="Eres un tutor particular paciente y motivador de una academia. Explicas paso a paso, con ejemplos, adaptándote al nivel del alumno. Si te piden ejercicios, ponlos y añade las soluciones al final. Responde en español, claro y no demasiado largo. Escribe en TEXTO PLANO: nada de LaTeX ni fórmulas entre símbolos de dólar; las fracciones como 1/8 y las potencias como x^2. Si la pregunta no es académica, redirige con amabilidad al estudio.";
  const contents=_tuHist.slice(-12).map(m=>({ role: m.role==="user"?"user":"model", parts:[{text:m.text}] }));
  try{
    const res=await fetch(`${SB_URL}/functions/v1/chat`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "apikey":ANON_KEY, "Authorization":`Bearer ${ANON_KEY}` },
      body: JSON.stringify({ system_prompt: sys, contents })
    });
    const d=await res.json();
    const reply = d.text || (d.error ? ("Ups: "+d.error) : "No he podido responder, inténtalo de nuevo.");
    _tuHist.push({role:"model",text:reply});
    document.getElementById("tu-typing")?.remove();
    msgs.insertAdjacentHTML("beforeend", _tuBubble({role:"model",text:reply}));
  }catch(e){
    document.getElementById("tu-typing")?.remove();
    msgs.insertAdjacentHTML("beforeend", _tuBubble({role:"model",text:"Error de conexión. Inténtalo de nuevo."}));
  }finally{
    _tuBusy=false; if(btn) btn.disabled=false; _tuScroll(); document.getElementById("tu-inp")?.focus();
  }
}

window.initTutor=initTutor; window._tuChip=_tuChip; window._tuKey=_tuKey; window._tuGrow=_tuGrow; window._tuEnviar=_tuEnviar;
