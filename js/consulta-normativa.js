/* Módulo Consulta normativa (RAG) — pregunta en lenguaje natural → respuesta de la
   IA citando la normativa indexada (EF kb-ask). Fase 1. Staff/dirección. */

function _knEsc(s) { return escH(s); } // delegado a utils.js

var _KN_TIPO_LBL = {
  ley: "Ley", decreto: "Decreto", instruccion: "Instrucción", convenio: "Convenio",
  nof: "NOF", pec: "PEC", otro: "Documento",
};

var _KN_EJEMPLOS = [
  "¿Cuántas horas lectivas semanales puede tener un profesor a jornada completa?",
  "¿Qué medidas contempla la normativa de convivencia ante un caso de acoso escolar?",
  "¿Cuál es el horario máximo del alumnado y la duración mínima de las sesiones?",
];

window.initConsultaNormativa = function () {
  var el = document.getElementById("panel-consultanormativa");
  if (!el) return;
  _knEnsureStyles();
  var chips = _KN_EJEMPLOS.map(function (q) {
    return '<button class="kn-chip" onclick="window._knUsarEjemplo(' + escArg(q) + ')">' + _knEsc(q) + "</button>";
  }).join("");
  el.innerHTML =
    '<div class="kn-page"><div class="kn-hdr">' +
    '<div><div class="kn-eyebrow">IA · BASE DE CONOCIMIENTO</div>' +
    '<h1 class="kn-title">Consulta normativa</h1>' +
    '<p class="kn-sub">Pregunta y la IA responde citando la normativa indexada del centro. Marco orientativo, no asesoría jurídica.</p></div></div>' +
    '<div class="kn-ask">' +
    '<textarea id="kn-input" class="kn-input" rows="3" placeholder="Escribe tu pregunta sobre normativa…" ' +
    'onkeydown="if(event.key===\'Enter\'&&(event.ctrlKey||event.metaKey)){event.preventDefault();window._knConsultar();}"></textarea>' +
    '<div class="kn-ask-foot"><div class="kn-chips">' + chips + "</div>" +
    '<button id="kn-go" class="kn-btn" onclick="window._knConsultar()">Consultar</button></div></div>' +
    '<div id="kn-result" class="kn-result"></div></div>';
};

window._knUsarEjemplo = function (q) {
  var ta = document.getElementById("kn-input");
  if (ta) { ta.value = q; ta.focus(); }
};

window._knConsultar = async function () {
  var ta = document.getElementById("kn-input");
  var box = document.getElementById("kn-result");
  var btn = document.getElementById("kn-go");
  if (!ta || !box) return;
  var pregunta = (ta.value || "").trim();
  if (!pregunta) { ta.focus(); return; }

  if (btn) { btn.disabled = true; btn.textContent = "Consultando…"; }
  box.innerHTML = '<div class="kn-loading">Buscando en la normativa indexada…</div>';

  try {
    var res = await window.sb.functions.invoke("kb-ask", { body: { pregunta: pregunta } });
    if (res.error) throw new Error(res.error.message || "Error en la consulta");
    var data = res.data || {};
    if (data.error) throw new Error(data.error);
    _knRender(box, data, pregunta);
  } catch (e) {
    box.innerHTML = '<div class="kn-error">No se pudo completar la consulta: ' + _knEsc(e.message || String(e)) + "</div>";
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Consultar"; }
  }
};

function _knRender(box, data, pregunta) {
  var sources = data.sources || [];
  // Respuesta: respeta saltos de línea; escapa todo.
  var answerHtml = _knEsc(data.answer || "Sin respuesta.").replace(/\n/g, "<br>");

  var html = '<div class="kn-q">' + _knEsc(pregunta) + "</div>";
  html += '<div class="kn-answer">' + answerHtml + "</div>";

  if (sources.length) {
    html += '<div class="kn-src-title">Fuentes citadas (' + sources.length + ")</div>";
    html += '<div class="kn-src-list">';
    sources.forEach(function (s, i) {
      var tipo = _KN_TIPO_LBL[s.tipo] || (s.tipo || "Documento");
      var fecha = s.fecha_doc ? '<span class="kn-src-meta">· ' + _knEsc(String(s.fecha_doc)) + "</span>" : "";
      var sim = (typeof s.similarity === "number") ? '<span class="kn-src-sim">' + Math.round(s.similarity * 100) + "%</span>" : "";
      var enlace = s.source_url
        ? '<a class="kn-src-link" href="' + escAttr(s.source_url) + '" target="_blank" rel="noopener">Ver fuente oficial ↗</a>'
        : "";
      html += '<div class="kn-src">' +
        '<div class="kn-src-head"><span class="kn-src-num">' + (i + 1) + "</span>" +
        '<span class="kn-src-name">' + _knEsc(s.titulo || "Documento") + "</span>" +
        '<span class="kn-src-tag">' + _knEsc(tipo) + "</span>" + fecha + sim + "</div>" +
        '<div class="kn-src-frag">' + _knEsc(s.fragmento || "") + "</div>" +
        enlace + "</div>";
    });
    html += "</div>";
  }
  html += '<div class="kn-disclaimer">Respuesta generada por IA a partir de los documentos indexados. ' +
    "Verifica siempre contra la fuente oficial antes de tomar decisiones.</div>";
  box.innerHTML = html;
}

function _knEnsureStyles() {
  if (document.getElementById("kn-styles")) return;
  var st = document.createElement("style");
  st.id = "kn-styles";
  st.textContent = [
    "#panel-consultanormativa{padding:0!important}",
    ".kn-page{padding:28px;max-width:900px;margin:0 auto}",
    ".kn-hdr{margin-bottom:20px}",
    ".kn-eyebrow{font:600 11px/1.4 var(--font-ui);letter-spacing:.08em;color:var(--accent);text-transform:uppercase}",
    ".kn-title{font:600 30px/1.2 var(--font-display);color:var(--txt);margin:4px 0 6px}",
    ".kn-sub{font:400 14px/1.5 var(--font-ui);color:var(--muted);margin:0}",
    ".kn-ask{background:var(--srf,#fff);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:var(--sh)}",
    ".kn-input{width:100%;border:1px solid var(--line);border-radius:10px;padding:12px;font:400 15px/1.5 var(--font-ui);color:var(--txt);background:var(--paper);resize:vertical;box-sizing:border-box}",
    ".kn-input:focus{outline:none;border-color:var(--ink)}",
    ".kn-ask-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;flex-wrap:wrap}",
    ".kn-chips{display:flex;gap:6px;flex-wrap:wrap;flex:1}",
    ".kn-chip{font:400 12px/1.3 var(--font-ui);color:var(--muted);background:var(--surface-sunk,#eee);border:1px solid var(--line);border-radius:999px;padding:6px 10px;cursor:pointer;text-align:left}",
    ".kn-chip:hover{border-color:var(--ink);color:var(--txt)}",
    ".kn-btn{font:600 14px/1 var(--font-ui);color:#fff;background:var(--ink);border:none;border-radius:10px;padding:11px 20px;cursor:pointer;white-space:nowrap}",
    ".kn-btn:hover{filter:brightness(1.06)}.kn-btn:disabled{opacity:.6;cursor:default}",
    ".kn-result{margin-top:22px}",
    ".kn-loading,.kn-error{padding:18px;border-radius:12px;font:400 14px/1.5 var(--font-ui)}",
    ".kn-loading{color:var(--muted)}",
    ".kn-error{color:var(--danger,#c0392b);background:var(--danger-soft,#fae6e0);border:1px solid var(--danger,#c0392b)}",
    ".kn-q{font:600 15px/1.4 var(--font-ui);color:var(--txt);margin-bottom:8px}",
    ".kn-answer{font:400 15px/1.65 var(--font-ui);color:var(--txt);background:var(--accent-soft,#f3e1d5);border-left:3px solid var(--accent);border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:20px}",
    ".kn-src-title{font:600 13px/1 var(--font-ui);color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}",
    ".kn-src-list{display:flex;flex-direction:column;gap:12px}",
    ".kn-src{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--srf,#fff)}",
    ".kn-src-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}",
    ".kn-src-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--ink);color:#fff;font:600 12px/1 var(--font-ui);flex-shrink:0}",
    ".kn-src-name{font:600 14px/1.3 var(--font-ui);color:var(--txt)}",
    ".kn-src-tag{font:600 10px/1 var(--font-ui);text-transform:uppercase;letter-spacing:.04em;color:var(--accent-ink,#7a3e1f);background:var(--accent-soft,#f3e1d5);border-radius:5px;padding:4px 7px}",
    ".kn-src-meta{font:400 12px/1 var(--font-ui);color:var(--muted)}",
    ".kn-src-sim{font:600 11px/1 var(--font-ui);color:var(--success,#3f9367);margin-left:auto}",
    ".kn-src-frag{font:400 13px/1.6 var(--font-ui);color:var(--muted);background:var(--paper);border-radius:8px;padding:10px 12px;white-space:pre-wrap}",
    ".kn-src-link{display:inline-block;margin-top:8px;font:600 13px/1 var(--font-ui);color:var(--ink);text-decoration:none}",
    ".kn-src-link:hover{text-decoration:underline}",
    ".kn-disclaimer{margin-top:18px;font:400 12px/1.5 var(--font-ui);color:var(--muted-2,#999);font-style:italic}",
  ].join("");
  document.head.appendChild(st);
}
