// ── MEJORA 1+2+3+4: DASHBOARD POR ROL ──

async function loadDashboard() {
  var container = document.getElementById("role-cards-container");
  if (!container) return;
  container.style.display = "block";

  var cfg = {};
  if (ctrId) {
    var r = await sb.from("info_centro").select("nombre_config,datos").eq("centro_id", ctrId);
    if (r.data) r.data.forEach(function(d) { cfg[d.nombre_config] = (d.datos && d.datos.valor) ? d.datos.valor : ""; });
  }

  var bannerEl = document.getElementById("banner-aviso");
  var bannerTxt = document.getElementById("banner-aviso-txt");
  if (cfg.aviso_activo && bannerEl && bannerTxt) {
    bannerTxt.textContent = cfg.aviso_activo;
    bannerEl.style.display = "flex";
  }

  var fichaEl = document.getElementById("ficha-centro-container");
  if (fichaEl) fichaEl.style.display = "none";

  var today = new Date().toLocaleDateString("es-ES", { weekday:"long", day:"numeric", month:"long" });
  today = today.charAt(0).toUpperCase() + today.slice(1);

  if (role === "familia") {
    var alumnosHtml = "";
    if (currentUserAlumnos && currentUserAlumnos.length) {
      var todayIso = new Date().toISOString().split("T")[0];
      var ids = currentUserAlumnos.map(function(a) { return a.id; });
      var asistMap = {};
      if (modulosActivos.includes("comedor")) {
        var ar = await sb.from("asistencia_comedor").select("alumno_id,se_queda").eq("centro_id", ctrId).eq("fecha", todayIso).in("alumno_id", ids);
        if (ar.data) ar.data.forEach(function(x) { asistMap[x.alumno_id] = x.se_queda; });
      }
      currentUserAlumnos.forEach(function(a) {
        var seQueda = asistMap[a.id];
        var badge = seQueda === true
          ? '<span style="background:#e6f4ea;color:#1e6b3a;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:500;">Comedor ✓</span>'
          : seQueda === false
          ? '<span style="background:#f1f3f4;color:#5f6368;border-radius:12px;padding:2px 8px;font-size:10px;">Sin comedor</span>'
          : '<span style="background:#fef7e0;color:#b06000;border-radius:12px;padding:2px 8px;font-size:10px;">Sin confirmar</span>';
        alumnosHtml += '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid #f1f3f4;font-size:13px;color:#3c4043;">'
          + '<span>' + a.nombre + ' · <span style="color:#9aa0a6;font-size:11px;">' + (a.curso || "") + '</span></span>' + badge + '</div>';
      });
    } else {
      alumnosHtml = '<div style="font-size:12px;color:#9aa0a6;">No hay alumnos vinculados.</div>';
    }

    var reuniones = cfg.proxima_reunion
      ? '<div style="display:flex;gap:8px;padding:6px 0;border-bottom:0.5px solid #f1f3f4;font-size:12px;color:#3c4043;"><span style="color:#1e4174;font-weight:500;font-size:11px;min-width:50px;text-transform:uppercase;">Reunión</span><span>' + cfg.proxima_reunion + '</span></div>'
      : '<div style="font-size:12px;color:#9aa0a6;">Sin reuniones próximas.</div>';

    container.innerHTML = ''
      + '<div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:560px;">'
      + '<div><div style="font-size:18px;font-weight:500;color:#202124;">Buenos días, <span style="color:#1e4174;">' + (currentUserName || "").split(" ")[0] + '</span></div><div style="font-size:12px;color:#5f6368;margin-top:2px;">' + today + ' · ' + ctrName + '</div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;"><div style="font-size:12px;font-weight:600;color:#202124;margin-bottom:8px;">Mis hijos hoy</div>' + alumnosHtml + '</div>'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;"><div style="font-size:12px;font-weight:600;color:#202124;margin-bottom:8px;">Próximas reuniones</div>' + reuniones + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<div class="quick-q" onclick="askQ(\'¿Cómo funciona el protocolo de ausencias y justificantes?\')" style="border-radius:20px;padding:7px 14px;font-size:12px;">Justificar falta</div>'
      + (currentUserAlumnos && currentUserAlumnos[0] ? '<div class="quick-q" onclick="askQ(' + JSON.stringify("¿Qué clase tiene " + (currentUserAlumnos[0].nombre||"").split(",")[0].trim() + " ahora?") + ')" style="border-radius:20px;padding:7px 14px;font-size:12px;">Ver horario de ' + (currentUserAlumnos[0].nombre||"").split(",")[0].trim() + '</div>' : "")
      + '</div>'
      + '</div>';

  } else if (role === "profesional") {
    var guardiasHtml = cfg.aviso_activo
      ? '<div style="font-size:12px;color:#5f6368;">Consulta sustituciones para ver guardias pendientes.</div>'
      : '<div style="font-size:12px;color:#9aa0a6;">Sin información de guardias.</div>';

    container.innerHTML = ''
      + '<div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:560px;">'
      + '<div><div style="font-size:18px;font-weight:500;color:#202124;">Buenos días, <span style="color:#1e4174;">' + (currentUserName || "").split(" ")[0] + '</span></div><div style="font-size:12px;color:#5f6368;margin-top:2px;">' + today + '</div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;"><div style="font-size:12px;font-weight:600;color:#202124;margin-bottom:8px;">Mi horario hoy</div><div style="font-size:12px;color:#9aa0a6;">Pregunta al chat por tu horario de hoy.</div><div style="margin-top:10px;"><div class="quick-q" onclick="askQ(\'¿Cuál es mi horario de hoy?\')" style="border-radius:20px;padding:6px 12px;font-size:11px;display:inline-flex;">Ver mi horario →</div></div></div>'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;"><div style="font-size:12px;font-weight:600;color:#202124;margin-bottom:8px;">Guardias del día</div>' + guardiasHtml + '<div style="margin-top:10px;"><div class="quick-q" onclick="showTab(\'sust\')" style="border-radius:20px;padding:6px 12px;font-size:11px;display:inline-flex;">Ver sustituciones →</div></div></div>'
      + '</div>'
      + '</div>';

  } else if (role === "admin" || role === "superadmin") {
    container.innerHTML = ''
      + '<div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:560px;">'
      + '<div><div style="font-size:18px;font-weight:500;color:#202124;">Buenos días, <span style="color:#1e4174;">' + (currentUserName || "").split(" ")[0] + '</span></div><div style="font-size:12px;color:#5f6368;margin-top:2px;">' + today + ' · ' + ctrName + '</div></div>'
      + '<div id="admin-stats-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;"><div style="font-size:24px;font-weight:500;color:#a50e0e;" id="stat-guardias">—</div><div style="font-size:10px;color:#9aa0a6;text-transform:uppercase;letter-spacing:.05em;margin-top:4px;">Guardias sin cubrir</div></div>'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;"><div style="font-size:24px;font-weight:500;color:#b06000;" id="stat-ausentes">—</div><div style="font-size:10px;color:#9aa0a6;text-transform:uppercase;letter-spacing:.05em;margin-top:4px;">Profesores ausentes</div></div>'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;"><div style="font-size:24px;font-weight:500;color:#1e6b3a;" id="stat-incidencias">—</div><div style="font-size:10px;color:#9aa0a6;text-transform:uppercase;letter-spacing:.05em;margin-top:4px;">Incidencias abiertas</div></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="showTab(\'sust\')">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:#e8f0fe;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#1e4174" stroke-width="1.5"><path d="M8 2v12M2 8h12"/></svg></div>'
      + '<div><div style="font-size:13px;font-weight:500;color:#202124;">Sustituciones</div><div style="font-size:11px;color:#9aa0a6;">Gestionar guardias</div></div></div>'
      + '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px;display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="showTab(\'admin\')">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:#e8f0fe;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#1e4174" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="9" x2="11" y2="9"/></svg></div>'
      + '<div><div style="font-size:13px;font-weight:500;color:#202124;">Administración</div><div style="font-size:11px;color:#9aa0a6;">Info del centro</div></div></div>'
      + '</div>'
      + '</div>';

    var todayIso2 = new Date().toISOString().split("T")[0];
    var sustR = await sb.from("sustituciones").select("id,cubierta,profesor_ausente").eq("centro_id", ctrId).eq("fecha", todayIso2);
    if (sustR.data) {
      var sinCubrir = sustR.data.filter(function(s) { return !s.cubierta; }).length;
      var statG = document.getElementById("stat-guardias");
      if (statG) { statG.textContent = sinCubrir; statG.style.color = sinCubrir > 0 ? "#a50e0e" : "#1e6b3a"; }
      var ausentes = new Set(sustR.data.map(function(s) { return s.profesor_ausente; }).filter(Boolean)).size;
      var statA = document.getElementById("stat-ausentes");
      if (statA) { statA.textContent = ausentes; statA.style.color = ausentes > 0 ? "#b06000" : "#1e6b3a"; }
    }

    var incR = await sb.from("incidencias").select("id").eq("centro_id", ctrId).eq("estado", "abierta");
    if (!incR.error && incR.data) {
      var incCount = incR.data.length;
      var statI = document.getElementById("stat-incidencias");
      if (statI) { statI.textContent = incCount; statI.style.color = incCount > 0 ? "#a50e0e" : "#1e6b3a"; }
    }
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
    html += "<button class=\"btn btn-s\" style=\"font-size:11px;padding:4px 10px;\" onclick=\"askQ(" + JSON.stringify("¿Qué clase tiene " + primerApellido + " ahora?") + ")\">📅 Horario</button>";
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
      html += "<button class=\"btn btn-s\" style=\"font-size:11px;padding:3px 8px;\" onclick=\"askQ(" + JSON.stringify("¿Qué clase tiene " + primerApellido + " ahora?") + ")\">Horario</button>";
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

// ── REALTIME: NOTIFICACIONES DE SUSTITUCIONES ──
var _realtimeChannel = null;

function initRealtimeNotifications() {
  if (!sb || !ctrId) return;
  if (['profesional', 'admin', 'superadmin'].indexOf(role) === -1) return;
  if (_realtimeChannel) { try { sb.removeChannel(_realtimeChannel); } catch(e) {} }

  _realtimeChannel = sb.channel('sust-notif-' + ctrId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'sustituciones',
      filter: 'centro_id=eq.' + ctrId
    }, function(payload) {
      var s = payload.new;
      var msg = 'Nueva sustitución: ' + (s.profesor_ausente || '—') + ' → ' + (s.profesor_sustituto || '—');
      if (s.grupo_horario) msg += ' (' + s.grupo_horario + ')';
      showToast(msg);
      var tabSust = document.getElementById('tab-sust');
      if (tabSust && !tabSust.classList.contains('active')) {
        tabSust.style.outline = '2px solid var(--ink)';
        tabSust.style.outlineOffset = '-2px';
      }
    })
    .subscribe();
}

function showToast(msg) {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:calc(72px + env(safe-area-inset-bottom,0));left:50%;transform:translateX(-50%);background:#202124;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:90vw;text-align:center;';
  toast.textContent = '🔔 ' + msg;
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
}

// ── INIT: llamar a mejoras tras login ──
function initWelcomeExtras() {
  loadDashboard();
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
