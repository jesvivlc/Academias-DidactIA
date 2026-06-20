/* Módulo Mensajes — mensajería familia ↔ centro (sobre un alumno) */

// Cuenta mensajes no leídos y actualiza la badge del nav de Mensajes.
// Para familias: mensajes del centro sin leer (de_familia=false, leido=false).
// Para staff: mensajes de familias sin leer (de_familia=true, leido=false).
async function _msgCheckAndBadge() {
  try {
    if (!ctrId || !currentUser) return;
    var q = sb.from("mensajes").select("id", { count: "exact", head: true })
      .eq("centro_id", ctrId).eq("leido", false);
    if (role === "familia") {
      q = q.eq("familia_id", currentUser.id).eq("de_familia", false);
    } else {
      q = q.eq("de_familia", true);
    }
    var r = await q;
    var n = r.count || 0;
    var tab = document.getElementById("tab-mensajes");
    if (tab) tab.textContent = n > 0 ? "💬 Mensajes (" + n + ")" : "💬 Mensajes";
  } catch (e) {}
}
window._msgCheckAndBadge = _msgCheckAndBadge;

function _msgEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _msgHora(iso) {
  try {
    var d = new Date(iso);
    var hoy = new Date();
    var sameDay = d.toDateString() === hoy.toDateString();
    return sameDay ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                   : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}
async function _msgPush(userIds, title, body) {
  try {
    var ids = (userIds || []).filter(Boolean);
    if (!ids.length) return;
    await fetch(SB_URL + "/functions/v1/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY },
      body: JSON.stringify({ user_ids: ids, title: title, body: body, tag: "mensajes", url: "/app.html" })
    });
  } catch (e) {}
}

function _msgEnsureStyles() {
  if (document.getElementById("msg-styles")) return;
  var s = document.createElement("style");
  s.id = "msg-styles";
  s.textContent = [
    ".msg-page{display:flex;flex-direction:column;height:100%;overflow:hidden;}",
    ".msg-hdr{flex:0 0 auto;padding:22px 28px 14px;border-bottom:1px solid var(--line);background:var(--paper);}",
    ".msg-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}",
    ".msg-title{font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--txt);margin:0 0 2px;}",
    ".msg-sub{font-size:13px;color:var(--muted);margin:0;}",
    ".msg-body{flex:1;min-height:0;display:flex;overflow:hidden;}",
    ".msg-list{width:300px;flex:0 0 300px;border-right:1px solid var(--line);overflow-y:auto;background:var(--paper);}",
    ".msg-thread{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg);}",
    ".msg-chips{display:flex;gap:8px;flex-wrap:wrap;padding:14px 28px 0;}",
    ".msg-chip{padding:6px 14px;border-radius:20px;border:1px solid var(--line);font-size:12px;font-weight:500;cursor:pointer;background:var(--paper);color:var(--txt2);}",
    ".msg-chip-act{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".msg-conv{padding:14px 16px;border-bottom:1px solid var(--line);cursor:pointer;}",
    ".msg-conv:hover{background:var(--surface-sunk);}",
    ".msg-conv-sel{background:var(--ink-ll);}",
    ".msg-conv-name{font-size:13px;font-weight:600;color:var(--txt);}",
    ".msg-conv-prev{font-size:12px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".msg-unread{display:inline-block;min-width:18px;height:18px;line-height:18px;text-align:center;background:var(--danger);color:#fff;border-radius:9px;font-size:10px;font-weight:700;padding:0 5px;}",
    ".msg-scroll{flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:10px;}",
    ".msg-bubble{max-width:78%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}",
    ".msg-mine{align-self:flex-end;background:var(--ink);color:#fff;border-bottom-right-radius:4px;}",
    ".msg-theirs{align-self:flex-start;background:var(--paper);border:1px solid var(--line);color:var(--txt);border-bottom-left-radius:4px;}",
    ".msg-meta{font-size:10px;opacity:.7;margin-top:3px;}",
    ".msg-input-bar{flex:0 0 auto;display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--line);background:var(--paper);}",
    ".msg-input{flex:1;border:1px solid var(--line);border-radius:20px;padding:9px 14px;font-size:14px;background:var(--paper);color:var(--txt);resize:none;font-family:inherit;max-height:120px;}",
    ".msg-send{border:none;background:var(--ink);color:#fff;border-radius:20px;padding:0 18px;font-size:14px;font-weight:600;cursor:pointer;}",
    ".msg-empty{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--muted);font-size:14px;padding:40px;}",
    "@media(max-width:768px){.msg-list{width:100%;flex:1 1 auto;} .msg-body{flex-direction:column;} .msg-list.msg-hidden,.msg-thread.msg-hidden{display:none;}}"
  ].join("");
  document.head.appendChild(s);
}

var _msgFamHijoIdx = 0;
var _msgStaffSel = null;   // {alumno_id, familia_id, alumno_nombre, familia_nombre}

window.initMensajes = function () {
  var el = document.getElementById("panel-mensajes");
  if (!el) return;
  _msgEnsureStyles();
  if (role === "familia") _msgRenderFamilia(el);
  else _msgRenderStaff(el);
};

/* ═══════════ VISTA FAMILIA ═══════════ */
async function _msgRenderFamilia(el) {
  var hijos = (typeof currentUserAlumnos !== "undefined" && currentUserAlumnos) ? currentUserAlumnos : [];
  if (!hijos.length) {
    el.innerHTML = '<div class="msg-page"><div class="msg-hdr"><div class="msg-eyebrow">Comunicación</div><div class="msg-title">Mensajes</div></div><div class="msg-empty">No hay alumnos vinculados a tu cuenta.</div></div>';
    return;
  }
  if (_msgFamHijoIdx >= hijos.length) _msgFamHijoIdx = 0;
  var chips = hijos.length > 1
    ? '<div class="msg-chips">' + hijos.map(function (h, i) {
        return '<button class="msg-chip' + (i === _msgFamHijoIdx ? ' msg-chip-act' : '') + '" onclick="_msgFamSelHijo(' + i + ')">' + _msgEsc(h.nombre) + '</button>';
      }).join("") + '</div>'
    : "";
  el.innerHTML =
    '<div class="msg-page">' +
      '<div class="msg-hdr"><div class="msg-eyebrow">Comunicación con el centro</div><div class="msg-title">Mensajes</div>' +
        '<div class="msg-sub">Escribe al equipo del centro sobre tu hijo/a.</div></div>' +
      chips +
      '<div class="msg-thread" style="flex:1;">' +
        '<div class="msg-scroll" id="msg-scroll"><div class="msg-empty">Cargando…</div></div>' +
        '<div class="msg-input-bar">' +
          '<textarea class="msg-input" id="msg-input" rows="1" placeholder="Escribe un mensaje…"></textarea>' +
          '<button class="msg-send" onclick="_msgFamEnviar()">Enviar</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  _msgFamCargar();
}
window._msgFamSelHijo = function (i) { _msgFamHijoIdx = i; _msgRenderFamilia(document.getElementById("panel-mensajes")); };

async function _msgFamCargar() {
  var hijo = currentUserAlumnos[_msgFamHijoIdx];
  var scroll = document.getElementById("msg-scroll");
  if (!hijo || !scroll) return;
  var r = await sb.from("mensajes").select("*")
    .eq("centro_id", ctrId).eq("alumno_id", hijo.id).eq("familia_id", currentUser.id)
    .order("created_at", { ascending: true }).limit(500);
  var msgs = r.data || [];
  // Marcar como leídos los del centro
  var noLeidos = msgs.filter(function (m) { return !m.de_familia && !m.leido; }).map(function (m) { return m.id; });
  if (noLeidos.length) sb.from("mensajes").update({ leido: true }).in("id", noLeidos).then(function () { _msgCheckAndBadge(); }, function () {});
  if (!msgs.length) { scroll.innerHTML = '<div class="msg-empty">Aún no hay mensajes. Escribe el primero al centro 👇</div>'; return; }
  scroll.innerHTML = msgs.map(function (m) {
    var mine = m.de_familia;
    return '<div class="msg-bubble ' + (mine ? "msg-mine" : "msg-theirs") + '">' + _msgEsc(m.texto) +
      '<div class="msg-meta">' + (mine ? "Tú" : "Centro") + " · " + _msgHora(m.created_at) + '</div></div>';
  }).join("");
  scroll.scrollTop = scroll.scrollHeight;
}

window._msgFamEnviar = async function () {
  var inp = document.getElementById("msg-input");
  var hijo = currentUserAlumnos[_msgFamHijoIdx];
  if (!inp || !hijo) return;
  var texto = (inp.value || "").trim();
  if (!texto) return;
  inp.value = "";
  var ins = await sb.from("mensajes").insert({
    centro_id: ctrId, alumno_id: hijo.id, alumno_nombre: hijo.nombre,
    familia_id: currentUser.id, remitente_id: currentUser.id, de_familia: true, texto: texto
  });
  if (ins.error) { if (typeof showToast === "function") showToast("No se pudo enviar"); inp.value = texto; return; }
  _msgFamCargar();
  // Push al equipo del centro (admins/dirección)
  (async function () {
    try {
      var rp = await sb.from("profiles").select("id").eq("centro_id", ctrId).in("rol", ["admin", "admin_institucional", "director", "jefatura"]);
      _msgPush((rp.data || []).map(function (p) { return p.id; }), "💬 Mensaje de una familia",
        (currentUserName || "Una familia") + " sobre " + (hijo.nombre || "su hijo/a") + ": " + texto.slice(0, 80));
    } catch (e) {}
  })();
};

/* ═══════════ VISTA STAFF ═══════════ */
async function _msgRenderStaff(el) {
  el.innerHTML =
    '<div class="msg-page">' +
      '<div class="msg-hdr" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">' +
        '<div><div class="msg-eyebrow">Comunicación con familias</div><div class="msg-title">Mensajes</div>' +
          '<div class="msg-sub">Conversaciones con las familias del centro.</div></div>' +
        '<button onclick="window._msgStaffNuevo()" style="flex:0 0 auto;padding:9px 16px;border-radius:9px;border:none;background:var(--ink);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;">+ Nueva conversación</button>' +
      '</div>' +
      '<div class="msg-body">' +
        '<div class="msg-list" id="msg-list"><div class="msg-empty">Cargando…</div></div>' +
        '<div class="msg-thread" id="msg-thread"><div class="msg-empty">← Selecciona una conversación</div></div>' +
      '</div>' +
    '</div>';
  _msgStaffCargarLista();
}

window._msgStaffNuevo = function () {
  var old = document.getElementById("msg-nuevo-ov");
  if (old) old.remove();
  var ov = document.createElement("div");
  ov.id = "msg-nuevo-ov";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
  ov.innerHTML =
    '<div style="background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:100%;max-width:460px;max-height:82vh;display:flex;flex-direction:column;border:1px solid var(--line);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);flex:0 0 auto;">' +
        '<div style="font-size:16px;font-weight:700;color:var(--txt);">Nueva conversación</div>' +
        '<button onclick="document.getElementById(\'msg-nuevo-ov\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted);line-height:1;padding:4px 8px;">✕</button>' +
      '</div>' +
      '<div style="padding:14px 20px 10px;flex:0 0 auto;">' +
        '<input id="msg-nuevo-busca" type="text" placeholder="Buscar alumno por nombre…" autocomplete="off"' +
          ' style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;font-family:inherit;background:var(--paper);color:var(--txt);"' +
          ' oninput="window._msgNuevoBuscar()">' +
      '</div>' +
      '<div id="msg-nuevo-lista" style="flex:1;overflow-y:auto;padding:4px 20px 16px;display:flex;flex-direction:column;gap:4px;">' +
        '<div style="text-align:center;color:var(--muted);font-size:13px;padding:28px 0;">Escribe para buscar alumnos</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
  setTimeout(function () { var i = document.getElementById("msg-nuevo-busca"); if (i) i.focus(); }, 60);
};

window._msgNuevoBuscar = async function () {
  var inp = document.getElementById("msg-nuevo-busca");
  var lista = document.getElementById("msg-nuevo-lista");
  if (!inp || !lista) return;
  var q = (inp.value || "").trim();
  if (q.length < 2) {
    lista.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:28px 0;">Escribe al menos 2 letras</div>';
    return;
  }
  lista.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:28px 0;">Buscando…</div>';
  var r = await window.sb.from("alumnos").select("id,nombre,grupo_horario").eq("centro_id", window.ctrId).ilike("nombre", "%" + q + "%").limit(20);
  var alumnos = r.data || [];
  if (!alumnos.length) {
    lista.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:28px 0;">Sin resultados</div>';
    return;
  }
  lista.innerHTML = alumnos.map(function (a) {
    return '<div style="padding:10px 12px;border:1px solid var(--line);border-radius:9px;cursor:pointer;background:var(--paper);transition:background .12s;"' +
      ' onclick="window._msgNuevoSelAlumno(\'' + a.id + '\',\'' + _msgArg(a.nombre) + '\')"' +
      ' onmouseenter="this.style.background=\'var(--paper-2)\'" onmouseleave="this.style.background=\'var(--paper)\'">' +
      '<div style="font-weight:600;font-size:13.5px;color:var(--txt);">' + _msgEsc(a.nombre) + '</div>' +
      (a.grupo_horario ? '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + _msgEsc(a.grupo_horario) + '</div>' : '') +
    '</div>';
  }).join("");
};

window._msgNuevoSelAlumno = async function (alumnoId, alumnoNombre) {
  var lista = document.getElementById("msg-nuevo-lista");
  if (lista) lista.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:28px 0;">Buscando familia vinculada…</div>';
  var rf = await window.sb.from("familia_alumno").select("profile_id,profiles(full_name)").eq("alumno_id", alumnoId);
  var familias = (rf.data || []).filter(function (fa) { return fa.profile_id; }).map(function (fa) {
    return { id: fa.profile_id, nombre: (fa.profiles && fa.profiles.full_name) || "Familia" };
  });
  if (!familias.length) {
    if (typeof showToast === "function") showToast("Este alumno no tiene familiar registrado en el sistema");
    var ov = document.getElementById("msg-nuevo-ov");
    if (ov) ov.remove();
    return;
  }
  var ov = document.getElementById("msg-nuevo-ov");
  if (ov) ov.remove();
  if (familias.length === 1) {
    _msgStaffAbrir(alumnoId, familias[0].id, alumnoNombre);
    return;
  }
  // Varias familias vinculadas — seleccionar
  var pickOv = document.createElement("div");
  pickOv.id = "msg-pick-ov";
  pickOv.style.cssText = "position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
  pickOv.innerHTML =
    '<div style="background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:100%;max-width:380px;border:1px solid var(--line);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line);">' +
        '<div style="font-size:15px;font-weight:700;color:var(--txt);">¿Con qué familiar? — ' + _msgEsc(alumnoNombre) + '</div>' +
        '<button onclick="document.getElementById(\'msg-pick-ov\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted);">✕</button>' +
      '</div>' +
      '<div style="padding:14px 18px 18px;display:flex;flex-direction:column;gap:8px;">' +
        familias.map(function (f) {
          return '<button onclick="document.getElementById(\'msg-pick-ov\').remove();window._msgStaffAbrir(\'' + alumnoId + '\',\'' + f.id + '\',\'' + _msgArg(alumnoNombre) + '\')"' +
            ' style="text-align:left;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:var(--paper);cursor:pointer;font-size:14px;font-weight:600;color:var(--txt);font-family:inherit;">' +
            _msgEsc(f.nombre) +
          '</button>';
        }).join("") +
      '</div>' +
    '</div>';
  document.body.appendChild(pickOv);
  pickOv.addEventListener("click", function (e) { if (e.target === pickOv) pickOv.remove(); });
};

async function _msgStaffCargarLista() {
  var list = document.getElementById("msg-list");
  if (!list) return;
  var r = await sb.from("mensajes").select("*").eq("centro_id", ctrId)
    .order("created_at", { ascending: false }).limit(2000);
  var msgs = r.data || [];
  // Agrupar por hilo (alumno_id + familia_id), conservar el último y contar no leídos de familia
  var hilos = {};
  msgs.forEach(function (m) {
    var k = m.alumno_id + "|" + m.familia_id;
    if (!hilos[k]) hilos[k] = { alumno_id: m.alumno_id, familia_id: m.familia_id, alumno_nombre: m.alumno_nombre || "Alumno", ultimo: m, unread: 0 };
    if (m.de_familia && !m.leido) hilos[k].unread++;
  });
  var arr = Object.values(hilos).sort(function (a, b) { return new Date(b.ultimo.created_at) - new Date(a.ultimo.created_at); });
  if (!arr.length) { list.innerHTML = '<div class="msg-empty">Sin conversaciones todavía.</div>'; return; }
  list.innerHTML = arr.map(function (h) {
    var sel = _msgStaffSel && _msgStaffSel.alumno_id === h.alumno_id && _msgStaffSel.familia_id === h.familia_id;
    return '<div class="msg-conv' + (sel ? " msg-conv-sel" : "") + '" onclick="_msgStaffAbrir(\'' + h.alumno_id + '\',\'' + h.familia_id + '\',\'' + _msgArg(h.alumno_nombre) + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<span class="msg-conv-name">' + _msgEsc(h.alumno_nombre) + '</span>' +
        (h.unread ? '<span class="msg-unread">' + h.unread + '</span>' : '') +
      '</div>' +
      '<div class="msg-conv-prev">' + (h.ultimo.de_familia ? "" : "Tú: ") + _msgEsc((h.ultimo.texto || "").slice(0, 50)) + '</div>' +
    '</div>';
  }).join("");
}
function _msgArg(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

window._msgStaffAbrir = async function (alumnoId, familiaId, alumnoNombre) {
  _msgStaffSel = { alumno_id: alumnoId, familia_id: familiaId, alumno_nombre: alumnoNombre };
  var thread = document.getElementById("msg-thread");
  if (!thread) return;
  // Nombre de la familia
  var fam = "Familia";
  try { var rp = await sb.from("profiles").select("full_name").eq("id", familiaId).maybeSingle(); if (rp.data && rp.data.full_name) fam = rp.data.full_name; } catch (e) {}
  thread.innerHTML =
    '<div style="padding:14px 20px;border-bottom:1px solid var(--line);background:var(--paper);">' +
      '<div style="font-weight:600;font-size:14px;color:var(--txt);">' + _msgEsc(alumnoNombre) + '</div>' +
      '<div style="font-size:12px;color:var(--muted);">' + _msgEsc(fam) + '</div></div>' +
    '<div class="msg-scroll" id="msg-scroll"><div class="msg-empty">Cargando…</div></div>' +
    '<div class="msg-input-bar">' +
      '<textarea class="msg-input" id="msg-input" rows="1" placeholder="Responder a la familia…"></textarea>' +
      '<button class="msg-send" onclick="_msgStaffEnviar()">Enviar</button>' +
    '</div>';
  _msgStaffCargarHilo();
};

async function _msgStaffCargarHilo() {
  if (!_msgStaffSel) return;
  var scroll = document.getElementById("msg-scroll");
  if (!scroll) return;
  var r = await sb.from("mensajes").select("*").eq("centro_id", ctrId)
    .eq("alumno_id", _msgStaffSel.alumno_id).eq("familia_id", _msgStaffSel.familia_id)
    .order("created_at", { ascending: true }).limit(500);
  var msgs = r.data || [];
  var noLeidos = msgs.filter(function (m) { return m.de_familia && !m.leido; }).map(function (m) { return m.id; });
  if (noLeidos.length) {
    await sb.from("mensajes").update({ leido: true }).in("id", noLeidos);
    _msgStaffCargarLista();
    _msgCheckAndBadge();
  }
  if (!msgs.length) { scroll.innerHTML = '<div class="msg-empty">Sin mensajes.</div>'; return; }
  scroll.innerHTML = msgs.map(function (m) {
    var mine = !m.de_familia;   // staff = "mío"
    return '<div class="msg-bubble ' + (mine ? "msg-mine" : "msg-theirs") + '">' + _msgEsc(m.texto) +
      '<div class="msg-meta">' + (mine ? "Centro" : "Familia") + " · " + _msgHora(m.created_at) + '</div></div>';
  }).join("");
  scroll.scrollTop = scroll.scrollHeight;
}

window._msgStaffEnviar = async function () {
  var inp = document.getElementById("msg-input");
  if (!inp || !_msgStaffSel) return;
  var texto = (inp.value || "").trim();
  if (!texto) return;
  inp.value = "";
  var ins = await sb.from("mensajes").insert({
    centro_id: ctrId, alumno_id: _msgStaffSel.alumno_id, alumno_nombre: _msgStaffSel.alumno_nombre,
    familia_id: _msgStaffSel.familia_id, remitente_id: currentUser.id, de_familia: false, texto: texto
  });
  if (ins.error) { if (typeof showToast === "function") showToast("No se pudo enviar"); inp.value = texto; return; }
  _msgStaffCargarHilo();
  _msgStaffCargarLista();
  _msgPush([_msgStaffSel.familia_id], "💬 Mensaje del centro", "El centro te ha escrito sobre " + (_msgStaffSel.alumno_nombre || "tu hijo/a") + ".");
};
