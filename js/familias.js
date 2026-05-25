// ── PORTAL FAMILIA ───────────────────────────────────────────────────

function initFamiliaView() {
  var title = document.querySelector("#welcome .wlc-title");
  if (title) title.textContent = "Bienvenido a tu portal familiar";
  var sub = document.querySelector("#welcome .wlc-sub");
  if (sub) sub.innerHTML = "Toda la información escolar de tus hijos, al instante.";
  var qs = document.querySelector("#welcome .quick-qs");
  if (qs) qs.innerHTML =
    '<div class="quick-q" onclick="askQ(\'¿Cuándo es la próxima reunión de familias?\')">¿Cuándo es la próxima reunión?</div>' +
    '<div class="quick-q" onclick="askQ(\'¿Cómo justifico una ausencia de mi hijo?\')">¿Cómo justifico una falta?</div>' +
    '<div class="quick-q" onclick="askQ(\'¿Qué actividades extraescolares hay?\')">¿Qué extraescolares hay?</div>';
}

// ── COMEDOR FAMILIA ──────────────────────────────────────────────────

async function loadFamiliaComedor() {
  var panel = document.getElementById("panel-comedor");
  if (!panel) return;
  panel.innerHTML = '<div style="padding:28px;text-align:center;color:var(--txt3);"><span class="spin">⟳</span> Cargando…</div>';

  var today    = new Date().toISOString().split("T")[0];
  var tmrwDate = new Date(); tmrwDate.setDate(tmrwDate.getDate() + 1);
  var tomorrow = tmrwDate.toISOString().split("T")[0];

  var profRes = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
  if (!profRes.data) {
    panel.innerHTML = '<div style="padding:28px;color:var(--red);">Error al cargar perfil.</div>';
    return;
  }

  var vinRes = await sb.from("familia_alumno")
    .select("alumno_id, alumnos(id, nombre, curso, grupo_horario)")
    .eq("profile_id", profRes.data.id);

  var alumnos = (vinRes.data || []).map(function(v) {
    return Object.assign({ id: v.alumno_id }, v.alumnos);
  }).filter(function(a) { return a.id; });

  if (!alumnos.length) {
    panel.innerHTML = '<div style="padding:28px;text-align:center;color:var(--txt3);">No tienes alumnos vinculados a tu cuenta. Contacta con secretaría.</div>';
    return;
  }

  var alumnoIds = alumnos.map(function(a) { return a.id; });
  var eightAgo  = new Date(Date.now() - 8 * 86400000).toISOString().split("T")[0];

  var asistRes = await sb.from("asistencia_comedor")
    .select("alumno_id, fecha, se_queda")
    .eq("centro_id", ctrId)
    .in("alumno_id", alumnoIds)
    .gte("fecha", eightAgo)
    .lte("fecha", tomorrow)
    .order("fecha", { ascending: false });

  var asist = asistRes.data || [];

  function lastSchoolDays(n) {
    var days = [];
    var d = new Date();
    while (days.length < n) {
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d.toISOString().split("T")[0]);
      d = new Date(d - 86400000);
    }
    return days;
  }
  var schoolDays = lastSchoolDays(7);

  function statusOf(rec) {
    if (!rec)         return { icon: "⬜", txt: "Sin registro",   color: "var(--txt3)" };
    if (rec.se_queda) return { icon: "🟢", txt: "Se queda",       color: "#2e7d32" };
    return              { icon: "🔴", txt: "No se queda",  color: "#b71c1c" };
  }

  var html = '<div style="padding:28px;display:flex;flex-direction:column;gap:22px;overflow-y:auto;background:var(--bg);">' +
    '<div class="pg-hdr"><div><div class="pg-title">Comedor escolar</div><div class="pg-sub">Estado de comedor de tus hijos</div></div>' +
    '<button class="btn btn-p" onclick="loadFamiliaComedor()">↺ Actualizar</button></div>';

  alumnos.forEach(function(alumno) {
    var todayRec = asist.find(function(a) { return a.alumno_id === alumno.id && a.fecha === today; });
    var tmrwRec  = asist.find(function(a) { return a.alumno_id === alumno.id && a.fecha === tomorrow; });
    var s = statusOf(todayRec);

    var histHtml = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 4px;">';
    schoolDays.forEach(function(day) {
      var rec   = asist.find(function(a) { return a.alumno_id === alumno.id && a.fecha === day; });
      var si    = statusOf(rec);
      var label = new Date(day + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
      var isT   = day === today;
      histHtml += '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:' +
        (isT ? "var(--ink)" : "var(--txt3)") + ';' + (isT ? "font-weight:600;" : "") + '">' +
        '<span style="font-size:20px;">' + si.icon + '</span>' +
        '<span>' + label + (isT ? " ·hoy" : "") + '</span></div>';
    });
    histHtml += '</div>';

    var safeName = alumno.nombre.replace(/'/g, "&#39;");
    var tmrwHtml = (tmrwRec && !tmrwRec.se_queda)
      ? '<div style="margin-top:8px;font-size:13px;padding:8px 12px;background:#e8f5e9;border-radius:var(--r-sm);color:#2e7d32;">✅ Aviso enviado: no come mañana</div>'
      : '<button class="btn btn-s" style="margin-top:8px;" onclick="_familiaAvisoManana(\'' + alumno.id + '\', \'' + safeName + '\')">📩 Avisar que no come mañana</button>';

    html += '<div class="card">' +
      '<div class="card-hdr">' +
        '<div class="card-ico b" style="font-size:18px;background:var(--ink-ll);color:var(--ink);">👦</div>' +
        '<div><div class="card-title">' + alumno.nombre + '</div>' +
        '<div class="card-desc">' + (alumno.curso || alumno.grupo_horario || "") + '</div></div>' +
      '</div>' +
      '<div style="font-size:15px;font-weight:600;color:' + s.color + ';margin-top:4px;">' + s.icon + ' Hoy: ' + s.txt + '</div>' +
      '<div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);margin-top:14px;margin-bottom:2px;">Últimos 7 días lectivos</div>' +
      histHtml + tmrwHtml + '</div>';
  });

  html += '</div>';
  panel.innerHTML = html;
}

async function _familiaAvisoManana(alumnoId, alumnoNombre) {
  var tmrwDate = new Date(); tmrwDate.setDate(tmrwDate.getDate() + 1);
  var tomorrow = tmrwDate.toISOString().split("T")[0];

  var res = await sb.from("asistencia_comedor").upsert({
    centro_id:      ctrId,
    alumno_id:      alumnoId,
    fecha:          tomorrow,
    se_queda:       false,
    plaza_fija:     false,
    registrado_por: currentUserName || (currentUser && currentUser.email) || "familia",
  }, { onConflict: "centro_id,alumno_id,fecha" });

  if (res.error) { alert("Error al registrar el aviso: " + res.error.message); return; }
  loadFamiliaComedor();
}

// ── AVISOS ───────────────────────────────────────────────────────────

async function loadAvisos() {
  var panel = document.getElementById("panel-avisos");
  if (!panel) return;

  panel.innerHTML = '<div style="padding:28px;display:flex;flex-direction:column;gap:22px;background:var(--bg);">' +
    '<div class="pg-hdr"><div><div class="pg-title">Avisos</div><div class="pg-sub">Avisos del centro y cambios en clases</div></div>' +
    '<button class="btn btn-p" onclick="loadAvisos()">↺ Actualizar</button></div>' +
    '<div id="avisos-inner"><div style="text-align:center;color:var(--txt3);padding:24px;"><span class="spin">⟳</span> Cargando…</div></div>' +
    '</div>';

  var today  = new Date().toISOString().split("T")[0];
  var grupos = (currentUserAlumnos || []).map(function(a) { return a.grupo_horario; }).filter(Boolean);

  // Banner from DOM (populated by mejoras.js via info_centro aviso_activo)
  var bannerEl  = document.getElementById("banner-aviso-txt");
  var avisoText = (bannerEl && bannerEl.textContent.trim()) || "";

  // Sustituciones today for child's groups
  var sustData = [];
  if (grupos.length) {
    var sustRes = await sb.from("sustituciones")
      .select("grupo_horario, tramo, hora_inicio, hora_fin, profesor_ausente, profesor_sustituto, observaciones, cubierta")
      .eq("centro_id", ctrId)
      .eq("fecha", today)
      .in("grupo_horario", grupos)
      .order("tramo");
    sustData = sustRes.data || [];
  }

  var inner = document.getElementById("avisos-inner");
  if (!inner) return;

  var html = "";

  if (avisoText) {
    html += '<div style="background:#fff3e0;border:1px solid #ff9800;border-radius:var(--r);padding:16px 18px;">' +
      '<div style="font-weight:600;color:#e65100;margin-bottom:6px;">⚠️ Aviso del centro</div>' +
      '<div style="font-size:14px;color:var(--txt);">' + avisoText + '</div></div>';
  }

  if (sustData.length) {
    html += '<div class="card"><div class="card-hdr"><div class="card-ico o">🔄</div><div>' +
      '<div class="card-title">Cambios en clases hoy</div>' +
      '<div class="card-desc">Sustituciones que afectan a tu hijo/a</div>' +
      '</div></div><div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">';
    sustData.forEach(function(s) {
      var hi    = String(s.hora_inicio || "").slice(0, 5);
      var hf    = String(s.hora_fin    || "").slice(0, 5);
      var badge = s.cubierta
        ? '<span style="background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap;">Cubierta ✓</span>'
        : '<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap;">Pendiente</span>';
      html += '<div style="border:1px solid var(--bdr);border-radius:var(--r-sm);padding:12px 14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
          '<div><div style="font-weight:500;font-size:14px;">' + hi + '–' + hf + ' · Grupo ' + s.grupo_horario + '</div>' +
          '<div style="font-size:12px;color:var(--txt3);margin-top:3px;">Ausencia: ' + s.profesor_ausente +
          (s.observaciones ? ' · ' + s.observaciones : '') + '</div></div>' + badge + '</div></div>';
    });
    html += '</div></div>';
  }

  if (!avisoText && !sustData.length) {
    html += '<div style="text-align:center;padding:40px 20px;">' +
      '<div style="font-size:40px;margin-bottom:14px;">✅</div>' +
      '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:8px;">Todo al día</div>' +
      '<div style="font-size:14px;color:var(--txt3);">No hay nuevos avisos del centro en este momento.</div></div>';
  }

  inner.innerHTML = html;
}
