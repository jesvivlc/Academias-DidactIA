// ── GASTOS, RESULTADOS Y CONTROL HORARIO (Fase 13) ──
// La otra mitad de la cuenta: hasta ahora el panel solo veía ingresos. Aquí
// entran los gastos, el resultado mensual real y el registro de jornada del
// profesorado (obligatorio desde el art. 34.9 del Estatuto de los Trabajadores).

let _ecTab = "gastos";
let _ecGastos = [], _ecPagos = [], _ecProfes = [], _ecFichajes = [], _ecNuevo = false;

const _ecCategorias = [
  ["alquiler", "Alquiler"], ["nominas", "Nóminas y seguros sociales"], ["suministros", "Suministros"],
  ["material", "Material didáctico"], ["marketing", "Marketing y publicidad"], ["software", "Software y servicios"],
  ["asesoria", "Asesoría y gestoría"], ["impuestos", "Impuestos y tasas"], ["otros", "Otros"],
];

function _ecEsc(s) { return escH(s); }
function _ecHoy() { return new Date().toISOString().slice(0, 10); }
function _ecPeriodo() { return new Date().toISOString().slice(0, 7); }
function _ecEur(n) { return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function _ecNombre(p) { return p ? ([p.nombre, p.apellidos].filter(Boolean).join(" ") || "(profesor)") : "—"; }
function _ecCatLabel(k) { return (_ecCategorias.find(c => c[0] === k) || [, k])[1]; }
function _ecMesAtras(n) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
}
// Horas entre dos horas 'HH:MM[:SS]' del mismo día
function _ecHoras(entrada, salida) {
  if (!entrada || !salida) return 0;
  const m = (t) => { const p = String(t).split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); };
  return Math.max(0, (m(salida) - m(entrada)) / 60);
}

function _ecEnsureStyles() {
  if (document.getElementById("ec-styles")) return;
  const st = document.createElement("style"); st.id = "ec-styles";
  st.textContent = `
    #panel-economia{padding:0!important;overflow-y:auto}
    .ec-wrap{padding:22px 26px;max-width:980px}
    .ec-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .ec-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .ec-tabs{display:flex;gap:6px;margin:16px 0 4px;border-bottom:1px solid var(--line,var(--bdr));flex-wrap:wrap}
    .ec-tab{padding:8px 14px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--muted,var(--txt3));border-bottom:2px solid transparent;font-family:inherit}
    .ec-tab.on{color:var(--ink);border-bottom-color:var(--ink)}
    .ec-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .ec-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:140px}
    .ec-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .ec-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .ec-pos{color:var(--success,#2e7d32)} .ec-neg{color:var(--danger,#c0392b)}
    .ec-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .ec-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px;background:var(--paper-2,var(--srf2));margin-bottom:14px}
    .ec-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .ec-in,.ec-sel{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit;color:var(--txt,inherit)}
    .ec-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .ec-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
    .ec-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .ec-btn-sm{padding:4px 10px;font-size:12px}
    .ec-tbl{width:100%;border-collapse:collapse;font-size:13px}
    .ec-tbl th,.ec-tbl td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line,var(--bdr))}
    .ec-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,var(--txt3))}
    .ec-tbl td.n,.ec-tbl th.n{text-align:right}
    .ec-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:8px 0}
    .ec-barra{display:flex;align-items:center;gap:9px;font-size:12.5px;padding:3px 0}
    .ec-barra .t{flex:1;min-width:0}
    .ec-barra .b{width:120px;height:7px;border-radius:7px;background:var(--paper-2,var(--srf2));overflow:hidden;flex-shrink:0}
    .ec-barra .b i{display:block;height:100%;background:var(--ink);opacity:.75}
    .ec-mes{display:grid;grid-template-columns:90px 1fr 1fr 90px;gap:9px;align-items:center;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--line,var(--bdr))}
    .ec-mes .bar{height:9px;border-radius:9px;overflow:hidden;background:var(--paper-2,var(--srf2))}
    .ec-mes .bar i{display:block;height:100%}
    @media(max-width:700px){.ec-grid{grid-template-columns:1fr}.ec-wrap{padding:16px 14px}.ec-mes{grid-template-columns:70px 1fr 60px}.ec-mes .g{display:none}}
  `;
  document.head.appendChild(st);
}

async function initEconomia() {
  _ecEnsureStyles();
  const panel = document.getElementById("panel-economia"); if (!panel) return;
  panel.innerHTML = `<div class="ec-wrap"><div class="ec-sub">Cargando…</div></div>`;
  const desde = _ecMesAtras(11) + "-01";
  const [ga, pa, pr, fi] = await Promise.all([
    sb.from("gastos").select("*").eq("centro_id", ctrId).gte("fecha", desde).order("fecha", { ascending: false }),
    sb.from("pagos").select("importe,fecha,periodo,estado").eq("centro_id", ctrId).eq("estado", "pagado").gte("fecha", desde),
    sb.from("profesores").select("id,nombre,apellidos").eq("centro_id", ctrId).order("nombre"),
    sb.from("fichajes").select("*,profesores(nombre,apellidos)").eq("centro_id", ctrId).gte("fecha", _ecPeriodo() + "-01").order("fecha", { ascending: false }),
  ]);
  _ecGastos = ga.data || []; _ecPagos = pa.data || []; _ecProfes = pr.data || []; _ecFichajes = fi.data || [];
  _ecRender();
}

function _ecRender() {
  const panel = document.getElementById("panel-economia"); if (!panel) return;
  const tabs = [["gastos", "Gastos"], ["resultados", "Resultados"], ["horario", "Control horario"]];
  panel.innerHTML = `
    <div class="ec-wrap">
      <h1 class="ec-h">Gastos y resultados</h1>
      <div class="ec-sub">Lo que entra, lo que sale y lo que queda</div>
      <div class="ec-tabs">${tabs.map(([k, l]) => `<button class="ec-tab ${_ecTab === k ? "on" : ""}" onclick="_ecGo('${k}')">${l}</button>`).join("")}</div>
      ${_ecTab === "gastos" ? _ecGastosHtml() : _ecTab === "resultados" ? _ecResultadosHtml() : _ecHorarioHtml()}
    </div>`;
}
function _ecGo(t) { _ecTab = t; _ecNuevo = false; _ecRender(); }

// ═══════════════ GASTOS ═══════════════
function _ecGastosHtml() {
  const per = _ecPeriodo();
  const mes = _ecGastos.filter(g => String(g.fecha).slice(0, 7) === per);
  const totalMes = mes.reduce((s, g) => s + Number(g.importe || 0), 0);
  const fijos = _ecGastos.filter(g => g.periodico && String(g.fecha).slice(0, 7) === per).reduce((s, g) => s + Number(g.importe || 0), 0);
  const porCat = {};
  mes.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + Number(g.importe || 0); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 1;

  return `
    <div class="ec-kpis">
      <div class="ec-kpi"><div class="ec-kpi-n">${_ecEur(totalMes)}</div><div class="ec-kpi-l">Gastos de ${_ecEsc(per)}</div></div>
      <div class="ec-kpi"><div class="ec-kpi-n">${_ecEur(fijos)}</div><div class="ec-kpi-l">De ellos, fijos</div></div>
      <div class="ec-kpi"><div class="ec-kpi-n">${mes.length}</div><div class="ec-kpi-l">Apuntes del mes</div></div>
    </div>

    <div class="ec-sec">Registrar gasto
      <span style="display:flex;gap:8px">
        ${_ecGastos.length ? `<button class="ec-btn" onclick="_ecExportar()">📗 Exportar</button>` : ""}
        ${_ecGastos.some(g => g.periodico && String(g.fecha).slice(0, 7) === _ecMesAtras(1)) ? `<button class="ec-btn" onclick="_ecRepetirFijos(this)">🔁 Repetir gastos fijos del mes pasado</button>` : ""}
        <button class="ec-btn ec-btn-p" onclick="_ecToggle()">${_ecNuevo ? "Cancelar" : "+ Nuevo gasto"}</button>
      </span></div>

    ${_ecNuevo ? `<div class="ec-form">
      <div class="ec-grid">
        <div style="grid-column:span 2"><label class="ec-lbl">Concepto *</label><input class="ec-in" id="ec-concepto" placeholder="Alquiler del local · julio"></div>
        <div><label class="ec-lbl">Importe (€) *</label><input class="ec-in" id="ec-importe" type="number" step="0.01"></div>
        <div><label class="ec-lbl">Categoría</label><select class="ec-sel" id="ec-categoria">${_ecCategorias.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
        <div><label class="ec-lbl">Fecha</label><input class="ec-in" id="ec-fecha" type="date" value="${_ecHoy()}"></div>
        <div><label class="ec-lbl">Proveedor</label><input class="ec-in" id="ec-proveedor"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:10px">
        <input type="checkbox" id="ec-periodico" style="width:auto;accent-color:var(--ink)"> Es un gasto fijo que se repite cada mes
      </label>
      <div style="display:flex;gap:10px;align-items:center"><button class="ec-btn ec-btn-p" onclick="_ecCrear()">Guardar gasto</button><span class="ec-sub" id="ec-msg"></span></div>
    </div>` : ""}

    ${cats.length ? `<div class="ec-sec">Reparto del mes</div>
      ${cats.map(([k, v]) => `<div class="ec-barra">
        <span class="t">${_ecEsc(_ecCatLabel(k))}</span>
        <span class="b"><i style="width:${Math.round(v / maxCat * 100)}%"></i></span>
        <strong>${_ecEur(v)}</strong></div>`).join("")}` : ""}

    <div class="ec-sec">Últimos gastos</div>
    ${_ecGastos.length ? `<table class="ec-tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th class="n">Importe</th><th></th></tr></thead><tbody>
      ${_ecGastos.slice(0, 80).map(g => `<tr>
        <td>${_ecEsc(g.fecha)}</td>
        <td>${_ecEsc(g.concepto)}${g.periodico ? ` <span class="ec-sub">· fijo</span>` : ""}</td>
        <td class="ec-sub">${_ecEsc(_ecCatLabel(g.categoria))}</td>
        <td class="ec-sub">${_ecEsc(g.proveedor || "—")}</td>
        <td class="n"><strong>${_ecEur(g.importe)}</strong></td>
        <td><button class="ec-btn ec-btn-sm" onclick="_ecBorrar('${escArg(g.id)}')">Borrar</button></td></tr>`).join("")}
    </tbody></table>` : `<div class="ec-empty">Sin gastos registrados en los últimos 12 meses.</div>`}`;
}

function _ecToggle() { _ecNuevo = !_ecNuevo; _ecRender(); }

async function _ecCrear() {
  const msg = document.getElementById("ec-msg");
  const err = (t) => { if (msg) { msg.textContent = t; msg.style.color = "var(--danger)"; } };
  const concepto = (document.getElementById("ec-concepto")?.value || "").trim();
  const importe = document.getElementById("ec-importe")?.value;
  if (!concepto) return err("Pon un concepto.");
  if (importe === "" || importe == null || isNaN(Number(importe))) return err("Pon el importe.");
  const { error } = await sb.from("gastos").insert({
    centro_id: ctrId, concepto, importe: Number(importe),
    categoria: document.getElementById("ec-categoria")?.value || "otros",
    fecha: document.getElementById("ec-fecha")?.value || _ecHoy(),
    proveedor: (document.getElementById("ec-proveedor")?.value || "").trim() || null,
    periodico: !!document.getElementById("ec-periodico")?.checked,
    created_by: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
  });
  if (error) return err("Error: " + error.message);
  showToastGlobal("Gasto registrado", "success");
  _ecNuevo = false;
  await initEconomia();
}

async function _ecBorrar(id) {
  if (!confirm("¿Borrar este gasto?")) return;
  const { error } = await sb.from("gastos").delete().eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  await initEconomia();
}

// Clona los gastos fijos del mes anterior al actual: el trabajo mensual de
// teclear el alquiler y las nóminas otra vez desaparece.
async function _ecRepetirFijos(btn) {
  const anterior = _ecMesAtras(1), per = _ecPeriodo();
  const fijos = _ecGastos.filter(g => g.periodico && String(g.fecha).slice(0, 7) === anterior);
  if (!fijos.length) { showToastGlobal("No hay gastos fijos el mes pasado", "info"); return; }
  const yaHay = new Set(_ecGastos.filter(g => String(g.fecha).slice(0, 7) === per).map(g => g.concepto.toLowerCase()));
  const nuevos = fijos.filter(g => !yaHay.has(g.concepto.toLowerCase()));
  if (!nuevos.length) { showToastGlobal("Los gastos fijos de este mes ya están registrados", "info"); return; }
  if (!confirm(`¿Copiar ${nuevos.length} gasto(s) fijo(s) de ${anterior} a ${per}?`)) return;
  if (btn) { btn.disabled = true; btn.textContent = "Copiando…"; }
  const dia = String(new Date().getDate()).padStart(2, "0");
  const { error } = await sb.from("gastos").insert(nuevos.map(g => ({
    centro_id: ctrId, concepto: g.concepto, categoria: g.categoria, importe: g.importe,
    proveedor: g.proveedor, metodo: g.metodo, periodico: true,
    fecha: `${per}-${dia}`,
    created_by: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
  })));
  if (error) { showToastGlobal("Error: " + error.message, "error"); if (btn) btn.disabled = false; return; }
  showToastGlobal(nuevos.length + " gasto(s) fijo(s) copiados", "success");
  await initEconomia();
}

function _ecExportar() {
  if (typeof XLSX === "undefined") { showToastGlobal("No se pudo cargar el exportador Excel", "error"); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(_ecGastos.map(g => ({
    Fecha: g.fecha, Concepto: g.concepto, Categoría: _ecCatLabel(g.categoria),
    Proveedor: g.proveedor || "", Importe: Number(g.importe || 0), Fijo: g.periodico ? "sí" : "no",
  }))), "Gastos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(_ecSerie().map(m => ({
    Mes: m.mes, Ingresos: m.ingresos, Gastos: m.gastos, Resultado: m.resultado,
  }))), "Resultados");
  XLSX.writeFile(wb, "gastos-y-resultados-" + _ecHoy() + ".xlsx");
}

// ═══════════════ RESULTADOS ═══════════════
function _ecSerie() {
  const meses = [];
  for (let i = 11; i >= 0; i--) meses.push(_ecMesAtras(i));
  return meses.map(mes => {
    const ingresos = _ecPagos.filter(p => (p.periodo || String(p.fecha).slice(0, 7)) === mes)
      .reduce((s, p) => s + Number(p.importe || 0), 0);
    const gastos = _ecGastos.filter(g => String(g.fecha).slice(0, 7) === mes)
      .reduce((s, g) => s + Number(g.importe || 0), 0);
    return { mes, ingresos, gastos, resultado: ingresos - gastos };
  });
}

function _ecResultadosHtml() {
  const serie = _ecSerie();
  const per = _ecPeriodo();
  const actual = serie.find(m => m.mes === per) || { ingresos: 0, gastos: 0, resultado: 0 };
  const anio = serie.filter(m => m.mes.slice(0, 4) === per.slice(0, 4));
  const acumIng = anio.reduce((s, m) => s + m.ingresos, 0);
  const acumGas = anio.reduce((s, m) => s + m.gastos, 0);
  const margen = actual.ingresos ? Math.round(actual.resultado / actual.ingresos * 100) : 0;
  const conDatos = serie.filter(m => m.ingresos || m.gastos);
  const tope = Math.max(1, ...serie.map(m => Math.max(m.ingresos, m.gastos)));

  return `
    <div class="ec-kpis">
      <div class="ec-kpi"><div class="ec-kpi-n">${_ecEur(actual.ingresos)}</div><div class="ec-kpi-l">Ingresos de ${_ecEsc(per)}</div></div>
      <div class="ec-kpi"><div class="ec-kpi-n">${_ecEur(actual.gastos)}</div><div class="ec-kpi-l">Gastos de ${_ecEsc(per)}</div></div>
      <div class="ec-kpi"><div class="ec-kpi-n ${actual.resultado >= 0 ? "ec-pos" : "ec-neg"}">${_ecEur(actual.resultado)}</div><div class="ec-kpi-l">Resultado del mes</div></div>
      <div class="ec-kpi"><div class="ec-kpi-n ${margen >= 0 ? "ec-pos" : "ec-neg"}">${margen}%</div><div class="ec-kpi-l">Margen</div></div>
      <div class="ec-kpi"><div class="ec-kpi-n ${acumIng - acumGas >= 0 ? "ec-pos" : "ec-neg"}">${_ecEur(acumIng - acumGas)}</div><div class="ec-kpi-l">Acumulado ${_ecEsc(per.slice(0, 4))}</div></div>
    </div>

    <div class="ec-sec">Últimos 12 meses</div>
    ${conDatos.length ? `<div>
      <div class="ec-mes" style="border:none;color:var(--muted,var(--txt3));font-size:11px;text-transform:uppercase;letter-spacing:.04em">
        <span>Mes</span><span class="g">Ingresos</span><span class="g">Gastos</span><span style="text-align:right">Resultado</span>
      </div>
      ${serie.map(m => `<div class="ec-mes">
        <span>${_ecEsc(m.mes)}</span>
        <span class="g"><span class="bar"><i style="width:${Math.round(m.ingresos / tope * 100)}%;background:var(--success,#2e7d32)"></i></span><span class="ec-sub">${_ecEur(m.ingresos)}</span></span>
        <span class="g"><span class="bar"><i style="width:${Math.round(m.gastos / tope * 100)}%;background:var(--danger,#c0392b)"></i></span><span class="ec-sub">${_ecEur(m.gastos)}</span></span>
        <strong style="text-align:right" class="${m.resultado >= 0 ? "ec-pos" : "ec-neg"}">${_ecEur(m.resultado)}</strong>
      </div>`).join("")}
    </div>` : `<div class="ec-empty">Aún no hay suficientes datos. Registra cobros y gastos para ver la evolución.</div>`}

    <div class="ec-sub" style="margin-top:14px">Los ingresos son los recibos efectivamente cobrados (no la previsión), imputados a su periodo. Es una cuenta de gestión para tomar decisiones, no un cierre contable: para eso está tu asesoría.</div>`;
}

// ═══════════════ CONTROL HORARIO ═══════════════
function _ecHorarioHtml() {
  const per = _ecPeriodo();
  const porProfe = {};
  _ecFichajes.forEach(f => {
    const k = f.profesor_id;
    porProfe[k] = porProfe[k] || { profe: f.profesores, horas: 0, dias: new Set(), abiertos: 0 };
    porProfe[k].horas += _ecHoras(f.entrada, f.salida);
    porProfe[k].dias.add(f.fecha);
    if (f.entrada && !f.salida) porProfe[k].abiertos++;
  });
  const filas = Object.entries(porProfe).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.horas - a.horas);
  const totalHoras = filas.reduce((s, f) => s + f.horas, 0);
  const abiertos = _ecFichajes.filter(f => f.entrada && !f.salida);

  return `
    <div class="ec-kpis">
      <div class="ec-kpi"><div class="ec-kpi-n">${totalHoras.toFixed(1)} h</div><div class="ec-kpi-l">Horas de ${_ecEsc(per)}</div></div>
      <div class="ec-kpi"><div class="ec-kpi-n">${filas.length}</div><div class="ec-kpi-l">Profesores con registro</div></div>
      ${abiertos.length ? `<div class="ec-kpi"><div class="ec-kpi-n">${abiertos.length}</div><div class="ec-kpi-l">Jornadas sin cerrar</div></div>` : ""}
    </div>

    <div class="ec-sec">Fichar
      ${_ecFichajes.length ? `<button class="ec-btn" onclick="_ecExportarHoras()">📗 Exportar el mes</button>` : ""}</div>
    <div class="ec-form">
      <div class="ec-grid">
        <div><label class="ec-lbl">Profesor</label><select class="ec-sel" id="ec-f-profe">${_ecProfes.map(p => `<option value="${p.id}">${_ecEsc(_ecNombre(p))}</option>`).join("") || `<option value="">(sin profesores)</option>`}</select></div>
        <div><label class="ec-lbl">Fecha</label><input class="ec-in" id="ec-f-fecha" type="date" value="${_ecHoy()}"></div>
        <div style="display:flex;gap:8px;align-items:flex-end">
          <button class="ec-btn ec-btn-p" style="flex:1" onclick="_ecFichar('entrada',this)">Entrada</button>
          <button class="ec-btn" style="flex:1" onclick="_ecFichar('salida',this)">Salida</button>
        </div>
      </div>
      <div class="ec-sub">La entrada y la salida se sellan con la hora actual. El registro diario de jornada es obligatorio para el personal por cuenta ajena.</div>
    </div>

    ${filas.length ? `<div class="ec-sec">Resumen del mes</div>
    <table class="ec-tbl"><thead><tr><th>Profesor</th><th class="n">Días</th><th class="n">Horas</th><th></th></tr></thead><tbody>
      ${filas.map(f => `<tr>
        <td>${_ecEsc(_ecNombre(f.profe))}</td>
        <td class="n">${f.dias.size}</td>
        <td class="n"><strong>${f.horas.toFixed(1)} h</strong></td>
        <td>${f.abiertos ? `<span class="ec-sub" style="color:var(--warning,#b8860b)">${f.abiertos} sin cerrar</span>` : ""}</td></tr>`).join("")}
    </tbody></table>` : ""}

    <div class="ec-sec">Registros de ${_ecEsc(per)}</div>
    ${_ecFichajes.length ? `<table class="ec-tbl"><thead><tr><th>Fecha</th><th>Profesor</th><th>Entrada</th><th>Salida</th><th class="n">Horas</th><th></th></tr></thead><tbody>
      ${_ecFichajes.slice(0, 120).map(f => `<tr>
        <td>${_ecEsc(f.fecha)}</td>
        <td>${_ecEsc(_ecNombre(f.profesores))}</td>
        <td>${_ecEsc(String(f.entrada || "—").slice(0, 5))}</td>
        <td>${f.salida ? _ecEsc(String(f.salida).slice(0, 5)) : `<span class="ec-sub">abierta</span>`}</td>
        <td class="n">${f.salida ? _ecHoras(f.entrada, f.salida).toFixed(1) + " h" : "—"}</td>
        <td><button class="ec-btn ec-btn-sm" onclick="_ecBorrarFichaje('${escArg(f.id)}')">Borrar</button></td></tr>`).join("")}
    </tbody></table>` : `<div class="ec-empty">Sin registros este mes.</div>`}`;
}

async function _ecFichar(tipo, btn) {
  const profeId = document.getElementById("ec-f-profe")?.value;
  const fecha = document.getElementById("ec-f-fecha")?.value || _ecHoy();
  if (!profeId) { showToastGlobal("Selecciona un profesor", "error"); return; }
  const ahora = new Date().toTimeString().slice(0, 5);
  const uid = (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null;
  if (btn) btn.disabled = true;
  try {
    if (tipo === "entrada") {
      const abierta = _ecFichajes.find(f => f.profesor_id === profeId && f.fecha === fecha && f.entrada && !f.salida);
      if (abierta) { showToastGlobal("Ese profesor ya tiene una jornada abierta ese día", "info"); return; }
      const { error } = await sb.from("fichajes").insert({ centro_id: ctrId, profesor_id: profeId, fecha, entrada: ahora, created_by: uid });
      if (error) throw new Error(error.message);
      showToastGlobal("Entrada registrada a las " + ahora, "success");
    } else {
      const abierta = _ecFichajes.find(f => f.profesor_id === profeId && f.fecha === fecha && f.entrada && !f.salida);
      if (!abierta) { showToastGlobal("No hay ninguna entrada abierta que cerrar", "error"); return; }
      const { error } = await sb.from("fichajes").update({ salida: ahora }).eq("id", abierta.id).eq("centro_id", ctrId);
      if (error) throw new Error(error.message);
      showToastGlobal("Salida registrada a las " + ahora + " · " + _ecHoras(abierta.entrada, ahora).toFixed(1) + " h", "success");
    }
    await initEconomia();
  } catch (e) {
    showToastGlobal("Error: " + (e.message || e), "error");
  } finally { if (btn) btn.disabled = false; }
}

async function _ecBorrarFichaje(id) {
  if (!confirm("¿Borrar este registro de jornada?")) return;
  const { error } = await sb.from("fichajes").delete().eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  await initEconomia();
}

function _ecExportarHoras() {
  if (typeof XLSX === "undefined") { showToastGlobal("No se pudo cargar el exportador Excel", "error"); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(_ecFichajes.map(f => ({
    Fecha: f.fecha, Profesor: _ecNombre(f.profesores),
    Entrada: String(f.entrada || "").slice(0, 5), Salida: String(f.salida || "").slice(0, 5),
    Horas: f.salida ? Number(_ecHoras(f.entrada, f.salida).toFixed(2)) : "",
  }))), "Jornada " + _ecPeriodo());
  XLSX.writeFile(wb, "registro-jornada-" + _ecPeriodo() + ".xlsx");
}

window.initEconomia = initEconomia;
window._ecGo = _ecGo; window._ecToggle = _ecToggle; window._ecCrear = _ecCrear; window._ecBorrar = _ecBorrar;
window._ecRepetirFijos = _ecRepetirFijos; window._ecExportar = _ecExportar;
window._ecFichar = _ecFichar; window._ecBorrarFichaje = _ecBorrarFichaje; window._ecExportarHoras = _ecExportarHoras;
