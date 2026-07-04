// ── MARKETING (Fase 6) ──
// Generador de textos para redes sociales por PLANTILLAS locales (sin IA).
// Personaliza con el nombre de la academia (ctrName). La versión con redacción a
// medida (IA) requiere Gemini; la autopublicación en IG/FB/WhatsApp requiere las
// APIs de Meta / WhatsApp Business (fuera de alcance: solo esquema).

function _mkEsc(s){ return escH(s); }
function _mkAcademia(){ return (typeof ctrName!=="undefined" && ctrName) ? ctrName : "nuestra academia"; }

const _MK_TEMAS = {
  inicio_curso: {
    label: "Inicio de curso",
    tpl: a => `📚 ¡Arrancamos el curso en ${a}! 🎉\n\nGrupos reducidos, seguimiento personalizado y profes que se implican de verdad. Reserva ya la plaza de tu hijo/a y empezad con buen pie.\n\n📩 Escríbenos por privado para informarte.\n#academia #refuerzoescolar #vueltaalcole`
  },
  plazas_libres: {
    label: "Plazas libres",
    tpl: a => `✨ ¡Últimas plazas en ${a}! ✨\n\nAún estás a tiempo de reservar sitio en nuestros grupos de refuerzo. Plazas limitadas para mantener la calidad y la atención individual.\n\n👉 Consúltanos disponibilidad por mensaje directo.\n#plazaslimitadas #apoyoescolar`
  },
  resultados: {
    label: "Resultados/aprobados",
    tpl: a => `🏆 ¡Enhorabuena a nuestro alumnado de ${a}! 🏆\n\nOtro trimestre lleno de esfuerzo y buenos resultados. Gracias a las familias por la confianza: vuestro apoyo también suma.\n\n¿Quieres que tu hijo/a mejore sus notas? Hablamos. 💬\n#resultados #esfuerzo #orgullo`
  },
  evento: {
    label: "Evento / jornada",
    tpl: a => `📣 ¡Te esperamos en ${a}! 📣\n\nOrganizamos una jornada de puertas abiertas para que conozcas el centro, al equipo y nuestra forma de trabajar. Ven a vernos y resolvemos todas tus dudas.\n\n🗓️ Escríbenos para reservar tu hora.\n#puertasabiertas #academia`
  },
  recordatorio_matricula: {
    label: "Recordatorio de matrícula",
    tpl: a => `⏰ Recordatorio de ${a}\n\nEl plazo de matrícula sigue abierto, ¡pero las plazas vuelan! Asegura el sitio de tu hijo/a para el próximo curso y despreocúpate.\n\n📩 Responde a este mensaje o llámanos para formalizarla.\n#matriculaabierta #reservatuplaza`
  },
};

function _mkEnsureStyles(){
  if (document.getElementById("mk-styles")) return;
  const st=document.createElement("style"); st.id="mk-styles";
  st.textContent=`
    #panel-marketing{padding:0!important;overflow-y:auto}
    .mk-wrap{padding:22px 26px;max-width:760px}
    .mk-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .mk-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .mk-temas{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
    .mk-tema{padding:7px 13px;border-radius:20px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:12.5px;font-weight:600;color:var(--muted,var(--txt3))}
    .mk-tema.on{background:var(--ink);color:#fff;border-color:var(--ink)}
    .mk-ta{width:100%;min-height:190px;padding:14px;border:1px solid var(--line,var(--bdr));border-radius:12px;font-size:14px;line-height:1.5;background:var(--srf);font-family:inherit;resize:vertical}
    .mk-row{display:flex;gap:10px;align-items:center;margin-top:10px}
    .mk-btn{padding:9px 16px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600}
    .mk-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .mk-msg{font-size:13px;color:var(--success,#2e7d32)}
    .mk-note{font-size:11.5px;color:var(--muted,var(--txt3));margin-top:18px;border-top:1px solid var(--line,var(--bdr));padding-top:10px}
  `;
  document.head.appendChild(st);
}

let _mkTema = "inicio_curso";

function initMarketing(){
  _mkEnsureStyles();
  const panel=document.getElementById("panel-marketing"); if(!panel) return;
  panel.innerHTML=`
    <div class="mk-wrap">
      <h1 class="mk-h">Marketing</h1>
      <div class="mk-sub">Genera publicaciones para tus redes sociales en un clic</div>
      <div class="mk-temas">
        ${Object.entries(_MK_TEMAS).map(([k,v])=>`<span class="mk-tema ${k===_mkTema?"on":""}" onclick="_mkSel('${k}')">${_mkEsc(v.label)}</span>`).join("")}
      </div>
      <textarea class="mk-ta" id="mk-text">${_mkEsc(_MK_TEMAS[_mkTema].tpl(_mkAcademia()))}</textarea>
      <div class="mk-row">
        <button class="mk-btn mk-btn-p" onclick="_mkCopiar()">📋 Copiar texto</button>
        <button class="mk-btn" onclick="_mkSel('${_mkTema}')">↻ Regenerar</button>
        <button class="mk-btn" onclick="_mkIA(this)">✨ Versión con IA</button>
        <span class="mk-msg" id="mk-msg"></span>
      </div>
      <div class="mk-note">Plantillas listas para Instagram / Facebook. Con <strong>✨ Versión con IA</strong> (Gemini) reescribe el post a medida. La <strong>autopublicación</strong> en IG/FB/WhatsApp requiere las APIs de Meta / WhatsApp Business (pendiente).</div>
    </div>`;
}

function _mkSel(k){ _mkTema=k; initMarketing(); }
function _mkCopiar(){
  const ta=document.getElementById("mk-text"); if(!ta) return;
  const done=()=>{ const m=document.getElementById("mk-msg"); if(m){ m.textContent="Copiado ✓"; setTimeout(()=>{ if(m)m.textContent=""; },2000);} if(typeof showToastGlobal==="function") showToastGlobal("Texto copiado","success"); };
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(ta.value).then(done).catch(()=>{ ta.select(); document.execCommand&&document.execCommand("copy"); done(); }); }
  else { ta.select(); try{ document.execCommand("copy"); }catch(e){} done(); }
}

async function _mkIA(btn){
  const ta=document.getElementById("mk-text"); if(!ta) return;
  const orig=btn?btn.textContent:""; if(btn){ btn.disabled=true; btn.textContent="Generando…"; }
  const tema=_MK_TEMAS[_mkTema]?_MK_TEMAS[_mkTema].label:"promoción";
  const sys="Eres community manager de "+_mkAcademia()+", una academia. Escribes posts breves, cercanos y persuasivos para Instagram/Facebook, en español, con 2-4 emojis y 2-3 hashtags al final. Devuelve SOLO el texto del post.";
  const user="Escribe un post sobre: "+tema+". Personalízalo para "+_mkAcademia()+". Máximo 60 palabras.";
  try{
    const txt=await iaChat(sys,user);
    if(txt) ta.value=txt.trim();
    const m=document.getElementById("mk-msg"); if(m){ m.textContent="Generado con IA ✓"; setTimeout(()=>{ if(m)m.textContent=""; },2500); }
  }catch(e){
    if(typeof showToastGlobal==="function") showToastGlobal("Error IA: "+e.message,"error"); else alert("Error IA: "+e.message);
  }finally{ if(btn){ btn.disabled=false; btn.textContent=orig; } }
}

window.initMarketing=initMarketing; window._mkSel=_mkSel; window._mkCopiar=_mkCopiar; window._mkIA=_mkIA;
