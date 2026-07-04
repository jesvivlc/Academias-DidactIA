// ── PLANIFICADOR (motor de agrupación) — #11 ──
// Propuesta DETERMINISTA de grupos por nivel educativo (+ NEE aparte) y detección
// de huecos en la parrilla. NO crea nada; solo sugiere. Filtra por ctrId.
let _plAlumnos = [], _plCarga = null;
function _plEsc(s){ return escH(s); }
const _PL_DIAS=["","Lunes","Martes","Miércoles","Jueves","Viernes"];
function _plNom(a){ return [a.nombre,a.apellidos].filter(Boolean).join(" ")||"(alumno)"; }

function _plStyles(){
  if(document.getElementById("pl-styles")) return;
  const st=document.createElement("style"); st.id="pl-styles";
  st.textContent=`
    #panel-planificador{padding:0!important;overflow-y:auto}
    .pl-wrap{padding:22px 26px;max-width:1000px}
    .pl-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .pl-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .pl-ctrl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}
    .pl-in{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:80px}
    .pl-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px}
    .pl-nivel{margin-bottom:14px}
    .pl-nivel-t{font-size:14px;font-weight:700;margin-bottom:6px}
    .pl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
    .pl-grp{border:1px solid var(--line,var(--bdr));border-radius:10px;padding:10px 12px;background:var(--srf)}
    .pl-grp-t{font-size:12.5px;font-weight:700;display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
    .pl-chip{font-size:10px;padding:1px 7px;border-radius:20px;background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .pl-al{font-size:12.5px;padding:2px 0;color:var(--txt2,#444)}
    .pl-count{font-size:11px;color:var(--muted,var(--txt3))}
    .pl-bars{display:flex;gap:10px;align-items:flex-end;margin-top:8px}
    .pl-bar-wrap{flex:1;text-align:center}
    .pl-bar{background:var(--ink,#1F2C4F);border-radius:5px 5px 0 0;margin:0 auto;width:70%}
    .pl-bar.hueco{background:var(--success,#3F9367)}
    .pl-bar-l{font-size:11px;color:var(--muted,var(--txt3));margin-top:4px}
    .pl-note{margin-top:16px;font-size:11.5px;color:var(--muted,var(--txt3));border-top:1px solid var(--line,var(--bdr));padding-top:10px}
    .pl-empty{font-size:13px;color:var(--muted,var(--txt3));padding:10px 0}
  `;
  document.head.appendChild(st);
}

async function initPlanificador(){
  _plStyles();
  const panel=document.getElementById("panel-planificador"); if(!panel) return;
  panel.innerHTML=`<div class="pl-wrap"><div class="pl-sub">Cargando…</div></div>`;
  const [al, ses] = await Promise.all([
    sb.from("alumnos").select("id,nombre,apellidos,nivel_educativo,nee").eq("centro_id",ctrId).eq("estado","activo"),
    sb.from("grupo_sesiones").select("dia_semana").eq("centro_id",ctrId),
  ]);
  _plAlumnos=al.data||[];
  _plCarga=[0,0,0,0,0,0]; (ses.data||[]).forEach(s=>{ const d=Number(s.dia_semana); if(d>=1&&d<=5) _plCarga[d]++; });
  _plRender();
}

function _plTrocear(arr, size){
  const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out;
}

function _plRender(){
  const panel=document.getElementById("panel-planificador");
  const size=Math.max(2, parseInt(document.getElementById("pl-size")?.value||"8",10)||8);
  // Agrupar por nivel
  const porNivel={};
  _plAlumnos.forEach(a=>{ const k=a.nivel_educativo||"Sin nivel"; (porNivel[k]=porNivel[k]||[]).push(a); });
  const niveles=Object.keys(porNivel).sort();

  const bloquesHtml=niveles.map(niv=>{
    const alumnos=porNivel[niv];
    const nee=alumnos.filter(a=>a.nee);
    const reg=alumnos.filter(a=>!a.nee);
    const grupos=[];
    _plTrocear(reg,size).forEach(g=>grupos.push({nee:false,al:g}));
    _plTrocear(nee,Math.max(3,size-2)).forEach(g=>grupos.push({nee:true,al:g}));
    if(!grupos.length) return "";
    return `<div class="pl-nivel"><div class="pl-nivel-t">${_plEsc(niv)} <span class="pl-count">(${alumnos.length} alumno/s → ${grupos.length} grupo/s)</span></div>
      <div class="pl-grid">${grupos.map((g,i)=>`
        <div class="pl-grp"><div class="pl-grp-t"><span>Grupo ${i+1}</span>${g.nee?`<span class="pl-chip">NEE</span>`:`<span class="pl-count">${g.al.length}</span>`}</div>
          ${g.al.map(a=>`<div class="pl-al">${_plEsc(_plNom(a))}</div>`).join("")}
        </div>`).join("")}</div></div>`;
  }).join("");

  // Carga por día
  const max=Math.max(1,..._plCarga.slice(1,6));
  const minCarga=Math.min(..._plCarga.slice(1,6));
  const bars=[1,2,3,4,5].map(d=>{
    const v=_plCarga[d]; const h=Math.round(v/max*70)+6; const hueco=v===minCarga;
    return `<div class="pl-bar-wrap"><div class="pl-bar ${hueco?"hueco":""}" style="height:${h}px"></div><div class="pl-bar-l">${_PL_DIAS[d]}<br>${v}${hueco?" ·hueco":""}</div></div>`;
  }).join("");

  panel.innerHTML=`
    <div class="pl-wrap">
      <h1 class="pl-h">Planificador de grupos</h1>
      <div class="pl-sub">Propuesta de agrupación por nivel y detección de huecos horarios</div>
      <div class="pl-ctrl"><label class="pl-sub">Tamaño objetivo por grupo:</label><input class="pl-in" id="pl-size" type="number" min="2" max="30" value="${size}" onchange="_plRender()"></div>
      <div class="pl-sec">Propuesta de grupos</div>
      ${_plAlumnos.length?(bloquesHtml||`<div class="pl-empty">Sin alumnos con nivel para agrupar.</div>`):`<div class="pl-empty">No hay alumnos activos. Da de alta alumnos con su nivel educativo.</div>`}
      <div class="pl-sec">Carga por día de la semana</div>
      <div class="pl-bars">${bars}</div>
      <div class="pl-note">Propuesta orientativa basada en nivel educativo y NEE. <strong>No crea grupos ni horarios</strong>, solo sugiere. Los alumnos con NEE se separan en grupos más pequeños. Los días marcados como "hueco" son los de menos carga en la parrilla actual.</div>
    </div>`;
}

window.initPlanificador=initPlanificador; window._plRender=_plRender;
