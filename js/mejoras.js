// ── MEJORA 1+2+3+4: TARJETAS ROL + FICHA CENTRO + BANNER + EVENTOS ──

function loadRoleCards() {
  var container = document.getElementById("role-cards-container");
  var cards = document.getElementById("role-cards");
  if (!container || !cards) return;

  var defs = {
    familia: [
      { ico:"📅", lbl:"Próxima reunión", sub:"Cuándo es", q:"¿Cuándo es la próxima reunión de familias?" },
      { ico:"📞", lbl:"Secretaría", sub:"Teléfono del centro", q:"¿Cuál es el teléfono de secretaría?" },
      { ico:"🥗", lbl:"Menú semanal", sub:"Ver esta semana", q:"¿Cuál es el menú de esta semana?" },
      { ico:"📝", lbl:"Justificantes", sub:"Cómo justificar faltas", q:"¿Cómo funciona el protocolo de ausencias y justificantes?" }
    ],
    profesional: [
      { ico:"📋", lbl:"Mi horario", sub:"Ver mis clases", q:"¿Cuál es mi horario de clases?" },
      { ico:"🏫", lbl:"Próximo claustro", sub:"Fecha y hora", q:"¿Cuándo es el próximo claustro?" },
      { ico:"📚", lbl:"Materiales", sub:"Solicitar recursos", q:"¿Cómo solicito material didáctico?" },
      { ico:"📝", lbl:"Incidencias", sub:"Registrar una", q:"¿Cómo registro una incidencia de convivencia?" }
    ],
    admin: [
      { ico:"📅", lbl:"Reunión familias", sub:"Actualizar fecha", tab:"admin", info:"proxima_reunion" },
      { ico:"📞", lbl:"Teléfono", sub:"Actualizar contacto", tab:"admin", info:"telefono" },
      { ico:"🥗", lbl:"Menú semanal", sub:"Editar menú", tab:"admin", info:"menu_semanal" },
      { ico:"⚠️", lbl:"Aviso activo", sub:"Editar aviso", tab:"admin", info:"aviso_activo" }
    ],
    superadmin: [
      { ico:"🏫", lbl:"Centros", sub:"Módulos activos", tab:"users" },
      { ico:"👥", lbl:"Usuarios", sub:"Gestión global", tab:"users" },
      { ico:"✏️", lbl:"Administrar", sub:"Info del centro", tab:"admin" },
      { ico:"🍽️", lbl:"Comedor", sub:"Ver asistencia", tab:"comedor" }
    ]
  };

  var rolCards = defs[role] || defs["familia"];
  var html = "";
  for (var i = 0; i < rolCards.length; i++) {
    var c = rolCards[i];
    var onclick = "";
    if (c.q) {
      onclick = "askQ(" + JSON.stringify(c.q) + ")";
    } else if (c.info) {
      onclick = "showTab(" + JSON.stringify(c.tab) + "); setTimeout(function(){ jumpToInfo(" + JSON.stringify(c.info) + "); }, 500);";
    } else if (c.tab) {
      onclick = "showTab(" + JSON.stringify(c.tab) + ")";
    }
    html += "<div class=\"role-card\" onclick=\"" + onclick + "\">";
    html += "<div class=\"rc-ico\">" + c.ico + "</div>";
    html += "<div><div class=\"rc-lbl\">" + c.lbl + "</div><div class=\"rc-sub\">" + c.sub + "</div></div>";
    html += "</div>";
  }
  cards.innerHTML = html;
  container.style.display = "block";
}

async function loadFichaCentro() {
  var container = document.getElementById("ficha-centro-container");
  var dataEl = document.getElementById("ficha-centro-data");
  if (!container || !dataEl || !sb || !ctrId) return;

  var result = await sb.from("info_centro").select("nombre_config,datos").eq("centro_id", ctrId);
  var data = result.data;
  if (!data || !data.length) return;

  var cfg = {};
  for (var i = 0; i < data.length; i++) {
    cfg[data[i].nombre_config] = (data[i].datos && data[i].datos.valor) ? data[i].datos.valor : "";
  }

  // Banner aviso
  var bannerEl = document.getElementById("banner-aviso");
  var bannerTxt = document.getElementById("banner-aviso-txt");
  if (cfg.aviso_activo && bannerEl && bannerTxt) {
    bannerTxt.textContent = cfg.aviso_activo;
    bannerEl.style.display = "flex";
  }

  // Ficha
  var rows = "";
  if (ctrName) rows += "<strong style=\"font-size:15px;font-weight:600;color:var(--txt);\">" + ctrName + "</strong>";
  if (cfg.telefono) rows += "<div style=\"display:flex;gap:6px;font-size:13px;\"><span style=\"font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--txt3);min-width:70px;\">📞 Tel</span><span>" + cfg.telefono + "</span></div>";
  if (cfg.proxima_reunion) rows += "<div style=\"display:flex;gap:6px;font-size:13px;\"><span style=\"font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--txt3);min-width:70px;\">📅 Reunión</span><span>" + cfg.proxima_reunion + "</span></div>";
  if (cfg.claustro && (role === "profesional" || role === "admin" || role === "superadmin")) {
    rows += "<div style=\"display:flex;gap:6px;font-size:13px;\"><span style=\"font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--txt3);min-width:70px;\">🏫 Claustro</span><span>" + cfg.claustro + "</span></div>";
  }

  if (rows) {
    dataEl.innerHTML = rows;
    container.style.display = "block";
  }
}

// ── MEJORA 5: ESTADO COMEDOR HIJOS ──
async function loadComedorHijos() {
  if (role !== "familia" || !currentUserAlumnos.length) return;
  var container = document.getElementById("comedor-hijos-container");
  var list = document.getElementById("comedor-hijos-list");
  if (!container || !list) return;

  var today = new Date().toISOString().split("T")[0];

  // Cargar IDs de alumnos desde familia_alumno
  var profResult = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
  if (!profResult.data) return;
  var profileId = profResult.data.id;

  var vinResult = await sb.from("familia_alumno").select("alumnos(id,nombre,curso,grupo_horario)").eq("profile_id", profileId);
  var alumnos = [];
  if (vinResult.data) {
    for (var i = 0; i < vinResult.data.length; i++) {
      if (vinResult.data[i].alumnos) alumnos.push(vinResult.data[i].alumnos);
    }
  }
  if (!alumnos.length) return;

  var ids = alumnos.map(function(a) { return a.id; });
  var asistResult = await sb.from("asistencia_comedor").select("alumno_id,se_queda").eq("centro_id", ctrId).eq("fecha", today).in("alumno_id", ids);
  var asistMap = {};
  if (asistResult.data) {
    for (var i = 0; i < asistResult.data.length; i++) {
      asistMap[asistResult.data[i].alumno_id] = asistResult.data[i].se_queda;
    }
  }

  var html = "";
  for (var i = 0; i < alumnos.length; i++) {
    var a = alumnos[i];
    var seQueda = asistMap[a.id];
    var estado = seQueda === true ? "✅ Se queda" : seQueda === false ? "❌ No se queda" : "⏳ Sin confirmar";
    var bg = seQueda === true ? "background:var(--ink-ll);border-color:var(--ink-l);" : "";
    html += "<div style=\"padding:10px 14px;background:var(--srf2);border:1.5px solid var(--bdr);border-radius:var(--r-sm);display:flex;align-items:center;gap:10px;font-size:13px;" + bg + "\">";
    html += "<span style=\"flex:1;font-weight:500;\">" + a.nombre + "</span>";
    html += "<span style=\"font-size:11px;color:var(--txt3);\">" + (a.curso || "") + "</span>";
    html += "<span style=\"font-size:12px;\">" + estado + "</span>";
    html += "</div>";
  }
  list.innerHTML = html;
  container.style.display = "block";
}

// ── MEJORA 7: MIS HIJOS ──
function loadMisHijos() {
  if (role !== "familia" || !currentUserAlumnos.length) return;
  var container = document.getElementById("mis-hijos-container");
  var list = document.getElementById("mis-hijos-list");
  if (!container || !list) return;

  var html = "";
  for (var i = 0; i < currentUserAlumnos.length; i++) {
    var a = currentUserAlumnos[i];
    var nombre = a.nombre || "";
    var primerApellido = nombre.split(",")[0].trim();
    var meta = (a.curso || "") + (a.grupo_horario ? " · " + a.grupo_horario : "");
    html += "<div style=\"padding:9px 12px;background:var(--srf2);border:1.5px solid var(--bdr);border-radius:var(--r-sm);display:flex;align-items:center;gap:10px;\">";
    html += "<div style=\"flex:1;\"><div style=\"font-size:13px;font-weight:500;\">" + nombre + "</div><div style=\"font-size:11px;color:var(--txt3);\">" + meta + "</div></div>";
    html += "<button class=\"btn btn-s\" style=\"font-size:11px;padding:4px 10px;\" onclick=\"askQ('¿Qué clase tiene " + primerApellido + " ahora?')\">📅 Horario</button>";
    html += "</div>";
  }
  list.innerHTML = html;
  container.style.display = "block";
}

// ── MEJORA 6: BÚSQUEDA RÁPIDA ALUMNO ──
var _busqTimer = null;
function buscarAlumnoRapido(q) {
  var res = document.getElementById("busqueda-alumno-res");
  if (!res) return;
  clearTimeout(_busqTimer);
  if (!q || q.length < 2) { res.innerHTML = ""; return; }
  _busqTimer = setTimeout(async function() {
    var today = new Date().toISOString().split("T")[0];
    var result = await sb.from("alumnos").select("id,nombre,curso,grupo_horario").eq("centro_id", ctrId).ilike("nombre", "%" + q + "%").limit(8);
    var alumnos = result.data || [];

    if (!alumnos.length) {
      res.innerHTML = "<div style=\"font-size:12px;color:var(--txt3);padding:6px;\">Sin resultados.</div>";
      return;
    }

    var asistMap = {};
    if (modulosActivos.includes("comedor")) {
      var ids = alumnos.map(function(a) { return a.id; });
      var asistResult = await sb.from("asistencia_comedor").select("alumno_id,se_queda").eq("centro_id", ctrId).eq("fecha", today).in("alumno_id", ids);
      if (asistResult.data) {
        for (var i = 0; i < asistResult.data.length; i++) {
          asistMap[asistResult.data[i].alumno_id] = asistResult.data[i].se_queda;
        }
      }
    }

    var html = "";
    for (var i = 0; i < alumnos.length; i++) {
      var a = alumnos[i];
      var primerApellido = (a.nombre || "").split(",")[0].trim();
      var comedor = "";
      if (modulosActivos.includes("comedor")) {
        comedor = asistMap[a.id] === true ? " · ✅" : asistMap[a.id] === false ? " · ❌" : "";
      }
      var meta = (a.curso || "") + (a.grupo_horario ? " · " + a.grupo_horario : "") + comedor;
      html += "<div style=\"padding:9px 12px;background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);display:flex;align-items:center;gap:10px;margin-top:4px;\">";
      html += "<span style=\"flex:1;font-weight:500;font-size:13px;\">" + a.nombre + "</span>";
      html += "<span style=\"font-size:11px;color:var(--txt3);\">" + meta + "</span>";
      html += "<button class=\"btn btn-s\" style=\"font-size:11px;padding:3px 8px;\" onclick=\"askQ('¿Qué clase tiene " + primerApellido + " ahora?')\">Horario</button>";
      html += "</div>";
    }
    res.innerHTML = html;
  }, 280);
}

// ── MEJORA 8: HISTORIAL RECIENTE ──
function addToHistorial(txt) {
  try {
    var key = "didactia_hist_" + ((currentUser && currentUser.id) ? currentUser.id : "anon");
    var hist = JSON.parse(localStorage.getItem(key) || "[]");
    hist = [txt].concat(hist.filter(function(h) { return h !== txt; })).slice(0, 5);
    localStorage.setItem(key, JSON.stringify(hist));
    renderHistorial();
  } catch(e) {}
}

function renderHistorial() {
  var sec = document.getElementById("sb-sec-recientes");
  var container = document.getElementById("sb-historial");
  if (!container) return;
  try {
    var key = "didactia_hist_" + ((currentUser && currentUser.id) ? currentUser.id : "anon");
    var hist = JSON.parse(localStorage.getItem(key) || "[]");
    if (!hist.length) {
      if (sec) sec.style.display = "none";
      container.innerHTML = "";
      return;
    }
    if (sec) sec.style.display = "block";
    var html = "";
    for (var i = 0; i < hist.length; i++) {
      var h = hist[i];
      var label = h.length > 32 ? h.slice(0, 32) + "…" : h;
      html += "<div class=\"sb-item\" onclick=\"askQ(" + JSON.stringify(h) + ")\" title=\"" + h.replace(/"/g, "&quot;") + "\">💬 " + label + "</div>";
    }
    container.innerHTML = html;
  } catch(e) {}
}

// ── MEJORA 11: VOZ ──
var _recognition = null;
var _listening = false;

function toggleVoice() {
  var btn = document.getElementById("mic-btn");
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (btn) { btn.textContent = "🚫"; setTimeout(function() { btn.textContent = "🎤"; }, 2000); }
    return;
  }

  if (_listening) {
    if (_recognition) _recognition.stop();
    return;
  }

  _recognition = new SpeechRec();
  _recognition.lang = "es-ES";
  _recognition.continuous = false;
  _recognition.interimResults = false;

  _recognition.onstart = function() {
    _listening = true;
    if (btn) { btn.classList.add("listening"); btn.textContent = "🔴"; }
  };
  _recognition.onresult = function(e) {
    var txt = e.results[0][0].transcript;
    var inp = document.getElementById("chat-inp");
    if (inp) {
      inp.value = (inp.value + " " + txt).trim();
      autoResize(inp);
      inp.focus();
    }
  };
  _recognition.onerror = function(e) {
    if (btn) { btn.textContent = e.error === "not-allowed" ? "🔇" : "🎤"; }
    setTimeout(function() { if (btn) btn.textContent = "🎤"; }, 2000);
  };
  _recognition.onend = function() {
    _listening = false;
    if (btn) { btn.classList.remove("listening"); btn.textContent = "🎤"; }
    _recognition = null;
  };

  _recognition.start();
}

// ── MEJORA 10: FILTRO GRUPO COMEDOR ──
function populateGruposComedor() {
  var sel = document.getElementById("comedor-filtro-grupo");
  if (!sel || !comedorData) return;
  var grupos = [];
  for (var i = 0; i < comedorData.length; i++) {
    var g = comedorData[i].grupo_horario || comedorData[i].curso || "";
    if (g && grupos.indexOf(g) === -1) grupos.push(g);
  }
  grupos.sort();
  var current = sel.value;
  var html = "<option value=\"\">Todos los grupos</option>";
  for (var i = 0; i < grupos.length; i++) {
    html += "<option value=\"" + grupos[i] + "\"" + (current === grupos[i] ? " selected" : "") + ">" + grupos[i] + "</option>";
  }
  sel.innerHTML = html;
}

// ── INIT: llamar a mejoras tras login ──
function initWelcomeExtras() {
  loadRoleCards();
  loadFichaCentro();
  loadMisHijos();
  if (role === "familia" && modulosActivos.includes("comedor")) {
    loadComedorHijos();
  }
  if (role === "admin" || role === "profesional" || role === "superadmin") {
    var busqEl = document.getElementById("busqueda-alumno-container");
    var accionesSec = document.getElementById("sb-sec-acciones");
    var accionesEl = document.getElementById("sb-acciones-rol");
    if (busqEl) busqEl.style.display = "block";
    if (accionesSec) accionesSec.style.display = "block";
    if (accionesEl) {
      accionesEl.innerHTML = "<div class=\"sb-item\" onclick=\"showTab('comedor')\">🍽️ Ir a comedor</div><div class=\"sb-item\" onclick=\"showTab('admin')\">✏️ Administración</div>";
    }
  }
  renderHistorial();
}
