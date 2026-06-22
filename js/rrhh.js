// ── RRHH — GESTIÓN DE AUSENCIAS ──

let _rrhhAusencias    = [];
let _rrhhProfesores   = [];
let _rrhhFiltroEstado = "pendiente";
let _rrhhMiProfileId  = null;

const AUSENCIA_TIPOS = {
  baja_medica:   "🏥 Baja médica",
  permiso:       "📋 Permiso",
  asunto_propio: "🗂️ Asunto propio",
  formacion:     "📚 Formación",
  sindical:      "⚖️ Sindical",
  otros:         "📝 Otros"
};

function _badgeEstado(estado) {
  switch (estado) {
    case "aprobada":  return '<span style="background:#e8f5e9;color:#1e6b3a;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;">✓ Aprobada</span>';
    case "rechazada": return '<span style="background:#fde8e8;color:#b83232;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;">✕ Rechazada</span>';
    default:          return '<span style="background:#fff9c4;color:#f57f17;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:500;">⏳ Pendiente</span>';
  }
}

async function loadRrhhPanel() {
  if (role === "admin" || role === "superadmin") {
    await _renderRrhhAdmin();
  } else {
    await _renderRrhhProfesor();
  }
}

// ─── VISTA PROFESOR ───────────────────────────────────────────────────────────

async function _renderRrhhProfesor() {
  var container = document.getElementById("rrhh-container");
  if (!container) return;

  if (!_rrhhMiProfileId) {
    var res = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
    _rrhhMiProfileId = res.data ? res.data.id : null;
  }

  container.innerHTML =
    '<div class="pg-hdr">' +
      '<div><div class="pg-title">Mis ausencias</div>' +
        '<div class="pg-sub">Historial administrativo — aprobaciones de dirección</div></div>' +
    '</div>' +

    '<div style="background:var(--ink-ll);border:1px solid var(--ink-l);border-radius:var(--r-sm);' +
        'padding:12px 16px;margin-bottom:18px;font-size:13px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<span style="font-size:16px;">ℹ️</span>' +
      '<span>Para notificar una nueva ausencia ve a la pestaña ' +
        '<button onclick="showTab(\'sust\')" style="background:none;border:none;color:var(--ink);' +
          'font-weight:600;cursor:pointer;font-size:13px;text-decoration:underline;padding:0;">' +
          'Sustituciones</button> — registra la cobertura operativa y este expediente en un solo paso.' +
      '</span>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-hdr">' +
        '<div class="card-ico o">📅</div>' +
        '<div><div class="card-title">Historial de solicitudes</div>' +
          '<div class="card-desc">Estado de aprobación por dirección / secretaría</div></div>' +
      '</div>' +
      '<div id="rrhh-lista-prof">' +
        '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">' +
          '<span class="spin">⟳</span> Cargando…</div>' +
      '</div>' +
    '</div>';

  await _cargarMisAusencias();
}

function mostrarFormAusencia() {
  var w = document.getElementById("rrhh-form-wrap");
  if (w) w.style.display = "block";
  var msg = document.getElementById("rrhh-msg");
  if (msg) msg.style.display = "none";
}

function ocultarFormAusencia() {
  var w = document.getElementById("rrhh-form-wrap");
  if (w) w.style.display = "none";
}

async function _cargarMisAusencias() {
  if (!_rrhhMiProfileId) return;
  var lista = document.getElementById("rrhh-lista-prof");
  if (!lista) return;

  var result = await sb.from("ausencias_profesor")
    .select("*")
    .eq("centro_id", ctrId)
    .eq("profile_id", _rrhhMiProfileId)
    .order("fecha", { ascending: false });

  var data = result.data;
  var error = result.error;

  if (error || !data || !data.length) {
    lista.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:20px;">No tienes ausencias registradas.</div>';
    return;
  }

  var rows = data.map(function(a) {
    var fechaStr = (a.fecha_fin && a.fecha_fin !== a.fecha)
      ? a.fecha + " → " + a.fecha_fin
      : (a.fecha || "—");
    var nota = a.nota_resolucion || (a.estado === "rechazada" ? a.motivo_rechazo : "");
    var notaCol = a.estado === "rechazada" ? "var(--red)" : "var(--txt2)";
    var notaInfo = nota
      ? '<div style="font-size:11px;color:' + notaCol + ';margin-top:3px;white-space:pre-wrap;">' + _rrhhEscH(nota) + '</div>'
      : "";
    return '<tr>' +
      '<td>' + fechaStr + '</td>' +
      '<td style="font-size:12px;">' + (AUSENCIA_TIPOS[a.tipo] || a.tipo || "—") + '</td>' +
      '<td style="font-size:12px;color:var(--txt3);">' + (a.motivo || "—") + '</td>' +
      '<td>' + _badgeEstado(a.estado || "pendiente") + notaInfo + '</td>' +
      '</tr>';
  }).join("");

  lista.innerHTML =
    '<div style="overflow-x:auto;"><table class="tbl">' +
    '<thead><tr><th>Fechas</th><th>Tipo</th><th>Motivo</th><th>Estado</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}

async function solicitarAusencia() {
  var fechaIni = document.getElementById("rrhh-fecha-ini") ? document.getElementById("rrhh-fecha-ini").value : "";
  var fechaFin = document.getElementById("rrhh-fecha-fin") ? document.getElementById("rrhh-fecha-fin").value : "";
  var tipo     = document.getElementById("rrhh-tipo") ? document.getElementById("rrhh-tipo").value : "asunto_propio";
  var motivo   = document.getElementById("rrhh-motivo") ? document.getElementById("rrhh-motivo").value.trim() : "";
  var msg      = document.getElementById("rrhh-msg");
  if (!msg) return;

  if (!fechaIni || !fechaFin) {
    msg.textContent = "Indica las fechas de inicio y fin.";
    msg.style.cssText = "display:block;color:var(--red);font-size:13px;";
    return;
  }
  if (fechaFin < fechaIni) {
    msg.textContent = "La fecha fin no puede ser anterior a la de inicio.";
    msg.style.cssText = "display:block;color:var(--red);font-size:13px;";
    return;
  }

  msg.textContent = "⟳ Enviando solicitud…";
  msg.style.cssText = "display:block;color:var(--txt2);font-size:13px;";

  var result = await sb.from("ausencias_profesor").insert({
    centro_id:     ctrId,
    profile_id:    _rrhhMiProfileId,
    fecha:         fechaIni,
    fecha_fin:     fechaFin,
    tipo:          tipo,
    motivo:        motivo || null,
    estado:        "pendiente",
    trimestre:     _getTrimestreActual(),
    curso_escolar: _getCursoEscolar()
  });

  if (result.error) {
    msg.textContent = "Error: " + result.error.message;
    msg.style.cssText = "display:block;color:var(--red);font-size:13px;";
    return;
  }

  msg.textContent = "✅ Solicitud enviada correctamente. Pendiente de aprobación.";
  msg.style.cssText = "display:block;background:var(--ink-ll);color:var(--ink);border-radius:var(--r-sm);padding:8px 12px;font-size:13px;";

  var motivoEl = document.getElementById("rrhh-motivo");
  if (motivoEl) motivoEl.value = "";
  setTimeout(ocultarFormAusencia, 2000);
  await _cargarMisAusencias();
}

// ─── VISTA ADMIN/JEFATURA ─────────────────────────────────────────────────────

async function _renderRrhhAdmin() {
  var container = document.getElementById("rrhh-container");
  if (!container) return;

  var profsResult = await sb.from("profiles")
    .select("id, full_name")
    .eq("centro_id", ctrId)
    .eq("rol", "profesional")
    .order("full_name");
  _rrhhProfesores = profsResult.data || [];

  var profOpts = _rrhhProfesores.map(function(p) {
    return '<option value="' + p.id + '">' + (p.full_name || p.id) + '</option>';
  }).join("");

  var estadosBtns = ["pendiente", "aprobada", "rechazada", "todas"].map(function(e) {
    var labels = { pendiente: "⏳ Pendientes", aprobada: "✓ Aprobadas", rechazada: "✕ Rechazadas", todas: "Todas" };
    var activo = e === _rrhhFiltroEstado;
    var badge = e === "pendiente"
      ? ' <span id="rrhh-badge-n" style="background:rgba(255,255,255,0.25);border-radius:10px;padding:1px 6px;margin-left:3px;">…</span>'
      : "";
    return '<button id="rrhh-btn-' + e + '" onclick="filtrarRrhh(\'' + e + '\')" style="' +
      'background:' + (activo ? 'var(--ink)' : 'var(--srf2)') + ';' +
      'color:' + (activo ? '#fff' : 'var(--txt2)') + ';' +
      'border:1px solid ' + (activo ? 'var(--ink)' : 'var(--bdr)') + ';' +
      'border-radius:20px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:' + (activo ? 600 : 400) + ';">' +
      labels[e] + badge + '</button>';
  }).join("");

  container.innerHTML =
    '<div class="pg-hdr">' +
      '<div>' +
        '<div class="pg-title">Gestión de ausencias</div>' +
        '<div class="pg-sub">Revisión y aprobación de solicitudes del profesorado</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<label style="font-size:11px;color:var(--txt3);display:flex;align-items:center;gap:5px;" title="Normativa que aplica el copiloto de IA al evaluar permisos">⚖️ Régimen' +
          '<select class="fi" id="rrhh-regimen" style="width:auto;font-size:12px;padding:5px 8px;" onchange="_rrhhSetRegimen(this.value)">' +
            '<option value="concertada">Concertada</option>' +
            '<option value="privada">Privada</option>' +
            '<option value="funcionario">Funcionario (pública)</option>' +
          '</select></label>' +
        '<button class="btn btn-s" onclick="exportarRrhhExcel()">📥 Exportar</button>' +
        '<button class="btn btn-p" onclick="window.agenteRRHH && agenteRRHH()" style="background:var(--accent,#C76B3D);">🤖 Agente: evaluar pendientes</button>' +
        '<button class="btn btn-s" onclick="_cargarAusenciasAdmin()">↺ Actualizar</button>' +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' + estadosBtns + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">' +
        '<select class="fi" id="rrhh-filter-prof" style="width:auto;min-width:200px;" onchange="_renderAusenciasAdminLista()">' +
          '<option value="">Todos los profesores</option>' + profOpts +
        '</select>' +
        '<input class="fi" type="date" id="rrhh-filter-fecha" style="width:auto;" onchange="_renderAusenciasAdminLista()" />' +
        '<button class="btn btn-s" style="font-size:12px;" onclick="_limpiarFiltrosRrhh()">✕ Limpiar</button>' +
      '</div>' +
      '<div id="rrhh-admin-lista">' +
        '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;"><span class="spin">⟳</span> Cargando…</div>' +
      '</div>' +
    '</div>';

  var rs = document.getElementById("rrhh-regimen");
  if (rs) rs.value = _rrhhGetRegimen();
  await _cargarAusenciasAdmin();
}

/* ── Copiloto legal de RRHH (IA orientativa) ─────────────────────────── */
var _RRHH_REGIMENES = {
  concertada: "Convenio colectivo de empresas de enseñanza privada sostenidas total o parcialmente con fondos públicos (centros CONCERTADOS)",
  privada:    "Convenio colectivo nacional de centros de enseñanza privada de régimen general o enseñanza reglada sin financiación pública (centros PRIVADOS)",
  funcionario:"Normativa de función pública docente: EBEP (RDL 5/2015), normativa autonómica de personal docente y, en su caso, el régimen de permisos y licencias del funcionariado",
};
function _rrhhGetRegimen() {
  try { return localStorage.getItem("rrhh_regimen_" + ctrId) || "concertada"; } catch (e) { return "concertada"; }
}
window._rrhhSetRegimen = function (v) {
  try { localStorage.setItem("rrhh_regimen_" + ctrId, v); } catch (e) {}
};

async function _rrhhGeminiLegal(systemPrompt, userMsg) {
  try {
    var r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY, "apikey": ANON_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        system_prompt: systemPrompt,
        centro_id: ctrId || "",
        role: "familia",  // fuerza texto (sin function calling)
        user_name: (typeof currentUserName !== "undefined" ? currentUserName : ""),
        user_id: (window.currentUser ? window.currentUser.id : ""),
      }),
    });
    if (!r.ok) return null;
    var j = await r.json();
    return j.type === "text" ? j.text : null;
  } catch (e) { return null; }
}
function _rrhhParseJson(txt) {
  if (!txt) return null;
  try {
    var c = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
    var a = c.indexOf("{"), b = c.lastIndexOf("}");
    if (a >= 0 && b > a) c = c.slice(a, b + 1);
    return JSON.parse(c);
  } catch (e) { return null; }
}
function _rrhhEscH(s) { return escH(s); } // delegado a utils.js
function _rrhhDias(a) {
  try {
    var d1 = new Date(a.fecha + "T12:00:00"), d2 = new Date((a.fecha_fin || a.fecha) + "T12:00:00");
    return Math.round((d2 - d1) / 86400000) + 1;
  } catch (e) { return 1; }
}

window._rrhhEvaluarIA = async function (id) {
  var a = (_rrhhAusencias || []).find(function (x) { return String(x.id) === String(id); });
  if (!a) { alert("Solicitud no encontrada."); return; }
  _rrhhEnsureStyles();
  var regimen = _rrhhGetRegimen();
  var dias = _rrhhDias(a);
  var old = document.getElementById("rrhh-ia-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "rrhh-ia-modal";
  w.className = "ria-ov";
  w.innerHTML = '<div class="ria-modal">' +
    '<div class="ria-hd"><div><div class="ria-eyebrow">RRHH · COPILOTO LEGAL</div>' +
      '<h3 class="ria-ttl">Evaluación de permiso</h3></div>' +
      '<button class="ria-x" onclick="document.getElementById(\'rrhh-ia-modal\').remove()">✕</button></div>' +
    '<div class="ria-bd">' +
      '<div class="ria-req">' +
        '<div><strong>' + _rrhhEscH(a._nombre || "Profesor") + '</strong></div>' +
        '<div class="ria-meta">' + (AUSENCIA_TIPOS[a.tipo] || a.tipo || "—") + ' · ' +
          _rrhhEscH(a.fecha) + (a.fecha_fin && a.fecha_fin !== a.fecha ? " → " + _rrhhEscH(a.fecha_fin) : "") +
          ' · ' + dias + ' día' + (dias !== 1 ? "s" : "") + '</div>' +
        (a.motivo ? '<div class="ria-motivo">“' + _rrhhEscH(a.motivo) + '”</div>' : '') +
      '</div>' +
      '<label class="ria-fl">Normativa aplicable</label>' +
      '<select class="ria-sel" id="ria-regimen">' +
        ['concertada','privada','funcionario'].map(function (k) {
          var lbl = k === "concertada" ? "Escuela concertada" : k === "privada" ? "Escuela privada" : "Funcionario (escuela pública)";
          return '<option value="' + k + '"' + (k === regimen ? " selected" : "") + '>' + lbl + '</option>';
        }).join("") +
      '</select>' +
      '<button class="ria-btn ria-btn-ia" id="ria-go" onclick="window._rrhhLanzarEval(\'' + id + '\')">✨ Analizar con IA</button>' +
      '<div id="ria-out"></div>' +
    '</div>' +
    '<div class="ria-ft">' +
      '<div class="ria-disc">Recomendación orientativa generada por IA. <strong>No es vinculante</strong>; la decisión corresponde a dirección/secretaría.</div>' +
    '</div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });
};

window._rrhhLanzarEval = async function (id) {
  var a = (_rrhhAusencias || []).find(function (x) { return String(x.id) === String(id); });
  if (!a) return;
  var regSel = document.getElementById("ria-regimen");
  var regimen = regSel ? regSel.value : _rrhhGetRegimen();
  _rrhhSetRegimen(regimen);
  var out = document.getElementById("ria-out");
  var go = document.getElementById("ria-go");
  if (go) { go.disabled = true; go.textContent = "✨ Analizando normativa…"; }
  if (out) out.innerHTML = '<div class="ria-load">Consultando la normativa aplicable…</div>';

  var dias = _rrhhDias(a);
  var sys = "Eres un asistente jurídico-laboral experto en la normativa española de permisos y licencias del personal docente. " +
    "Evalúa la solicitud conforme a esta normativa: " + (_RRHH_REGIMENES[regimen] || regimen) + ". " +
    "Emite una recomendación ORIENTATIVA (no vinculante). Sé prudente: si faltan datos, el motivo es ambiguo o el caso depende de circunstancias no acreditadas, recomienda \"revisar\". " +
    "NO inventes números de artículo exactos si no estás seguro; usa referencias genéricas y márcalo en 'alerta'. " +
    "Responde EXCLUSIVAMENTE con un JSON: {\"recomendacion\":\"aprobar|denegar|revisar\",\"permiso_tipo\":\"retribuido|no_retribuido|deber_inexcusable|baja_it|otro\",\"fundamento\":\"referencia orientativa al artículo/convenio\",\"requisitos\":[\"...\"],\"dias\":\"cómputo o límite aplicable\",\"explicacion\":\"1-3 frases\",\"alerta\":\"qué debe verificar dirección manualmente, o cadena vacía\"}";
  var userMsg = "Solicitud de ausencia de un docente. Tipo: " + (AUSENCIA_TIPOS[a.tipo] || a.tipo) +
    ". Motivo indicado: " + (a.motivo || "(no especificado)") +
    ". Fechas: " + a.fecha + (a.fecha_fin && a.fecha_fin !== a.fecha ? " a " + a.fecha_fin : "") +
    " (" + dias + " día(s) naturales). Evalúa si procede conceder el permiso, su naturaleza (retribuido o no) y los requisitos.";

  var resp = await _rrhhGeminiLegal(sys, userMsg);
  var j = _rrhhParseJson(resp);
  if (go) { go.disabled = false; go.textContent = "✨ Volver a analizar"; }
  if (!j) {
    if (out) out.innerHTML = '<div class="ria-err">No se pudo generar la evaluación. Inténtalo de nuevo.</div>';
    return;
  }
  var rec = (j.recomendacion || "revisar").toLowerCase();
  var col = rec === "aprobar" ? ["#1e6b3a", "#e8f5e9", "✓ Recomendación: APROBAR"]
          : rec === "denegar" ? ["#b83232", "#fde8e8", "✕ Recomendación: DENEGAR"]
          : ["#9a6a1a", "#fff7e0", "⚠ Recomendación: REVISAR manualmente"];
  var reqs = Array.isArray(j.requisitos) ? j.requisitos.filter(Boolean) : [];
  var html = '<div class="ria-rec" style="background:' + col[1] + ';color:' + col[0] + ';">' + col[2] + '</div>' +
    '<div class="ria-grid">' +
      (j.permiso_tipo ? '<div class="ria-cell"><span>Naturaleza</span>' + _rrhhEscH(j.permiso_tipo).replace(/_/g, " ") + '</div>' : '') +
      (j.dias ? '<div class="ria-cell"><span>Días/cómputo</span>' + _rrhhEscH(j.dias) + '</div>' : '') +
    '</div>' +
    (j.explicacion ? '<p class="ria-exp">' + _rrhhEscH(j.explicacion) + '</p>' : '') +
    (j.fundamento ? '<div class="ria-fund"><span>Fundamento (orientativo)</span>' + _rrhhEscH(j.fundamento) + '</div>' : '') +
    (reqs.length ? '<div class="ria-reqs"><span>Requisitos</span><ul>' + reqs.map(function (x) { return '<li>' + _rrhhEscH(x) + '</li>'; }).join("") + '</ul></div>' : '') +
    (j.alerta ? '<div class="ria-alert">⚠ ' + _rrhhEscH(j.alerta) + '</div>' : '') +
    '<label class="ria-fl" style="margin-top:14px;">✉️ Mensaje que recibirá el profesor (editable)</label>' +
    '<textarea id="ria-msg" class="ria-sel" rows="4" style="resize:vertical;line-height:1.45;">' + _rrhhEscH(_rrhhComponerMensaje(j)) + '</textarea>' +
    '<div class="ria-actions">' +
      '<button class="ria-btn ria-btn-ok" onclick="window._rrhhResolver(\'' + id + '\',\'aprobar\')">✓ Aprobar y enviar</button>' +
      '<button class="ria-btn ria-btn-no" onclick="window._rrhhResolver(\'' + id + '\',\'rechazar\')">✕ Rechazar y enviar</button>' +
    '</div>';
  if (out) out.innerHTML = html;
};

// Compone el mensaje (editable) que recibirá el profesor a partir de la evaluación IA.
function _rrhhComponerMensaje(j) {
  var partes = [];
  if (j.explicacion) partes.push(j.explicacion);
  if (j.fundamento) partes.push("Fundamento: " + j.fundamento);
  var reqs = Array.isArray(j.requisitos) ? j.requisitos.filter(Boolean) : [];
  if (reqs.length) partes.push("Requisitos: " + reqs.join("; "));
  return partes.join("\n");
}

// Núcleo: aplica la resolución (estado + mensaje al profesor + sustituciones + push).
// Devuelve true/false. NO toca la UI (lo hace quien lo llama).
async function _rrhhAplicar(id, accion, mensaje) {
  var a = (_rrhhAusencias || []).find(function (x) { return String(x.id) === String(id); });
  if (!a) return false;
  if (accion === "aprobar" && a.estado === "aprobada") return false;
  var payload = accion === "aprobar"
    ? { estado: "aprobada", aprobada_por: currentUser.id, nota_resolucion: mensaje || null }
    : { estado: "rechazada", motivo_rechazo: mensaje || null, nota_resolucion: mensaje || null };
  var upd = await sb.from("ausencias_profesor").update(payload).eq("id", id);
  if (upd.error) { return false; }
  if (accion === "aprobar") {
    var nombreProf = await _getNombreProfesor(a.profile_id);
    if (nombreProf) { try { await _crearSustituciones(a, nombreProf); } catch (e) {} }
  }
  _rrhhNotificarProfesor(a, accion === "aprobar" ? "aprobada" : "rechazada", mensaje);
  return true;
}

// Aprueba/rechaza desde el modal individual (lee el textarea editable).
window._rrhhResolver = async function (id, accion) {
  var a = (_rrhhAusencias || []).find(function (x) { return String(x.id) === String(id); });
  if (!a) return;
  if (accion === "aprobar" && a.estado === "aprobada") { alert("Esta ausencia ya estaba aprobada."); return; }
  var ta = document.getElementById("ria-msg");
  var mensaje = ta ? ta.value.trim() : "";
  var ok = await _rrhhAplicar(id, accion, mensaje);
  if (!ok) { alert("No se pudo aplicar la resolución."); return; }
  var m = document.getElementById("rrhh-ia-modal"); if (m) m.remove();
  if (typeof showToast === "function") showToast(accion === "aprobar" ? "✅ Aprobada y notificada al profesor" : "Rechazada y notificada al profesor");
  await _cargarAusenciasAdmin();
};

// Notifica al profesor la resolución de su ausencia (push, fire-and-forget).
async function _rrhhNotificarProfesor(a, estado, mensaje) {
  try {
    if (!a || !a.profile_id) return;
    var titulo = estado === "aprobada" ? "✅ Ausencia aprobada" : "❌ Ausencia no aprobada";
    var base = (estado === "aprobada" ? "Tu solicitud del " + a.fecha + " ha sido aprobada." : "Tu solicitud del " + a.fecha + " no ha sido aprobada.");
    var body = base + (mensaje ? " " + mensaje.replace(/\s+/g, " ").slice(0, 160) : "");
    await fetch(SB_URL + "/functions/v1/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY, "apikey": ANON_KEY },
      body: JSON.stringify({ user_ids: [a.profile_id], title: titulo, body: body, tag: "rrhh", url: "/app.html" }),
    });
  } catch (e) {}
}

function _rrhhEnsureStyles() {
  if (document.getElementById("ria-styles")) return;
  var s = document.createElement("style");
  s.id = "ria-styles";
  s.textContent = [
    ".ria-ov{position:fixed;inset:0;background:rgba(20,20,30,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;}",
    ".ria-modal{background:var(--paper,#fff);border-radius:14px;max-width:520px;width:100%;border:1px solid var(--line,#e0e0e0);box-shadow:0 24px 70px rgba(0,0,0,.32);}",
    ".ria-hd{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--line,#e0e0e0);}",
    ".ria-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#888);margin-bottom:3px;}",
    ".ria-ttl{margin:0;font-size:18px;font-weight:700;color:var(--txt,#222);font-family:var(--font-display,inherit);}",
    ".ria-x{background:none;border:none;font-size:17px;color:var(--muted,#888);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".ria-bd{padding:18px 22px;}",
    ".ria-req{background:var(--surface-sunk,#f2f1ec);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;}",
    ".ria-meta{font-size:12px;color:var(--muted,#888);margin-top:3px;}",
    ".ria-motivo{font-size:12.5px;color:var(--txt2,#555);font-style:italic;margin-top:6px;}",
    ".ria-fl{display:block;font-size:12px;font-weight:600;color:var(--txt2,#555);margin:6px 0 4px;}",
    ".ria-sel{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line-2,#ccc);border-radius:8px;font-size:14px;background:var(--paper,#fff);}",
    ".ria-btn{padding:9px 14px;border-radius:8px;border:1px solid var(--line-2,#ccc);background:var(--paper,#fff);color:var(--txt2,#555);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".ria-btn-ia{width:100%;margin-top:12px;background:var(--accent-soft,#f3e1d5);color:var(--accent-ink,#7A3E1F);border-color:var(--accent-soft,#f3e1d5);}",
    ".ria-btn-ia:disabled{opacity:.7;cursor:default;}",
    ".ria-load,.ria-err{text-align:center;padding:20px;color:var(--muted,#888);font-size:13px;}",
    ".ria-err{color:#b83232;}",
    ".ria-rec{margin-top:16px;border-radius:10px;padding:11px 14px;font-weight:700;font-size:14px;text-align:center;}",
    ".ria-grid{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;}",
    ".ria-cell{flex:1;min-width:120px;background:var(--surface-sunk,#f2f1ec);border-radius:8px;padding:9px 11px;font-size:13px;text-transform:capitalize;}",
    ".ria-cell span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#888);margin-bottom:3px;}",
    ".ria-exp{font-size:13.5px;color:var(--txt,#222);line-height:1.5;margin:12px 0;}",
    ".ria-fund{font-size:12.5px;color:var(--txt2,#555);background:var(--surface-sunk,#f2f1ec);border-radius:8px;padding:9px 11px;margin-bottom:10px;}",
    ".ria-fund span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#888);margin-bottom:3px;}",
    ".ria-reqs{font-size:12.5px;color:var(--txt2,#555);margin-bottom:10px;}",
    ".ria-reqs span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#888);margin-bottom:3px;}",
    ".ria-reqs ul{margin:0;padding-left:18px;line-height:1.6;}",
    ".ria-alert{background:#fff7e0;color:#9a6a1a;border-radius:8px;padding:9px 12px;font-size:12.5px;margin-bottom:10px;}",
    ".ria-actions{display:flex;gap:10px;margin-top:16px;}",
    ".ria-btn-ok{flex:1;background:#e8f5e9;color:#1e6b3a;border-color:#cfe8d3;}",
    ".ria-btn-no{flex:1;background:#fde8e8;color:#b83232;border-color:#f5cccc;}",
    ".ria-ft{padding:12px 22px;border-top:1px solid var(--line,#e0e0e0);display:flex;justify-content:flex-end;}",
    ".ria-disc{font-size:11px;color:var(--muted,#888);line-height:1.5;}",
    ".rag-bot{width:38px;height:38px;border-radius:11px;background:var(--accent-soft,#f3e1d5);display:flex;align-items:center;justify-content:center;font-size:20px;flex:0 0 auto;}",
    ".rag-card{border:1px solid var(--line,#e0e0e0);border-radius:12px;padding:14px 16px;margin-bottom:12px;}",
    ".rag-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}",
    ".rag-badge{font-size:11px;font-weight:700;padding:3px 11px;border-radius:20px;flex:0 0 auto;}",
    ".rag-exp{font-size:13px;color:var(--txt,#222);line-height:1.5;margin:9px 0;}",
    ".rag-msg{margin-top:6px;resize:vertical;line-height:1.4;}",
    ".rag-actions{display:flex;gap:10px;margin-top:10px;}",
    ".rag-resuelto{font-size:13px;font-weight:700;}",
  ].join("");
  document.head.appendChild(s);
}

/* ════════ AGENTE RRHH — evalúa TODAS las pendientes y monta la bandeja ════════ */
// Carga las ausencias en _rrhhAusencias sin depender del DOM del panel (para que
// el agente funcione lanzado desde el panel "Agentes").
async function _rrhhEnsureData() {
  if (_rrhhAusencias && _rrhhAusencias.length) return;
  var result = await sb.from("ausencias_profesor").select("*").eq("centro_id", ctrId)
    .order("fecha", { ascending: false }).limit(300);
  var ausencias = result.data || [];
  var ids = [];
  ausencias.forEach(function (a) { if (a.profile_id && ids.indexOf(a.profile_id) === -1) ids.push(a.profile_id); });
  var map = {};
  if (ids.length) {
    var p = await sb.from("profiles").select("id, full_name").in("id", ids);
    (p.data || []).forEach(function (x) { map[x.id] = x.full_name || "—"; });
  }
  _rrhhAusencias = ausencias.map(function (a) { return Object.assign({}, a, { _nombre: map[a.profile_id] || "—" }); });
}

window.agenteRRHH = async function () {
  _rrhhEnsureStyles();
  await _rrhhEnsureData();
  var pend = (_rrhhAusencias || []).filter(function (a) { return !a.estado || a.estado === "pendiente"; });
  var regimen = _rrhhGetRegimen();
  var old = document.getElementById("rrhh-ag-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "rrhh-ag-modal";
  w.className = "ria-ov";
  w.innerHTML = '<div class="ria-modal" style="max-width:640px;">' +
    '<div class="ria-hd"><div style="display:flex;gap:11px;align-items:center;"><div class="rag-bot">🤖</div>' +
      '<div><div class="ria-eyebrow">AGENTE DE RRHH · PERMISOS</div><h3 class="ria-ttl">Bandeja de permisos</h3></div></div>' +
      '<button class="ria-x" onclick="document.getElementById(\'rrhh-ag-modal\').remove()">✕</button></div>' +
    '<div class="ria-bd" id="rag-bd"><div class="ria-load">🤖 Evaluando ' + pend.length + ' solicitud(es) contra la normativa…</div></div>' +
    '<div class="ria-ft" id="rag-ft"><div class="ria-disc">El agente evalúa con la normativa de <strong>' +
      (regimen === "concertada" ? "escuela concertada" : regimen === "privada" ? "escuela privada" : "función pública (EBEP)") +
      '</strong>. Recomendaciones orientativas; la decisión es tuya.</div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });

  if (!pend.length) {
    document.getElementById("rag-bd").innerHTML = '<div class="ria-load">✅ No hay solicitudes pendientes de resolver.</div>';
    document.getElementById("rag-ft").innerHTML = "";
    return;
  }

  window._ragEval = {};
  var bd = document.getElementById("rag-bd");
  for (var i = 0; i < pend.length; i++) {
    var a = pend[i];
    bd.innerHTML = '<div class="ria-load">🤖 Evaluando ' + (i + 1) + ' / ' + pend.length + ' (' + _rrhhEscH(a._nombre || "profesor") + ')…</div>';
    var j = await _rrhhEvaluarUna(a, regimen);
    window._ragEval[a.id] = j;
  }
  _ragRender(pend);
};

async function _rrhhEvaluarUna(a, regimen) {
  var dias = _rrhhDias(a);
  var sys = "Eres un asistente jurídico-laboral experto en permisos y licencias del personal docente en España. " +
    "Evalúa la solicitud conforme a: " + (_RRHH_REGIMENES[regimen] || regimen) + ". Recomendación ORIENTATIVA, no vinculante. " +
    "Sé prudente: si faltan datos o es dudoso, recomienda \"revisar\". No inventes artículos exactos; usa referencias genéricas y márcalo en 'alerta'. " +
    "Responde SOLO con JSON: {\"recomendacion\":\"aprobar|denegar|revisar\",\"permiso_tipo\":\"retribuido|no_retribuido|deber_inexcusable|baja_it|otro\",\"fundamento\":\"referencia orientativa\",\"requisitos\":[\"...\"],\"dias\":\"cómputo aplicable\",\"explicacion\":\"1-2 frases\",\"alerta\":\"qué verificar o vacío\"}";
  var um = "Tipo: " + (AUSENCIA_TIPOS[a.tipo] || a.tipo) + ". Motivo: " + (a.motivo || "(no especificado)") +
    ". Fechas: " + a.fecha + (a.fecha_fin && a.fecha_fin !== a.fecha ? " a " + a.fecha_fin : "") + " (" + dias + " día(s)).";
  var resp = await _rrhhGeminiLegal(sys, um);
  return _rrhhParseJson(resp) || { recomendacion: "revisar", explicacion: "No se pudo evaluar automáticamente; revísala a mano.", alerta: "" };
}

function _ragRender(pend) {
  var bd = document.getElementById("rag-bd");
  var ft = document.getElementById("rag-ft");
  var nAprob = 0;
  var cards = pend.map(function (a) {
    var j = (window._ragEval || {})[a.id] || {};
    var rec = (j.recomendacion || "revisar").toLowerCase();
    if (rec === "aprobar") nAprob++;
    var col = rec === "aprobar" ? ["#1e6b3a", "#e8f5e9", "Aprobar"]
            : rec === "denegar" ? ["#b83232", "#fde8e8", "Denegar"]
            : ["#9a6a1a", "#fff7e0", "Revisar"];
    var dias = _rrhhDias(a);
    return '<div class="rag-card" id="rag-card-' + a.id + '">' +
      '<div class="rag-top">' +
        '<div><strong>' + _rrhhEscH(a._nombre || "Profesor") + '</strong>' +
          '<div class="ria-meta">' + (AUSENCIA_TIPOS[a.tipo] || a.tipo) + ' · ' + _rrhhEscH(a.fecha) +
          (a.fecha_fin && a.fecha_fin !== a.fecha ? " → " + _rrhhEscH(a.fecha_fin) : "") + ' · ' + dias + ' día' + (dias !== 1 ? "s" : "") +
          (a.motivo ? ' · “' + _rrhhEscH(a.motivo) + '”' : '') + '</div></div>' +
        '<span class="rag-badge" style="background:' + col[1] + ';color:' + col[0] + ';">' + col[2] + '</span>' +
      '</div>' +
      (j.explicacion ? '<div class="rag-exp">' + _rrhhEscH(j.explicacion) + (j.fundamento ? ' <span style="color:var(--muted,#888);">(' + _rrhhEscH(j.fundamento) + ')</span>' : '') + '</div>' : '') +
      (j.alerta ? '<div class="ria-alert" style="margin:6px 0;">⚠ ' + _rrhhEscH(j.alerta) + '</div>' : '') +
      '<textarea class="ria-sel rag-msg" id="rag-msg-' + a.id + '" rows="2" placeholder="Mensaje para el profesor…">' + _rrhhEscH(_rrhhComponerMensaje(j)) + '</textarea>' +
      '<div class="rag-actions">' +
        '<button class="ria-btn ria-btn-ok" style="flex:1;" onclick="window._ragResolver(\'' + a.id + '\',\'aprobar\')">✓ Aprobar y enviar</button>' +
        '<button class="ria-btn ria-btn-no" style="flex:1;" onclick="window._ragResolver(\'' + a.id + '\',\'rechazar\')">✕ Rechazar y enviar</button>' +
      '</div></div>';
  }).join("");
  bd.innerHTML = cards;
  if (ft) ft.innerHTML = (nAprob
      ? '<button class="ria-btn ria-btn-ok" onclick="window._ragAprobarRecomendadas()">✓ Aprobar las ' + nAprob + ' recomendadas</button>'
      : '<div class="ria-disc">Ninguna recomendación de aprobación automática; revísalas una a una.</div>');
}

window._ragResolver = async function (id, accion) {
  var ta = document.getElementById("rag-msg-" + id);
  var mensaje = ta ? ta.value.trim() : "";
  var ok = await _rrhhAplicar(id, accion, mensaje);
  var card = document.getElementById("rag-card-" + id);
  if (ok && card) {
    card.style.opacity = ".5";
    card.querySelector(".rag-actions").innerHTML = '<span class="rag-resuelto" style="color:' + (accion === "aprobar" ? "#1e6b3a" : "#b83232") + ';">' + (accion === "aprobar" ? "✓ Aprobada y notificada" : "✕ Rechazada y notificada") + '</span>';
    var tx = card.querySelector(".rag-msg"); if (tx) tx.disabled = true;
  } else if (!ok) { showToast("No se pudo aplicar"); }
};

window._ragAprobarRecomendadas = async function () {
  if (!confirm("¿Aprobar todas las solicitudes que el agente recomienda aprobar? Se notificará a cada profesor.")) return;
  var ids = Object.keys(window._ragEval || {}).filter(function (id) {
    var j = window._ragEval[id];
    var card = document.getElementById("rag-card-" + id);
    return j && (j.recomendacion || "").toLowerCase() === "aprobar" && card && card.style.opacity !== "0.5";
  });
  var n = 0;
  for (var i = 0; i < ids.length; i++) { await window._ragResolver(ids[i], "aprobar"); n++; }
  showToast(n ? "✅ " + n + " solicitud(es) aprobadas y notificadas" : "Nada que aprobar");
  await _cargarAusenciasAdmin();
};

function filtrarRrhh(estado) {
  _rrhhFiltroEstado = estado;
  ["pendiente", "aprobada", "rechazada", "todas"].forEach(function(e) {
    var btn = document.getElementById("rrhh-btn-" + e);
    if (!btn) return;
    var activo = e === estado;
    btn.style.background  = activo ? "var(--ink)" : "var(--srf2)";
    btn.style.color       = activo ? "#fff" : "var(--txt2)";
    btn.style.borderColor = activo ? "var(--ink)" : "var(--bdr)";
    btn.style.fontWeight  = activo ? "600" : "400";
  });
  _renderAusenciasAdminLista();
}

function _limpiarFiltrosRrhh() {
  var fp = document.getElementById("rrhh-filter-prof");
  var ff = document.getElementById("rrhh-filter-fecha");
  if (fp) fp.value = "";
  if (ff) ff.value = "";
  _renderAusenciasAdminLista();
}

async function _cargarAusenciasAdmin() {
  var lista = document.getElementById("rrhh-admin-lista");
  if (!lista) return;
  lista.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;"><span class="spin">⟳</span> Cargando…</div>';

  var result = await sb.from("ausencias_profesor")
    .select("*")
    .eq("centro_id", ctrId)
    .order("fecha", { ascending: false })
    .limit(300);

  if (result.error) {
    lista.innerHTML = '<div style="color:var(--red);font-size:13px;padding:12px;">Error: ' + result.error.message + '</div>';
    return;
  }

  var ausencias = result.data || [];

  // Enrich with professor names in one query
  var profileIds = [];
  ausencias.forEach(function(a) { if (a.profile_id && profileIds.indexOf(a.profile_id) === -1) profileIds.push(a.profile_id); });

  var profMap = {};
  if (profileIds.length > 0) {
    var pResult = await sb.from("profiles").select("id, full_name").in("id", profileIds);
    (pResult.data || []).forEach(function(p) { profMap[p.id] = p.full_name || "—"; });
  }

  _rrhhAusencias = ausencias.map(function(a) {
    return Object.assign({}, a, { _nombre: profMap[a.profile_id] || "—" });
  });

  // Update pending badge
  var badge = document.getElementById("rrhh-badge-n");
  if (badge) {
    var n = _rrhhAusencias.filter(function(a) { return !a.estado || a.estado === "pendiente"; }).length;
    badge.textContent = n;
  }

  _renderAusenciasAdminLista();
}

// ── Exportar RRHH a Excel (2 hojas: ausencias + resumen por profesor) ──
function exportarRrhhExcel() {
  if (typeof XLSX === "undefined") { alert("La librería de exportación (Excel) no está disponible."); return; }
  if (!_rrhhAusencias.length) { alert("No hay ausencias para exportar."); return; }

  var TIPOS = {
    baja_medica: "Baja médica", permiso: "Permiso", asunto_propio: "Asunto propio",
    formacion: "Formación", sindical: "Sindical", otros: "Otros"
  };
  var diasEntre = function(ini, fin) {
    if (!ini) return 0;
    var a = new Date(ini + "T12:00:00");
    var b = new Date((fin || ini) + "T12:00:00");
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  };

  // Hoja 1: ausencias
  var aoa = [["Profesor","Fecha inicio","Fecha fin","Días","Tipo","Motivo","Estado"]];
  _rrhhAusencias.forEach(function(a) {
    aoa.push([
      a._nombre || "—",
      a.fecha || "",
      a.fecha_fin || a.fecha || "",
      diasEntre(a.fecha, a.fecha_fin),
      TIPOS[a.tipo] || a.tipo || "",
      a.motivo || "",
      a.estado || "pendiente"
    ]);
  });
  var ws1 = XLSX.utils.aoa_to_sheet(aoa);
  ws1["!cols"] = [{ wch: 24 },{ wch: 12 },{ wch: 12 },{ wch: 6 },{ wch: 16 },{ wch: 38 },{ wch: 12 }];

  // Hoja 2: resumen por profesor
  var resumen = {};
  _rrhhAusencias.forEach(function(a) {
    var nom = a._nombre || "—";
    if (!resumen[nom]) resumen[nom] = { dias: 0, aprobadas: 0, rechazadas: 0, pendientes: 0 };
    var est = a.estado || "pendiente";
    if (est === "aprobada") { resumen[nom].aprobadas++; resumen[nom].dias += diasEntre(a.fecha, a.fecha_fin); }
    else if (est === "rechazada") resumen[nom].rechazadas++;
    else resumen[nom].pendientes++;
  });
  var aoa2 = [["Profesor","Días ausentes (aprobadas)","Aprobadas","Rechazadas","Pendientes"]];
  Object.keys(resumen).sort(function(a, b) { return a.localeCompare(b, "es"); }).forEach(function(nom) {
    var r = resumen[nom];
    aoa2.push([nom, r.dias, r.aprobadas, r.rechazadas, r.pendientes]);
  });
  var ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  ws2["!cols"] = [{ wch: 24 },{ wch: 24 },{ wch: 11 },{ wch: 11 },{ wch: 11 }];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Ausencias");
  XLSX.utils.book_append_sheet(wb, ws2, "Resumen por profesor");
  XLSX.writeFile(wb, "rrhh-ausencias-" + new Date().toISOString().slice(0, 10) + ".xlsx");
}

function _renderAusenciasAdminLista() {
  var lista = document.getElementById("rrhh-admin-lista");
  if (!lista) return;

  var filtroProf  = document.getElementById("rrhh-filter-prof")  ? document.getElementById("rrhh-filter-prof").value  : "";
  var filtroFecha = document.getElementById("rrhh-filter-fecha") ? document.getElementById("rrhh-filter-fecha").value : "";

  var filtradas = _rrhhAusencias;
  if (_rrhhFiltroEstado && _rrhhFiltroEstado !== "todas") {
    filtradas = filtradas.filter(function(a) { return (a.estado || "pendiente") === _rrhhFiltroEstado; });
  }
  if (filtroProf) {
    filtradas = filtradas.filter(function(a) { return a.profile_id === filtroProf; });
  }
  if (filtroFecha) {
    filtradas = filtradas.filter(function(a) {
      var fin = a.fecha_fin || a.fecha;
      return a.fecha <= filtroFecha && fin >= filtroFecha;
    });
  }

  if (!filtradas.length) {
    lista.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:20px;">No hay ausencias que mostrar.</div>';
    return;
  }

  var BTN = "border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:500;border:none;";
  var rows = filtradas.map(function(a) {
    var fechaStr = (a.fecha_fin && a.fecha_fin !== a.fecha)
      ? a.fecha + " → " + a.fecha_fin
      : (a.fecha || "—");
    var isPendiente = !a.estado || a.estado === "pendiente";
    var acciones = isPendiente
      ? '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
          '<button onclick="_rrhhEvaluarIA(\'' + a.id + '\')" style="' + BTN + 'background:#f3e1d5;color:#7A3E1F;">✨ Evaluar (IA)</button>' +
          '<button onclick="aprobarAusencia(\'' + a.id + '\')" style="' + BTN + 'background:#e8f5e9;color:#1e6b3a;">✓ Aprobar</button>' +
          '<button onclick="rechazarAusencia(\'' + a.id + '\')" style="' + BTN + 'background:#fde8e8;color:#b83232;">✕ Rechazar</button>' +
        '</div>'
      : '<span style="font-size:12px;color:var(--txt3);">—</span>';
    var rechazoInfo = (a.estado === "rechazada" && a.motivo_rechazo)
      ? '<div style="font-size:11px;color:var(--red);margin-top:3px;">' + a.motivo_rechazo + '</div>'
      : "";
    return '<tr>' +
      '<td style="font-weight:500;">' + a._nombre + '</td>' +
      '<td style="font-size:13px;">' + fechaStr + '</td>' +
      '<td style="font-size:12px;">' + (AUSENCIA_TIPOS[a.tipo] || a.tipo || "—") + '</td>' +
      '<td style="font-size:12px;color:var(--txt3);">' + (a.motivo || "—") + '</td>' +
      '<td>' + _badgeEstado(a.estado || "pendiente") + rechazoInfo + '</td>' +
      '<td>' + acciones + '</td>' +
      '</tr>';
  }).join("");

  lista.innerHTML =
    '<div style="overflow-x:auto;"><table class="tbl">' +
    '<thead><tr><th>Profesor</th><th>Fechas</th><th>Tipo</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}

async function aprobarAusencia(id) {
  var ausencia = null;
  for (var i = 0; i < _rrhhAusencias.length; i++) {
    if (_rrhhAusencias[i].id === id) { ausencia = _rrhhAusencias[i]; break; }
  }
  if (!ausencia) return;

  if (ausencia.estado === "aprobada") {
    alert("Esta ausencia ya estaba aprobada. Las sustituciones ya fueron generadas.");
    return;
  }

  if (!confirm("¿Aprobar esta ausencia?\nSe generarán automáticamente los tramos sin cubrir en Sustituciones.")) return;

  var upd = await sb.from("ausencias_profesor")
    .update({ estado: "aprobada", aprobada_por: currentUser.id })
    .eq("id", id);

  if (upd.error) { alert("Error al aprobar: " + upd.error.message); return; }

  var nombreProf = await _getNombreProfesor(ausencia.profile_id);
  if (nombreProf) {
    await _crearSustituciones(ausencia, nombreProf);
  } else {
    alert("✅ Ausencia aprobada.\nNo se encontró nombre de profesor para generar sustituciones automáticas.");
  }
  _rrhhNotificarProfesor(ausencia, "aprobada", "");

  await _cargarAusenciasAdmin();
}

async function rechazarAusencia(id) {
  var motivo = prompt("Motivo del rechazo (se enviará al profesor):");
  if (motivo === null) return;
  motivo = motivo.trim();

  var upd = await sb.from("ausencias_profesor")
    .update({ estado: "rechazada", motivo_rechazo: motivo || null, nota_resolucion: motivo || null })
    .eq("id", id);

  if (upd.error) { alert("Error al rechazar: " + upd.error.message); return; }
  var a = (_rrhhAusencias || []).find(function (x) { return String(x.id) === String(id); });
  if (a) _rrhhNotificarProfesor(a, "rechazada", motivo);
  await _cargarAusenciasAdmin();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function _getNombreProfesor(profileId) {
  var r1 = await sb.from("profesores").select("nombre").eq("centro_id", ctrId).eq("profile_id", profileId).limit(1);
  if (r1.data && r1.data[0] && r1.data[0].nombre) return r1.data[0].nombre;

  var r2 = await sb.from("profiles").select("full_name").eq("id", profileId).limit(1);
  return (r2.data && r2.data[0]) ? r2.data[0].full_name : null;
}

async function _crearSustituciones(ausencia, profesorNombre) {
  var DIAS_NOMBRE = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  var fechaFin = ausencia.fecha_fin || ausencia.fecha;
  var d   = new Date(ausencia.fecha + "T12:00:00");
  var fin = new Date(fechaFin       + "T12:00:00");

  var diasNeeded = [];
  var dateRange  = [];
  while (d <= fin) {
    var diaSemana = DIAS_NOMBRE[d.getDay()];
    if (diaSemana !== "sabado" && diaSemana !== "domingo") {
      if (diasNeeded.indexOf(diaSemana) === -1) diasNeeded.push(diaSemana);
      dateRange.push({ fecha: d.toISOString().split("T")[0], dia: diaSemana });
    }
    d.setDate(d.getDate() + 1);
  }

  if (!diasNeeded.length) {
    alert("✅ Ausencia aprobada. El período no incluye días lectivos.");
    return;
  }

  // Usar curso activo del centro (global de config.js; fallback seguro)
  var cursoEscolar = (typeof cursoActivo !== "undefined" && cursoActivo) ? cursoActivo : "2025-26";

  // Buscar clases del profesor en horarios_grupo. El nombre del perfil
  // ("Bruno Sánchez") suele NO coincidir con el del horario ("SÁNCHEZ … BRUNO"):
  // distinto orden, tildes y comas. Por eso traemos todas las clases del día y
  // filtramos en JS con el matcher robusto por tokens (_sustNombreCoincide, admin.js).
  var tramosResult = await sb.from("horarios_grupo")
    .select("tramo, hora_inicio, hora_fin, grupo_horario, dia, profesor_nombre")
    .eq("centro_id", ctrId)
    .eq("curso_escolar", cursoEscolar)
    .in("dia", diasNeeded)
    .not("profesor_nombre", "is", null)
    .limit(20000);

  var coincide = (typeof _sustNombreCoincide === "function")
    ? _sustNombreCoincide
    : function(loose, h) { return String(h || "").toLowerCase().indexOf(String(loose || "").toLowerCase()) !== -1; };

  var tramosPorDia = {};
  (tramosResult.data || []).forEach(function(t) {
    if (!coincide(profesorNombre, t.profesor_nombre)) return;
    if (!tramosPorDia[t.dia]) tramosPorDia[t.dia] = [];
    tramosPorDia[t.dia].push(t);
  });

  var obs = AUSENCIA_TIPOS[ausencia.tipo] || ausencia.tipo || "Ausencia";

  // Cargar sustituciones ya existentes para este profesor en el rango (dedup)
  var fechasRango = dateRange.map(function(e) { return e.fecha; });
  var existRes = await sb.from("sustituciones")
    .select("fecha, tramo, grupo_horario")
    .eq("centro_id", ctrId)
    .eq("profesor_ausente", profesorNombre)
    .in("fecha", fechasRango);
  var existKeys = new Set((existRes.data || []).map(function(s) {
    return s.fecha + "|" + s.tramo + "|" + s.grupo_horario;
  }));

  var inserts = [];
  dateRange.forEach(function(entry) {
    (tramosPorDia[entry.dia] || []).forEach(function(t) {
      var key = entry.fecha + "|" + t.tramo + "|" + t.grupo_horario;
      if (existKeys.has(key)) return; // ya existe, no duplicar
      inserts.push({
        centro_id:          ctrId,
        fecha:              entry.fecha,
        hora_inicio:        t.hora_inicio,
        hora_fin:           t.hora_fin,
        tramo:              t.tramo,
        grupo_horario:      t.grupo_horario,
        profesor_ausente:   profesorNombre,
        profesor_sustituto: null,
        observaciones:      obs,
        cubierta:           false,
        creado_por:         currentUser.id
      });
    });
  });

  if (inserts.length > 0) {
    var ins = await sb.from("sustituciones").insert(inserts);
    if (ins.error) { alert("Error al crear sustituciones: " + ins.error.message); return; }
    alert("✅ Ausencia aprobada. " + inserts.length + " tramo(s) generados en Sustituciones.");
  } else if (existKeys.size > 0) {
    alert("✅ Ausencia aprobada. Las sustituciones ya estaban creadas (" + existKeys.size + " tramo(s)).");
  } else {
    alert("✅ Ausencia aprobada.\n⚠️ No se encontró el horario de " + profesorNombre + " para el curso " + cursoEscolar + ".\nRevisa que el nombre coincide con horarios_grupo o crea las sustituciones manualmente.");
  }
}

function _getCursoEscolar() {
  var hoy  = new Date();
  var year = hoy.getFullYear();
  var mes  = hoy.getMonth() + 1;
  return mes >= 9 ? year + "-" + (year + 1) : (year - 1) + "-" + year;
}

function _getTrimestreActual() {
  var mes = new Date().getMonth() + 1;
  if (mes >= 9) return 1;
  if (mes <= 3) return 2;
  return 3;
}
