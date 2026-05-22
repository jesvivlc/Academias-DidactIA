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
  const container = document.getElementById("rrhh-container");
  if (!container) return;

  if (!_rrhhMiProfileId) {
    const { data: p } = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
    _rrhhMiProfileId = p ? p.id : null;
  }

  const hoy = new Date().toISOString().split("T")[0];

  container.innerHTML =
    '<div class="pg-hdr">' +
      '<div>' +
        '<div class="pg-title">Mis ausencias</div>' +
        '<div class="pg-sub">Solicita y consulta tus ausencias</div>' +
      '</div>' +
      '<button class="btn btn-p" onclick="mostrarFormAusencia()">+ Solicitar ausencia</button>' +
    '</div>' +

    '<div class="card" id="rrhh-form-wrap" style="display:none;">' +
      '<div class="card-hdr">' +
        '<div class="card-ico b">📋</div>' +
        '<div><div class="card-title">Nueva solicitud de ausencia</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
        '<div><label class="lbl">Fecha inicio *</label>' +
          '<input class="fi" type="date" id="rrhh-fecha-ini" value="' + hoy + '" /></div>' +
        '<div><label class="lbl">Fecha fin *</label>' +
          '<input class="fi" type="date" id="rrhh-fecha-fin" value="' + hoy + '" /></div>' +
        '<div style="grid-column:1/-1;"><label class="lbl">Tipo *</label>' +
          '<select class="fi" id="rrhh-tipo">' +
            '<option value="baja_medica">🏥 Baja médica</option>' +
            '<option value="permiso">📋 Permiso</option>' +
            '<option value="asunto_propio" selected>🗂️ Asunto propio</option>' +
            '<option value="formacion">📚 Formación</option>' +
            '<option value="sindical">⚖️ Sindical</option>' +
            '<option value="otros">📝 Otros</option>' +
          '</select></div>' +
      '</div>' +
      '<div><label class="lbl">Motivo (opcional)</label>' +
        '<textarea class="fa" id="rrhh-motivo" placeholder="Describe brevemente el motivo…" style="min-height:70px;"></textarea></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '<button class="btn btn-p" onclick="solicitarAusencia()">📨 Enviar solicitud</button>' +
        '<button class="btn btn-s" onclick="ocultarFormAusencia()">Cancelar</button>' +
        '<div id="rrhh-msg" style="display:none;font-size:13px;"></div>' +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-hdr">' +
        '<div class="card-ico o">📅</div>' +
        '<div><div class="card-title">Historial de solicitudes</div></div>' +
      '</div>' +
      '<div id="rrhh-lista-prof">' +
        '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;"><span class="spin">⟳</span> Cargando…</div>' +
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
    var rechazoInfo = (a.estado === "rechazada" && a.motivo_rechazo)
      ? '<div style="font-size:11px;color:var(--red);margin-top:3px;">Motivo: ' + a.motivo_rechazo + '</div>'
      : "";
    return '<tr>' +
      '<td>' + fechaStr + '</td>' +
      '<td style="font-size:12px;">' + (AUSENCIA_TIPOS[a.tipo] || a.tipo || "—") + '</td>' +
      '<td style="font-size:12px;color:var(--txt3);">' + (a.motivo || "—") + '</td>' +
      '<td>' + _badgeEstado(a.estado || "pendiente") + rechazoInfo + '</td>' +
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
      '<button class="btn btn-p" onclick="_cargarAusenciasAdmin()">↺ Actualizar</button>' +
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

  await _cargarAusenciasAdmin();
}

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
      ? '<div style="display:flex;gap:5px;">' +
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
  if (!confirm("¿Aprobar esta ausencia?\nSe generarán automáticamente los tramos sin cubrir en Sustituciones.")) return;

  var ausencia = null;
  for (var i = 0; i < _rrhhAusencias.length; i++) {
    if (_rrhhAusencias[i].id === id) { ausencia = _rrhhAusencias[i]; break; }
  }
  if (!ausencia) return;

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

  await _cargarAusenciasAdmin();
}

async function rechazarAusencia(id) {
  var motivo = prompt("Motivo del rechazo (opcional):");
  if (motivo === null) return;

  var upd = await sb.from("ausencias_profesor")
    .update({ estado: "rechazada", motivo_rechazo: motivo.trim() || null })
    .eq("id", id);

  if (upd.error) { alert("Error al rechazar: " + upd.error.message); return; }
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

  var tramosResult = await sb.from("horarios_grupo")
    .select("tramo, hora_inicio, hora_fin, grupo_horario, dia")
    .eq("centro_id", ctrId)
    .in("dia", diasNeeded)
    .eq("profesor_nombre", profesorNombre);

  var tramosPorDia = {};
  (tramosResult.data || []).forEach(function(t) {
    if (!tramosPorDia[t.dia]) tramosPorDia[t.dia] = [];
    tramosPorDia[t.dia].push(t);
  });

  var obs = (AUSENCIA_TIPOS[ausencia.tipo] || ausencia.tipo || "Ausencia") +
    (ausencia.motivo ? " — " + ausencia.motivo : "");

  var inserts = [];
  dateRange.forEach(function(entry) {
    (tramosPorDia[entry.dia] || []).forEach(function(t) {
      inserts.push({
        centro_id:          ctrId,
        fecha:              entry.fecha,
        hora_inicio:        t.hora_inicio,
        hora_fin:           t.hora_fin,
        tramo:              t.tramo,
        grupo_horario:      t.grupo_horario,
        profesor_ausente:   profesorNombre,
        profesor_sustituto: "",
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
  } else {
    alert("✅ Ausencia aprobada. No se encontraron tramos de " + profesorNombre + " en horarios para esas fechas.");
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
