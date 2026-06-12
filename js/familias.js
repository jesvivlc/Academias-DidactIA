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

// ── PERFIL ALIMENTARIO (FAMILIA) ─────────────────────────────────────

async function loadPerfilAlimentario() {
  var panel = document.getElementById("panel-perfil-alim");
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:24px;color:var(--txt3);"><span class="spin">⟳</span> Cargando…</div>';

  var profRes = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
  if (!profRes.data) { panel.innerHTML = ''; return; }

  var vinRes = await sb.from("familia_alumno")
    .select("alumno_id, alumnos(id,nombre,curso,alergias,dieta_especial)")
    .eq("profile_id", profRes.data.id);

  var alumnos = (vinRes.data || []).map(function(v) {
    return Object.assign({ id: v.alumno_id }, v.alumnos);
  }).filter(function(a) { return a.id; });

  if (!alumnos.length) { panel.innerHTML = ''; return; }

  var html = '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px 20px;margin-top:16px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">🥗 Perfil alimentario</div>' +
    '<div style="font-size:12px;color:var(--txt3);margin-bottom:14px;">Esta información se comparte con el comedor y se pre-rellena en autorizaciones de salidas.</div>' +
    alumnos.map(function(a) {
      return '<div style="border-top:1px solid var(--bdr);padding-top:12px;margin-top:12px;">' +
        '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">👤 ' + _famEsc(a.nombre) + '<span style="font-size:11px;font-weight:400;color:var(--txt3);margin-left:6px;">' + _famEsc(a.curso||'') + '</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<div><label style="font-size:11px;font-weight:600;color:var(--txt2);display:block;margin-bottom:3px;">⚠️ Alergias alimentarias</label>' +
            '<input type="text" id="peral-aler-' + a.id + '" value="' + _famEsc(a.alergias||'') + '" placeholder="Ej: frutos secos, marisco, gluten…" ' +
            'style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);color:var(--txt);"></div>' +
          '<div><label style="font-size:11px;font-weight:600;color:var(--txt2);display:block;margin-bottom:3px;">🥗 Dieta especial</label>' +
            '<input type="text" id="peral-diet-' + a.id + '" value="' + _famEsc(a.dieta_especial||'') + '" placeholder="Ej: vegetariana, sin lactosa, halal…" ' +
            'style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);color:var(--txt);"></div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<button onclick="_famGuardarPerfil(\'' + a.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:7px 16px;font-size:13px;cursor:pointer;">Guardar</button>' +
            '<span id="peral-msg-' + a.id + '" style="font-size:12px;display:none;"></span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';

  panel.innerHTML = html;
}

function _famEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function _famGuardarPerfil(alumnoId) {
  var aler = ((document.getElementById('peral-aler-' + alumnoId) || {}).value || '').trim();
  var diet = ((document.getElementById('peral-diet-' + alumnoId) || {}).value || '').trim();
  var msgEl = document.getElementById('peral-msg-' + alumnoId);

  var { error } = await sb.from('alumnos')
    .update({ alergias: aler || null, dieta_especial: diet || null })
    .eq('id', alumnoId).eq('centro_id', ctrId);

  if (error) {
    if (msgEl) { msgEl.textContent = '❌ Error: ' + error.message; msgEl.style.color = 'var(--red,#c62828)'; msgEl.style.display = 'inline'; }
    return;
  }
  if (msgEl) {
    msgEl.textContent = '✅ Guardado';
    msgEl.style.color = 'var(--success,#2e7d32)';
    msgEl.style.display = 'inline';
    setTimeout(function() { if (msgEl) msgEl.style.display = 'none'; }, 3000);
  }
}
window._famGuardarPerfil = _famGuardarPerfil;

// ── NOTIFICACIONES PUSH (FAMILIA) ────────────────────────────────────
// Conversión estándar de la clave VAPID base64url → Uint8Array.
function urlBase64ToUint8Array(base64String) {
  var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  var raw = atob(base64);
  var output = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Si la familia no tiene suscripción push y no ha cerrado el banner antes,
// muestra un banner suave en la home para activarlas. Todo en try/catch.
async function initPushFamilias() {
  try {
    if (typeof role !== "undefined" && role !== "familia") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!currentUser || !currentUser.id) return;

    // ¿ya tiene una suscripción activa?
    var ex = await sb.from("push_subscriptions").select("id").eq("user_id", currentUser.id).limit(1);
    if (ex.data && ex.data.length) return;

    // ¿el usuario cerró el banner anteriormente?
    var dismissKey = "push_dismissed_" + currentUser.id;
    try { if (localStorage.getItem(dismissKey) === "1") return; } catch (e) {}

    _pushMostrarBanner(dismissKey);
  } catch (e) { /* silencioso */ }
}

function _pushMostrarBanner(dismissKey) {
  var host = document.getElementById("inicio-familia");
  if (!host || document.getElementById("push-banner-familia")) return;

  var banner = document.createElement("div");
  banner.id = "push-banner-familia";
  banner.style.cssText =
    "display:flex;align-items:center;gap:12px;background:var(--paper-2);border:1px solid var(--line);" +
    "border-radius:var(--r-sm,8px);padding:12px 14px;margin-top:14px;font-size:13px;color:var(--txt);";
  banner.innerHTML =
    '<span style="flex:1;">🔔 Activa las notificaciones para recibir avisos del centro</span>' +
    '<button id="push-activar-btn" class="btn btn-p" style="font-size:12px;padding:6px 12px;">Activar</button>' +
    '<button id="push-cerrar-btn" aria-label="Cerrar" style="background:none;border:none;cursor:pointer;color:var(--muted,#888);font-size:16px;line-height:1;">✕</button>';

  var head = host.querySelector(".home-head");
  if (head && head.parentNode === host) head.insertAdjacentElement("afterend", banner);
  else host.insertBefore(banner, host.firstChild);

  var actBtn = document.getElementById("push-activar-btn");
  if (actBtn) actBtn.onclick = function () { _pushActivar(); };
  var cerBtn = document.getElementById("push-cerrar-btn");
  if (cerBtn) cerBtn.onclick = function () {
    try { localStorage.setItem(dismissKey, "1"); } catch (e) {}
    banner.remove();
  };
}

async function _pushActivar() {
  var btn = document.getElementById("push-activar-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Activando…"; }
  try {
    if (!VAPID_PUBLIC_KEY || /TODO/.test(VAPID_PUBLIC_KEY)) {
      // Clave pública aún no configurada — no continuar.
      if (btn) { btn.disabled = false; btn.textContent = "Activar"; }
      return;
    }
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // INSERT fire-and-forget en push_subscriptions.
    sb.from("push_subscriptions").insert({
      user_id: currentUser.id,
      centro_id: ctrId,
      subscription: sub.toJSON ? sub.toJSON() : JSON.parse(JSON.stringify(sub)),
    }).then(function () {}, function () {});

    var banner = document.getElementById("push-banner-familia");
    if (banner) banner.remove();
    if (typeof showToast === "function") showToast("✅ Notificaciones activadas");
  } catch (e) {
    // Permiso denegado u otro fallo: restaurar el botón, sin error visible.
    if (btn) { btn.disabled = false; btn.textContent = "Activar"; }
  }
}
