// ── MÓDULO ALUMNOS ───────────────────────────────────────────────────
// Directorio de alumnos del centro: lista + filtros + ficha individual
// (horario, comedor, incidencias, calificaciones, familias vinculadas).
// Visible para profesional/admin/dirección/superadmin (no familia).

var _alData = [];          // todos los alumnos del centro
var _alSearch = "";
var _alGrupo = "";         // filtro de grupo activo ("" = todos)
var _alLoaded = false;
var _alPendingFicha = null; // id de ficha a abrir tras cargar la lista (desde ⌘K u otros)

function _alEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Valor seguro como argumento JS dentro de un atributo onclick="…" (comillas dobles).
function _alArg(v) {
  return "'" + String(v == null ? "" : v)
    .replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;") + "'";
}

async function initAlumnos() {
  var panel = document.getElementById("panel-alumnos");
  if (!panel) return;

  panel.innerHTML =
    '<div style="padding:28px;display:flex;flex-direction:column;gap:18px;background:var(--bg);min-height:100%;">' +
      '<div class="pg-hdr"><div><div class="pg-title">Alumnos</div>' +
        '<div class="pg-sub" id="al-sub">Directorio del centro</div></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-s" onclick="_alExportar()">⬇ Excel</button>' +
          '<button class="btn btn-p" onclick="initAlumnos(true)">↺ Actualizar</button>' +
        '</div></div>' +
      '<input class="fi" id="al-search" placeholder="🔍 Buscar alumno por nombre…" ' +
        'style="max-width:420px;" oninput="_alOnSearch(this.value)" />' +
      '<div id="al-grupos" style="display:flex;gap:8px;flex-wrap:wrap;"></div>' +
      '<div id="al-list"><div style="text-align:center;color:var(--txt3);padding:40px;"><span class="spin">⟳</span> Cargando…</div></div>' +
    '</div>';

  var search = document.getElementById("al-search");
  if (search) search.value = _alSearch;

  // Recarga forzada o primera vez
  if (arguments[0] === true) _alLoaded = false;
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

  // Si se pidió abrir una ficha concreta (p.ej. desde el command palette), ábrela.
  if (_alPendingFicha) {
    var pid = _alPendingFicha;
    _alPendingFicha = null;
    alumnosAbrirFicha(pid);
  }
}

// Punto de entrada externo: abre la ficha de un alumno desde cualquier pantalla
// (activa el tab Alumnos; initAlumnos carga la lista y luego abre la ficha).
window.alumnosVerFicha = function(alumnoId) {
  _alPendingFicha = alumnoId;
  if (typeof showTab === "function") showTab("alumnos");
};

// Abre el tab Incidencias (vista admin) con el alumno y grupo ya prerrellenados.
// initIncidenciasPanel renderiza de forma asíncrona → reintenta hasta encontrar el form.
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
    return '<button onclick="_alFiltrarGrupo(' + _alArg(val) + ')" style="' +
      'border-radius:20px;padding:5px 14px;font-size:13px;cursor:pointer;font-family:var(--font-ui);' +
      (active
        ? 'background:var(--ink);color:#fff;border:1px solid var(--ink);'
        : 'background:var(--paper-2,var(--srf));color:var(--txt);border:1px solid var(--line,var(--bdr));') +
      '">' + _alEsc(label) + '</button>';
  };
  var html = chip("Todos", "", _alGrupo === "");
  grupos.forEach(function(g) { html += chip(g, g, _alGrupo === g); });
  cont.innerHTML = html;
}

// Alumnos que pasan el filtro de grupo + búsqueda actuales.
function _alFiltradas() {
  var q = _alSearch.trim().toLowerCase();
  return _alData.filter(function(a) {
    if (_alGrupo && a.grupo_horario !== _alGrupo) return false;
    if (q && (a.nombre || "").toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

// Exporta la lista filtrada a Excel (.xlsx) con SheetJS.
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
  var cont = document.getElementById("al-list");
  if (!cont) return;
  var q = _alSearch.trim().toLowerCase();
  var rows = _alFiltradas();

  var sub = document.getElementById("al-sub");
  if (sub) sub.textContent = rows.length + " alumno" + (rows.length === 1 ? "" : "s") +
    (_alGrupo ? " · " + _alGrupo : "") + (q ? ' · "' + _alSearch.trim() + '"' : "");

  if (!rows.length) {
    cont.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:40px;">Sin resultados.</div>';
    return;
  }

  var trs = rows.map(function(a) {
    return '<tr style="cursor:pointer;border-bottom:1px solid var(--line,var(--bdr));" ' +
      'onclick="alumnosAbrirFicha(' + _alArg(a.id) + ')">' +
      '<td style="padding:11px 12px;font-weight:500;color:var(--txt);">' + _alEsc(a.nombre) + '</td>' +
      '<td style="padding:11px 12px;color:var(--txt2);">' + _alEsc(a.curso || "—") + '</td>' +
      '<td style="padding:11px 12px;"><span style="background:var(--surface-sunk,var(--srf2));border-radius:6px;padding:2px 8px;font-size:12px;color:var(--txt2);">' + _alEsc(a.grupo_horario || "—") + '</span></td>' +
      '<td style="padding:11px 12px;text-align:right;color:var(--ink);font-size:13px;">Ver ficha →</td>' +
      '</tr>';
  }).join("");

  cont.innerHTML =
    '<div style="overflow-x:auto;background:var(--srf);border:1px solid var(--line,var(--bdr));border-radius:var(--r);">' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
        '<thead><tr style="text-align:left;border-bottom:2px solid var(--line,var(--bdr));background:var(--paper-2,var(--srf2));">' +
          '<th style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);">Nombre</th>' +
          '<th style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);">Curso</th>' +
          '<th style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);">Grupo</th>' +
          '<th></th>' +
        '</tr></thead><tbody>' + trs + '</tbody>' +
      '</table></div>';
}

// ── FICHA INDIVIDUAL ─────────────────────────────────────────────────
async function alumnosAbrirFicha(alumnoId) {
  var panel = document.getElementById("panel-alumnos");
  if (!panel) return;
  var a = _alData.find(function(x) { return x.id === alumnoId; }) || null;
  // Fallback: si la lista no estaba cargada (apertura directa), busca el alumno por id.
  if (!a) {
    try {
      var rr = await sb.from("alumnos").select("id,nombre,curso,grupo_horario")
        .eq("centro_id", ctrId).eq("id", alumnoId).maybeSingle();
      a = rr.data || {};
    } catch (e) { a = {}; }
  }

  // Acción "Registrar incidencia": solo roles con acceso a la vista admin de incidencias
  // (misma visibilidad que el tab Incidencias en auth.js; la vista profesional limita el
  // selector a sus propios alumnos → prerrelleno no fiable desde el directorio completo).
  var rolesIncAdmin = ["admin", "admin_institucional", "superadmin"];
  var puedeInc = (typeof role !== "undefined") && rolesIncAdmin.indexOf(role) !== -1;
  var accionInc = puedeInc
    ? '<button class="btn btn-p" onclick="alumnosRegistrarIncidencia(' + _alArg(a.nombre || "") + ',' + _alArg(a.grupo_horario || "") + ')">⚠️ Registrar incidencia</button>'
    : "";

  panel.innerHTML =
    '<div style="padding:28px;display:flex;flex-direction:column;gap:16px;background:var(--bg);min-height:100%;">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;">' +
        '<button class="btn btn-s" onclick="initAlumnos()">← Volver a Alumnos</button>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn btn-s" id="al-pdf-btn" onclick="alumnosExportarFichaPDF(' + _alArg(alumnoId) + ')">⬇ PDF</button>' +
          accionInc +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-hdr">' +
        '<div class="card-ico b" style="font-size:20px;background:var(--ink-ll);color:var(--ink);">🎓</div>' +
        '<div><div class="card-title">' + _alEsc(a.nombre || "Alumno") + '</div>' +
        '<div class="card-desc">' + _alEsc(a.curso || "") + (a.grupo_horario ? ' · Grupo ' + _alEsc(a.grupo_horario) : "") + '</div></div>' +
      '</div><div id="al-ficha-familias" style="margin-top:10px;font-size:13px;color:var(--txt3);">Cargando familias…</div></div>' +
      '<div id="al-ficha-horario" class="card">Cargando horario…</div>' +
      '<div id="al-ficha-comedor" class="card" style="display:none;"></div>' +
      '<div id="al-ficha-incidencias" class="card" style="display:none;"></div>' +
      '<div id="al-ficha-calif" class="card" style="display:none;"></div>' +
    '</div>';

  var grupo = a.grupo_horario;

  // ── Familias vinculadas ──
  (async function() {
    var box = document.getElementById("al-ficha-familias");
    if (!box) return;
    try {
      // Dos pasos (no embed) para no depender de la FK familia_alumno→profiles.
      var rv = await sb.from("familia_alumno").select("profile_id").eq("alumno_id", alumnoId);
      var pids = (rv.data || []).map(function(x) { return x.profile_id; }).filter(Boolean);
      var fams = [];
      if (pids.length) {
        var rp = await sb.from("profiles").select("full_name,email,rol").in("id", pids);
        fams = rp.data || [];
      }
      if (!fams.length) { box.innerHTML = '<span style="color:var(--txt3);">Sin familias vinculadas.</span>'; return; }
      box.innerHTML = '<div style="font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--txt3);margin-bottom:6px;">Familias vinculadas</div>' +
        fams.map(function(f) {
          return '<div style="font-size:13px;color:var(--txt2);">👨‍👩‍👧 ' + _alEsc(f.full_name || "—") +
            (f.email ? ' · <a href="mailto:' + _alEsc(f.email) + '" style="color:var(--ink);">' + _alEsc(f.email) + '</a>' : '') + '</div>';
        }).join("");
    } catch(e) { box.innerHTML = '<span style="color:var(--txt3);">Familias no disponibles.</span>'; }
  })();

  // ── Horario semanal ──
  (async function() {
    var box = document.getElementById("al-ficha-horario");
    if (!box) return;
    if (!grupo) { box.innerHTML = '<div class="card-hdr"><div class="card-title">Horario</div></div><div style="color:var(--txt3);font-size:13px;">Grupo no asignado.</div>'; return; }
    try {
      var r = await sb.from("horarios_grupo")
        .select("dia,tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre,aula")
        .eq("centro_id", ctrId).eq("grupo_horario", grupo)
        .eq("curso_escolar", cursoActivo)
        .order("tramo", { ascending: true });
      var filas = r.data || [];
      if (!filas.length) { box.innerHTML = '<div class="card-hdr"><div class="card-title">Horario · ' + _alEsc(grupo) + '</div></div><div style="color:var(--txt3);font-size:13px;">Sin horario para el curso ' + _alEsc(cursoActivo) + '.</div>'; return; }
      var DIAS = ["lunes","martes","miercoles","jueves","viernes"];
      var ETIQ = { lunes:"Lunes", martes:"Martes", miercoles:"Miércoles", jueves:"Jueves", viernes:"Viernes" };
      var porDia = {};
      filas.forEach(function(f) { var d = (f.dia || "").toLowerCase(); (porDia[d] = porDia[d] || []).push(f); });
      var cols = DIAS.map(function(d) {
        var items = (porDia[d] || []).sort(function(x, y) { return (x.tramo || 0) - (y.tramo || 0); });
        var inner = items.length ? items.map(function(f) {
          var hi = String(f.hora_inicio || "").slice(0,5), hf = String(f.hora_fin || "").slice(0,5);
          return '<div style="padding:6px 8px;border-radius:6px;background:var(--paper-2,var(--srf2));margin-bottom:5px;">' +
            '<div style="font-size:12px;font-weight:600;color:var(--txt);">' + _alEsc(f.actividad_nombre || "—") + '</div>' +
            '<div style="font-size:10px;color:var(--txt3);">' + _alEsc(hi + (hf ? "–" + hf : "")) +
            (f.profesor_nombre ? ' · ' + _alEsc(f.profesor_nombre) : '') + (f.aula ? ' · ' + _alEsc(f.aula) : '') + '</div></div>';
        }).join("") : '<div style="font-size:11px;color:var(--txt3);">—</div>';
        return '<div style="flex:1;min-width:140px;">' +
          '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);margin-bottom:6px;">' + ETIQ[d] + '</div>' + inner + '</div>';
      }).join("");
      box.innerHTML = '<div class="card-hdr"><div class="card-title">Horario · ' + _alEsc(grupo) + '</div></div>' +
        '<div style="display:flex;gap:12px;overflow-x:auto;margin-top:6px;">' + cols + '</div>';
    } catch(e) { box.innerHTML = '<div class="card-hdr"><div class="card-title">Horario</div></div><div style="color:var(--txt3);font-size:13px;">No disponible.</div>'; }
  })();

  // ── Comedor (últimos 14 días lectivos) ──
  (async function() {
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
        var lbl = new Date(x.fecha + "T12:00:00").toLocaleDateString("es-ES", { weekday:"short", day:"numeric" });
        return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:var(--txt3);">' +
          '<span style="font-size:16px;">' + (x.se_queda ? "🟢" : "🔴") + '</span><span>' + _alEsc(lbl) + '</span></div>';
      }).join("");
      box.style.display = "";
      box.innerHTML = '<div class="card-hdr"><div class="card-title">Comedor</div></div>' +
        '<div style="font-size:13px;color:var(--txt2);margin-bottom:8px;">Se queda <b>' + seQueda + '</b> de ' + recs.length + ' días registrados</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' + dots + '</div>';
    } catch(e) {}
  })();

  // ── Incidencias ──
  (async function() {
    var box = document.getElementById("al-ficha-incidencias");
    if (!box) return;
    try {
      var nombre = a.nombre || "";
      if (!nombre) return;
      var r = await sb.from("incidencias")
        .select("fecha,tipo,gravedad,descripcion,estado")
        .eq("centro_id", ctrId)
        .ilike("alumno_nombre", "%" + nombre + "%")
        .order("created_at", { ascending: false }).limit(10);
      var incs = r.data || [];
      if (!incs.length) return;
      var gravCol = { leve:"var(--success,#3F9367)", grave:"var(--warning,#D69540)", muy_grave:"var(--danger,#C24D2F)" };
      var rows = incs.map(function(inc) {
        var col = gravCol[inc.gravedad] || "var(--muted)";
        return '<div style="padding:8px 0;border-bottom:1px solid var(--line,var(--bdr));">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<span style="font-size:12px;color:var(--txt3);">' + _alEsc(inc.fecha || "") + '</span>' +
            '<span style="background:' + col + ';color:#fff;border-radius:8px;padding:1px 7px;font-size:10px;font-weight:600;">' + _alEsc(inc.gravedad || "") + '</span>' +
            '<span style="font-size:11px;color:var(--txt3);">' + _alEsc(inc.tipo || "") + '</span>' +
            '<span style="font-size:11px;color:' + (inc.estado === "cerrada" ? "var(--success,#3F9367)" : "var(--warning,#D69540)") + ';">' + _alEsc(inc.estado || "") + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--txt);margin-top:3px;">' + _alEsc(inc.descripcion || "") + '</div></div>';
      }).join("");
      box.style.display = "";
      box.innerHTML = '<div class="card-hdr"><div class="card-title">Incidencias</div><span style="margin-left:auto;font-size:12px;color:var(--txt3);">' + incs.length + '</span></div>' + rows;
    } catch(e) {}
  })();

  // ── Calificaciones ──
  (async function() {
    var box = document.getElementById("al-ficha-calif");
    if (!box) return;
    try {
      var r = await sb.from("calificaciones")
        .select("asignatura,evaluacion,nota,observaciones")
        .eq("centro_id", ctrId).eq("alumno_id", alumnoId)
        .order("asignatura", { ascending: true });
      var cal = r.data || [];
      if (!cal.length) return;
      var rows = cal.map(function(c) {
        var n = (c.nota != null) ? Number(c.nota) : null;
        var col = (n == null) ? "var(--txt3)" : (n < 5 ? "var(--danger,#C24D2F)" : "var(--success,#3F9367)");
        return '<tr style="border-bottom:1px solid var(--line,var(--bdr));">' +
          '<td style="padding:7px 10px;font-size:13px;color:var(--txt);">' + _alEsc(c.asignatura || "—") + '</td>' +
          '<td style="padding:7px 10px;font-size:12px;color:var(--txt2);">' + _alEsc(c.evaluacion || "—") + '</td>' +
          '<td style="padding:7px 10px;font-weight:600;color:' + col + ';">' + (n != null ? _alEsc(n) : "—") + '</td>' +
          '<td style="padding:7px 10px;font-size:12px;color:var(--txt3);">' + _alEsc(c.observaciones || "") + '</td></tr>';
      }).join("");
      box.style.display = "";
      box.innerHTML = '<div class="card-hdr"><div class="card-title">Calificaciones</div></div>' +
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;margin-top:6px;">' +
        '<thead><tr style="text-align:left;border-bottom:2px solid var(--line,var(--bdr));">' +
          '<th style="padding:6px 10px;font-size:11px;text-transform:uppercase;color:var(--txt3);">Asignatura</th>' +
          '<th style="padding:6px 10px;font-size:11px;text-transform:uppercase;color:var(--txt3);">Evaluación</th>' +
          '<th style="padding:6px 10px;font-size:11px;text-transform:uppercase;color:var(--txt3);">Nota</th>' +
          '<th style="padding:6px 10px;font-size:11px;text-transform:uppercase;color:var(--txt3);">Obs.</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    } catch(e) {}
  })();
}

// ── EXPORTAR FICHA A PDF ─────────────────────────────────────────────
// Reutiliza los helpers globales de informes.js (jsPDF + autotable, logo/color).
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

    // ── Datos (cada query tolerante a fallos) ──
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

    // ── PDF ──
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

    // Bloque de identificación
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
