// ── COMEDOR MODULE ──
let comedorData = [];
let comedorFilter = 'todos';
let comedorFecha = new Date().toISOString().split("T")[0];
let historicoData = [];
let _comedorTramoActual   = null;   // tramo activo en este momento
let _comedorGruposProfesor = [];    // todos los grupos del profesor logueado

function _cEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function changeComedorFecha(delta) {
  var d = new Date(comedorFecha);
  d.setDate(d.getDate() + delta);
  var hoy = new Date().toISOString().split("T")[0];
  if (d.toISOString().split("T")[0] > hoy) return;
  comedorFecha = d.toISOString().split("T")[0];
  var btnSig = document.getElementById("btn-comedor-sig");
  if (btnSig) btnSig.disabled = comedorFecha >= hoy;
  loadComedor();
}

async function _detectarContextoProfesor(diaHG, ahoraMin) {
  _comedorTramoActual    = null;
  _comedorGruposProfesor = [];

  // 1. Tramos del centro → detectar cuál corre ahora mismo
  const { data: tramos } = await sb.from("tramos_centro")
    .select("numero,hora_inicio,hora_fin,nombre,es_descanso")
    .eq("centro_id", ctrId).order("numero");

  let tramoActivo = null;
  for (const t of (tramos || [])) {
    if (t.es_descanso) continue;
    const [hI, mI] = t.hora_inicio.split(":").map(Number);
    const [hF, mF] = t.hora_fin.split(":").map(Number);
    if (ahoraMin >= hI * 60 + mI && ahoraMin < hF * 60 + mF) {
      tramoActivo = t;
      break;
    }
  }
  _comedorTramoActual = tramoActivo;

  // 2. Todos los grupos del profesor (para filtros rápidos en fallback)
  const partNombre = currentUserName.trim().split(/\s+/).find(p => p.length > 2) || "";
  const { data: misClases } = await sb.from("horarios_grupo")
    .select("grupo_horario,tramo,dia")
    .eq("centro_id", ctrId)
    .ilike("profesor_nombre", `%${partNombre}%`);

  _comedorGruposProfesor = [...new Set(
    (misClases || []).map(c => c.grupo_horario).filter(Boolean)
  )].sort();

  // 3. Grupo actual = intersección tramo activo + día de hoy
  let grupoActual = null;
  if (tramoActivo && misClases?.length) {
    const claseAhora = misClases.find(c =>
      c.tramo === tramoActivo.numero && c.dia === diaHG
    );
    if (claseAhora) grupoActual = claseAhora.grupo_horario;
  }

  return { grupoActual, tramoActivo };
}

function _renderComedorBanner(grupoActual, tramoActivo, gruposProfesor) {
  const el = document.getElementById("comedor-contexto-banner");
  if (!el) return;

  if (grupoActual && tramoActivo) {
    const hi = String(tramoActivo.hora_inicio || "").slice(0, 5);
    const hf = String(tramoActivo.hora_fin    || "").slice(0, 5);
    el.innerHTML = `<div style="background:var(--ink-ll);border:1px solid var(--ink-l);border-radius:var(--r-sm);
        padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap;">
      <span style="font-size:15px;">📍</span>
      <span>Mostrando alumnos de <strong>${grupoActual}</strong>
        &nbsp;·&nbsp; Tramo ${tramoActivo.numero}${tramoActivo.nombre ? " — " + tramoActivo.nombre : ""} (${hi}–${hf})</span>
      <button onclick="_comedorVerTodos()"
        style="margin-left:auto;background:none;border:none;color:var(--ink);font-size:12px;
               cursor:pointer;text-decoration:underline;padding:0;">
        Ver todos mis grupos
      </button>
    </div>`;
    el.style.display = "";
  } else if (gruposProfesor && gruposProfesor.length) {
    const chips = gruposProfesor.map(g =>
      `<button onclick="_comedorFiltrarGrupo('${g}')"
         style="background:var(--srf2);border:1px solid var(--bdr);border-radius:20px;
                padding:4px 13px;font-size:12px;cursor:pointer;color:var(--txt2);">${g}</button>`
    ).join("");
    el.innerHTML = `<div style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);
        padding:10px 14px;margin-bottom:12px;font-size:13px;">
      <span style="color:var(--txt3);font-size:12px;display:block;margin-bottom:6px;">
        Sin clase activa ahora — filtra por tu grupo:
      </span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${chips}</div>
    </div>`;
    el.style.display = "";
  } else {
    el.style.display = "none";
    el.innerHTML = "";
  }
}

function _comedorFiltrarGrupo(g) {
  const sel = document.getElementById("comedor-filtro-grupo");
  if (sel) sel.value = g;
  filterComedor(comedorFilter);
}

function _comedorVerTodos() {
  const sel = document.getElementById("comedor-filtro-grupo");
  if (sel) sel.value = "";
  filterComedor(comedorFilter);
}

async function loadComedor() {
  const today  = new Date(comedorFecha + "T12:00:00");
  const ahora  = new Date();
  const diasConTilde  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const diasHG        = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaStr = comedorFecha;

  document.getElementById("comedor-fecha").textContent =
    diasConTilde[today.getDay()] + " " + today.getDate() + " de " + meses[today.getMonth()] + " de " + today.getFullYear();

  let grupoActual = null;

  if (role === "profesional" && currentUserName) {
    const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    const diaHG    = diasHG[today.getDay()];
    const ctx = await _detectarContextoProfesor(diaHG, ahoraMin);
    grupoActual = ctx.grupoActual;
    _renderComedorBanner(ctx.grupoActual, ctx.tramoActivo, _comedorGruposProfesor);
  } else {
    const el = document.getElementById("comedor-contexto-banner");
    if (el) { el.style.display = "none"; el.innerHTML = ""; }
  }

  // Query alumnos según rol y contexto — incluye perfil alimentario
  let alumnosQuery = sb.from("alumnos")
    .select("id,nombre,curso,grupo_horario,alergias,dieta_especial")
    .eq("centro_id", ctrId).order("curso").order("nombre");

  if (role === "profesional" && currentUserName) {
    if (grupoActual) {
      alumnosQuery = alumnosQuery.eq("grupo_horario", grupoActual);
      const sel = document.getElementById("comedor-filtro-grupo");
      if (sel) sel.value = grupoActual;
    } else if (_comedorGruposProfesor.length) {
      alumnosQuery = alumnosQuery.in("grupo_horario", _comedorGruposProfesor);
      const sel = document.getElementById("comedor-filtro-grupo");
      if (sel) sel.value = "";
    }
  }

  const { data: alumnos } = await alumnosQuery;

  // Asistencia del día (incluye nota_dia)
  const { data: asistencia } = await sb.from("asistencia_comedor")
    .select("*").eq("centro_id", ctrId).eq("fecha", fechaStr);

  const asistMap = {};
  (asistencia || []).forEach(a => { asistMap[a.alumno_id] = a; });

  comedorData = (alumnos || []).map(a => ({
    alumno_id:     a.id,
    nombre:        a.nombre,
    curso:         a.curso,
    grupo_horario: a.grupo_horario || null,
    alergias:      a.alergias     || null,
    dieta_especial:a.dieta_especial || null,
    se_queda:      asistMap[a.id]?.se_queda ?? false,
    plaza_fija:    asistMap[a.id]?.plaza_fija ?? false,
    nota_dia:      asistMap[a.id]?.nota_dia  ?? null,
    db_id:         asistMap[a.id]?.id ?? null
  }));

  updateComedorStats();
  renderComedorList();
}

function updateComedorStats() {
  const seQuedan = comedorData.filter(a => a.se_queda);
  const fijos = seQuedan.filter(a => a.plaza_fija);
  const esporadicos = seQuedan.filter(a => !a.plaza_fija);
  document.getElementById("total-comensales").textContent = seQuedan.length;
  document.getElementById("total-fijos").textContent = fijos.length;
  document.getElementById("total-esporadicos").textContent = esporadicos.length;
}

function filterComedor(f) {
  comedorFilter = f;
  renderComedorList();
}

function _comedorAlergiasBadges(a) {
  let badges = '';
  if (a.alergias)
    badges += `<span style="background:#fde8e8;color:#b71c1c;border-radius:20px;padding:2px 9px;font-size:10px;font-weight:600;white-space:nowrap;">⚠️ ${_cEsc(a.alergias)}</span>`;
  if (a.dieta_especial)
    badges += `<span style="background:#fff3e0;color:#e65100;border-radius:20px;padding:2px 9px;font-size:10px;font-weight:600;white-space:nowrap;">🥗 ${_cEsc(a.dieta_especial)}</span>`;
  if (a.nota_dia)
    badges += `<span style="background:#e3eafa;color:#1565c0;border-radius:20px;padding:2px 9px;font-size:10px;font-weight:600;white-space:nowrap;">📝 ${_cEsc(a.nota_dia)}</span>`;
  return badges ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${badges}</div>` : '';
}

function renderComedorList() {
  const container = document.getElementById("comedor-list");
  const grupoFiltro = document.getElementById("comedor-filtro-grupo") ? document.getElementById("comedor-filtro-grupo").value : "";
  let filtered = comedorData;
  if (comedorFilter === "se_queda") filtered = comedorData.filter(a => a.se_queda);
  if (comedorFilter === "no_se_queda") filtered = comedorData.filter(a => !a.se_queda);
  if (grupoFiltro) filtered = filtered.filter(a => (a.grupo_horario || a.curso || "") === grupoFiltro);

  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:20px;">No hay alumnos en esta categoría.</div>';
    return;
  }

  populateGruposComedor();
  container.innerHTML = filtered.map(a => {
    const badges = _comedorAlergiasBadges(a);
    return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:${a.se_queda?"var(--ink-ll)":"var(--srf2)"};border:1.5px solid ${a.se_queda?"var(--ink-l)":"var(--bdr)"};border-radius:var(--r-sm);transition:all .15s;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;color:var(--txt);">${_cEsc(a.nombre)}</div>
        <div style="font-size:11px;color:var(--txt3);">${_cEsc(a.curso || "")}${a.plaza_fija?' · <span style="color:var(--ink);font-weight:500;">Plaza fija</span>':''}</div>
        ${badges}
        <div style="display:flex;align-items:center;gap:6px;margin-top:5px;">
          <button onclick="_comedorEditarNota('${a.alumno_id}')" title="Nota del día"
            style="background:none;border:1px solid var(--bdr);border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;color:var(--txt3);">
            📝 ${a.nota_dia ? 'Editar nota' : 'Nota del día'}
          </button>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;flex-shrink:0;">
        <span style="font-size:13px;color:var(--txt2);">${a.se_queda?"✅ Se queda":"❌ No se queda"}</span>
        <input type="checkbox" ${a.se_queda?"checked":""}
          style="width:18px;height:18px;cursor:pointer;accent-color:var(--ink);"
          onchange="toggleAsistencia('${a.alumno_id}', this.checked)">
      </label>
    </div>`;
  }).join("");
}

async function _comedorEditarNota(alumnoId) {
  const alumno = comedorData.find(a => a.alumno_id === alumnoId);
  if (!alumno) return;

  const existing = document.getElementById('comedor-nota-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'comedor-nota-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--srf);border-radius:var(--r);padding:24px;width:100%;max-width:400px;box-shadow:var(--sh-lg);';
  modal.innerHTML =
    `<div style="font-size:15px;font-weight:600;margin-bottom:8px;color:var(--txt);">📝 Nota del día — ${_cEsc(alumno.nombre)}</div>` +
    `<div style="font-size:11px;color:var(--txt3);margin-bottom:12px;">Solo para hoy (${_cEsc(comedorFecha)}). Se muestra como badge en la lista.</div>` +
    `<textarea id="comedor-nota-input" rows="3"
      style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);color:var(--txt);resize:vertical;margin-bottom:14px;"
      placeholder="Ej: Alergia confirmada hoy, menú alternativo…"></textarea>` +
    `<div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="comedor-nota-cancel" style="padding:7px 16px;border:1px solid var(--bdr);background:var(--srf2);color:var(--txt);border-radius:var(--r-sm);cursor:pointer;font-size:13px;">Cancelar</button>
      <button id="comedor-nota-borrar" style="padding:7px 16px;border:1px solid var(--bdr);background:var(--srf2);color:var(--red,#c62828);border-radius:var(--r-sm);cursor:pointer;font-size:13px;">Borrar</button>
      <button id="comedor-nota-save"   style="padding:7px 16px;background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);cursor:pointer;font-size:13px;">Guardar</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById('comedor-nota-input').value = alumno.nota_dia || '';
  document.getElementById('comedor-nota-cancel').onclick = () => overlay.remove();
  document.getElementById('comedor-nota-borrar').onclick = () => _comedorGuardarNota(alumnoId, '', overlay);
  document.getElementById('comedor-nota-save').onclick   = () => {
    const val = (document.getElementById('comedor-nota-input').value || '').trim();
    _comedorGuardarNota(alumnoId, val, overlay);
  };
}

async function _comedorGuardarNota(alumnoId, nota, overlay) {
  const alumno = comedorData.find(a => a.alumno_id === alumnoId);
  if (!alumno) return;

  if (alumno.db_id) {
    const { error } = await sb.from("asistencia_comedor")
      .update({ nota_dia: nota || null }).eq("id", alumno.db_id);
    if (error) { alert("Error al guardar nota: " + error.message); return; }
  } else {
    // Crear registro si no existe
    const { data: profile } = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();
    const { data } = await sb.from("asistencia_comedor").insert({
      centro_id: ctrId, alumno_id: alumnoId, fecha: comedorFecha,
      se_queda: alumno.se_queda, plaza_fija: false,
      registrado_por: profile?.id, nota_dia: nota || null
    }).select().single();
    if (data) alumno.db_id = data.id;
  }

  alumno.nota_dia = nota || null;
  if (overlay) overlay.remove();
  renderComedorList();
}
window._comedorEditarNota = _comedorEditarNota;

async function toggleAsistencia(alumnoId, seQueda) {
  const alumno = comedorData.find(a => a.alumno_id === alumnoId);
  if (!alumno) return;

  // Aviso si el alumno tiene alergia o dieta especial registrada
  if (seQueda && (alumno.alergias || alumno.dieta_especial)) {
    var avisoMsg = '';
    if (alumno.alergias)      avisoMsg += `⚠️ ALERGIA: ${alumno.alergias}`;
    if (alumno.dieta_especial) avisoMsg += (avisoMsg ? '\n' : '') + `🥗 DIETA: ${alumno.dieta_especial}`;
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;top:24px;right:24px;background:#b71c1c;color:#fff;padding:12px 18px;border-radius:var(--r-sm);font-size:13px;z-index:9999;box-shadow:var(--sh-lg);max-width:320px;white-space:pre-line;";
    toast.textContent = avisoMsg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  const { data: profile } = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();

  if (alumno.db_id) {
    await sb.from("asistencia_comedor").update({ se_queda: seQueda }).eq("id", alumno.db_id);
  } else {
    const { data } = await sb.from("asistencia_comedor").insert({
      centro_id: ctrId, alumno_id: alumnoId, fecha: comedorFecha,
      se_queda: seQueda, plaza_fija: false, registrado_por: profile?.id
    }).select().single();
    if (data) alumno.db_id = data.id;
  }

  alumno.se_queda = seQueda;
  updateComedorStats();
  renderComedorList();
  var toast = document.createElement("div");
  toast.style.cssText = "position:fixed;bottom:24px;right:24px;background:var(--ink);color:#fff;padding:10px 18px;border-radius:var(--r-sm);font-size:13px;z-index:9999;box-shadow:var(--sh-lg);animation:fu .2s ease;";
  toast.textContent = seQueda ? "✅ Marcado como asistente" : "❌ No asistente";
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2200);
}

function printComedor() {
  const seQuedan = comedorData.filter(a => a.se_queda);
  const today = new Date();
  const fechaStr = `${today.getDate()}/${today.getMonth()+1}/${today.getFullYear()}`;
  const html = `<html><head><title>Comedor ${fechaStr}</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;}h1{font-size:18px;}table{width:100%;border-collapse:collapse;}
    th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;}th{background:#f0f0f0;}
    .total{font-size:16px;font-weight:bold;margin:16px 0;}.badge{display:inline-block;background:#fde8e8;color:#b71c1c;border-radius:10px;padding:1px 7px;font-size:11px;margin-right:4px;}</style></head>
    <body><h1>Lista comedor — ${ctrName} — ${fechaStr}</h1>
    <div class="total">Total comensales: ${seQuedan.length}</div>
    <table><thead><tr><th>#</th><th>Nombre</th><th>Curso</th><th>Plaza</th><th>Alergias / Dieta</th></tr></thead>
    <tbody>${seQuedan.map((a,i)=>`<tr><td>${i+1}</td><td>${a.nombre}</td><td>${a.curso||""}</td><td>${a.plaza_fija?"Fija":"Esporádica"}</td><td>${a.alergias?`<span class="badge">⚠️ ${a.alergias}</span>`:""}${a.dieta_especial?`<span class="badge" style="background:#fff3e0;color:#e65100;">🥗 ${a.dieta_especial}</span>`:""}</td></tr>`).join("")}
    </tbody></table></body></html>`;
  const w = window.open("","_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}


function jumpToInfo(k) {
  showTab("admin");
  setTimeout(() => { const el = document.getElementById("f-"+k); if(el){el.focus();el.scrollIntoView({behavior:"smooth",block:"center"});} }, 400);
}

async function loadComedorHistorico() {
  const body = document.getElementById("comedor-historico-body");
  if (body) body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:20px;"><span class="spin">⟳</span> Cargando histórico…</td></tr>';

  const hoy = new Date();
  const hace30 = new Date();
  hace30.setDate(hoy.getDate() - 30);
  const fechaDesde = hace30.toISOString().split("T")[0];

  const { data, error } = await sb.from("asistencia_comedor")
    .select("fecha,se_queda,plaza_fija")
    .eq("centro_id", ctrId)
    .gte("fecha", fechaDesde)
    .order("fecha", { ascending: false })
    .limit(50000);

  if (error || !data) {
    if (body) body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:20px;">Error al cargar el histórico.</td></tr>';
    return;
  }

  const byFecha = {};
  data.forEach(r => {
    if (!byFecha[r.fecha]) byFecha[r.fecha] = { total: 0, fijos: 0, esporadicos: 0 };
    if (r.se_queda) {
      byFecha[r.fecha].total++;
      if (r.plaza_fija) byFecha[r.fecha].fijos++;
      else byFecha[r.fecha].esporadicos++;
    }
  });

  historicoData = Object.entries(byFecha)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([fecha, stats]) => ({ fecha, ...stats }));

  renderComedorHistorico(historicoData);
}

function renderComedorHistorico(data) {
  const body = document.getElementById("comedor-historico-body");
  if (!body) return;

  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const hoy = new Date().toISOString().split("T")[0];

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:20px;">No hay datos en los últimos 30 días.</td></tr>';
    return;
  }

  body.innerHTML = data.map(d => {
    const esHoy = d.fecha === hoy;
    const fechaObj = new Date(d.fecha + "T12:00:00");
    const diaSemana = dias[fechaObj.getDay()];
    const fechaFmt = fechaObj.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    const rowStyle = esHoy ? "background:var(--ink-ll);font-weight:500;" : "";
    return `<tr style="${rowStyle}">
      <td style="padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:13px;">${fechaFmt}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:13px;color:var(--txt2);">${diaSemana}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:13px;font-weight:600;color:var(--ink);">${d.total}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:13px;">${d.fijos}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:13px;">${d.esporadicos}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--bdr);">
        <button onclick="verDiaHistorico('${d.fecha}')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">Ver</button>
      </td>
    </tr>`;
  }).join("");
}

function verDiaHistorico(fecha) {
  comedorFecha = fecha;
  showComedorVista('dia');
  loadComedor();
}

function showComedorVista(vista) {
  const vDia = document.getElementById("comedor-vista-dia");
  const vHist = document.getElementById("comedor-vista-historico");
  const btnDia = document.getElementById("btn-vista-dia");
  const btnHist = document.getElementById("btn-vista-historico");
  if (vista === 'dia') {
    if (vDia) vDia.style.display = "";
    if (vHist) vHist.style.display = "none";
    if (btnDia) { btnDia.style.background = "var(--ink)"; btnDia.style.color = "#fff"; btnDia.style.border = "none"; }
    if (btnHist) { btnHist.style.background = "white"; btnHist.style.color = "var(--txt2)"; btnHist.style.border = "1px solid var(--bdr)"; }
  } else {
    if (vDia) vDia.style.display = "none";
    if (vHist) vHist.style.display = "";
    if (btnDia) { btnDia.style.background = "white"; btnDia.style.color = "var(--txt2)"; btnDia.style.border = "1px solid var(--bdr)"; }
    if (btnHist) { btnHist.style.background = "var(--ink)"; btnHist.style.color = "#fff"; btnHist.style.border = "none"; }
    loadComedorHistorico();
  }
}

async function exportarHistoricoCSV() {
  if (!historicoData.length) { alert("No hay histórico de comedor para exportar."); return; }
  if (typeof XLSX === "undefined") { alert("La librería de exportación (Excel) no está disponible."); return; }

  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

  // ── Hoja 1: histórico diario (30 días) ──
  const aoaHist = [["Fecha","Día","Total","Fijos","Esporádicos"]];
  historicoData.forEach(d => {
    const fechaObj = new Date(d.fecha + "T12:00:00");
    aoaHist.push([
      fechaObj.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }),
      dias[fechaObj.getDay()], d.total, d.fijos, d.esporadicos
    ]);
  });
  const wb = XLSX.utils.book_new();
  const wsHist = XLSX.utils.aoa_to_sheet(aoaHist);
  wsHist["!cols"] = [{ wch: 12 },{ wch: 11 },{ wch: 8 },{ wch: 8 },{ wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsHist, "Histórico 30 días");

  // ── Hoja 2: desglose por grupo (si hay datos de grupo) ──
  try {
    const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
    const desde = hace30.toISOString().split("T")[0];
    const { data: rows } = await sb.from("asistencia_comedor")
      .select("se_queda,plaza_fija,alumnos(grupo_horario,curso)")
      .eq("centro_id", ctrId)
      .eq("se_queda", true)
      .gte("fecha", desde)
      .limit(50000);

    const byGrupo = {};
    (rows || []).forEach(r => {
      const al = r.alumnos || {};
      const g = al.grupo_horario || al.curso || "Sin grupo";
      if (!byGrupo[g]) byGrupo[g] = { total: 0, fijos: 0, esporadicos: 0 };
      byGrupo[g].total++;
      if (r.plaza_fija) byGrupo[g].fijos++; else byGrupo[g].esporadicos++;
    });

    const grupos = Object.keys(byGrupo).sort((a, b) => a.localeCompare(b, "es"));
    if (grupos.length) {
      const aoaGrp = [["Grupo","Total comensales (30d)","Fijos","Esporádicos"]];
      grupos.forEach(g => aoaGrp.push([g, byGrupo[g].total, byGrupo[g].fijos, byGrupo[g].esporadicos]));
      const wsGrp = XLSX.utils.aoa_to_sheet(aoaGrp);
      wsGrp["!cols"] = [{ wch: 14 },{ wch: 22 },{ wch: 8 },{ wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsGrp, "Por grupo");
    }
  } catch (e) {
    console.warn("[comedor] desglose por grupo no disponible:", e);
  }

  XLSX.writeFile(wb, "historico-comedor-" + new Date().toISOString().split("T")[0] + ".xlsx");
}
