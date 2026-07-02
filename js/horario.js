// ── HORARIO SEMANAL (Fase 1 · inc.3) ──
// Vista de la parrilla semanal cruzando grupo_sesiones + grupos + profesores.
// Filtra por grupo o profesor y detecta solapes de profesor y de aula.
// Sin SQL nuevo. Solo lectura. Filtra por ctrId.

let _horSes = [], _horGrupos = [], _horProfes = [], _horFiltro = "todos";
const _HDIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function _horEsc(s) { return escH(s); }
function _horCurso() { return typeof cursoActivo !== "undefined" ? cursoActivo : "2025-26"; }
function _hhmm(t) { return String(t || "").slice(0, 5); }
function _overlap(a, b) { return a.dia === b.dia && a.ini < b.fin && b.ini < a.fin; }

function _horEnsureStyles() {
  if (document.getElementById("hor-styles")) return;
  const st = document.createElement("style");
  st.id = "hor-styles";
  st.textContent = `
    #panel-horario{padding:0!important;overflow-y:auto}
    .hor-wrap{padding:22px 26px}
    .hor-hdr{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:16px}
    .hor-h{font-family:var(--font-display,serif);font-size:24px;margin:0}
    .hor-sub{font-size:12px;color:var(--muted,var(--txt3))}
    .hor-sel{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);margin-left:auto}
    .hor-grid{display:grid;gap:10px;grid-template-columns:repeat(var(--cols,5),minmax(150px,1fr));overflow-x:auto}
    .hor-col{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:10px;padding:8px;min-height:90px}
    .hor-day{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,var(--txt3));text-align:center;padding:4px 0 8px}
    .hor-chip{border-left:4px solid var(--c,#888);background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:8px;padding:7px 9px;margin-bottom:7px}
    .hor-chip.conf{outline:2px solid var(--danger,#c0392b);outline-offset:1px}
    .hor-time{font-size:12px;font-weight:700}
    .hor-name{font-size:12.5px;font-weight:600;margin-top:1px}
    .hor-meta{font-size:11px;color:var(--muted,var(--txt3))}
    .hor-empty{font-size:11.5px;color:var(--muted,var(--txt3));text-align:center;padding:14px 0}
    .hor-confbox{margin-top:18px;border:1px solid var(--danger,#c0392b);background:var(--danger-soft,#fae6e0);border-radius:10px;padding:12px 14px}
    .hor-confbox h4{margin:0 0 6px;font-size:13px;color:var(--danger,#c0392b)}
    .hor-conf-item{font-size:12.5px;margin:3px 0}
    .hor-ok{margin-top:18px;font-size:13px;color:var(--success,#2e7d32)}
  `;
  document.head.appendChild(st);
}

async function initHorario() {
  _horEnsureStyles();
  const panel = document.getElementById("panel-horario");
  if (!panel) return;
  panel.innerHTML = `<div class="hor-wrap"><div class="hor-sub">Cargando horario…</div></div>`;
  const [g, p, s] = await Promise.all([
    sb.from("grupos").select("id,nombre,color,profesor_id,aula").eq("centro_id", ctrId).eq("curso_escolar", _horCurso()),
    sb.from("profesores").select("id,nombre,apellidos").eq("centro_id", ctrId),
    sb.from("grupo_sesiones").select("*").eq("centro_id", ctrId),
  ]);
  _horGrupos = g.data || []; _horProfes = p.data || [];
  const gById = Object.fromEntries(_horGrupos.map(x => [x.id, x]));
  const pById = Object.fromEntries(_horProfes.map(x => [x.id, x]));
  _horSes = (s.data || []).map(se => {
    const gr = gById[se.grupo_id] || {};
    const pr = pById[gr.profesor_id] || null;
    return {
      dia: se.dia_semana, ini: _hhmm(se.hora_inicio), fin: _hhmm(se.hora_fin),
      aula: se.aula || gr.aula || "", grupoId: se.grupo_id,
      grupoNombre: gr.nombre || "(grupo)", color: gr.color || "#888",
      profId: gr.profesor_id || null, profNombre: pr ? [pr.nombre, pr.apellidos].filter(Boolean).join(" ") : "",
    };
  });
  _horRender();
}

function _horConflicts() {
  const prof = [], aula = [];
  for (let i = 0; i < _horSes.length; i++) for (let j = i + 1; j < _horSes.length; j++) {
    const a = _horSes[i], b = _horSes[j];
    if (!_overlap(a, b)) continue;
    if (a.profId && b.profId && a.profId === b.profId) prof.push([a, b]);
    if (a.aula && b.aula && a.aula.trim().toLowerCase() === b.aula.trim().toLowerCase()) aula.push([a, b]);
  }
  return { prof, aula };
}

function _horSetFiltro(v) { _horFiltro = v; _horRender(); }

function _horRender() {
  const panel = document.getElementById("panel-horario");
  const conf = _horConflicts();
  const confSet = new Set();
  [...conf.prof, ...conf.aula].forEach(([a, b]) => { confSet.add(a); confSet.add(b); });

  let ses = _horSes.slice();
  if (_horFiltro.startsWith("g:")) ses = ses.filter(s => s.grupoId === _horFiltro.slice(2));
  else if (_horFiltro.startsWith("p:")) ses = ses.filter(s => s.profId === _horFiltro.slice(2));

  const diasPresentes = new Set(_horSes.map(s => s.dia));
  const dias = [1, 2, 3, 4, 5].concat([6, 7].filter(d => diasPresentes.has(d)));

  const opts = `<option value="todos">Todos</option>` +
    (_horGrupos.length ? `<optgroup label="Grupos">${_horGrupos.map(g => `<option value="g:${g.id}" ${_horFiltro==="g:"+g.id?"selected":""}>${_horEsc(g.nombre)}</option>`).join("")}</optgroup>` : "") +
    (_horProfes.length ? `<optgroup label="Profesores">${_horProfes.map(p => `<option value="p:${p.id}" ${_horFiltro==="p:"+p.id?"selected":""}>${_horEsc([p.nombre,p.apellidos].filter(Boolean).join(" "))}</option>`).join("")}</optgroup>` : "");

  const cols = dias.map(d => {
    const items = ses.filter(s => s.dia === d).sort((a, b) => a.ini.localeCompare(b.ini));
    const chips = items.length ? items.map(s => `
      <div class="hor-chip ${confSet.has(s)?"conf":""}" style="--c:${_horEsc(s.color)}">
        <div class="hor-time">${_horEsc(s.ini)}–${_horEsc(s.fin)}${confSet.has(s)?" ⚠":""}</div>
        <div class="hor-name">${_horEsc(s.grupoNombre)}</div>
        <div class="hor-meta">${s.profNombre?_horEsc(s.profNombre):"sin profesor"}${s.aula?" · "+_horEsc(s.aula):""}</div>
      </div>`).join("") : `<div class="hor-empty">—</div>`;
    return `<div class="hor-col"><div class="hor-day">${_HDIAS[d]}</div>${chips}</div>`;
  }).join("");

  const confHtml = (conf.prof.length || conf.aula.length) ? `
    <div class="hor-confbox">
      <h4>⚠ Solapes detectados (${conf.prof.length + conf.aula.length})</h4>
      ${conf.prof.map(([a,b]) => `<div class="hor-conf-item">Profesor <strong>${_horEsc(a.profNombre)}</strong>: ${_HDIAS[a.dia]} ${_horEsc(a.ini)}–${_horEsc(a.fin)} (${_horEsc(a.grupoNombre)}) coincide con ${_horEsc(b.ini)}–${_horEsc(b.fin)} (${_horEsc(b.grupoNombre)}).</div>`).join("")}
      ${conf.aula.map(([a,b]) => `<div class="hor-conf-item">Aula <strong>${_horEsc(a.aula)}</strong>: ${_HDIAS[a.dia]} ${_horEsc(a.ini)}–${_horEsc(a.fin)} (${_horEsc(a.grupoNombre)}) coincide con ${_horEsc(b.grupoNombre)} ${_horEsc(b.ini)}–${_horEsc(b.fin)}.</div>`).join("")}
    </div>` : (_horSes.length ? `<div class="hor-ok">✓ Sin solapes de profesor ni de aula.</div>` : "");

  panel.innerHTML = `
    <div class="hor-wrap">
      <div class="hor-hdr">
        <div><h1 class="hor-h">Horario semanal</h1><div class="hor-sub">Sesiones de todos los grupos · curso ${_horEsc(_horCurso())}</div></div>
        <select class="hor-sel" onchange="_horSetFiltro(this.value)">${opts}</select>
      </div>
      ${_horSes.length ? `<div class="hor-grid" style="--cols:${dias.length}">${cols}</div>` : `<div class="hor-empty" style="padding:40px">Aún no hay sesiones. Crea grupos con sus sesiones semanales en <strong>Grupos</strong>.</div>`}
      ${confHtml}
    </div>`;
}

window.initHorario = initHorario;
window._horSetFiltro = _horSetFiltro;
