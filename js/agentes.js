/* Panel "Agentes" — lanzador central de los agentes de DidactIA (modo asistido).
   Cada tarjeta muestra un dato en vivo y un botón que abre el agente correspondiente. */

var _AGENTES = [
  {
    id: "sust", icon: "🔄", color: "#185FA5",
    nombre: "Agente de sustituciones",
    desc: "Revisa las ausencias del día y propone quién cubre cada tramo: profesorado de guardia primero, luego libres por equidad, sin conflictos. Tú confirmas.",
    launch: "agenteSustituciones",
    stat: async function () {
      var hoy = new Date().toISOString().split("T")[0];
      var r = await sb.from("sustituciones").select("id,profesor_sustituto,cubierta")
        .eq("centro_id", ctrId).eq("fecha", hoy).or("cubierta.eq.false,cubierta.is.null");
      var n = (r.data || []).filter(function (s) { return !s.profesor_sustituto; }).length;
      return { n: n, label: n ? n + " tramo" + (n !== 1 ? "s" : "") + " sin cubrir hoy" : "Todo cubierto hoy", warn: n > 0 };
    },
  },
  {
    id: "rrhh", icon: "👔", color: "#BA7517",
    nombre: "Agente de RRHH / permisos",
    desc: "Evalúa todas las solicitudes pendientes contra el convenio o el EBEP y te deja la bandeja lista: recomendación + mensaje al profesor redactado, a un clic.",
    launch: "agenteRRHH",
    stat: async function () {
      var r = await sb.from("ausencias_profesor").select("id,estado").eq("centro_id", ctrId);
      var n = (r.data || []).filter(function (a) { return !a.estado || a.estado === "pendiente"; }).length;
      return { n: n, label: n ? n + " solicitud" + (n !== 1 ? "es" : "") + " pendiente" + (n !== 1 ? "s" : "") : "Sin pendientes", warn: n > 0 };
    },
  },
  {
    id: "com", icon: "📢", color: "#3B6D11",
    nombre: "Agente de comunicación",
    desc: "Escribe una orden breve y el agente redacta el comunicado, infiere los destinatarios y lo envía a las familias — cada una lo recibe en su idioma.",
    launch: "agenteComunicacion",
    stat: async function () { return { n: 0, label: "Redacta y envía en segundos", warn: false }; },
  },
  {
    id: "ori", icon: "🧭", color: "#0E7C7B",
    nombre: "Agente de orientación / riesgo",
    desc: "Cruza asistencia, notas e incidencias para detectar alumnado en riesgo y redacta el borrador de alerta de cada caso para el equipo de orientación.",
    launch: "agenteOrientacion",
    stat: async function () {
      var r = await sb.from("alertas_orientacion").select("id,estado").eq("centro_id", ctrId).neq("estado", "resuelta");
      var n = (r.data || []).length;
      return { n: n, label: n ? n + " alerta" + (n !== 1 ? "s" : "") + " activa" + (n !== 1 ? "s" : "") : "Sin alertas activas", warn: false };
    },
  },
];

window.initAgentesPanel = function () {
  var el = document.getElementById("panel-agentes");
  if (!el) return;
  _agtEnsureStyles();
  el.innerHTML = '<div class="agt-page">' +
    '<div class="agt-hdr">' +
      '<div class="agt-eyebrow">DIDACTIA · AUTOMATIZACIÓN</div>' +
      '<h1 class="agt-title">Agentes</h1>' +
      '<p class="agt-sub">Cada agente revisa los datos, prepara el trabajo y te lo deja listo para confirmar. Tú tienes siempre la última palabra.</p>' +
    '</div>' +
    '<div class="agt-grid">' +
      _AGENTES.map(function (a) {
        return '<div class="agt-card">' +
          '<div class="agt-card-top">' +
            '<div class="agt-ic" style="background:' + a.color + '1a;color:' + a.color + ';">' + a.icon + '</div>' +
            '<div class="agt-stat" id="agt-stat-' + a.id + '"><span class="agt-spin">⟳</span></div>' +
          '</div>' +
          '<div class="agt-name">' + a.nombre + '</div>' +
          '<div class="agt-desc">' + a.desc + '</div>' +
          '<button class="agt-btn" style="background:' + a.color + ';" onclick="window._agtLanzar(\'' + a.launch + '\')">🤖 Lanzar agente</button>' +
        '</div>';
      }).join("") +
    '</div>' +
    '<div class="agt-foot">🔒 Todos en modo asistido: proponen, tú revisas y confirmas. Nada se ejecuta sin tu OK, y todo es editable antes de aplicar.</div>' +
  '</div>';

  // Stats en vivo (fire-and-forget por tarjeta)
  _AGENTES.forEach(function (a) {
    a.stat().then(function (s) {
      var box = document.getElementById("agt-stat-" + a.id);
      if (box) box.innerHTML = '<span class="agt-pill ' + (s.warn ? "agt-pill-warn" : "") + '">' + (s.n ? "<strong>" + s.n + "</strong> · " : "") + _agtEsc(s.label) + '</span>';
    }).catch(function () {
      var box = document.getElementById("agt-stat-" + a.id);
      if (box) box.innerHTML = "";
    });
  });
};

window._agtLanzar = function (fn) {
  if (typeof window[fn] === "function") { try { window[fn](); } catch (e) { console.warn("[agentes]", e); } }
  else if (typeof showToast === "function") showToast("Agente no disponible — recarga la página");
};

function _agtEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _agtEnsureStyles() {
  if (document.getElementById("agt-styles")) return;
  var s = document.createElement("style");
  s.id = "agt-styles";
  s.textContent = [
    ".agt-page{padding:28px;max-width:1100px;margin:0 auto;}",
    ".agt-hdr{margin-bottom:22px;}",
    ".agt-eyebrow{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#888);margin-bottom:5px;}",
    ".agt-title{font-family:var(--font-display,Georgia,serif);font-size:32px;font-weight:700;color:var(--txt,#222);margin:0 0 6px;letter-spacing:-.02em;}",
    ".agt-sub{font-size:14px;color:var(--muted,#888);margin:0;max-width:620px;line-height:1.5;}",
    ".agt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;}",
    ".agt-card{background:var(--paper,#fff);border:1px solid var(--line,#e0e0e0);border-radius:16px;padding:20px;display:flex;flex-direction:column;transition:box-shadow .15s,transform .15s;}",
    ".agt-card:hover{box-shadow:0 10px 30px rgba(0,0,0,.08);transform:translateY(-2px);}",
    ".agt-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;}",
    ".agt-ic{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:24px;flex:0 0 auto;}",
    ".agt-stat{text-align:right;font-size:12px;}",
    ".agt-spin{display:inline-block;color:var(--muted-2,#bbb);animation:agtspin 1s linear infinite;}",
    "@keyframes agtspin{to{transform:rotate(360deg);}}",
    ".agt-pill{display:inline-block;background:var(--surface-sunk,#f2f1ec);color:var(--muted,#777);border-radius:20px;padding:4px 11px;font-size:11.5px;font-weight:500;}",
    ".agt-pill-warn{background:#fde8e8;color:#b83232;}",
    ".agt-pill strong{font-weight:800;}",
    ".agt-name{font-size:17px;font-weight:700;color:var(--txt,#222);margin-bottom:7px;}",
    ".agt-desc{font-size:13px;color:var(--txt2,#555);line-height:1.55;flex:1;margin-bottom:16px;}",
    ".agt-btn{border:none;border-radius:10px;padding:11px 16px;font-size:13.5px;font-weight:700;color:#fff;cursor:pointer;font-family:inherit;letter-spacing:.01em;}",
    ".agt-btn:hover{filter:brightness(1.06);}",
    ".agt-foot{margin-top:22px;font-size:12px;color:var(--muted,#888);background:var(--surface-sunk,#f2f1ec);border-radius:10px;padding:12px 15px;line-height:1.5;}",
    "@media(max-width:640px){.agt-page{padding:18px;}.agt-grid{grid-template-columns:1fr;}}",
  ].join("");
  document.head.appendChild(s);
}
