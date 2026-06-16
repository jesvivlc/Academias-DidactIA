/* js/asistencia.js — Control de asistencia de aula
   Globals usados: sb, ctrId, currentUser, SB_URL, ANON_KEY, role */

(function () {
  "use strict";

  function _aEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Estado del modal activo
  var _st = null;

  /* ── Notificación push a familias ────────────────────────────── */
  async function _notificarFamiliaAsistencia(alumnoId, estado, observacion) {
    try {
      var r = await sb.from("familia_alumno")
        .select("profile_id")
        .eq("alumno_id", alumnoId);
      var familiaIds = (r.data || []).map(function (x) { return x.profile_id; });
      if (!familiaIds.length) return;

      var alumno = (_st && _st.alumnosMap && _st.alumnosMap[alumnoId]) || {};
      var nombre = alumno.nombre || "Tu hijo/a";
      var title = estado === "ausente"
        ? "⚠️ Ausencia en clase"
        : "🕐 Retraso en clase";
      var body = nombre + " ha sido registrado como " + estado + " en clase de hoy" +
        (observacion ? ". " + observacion : ".");

      await fetch(SB_URL + "/functions/v1/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY },
        body: JSON.stringify({ user_ids: familiaIds, title: title, body: body, tag: "asistencia-" + alumnoId })
      });

      // Marcar como notificado
      await sb.from("asistencia_clase")
        .update({ notificado_familia: true })
        .eq("centro_id", ctrId)
        .eq("alumno_id", alumnoId)
        .eq("fecha", _st ? _st.fecha : "")
        .eq("tramo", _st ? _st.tramo : 0);
    } catch (e) {
      console.error("[asistencia] push error:", e);
    }
  }

  /* ── UPSERT de un registro de asistencia ────────────────────── */
  async function _upsertAsistencia(alumnoId, estado, observacion) {
    var payload = {
      centro_id: ctrId,
      alumno_id: alumnoId,
      profesor_id: currentUser ? currentUser.id : null,
      grupo_horario: _st.grupo,
      fecha: _st.fecha,
      tramo: _st.tramo,
      estado: estado,
      observacion: observacion || null,
      notificado_familia: false
    };
    var r = await sb.from("asistencia_clase")
      .upsert(payload, { onConflict: "centro_id,alumno_id,fecha,tramo" })
      .select("id").single();
    if (r.error) throw r.error;

    // Notificar si ausente (inmediato)
    if (estado === "ausente") {
      _notificarFamiliaAsistencia(alumnoId, estado, observacion);
    }
    return r.data;
  }

  /* ── Render del contador ─────────────────────────────────────── */
  function _renderCounter() {
    var el = document.getElementById("asist-counter");
    if (!el || !_st) return;
    var recs = Object.values(_st.records);
    var total = _st.alumnos.length;
    var presentes = recs.filter(function (x) { return x.estado === "presente"; }).length;
    var ausentes  = recs.filter(function (x) { return x.estado === "ausente"; }).length;
    var retrasos  = recs.filter(function (x) { return x.estado === "retraso"; }).length;
    var sin = total - recs.length;
    el.innerHTML =
      '<span style="color:var(--success)">✓ ' + presentes + ' presentes</span> · ' +
      '<span style="color:var(--danger)">✗ ' + ausentes + ' ausentes</span> · ' +
      '<span style="color:var(--warning)">⚡ ' + retrasos + ' retrasos</span>' +
      (sin > 0 ? ' · <span style="color:var(--muted)">' + sin + ' sin registrar</span>' : '');
  }

  /* ── Cambiar estado de un alumno ─────────────────────────────── */
  window._asistCambiarEstado = async function (alumnoId, nuevoEstado) {
    if (!_st) return;
    var rec = _st.records[alumnoId] || {};
    // Toggle: si ya está en ese estado → volver a 'presente'
    if (rec.estado === nuevoEstado && nuevoEstado !== "presente") nuevoEstado = "presente";

    try {
      await _upsertAsistencia(alumnoId, nuevoEstado, rec.observacion || null);
      _st.records[alumnoId] = Object.assign({}, rec, { estado: nuevoEstado });
    } catch (e) {
      console.error("[asistencia] upsert error:", e);
    }
    _renderFilaAlumno(alumnoId);
    _renderCounter();
  };

  /* ── Guardar observación ─────────────────────────────────────── */
  window._asistGuardarObs = async function (alumnoId) {
    if (!_st) return;
    var inp = document.getElementById("asist-obs-" + alumnoId);
    var obs = inp ? inp.value.trim() : "";
    var rec = _st.records[alumnoId] || { estado: "presente" };
    try {
      await _upsertAsistencia(alumnoId, rec.estado, obs || null);
      _st.records[alumnoId] = Object.assign({}, rec, { observacion: obs || null });
    } catch (e) {
      console.error("[asistencia] obs error:", e);
    }
  };

  /* ── Render HTML de una fila de alumno ──────────────────────── */
  function _renderFilaAlumno(alumnoId) {
    var row = document.getElementById("asist-row-" + alumnoId);
    if (!row || !_st) return;
    row.innerHTML = _htmlFilaAlumno(_st.alumnosMap[alumnoId], _st.records[alumnoId]);
  }

  function _htmlFilaAlumno(al, rec) {
    var estado = (rec && rec.estado) || null;
    var obs = (rec && rec.observacion) || "";
    var alergiasBadge = "";
    if (al.alergias)
      alergiasBadge += ' <span style="background:#fde8e8;color:#b71c1c;border-radius:12px;padding:1px 7px;font-size:10px;">⚠️ ' + _aEsc(al.alergias) + "</span>";
    if (al.dieta_especial)
      alergiasBadge += ' <span style="background:#fff3e0;color:#e65100;border-radius:12px;padding:1px 7px;font-size:10px;">🥗 ' + _aEsc(al.dieta_especial) + "</span>";

    var btnPresente = '<button class="asist-btn' + (estado === "presente" ? " asist-btn--ok" : "") +
      '" onclick="window._asistCambiarEstado(' + _aEsc(JSON.stringify(al.id)) + ',\'presente\')">✓ Presente</button>';
    var btnRetraso = '<button class="asist-btn' + (estado === "retraso" ? " asist-btn--warn" : "") +
      '" onclick="window._asistCambiarEstado(' + _aEsc(JSON.stringify(al.id)) + ',\'retraso\')">⚡ Retraso</button>';
    var btnAusente = '<button class="asist-btn' + (estado === "ausente" ? " asist-btn--danger" : "") +
      '" onclick="window._asistCambiarEstado(' + _aEsc(JSON.stringify(al.id)) + ',\'ausente\')">✗ Ausente</button>';

    return '<div class="asist-alumno-nombre">' + _aEsc(al.nombre) + alergiasBadge + "</div>" +
      '<div class="asist-btns">' + btnPresente + btnRetraso + btnAusente + "</div>" +
      '<div class="asist-obs-wrap">' +
        '<input class="asist-obs-inp" id="asist-obs-' + _aEsc(al.id) + '" type="text" ' +
          'placeholder="Observación (opcional)" value="' + _aEsc(obs) + '" ' +
          'onblur="window._asistGuardarObs(' + _aEsc(JSON.stringify(al.id)) + ')">' +
      "</div>";
  }

  /* ── Confirmar lista ─────────────────────────────────────────── */
  window._asistConfirmar = async function () {
    if (!_st) return;
    var btn = document.getElementById("asist-confirmar-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }

    // Registrar como 'presente' los alumnos que no tienen registro (implícito)
    // y notificar 'retraso' a familias
    var pendientes = _st.alumnos.filter(function (al) { return !_st.records[al.id]; });
    for (var i = 0; i < pendientes.length; i++) {
      try {
        await _upsertAsistencia(pendientes[i].id, "presente", null);
        _st.records[pendientes[i].id] = { estado: "presente", observacion: null };
      } catch (e) { /* ignore */ }
    }

    // Notificar retrasos a familias
    var retrasos = Object.entries(_st.records).filter(function (e) { return e[1].estado === "retraso"; });
    for (var j = 0; j < retrasos.length; j++) {
      var alumnoId = retrasos[j][0];
      var rec = retrasos[j][1];
      if (!rec.notificado_familia) {
        await _notificarFamiliaAsistencia(alumnoId, "retraso", rec.observacion);
      }
    }

    _renderCounter();
    // Toast de confirmación
    var t = document.createElement("div");
    t.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--success);color:#fff;padding:10px 22px;border-radius:var(--r-sm);font-size:14px;z-index:100001;box-shadow:var(--sh);";
    t.textContent = "✅ Lista confirmada y guardada";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);

    if (btn) { btn.disabled = false; btn.textContent = "✅ Lista confirmada"; }
  };

  /* ── Cerrar modal ────────────────────────────────────────────── */
  window._asistCerrar = function () {
    var overlay = document.getElementById("asist-overlay");
    if (overlay) overlay.remove();
    _st = null;
  };

  /* ── Abrir modal de pasar lista ─────────────────────────────── */
  window.abrirPasarLista = async function (grupo, tramo, fecha) {
    // Eliminar overlay anterior si existe
    var existente = document.getElementById("asist-overlay");
    if (existente) existente.remove();

    // Crear overlay fullscreen
    var overlay = document.createElement("div");
    overlay.id = "asist-overlay";
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:100000;background:var(--paper);",
      "display:flex;flex-direction:column;overflow:hidden;"
    ].join("");
    overlay.innerHTML = [
      '<div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);background:var(--paper-2);">',
        '<button onclick="window._asistCerrar()" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:var(--r-sm);color:var(--txt2);">←</button>',
        '<div style="flex:1;">',
          '<div style="font-size:17px;font-weight:600;color:var(--txt);">📋 Pasar lista — ' + _aEsc(grupo) + '</div>',
          '<div style="font-size:12px;color:var(--muted);margin-top:2px;">Tramo ' + _aEsc(String(tramo)) + ' · ' + _aEsc(fecha) + '</div>',
        '</div>',
        '<div id="asist-counter" style="font-size:12px;color:var(--muted);text-align:right;max-width:220px;line-height:1.4;"></div>',
      '</div>',
      '<div id="asist-body" style="flex:1;overflow-y:auto;padding:16px 20px;">',
        '<div style="color:var(--muted);text-align:center;padding:40px 0;">Cargando alumnos…</div>',
      '</div>',
      '<div style="padding:14px 20px;border-top:1px solid var(--line);background:var(--paper-2);display:flex;gap:10px;justify-content:flex-end;">',
        '<button onclick="window._asistCerrar()" class="btn btn-ghost">Cerrar</button>',
        '<button id="asist-confirmar-btn" onclick="window._asistConfirmar()" class="btn btn-primary">✅ Confirmar lista</button>',
      '</div>'
    ].join("");
    document.body.appendChild(overlay);

    // Inyectar estilos si aún no existen
    if (!document.getElementById("asist-styles")) {
      var style = document.createElement("style");
      style.id = "asist-styles";
      style.textContent = [
        ".asist-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;",
          "padding:10px 12px;border-radius:var(--r-sm);background:var(--srf,var(--paper-2));margin-bottom:8px;}",
        ".asist-row:hover{background:var(--surface-sunk);}",
        ".asist-alumno-nombre{font-size:14px;font-weight:500;color:var(--txt);grid-column:1/-1;}",
        ".asist-btns{display:flex;gap:6px;flex-wrap:wrap;}",
        ".asist-btn{padding:5px 12px;border-radius:20px;border:1px solid var(--line);background:var(--paper);",
          "font-size:12px;font-weight:500;cursor:pointer;color:var(--txt2);transition:background .15s,color .15s;}",
        ".asist-btn:hover{background:var(--surface-sunk);}",
        ".asist-btn--ok{background:var(--success-soft);color:var(--success);border-color:var(--success);}",
        ".asist-btn--warn{background:var(--warning-soft);color:var(--warning);border-color:var(--warning);}",
        ".asist-btn--danger{background:var(--danger-soft);color:var(--danger);border-color:var(--danger);}",
        ".asist-obs-wrap{grid-column:1/-1;}",
        ".asist-obs-inp{width:100%;border:1px solid var(--line);border-radius:var(--r-sm);",
          "padding:5px 10px;font-size:12px;color:var(--txt);background:var(--paper);box-sizing:border-box;}",
        ".asist-obs-inp:focus{outline:none;border-color:var(--ink);}",
        ".hh-btn-lista{padding:4px 12px;border-radius:20px;border:1px solid var(--ink);background:var(--paper);",
          "font-size:12px;font-weight:500;cursor:pointer;color:var(--ink);white-space:nowrap;}",
        ".hh-btn-lista:hover{background:var(--ink);color:#fff;}",
        ".hh-actions{display:flex;align-items:center;}"
      ].join("");
      document.head.appendChild(style);
    }

    // Inicializar estado
    _st = { grupo: grupo, tramo: tramo, fecha: fecha, alumnos: [], alumnosMap: {}, records: {} };

    // Cargar alumnos del grupo y registros existentes en paralelo
    try {
      var [rAlumnos, rRecs] = await Promise.all([
        sb.from("alumnos")
          .select("id,nombre,alergias,dieta_especial")
          .eq("centro_id", ctrId)
          .eq("grupo_horario", grupo)
          .order("nombre"),
        sb.from("asistencia_clase")
          .select("alumno_id,estado,observacion,notificado_familia")
          .eq("centro_id", ctrId)
          .eq("grupo_horario", grupo)
          .eq("fecha", fecha)
          .eq("tramo", tramo)
      ]);

      _st.alumnos = rAlumnos.data || [];
      _st.alumnos.forEach(function (al) { _st.alumnosMap[al.id] = al; });
      (rRecs.data || []).forEach(function (rec) {
        _st.records[rec.alumno_id] = {
          estado: rec.estado,
          observacion: rec.observacion,
          notificado_familia: rec.notificado_familia
        };
      });

      var body = document.getElementById("asist-body");
      if (!body) return;

      if (!_st.alumnos.length) {
        body.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px 0;">No hay alumnos registrados en este grupo.</div>';
        return;
      }

      var html = _st.alumnos.map(function (al) {
        return '<div class="asist-row" id="asist-row-' + _aEsc(al.id) + '">' +
          _htmlFilaAlumno(al, _st.records[al.id]) +
        '</div>';
      }).join("");
      body.innerHTML = html;
      _renderCounter();

    } catch (e) {
      console.error("[asistencia] carga error:", e);
      var body2 = document.getElementById("asist-body");
      if (body2) body2.innerHTML = '<div style="color:var(--danger);text-align:center;padding:40px 0;">Error al cargar los datos.</div>';
    }
  };

})();
