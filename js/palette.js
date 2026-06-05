// js/palette.js — Command palette global (⌘K / Ctrl+K) — Cambio 6
// Busca alumnos, profesores y aulas/espacios del centro activo. Globals: sb, ctrId, askQ, showTab.
(function () {
  var _t = null;     // debounce timer
  var _seq = 0;      // descarta respuestas obsoletas

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function _hint() {
    return '<div class="cmdp-empty">Escribe para buscar alumnos, profesores o aulas…</div>';
  }

  function _norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  }

  window.openCommandPalette = function (seed) {
    var ov = document.getElementById("cmd-palette");
    if (!ov) return;
    if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
    ov.style.display = "flex";
    document.body.style.overflow = "hidden";
    var inp = document.getElementById("cmdp-input");
    var res = document.getElementById("cmdp-results");
    if (res) res.innerHTML = _hint();
    if (inp) {
      inp.value = seed || "";
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 30);
      if (seed) window.cmdpSearch(seed);
    }
  };

  window.closeCommandPalette = function () {
    var ov = document.getElementById("cmd-palette");
    if (ov) ov.style.display = "none";
    document.body.style.overflow = "";
  };

  window.cmdpKey = function (e) {
    if (e.key === "Escape") { e.preventDefault(); window.closeCommandPalette(); return; }
    if (e.key === "Enter") {
      var first = document.querySelector("#cmdp-results .cmdp-item");
      if (first) first.click();
    }
  };

  window.cmdpSearch = function (q) {
    var res = document.getElementById("cmdp-results");
    if (!res) return;
    clearTimeout(_t);
    q = (q || "").trim();
    if (q.length < 2) { res.innerHTML = _hint(); return; }
    var myseq = ++_seq;
    res.innerHTML = '<div class="cmdp-empty">Buscando…</div>';

    _t = setTimeout(function () {
      if (typeof sb === "undefined" || !sb || !ctrId) {
        res.innerHTML = '<div class="cmdp-empty">Buscador no disponible.</div>'; return;
      }
      var like = "%" + q + "%";
      // Profesores y aulas se buscan en sus tablas (planner) Y en horarios_grupo,
      // porque muchos centros sólo tienen los datos en horarios_grupo.
      var queries = [
        sb.from("alumnos").select("id,nombre,curso,grupo_horario").eq("centro_id", ctrId).ilike("nombre", like).limit(6),
        sb.from("profesores").select("nombre,especialidad").eq("centro_id", ctrId).ilike("nombre", like).limit(6),
        sb.from("horarios_grupo").select("profesor_nombre").eq("centro_id", ctrId).ilike("profesor_nombre", like).limit(40),
        sb.from("espacios").select("nombre,capacidad").eq("centro_id", ctrId).ilike("nombre", like).limit(6),
        sb.from("horarios_grupo").select("aula").eq("centro_id", ctrId).ilike("aula", like).limit(40)
      ].map(function (p) {
        return Promise.resolve(p).then(function (r) { return (r && r.data) || []; }).catch(function () { return []; });
      });

      Promise.all(queries).then(function (out) {
        if (myseq !== _seq) return; // respuesta obsoleta
        var alumnos = out[0];

        // Profesores: tabla profesores + nombres de horarios_grupo (dedup por nombre normalizado)
        var seenP = {}, profList = [];
        out[1].forEach(function (p) {
          var k = _norm(p.nombre); if (!p.nombre || seenP[k]) return; seenP[k] = 1;
          profList.push({ nombre: p.nombre, meta: p.especialidad || "Profesorado" });
        });
        out[2].forEach(function (r) {
          var n = r.profesor_nombre, k = _norm(n); if (!n || seenP[k]) return; seenP[k] = 1;
          profList.push({ nombre: n, meta: "Profesorado" });
        });
        profList = profList.slice(0, 6);

        // Aulas/espacios: tabla espacios + aulas de horarios_grupo (dedup)
        var seenA = {}, aulaList = [];
        out[3].forEach(function (e2) {
          var k = _norm(e2.nombre); if (!e2.nombre || seenA[k]) return; seenA[k] = 1;
          aulaList.push({ nombre: e2.nombre, meta: e2.capacidad ? ("Capacidad " + e2.capacidad) : "Espacio" });
        });
        out[4].forEach(function (r) {
          var a = r.aula, k = _norm(a); if (!a || seenA[k]) return; seenA[k] = 1;
          aulaList.push({ nombre: a, meta: "Aula" });
        });
        aulaList = aulaList.slice(0, 6);

        var html = "";
        if (alumnos.length) {
          html += '<div class="cmdp-group">Alumnos</div>';
          alumnos.forEach(function (a) {
            var meta = (a.curso || "") + (a.grupo_horario ? " · " + a.grupo_horario : "");
            var prim = (a.nombre || "").split(",")[0].trim();
            html += '<div class="cmdp-item" onclick="_cmdpAlumno(' + esc(JSON.stringify(prim)) + ')">' +
              '<i class="ti ti-user cmdp-item-ico"></i>' +
              '<div class="cmdp-item-main"><div class="cmdp-item-title">' + esc(a.nombre) + "</div>" +
              '<div class="cmdp-item-meta">' + esc(meta) + "</div></div>" +
              '<i class="ti ti-corner-down-left cmdp-item-go"></i></div>';
          });
        }
        if (profList.length) {
          html += '<div class="cmdp-group">Profesores</div>';
          profList.forEach(function (p) {
            html += '<div class="cmdp-item" onclick="_cmdpProfesor(' + esc(JSON.stringify(p.nombre)) + ')">' +
              '<i class="ti ti-school cmdp-item-ico"></i>' +
              '<div class="cmdp-item-main"><div class="cmdp-item-title">' + esc(p.nombre) + "</div>" +
              '<div class="cmdp-item-meta">' + esc(p.meta) + "</div></div>" +
              '<i class="ti ti-corner-down-left cmdp-item-go"></i></div>';
          });
        }
        if (aulaList.length) {
          html += '<div class="cmdp-group">Aulas y espacios</div>';
          aulaList.forEach(function (e2) {
            html += '<div class="cmdp-item" onclick="_cmdpEspacio()">' +
              '<i class="ti ti-door cmdp-item-ico"></i>' +
              '<div class="cmdp-item-main"><div class="cmdp-item-title">' + esc(e2.nombre) + "</div>" +
              '<div class="cmdp-item-meta">' + esc(e2.meta) + "</div></div>" +
              '<i class="ti ti-corner-down-left cmdp-item-go"></i></div>';
          });
        }

        res.innerHTML = html || '<div class="cmdp-empty">Sin resultados para «' + esc(q) + '».</div>';
      });
    }, 220);
  };

  window._cmdpAlumno = function (prim) {
    window.closeCommandPalette();
    if (typeof askQ === "function") askQ("¿Qué clase tiene " + prim + " ahora?");
  };
  window._cmdpProfesor = function (nombre) {
    window.closeCommandPalette();
    if (typeof askQ === "function") askQ("¿Qué horario tiene " + nombre + " hoy?");
  };
  window._cmdpEspacio = function () {
    window.closeCommandPalette();
    if (typeof showTab === "function") showTab("espacios");
  };

  // Atajo global ⌘K / Ctrl+K desde cualquier pantalla
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      var ov = document.getElementById("cmd-palette");
      if (ov && ov.style.display === "flex") window.closeCommandPalette();
      else window.openCommandPalette();
    }
  });
})();
