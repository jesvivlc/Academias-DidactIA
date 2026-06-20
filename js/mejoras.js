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
      + (currentUserAlumnos && currentUserAlumnos[0] ? '<div class="quick-q" onclick="askQ(' + _mhEsc(JSON.stringify("¿Qué clase tiene " + (currentUserAlumnos[0].nombre||"").split(",")[0].trim() + " ahora?")) + ')" style="border-radius:20px;padding:7px 14px;font-size:12px;">Ver horario de ' + _mhEsc((currentUserAlumnos[0].nombre||"").split(",")[0].trim()) + '</div>' : "")
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
function buscarAlumnoRapido(q, resId) {
  var res = document.getElementById(resId || "busqueda-alumno-res");
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

// ── MI HORARIO DE HOY (Cambio 3) ──
var _miHorarioKey = null;

function _mhEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _mhNorm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}
function _mhTokens(s) {
  return _mhNorm(s).split(" ").filter(function (t) { return t.length >= 3; });
}

async function renderMiHorarioHoy(force) {
  var bodies = document.querySelectorAll("[data-horario-body]");
  if (!bodies.length) return;
  var counts = document.querySelectorAll("[data-horario-count]");
  var setBodies = function (h) { bodies.forEach(function (b) { b.innerHTML = h; }); };
  var setCount  = function (t) { counts.forEach(function (c) { c.textContent = t; }); };

  var DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]; // sin acento, como en horarios_grupo
  var now = new Date();
  var dia = DIAS[now.getDay()];
  var nombre = (typeof currentUserName !== "undefined" ? currentUserName : "") || "";
  var userTokens = _mhTokens(nombre);

  var key = (ctrId || "") + "|" + dia + "|" + nombre;
  if (!force && _miHorarioKey === key) return; // evita recargas en cada cambio de tab
  _miHorarioKey = key;

  setCount("");
  setBodies('<div class="home-horario-empty">Cargando…</div>');

  // Sin nombre real (p. ej. cuenta sin full_name) → estado vacío elegante
  if (userTokens.length < 2) {
    setBodies('<div class="home-horario-empty"><i class="ti ti-calendar-off"></i> No hay horario vinculado a tu perfil todavía.</div>');
    return;
  }

  // Clases del día (filtro accent-safe en cliente; ilike es sensible a tildes y no sirve aquí)
  var r = await sb.from("horarios_grupo")
    .select("tramo,hora_inicio,hora_fin,grupo_horario,actividad_nombre,profesor_nombre,aula")
    .eq("centro_id", ctrId).eq("dia", dia).limit(3000);

  if (r.error) {
    setBodies('<div class="home-horario-empty">No se pudo cargar el horario.</div>');
    _miHorarioKey = null;
    return;
  }

  var todays = (r.data || []).filter(function (row) {
    var pt = _mhTokens(row.profesor_nombre);
    return userTokens.every(function (t) { return pt.indexOf(t) !== -1; });
  }).sort(function (a, b) { return (a.tramo || 0) - (b.tramo || 0); });

  if (!todays.length) {
    var finde = (now.getDay() === 0 || now.getDay() === 6);
    setBodies(finde
      ? '<div class="home-horario-empty"><i class="ti ti-coffee"></i> Hoy no hay clases — ¡buen fin de semana!</div>'
      : '<div class="home-horario-empty"><i class="ti ti-calendar-off"></i> No hay horario vinculado a tu perfil todavía.</div>');
    setCount("");
    return;
  }

  var nowMin = now.getHours() * 60 + now.getMinutes();
  var hm = function (t) { if (!t) return null; var p = String(t).split(":"); return (+p[0]) * 60 + (+p[1]); };

  var fechaHoy = now.toISOString().split("T")[0];
  var canPasarLista = (typeof role !== "undefined" && (role === "profesional" || role === "admin" || role === "director" || role === "jefatura" || role === "superadmin"));

  var html = todays.map(function (row) {
    var ini = hm(row.hora_inicio), fin = hm(row.hora_fin);
    var ahora = (ini != null && fin != null && nowMin >= ini && nowMin < fin);
    var horaTxt = (row.hora_inicio || "").slice(0, 5) + (row.hora_fin ? "–" + String(row.hora_fin).slice(0, 5) : "");
    var tramoLbl = (row.tramo != null) ? row.tramo + "ª hora" : "—";
    var aulaTxt = row.aula ? " · " + _mhEsc(row.aula) : "";
    // Argumento seguro como string JS dentro de un atributo onclick="…" (comillas dobles):
    // comillas simples en el contenido se escapan con \', las dobles a &quot;.
    var _argAttr = function (v) {
      return String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
    };
    // Pasar lista disponible para cualquier clase de hoy que ya haya empezado
    // (la actual o una ya concluida — por si se olvidó pasarla en su momento).
    // No se muestra en clases futuras del día.
    var yaEmpezada = (ini == null) || (nowMin >= ini);
    var btnLista = (yaEmpezada && canPasarLista && row.grupo_horario && row.tramo != null)
      ? '<button class="hh-btn-lista" onclick="window.abrirPasarLista(\'' +
          _argAttr(row.grupo_horario) + '\',' + row.tramo + ',\'' + _argAttr(fechaHoy) +
        '\')">📋 ' + (ahora ? 'Pasar lista' : 'Pasar lista (atrasada)') + '</button>'
      : "";
    return '<div class="home-horario-row' + (ahora ? " is-now" : "") + '">' +
      '<div class="hh-tramo">' + _mhEsc(tramoLbl) + (ahora ? '<span class="hh-now">AHORA</span>' : "") + "</div>" +
      '<div class="hh-main">' +
        '<div class="hh-asig">' + _mhEsc(row.actividad_nombre || "—") + " · " + _mhEsc(row.grupo_horario || "") + "</div>" +
        '<div class="hh-meta">' + _mhEsc(horaTxt) + aulaTxt + "</div>" +
      "</div>" +
      (btnLista ? '<div class="hh-actions">' + btnLista + "</div>" : "") +
    "</div>";
  }).join("");

  setBodies(html);
  setCount(todays.length + (todays.length === 1 ? " clase" : " clases"));
}

// ── MÉTRICAS ACCIONABLES DE LA HOME (Cambio 4) ──
var _homeMetricsAt = 0, _homeMetricsKey = "";

async function renderHomeMetrics(force) {
  if (!document.querySelector("[data-metric]")) return;
  var key = ctrId || "";
  var nowMs = Date.now();
  if (!force && key === _homeMetricsKey && (nowMs - _homeMetricsAt) < 5000) return; // debounce
  _homeMetricsKey = key; _homeMetricsAt = nowMs;

  var setMetric = function (name, val, alerta) {
    document.querySelectorAll('[data-metric="' + name + '"]').forEach(function (el) {
      el.textContent = val;
      el.classList.toggle("is-alert", !!alerta);
    });
  };

  var today = new Date().toISOString().split("T")[0];

  // Sustituciones de hoy
  try {
    var s = await sb.from("sustituciones").select("id").eq("centro_id", ctrId).eq("fecha", today);
    setMetric("sust", s.data ? s.data.length : 0);
  } catch (e) { setMetric("sust", 0); }

  // Incidencias abiertas
  try {
    var inc = await sb.from("incidencias").select("id").eq("centro_id", ctrId).eq("estado", "abierta");
    setMetric("inc", inc.data ? inc.data.length : 0);
  } catch (e) { setMetric("inc", 0); }

  // Comunicados no leídos (reutiliza el registro de leídos de comunicados.js)
  try {
    var leidos = (typeof _comGetLeidos === "function") ? _comGetLeidos() : [];
    var c = await sb.from("comunicados").select("id").eq("centro_id", ctrId).limit(500);
    var unread = (c.data || []).filter(function (x) { return leidos.indexOf(x.id) === -1; }).length;
    setMetric("com", unread, unread > 0);
  } catch (e) { setMetric("com", 0); }

  // Resumen proactivo de guardias (agente IA) — fire-and-forget, no bloquea el inicio
  _renderAgentBriefing();
}

// Llama a la EF agent-sustituciones con la fecha+tramo actual y muestra el resumen.
// Silencioso: si hay error o no hay tramo activo ahora, no muestra nada.
async function _renderAgentBriefing() {
  try {
    if (["admin", "director", "jefatura", "superadmin"].indexOf(role) === -1) return;
    var box = document.getElementById("agent-briefing");
    if (!box) return;

    // Tramo activo ahora mismo vs tramos_centro del centro (null si fuera de horario)
    var ahora = new Date();
    var ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    var tramoActual = null;
    var tr = await sb.from("tramos_centro")
      .select("numero,hora_inicio,hora_fin,es_descanso")
      .eq("centro_id", ctrId).order("numero");
    (tr.data || []).forEach(function (t) {
      if (t.es_descanso || tramoActual != null) return;
      var hi = String(t.hora_inicio || "").split(":");
      var hf = String(t.hora_fin || "").split(":");
      var ini = (parseInt(hi[0], 10) || 0) * 60 + (parseInt(hi[1], 10) || 0);
      var fin = (parseInt(hf[0], 10) || 0) * 60 + (parseInt(hf[1], 10) || 0);
      if (ahoraMin >= ini && ahoraMin < fin) tramoActual = t.numero;
    });
    if (tramoActual == null) { box.style.display = "none"; return; } // fuera de horario lectivo

    var hoy = ahora.toISOString().split("T")[0];
    var session = (await sb.auth.getSession()).data.session;
    var token = session && session.access_token;
    if (!token) return;

    var res = await fetch(SB_URL + "/functions/v1/agent-sustituciones", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({ centro_id: ctrId, fecha: hoy, tramo: tramoActual }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error || !data.content) return; // silencioso

    var cont = document.getElementById("agent-briefing-content");
    var time = document.getElementById("agent-briefing-time");
    if (cont) {
      cont.style.cssText = "font-size:13px;color:var(--txt);white-space:pre-wrap;line-height:1.5;";
      cont.textContent = data.content;
    }
    if (time) {
      var hh = String(ahora.getHours()).padStart(2, "0");
      var mm = String(ahora.getMinutes()).padStart(2, "0");
      time.textContent = "Actualizado a las " + hh + ":" + mm;
    }
    box.style.display = "block";
  } catch (e) { /* silencioso: no interrumpe el inicio */ }
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
      // Refresh the badge count for today's uncovered substitutions
      _sustRefreshBadge();
    })
    .subscribe();
}

async function _sustRefreshBadge() {
  try {
    var today = new Date().toISOString().split('T')[0];
    var r = await sb.from('sustituciones').select('id', { count: 'exact', head: true })
      .eq('centro_id', ctrId).eq('fecha', today).or('cubierta.eq.false,cubierta.is.null');
    var n = r.count || 0;
    var tabSust = document.getElementById('tab-sust');
    if (tabSust) tabSust.textContent = n > 0 ? '🔄 Sustituciones (' + n + ')' : '🔄 Sustituciones';
  } catch(e) {}
}
window._sustRefreshBadge = _sustRefreshBadge;

function showToast(msg) {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:calc(72px + env(safe-area-inset-bottom,0));left:50%;transform:translateX(-50%);background:#202124;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:90vw;text-align:center;';
  toast.textContent = '🔔 ' + msg;
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
}

// ── ONBOARDING FAMILIA ───────────────────────────────────────────────
// Wizard de primer acceso para cuentas familia. Solo se muestra una vez
// (localStorage key didactia_onb_{userId}). 4 pasos: Bienvenida →
// Tu hijo/a → Notificaciones → ¡Listo!

function _onbEsc(s) {
  return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function initOnboardingFamilia() {
  if (role !== "familia") return;
  if (!currentUser || !currentUser.id) return;
  var storageKey = "didactia_onb_" + currentUser.id;
  try { if (localStorage.getItem(storageKey)) return; } catch (e) {}

  var overlay = document.getElementById("onb-overlay");
  if (!overlay) return;

  // Rellenar paso 2 con datos reales del hijo
  var alumnos = currentUserAlumnos || [];
  var hijoHtml = "";
  if (alumnos.length) {
    var a = alumnos[0];
    var inicial = (a.nombre || "?").charAt(0).toUpperCase();
    var colorMap = ["#C76B3D","#4D6FA8","#3F9367","#D69540","#7A6BAB"];
    var h = 0; for (var i = 0; i < (a.nombre||"").length; i++) h = ((h<<5)-h) + a.nombre.charCodeAt(i);
    var col = colorMap[Math.abs(h) % colorMap.length];
    hijoHtml =
      '<div class="onb-avatar" style="background:' + col + ';">' + inicial + '</div>' +
      '<div class="onb-hijo-nombre">' + _onbEsc(a.nombre || "") + '</div>' +
      '<div class="onb-hijo-meta">' + _onbEsc(a.curso || "") + (a.grupo_horario ? " · " + _onbEsc(a.grupo_horario) : "") + '</div>';
    if (alumnos.length > 1) {
      hijoHtml += '<div style="font-size:12px;color:var(--muted);margin-top:8px;">Y ' + (alumnos.length - 1) + ' alumno' + (alumnos.length > 2 ? 's' : '') + ' más vinculado' + (alumnos.length > 2 ? 's' : '') + '</div>';
    }
  } else {
    hijoHtml = '<div style="font-size:36px;margin-bottom:8px;">🎓</div><div style="font-size:14px;color:var(--muted);">Tu cuenta ya está activa.<br>El centro te vinculará a tu hijo/a en breve.</div>';
  }
  var hijoBox = document.getElementById("onb-hijo-content");
  if (hijoBox) hijoBox.innerHTML = hijoHtml;

  // Ocultar paso notificaciones si el navegador no soporta Push
  var supPush = ("serviceWorker" in navigator) && ("PushManager" in window);
  if (!supPush) {
    var stepNot = document.getElementById("onb-step-3");
    if (stepNot) stepNot.dataset.skip = "1";
  }

  overlay.style.display = "flex";
  _onbIrPaso(1);
}

function _onbIrPaso(n) {
  [1, 2, 3, 4].forEach(function(i) {
    var el = document.getElementById("onb-step-" + i);
    if (el) el.style.display = i === n ? "" : "none";
  });
  // dots de progreso
  document.querySelectorAll(".onb-dot").forEach(function(d, idx) {
    d.classList.toggle("onb-dot-active", idx + 1 === n);
  });
}

window._onbNext = function() {
  // buscar el paso visible
  var cur = 1;
  [1, 2, 3, 4].forEach(function(i) {
    var el = document.getElementById("onb-step-" + i);
    if (el && el.style.display !== "none") cur = i;
  });
  var next = cur + 1;
  // saltar paso notificaciones si no hay soporte
  if (next === 3) {
    var stepNot = document.getElementById("onb-step-3");
    if (stepNot && stepNot.dataset.skip === "1") next = 4;
  }
  if (next > 4) { window._onbFinish(); return; }
  _onbIrPaso(next);
};

window._onbFinish = function() {
  try { localStorage.setItem("didactia_onb_" + (currentUser && currentUser.id || ""), "1"); } catch (e) {}
  var overlay = document.getElementById("onb-overlay");
  if (overlay) overlay.style.display = "none";
};

window._onbActivarPush = function() {
  var btn = document.getElementById("onb-push-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Activando…"; }
  if (typeof _pushActivar === "function") {
    _pushActivar().catch(function(){}).finally(function() {
      window._onbNext();
    });
  } else {
    window._onbNext();
  }
};

// ── INIT: llamar a mejoras tras login ──
function initWelcomeExtras() {
  loadDashboard();
  loadMisHijos();
  if (role === "familia" && modulosActivos.includes("comedor")) {
    loadComedorHijos();
  }
  // Onboarding de primer acceso — solo familia, solo una vez
  if (role === "familia") setTimeout(initOnboardingFamilia, 800);
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

// ── HOME FAMILIA ─────────────────────────────────────────────────────────────
var _homeFamiliaHijoIdx = 0;
var _homeFamiliaKey = "";

async function renderHomeFamilia(force) {
  var cont = document.getElementById("familia-home-content");
  if (!cont) return;
  if (role !== "familia") return;

  var alumnos = currentUserAlumnos || [];
  if (!alumnos.length) {
    cont.innerHTML = '<div class="home-card" style="color:var(--muted);font-size:13px;">No hay alumnos vinculados a esta cuenta.</div>';
    return;
  }

  var key = (ctrId || "") + "|" + alumnos.map(function(a) { return a.id; }).join(",") + "|" + _homeFamiliaHijoIdx;
  if (!force && key === _homeFamiliaKey) return;
  _homeFamiliaKey = key;

  if (_homeFamiliaHijoIdx >= alumnos.length) _homeFamiliaHijoIdx = 0;
  var alumno = alumnos[_homeFamiliaHijoIdx];

  // Hero card del alumno
  var fcc = document.getElementById("fam-child-card");
  var fcn = document.getElementById("fam-child-name");
  var fcm = document.getElementById("fam-child-meta");
  var fca = document.getElementById("fam-child-avatar");
  if (fcc && fcn) {
    if (fca) fca.textContent = (alumno.nombre || "—").charAt(0).toUpperCase();
    fcn.textContent = alumno.nombre || "—";
    if (fcm) fcm.textContent = [alumno.grupo_horario, alumno.curso].filter(Boolean).join(" · ");
    fcc.style.display = "";
  }

  // Selector de hijo (chips encima del hero si hay más de uno)
  var selectorHtml = "";
  if (alumnos.length > 1) {
    var chips = alumnos.map(function(a, i) {
      var active = (i === _homeFamiliaHijoIdx);
      return '<button onclick="window._fhSelectHijo(' + i + ')" style="' +
        'border:none;border-radius:20px;padding:5px 14px;font-size:13px;cursor:pointer;' +
        'font-family:var(--font-ui);transition:background .15s;' +
        (active ? 'background:var(--ink);color:#fff;' : 'background:var(--paper-2);color:var(--txt);border:1px solid var(--line);') +
        '">' + _mhEsc(a.nombre) + '</button>';
    }).join("");
    selectorHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' + chips + '</div>';
  }

  // Orden: horario (lo más relevante del día) → avisos → comedor → salidas → comunicados → incidencias
  cont.innerHTML =
    selectorHtml +
    '<div id="fh-horario" class="home-card" style="margin-bottom:8px;">' +
      '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-calendar"></i> Horario de hoy</span></div>' +
      '<div style="font-size:13px;color:var(--muted);">Cargando…</div>' +
    '</div>' +
    '<div id="fh-avisos"></div>' +
    '<div id="fh-comedor"  class="home-card" style="margin-bottom:8px;display:none;"></div>' +
    '<div id="fh-salidas"  class="home-card" style="margin-bottom:8px;display:none;"></div>' +
    '<div id="fh-comunicados" class="home-card" style="margin-bottom:8px;display:none;"></div>' +
    '<div id="fh-incidencias" class="home-card" style="margin-bottom:8px;display:none;"></div>' +
    '<div id="fh-recogida" class="home-card" style="margin-bottom:8px;"></div>' +
    '<div id="fh-menu" style="margin-bottom:8px;"></div>';

  window._fhSelectHijo = function(idx) {
    _homeFamiliaHijoIdx = idx;
    _homeFamiliaKey = "";
    renderHomeFamilia(true);
  };

  // Avisar al comedor que el hijo no come mañana, directamente desde el home.
  window._fhAvisoManana = async function(alumnoId) {
    try {
      var t = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      var res = await sb.from("asistencia_comedor").upsert({
        centro_id: ctrId, alumno_id: alumnoId, fecha: t,
        se_queda: false, plaza_fija: false,
        registrado_por: currentUserName || (currentUser && currentUser.email) || "familia",
      }, { onConflict: "centro_id,alumno_id,fecha" });
      if (res.error) throw res.error;
      if (typeof showToast === "function") showToast("✅ Aviso enviado: no come mañana");
      renderHomeFamilia(true);
    } catch (e) {
      if (typeof showToast === "function") showToast("No se pudo enviar el aviso");
    }
  };

  var DIAS = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  var now  = new Date();
  var dia  = DIAS[now.getDay()];
  var today = now.toISOString().split("T")[0];
  var finde = (now.getDay() === 0 || now.getDay() === 6);
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var hm = function(t) { if (!t) return null; var p = String(t).split(":"); return (+p[0]) * 60 + (+p[1]); };

  // ── Avisos del centro + cambios de clase hoy ──
  (async function() {
    var box = document.getElementById("fh-avisos");
    if (!box) return;
    var parts = "";
    // Aviso importante del centro (respeta visible_para)
    try {
      var av = await sb.from("info_centro")
        .select("datos,visible_para").eq("centro_id", ctrId)
        .eq("nombre_config", "aviso_activo").maybeSingle();
      var avTxt = (av.data && av.data.datos && av.data.datos.valor) ? String(av.data.datos.valor).trim() : "";
      var vis = (av.data && av.data.visible_para) || "todos";
      if (avTxt && (vis === "todos" || /famil/i.test(vis))) {
        parts += '<div class="home-card" style="margin-bottom:8px;border-left:3px solid var(--warning);background:var(--warning-soft);">' +
          '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-alert-circle"></i> Aviso del centro</span></div>' +
          '<div style="font-size:13px;color:var(--txt);">' + _mhEsc(avTxt) + '</div></div>';
      }
    } catch(e) {}
    // Cambios en clases hoy (sustituciones del grupo del hijo)
    try {
      var grupo = alumno.grupo_horario;
      if (grupo && !finde) {
        var sr = await sb.from("sustituciones")
          .select("tramo,hora_inicio,hora_fin,profesor_ausente,profesor_sustituto,cubierta")
          .eq("centro_id", ctrId).eq("fecha", today)
          .eq("grupo_horario", grupo).order("tramo");
        var subs = sr.data || [];
        if (subs.length) {
          var rows = subs.map(function(s) {
            var hi = String(s.hora_inicio || "").slice(0,5), hf = String(s.hora_fin || "").slice(0,5);
            var badge = s.cubierta
              ? '<span style="background:var(--success-soft);color:var(--success);border-radius:8px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap;">Cubierta ✓</span>'
              : '<span style="background:var(--warning-soft);color:var(--warning);border-radius:8px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap;">Pendiente</span>';
            return '<div style="padding:6px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:8px;align-items:baseline;">' +
              '<div><div style="font-size:13px;font-weight:500;color:var(--txt);">' + _mhEsc(hi + (hf ? "–" + hf : "")) + '</div>' +
              '<div style="font-size:11px;color:var(--muted);">Falta: ' + _mhEsc(s.profesor_ausente || "—") +
              (s.profesor_sustituto ? ' · cubre ' + _mhEsc(s.profesor_sustituto) : '') + '</div></div>' + badge + '</div>';
          }).join("");
          parts += '<div class="home-card" style="margin-bottom:8px;">' +
            '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-replace"></i> Cambios en clases hoy</span></div>' + rows + '</div>';
        }
      }
    } catch(e) {}
    box.innerHTML = parts;
  })();

  // ── Horario de hoy ──
  (async function() {
    var box = document.getElementById("fh-horario");
    if (!box) return;
    try {
      var grupo = alumno.grupo_horario;
      if (!grupo) {
        box.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-calendar"></i> Horario de hoy</span></div>' +
          '<div style="font-size:13px;color:var(--muted);">Grupo no asignado.</div>';
        return;
      }
      if (finde) {
        box.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-calendar"></i> Horario de hoy</span></div>' +
          '<div style="font-size:13px;color:var(--muted);"><i class="ti ti-coffee"></i> ¡Buen fin de semana!</div>';
        return;
      }
      var r = await sb.from("horarios_grupo")
        .select("tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre,aula")
        .eq("centro_id", ctrId).eq("grupo_horario", grupo).eq("dia", dia)
        .eq("curso_escolar", cursoActivo).order("tramo");
      var filas = r.data || [];
      if (!filas.length) {
        box.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-calendar"></i> Horario de hoy</span></div>' +
          '<div style="font-size:13px;color:var(--muted);">No hay clases hoy para ' + _mhEsc(grupo) + '.</div>';
        return;
      }
      var rowsHtml = filas.map(function(row) {
        var ini = hm(row.hora_inicio), fin = hm(row.hora_fin);
        var ahora = (ini != null && fin != null && nowMin >= ini && nowMin < fin);
        var horaTxt = (row.hora_inicio || "").slice(0,5) + (row.hora_fin ? "–" + String(row.hora_fin).slice(0,5) : "");
        return '<div class="home-horario-row' + (ahora ? " is-now" : "") + '">' +
          '<div class="hh-tramo">' + (row.tramo != null ? row.tramo + "ª" : "—") + (ahora ? '<span class="hh-now">AHORA</span>' : "") + '</div>' +
          '<div class="hh-main">' +
            '<div class="hh-asig">' + _mhEsc(row.actividad_nombre || "—") + '</div>' +
            '<div class="hh-meta">' + _mhEsc(horaTxt) +
              (row.aula ? " · " + _mhEsc(row.aula) : "") +
              (row.profesor_nombre ? " · " + _mhEsc(row.profesor_nombre) : "") +
            '</div>' +
          '</div></div>';
      }).join("");
      box.innerHTML = '<div class="home-card-hdr">' +
        '<span class="home-card-title"><i class="ti ti-calendar"></i> Horario de hoy</span>' +
        '<span style="font-size:12px;color:var(--muted);">' + _mhEsc(grupo) + '</span>' +
        '</div>' + rowsHtml;
    } catch(e) {
      var b = document.getElementById("fh-horario");
      if (b) b.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-calendar"></i> Horario de hoy</span></div>' +
        '<div style="font-size:13px;color:var(--muted);">No disponible.</div>';
    }
  })();

  // ── Comedor: estado de hoy + acción "no come mañana" ──
  (async function() {
    if (!modulosActivos.includes("comedor")) return;
    var box = document.getElementById("fh-comedor");
    if (!box) return;
    try {
      var tmrw = new Date(now.getTime() + 86400000).toISOString().split("T")[0];
      var r = await sb.from("asistencia_comedor")
        .select("fecha,se_queda,plaza_fija").eq("centro_id", ctrId)
        .eq("alumno_id", alumno.id).in("fecha", [today, tmrw]);
      var recs = r.data || [];
      var hoy = recs.find(function(x) { return x.fecha === today; });
      var man = recs.find(function(x) { return x.fecha === tmrw; });
      var txt, col;
      if (!hoy)              { txt = "Sin confirmar";        col = "var(--warning)"; }
      else if (hoy.se_queda) { txt = "Se queda a comer ✓";   col = "var(--success)"; }
      else                    { txt = "No se queda a comer";  col = "var(--muted)"; }
      var manHtml = (man && man.se_queda === false)
        ? '<div style="margin-top:10px;font-size:12px;color:var(--success);">✅ Avisado: no come mañana</div>'
        : '<button class="fam-comedor-action" onclick="window._fhAvisoManana(\'' + alumno.id + '\')">📩 Avisar que no come mañana</button>';
      box.style.display = "";
      box.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-tools-kitchen-2"></i> Comedor</span></div>' +
        '<div style="font-size:14px;font-weight:500;color:' + col + ';">Hoy: ' + txt + '</div>' +
        (hoy && hoy.plaza_fija ? '<div style="font-size:11px;color:var(--muted-2);margin-top:2px;">Plaza fija</div>' : '') +
        manHtml;
    } catch(e) {}
  })();

  // ── Incidencias recientes ──
  (async function() {
    var box = document.getElementById("fh-incidencias");
    if (!box) return;
    try {
      // RPC SECURITY DEFINER: solo incidencias de los hijos de la familia (campos
      // visibles, sin informe interno). Filtramos por el hijo seleccionado.
      var rr = await sb.rpc("familia_incidencias_hijos");
      var nom = (alumno.nombre || "").toLowerCase();
      var data = (rr.data || []).filter(function(x) {
        return (x.alumno_nombre || "").toLowerCase().indexOf(nom) !== -1;
      }).slice(0, 3);
      if (!data.length) return;
      var gravCol = { leve:"var(--success)", grave:"var(--warning)", muy_grave:"var(--danger)" };
      var rowsHtml = data.map(function(inc) {
        var col = gravCol[inc.gravedad] || "var(--muted)";
        var desc = (inc.descripcion || "").slice(0, 70) + ((inc.descripcion || "").length > 70 ? "…" : "");
        return '<div style="padding:5px 0;border-bottom:1px solid var(--line);font-size:12px;display:flex;gap:8px;align-items:baseline;">' +
          '<span style="color:var(--muted);white-space:nowrap;">' + _mhEsc(inc.fecha || "") + '</span>' +
          '<span style="background:' + col + ';color:#fff;border-radius:8px;padding:1px 6px;font-size:10px;font-weight:600;white-space:nowrap;">' + _mhEsc(inc.gravedad || "") + '</span>' +
          '<span style="color:var(--txt);">' + _mhEsc(desc) + '</span>' +
          '</div>';
      }).join("");
      box.style.display = "";
      box.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-alert-triangle"></i> Incidencias recientes</span></div>' + rowsHtml;
    } catch(e) {}
  })();

  // ── Próximas salidas ──
  (async function() {
    var box = document.getElementById("fh-salidas");
    if (!box) return;
    try {
      var rPart = await sb.from("participantes_salida")
        .select("salida_id,autorizado,pagado")
        .eq("centro_id", ctrId).eq("alumno_id", alumno.id);
      if (!rPart.data || !rPart.data.length) return;
      var salidaIds = rPart.data.map(function(p) { return p.salida_id; });
      var partMap = {};
      rPart.data.forEach(function(p) { partMap[p.salida_id] = p; });
      var rSal = await sb.from("salidas_didacticas")
        .select("id,titulo,fecha_salida,hora_salida")
        .eq("centro_id", ctrId).in("id", salidaIds)
        .eq("estado", "publicada").gte("fecha_salida", today)
        .order("fecha_salida").limit(3);
      if (!rSal.data || !rSal.data.length) return;
      var rowsHtml = rSal.data.map(function(sal) {
        var part = partMap[sal.id] || {};
        var aut = part.autorizado
          ? '<span style="color:var(--success);font-size:11px;">✓ Autorizado</span>'
          : '<span style="color:var(--warning);font-size:11px;">⚠ Pendiente autorización</span>';
        return '<div style="padding:6px 0;border-bottom:1px solid var(--line);">' +
          '<div style="font-size:13px;font-weight:500;color:var(--txt);">' + _mhEsc(sal.titulo || "") + '</div>' +
          '<div style="font-size:11px;color:var(--muted);display:flex;gap:8px;align-items:center;margin-top:2px;">' +
            _mhEsc(sal.fecha_salida || "") + (sal.hora_salida ? " " + _mhEsc(String(sal.hora_salida).slice(0,5)) : "") +
            " " + aut +
          '</div></div>';
      }).join("");
      box.style.display = "";
      box.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-bus"></i> Próximas salidas</span></div>' + rowsHtml;
    } catch(e) {}
  })();

  // ── Comunicados no leídos ──
  (async function() {
    var box = document.getElementById("fh-comunicados");
    if (!box) return;
    try {
      var leidos = (typeof _comGetLeidos === "function") ? _comGetLeidos() : [];
      var r = await sb.from("comunicados")
        .select("id,titulo,fecha").eq("centro_id", ctrId)
        .order("created_at", { ascending: false }).limit(50);
      var unread = (r.data || []).filter(function(c) { return leidos.indexOf(c.id) === -1; }).slice(0, 3);
      if (!unread.length) return;
      var rowsHtml = unread.map(function(c) {
        return '<div style="padding:5px 0;border-bottom:1px solid var(--line);">' +
          '<div style="font-size:13px;font-weight:500;color:var(--txt);">' + _mhEsc(c.titulo || "") + '</div>' +
          '<div style="font-size:11px;color:var(--muted);">' + _mhEsc(c.fecha || "") + '</div>' +
          '</div>';
      }).join("");
      box.style.display = "";
      box.innerHTML = '<div class="home-card-hdr">' +
        '<span class="home-card-title"><i class="ti ti-speakerphone"></i> Comunicados no leídos</span>' +
        '<span style="background:var(--danger);color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600;">' + unread.length + '</span>' +
        '</div>' + rowsHtml +
        '<div style="margin-top:8px;"><button class="fam-ver-mas" onclick="showTab(\'comunicados\')">Ver todos los comunicados →</button></div>';
    } catch(e) {}
  })();

  // ── Personas autorizadas para recoger ──
  _fhCargarRecogida(alumno);

  // ── Menú del comedor (semana actual; se oculta si no hay nada publicado) ──
  if (typeof renderMenuComedor === "function") {
    try { renderMenuComedor("fh-menu", { hideIfEmpty: true }); } catch (e) {}
  }
}

// Personas autorizadas a recoger al alumno (gestión por la familia).
async function _fhCargarRecogida(alumno) {
  var box = document.getElementById("fh-recogida");
  if (!box || !alumno) return;
  try {
    var r = await sb.from("personas_autorizadas").select("id,nombre,relacion,telefono")
      .eq("centro_id", ctrId).eq("alumno_id", alumno.id).order("created_at");
    var rows = (r.data || []).map(function(p) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px;">' +
        '<span style="flex:1;">🧑 ' + _mhEsc(p.nombre) + (p.relacion ? ' <span style="color:var(--muted);">· ' + _mhEsc(p.relacion) + '</span>' : '') +
        (p.telefono ? ' <span style="color:var(--muted);">· ' + _mhEsc(p.telefono) + '</span>' : '') + '</span>' +
        '<button onclick="window._fhQuitarRecogida(\'' + p.id + '\')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px;" title="Quitar">✕</button>' +
        '</div>';
    }).join("");
    box.innerHTML = '<div class="home-card-hdr"><span class="home-card-title"><i class="ti ti-user-shield"></i> Recogida — personas autorizadas</span></div>' +
      (rows || '<div style="font-size:12px;color:var(--muted);padding:4px 0;">Aún no has añadido a nadie. Solo estas personas podrán recoger a ' + _mhEsc((alumno.nombre || "").split(",")[0].trim()) + '.</div>') +
      '<div style="margin-top:8px;"><button class="fam-ver-mas" onclick="window._fhAnadirRecogida(\'' + alumno.id + '\')">+ Añadir persona autorizada</button></div>';
  } catch(e) { box.innerHTML = ''; }
}

window._fhAnadirRecogida = async function(alumnoId) {
  var nombre = prompt("Nombre completo de la persona autorizada:");
  if (!nombre || !nombre.trim()) return;
  var relacion = prompt("Relación con el alumno (ej: abuela, tío, vecino):") || null;
  var telefono = prompt("Teléfono de contacto (opcional):") || null;
  var ins = await sb.from("personas_autorizadas").insert({
    centro_id: ctrId, alumno_id: alumnoId, nombre: nombre.trim(),
    relacion: relacion, telefono: telefono, creado_por: currentUser ? currentUser.id : null
  });
  if (ins.error) { if (typeof showToast === "function") showToast("No se pudo guardar"); return; }
  var alumno = (currentUserAlumnos || []).find(function(a) { return a.id === alumnoId; });
  _fhCargarRecogida(alumno);
};

window._fhQuitarRecogida = async function(id) {
  if (!confirm("¿Quitar a esta persona de la lista de autorizados?")) return;
  await sb.from("personas_autorizadas").delete().eq("id", id);
  var alumno = (currentUserAlumnos || [])[_homeFamiliaHijoIdx];
  _fhCargarRecogida(alumno);
};

// ── PUSH NOTIFICATIONS ──────────────────────────────────────────────────────
// VAPID_PUBLIC_KEY ya definido en config.js — no redeclarar aquí.

function _urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(base64);
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function initPushButton() {
  var btn = document.getElementById('push-notif-btn');
  if (!btn || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  btn.style.display = '';
  await _updatePushBtnState();
}

async function _updatePushBtnState() {
  var icon = document.getElementById('push-notif-icon');
  if (!icon) return;
  var reg = await navigator.serviceWorker.ready;
  var sub = await reg.pushManager.getSubscription();
  if (sub) {
    icon.className = 'ti ti-bell-ringing';
    document.getElementById('push-notif-btn').title = '✓ Notificaciones activas — pulsa para desactivar';
  } else {
    icon.className = 'ti ti-bell';
    document.getElementById('push-notif-btn').title = 'Activar notificaciones push';
  }
}

async function togglePushNotification() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Tu navegador no soporta notificaciones push.');
    return;
  }
  var reg = await navigator.serviceWorker.ready;
  var sub = await reg.pushManager.getSubscription();

  if (sub) {
    // Desactivar
    await sub.unsubscribe();
    await sb.from('push_subscriptions').delete().eq('user_id', currentUser.id);
    await _updatePushBtnState();
    return;
  }

  // Activar
  var perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  try {
    var newSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await sb.from('push_subscriptions').upsert({
      user_id:      currentUser.id,
      centro_id:    ctrId,
      subscription: JSON.parse(JSON.stringify(newSub))
    }, { onConflict: 'user_id' });
    await _updatePushBtnState();
  } catch(e) {
    console.error('[push]', e);
    alert('No se pudo activar: ' + e.message);
  }
}

// Se llama desde loadUserProfile (auth.js) con setTimeout
window._initPushButton = function() { initPushButton().catch(function() {}); };
