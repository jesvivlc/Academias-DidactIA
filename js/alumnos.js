// ── MÓDULO ALUMNOS ───────────────────────────────────────────────────
// Directorio de alumnos del centro: split lista + drawer de perfil.
// Visible para profesional/admin/dirección/superadmin (no familia).

var _alData = [];
var _alSearch = "";
var _alGrupo = "";
var _alLoaded = false;
var _alPendingFicha = null;
var _alSelectedId = null;   // alumno activo en el drawer

function _alEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function _alArg(v) {
  return "'" + String(v == null ? "" : v)
    .replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;") + "'";
}

// Iniciales para avatar (máx 2 letras)
function _alInitials(nombre) {
  return (nombre || "?").split(" ").slice(0, 2).map(function(s) { return s[0] || ""; }).join("").toUpperCase();
}

// Color de avatar determinístico por nombre
var _AL_TONES = ["#C76B3D","#4D6FA8","#3F9367","#D69540","#7A6BAB","#C24D2F","#2E7B8C"];
function _alAvatarColor(nombre) {
  var h = 0;
  for (var i = 0; i < (nombre || "").length; i++) h = ((h << 5) - h) + (nombre.charCodeAt(i));
  return _AL_TONES[Math.abs(h) % _AL_TONES.length];
}

async function initAlumnos(forceReload) {
  var panel = document.getElementById("panel-alumnos");
  if (!panel) return;

  // Shell split: lista izquierda + drawer derecha
  panel.innerHTML =
    '<div class="al-split">' +
      // ── Columna lista ──
      '<div class="al-list-col">' +
        '<div class="al-list-hdr">' +
          '<div>' +
            '<div class="pg-eyebrow">Directorio</div>' +
            '<div class="al-count" id="al-count">… alumnos</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn btn-s" onclick="_alExportar()">⬇ Excel</button>' +
            '<button class="btn btn-p" onclick="initAlumnos(true)">↺</button>' +
          '</div>' +
        '</div>' +
        '<div class="al-search-row">' +
          '<div class="al-search-wrap">' +
            '<span class="al-search-ico">🔍</span>' +
            '<input class="al-search-input" id="al-search" placeholder="Buscar por nombre…" ' +
              'oninput="_alOnSearch(this.value)" />' +
          '</div>' +
          '<div class="al-pills" id="al-grupos"></div>' +
        '</div>' +
        '<div class="al-table-wrap" id="al-table-wrap">' +
          '<div style="text-align:center;color:var(--muted);padding:40px 0;"><span class="spin">⟳</span> Cargando…</div>' +
        '</div>' +
      '</div>' +
      // ── Drawer perfil ──
      '<div class="al-drawer" id="al-drawer">' +
        '<div class="al-drawer-empty" id="al-drawer-empty">' +
          '<div style="font-size:32px;margin-bottom:12px;">🎓</div>' +
          '<div style="font-size:14px;font-weight:500;color:var(--ink);margin-bottom:4px;">Selecciona un alumno</div>' +
          '<div style="font-size:12px;color:var(--muted);">Haz clic en cualquier fila para ver su perfil</div>' +
        '</div>' +
        '<div id="al-drawer-content" style="display:none;height:100%;"></div>' +
      '</div>' +
    '</div>';

  var searchEl = document.getElementById("al-search");
  if (searchEl) searchEl.value = _alSearch;

  if (forceReload === true) _alLoaded = false;
  if (!_alLoaded) {
    var r = await sb.from("alumnos")
      .select("id,nombre,curso,grupo_horario")
      .eq("centro_id", ctrId)
      .order("grupo_horario", { ascending: true })
      .order("nombre", { ascending: true })
      .limit(5000);
    _alData = r.data || [];
    _alLoaded = true;
  }

  _alRenderGrupos();
  _alRenderList();

  if (_alPendingFicha) {
    var pid = _alPendingFicha;
    _alPendingFicha = null;
    alumnosAbrirFicha(pid);
  } else if (_alSelectedId) {
    alumnosAbrirFicha(_alSelectedId);
  }
}

window.alumnosVerFicha = function(alumnoId) {
  _alPendingFicha = alumnoId;
  if (typeof showTab === "function") showTab("alumnos");
};

window.alumnosRegistrarIncidencia = function(nombre, grupo) {
  if (typeof showTab === "function") showTab("incidencias");
  var intentos = 0;
  var prefill = function() {
    intentos++;
    var inp = document.getElementById("inc-alumno");
    var grp = document.getElementById("inc-grupo");
    var desc = document.getElementById("inc-desc");
    var vistaAdmin = document.getElementById("inc-vista-admin");
    var visible = vistaAdmin && vistaAdmin.style.display !== "none";
    if (inp && visible) {
      inp.value = nombre || "";
      if (grp) grp.value = grupo || "";
      if (desc) { try { desc.focus(); } catch (e) {} }
      return;
    }
    if (intentos < 25) setTimeout(prefill, 100);
  };
  setTimeout(prefill, 150);
};

function _alOnSearch(v) {
  _alSearch = v || "";
  _alRenderList();
}

function _alFiltrarGrupo(g) {
  _alGrupo = (_alGrupo === g) ? "" : g;
  _alRenderGrupos();
  _alRenderList();
}

function _alRenderGrupos() {
  var cont = document.getElementById("al-grupos");
  if (!cont) return;
  var grupos = [];
  _alData.forEach(function(a) {
    if (a.grupo_horario && grupos.indexOf(a.grupo_horario) === -1) grupos.push(a.grupo_horario);
  });
  grupos.sort();
  var chip = function(label, val, active) {
    return '<button onclick="_alFiltrarGrupo(' + _alArg(val) + ')" class="pill' + (active ? ' pill-active' : '') + '">' +
      _alEsc(label) + '</button>';
  };
  var html = chip("Todos", "", _alGrupo === "");
  grupos.forEach(function(g) { html += chip(g, g, _alGrupo === g); });
  cont.innerHTML = html;
}

function _alFiltradas() {
  var q = _alSearch.trim().toLowerCase();
  return _alData.filter(function(a) {
    if (_alGrupo && a.grupo_horario !== _alGrupo) return false;
    if (q && (a.nombre || "").toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

function _alExportar() {
  if (typeof XLSX === "undefined") { if (typeof showToast === "function") showToast("Exportación no disponible"); return; }
  var rows = _alFiltradas();
  if (!rows.length) { if (typeof showToast === "function") showToast("No hay alumnos que exportar"); return; }
  var aoa = [["Nombre", "Curso", "Grupo"]].concat(rows.map(function(a) {
    return [a.nombre || "", a.curso || "", a.grupo_horario || ""];
  }));
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 12 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Alumnos");
  var hoy = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, "alumnos_" + (_alGrupo || "centro") + "_" + hoy + ".xlsx");
}

function _alRenderList() {
  var wrap = document.getElementById("al-table-wrap");
  if (!wrap) return;
  var rows = _alFiltradas();

  var countEl = document.getElementById("al-count");
  if (countEl) {
    var txt = rows.length + " alumno" + (rows.length === 1 ? "" : "s");
    if (_alGrupo) txt += " · " + _alGrupo;
    if (_alSearch.trim()) txt += ' · "' + _alSearch.trim() + '"';
    countEl.textContent = txt;
  }

  if (!rows.length) {
    wrap.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px 20px;font-size:13px;">Sin resultados.</div>';
    return;
  }

  var trs = rows.map(function(a) {
    var initials = _alInitials(a.nombre);
    var avatarColor = _alAvatarColor(a.nombre);
    var isSelected = a.id === _alSelectedId;
    return '<tr class="al-row' + (isSelected ? ' al-row-selected' : '') + '" ' +
      'onclick="_alSelectRow(' + _alArg(a.id) + ')" data-id="' + _alEsc(a.id) + '">' +
      '<td class="al-td-name">' +
        '<div class="al-cell-avatar">' +
          '<div class="al-avatar" style="background:' + avatarColor + ';">' + _alEsc(initials) + '</div>' +
          '<div class="al-cell-stack">' +
            '<span class="al-cell-name">' + _alEsc(a.nombre || "—") + '</span>' +
            '<span class="al-cell-sub">' + _alEsc(a.grupo_horario || "—") + '</span>' +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td class="al-td-curso">' + _alEsc(a.curso || "—") + '</td>' +
    '</tr>';
  }).join("");

  wrap.innerHTML =
    '<table class="al-tbl">' +
      '<thead>' +
        '<tr>' +
          '<th>Alumno</th>' +
          '<th>Curso</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + trs + '</tbody>' +
    '</table>';
}

function _alSelectRow(alumnoId) {
  _alSelectedId = alumnoId;
  // Actualizar estado visual de la fila seleccionada
  document.querySelectorAll(".al-row").forEach(function(tr) {
    tr.classList.toggle("al-row-selected", tr.dataset.id === alumnoId);
  });
  alumnosAbrirFicha(alumnoId);
}

// ── FICHA EN DRAWER ──────────────────────────────────────────────────
async function alumnosAbrirFicha(alumnoId) {
  _alSelectedId = alumnoId;

  // Si el panel no está en modo split (apertura directa desde ⌘K), inicializar el panel
  var split = document.querySelector(".al-split");
  if (!split) {
    _alPendingFicha = alumnoId;
    if (typeof showTab === "function") showTab("alumnos");
    return;
  }

  // Mostrar spinner en el drawer
  var empty = document.getElementById("al-drawer-empty");
  var content = document.getElementById("al-drawer-content");
  if (empty) empty.style.display = "none";
  if (content) { content.style.display = ""; content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);"><span class="spin">⟳</span> Cargando…</div>'; }

  // Actualizar fila seleccionada en la tabla
  document.querySelectorAll(".al-row").forEach(function(tr) {
    tr.classList.toggle("al-row-selected", tr.dataset.id === alumnoId);
  });

  var a = _alData.find(function(x) { return x.id === alumnoId; }) || null;
  if (!a) {
    try {
      var rr = await sb.from("alumnos").select("id,nombre,curso,grupo_horario")
        .eq("centro_id", ctrId).eq("id", alumnoId).maybeSingle();
      a = rr.data || {};
    } catch (e) { a = {}; }
  }

  if (!content) return;

  var grupo = a.grupo_horario || "";
  var initials = _alInitials(a.nombre);
  var avatarColor = _alAvatarColor(a.nombre);

  var rolesIncAdmin = ["admin", "admin_institucional", "superadmin"];
  var puedeInc = (typeof role !== "undefined") && rolesIncAdmin.indexOf(role) !== -1;
  var accionInc = puedeInc
    ? '<button class="btn btn-s" onclick="alumnosRegistrarIncidencia(' + _alArg(a.nombre || "") + ',' + _alArg(grupo) + ')">⚠️ Incidencia</button>'
    : "";

  content.innerHTML =
    '<div class="al-drawer-inner">' +
      // Head: avatar + nombre + curso
      '<div class="al-drw-head">' +
        '<div class="al-drw-avatar-lg" style="background:' + avatarColor + ';">' + _alEsc(initials) + '</div>' +
        '<div class="al-drw-meta">' +
          '<div class="pg-eyebrow">' + _alEsc(grupo || "—") + ' · ' + _alEsc(a.curso || "—") + '</div>' +
          '<div class="al-drw-name">' + _alEsc(a.nombre || "Alumno") + '</div>' +
        '</div>' +
      '</div>' +

      // Pestañas
      '<div class="al-drw-tabs" id="al-drw-tabs">' +
        '<button class="al-drw-tab al-drw-tab-active" onclick="_alDrwTab(\'perfil\',this)">Perfil</button>' +
        '<button class="al-drw-tab" onclick="_alDrwTab(\'horario\',this)">Horario</button>' +
        '<button class="al-drw-tab" onclick="_alDrwTab(\'actividad\',this)">Actividad</button>' +
      '</div>' +

      // Cuerpo por tab
      '<div class="al-drw-body" id="al-drw-body">' +
        '<div id="al-drw-perfil">' +
          '<div id="al-ficha-familias" class="al-drw-section"><span style="color:var(--muted);">Cargando familias…</span></div>' +
          '<div id="al-ficha-recogida" style="display:none;"></div>' +
          '<div id="al-ficha-comedor" style="display:none;"></div>' +
          '<div id="al-ficha-incidencias" style="display:none;"></div>' +
          '<div id="al-ficha-calif" style="display:none;"></div>' +
        '</div>' +
        '<div id="al-drw-horario" style="display:none;">' +
          '<div id="al-ficha-horario"><span style="color:var(--muted);">Cargando horario…</span></div>' +
        '</div>' +
        '<div id="al-drw-actividad" style="display:none;">' +
          '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Próximamente: línea de actividad reciente del alumno.</div>' +
        '</div>' +
      '</div>' +

      // Footer de acciones
      '<div class="al-drw-foot">' +
        '<button class="btn btn-s" id="al-pdf-btn" onclick="alumnosExportarFichaPDF(' + _alArg(alumnoId) + ')">⬇ PDF</button>' +
        accionInc +
      '</div>' +
    '</div>';

  // Cargar secciones async (fire-and-forget)
  _alLoadFamilias(alumnoId);
  _alLoadRecogida(alumnoId);
  _alLoadHorario(grupo);
  _alLoadComedor(alumnoId);
  _alLoadIncidencias(a);
  _alLoadCalif(alumnoId);
}

function _alDrwTab(tabId, btn) {
  ["perfil","horario","actividad"].forEach(function(t) {
    var el = document.getElementById("al-drw-" + t);
    if (el) el.style.display = t === tabId ? "" : "none";
  });
  document.querySelectorAll(".al-drw-tab").forEach(function(b) {
    b.classList.toggle("al-drw-tab-active", b === btn);
  });
}

// ── Loaders async ─────────────────────────────────────────────────────

async function _alLoadRecogida(alumnoId) {
  var box = document.getElementById("al-ficha-recogida");
  if (!box) return;
  try {
    var r = await sb.from("personas_autorizadas").select("nombre,relacion,telefono")
      .eq("centro_id", ctrId).eq("alumno_id", alumnoId).order("created_at");
    var list = r.data || [];
    if (!list.length) return;
    box.style.display = "";
    box.innerHTML = '<div class="al-drw-label">🔒 Recogida autorizada</div>' +
      list.map(function(p) {
        return '<div style="font-size:13px;color:var(--txt);padding:3px 0;">🧑 ' + _alEsc(p.nombre) +
          (p.relacion ? ' <span style="color:var(--muted);">· ' + _alEsc(p.relacion) + '</span>' : '') +
          (p.telefono ? ' <span style="color:var(--muted);">· ' + _alEsc(p.telefono) + '</span>' : '') + '</div>';
      }).join("");
  } catch (e) {}
}

async function _alLoadFamilias(alumnoId) {
  var box = document.getElementById("al-ficha-familias");
  if (!box) return;
  try {
    var rv = await sb.from("familia_alumno").select("profile_id").eq("alumno_id", alumnoId);
    var pids = (rv.data || []).map(function(x) { return x.profile_id; }).filter(Boolean);
    var fams = [];
    if (pids.length) {
      var rp = await sb.from("profiles").select("full_name,email,rol").in("id", pids);
      fams = rp.data || [];
    }
    if (!fams.length) {
      box.innerHTML = '<div class="al-drw-label">Familia</div><div style="font-size:13px;color:var(--muted);">Sin familias vinculadas.</div>';
      return;
    }
    box.innerHTML = '<div class="al-drw-label">Familia</div>' +
      fams.map(function(f) {
        return '<div class="al-drw-fam-row">👨‍👩‍👧 ' + _alEsc(f.full_name || "—") +
          (f.email ? ' · <a href="mailto:' + _alEsc(f.email) + '" style="color:var(--ink);">' + _alEsc(f.email) + '</a>' : '') +
          '</div>';
      }).join("");
  } catch(e) { if (box) box.innerHTML = '<span style="color:var(--muted);font-size:13px;">Familias no disponibles.</span>'; }
}

async function _alLoadHorario(grupo) {
  var box = document.getElementById("al-ficha-horario");
  if (!box) return;
  if (!grupo) {
    box.innerHTML = '<div class="al-drw-label">Horario</div><div style="color:var(--muted);font-size:13px;">Grupo no asignado.</div>';
    return;
  }
  try {
    var r = await sb.from("horarios_grupo")
      .select("dia,tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre")
      .eq("centro_id", ctrId).eq("grupo_horario", grupo)
      .eq("curso_escolar", cursoActivo)
      .order("tramo", { ascending: true });
    var filas = r.data || [];
    if (!filas.length) {
      box.innerHTML = '<div class="al-drw-label">Horario · ' + _alEsc(grupo) + '</div><div style="color:var(--muted);font-size:13px;">Sin horario para ' + _alEsc(cursoActivo) + '.</div>';
      return;
    }
    var DIAS = ["lunes","martes","miercoles","jueves","viernes"];
    var ETIQ = { lunes:"Lun", martes:"Mar", miercoles:"Mié", jueves:"Jue", viernes:"Vie" };
    var porDia = {};
    filas.forEach(function(f) { var d = (f.dia || "").toLowerCase(); (porDia[d] = porDia[d] || []).push(f); });
    var maxTramos = 0;
    DIAS.forEach(function(d) { if ((porDia[d] || []).length > maxTramos) maxTramos = (porDia[d] || []).length; });

    var cols = DIAS.map(function(d) {
      var items = (porDia[d] || []).sort(function(x, y) { return (x.tramo || 0) - (y.tramo || 0); });
      var cells = items.map(function(f) {
        return '<div class="al-hor-cell">' +
          '<div class="al-hor-materia">' + _alEsc(f.actividad_nombre || "—") + '</div>' +
          '<div class="al-hor-hora">' + String(f.hora_inicio || "").slice(0,5) + '</div>' +
        '</div>';
      }).join("");
      return '<div class="al-hor-col"><div class="al-hor-dia">' + ETIQ[d] + '</div>' + cells + '</div>';
    }).join("");

    box.innerHTML = '<div class="al-drw-label">Horario · ' + _alEsc(grupo) + '</div><div class="al-hor-grid">' + cols + '</div>';
  } catch(e) { if (box) box.innerHTML = '<div style="color:var(--muted);font-size:13px;">Horario no disponible.</div>'; }
}

async function _alLoadComedor(alumnoId) {
  if (typeof modulosActivos !== "undefined" && !modulosActivos.includes("comedor")) return;
  var box = document.getElementById("al-ficha-comedor");
  if (!box) return;
  try {
    var desde = new Date(Date.now() - 21 * 86400000).toISOString().split("T")[0];
    var hoy = new Date().toISOString().split("T")[0];
    var r = await sb.from("asistencia_comedor")
      .select("fecha,se_queda").eq("centro_id", ctrId)
      .eq("alumno_id", alumnoId).gte("fecha", desde).lte("fecha", hoy)
      .order("fecha", { ascending: false }).limit(30);
    var recs = r.data || [];
    if (!recs.length) return;
    var seQueda = recs.filter(function(x) { return x.se_queda; }).length;
    var dots = recs.slice(0, 14).reverse().map(function(x) {
      return '<span title="' + _alEsc(x.fecha) + '" style="font-size:14px;">' + (x.se_queda ? "🟢" : "🔴") + '</span>';
    }).join("");
    box.style.display = "";
    box.innerHTML =
      '<div class="al-drw-label">Comedor <span style="font-weight:400;color:var(--muted);font-size:11px;margin-left:4px;">' + seQueda + '/' + recs.length + ' días</span></div>' +
      '<div class="al-comedor-dots">' + dots + '</div>';
  } catch(e) {}
}

async function _alLoadIncidencias(a) {
  var box = document.getElementById("al-ficha-incidencias");
  if (!box) return;
  try {
    var nombre = a.nombre || "";
    if (!nombre) return;
    var r = await sb.from("incidencias")
      .select("fecha,tipo,gravedad,descripcion,estado")
      .eq("centro_id", ctrId)
      .ilike("alumno_nombre", "%" + nombre + "%")
      .order("created_at", { ascending: false }).limit(5);
    var incs = r.data || [];
    if (!incs.length) return;
    var gravCol = { leve:"var(--success)", grave:"var(--warning)", muy_grave:"var(--danger)" };
    var rows = incs.map(function(inc) {
      var col = gravCol[inc.gravedad] || "var(--muted)";
      return '<div class="al-inc-row">' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:3px;">' +
          '<span style="font-size:11px;color:var(--muted);">' + _alEsc(inc.fecha || "") + '</span>' +
          '<span style="background:' + col + ';color:#fff;border-radius:8px;padding:1px 6px;font-size:10px;font-weight:600;">' + _alEsc(inc.gravedad || "") + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--ink);">' + _alEsc((inc.descripcion || "").slice(0, 80)) + '</div>' +
      '</div>';
    }).join("");
    box.style.display = "";
    box.innerHTML = '<div class="al-drw-label">Incidencias <span style="font-weight:400;color:var(--muted);font-size:11px;margin-left:4px;">' + incs.length + '</span></div>' + rows;
  } catch(e) {}
}

async function _alLoadCalif(alumnoId) {
  var box = document.getElementById("al-ficha-calif");
  if (!box) return;
  try {
    var r = await sb.from("calificaciones")
      .select("asignatura,evaluacion,nota")
      .eq("centro_id", ctrId).eq("alumno_id", alumnoId)
      .order("asignatura", { ascending: true });
    var cal = r.data || [];
    if (!cal.length) return;

    // Tabla pivote asignatura × evaluación (solo hasta 3 columnas)
    var asigMap = {};
    var evals = [];
    cal.forEach(function(c) {
      if (!asigMap[c.asignatura]) asigMap[c.asignatura] = {};
      asigMap[c.asignatura][c.evaluacion] = c.nota;
      if (evals.indexOf(c.evaluacion) === -1) evals.push(c.evaluacion);
    });

    var thead = '<tr><th style="text-align:left;">Asignatura</th>' +
      evals.map(function(e) { return '<th style="text-align:right;">' + _alEsc(e.replace(" Evaluación","ª")) + '</th>'; }).join("") + '</tr>';

    var tbody = Object.keys(asigMap).sort().map(function(asig) {
      var cells = evals.map(function(e) {
        var n = asigMap[asig][e];
        var nNum = (n != null) ? Number(n) : null;
        var col = nNum == null ? "var(--muted)" : nNum < 5 ? "var(--danger)" : nNum >= 8 ? "var(--success)" : "var(--ink)";
        return '<td style="text-align:right;font-weight:600;color:' + col + ';">' + (nNum != null ? _alEsc(nNum) : "—") + '</td>';
      }).join("");
      return '<tr><td style="font-size:12px;">' + _alEsc(asig) + '</td>' + cells + '</tr>';
    }).join("");

    box.style.display = "";
    box.innerHTML =
      '<div class="al-drw-label">Calificaciones</div>' +
      '<div style="overflow-x:auto;"><table class="al-tbl-cal"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
  } catch(e) {}
}

// ── EXPORTAR FICHA A PDF ─────────────────────────────────────────────
async function alumnosExportarFichaPDF(alumnoId) {
  var btn = document.getElementById("al-pdf-btn");
  var rest = function () { if (btn) { btn.disabled = false; btn.textContent = "⬇ PDF"; } };
  if (typeof _infEnsureLibs !== "function") { if (typeof showToast === "function") showToast("Exportación no disponible"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Generando…"; }
  try {
    var a = _alData.find(function(x) { return x.id === alumnoId; });
    if (!a) {
      var ra = await sb.from("alumnos").select("id,nombre,curso,grupo_horario").eq("centro_id", ctrId).eq("id", alumnoId).maybeSingle();
      a = ra.data || {};
    }
    var grupo = a.grupo_horario || "";

    await _infEnsureLibs();
    var centro  = await _infCentroInfo();
    var logoImg = await _infImgToDataURL(centro.logo);
    var rgb     = _infHexToRgb(centro.color);

    var familias = [], horario = [], comedor = { dias: 0, queda: 0 }, incidencias = [], calif = [];
    try {
      var rfv = await sb.from("familia_alumno").select("profile_id").eq("alumno_id", alumnoId);
      var fpids = (rfv.data || []).map(function(x) { return x.profile_id; }).filter(Boolean);
      if (fpids.length) {
        var rfp = await sb.from("profiles").select("full_name,email").in("id", fpids);
        familias = (rfp.data || []).map(function(f) { return [f.full_name || "—", f.email || "—"]; });
      }
    } catch (e) {}
    if (grupo) {
      try {
        var rh = await sb.from("horarios_grupo")
          .select("dia,tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre,aula")
          .eq("centro_id", ctrId).eq("grupo_horario", grupo).eq("curso_escolar", cursoActivo);
        var ORD = { lunes:1, martes:2, miercoles:3, "miércoles":3, jueves:4, viernes:5 };
        horario = (rh.data || []).sort(function(x, y) {
          var dx = ORD[(x.dia||"").toLowerCase()] || 9, dy = ORD[(y.dia||"").toLowerCase()] || 9;
          return dx - dy || (x.tramo||0) - (y.tramo||0);
        }).map(function(f) {
          var dia = (f.dia||""); dia = dia.charAt(0).toUpperCase() + dia.slice(1);
          var hh = String(f.hora_inicio||"").slice(0,5) + (f.hora_fin ? "–" + String(f.hora_fin).slice(0,5) : "");
          return [dia, String(f.tramo!=null?f.tramo:"—"), hh, f.actividad_nombre||"—", f.profesor_nombre||"—", f.aula||"—"];
        });
      } catch (e) {}
    }
    try {
      var desde = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      var hoy = new Date().toISOString().split("T")[0];
      var rc = await sb.from("asistencia_comedor").select("se_queda").eq("centro_id", ctrId)
        .eq("alumno_id", alumnoId).gte("fecha", desde).lte("fecha", hoy).limit(60);
      var recs = rc.data || [];
      comedor = { dias: recs.length, queda: recs.filter(function(x) { return x.se_queda; }).length };
    } catch (e) {}
    try {
      if (a.nombre) {
        var ri = await sb.from("incidencias").select("fecha,gravedad,tipo,estado,descripcion")
          .eq("centro_id", ctrId).ilike("alumno_nombre", "%" + a.nombre + "%")
          .order("created_at", { ascending: false }).limit(20);
        incidencias = (ri.data || []).map(function(i) {
          return [i.fecha||"", i.gravedad||"", i.tipo||"", i.estado||"", (i.descripcion||"").slice(0, 90)];
        });
      }
    } catch (e) {}
    try {
      var rg = await sb.from("calificaciones").select("asignatura,evaluacion,nota,observaciones")
        .eq("centro_id", ctrId).eq("alumno_id", alumnoId).order("asignatura", { ascending: true });
      calif = (rg.data || []).map(function(c) {
        return [c.asignatura||"—", c.evaluacion||"—", (c.nota!=null?String(c.nota):"—"), (c.observaciones||"").slice(0, 60)];
      });
    } catch (e) {}

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    var W = doc.internal.pageSize.getWidth();
    var Hh = doc.internal.pageSize.getHeight();
    var fechaEmision = new Date().toLocaleDateString("es-ES", { day:"numeric", month:"long", year:"numeric" });

    var pageDraw = function() {
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(0, 0, W, 26, "F");
      var x = 12;
      if (logoImg && logoImg.dataURL) {
        try {
          var h = 16, w = h * (logoImg.w / logoImg.h);
          if (w > 38) { w = 38; h = w * (logoImg.h / logoImg.w); }
          doc.addImage(logoImg.dataURL, "PNG", 12, 5, w, h); x = 12 + w + 6;
        } catch (e) {}
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13); doc.setFont(undefined, "bold");
      doc.text(centro.nombre || "Centro", x, 11);
      doc.setFontSize(10); doc.setFont(undefined, "normal");
      doc.text("FICHA DEL ALUMNO", x, 18);
      doc.setFontSize(8.5);
      doc.text(fechaEmision, W - 12, 11, { align: "right" });
      var pg = 1;
      try { pg = doc.internal.getCurrentPageInfo().pageNumber; } catch (e) {}
      doc.setTextColor(130, 130, 130); doc.setFontSize(8); doc.setFont(undefined, "normal");
      doc.text(centro.nombre || "Centro", 12, Hh - 8);
      doc.text("Página " + pg, W - 12, Hh - 8, { align: "right" });
      doc.setTextColor(40, 40, 40);
    };

    pageDraw();
    var y = 38;
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.setTextColor(40, 40, 40);
    doc.text(a.nombre || "Alumno", 12, y);
    doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.setTextColor(90, 90, 90);
    doc.text((a.curso || "") + (grupo ? "   ·   Grupo " + grupo : ""), 12, y + 6);
    y += 14;

    var section = function(titulo, head, rows, sinTxt) {
      if (y > Hh - 36) { doc.addPage(); y = 38; }
      doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text(titulo, 12, y);
      var body = (rows && rows.length) ? rows
        : [[{ content: sinTxt || "Sin registros", colSpan: head.length, styles: { halign:"center", textColor:[140,140,140], fontStyle:"italic" } }]];
      doc.autoTable({
        head: [head], body: body, startY: y + 3,
        margin: { top: 32, bottom: 16 },
        styles: { fontSize: 8.5, cellPadding: 1.8, overflow: "linebreak" },
        headStyles: { fillColor: [rgb.r, rgb.g, rgb.b], textColor: 255, fontSize: 9 },
        alternateRowStyles: { fillColor: [244, 242, 238] },
        didDrawPage: pageDraw
      });
      y = doc.lastAutoTable.finalY + 10;
    };

    section("Familias vinculadas", ["Nombre", "Email"], familias, "Sin familias vinculadas");
    section("Horario semanal · " + (grupo || "—"), ["Día", "Tramo", "Hora", "Asignatura", "Profesor/a", "Aula"], horario, "Sin horario para el curso " + cursoActivo);
    section("Comedor (últimos 30 días)", ["Días registrados", "Se queda", "No se queda"],
      comedor.dias ? [[String(comedor.dias), String(comedor.queda), String(comedor.dias - comedor.queda)]] : [], "Sin registros de comedor");
    section("Incidencias", ["Fecha", "Gravedad", "Tipo", "Estado", "Descripción"], incidencias, "Sin incidencias");
    section("Calificaciones", ["Asignatura", "Evaluación", "Nota", "Observaciones"], calif, "Sin calificaciones");

    var safe = (a.nombre || "alumno").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
    doc.save("ficha_" + safe + "_" + new Date().toISOString().split("T")[0] + ".pdf");
    if (typeof showToast === "function") showToast("✅ Ficha exportada");
  } catch (e) {
    if (typeof showToast === "function") showToast("No se pudo generar el PDF");
  } finally {
    rest();
  }
}
