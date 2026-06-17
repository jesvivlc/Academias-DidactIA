/* Módulo Actas — resumen IA de claustros y reuniones */

function _actEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _actHoy() { return new Date().toISOString().split("T")[0]; }
function _actFmt(f) { if (!f) return "—"; var p = f.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
var _ACT_TIPOS = { claustro: "Claustro", ccp: "CCP", departamento: "Departamento", evaluacion: "Junta de evaluación", tutores: "Reunión de tutores", otro: "Otra reunión" };
var _actSR = null;

async function _actGemini(systemPrompt, userMsg) {
  try {
    var r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY, "apikey": ANON_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        system_prompt: systemPrompt,
        centro_id: ctrId || "",
        role: "familia",  // fuerza respuesta de texto (sin function calling)
        user_name: (typeof currentUserName !== "undefined" ? currentUserName : ""),
        user_id: (window.currentUser ? window.currentUser.id : ""),
      }),
    });
    if (!r.ok) return null;
    var j = await r.json();
    return j.type === "text" ? j.text : null;
  } catch (e) { return null; }
}
function _actParseJson(txt) {
  if (!txt) return null;
  try {
    var clean = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
    var a = clean.indexOf("{"), b = clean.lastIndexOf("}");
    if (a >= 0 && b > a) clean = clean.slice(a, b + 1);
    return JSON.parse(clean);
  } catch (e) { return null; }
}

window.initActas = function () {
  var el = document.getElementById("panel-actas");
  if (!el) return;
  _actEnsureStyles();
  el.innerHTML = '<div class="act-page"><div class="act-hdr">' +
    '<div><div class="act-eyebrow">CENTRO · REUNIONES</div>' +
    '<h1 class="act-title">Actas de reuniones</h1>' +
    '<p class="act-sub">Dicta o pega las notas y deja que la IA redacte el acta, los acuerdos y las tareas.</p></div>' +
    '<button class="act-btn act-btn-primary" onclick="window._actNueva()">+ Nueva acta</button></div>' +
    '<div id="act-list" class="act-list-wrap"><div class="act-loading">Cargando…</div></div></div>';
  _actCargar();
};

async function _actCargar() {
  var box = document.getElementById("act-list");
  if (!box) return;
  var r = await window.sb.from("actas_reunion").select("id,titulo,fecha,tipo,resumen,acuerdos,tareas")
    .eq("centro_id", window.ctrId).order("fecha", { ascending: false }).limit(200);
  var actas = r.data || [];
  if (!actas.length) { box.innerHTML = '<div class="act-empty">Aún no hay actas. Crea la primera con “+ Nueva acta”.</div>'; return; }
  box.innerHTML = actas.map(function (a) {
    var nt = (a.tareas || []).length, na = (a.acuerdos || []).length;
    return '<div class="act-card" onclick="window._actVer(\'' + a.id + '\')">' +
      '<div class="act-card-main">' +
        '<div class="act-card-top"><span class="act-tipo">' + (_ACT_TIPOS[a.tipo] || "Reunión") + '</span>' +
        '<span class="act-card-ttl">' + _actEsc(a.titulo) + '</span></div>' +
        '<div class="act-card-meta">' + _actFmt(a.fecha) + ' · ' + na + ' acuerdo' + (na !== 1 ? "s" : "") + ' · ' + nt + ' tarea' + (nt !== 1 ? "s" : "") + '</div>' +
      '</div><span class="act-card-arr">›</span></div>';
  }).join("");
}

/* ── Editor / nueva ── */
window._actNueva = function (data) {
  window._actDraft = data || { acuerdos: [], tareas: [] };
  var d = window._actDraft;
  var old = document.getElementById("act-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "act-modal";
  w.className = "act-ov";
  w.innerHTML = '<div class="act-modal">' +
    '<div class="act-modal-hd"><h3>' + (d.id ? "Editar acta" : "Nueva acta") + '</h3>' +
      '<button class="act-x" onclick="document.getElementById(\'act-modal\').remove()">✕</button></div>' +
    '<div class="act-modal-bd">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div style="flex:2;min-width:180px;"><label class="act-fl">Título *</label><input id="act-f-titulo" class="act-in" type="text" maxlength="160" value="' + _actEsc(d.titulo || "") + '" placeholder="Claustro de junio"></div>' +
        '<div style="flex:1;min-width:120px;"><label class="act-fl">Fecha</label><input id="act-f-fecha" class="act-in" type="date" value="' + (d.fecha || _actHoy()) + '"></div>' +
      '</div>' +
      '<label class="act-fl">Tipo</label><select id="act-f-tipo" class="act-in">' +
        Object.keys(_ACT_TIPOS).map(function (k) { return '<option value="' + k + '"' + (d.tipo === k ? " selected" : "") + '>' + _ACT_TIPOS[k] + '</option>'; }).join("") +
      '</select>' +
      '<div class="act-notas-hd"><label class="act-fl" style="margin:0">Notas de la reunión</label>' +
        '<button id="act-voz-btn" class="act-btn act-btn-sm" onclick="window._actVoz()">🎙️ Dictar</button></div>' +
      '<textarea id="act-f-notas" class="act-in" rows="6" placeholder="Pega o dicta aquí las notas tomadas durante la reunión…">' + _actEsc(d.notas_raw || "") + '</textarea>' +
      '<button class="act-btn act-btn-ia" onclick="window._actGenerar(this)">✨ Generar acta con IA</button>' +
      '<div id="act-gen"></div>' +
    '</div>' +
    '<div class="act-modal-ft"><button class="act-btn" onclick="document.getElementById(\'act-modal\').remove()">Cancelar</button>' +
      '<button class="act-btn act-btn-primary" onclick="window._actGuardar(this)">Guardar acta</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });
  _actRenderGen();
};

window._actVoz = function () {
  try {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("Reconocimiento de voz no disponible en este navegador"); return; }
    var btn = document.getElementById("act-voz-btn");
    var ta = document.getElementById("act-f-notas");
    if (_actSR) { _actSR.stop(); _actSR = null; if (btn) btn.textContent = "🎙️ Dictar"; return; }
    _actSR = new SR();
    _actSR.lang = "es-ES";
    _actSR.continuous = true;
    _actSR.interimResults = false;
    _actSR.onresult = function (e) {
      var t = "";
      for (var i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript + " ";
      if (ta) ta.value += t;
    };
    _actSR.onerror = function () { _actSR = null; if (btn) btn.textContent = "🎙️ Dictar"; };
    _actSR.onend = function () { _actSR = null; if (btn) btn.textContent = "🎙️ Dictar"; };
    _actSR.start();
    if (btn) btn.textContent = "⏹️ Detener";
  } catch (e) { _actSR = null; }
};

window._actGenerar = async function (btn) {
  var notas = (document.getElementById("act-f-notas").value || "").trim();
  if (notas.length < 20) { showToast("Escribe o dicta primero las notas de la reunión"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "✨ Generando…"; }
  var sys = "Eres el secretario de un centro educativo español. A partir de las notas en bruto de una reunión, " +
    "redacta un acta profesional. Devuelve EXCLUSIVAMENTE un JSON con esta forma: " +
    '{"resumen":"texto en prosa, 1-2 párrafos","acuerdos":["acuerdo 1","acuerdo 2"],"tareas":[{"tarea":"...","responsable":"nombre o cargo si se menciona, si no \'Por asignar\'","fecha":"texto del plazo o vacío"}]}. ' +
    "No inventes responsables ni datos que no estén en las notas. Usa lenguaje formal y claro. No incluyas nada fuera del JSON.";
  var out = await _actGemini(sys, notas);
  var parsed = _actParseJson(out);
  if (btn) { btn.disabled = false; btn.textContent = "✨ Generar acta con IA"; }
  if (!parsed) { showToast("No se pudo generar el acta. Inténtalo de nuevo."); return; }
  var d = window._actDraft;
  d.resumen = parsed.resumen || "";
  d.acuerdos = Array.isArray(parsed.acuerdos) ? parsed.acuerdos : [];
  d.tareas = Array.isArray(parsed.tareas) ? parsed.tareas.map(function (t) {
    return typeof t === "string" ? { tarea: t, responsable: "Por asignar", fecha: "" } : t;
  }) : [];
  _actRenderGen();
  showToast("✨ Acta generada — revísala y guarda");
};

function _actRenderGen() {
  var box = document.getElementById("act-gen");
  if (!box) return;
  var d = window._actDraft;
  if (!d.resumen && !(d.acuerdos || []).length && !(d.tareas || []).length) { box.innerHTML = ""; return; }
  var html = '<div class="act-gen-box">';
  if (d.resumen) html += '<div class="act-gen-sec"><div class="act-gen-h">Resumen</div>' +
    '<textarea class="act-in" rows="3" oninput="window._actDraft.resumen=this.value">' + _actEsc(d.resumen) + '</textarea></div>';
  if ((d.acuerdos || []).length) html += '<div class="act-gen-sec"><div class="act-gen-h">Acuerdos</div>' +
    '<ul class="act-gen-ul">' + d.acuerdos.map(function (a) { return '<li>' + _actEsc(a) + '</li>'; }).join("") + '</ul></div>';
  if ((d.tareas || []).length) html += '<div class="act-gen-sec"><div class="act-gen-h">Tareas</div>' +
    '<ul class="act-gen-ul">' + d.tareas.map(function (t) {
      return '<li><strong>' + _actEsc(t.tarea) + '</strong> — ' + _actEsc(t.responsable || "Por asignar") + (t.fecha ? " · " + _actEsc(t.fecha) : "") + '</li>';
    }).join("") + '</ul></div>';
  html += '</div>';
  box.innerHTML = html;
}

window._actGuardar = async function (btn) {
  var d = window._actDraft;
  var titulo = (document.getElementById("act-f-titulo").value || "").trim();
  if (!titulo) { showToast("Indica un título"); return; }
  var payload = {
    centro_id: window.ctrId,
    titulo: titulo,
    fecha: document.getElementById("act-f-fecha").value || _actHoy(),
    tipo: document.getElementById("act-f-tipo").value || "claustro",
    notas_raw: (document.getElementById("act-f-notas").value || "").trim() || null,
    resumen: d.resumen || null,
    acuerdos: d.acuerdos || [],
    tareas: d.tareas || [],
  };
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  var r;
  if (d.id) {
    r = await window.sb.from("actas_reunion").update(payload).eq("id", d.id);
  } else {
    payload.creado_por = window.currentUser && window.currentUser.id || null;
    r = await window.sb.from("actas_reunion").insert(payload);
  }
  if (r.error) { if (btn) { btn.disabled = false; btn.textContent = "Guardar acta"; } showToast("Error: " + r.error.message); return; }
  document.getElementById("act-modal").remove();
  showToast("✅ Acta guardada");
  _actCargar();
};

/* ── Ver acta ── */
window._actVer = async function (id) {
  var r = await window.sb.from("actas_reunion").select("*").eq("id", id).single();
  if (r.error || !r.data) { showToast("No disponible"); return; }
  var a = r.data;
  window._actDraft = a;
  var old = document.getElementById("act-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "act-modal";
  w.className = "act-ov";
  var acuerdos = (a.acuerdos || []).map(function (x) { return '<li>' + _actEsc(x) + '</li>'; }).join("");
  var tareas = (a.tareas || []).map(function (t) {
    return '<li><strong>' + _actEsc(t.tarea) + '</strong> — ' + _actEsc(t.responsable || "Por asignar") + (t.fecha ? " · " + _actEsc(t.fecha) : "") + '</li>';
  }).join("");
  w.innerHTML = '<div class="act-modal">' +
    '<div class="act-modal-hd"><h3>' + _actEsc(a.titulo) + '</h3><button class="act-x" onclick="document.getElementById(\'act-modal\').remove()">✕</button></div>' +
    '<div class="act-modal-bd">' +
      '<div class="act-card-meta" style="margin-bottom:14px">' + (_ACT_TIPOS[a.tipo] || "Reunión") + ' · ' + _actFmt(a.fecha) + '</div>' +
      (a.resumen ? '<div class="act-gen-sec"><div class="act-gen-h">Resumen</div><p class="act-view-p">' + _actEsc(a.resumen) + '</p></div>' : '') +
      (acuerdos ? '<div class="act-gen-sec"><div class="act-gen-h">Acuerdos</div><ul class="act-gen-ul">' + acuerdos + '</ul></div>' : '') +
      (tareas ? '<div class="act-gen-sec"><div class="act-gen-h">Tareas</div><ul class="act-gen-ul">' + tareas + '</ul></div>' : '') +
      (!a.resumen && !acuerdos && !tareas && a.notas_raw ? '<div class="act-gen-sec"><div class="act-gen-h">Notas</div><p class="act-view-p">' + _actEsc(a.notas_raw) + '</p></div>' : '') +
    '</div>' +
    '<div class="act-modal-ft">' +
      '<button class="act-btn act-btn-danger" onclick="window._actBorrar(\'' + a.id + '\')">Eliminar</button>' +
      '<button class="act-btn" onclick="window._actPDF(\'' + a.id + '\')">📄 PDF</button>' +
      '<button class="act-btn act-btn-primary" onclick="document.getElementById(\'act-modal\').remove();window._actNueva(window._actDraft)">Editar</button>' +
    '</div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });
};

window._actBorrar = async function (id) {
  if (!confirm("¿Eliminar esta acta?")) return;
  var r = await window.sb.from("actas_reunion").delete().eq("id", id);
  if (r.error) { showToast("Error: " + r.error.message); return; }
  var m = document.getElementById("act-modal"); if (m) m.remove();
  showToast("Acta eliminada");
  _actCargar();
};

window._actPDF = async function (id) {
  var a = window._actDraft;
  if (!a || a.id !== id) { var r = await window.sb.from("actas_reunion").select("*").eq("id", id).single(); a = r.data; }
  if (!a) return;
  if (typeof _infEnsureLibs === "function") { try { await _infEnsureLibs(); } catch (e) {} }
  if (typeof window.jspdf === "undefined") { showToast("No se pudo cargar el generador de PDF"); return; }
  var doc = new window.jspdf.jsPDF();
  var info = (typeof _infCentroInfo === "function") ? await _infCentroInfo() : { nombre: "", color: "#505050" };
  var rgb = (typeof _infHexToRgb === "function") ? _infHexToRgb(info.color) : { r: 80, g: 80, b: 80 };
  doc.setFillColor(rgb.r, rgb.g, rgb.b); doc.rect(0, 0, 210, 4, "F");
  doc.setFontSize(16); doc.setTextColor(30, 30, 30);
  doc.text("ACTA — " + (a.titulo || ""), 14, 20);
  doc.setFontSize(10); doc.setTextColor(110, 110, 110);
  doc.text((info.nombre || "") + "  ·  " + (_ACT_TIPOS[a.tipo] || "Reunión") + "  ·  " + _actFmt(a.fecha), 14, 27);
  var y = 38;
  var wrap = function (label, text) {
    doc.setFontSize(12); doc.setTextColor(30, 30, 30); doc.text(label, 14, y); y += 7;
    doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    var lines = doc.splitTextToSize(text, 182);
    lines.forEach(function (l) { if (y > 280) { doc.addPage(); y = 20; } doc.text(l, 14, y); y += 5.5; });
    y += 4;
  };
  if (a.resumen) wrap("Resumen", a.resumen);
  if ((a.acuerdos || []).length) wrap("Acuerdos", a.acuerdos.map(function (x, i) { return (i + 1) + ". " + x; }).join("\n"));
  if ((a.tareas || []).length) wrap("Tareas", a.tareas.map(function (t) {
    return "• " + t.tarea + " — " + (t.responsable || "Por asignar") + (t.fecha ? " (" + t.fecha + ")" : "");
  }).join("\n"));
  doc.save("acta_" + (a.fecha || "") + ".pdf");
};

/* ── CSS ── */
function _actEnsureStyles() {
  if (document.getElementById("act-styles")) return;
  var s = document.createElement("style");
  s.id = "act-styles";
  s.textContent = [
    ".act-page{display:flex;flex-direction:column;height:100%;overflow:auto;}",
    ".act-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:22px 28px 16px;border-bottom:1px solid var(--line);}",
    ".act-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}",
    ".act-title{font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--txt);margin:0 0 2px;}",
    ".act-sub{font-size:13px;color:var(--muted);margin:0;max-width:520px;}",
    ".act-list-wrap{padding:18px 28px 40px;}",
    ".act-loading,.act-empty{text-align:center;padding:50px 20px;color:var(--muted);font-size:14px;}",
    ".act-card{display:flex;align-items:center;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:10px;cursor:pointer;}",
    ".act-card:hover{background:var(--surface-sunk);}",
    ".act-card-main{flex:1;min-width:0;}",
    ".act-card-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
    ".act-tipo{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#fff;background:var(--ink);padding:3px 9px;border-radius:20px;}",
    ".act-card-ttl{font-weight:600;font-size:15px;color:var(--txt);}",
    ".act-card-meta{font-size:12px;color:var(--muted);margin-top:4px;}",
    ".act-card-arr{color:var(--muted-2);font-size:18px;}",
    ".act-ov{position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}",
    ".act-modal{background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:600px;max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--line);}",
    ".act-modal-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);flex:0 0 auto;}",
    ".act-modal-hd h3{margin:0;font-size:17px;font-weight:700;color:var(--txt);}",
    ".act-x{background:none;border:none;font-size:16px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".act-x:hover{background:var(--surface-sunk);}",
    ".act-modal-bd{padding:16px 20px;overflow:auto;flex:1;}",
    ".act-fl{display:block;font-size:12px;font-weight:600;color:var(--txt2);margin:10px 0 4px;}",
    ".act-in{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line-2);border-radius:8px;font-size:14px;font-family:inherit;background:var(--paper);color:var(--txt);}",
    ".act-in:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px var(--ink-ll);}",
    ".act-notas-hd{display:flex;align-items:center;justify-content:space-between;margin-top:6px;}",
    ".act-btn{padding:8px 14px;border-radius:8px;border:1px solid var(--line-2);background:var(--paper);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".act-btn:hover{background:var(--surface-sunk);}",
    ".act-btn-sm{padding:5px 10px;font-size:12px;}",
    ".act-btn-primary{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".act-btn-danger{color:var(--danger);}",
    ".act-btn-ia{width:100%;margin-top:10px;background:var(--accent-soft);color:var(--accent-ink);border-color:var(--accent-soft);}",
    ".act-gen-box{margin-top:14px;border-top:1px dashed var(--line-2);padding-top:12px;}",
    ".act-gen-sec{margin-bottom:14px;}",
    ".act-gen-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:6px;}",
    ".act-gen-ul{margin:0;padding-left:18px;font-size:13.5px;color:var(--txt2);line-height:1.6;}",
    ".act-view-p{font-size:14px;color:var(--txt2);line-height:1.6;margin:0;white-space:pre-wrap;}",
    ".act-modal-ft{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line);flex:0 0 auto;flex-wrap:wrap;}",
    "@media(max-width:768px){.act-hdr{padding:16px;}.act-list-wrap{padding:14px 16px 40px;}}",
  ].join("");
  document.head.appendChild(s);
}
