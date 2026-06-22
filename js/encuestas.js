/* Módulo Encuestas a familias — dirección crea, familias responden, dirección ve resultados */
let _encFamData; // caché local (antes _encFamData)

function _encEsc(s) { return escH(s); } // delegado a utils.js
function _encArg(s) { return escAttr(s); } // delegado a utils.js
function _encGestiona() {
  return ["admin", "admin_institucional", "director", "jefatura", "superadmin"].includes(window.role);
}
async function _encPush(userIds, title, body) {
  try {
    var ids = (userIds || []).filter(Boolean);
    if (!ids.length) return;
    await fetch(SB_URL + "/functions/v1/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON_KEY },
      body: JSON.stringify({ user_ids: ids, title: title, body: body, tag: "encuesta", url: "/app.html" })
    });
  } catch (e) {}
}
var _encTipoLabel = { escala: "Escala 1–5", opcion: "Opción múltiple", si_no: "Sí / No", texto: "Texto libre" };
var _encEstadoBadge = {
  borrador: ["Borrador", "var(--muted-2)"],
  abierta:  ["Abierta", "var(--success)"],
  cerrada:  ["Cerrada", "var(--muted)"],
};

window.initEncuestas = function () {
  var el = document.getElementById("panel-encuestas");
  if (!el) return;
  _encEnsureStyles();
  if (window.role === "familia") _encRenderFamilia(el);
  else _encRenderStaff(el);
};

/* ════════ STAFF ════════ */
async function _encRenderStaff(el) {
  el.innerHTML = '<div class="enc-page"><div class="enc-hdr">' +
    '<div><div class="enc-eyebrow">CENTRO · PARTICIPACIÓN</div>' +
    '<h1 class="enc-title">Encuestas a familias</h1>' +
    '<p class="enc-sub">Crea encuestas, recoge opiniones y consulta resultados agregados.</p></div>' +
    (_encGestiona() ? '<button class="enc-btn enc-btn-primary" onclick="window._encNueva()">+ Nueva encuesta</button>' : '') +
    '</div><div id="enc-list" class="enc-list-wrap"><div class="enc-loading">Cargando…</div></div></div>';
  _encCargarLista();
}

async function _encCargarLista() {
  var box = document.getElementById("enc-list");
  if (!box) return;
  var r = await window.sb.from("encuestas")
    .select("id,titulo,descripcion,preguntas,destinatarios,estado,anonima,fecha_cierre,created_at")
    .eq("centro_id", window.ctrId).order("created_at", { ascending: false });
  var encs = r.data || [];
  if (!encs.length) {
    box.innerHTML = '<div class=”enc-empty”>Aún no hay encuestas.' + (_encGestiona() ? ' Crea la primera con “+ Nueva encuesta”.' : '') + '</div>';
    return;
  }
  // Conteo de respuestas por encuesta
  var ids = encs.map(function (e) { return e.id; });
  var rr = await window.sb.from("encuesta_respuestas").select("encuesta_id").in("encuesta_id", ids);
  var counts = {};
  (rr.data || []).forEach(function (x) { counts[x.encuesta_id] = (counts[x.encuesta_id] || 0) + 1; });

  box.innerHTML = encs.map(function (e) {
    var badge = _encEstadoBadge[e.estado] || ["—", "var(--muted)"];
    var nq = (e.preguntas || []).length;
    var nr = counts[e.id] || 0;
    var dest = !e.destinatarios || e.destinatarios === "todos" ? "Todas las familias" : e.destinatarios.replace("grupo:", "Grupo ");
    return '<div class="enc-card">' +
      '<div class="enc-card-main" onclick="window._encResultados(\'' + e.id + '\')">' +
        '<div class="enc-card-top"><span class="enc-badge" style="background:' + badge[1] + '">' + badge[0] + '</span>' +
        '<span class="enc-card-ttl">' + _encEsc(e.titulo) + '</span></div>' +
        '<div class="enc-card-meta">' + nq + ' pregunta' + (nq !== 1 ? "s" : "") + ' · ' + dest +
        ' · <strong>' + nr + '</strong> respuesta' + (nr !== 1 ? "s" : "") + (e.anonima ? ' · anónima' : '') + '</div>' +
      '</div>' +
      '<div class="enc-card-actions">' +
        (e.estado === "borrador" && _encGestiona() ? '<button class="enc-btn" onclick="window._encPublicar(\'' + e.id + '\')">Publicar</button>' : '') +
        (e.estado === "abierta" && _encGestiona() ? '<button class="enc-btn" onclick="window._encCerrar(\'' + e.id + '\')">Cerrar</button>' : '') +
        '<button class="enc-btn" onclick="window._encResultados(\'' + e.id + '\')">Resultados</button>' +
        (_encGestiona() ? '<button class="enc-btn enc-btn-danger" title="Eliminar" onclick="window._encBorrar(\'' + e.id + '\')">✕</button>' : '') +
      '</div></div>';
  }).join("");
}

/* ── Wizard nueva encuesta ── */
window._encNueva = function () {
  window._encDraft = { preguntas: [] };
  var old = document.getElementById("enc-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "enc-modal";
  w.className = "enc-ov";
  w.innerHTML = '<div class="enc-modal">' +
    '<div class="enc-modal-hd"><h3>Nueva encuesta</h3><button class="enc-x" onclick="document.getElementById(\'enc-modal\').remove()">✕</button></div>' +
    '<div class="enc-modal-bd">' +
      '<label class="enc-fl">Título *</label><input id="enc-f-titulo" class="enc-in" type="text" maxlength="140" placeholder="Ej. Satisfacción con el comedor">' +
      '<label class="enc-fl">Descripción</label><textarea id="enc-f-desc" class="enc-in" rows="2" maxlength="400" placeholder="Contexto para las familias…"></textarea>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:160px;"><label class="enc-fl">Destinatarios</label><select id="enc-f-dest" class="enc-in"><option value="todos">Todas las familias</option></select></div>' +
        '<div style="flex:1;min-width:140px;"><label class="enc-fl">Cierre (opcional)</label><input id="enc-f-cierre" class="enc-in" type="date"></div>' +
      '</div>' +
      '<label class="enc-chk"><input id="enc-f-anon" type="checkbox"> Respuestas anónimas</label>' +
      '<div class="enc-pq-hd"><span class="enc-fl" style="margin:0">Preguntas</span><button class="enc-btn" onclick="window._encAddPregunta()">+ Añadir pregunta</button></div>' +
      '<div id="enc-pq-list" class="enc-pq-list"></div>' +
    '</div>' +
    '<div class="enc-modal-ft"><button class="enc-btn" onclick="document.getElementById(\'enc-modal\').remove()">Cancelar</button>' +
    '<button class="enc-btn enc-btn-primary" onclick="window._encGuardar(this)">Guardar borrador</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener("click", function (e) { if (e.target === w) w.remove(); });
  _encCargarGruposSelect();
  window._encAddPregunta();
};

async function _encCargarGruposSelect() {
  try {
    var r = await window.sb.from("alumnos").select("grupo_horario").eq("centro_id", window.ctrId).limit(5000);
    var set = {};
    (r.data || []).forEach(function (a) { if (a.grupo_horario) set[a.grupo_horario] = 1; });
    var grupos = Object.keys(set).sort();
    var sel = document.getElementById("enc-f-dest");
    if (sel && grupos.length) {
      grupos.forEach(function (g) {
        var o = document.createElement("option");
        o.value = "grupo:" + g; o.textContent = "Grupo " + g;
        sel.appendChild(o);
      });
    }
  } catch (e) {}
}

window._encAddPregunta = function () {
  var d = window._encDraft;
  var pid = "p" + (d._seq = (d._seq || 0) + 1);
  d.preguntas.push({ id: pid, texto: "", tipo: "escala", opciones: [] });
  _encRenderPreguntas();
};
window._encDelPregunta = function (pid) {
  var d = window._encDraft;
  d.preguntas = d.preguntas.filter(function (p) { return p.id !== pid; });
  _encRenderPreguntas();
};
window._encChgPregunta = function (pid, campo, val) {
  var d = window._encDraft;
  var p = d.preguntas.find(function (x) { return x.id === pid; });
  if (!p) return;
  if (campo === "opciones") p.opciones = val.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  else p[campo] = val;
  if (campo === "tipo") _encRenderPreguntas();
};
function _encRenderPreguntas() {
  var box = document.getElementById("enc-pq-list");
  if (!box) return;
  var d = window._encDraft;
  box.innerHTML = d.preguntas.map(function (p, i) {
    var opcBlock = p.tipo === "opcion"
      ? '<label class="enc-fl" style="margin-top:6px">Opciones (una por línea)</label>' +
        '<textarea class="enc-in" rows="3" oninput="window._encChgPregunta(\'' + p.id + '\',\'opciones\',this.value)" placeholder="Opción A\nOpción B">' + _encEsc((p.opciones || []).join("\n")) + '</textarea>'
      : "";
    return '<div class="enc-pq">' +
      '<div class="enc-pq-row">' +
        '<span class="enc-pq-num">' + (i + 1) + '</span>' +
        '<input class="enc-in" type="text" value="' + _encEsc(p.texto) + '" oninput="window._encChgPregunta(\'' + p.id + '\',\'texto\',this.value)" placeholder="Texto de la pregunta">' +
        '<select class="enc-in enc-pq-tipo" onchange="window._encChgPregunta(\'' + p.id + '\',\'tipo\',this.value)">' +
          ['escala', 'opcion', 'si_no', 'texto'].map(function (t) {
            return '<option value="' + t + '"' + (p.tipo === t ? " selected" : "") + '>' + _encTipoLabel[t] + '</option>';
          }).join("") +
        '</select>' +
        '<button class="enc-btn enc-btn-danger" onclick="window._encDelPregunta(\'' + p.id + '\')">✕</button>' +
      '</div>' + opcBlock + '</div>';
  }).join("");
}

window._encGuardar = async function (btn) {
  var d = window._encDraft;
  var titulo = (document.getElementById("enc-f-titulo").value || "").trim();
  if (!titulo) { showToast("Indica un título"); return; }
  var preguntas = d.preguntas
    .map(function (p) { return { id: p.id, texto: (p.texto || "").trim(), tipo: p.tipo, opciones: p.opciones || [] }; })
    .filter(function (p) { return p.texto; });
  if (!preguntas.length) { showToast("Añade al menos una pregunta"); return; }
  for (var i = 0; i < preguntas.length; i++) {
    if (preguntas[i].tipo === "opcion" && preguntas[i].opciones.length < 2) {
      showToast("La pregunta " + (i + 1) + " necesita ≥2 opciones"); return;
    }
  }
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  var r = await window.sb.from("encuestas").insert({
    centro_id: window.ctrId,
    titulo: titulo,
    descripcion: (document.getElementById("enc-f-desc").value || "").trim() || null,
    preguntas: preguntas,
    destinatarios: document.getElementById("enc-f-dest").value || "todos",
    fecha_cierre: document.getElementById("enc-f-cierre").value || null,
    anonima: !!document.getElementById("enc-f-anon").checked,
    estado: "borrador",
    creado_por: window.currentUser && window.currentUser.id || null,
  }).select("id").single();
  if (r.error) { if (btn) { btn.disabled = false; btn.textContent = "Guardar borrador"; } showToast("Error: " + r.error.message); return; }
  document.getElementById("enc-modal").remove();
  showToast("✅ Encuesta guardada como borrador");
  _encCargarLista();
};

/* ── Publicar / cerrar / borrar ── */
window._encPublicar = async function (id) {
  if (!confirm("¿Publicar la encuesta? Las familias podrán responderla.")) return;
  var r = await window.sb.from("encuestas").update({ estado: "abierta" }).eq("id", id).select("titulo,destinatarios").single();
  if (r.error) { showToast("Error: " + r.error.message); return; }
  showToast("📣 Encuesta publicada");
  _encCargarLista();
  // Push a familias destinatarias (fire-and-forget)
  _encFamiliasDestinatarias(r.data.destinatarios).then(function (ids) {
    _encPush(ids, "Nueva encuesta del centro", r.data.titulo);
  });
};
window._encCerrar = async function (id) {
  if (!confirm("¿Cerrar la encuesta? Dejará de aceptar respuestas.")) return;
  var r = await window.sb.from("encuestas").update({ estado: "cerrada" }).eq("id", id);
  if (r.error) { showToast("Error: " + r.error.message); return; }
  showToast("Encuesta cerrada");
  _encCargarLista();
};
window._encBorrar = async function (id) {
  if (!confirm("¿Eliminar la encuesta y todas sus respuestas? No se puede deshacer.")) return;
  var r = await window.sb.from("encuestas").delete().eq("id", id);
  if (r.error) { showToast("Error: " + r.error.message); return; }
  showToast("Encuesta eliminada");
  _encCargarLista();
};

async function _encFamiliasDestinatarias(destinatarios) {
  try {
    if (!destinatarios || destinatarios === "todos") {
      var r = await window.sb.from("profiles").select("id").eq("centro_id", window.ctrId).eq("rol", "familia");
      return (r.data || []).map(function (p) { return p.id; });
    }
    var grupo = destinatarios.replace("grupo:", "");
    var al = await window.sb.from("alumnos").select("id").eq("centro_id", window.ctrId).eq("grupo_horario", grupo);
    var aIds = (al.data || []).map(function (a) { return a.id; });
    if (!aIds.length) return [];
    var fa = await window.sb.from("familia_alumno").select("profile_id").in("alumno_id", aIds);
    return Array.from(new Set((fa.data || []).map(function (x) { return x.profile_id; })));
  } catch (e) { return []; }
}

/* ── Resultados agregados ── */
window._encResultados = async function (id) {
  var el = document.getElementById("panel-encuestas");
  if (!el) return;
  el.innerHTML = '<div class="enc-page"><div class="enc-hdr"><div>' +
    '<button class="enc-btn" onclick="window.initEncuestas()">← Volver</button></div></div>' +
    '<div id="enc-res" class="enc-list-wrap"><div class="enc-loading">Cargando resultados…</div></div></div>';
  var er = await window.sb.from("encuestas").select("*").eq("id", id).single();
  if (er.error || !er.data) { document.getElementById("enc-res").innerHTML = '<div class="enc-empty">No disponible.</div>'; return; }
  var enc = er.data;
  var rr = await window.sb.from("encuesta_respuestas").select("respuestas").eq("encuesta_id", id);
  var resps = (rr.data || []).map(function (x) { return x.respuestas || {}; });
  var n = resps.length;
  var box = document.getElementById("enc-res");
  var badge = _encEstadoBadge[enc.estado] || ["—", "var(--muted)"];

  var html = '<div class="enc-res-hd"><span class="enc-badge" style="background:' + badge[1] + '">' + badge[0] + '</span>' +
    '<h2 class="enc-res-ttl">' + _encEsc(enc.titulo) + '</h2>' +
    (enc.descripcion ? '<p class="enc-sub">' + _encEsc(enc.descripcion) + '</p>' : '') +
    '<div class="enc-res-n">' + n + ' respuesta' + (n !== 1 ? "s" : "") + '</div></div>';

  if (!n) {
    html += '<div class="enc-empty">Todavía no hay respuestas.</div>';
  } else {
    (enc.preguntas || []).forEach(function (p, i) {
      html += '<div class="enc-res-q"><div class="enc-res-qttl">' + (i + 1) + '. ' + _encEsc(p.texto) +
        ' <span class="enc-res-qtipo">' + (_encTipoLabel[p.tipo] || "") + '</span></div>';
      var vals = resps.map(function (r) { return r[p.id]; }).filter(function (v) { return v !== undefined && v !== null && v !== ""; });
      if (p.tipo === "texto") {
        html += vals.length
          ? '<div class="enc-res-texts">' + vals.map(function (v) { return '<div class="enc-res-text">“' + _encEsc(v) + '”</div>'; }).join("") + '</div>'
          : '<div class="enc-res-none">Sin respuestas de texto.</div>';
      } else if (p.tipo === "escala") {
        var sum = 0, c = 0, dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        vals.forEach(function (v) { var nv = parseInt(v, 10); if (nv >= 1 && nv <= 5) { dist[nv]++; sum += nv; c++; } });
        var media = c ? (sum / c).toFixed(2) : "—";
        html += '<div class="enc-res-media">Media: <strong>' + media + '</strong> / 5</div>';
        for (var k = 5; k >= 1; k--) html += _encBar(k + " ★", dist[k], c);
      } else if (p.tipo === "si_no") {
        var si = vals.filter(function (v) { return v === "si" || v === true || v === "true"; }).length;
        var no = vals.length - si;
        html += _encBar("Sí", si, vals.length) + _encBar("No", no, vals.length);
      } else if (p.tipo === "opcion") {
        var tally = {};
        (p.opciones || []).forEach(function (o) { tally[o] = 0; });
        vals.forEach(function (v) { if (tally[v] === undefined) tally[v] = 0; tally[v]++; });
        Object.keys(tally).forEach(function (o) { html += _encBar(o, tally[o], vals.length); });
      }
      html += '</div>';
    });
  }
  box.innerHTML = html;
};
function _encBar(label, val, total) {
  var pct = total ? Math.round((val / total) * 100) : 0;
  return '<div class="enc-bar-row"><span class="enc-bar-lbl">' + _encEsc(label) + '</span>' +
    '<span class="enc-bar-track"><span class="enc-bar-fill" style="width:' + pct + '%"></span></span>' +
    '<span class="enc-bar-val">' + val + ' (' + pct + '%)</span></div>';
}

/* ════════ FAMILIA ════════ */
async function _encRenderFamilia(el) {
  el.innerHTML = '<div class="enc-page"><div class="enc-hdr"><div>' +
    '<div class="enc-eyebrow">PARTICIPACIÓN</div><h1 class="enc-title">Encuestas</h1>' +
    '<p class="enc-sub">Tu opinión ayuda a mejorar el centro.</p></div></div>' +
    '<div id="enc-fam" class="enc-list-wrap"><div class="enc-loading">Cargando…</div></div></div>';
  var box = document.getElementById("enc-fam");
  var r = await window.sb.from("encuestas").select("id,titulo,descripcion,preguntas,estado,anonima,fecha_cierre")
    .eq("centro_id", window.ctrId).eq("estado", "abierta").order("created_at", { ascending: false });
  var encs = r.data || [];
  // Cuáles ya respondió
  var mine = await window.sb.from("encuesta_respuestas").select("encuesta_id").eq("familia_id", window.currentUser.id);
  var done = {};
  (mine.data || []).forEach(function (x) { done[x.encuesta_id] = 1; });
  _encFamData = {};
  encs.forEach(function (e) { _encFamData[e.id] = e; });

  if (!encs.length) { box.innerHTML = '<div class="enc-empty">No hay encuestas abiertas ahora mismo.</div>'; return; }
  box.innerHTML = encs.map(function (e) {
    var resp = done[e.id];
    return '<div class="enc-card"><div class="enc-card-main">' +
      '<div class="enc-card-top">' + (resp ? '<span class="enc-badge" style="background:var(--success)">✓ Respondida</span>' : '<span class="enc-badge" style="background:var(--ink)">Pendiente</span>') +
      '<span class="enc-card-ttl">' + _encEsc(e.titulo) + '</span></div>' +
      (e.descripcion ? '<div class="enc-card-meta">' + _encEsc(e.descripcion) + '</div>' : '') +
      '</div><div class="enc-card-actions">' +
      (resp ? '<span class="enc-res-none" style="padding:8px">¡Gracias!</span>' : '<button class="enc-btn enc-btn-primary" onclick="window._encResponder(\'' + e.id + '\')">Responder</button>') +
      '</div></div>';
  }).join("");
}

window._encResponder = function (id) {
  var enc = _encFamData[id];
  if (!enc) return;
  var old = document.getElementById("enc-modal");
  if (old) old.remove();
  var w = document.createElement("div");
  w.id = "enc-modal";
  w.className = "enc-ov";
  var qs = (enc.preguntas || []).map(function (p, i) {
    var input;
    if (p.tipo === "escala") {
      input = '<div class="enc-scale">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<label class="enc-scale-o"><input type="radio" name="' + p.id + '" value="' + n + '"><span>' + n + '</span></label>';
      }).join("") + '</div><div class="enc-scale-lbl"><span>Nada</span><span>Mucho</span></div>';
    } else if (p.tipo === "si_no") {
      input = '<div class="enc-scale">' +
        '<label class="enc-scale-o"><input type="radio" name="' + p.id + '" value="si"><span>Sí</span></label>' +
        '<label class="enc-scale-o"><input type="radio" name="' + p.id + '" value="no"><span>No</span></label></div>';
    } else if (p.tipo === "opcion") {
      input = (p.opciones || []).map(function (o) {
        return '<label class="enc-opt"><input type="radio" name="' + p.id + '" value="' + _encEsc(o) + '"> ' + _encEsc(o) + '</label>';
      }).join("");
    } else {
      input = '<textarea class="enc-in" rows="2" data-q="' + p.id + '" maxlength="500"></textarea>';
    }
    return '<div class="enc-q-block"><div class="enc-q-txt">' + (i + 1) + '. ' + _encEsc(p.texto) + '</div>' + input + '</div>';
  }).join("");
  w.innerHTML = '<div class="enc-modal">' +
    '<div class="enc-modal-hd"><h3>' + _encEsc(enc.titulo) + '</h3><button class="enc-x" onclick="document.getElementById(\'enc-modal\').remove()">✕</button></div>' +
    '<div class="enc-modal-bd" id="enc-resp-bd">' +
      (enc.descripcion ? '<p class="enc-sub" style="margin-bottom:8px">' + _encEsc(enc.descripcion) + '</p>' : '') +
      (enc.anonima ? '<div class="enc-anon-note">🔒 Esta encuesta es anónima.</div>' : '') +
      qs +
    '</div>' +
    '<div class="enc-modal-ft"><button class="enc-btn" onclick="document.getElementById(\'enc-modal\').remove()">Cancelar</button>' +
    '<button class="enc-btn enc-btn-primary" onclick="window._encEnviarRespuesta(\'' + id + '\',this)">Enviar respuestas</button></div></div>';
  document.body.appendChild(w);
};

window._encEnviarRespuesta = async function (id, btn) {
  var enc = _encFamData[id];
  if (!enc) return;
  var bd = document.getElementById("enc-resp-bd");
  var out = {};
  var faltan = 0;
  (enc.preguntas || []).forEach(function (p) {
    if (p.tipo === "texto") {
      var ta = bd.querySelector('textarea[data-q="' + p.id + '"]');
      var v = ta && ta.value.trim();
      if (v) out[p.id] = v; else faltan++;
    } else {
      var sel = bd.querySelector('input[name="' + p.id + '"]:checked');
      if (sel) out[p.id] = sel.value; else faltan++;
    }
  });
  if (faltan && !confirm("Hay " + faltan + " pregunta(s) sin responder. ¿Enviar igualmente?")) return;
  if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
  var r = await window.sb.from("encuesta_respuestas").insert({
    encuesta_id: id,
    centro_id: window.ctrId,
    familia_id: enc.anonima ? null : window.currentUser.id,
    respuestas: out,
  });
  if (r.error) {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar respuestas"; }
    showToast(r.error.code === "23505" ? "Ya has respondido esta encuesta" : "Error: " + r.error.message);
    return;
  }
  document.getElementById("enc-modal").remove();
  showToast("✅ ¡Gracias por tu respuesta!");
  initEncuestas();
};

/* ── CSS ── */
function _encEnsureStyles() {
  if (document.getElementById("enc-styles")) return;
  var s = document.createElement("style");
  s.id = "enc-styles";
  s.textContent = [
    ".enc-page{display:flex;flex-direction:column;height:100%;overflow:auto;}",
    ".enc-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:22px 28px 16px;border-bottom:1px solid var(--line);}",
    ".enc-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}",
    ".enc-title{font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--txt);margin:0 0 2px;}",
    ".enc-sub{font-size:13px;color:var(--muted);margin:0;}",
    ".enc-list-wrap{padding:18px 28px 40px;}",
    ".enc-loading,.enc-empty{text-align:center;padding:50px 20px;color:var(--muted);font-size:14px;}",
    ".enc-card{display:flex;align-items:center;gap:14px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:12px;}",
    ".enc-card-main{flex:1;min-width:0;cursor:pointer;}",
    ".enc-card-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
    ".enc-card-ttl{font-weight:600;font-size:15px;color:var(--txt);}",
    ".enc-card-meta{font-size:12px;color:var(--muted);margin-top:4px;}",
    ".enc-card-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:0 0 auto;}",
    ".enc-badge{color:#fff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;text-transform:uppercase;letter-spacing:.03em;}",
    ".enc-btn{padding:7px 13px;border-radius:8px;border:1px solid var(--line-2);background:var(--paper);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}",
    ".enc-btn:hover{background:var(--surface-sunk);}",
    ".enc-btn-primary{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".enc-btn-danger{color:var(--danger);}",
    ".enc-ov{position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}",
    ".enc-modal{background:var(--paper);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--line);}",
    ".enc-modal-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);flex:0 0 auto;}",
    ".enc-modal-hd h3{margin:0;font-size:17px;font-weight:700;color:var(--txt);}",
    ".enc-x{background:none;border:none;font-size:16px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px;}",
    ".enc-x:hover{background:var(--surface-sunk);}",
    ".enc-modal-bd{padding:16px 20px;overflow:auto;flex:1;}",
    ".enc-fl{display:block;font-size:12px;font-weight:600;color:var(--txt2);margin:10px 0 4px;}",
    ".enc-in{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line-2);border-radius:8px;font-size:14px;font-family:inherit;background:var(--paper);color:var(--txt);}",
    ".enc-in:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px var(--ink-ll);}",
    ".enc-chk{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt2);margin:12px 0;cursor:pointer;}",
    ".enc-pq-hd{display:flex;align-items:center;justify-content:space-between;margin:16px 0 8px;border-top:1px solid var(--line);padding-top:14px;}",
    ".enc-pq{background:var(--surface-sunk);border-radius:10px;padding:12px;margin-bottom:10px;}",
    ".enc-pq-row{display:flex;align-items:center;gap:8px;}",
    ".enc-pq-num{flex:0 0 auto;width:22px;height:22px;line-height:22px;text-align:center;background:var(--ink);color:#fff;border-radius:50%;font-size:11px;font-weight:700;}",
    ".enc-pq-tipo{flex:0 0 auto;width:140px;}",
    ".enc-modal-ft{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line);flex:0 0 auto;}",
    ".enc-res-hd{margin-bottom:18px;}",
    ".enc-res-ttl{font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--txt);margin:8px 0 2px;}",
    ".enc-res-n{font-size:13px;color:var(--muted);margin-top:6px;font-weight:600;}",
    ".enc-res-q{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:14px;}",
    ".enc-res-qttl{font-weight:600;font-size:15px;color:var(--txt);margin-bottom:12px;}",
    ".enc-res-qtipo{font-size:11px;color:var(--muted-2);font-weight:500;}",
    ".enc-res-media{font-size:14px;color:var(--txt2);margin-bottom:10px;}",
    ".enc-res-none{font-size:13px;color:var(--muted);}",
    ".enc-res-texts{display:flex;flex-direction:column;gap:8px;}",
    ".enc-res-text{background:var(--surface-sunk);border-radius:8px;padding:9px 12px;font-size:13px;color:var(--txt2);font-style:italic;}",
    ".enc-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:7px;}",
    ".enc-bar-lbl{flex:0 0 90px;font-size:12px;color:var(--txt2);text-align:right;}",
    ".enc-bar-track{flex:1;height:18px;background:var(--surface-sunk);border-radius:9px;overflow:hidden;}",
    ".enc-bar-fill{display:block;height:100%;background:var(--ink);border-radius:9px;}",
    ".enc-bar-val{flex:0 0 auto;font-size:12px;color:var(--muted);min-width:70px;}",
    ".enc-q-block{margin-bottom:18px;}",
    ".enc-q-txt{font-weight:600;font-size:14px;color:var(--txt);margin-bottom:8px;}",
    ".enc-scale{display:flex;gap:8px;flex-wrap:wrap;}",
    ".enc-scale-o{cursor:pointer;}",
    ".enc-scale-o input{display:none;}",
    ".enc-scale-o span{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:42px;border:1px solid var(--line-2);border-radius:10px;font-size:15px;font-weight:600;color:var(--txt2);padding:0 6px;}",
    ".enc-scale-o input:checked+span{background:var(--ink);color:#fff;border-color:var(--ink);}",
    ".enc-scale-lbl{display:flex;justify-content:space-between;max-width:250px;font-size:11px;color:var(--muted);margin-top:4px;}",
    ".enc-opt{display:block;padding:9px 12px;border:1px solid var(--line-2);border-radius:8px;margin-bottom:6px;font-size:14px;color:var(--txt2);cursor:pointer;}",
    ".enc-opt:hover{background:var(--surface-sunk);}",
    ".enc-anon-note{background:var(--surface-sunk);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--muted);margin-bottom:12px;}",
    "@media(max-width:768px){.enc-hdr{padding:16px;}.enc-list-wrap{padding:14px 16px 40px;}.enc-pq-tipo{width:108px;}.enc-card{flex-direction:column;align-items:stretch;}}",
  ].join("");
  document.head.appendChild(s);
}
