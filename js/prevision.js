/* Previsión de cobertura — anticipa las sustituciones sin cubrir de los próximos días
   y sugiere el sustituto más equitativo (profesor libre con menos guardias del trimestre). */

function _prevEsc(s) { return escH(s); } // delegado a utils.js
function _prevNorm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
var _PREV_DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function _prevDia(fecha) { return _PREV_DOW[new Date(fecha + "T12:00:00").getDay()]; }
function _prevFmtFecha(f) {
  var d = new Date(f + "T12:00:00");
  return _PREV_DOW[d.getDay()].charAt(0).toUpperCase() + _PREV_DOW[d.getDay()].slice(1) + " " + d.getDate() + "/" + (d.getMonth() + 1);
}

window.preverCobertura = async function (dias) {
  _prevEnsureStyles();
  dias = dias || 14;
  var old = document.getElementById("prev-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "prev-modal";
  w.className = "prev-ov";
  w.innerHTML = '<div class="prev-modal">' +
    '<div class="prev-modal-hd"><div><h3>🔮 Previsión de cobertura</h3>' +
      '<div class="prev-sub">Sustituciones sin cubrir de los próximos ' + dias + ' días con sugerencia de sustituto.</div></div>' +
      '<button class="prev-x" onclick="document.getElementById(\'prev-modal\').remove()">✕</button></div>' +
    '<div class="prev-modal-bd" id="prev-bd"><div class="prev-loading">Calculando previsión…</div></div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });
  _prevCargar(dias);
};

async function _prevCargar(dias) {
  var bd = document.getElementById("prev-bd");
  if (!bd) return;
  var hoy = new Date().toISOString().split("T")[0];
  var hasta = new Date(); hasta.setDate(hasta.getDate() + dias);
  var hastaStr = hasta.toISOString().split("T")[0];

  // 1. Sustituciones futuras sin cubrir
  var sr = await window.sb.from("sustituciones")
    .select("id,fecha,tramo,grupo_horario,profesor_ausente,profesor_sustituto,cubierta")
    .eq("centro_id", window.ctrId)
    .gte("fecha", hoy).lte("fecha", hastaStr)
    .or("cubierta.eq.false,cubierta.is.null")
    .order("fecha").order("tramo");
  var pend = (sr.data || []).filter(function (s) { return !s.profesor_sustituto; });
  if (!pend.length) {
    bd.innerHTML = '<div class="prev-empty">✅ No hay sustituciones sin cubrir en los próximos ' + dias + ' días.</div>';
    return;
  }

  // 2. Horario del centro (para saber quién está libre cada día/tramo)
  var hr = await window.sb.from("horarios_grupo")
    .select("dia,tramo,profesor_nombre").eq("centro_id", window.ctrId)
    .eq("curso_escolar", window.cursoActivo || "2025-26").limit(20000);
  var horas = hr.data || [];
  // Conjunto de todos los profesores conocidos
  var todos = {};
  horas.forEach(function (h) { if (h.profesor_nombre) todos[_prevNorm(h.profesor_nombre)] = h.profesor_nombre; });
  // Ocupación: clave dia|tramo|profNorm
  var ocup = {};
  horas.forEach(function (h) {
    if (!h.profesor_nombre) return;
    ocup[_prevNorm(h.dia) + "|" + String(h.tramo) + "|" + _prevNorm(h.profesor_nombre)] = true;
  });

  // 3. Equidad: nº de guardias del trimestre por nombre
  var counts = {};
  try { if (typeof getGuardiaCountsByName === "function") counts = await getGuardiaCountsByName() || {}; } catch (e) {}
  var countNorm = {};
  Object.keys(counts).forEach(function (k) { countNorm[_prevNorm(k)] = counts[k]; });

  // 4. Para cada pendiente, calcular libres y elegir el de menor carga
  pend.forEach(function (s) {
    var dia = _prevNorm(_prevDia(s.fecha));
    var tramo = String(s.tramo);
    var ausenteN = _prevNorm(s.profesor_ausente);
    var libres = [];
    Object.keys(todos).forEach(function (pn) {
      if (pn === ausenteN) return;
      if (ocup[dia + "|" + tramo + "|" + pn]) return;  // ocupado ese día/tramo
      libres.push({ norm: pn, nombre: todos[pn], carga: countNorm[pn] || 0 });
    });
    libres.sort(function (a, b) { return a.carga - b.carga || a.nombre.localeCompare(b.nombre); });
    s._libres = libres.slice(0, 5);
    s._sug = libres[0] || null;
  });

  // 5. Render agrupado por fecha
  var byDate = {};
  pend.forEach(function (s) { (byDate[s.fecha] = byDate[s.fecha] || []).push(s); });
  var fechas = Object.keys(byDate).sort();
  var html = '<div class="prev-summary">' + pend.length + ' sustitución' + (pend.length !== 1 ? "es" : "") +
    ' sin cubrir · ' + fechas.length + ' día' + (fechas.length !== 1 ? "s" : "") + '</div>';
  fechas.forEach(function (f) {
    html += '<div class="prev-day"><div class="prev-day-h">' + _prevFmtFecha(f) + '</div>';
    byDate[f].forEach(function (s) {
      html += '<div class="prev-row" id="prev-row-' + s.id + '">' +
        '<div class="prev-row-main">' +
          '<div class="prev-row-top">Tramo ' + _prevEsc(s.tramo || "—") + ' · Grupo ' + _prevEsc(s.grupo_horario || "—") + '</div>' +
          '<div class="prev-row-meta">Ausente: ' + _prevEsc(s.profesor_ausente || "—") + '</div>' +
        '</div>' +
        '<div class="prev-row-sug">' +
          (s._sug
            ? '<select class="prev-sel" id="prev-sel-' + s.id + '">' +
                s._libres.map(function (l) {
                  return '<option value="' + _prevEsc(l.nombre) + '">' + _prevEsc(l.nombre) + ' · ' + l.carga + ' guardia' + (l.carga !== 1 ? "s" : "") + '</option>';
                }).join("") +
              '</select>' +
              '<button class="prev-btn prev-btn-primary" onclick="window._prevAsignar(\'' + s.id + '\',' +
                "'" + _prevEsc(String(s.tramo || "")) + "','" + _prevEsc(s.fecha) + "','" + _prevEsc(s.grupo_horario || "") + "')\">Asignar</button>"
            : '<span class="prev-none">Sin profesores libres</span>') +
        '</div></div>';
    });
    html += '</div>';
  });
  bd.innerHTML = html;
}

window._prevAsignar = async function (sustId, tramo, fecha, grupo) {
  var sel = document.getElementById("prev-sel-" + sustId);
  var sustituto = sel ? sel.value : null;
  if (!sustituto) { showToast("Selecciona un sustituto"); return; }
  var r = await window.sb.from("sustituciones")
    .update({ profesor_sustituto: sustituto, cubierta: true }).eq("id", sustId);
  if (r.error) { showToast("Error: " + r.error.message); return; }

  // Registrar guardia para equidad
  try {
    if (typeof registrarGuardiaEnBD === "function") {
      registrarGuardiaEnBD(sustituto, fecha, parseInt(tramo) || null, grupo || null);
    }
  } catch (e) {}
  // Notificar (fire-and-forget)
  try {
    fetch(SB_URL + "/functions/v1/notify-sustitucion", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY, "apikey": ANON_KEY },
      body: JSON.stringify({ sustitucion_id: sustId, evento: "asignacion" }),
    }).catch(function () {});
  } catch (e) {}

  showToast("✅ " + sustituto + " asignado");
  var row = document.getElementById("prev-row-" + sustId);
  if (row) { row.style.opacity = ".5"; row.querySelector(".prev-row-sug").innerHTML = '<span class="prev-done">✓ Asignado</span>'; }
  // Refrescar la tabla de sustituciones de fondo si está visible
  if (typeof loadSustituciones === "function") { try { loadSustituciones(); } catch (e) {} }
};

/* ── CSS ── */
function _prevEnsureStyles() {
  if (document.getElementById("prev-styles")) return;
  var s = document.createElement("style");
  s.id = "prev-styles";
  s.textContent = [
    ".prev-ov{position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}",
    ".prev-modal{background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:620px;max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--line);}",
    ".prev-modal-hd{display:flex;align-items:flex-start;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);flex:0 0 auto;}",
    ".prev-modal-hd h3{margin:0;font-size:17px;font-weight:700;color:var(--txt);}",
    ".prev-sub{font-size:12px;color:var(--muted);margin-top:3px;}",
    ".prev-x{background:none;border:none;font-size:16px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".prev-x:hover{background:var(--surface-sunk);}",
    ".prev-modal-bd{padding:14px 20px 20px;overflow:auto;flex:1;}",
    ".prev-loading,.prev-empty{text-align:center;padding:40px 20px;color:var(--muted);font-size:14px;}",
    ".prev-summary{font-size:12px;font-weight:600;color:var(--muted);margin-bottom:12px;}",
    ".prev-day{margin-bottom:16px;}",
    ".prev-day-h{font-size:13px;font-weight:700;color:var(--txt);margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--line);text-transform:capitalize;}",
    ".prev-row{display:flex;align-items:center;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:7px;flex-wrap:wrap;}",
    ".prev-row-main{flex:1;min-width:140px;}",
    ".prev-row-top{font-weight:600;font-size:13.5px;color:var(--txt);}",
    ".prev-row-meta{font-size:12px;color:var(--muted);margin-top:2px;}",
    ".prev-row-sug{display:flex;align-items:center;gap:8px;flex:0 0 auto;}",
    ".prev-sel{padding:7px 10px;border:1px solid var(--line-2);border-radius:8px;font-size:12.5px;font-family:inherit;background:var(--paper);color:var(--txt);max-width:200px;}",
    ".prev-btn{padding:7px 13px;border-radius:8px;border:1px solid var(--line-2);background:var(--paper);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".prev-btn-primary{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".prev-none{font-size:12px;color:var(--danger);}",
    ".prev-done{font-size:12.5px;color:var(--success);font-weight:600;}",
    "@media(max-width:768px){.prev-row-sug{width:100%;}.prev-sel{flex:1;max-width:none;}}",
  ].join("");
  document.head.appendChild(s);
}
