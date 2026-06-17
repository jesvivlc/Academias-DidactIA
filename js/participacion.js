/* Dashboard de participación familiar — % de familias que interactúan con el centro */

function _partEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _partPct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

window.initParticipacion = function () {
  var el = document.getElementById("part-container");
  if (!el) return;
  _partEnsureStyles();
  el.innerHTML = '<div class="part-page"><div class="part-loading">Calculando participación…</div></div>';
  _partCargar();
};

async function _partCargar() {
  var el = document.getElementById("part-container");
  if (!el) return;
  var ctrId = window.ctrId;

  // Familias del centro
  var famR = await window.sb.from("profiles").select("id").eq("centro_id", ctrId).eq("rol", "familia");
  var familias = (famR.data || []).map(function (f) { return f.id; });
  var totalFam = familias.length;
  var famSet = {};
  familias.forEach(function (id) { famSet[id] = true; });

  // Consultas en paralelo
  var res = await Promise.all([
    window.sb.from("push_subscriptions").select("user_id").eq("centro_id", ctrId),
    window.sb.from("encuestas").select("id,titulo,destinatarios,estado,created_at").eq("centro_id", ctrId).in("estado", ["abierta", "cerrada"]).order("created_at", { ascending: false }),
    window.sb.from("encuesta_respuestas").select("encuesta_id,familia_id").eq("centro_id", ctrId),
    window.sb.from("tutoria_citas").select("familia_id").eq("centro_id", ctrId),
    window.sb.from("participantes_salida").select("autorizado").eq("centro_id", ctrId),
  ]);
  var push = res[0].data || [];
  var encuestas = res[1].data || [];
  var respuestas = res[2].data || [];
  var citas = res[3].data || [];
  var participantes = res[4].data || [];

  // Push: familias con al menos una suscripción
  var pushFam = {};
  push.forEach(function (p) { if (famSet[p.user_id]) pushFam[p.user_id] = true; });
  var nPush = Object.keys(pushFam).length;

  // Encuestas: familias que respondieron alguna
  var respFamGlobal = {};
  var respPorEnc = {};
  respuestas.forEach(function (r) {
    if (r.familia_id) { respFamGlobal[r.familia_id] = true; }
    if (!respPorEnc[r.encuesta_id]) respPorEnc[r.encuesta_id] = { count: 0, fams: {} };
    respPorEnc[r.encuesta_id].count++;
    if (r.familia_id) respPorEnc[r.encuesta_id].fams[r.familia_id] = true;
  });
  var nRespAlguna = Object.keys(respFamGlobal).length;

  // Tutorías: familias con al menos una cita solicitada
  var tutFam = {};
  citas.forEach(function (c) { if (c.familia_id) tutFam[c.familia_id] = true; });
  var nTut = Object.keys(tutFam).length;

  // Salidas: tasa de autorización
  var totPart = participantes.length;
  var autorizados = participantes.filter(function (p) { return p.autorizado; }).length;

  // Denominadores por grupo para encuestas dirigidas a un grupo
  var gruposNecesarios = {};
  encuestas.forEach(function (e) { if ((e.destinatarios || "").indexOf("grupo:") === 0) gruposNecesarios[e.destinatarios.replace("grupo:", "")] = true; });
  var famPorGrupo = {};
  var gruposList = Object.keys(gruposNecesarios);
  if (gruposList.length) {
    try {
      var al = await window.sb.from("alumnos").select("id,grupo_horario").eq("centro_id", ctrId).in("grupo_horario", gruposList);
      var alById = {};
      (al.data || []).forEach(function (a) { alById[a.id] = a.grupo_horario; });
      var alIds = (al.data || []).map(function (a) { return a.id; });
      if (alIds.length) {
        var fa = await window.sb.from("familia_alumno").select("profile_id,alumno_id").in("alumno_id", alIds);
        (fa.data || []).forEach(function (x) {
          var g = alById[x.alumno_id];
          if (!g) return;
          if (!famPorGrupo[g]) famPorGrupo[g] = {};
          famPorGrupo[g][x.profile_id] = true;
        });
      }
    } catch (e) {}
  }

  // Render
  var html = '<div class="part-page">' +
    '<div class="part-kpis">' +
      _partKpi("Familias registradas", totalFam, null, "👪") +
      _partKpi("Con notificaciones push", nPush, _partPct(nPush, totalFam), "🔔") +
      _partKpi("Respondieron encuestas", nRespAlguna, _partPct(nRespAlguna, totalFam), "📊") +
      _partKpi("Solicitaron tutoría", nTut, _partPct(nTut, totalFam), "📅") +
    '</div>';

  // Tasa de autorización de salidas
  html += '<div class="part-sec"><div class="part-sec-h">Autorizaciones de salidas</div>' +
    (totPart
      ? '<div class="part-bigbar">' + _partBar("Autorizadas a tiempo", autorizados, totPart) + '</div>' +
        '<div class="part-note">' + autorizados + ' de ' + totPart + ' participaciones autorizadas (' + _partPct(autorizados, totPart) + '%).</div>'
      : '<div class="part-empty">Sin salidas con participantes todavía.</div>') +
    '</div>';

  // Respuesta por encuesta
  html += '<div class="part-sec"><div class="part-sec-h">Respuesta por encuesta</div>';
  if (!encuestas.length) {
    html += '<div class="part-empty">No hay encuestas publicadas.</div>';
  } else {
    html += encuestas.map(function (e) {
      var info = respPorEnc[e.id] || { fams: {}, count: 0 };
      var nFams = Object.keys(info.fams).length || info.count;
      var denom = (e.destinatarios || "").indexOf("grupo:") === 0
        ? Object.keys(famPorGrupo[e.destinatarios.replace("grupo:", "")] || {}).length
        : totalFam;
      var dest = e.destinatarios === "todos" ? "Todas" : e.destinatarios.replace("grupo:", "Grupo ");
      return '<div class="part-enc">' +
        '<div class="part-enc-top"><span class="part-enc-ttl">' + _partEsc(e.titulo) + '</span>' +
        '<span class="part-enc-dest">' + dest + (e.estado === "cerrada" ? " · cerrada" : "") + '</span></div>' +
        _partBar(nFams + (denom ? " de " + denom : "") + " familias", nFams, denom || nFams) +
        '</div>';
    }).join("");
  }
  html += '</div>';

  html += '<div class="part-foot">Datos calculados en tiempo real. La lectura de comunicados se guarda por dispositivo y no se contabiliza aquí.</div>';
  html += '</div>';
  el.innerHTML = html;
}

function _partKpi(label, val, pct, icon) {
  return '<div class="part-kpi"><div class="part-kpi-ic">' + icon + '</div>' +
    '<div class="part-kpi-val">' + val + (pct != null ? '<span class="part-kpi-pct">' + pct + '%</span>' : '') + '</div>' +
    '<div class="part-kpi-lbl">' + _partEsc(label) + '</div></div>';
}
function _partBar(label, val, total) {
  var pct = _partPct(val, total);
  var col = pct >= 66 ? "var(--success)" : pct >= 33 ? "var(--warning)" : "var(--danger)";
  return '<div class="part-bar-row"><span class="part-bar-lbl">' + _partEsc(label) + '</span>' +
    '<span class="part-bar-track"><span class="part-bar-fill" style="width:' + pct + '%;background:' + col + '"></span></span>' +
    '<span class="part-bar-pct">' + pct + '%</span></div>';
}

function _partEnsureStyles() {
  if (document.getElementById("part-styles")) return;
  var s = document.createElement("style");
  s.id = "part-styles";
  s.textContent = [
    ".part-page{padding:24px 28px 40px;}",
    ".part-loading,.part-empty{text-align:center;padding:36px 20px;color:var(--muted);font-size:14px;}",
    ".part-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:22px;}",
    ".part-kpi{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;}",
    ".part-kpi-ic{font-size:22px;margin-bottom:8px;}",
    ".part-kpi-val{font-family:var(--font-display);font-size:34px;font-weight:700;color:var(--txt);line-height:1;display:flex;align-items:baseline;gap:8px;}",
    ".part-kpi-pct{font-size:16px;font-weight:600;color:var(--ink);}",
    ".part-kpi-lbl{font-size:12.5px;color:var(--muted);margin-top:6px;}",
    ".part-sec{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:16px;}",
    ".part-sec-h{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:14px;}",
    ".part-bigbar{margin-bottom:6px;}",
    ".part-note{font-size:12.5px;color:var(--muted);}",
    ".part-enc{padding:10px 0;border-bottom:1px solid var(--line);}",
    ".part-enc:last-child{border-bottom:none;}",
    ".part-enc-top{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;flex-wrap:wrap;}",
    ".part-enc-ttl{font-weight:600;font-size:14px;color:var(--txt);}",
    ".part-enc-dest{font-size:11.5px;color:var(--muted);}",
    ".part-bar-row{display:flex;align-items:center;gap:12px;}",
    ".part-bar-lbl{flex:0 0 200px;font-size:12.5px;color:var(--txt2);}",
    ".part-bar-track{flex:1;height:16px;background:var(--surface-sunk);border-radius:8px;overflow:hidden;}",
    ".part-bar-fill{display:block;height:100%;border-radius:8px;}",
    ".part-bar-pct{flex:0 0 auto;font-size:12.5px;color:var(--muted);min-width:42px;text-align:right;}",
    ".part-foot{font-size:11.5px;color:var(--muted-2);margin-top:8px;}",
    "@media(max-width:768px){.part-page{padding:16px;}.part-bar-lbl{flex-basis:120px;}}",
  ].join("");
  document.head.appendChild(s);
}
