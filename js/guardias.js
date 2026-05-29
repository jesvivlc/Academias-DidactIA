// ── BOLSA DE GUARDIAS CON EQUIDAD ──

async function loadBolsaGuardias() {
  const container = document.getElementById("bolsa-container");
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:12px;"><span class="spin">⟳</span> Cargando bolsa…</div>';

  const trimestre = _guardiaTrimActual();
  const dates     = _guardiaTrimDates(trimestre);

  // Count by substitute name from sustituciones (current trimester)
  let q = sb.from("sustituciones").select("profesor_sustituto").eq("centro_id", ctrId);
  if (dates) q = q.gte("fecha", dates.from).lte("fecha", dates.to);
  const { data: subs } = await q;

  const countByName = {};
  (subs || []).forEach(function(s) {
    const n = (s.profesor_sustituto || "").trim();
    if (n) countByName[n] = (countByName[n] || 0) + 1;
  });

  // Get all teacher names from horarios_grupo
  const { data: hg } = await sb.from("horarios_grupo")
    .select("profesor_nombre")
    .eq("centro_id", ctrId)
    .not("profesor_nombre", "is", null);

  const nombresSet = new Set();
  (hg || []).forEach(function(h) { if (h.profesor_nombre) nombresSet.add(h.profesor_nombre.trim()); });

  // Add anyone who has done a guard this trimester even if not in horarios
  Object.keys(countByName).forEach(function(n) { nombresSet.add(n); });

  if (!nombresSet.size) {
    container.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay profesores registrados en horarios.</div>';
    return;
  }

  const data = Array.from(nombresSet).map(function(nombre) {
    return { nombre: nombre, count: countByName[nombre] || 0 };
  }).sort(function(a, b) {
    return a.count - b.count || a.nombre.localeCompare(b.nombre, "es");
  });

  _renderBolsa(container, data, trimestre);
}

function _renderBolsa(container, data, trimestre) {
  const maxCount = Math.max.apply(null, data.map(function(p) { return p.count; }).concat([1]));
  const triLabel = { 1: "1er trimestre", 2: "2º trimestre", 3: "3er trimestre" };

  const rows = data.map(function(p, i) {
    const pct = maxCount > 0 ? Math.round((p.count / maxCount) * 100) : 0;
    var bg, col;
    if (p.count === 0)     { bg = "#e8f5e9"; col = "#1e6b3a"; }
    else if (p.count <= 3) { bg = "#e8f0fe"; col = "var(--ink)"; }
    else if (p.count <= 6) { bg = "#fff9c4"; col = "#f57f17"; }
    else                   { bg = "#fde8e8"; col = "#b83232"; }
    return '<tr>' +
      '<td style="font-size:11px;color:var(--txt3);text-align:center;width:34px;">' + (i + 1) + '</td>' +
      '<td style="font-weight:500;font-size:13px;">' + p.nombre + '</td>' +
      '<td style="width:110px;">' +
        '<div style="background:var(--srf2);border-radius:4px;height:5px;">' +
          '<div style="background:var(--ink);width:' + pct + '%;height:100%;border-radius:4px;"></div>' +
        '</div>' +
      '</td>' +
      '<td style="text-align:center;">' +
        '<span style="background:' + bg + ';color:' + col + ';border-radius:12px;padding:2px 9px;font-size:11px;font-weight:600;">' + p.count + '</span>' +
      '</td>' +
    '</tr>';
  }).join("");

  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
      '<div style="font-size:12px;color:var(--txt3);">' + (triLabel[trimestre] || "Trim. " + trimestre) +
        ' · menor → mayor guardias</div>' +
      '<button class="btn btn-s" style="font-size:11px;padding:3px 10px;" onclick="loadBolsaGuardias()">↺</button>' +
    '</div>' +
    '<div style="overflow-x:auto;"><table class="tbl">' +
    '<thead><tr>' +
      '<th style="width:34px;">#</th>' +
      '<th>Profesor</th>' +
      '<th style="width:110px;">Carga</th>' +
      '<th style="text-align:center;">Guardias</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}

async function getGuardiaCountsByName() {
  const trimestre = _guardiaTrimActual();
  const dates     = _guardiaTrimDates(trimestre);
  let q = sb.from("sustituciones").select("profesor_sustituto").eq("centro_id", ctrId);
  if (dates) q = q.gte("fecha", dates.from).lte("fecha", dates.to);
  const { data } = await q;
  const counts = {};
  (data || []).forEach(function(s) {
    const n = (s.profesor_sustituto || "").trim();
    if (n) counts[n] = (counts[n] || 0) + 1;
  });
  return counts;
}

async function registrarGuardiaEnBD(nombreSustituto, fecha, tramo, grupoHorario) {
  if (!nombreSustituto) return;
  try {
    const { data: p } = await sb.from("profiles")
      .select("id")
      .eq("centro_id", ctrId)
      .ilike("full_name", `%${nombreSustituto}%`)
      .limit(1);
    if (!p || !p[0]) return;
    const trim  = _guardiaTrimActual();
    const curso = _guardiaCursoActual();
    await sb.from("guardias_realizadas").insert({
      centro_id:     ctrId,
      profile_id:    p[0].id,
      ausencia_id:   null,
      fecha:         fecha,
      tramo:         tramo,
      grupo_horario: grupoHorario || null,
      trimestre:     trim,
      curso_escolar: curso
    });
  } catch(e) {
    console.warn("guardias_realizadas insert:", e);
  }
}

function _guardiaTrimActual() {
  const mes = new Date().getMonth() + 1;
  if (mes >= 9) return 1;
  if (mes <= 3) return 2;
  return 3;
}

function _guardiaTrimDates(trim) {
  const hoy = new Date();
  const y   = hoy.getFullYear();
  const m   = hoy.getMonth() + 1;
  const cs  = m >= 9 ? y : y - 1;
  if (trim === 1) return { from: cs + "-09-01",       to: cs + "-12-31" };
  if (trim === 2) return { from: (cs + 1) + "-01-01", to: (cs + 1) + "-03-31" };
  return               { from: (cs + 1) + "-04-01",   to: (cs + 1) + "-06-30" };
}

function _guardiaCursoActual() {
  const hoy  = new Date();
  const y    = hoy.getFullYear();
  const m    = hoy.getMonth() + 1;
  return m >= 9 ? y + "-" + (y + 1) : (y - 1) + "-" + y;
}
