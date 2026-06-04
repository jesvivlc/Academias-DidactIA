// ── COMEDOR MODULE ──
let comedorData = [];
let comedorFilter = 'todos';
let comedorFecha = new Date().toISOString().split("T")[0];
let historicoData = [];

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

async function loadComedor() {
  const today = new Date(comedorFecha + "T12:00:00");
  const ahora = new Date();
  const diasSinTilde = ["Domingo","Lunes","Martes","Miercoles","Jueves","Viernes","Sabado"];
  const diasConTilde = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaStr = comedorFecha;
  const horaActual = ahora.getHours() * 100 + ahora.getMinutes();
  const diaActual = diasSinTilde[today.getDay()];

  document.getElementById("comedor-fecha").textContent =
    diasConTilde[today.getDay()] + " " + today.getDate() + " de " + meses[today.getMonth()] + " de " + today.getFullYear();

  // Profesional: detect current class from horarios
  let grupoActual = null;
  if (role === "profesional" && currentUserName) {
    const apellido = currentUserName.split(" ")[0];
    const { data: horariosHoy } = await sb.from("horarios")
      .select("actividad,hora")
      .eq("centro_id", ctrId)
      .ilike("dia", "%" + diaActual + "%")
      .ilike("profesor", "%" + apellido + "%");

    if (horariosHoy && horariosHoy.length) {
      let mejorHorario = null;
      let mejorDiff = Infinity;
      for (const h of horariosHoy) {
        const partes = h.hora.replace(/ /g,"").split("-");
        if (!partes[0]) continue;
        const hm = partes[0].split(":");
        const horaInicio = parseInt(hm[0]) * 100 + parseInt(hm[1] || 0);
        const diff = Math.abs(horaActual - horaInicio);
        if (diff < mejorDiff) { mejorDiff = diff; mejorHorario = h; }
      }
      if (mejorHorario) {
        const palabras = mejorHorario.actividad.trim().split(" ");
        const ultima = palabras[palabras.length - 1];
        if (/ESO|BAT|CF|PDC|FP/i.test(ultima)) grupoActual = ultima;
      }
    }
  }

  // Load alumnos filtered by grupo if detected
  let alumnosQuery = sb.from("alumnos").select("id,nombre,curso,grupo_horario")
    .eq("centro_id", ctrId).order("curso").order("nombre");
  if (grupoActual && role === "profesional") {
    alumnosQuery = alumnosQuery.eq("grupo_horario", grupoActual);
    document.getElementById("comedor-fecha").textContent += " · Clase: " + grupoActual;
  }
  const { data: alumnos } = await alumnosQuery;

  // Load asistencia de hoy
  const { data: asistencia } = await sb.from("asistencia_comedor")
    .select("*").eq("centro_id", ctrId).eq("fecha", fechaStr);

  const asistMap = {};
  (asistencia || []).forEach(a => { asistMap[a.alumno_id] = a; });

  comedorData = (alumnos || []).map(a => ({
    alumno_id: a.id,
    nombre: a.nombre,
    curso: a.curso,
    grupo_horario: a.grupo_horario || null,
    se_queda: asistMap[a.id]?.se_queda ?? false,
    plaza_fija: asistMap[a.id]?.plaza_fija ?? false,
    db_id: asistMap[a.id]?.id ?? null
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
  container.innerHTML = filtered.map(a => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${a.se_queda?"var(--ink-ll)":"var(--srf2)"};border:1.5px solid ${a.se_queda?"var(--ink-l)":"var(--bdr)"};border-radius:var(--r-sm);transition:all .15s;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:500;color:var(--txt);">${a.nombre}</div>
        <div style="font-size:11px;color:var(--txt3);">${a.curso || ""}${a.plaza_fija?' · <span style="color:var(--ink);font-weight:500;">Plaza fija</span>':''}</div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">
        <span style="font-size:13px;color:var(--txt2);">${a.se_queda?"✅ Se queda":"❌ No se queda"}</span>
        <input type="checkbox" ${a.se_queda?"checked":""} 
          style="width:18px;height:18px;cursor:pointer;accent-color:var(--ink);"
          onchange="toggleAsistencia('${a.alumno_id}', this.checked)">
      </label>
    </div>`).join("");
}

async function toggleAsistencia(alumnoId, seQueda) {
  const alumno = comedorData.find(a => a.alumno_id === alumnoId);
  if (!alumno) return;

  // Get current user profile id
  const { data: profile } = await sb.from("profiles").select("id").eq("user_id", currentUser.id).single();

  if (alumno.db_id) {
    await sb.from("asistencia_comedor").update({ se_queda: seQueda, updated_at: new Date().toISOString() }).eq("id", alumno.db_id);
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
    .total{font-size:16px;font-weight:bold;margin:16px 0;}</style></head>
    <body><h1>Lista comedor — ${ctrName} — ${fechaStr}</h1>
    <div class="total">Total comensales: ${seQuedan.length}</div>
    <table><thead><tr><th>#</th><th>Nombre</th><th>Curso</th><th>Plaza</th></tr></thead>
    <tbody>${seQuedan.map((a,i)=>`<tr><td>${i+1}</td><td>${a.nombre}</td><td>${a.curso||""}</td><td>${a.plaza_fija?"Fija":"Esporádica"}</td></tr>`).join("")}
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
