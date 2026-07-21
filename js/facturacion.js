// ── FACTURACIÓN (Fase 8) ──
// Facturación electrónica con registro encadenado (Verifactu-ready, RD 1007/2023)
// + domiciliación de recibos SEPA (pain.008.001.02). Filtra por ctrId; RLS.
//
// El registro de facturación se construye en cliente pero es inalterable en BD
// (trigger trg_facturas_inalterables) y la numeración se reserva de forma atómica
// vía RPC siguiente_numero_factura(). La huella encadena con la factura anterior.

let _fcTab = "facturas";
let _fcFiscal = null, _fcFacturas = [], _fcMandatos = [], _fcRemesas = [];
let _fcAlumnos = [], _fcPagos = [], _fcNuevoMandato = false, _fcPasarela = null;

const _fcQR_BASE = "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR";

function _fcEsc(s) { return escH(s); }
function _fcHoy() { return new Date().toISOString().slice(0, 10); }
function _fcPeriodo() { return new Date().toISOString().slice(0, 7); }
function _fcNombre(a) { return a ? ([a.nombre, a.apellidos].filter(Boolean).join(" ") || "(alumno)") : "—"; }
function _fcEur(n) { return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function _fcNum2(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }
// dd-mm-aaaa, el formato que exige el registro de facturación
function _fcFechaES(iso) { const p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : String(iso || ""); }
function _fcXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
// Los nombres SEPA solo admiten el juego de caracteres latino básico
function _fcSepaTxt(s, max) {
  const t = String(s == null ? "" : s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ").trim();
  return max ? t.slice(0, max) : t;
}
function _fcIban(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
// Validación IBAN por resto 97 (ISO 13616)
function _fcIbanValido(s) {
  const i = _fcIban(s);
  if (i.length < 15 || i.length > 34) return false;
  const r = i.slice(4) + i.slice(0, 4);
  let resto = 0;
  for (const ch of r) {
    const v = /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}
function _fcIbanBonito(s) { return _fcIban(s).replace(/(.{4})/g, "$1 ").trim(); }

// Fecha-hora ISO 8601 con huso horario, tal y como la exige el registro
function _fcIsoHuso(d) {
  d = d || new Date();
  const p = (n) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const signo = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${signo}${p(off / 60 | 0)}:${p(off % 60)}`;
}

// Huella SHA-256 del registro (concatenación oficial del RD 1007/2023)
async function _fcHuella(reg) {
  const cadena =
    `IDEmisorFactura=${reg.nif}` +
    `&NumSerieFactura=${reg.num_completo}` +
    `&FechaExpedicionFactura=${_fcFechaES(reg.fecha_expedicion)}` +
    `&TipoFactura=${reg.tipo_factura}` +
    `&CuotaTotal=${_fcNum2(reg.cuota_iva)}` +
    `&ImporteTotal=${_fcNum2(reg.total)}` +
    `&Huella=${reg.huella_anterior || ""}` +
    `&FechaHoraHusoGenRegistro=${reg.fecha_hora_registro}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cadena));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function _fcQrUrl(reg) {
  const q = new URLSearchParams({
    nif: reg.nif || "",
    numserie: reg.num_completo || "",
    fecha: _fcFechaES(reg.fecha_expedicion),
    importe: _fcNum2(reg.total),
  });
  return `${_fcQR_BASE}?${q.toString()}`;
}

function _fcEnsureStyles() {
  if (document.getElementById("fc-styles")) return;
  const st = document.createElement("style"); st.id = "fc-styles";
  st.textContent = `
    #panel-facturacion{padding:0!important;overflow-y:auto}
    .fc-wrap{padding:22px 26px;max-width:980px}
    .fc-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .fc-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .fc-tabs{display:flex;gap:6px;margin:16px 0 4px;flex-wrap:wrap;border-bottom:1px solid var(--line,var(--bdr))}
    .fc-tab{padding:8px 14px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--muted,var(--txt3));border-bottom:2px solid transparent;font-family:inherit}
    .fc-tab.on{color:var(--ink);border-bottom-color:var(--ink)}
    .fc-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .fc-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px;background:var(--paper-2,var(--srf2));margin-bottom:14px}
    .fc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .fc-grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:10px}
    .fc-in,.fc-sel{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit}
    .fc-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .fc-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
    .fc-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .fc-btn-sm{padding:4px 10px;font-size:12px}
    .fc-tbl{width:100%;border-collapse:collapse;font-size:13px}
    .fc-tbl th,.fc-tbl td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line,var(--bdr));vertical-align:middle}
    .fc-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,var(--txt3))}
    .fc-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
    .fc-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .fc-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:130px}
    .fc-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .fc-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .fc-pill{font-size:11px;padding:2px 8px;border-radius:20px;display:inline-block}
    .fc-pill-ok{background:var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)}
    .fc-pill-wait{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .fc-pill-off{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .fc-note{border:1px solid var(--line,var(--bdr));border-left:3px solid var(--warning,#b8860b);border-radius:8px;padding:10px 13px;font-size:12.5px;color:var(--txt2,#555);background:var(--paper-2,var(--srf2));margin:10px 0}
    .fc-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--muted,var(--txt3));word-break:break-all}
    @media(max-width:700px){.fc-grid,.fc-grid-2{grid-template-columns:1fr}.fc-wrap{padding:16px 14px}}
  `;
  document.head.appendChild(st);
}

async function initFacturacion() {
  _fcEnsureStyles();
  const panel = document.getElementById("panel-facturacion"); if (!panel) return;
  panel.innerHTML = `<div class="fc-wrap"><div class="fc-sub">Cargando…</div></div>`;
  const [df, fa, ma, re, al, pg] = await Promise.all([
    sb.from("datos_fiscales").select("*").eq("centro_id", ctrId).maybeSingle(),
    sb.from("facturas").select("*,alumnos(nombre,apellidos)").eq("centro_id", ctrId).order("fecha_hora_registro", { ascending: false }).limit(300),
    sb.from("mandatos_sepa").select("*,alumnos(nombre,apellidos)").eq("centro_id", ctrId).order("created_at", { ascending: false }),
    sb.from("remesas_sepa").select("*").eq("centro_id", ctrId).order("fecha_cobro", { ascending: false }).limit(50),
    sb.from("alumnos").select("id,nombre,apellidos,estado,direccion,email_contacto").eq("centro_id", ctrId).order("nombre"),
    sb.from("pagos").select("id,alumno_id,concepto,importe,fecha,periodo,estado,metodo,factura_id,remesa_id,alumnos(nombre,apellidos)").eq("centro_id", ctrId).order("fecha", { ascending: false }).limit(400),
  ]);
  _fcFiscal = df.data || null;
  _fcFacturas = fa.data || []; _fcMandatos = ma.data || []; _fcRemesas = re.data || [];
  _fcAlumnos = al.data || []; _fcPagos = pg.data || [];
  // El estado de la pasarela va aparte: el RPC lanza si el rol no llega
  try {
    const { data: ps } = await sb.rpc("estado_pasarela", { p_centro: ctrId });
    _fcPasarela = ps || null;
  } catch (e) { _fcPasarela = null; }
  _fcRender();
}

function _fcRender() {
  const panel = document.getElementById("panel-facturacion"); if (!panel) return;
  const tabs = [["facturas", "Facturas"], ["sepa", "Domiciliaciones SEPA"], ["online", "Pago online"], ["fiscal", "Datos fiscales"]];
  panel.innerHTML = `
    <div class="fc-wrap">
      <h1 class="fc-h">Facturación</h1>
      <div class="fc-sub">Facturas con registro encadenado y remesas de domiciliación bancaria</div>
      <div class="fc-tabs">${tabs.map(([k, l]) => `<button class="fc-tab ${_fcTab === k ? "on" : ""}" onclick="_fcGo('${k}')">${l}</button>`).join("")}</div>
      <div id="fc-body">${_fcTab === "facturas" ? _fcFacturasHtml() : _fcTab === "sepa" ? _fcSepaHtml() : _fcTab === "online" ? _fcOnlineHtml() : _fcFiscalHtml()}</div>
    </div>`;
}
function _fcGo(t) { _fcTab = t; _fcRender(); }

// ── Comprobación de datos fiscales mínimos ─────────────────────────────────
function _fcFiscalOk() { return !!(_fcFiscal && _fcFiscal.nif && _fcFiscal.razon_social); }
function _fcSepaOk() { return _fcFiscalOk() && !!(_fcFiscal.iban && _fcFiscal.sepa_acreedor_id); }

// ═══════════════════════ FACTURAS ═══════════════════════
function _fcFacturasHtml() {
  const per = _fcPeriodo();
  const delMes = _fcFacturas.filter(f => String(f.fecha_expedicion).slice(0, 7) === per && !f.anulada);
  const facturadoMes = delMes.reduce((s, f) => s + Number(f.total || 0), 0);
  // Pagos cobrados que aún no tienen factura
  const sinFactura = _fcPagos.filter(p => p.estado === "pagado" && !p.factura_id);

  if (!_fcFiscalOk()) {
    return `<div class="fc-note"><strong>Antes de emitir facturas</strong> completa los datos fiscales de la academia (razón social y NIF como mínimo). Sin ellos la factura no es válida ni se puede encadenar el registro.
      <div style="margin-top:8px"><button class="fc-btn fc-btn-p fc-btn-sm" onclick="_fcGo('fiscal')">Completar datos fiscales</button></div></div>`;
  }

  return `
    <div class="fc-kpis">
      <div class="fc-kpi"><div class="fc-kpi-n">${delMes.length}</div><div class="fc-kpi-l">Facturas del mes</div></div>
      <div class="fc-kpi"><div class="fc-kpi-n">${_fcEur(facturadoMes)}</div><div class="fc-kpi-l">Facturado ${_fcEsc(per)}</div></div>
      <div class="fc-kpi"><div class="fc-kpi-n">${_fcFacturas.length}</div><div class="fc-kpi-l">Total emitidas</div></div>
      <div class="fc-kpi"><div class="fc-kpi-n">${sinFactura.length}</div><div class="fc-kpi-l">Cobros sin facturar</div></div>
    </div>

    <div class="fc-note">Cada factura queda registrada con su <strong>huella SHA-256 encadenada</strong> a la anterior y un <strong>QR de cotejo</strong> de la AEAT, conforme al reglamento de sistemas de facturación. El registro es inalterable: para corregir una factura se emite una rectificativa. El envío automático a la AEAT se activará cuando cargues el certificado digital de la academia.</div>

    <div class="fc-sec">Cobros pendientes de facturar
      ${sinFactura.length ? `<button class="fc-btn fc-btn-p" onclick="_fcFacturarTodos(this)">🧾 Facturar los ${sinFactura.length} cobros</button>` : ""}</div>
    ${sinFactura.length ? `<table class="fc-tbl"><thead><tr><th>Fecha</th><th>Alumno</th><th>Concepto</th><th>Importe</th><th></th></tr></thead><tbody>
      ${sinFactura.slice(0, 40).map(p => `<tr>
        <td>${_fcEsc(p.fecha)}</td><td>${_fcEsc(_fcNombre(p.alumnos))}</td><td>${_fcEsc(p.concepto || "Cuota")}</td>
        <td>${_fcEur(p.importe)}</td>
        <td><button class="fc-btn fc-btn-sm" onclick="_fcEmitir('${escArg(p.id)}',this)">Emitir factura</button></td></tr>`).join("")}
    </tbody></table>${sinFactura.length > 40 ? `<div class="fc-empty">… y ${sinFactura.length - 40} más. Usa "Facturar los ${sinFactura.length} cobros".</div>` : ""}`
      : `<div class="fc-empty">✓ Todos los cobros registrados están facturados.</div>`}

    <div class="fc-sec">Facturas emitidas
      ${_fcFacturas.length ? `<button class="fc-btn" onclick="_fcExportarLibro()">📗 Exportar libro de facturas</button>` : ""}</div>
    ${_fcFacturas.length ? `<table class="fc-tbl"><thead><tr><th>Nº</th><th>Fecha</th><th>Destinatario</th><th>Base</th><th>IVA</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>
      ${_fcFacturas.slice(0, 100).map(f => `<tr${f.anulada ? ` style="opacity:.5;text-decoration:line-through"` : ""}>
        <td><strong>${_fcEsc(f.num_completo)}</strong></td>
        <td>${_fcEsc(f.fecha_expedicion)}</td>
        <td>${_fcEsc(f.destinatario_nombre || _fcNombre(f.alumnos))}</td>
        <td>${_fcEur(f.base_imponible)}</td>
        <td>${Number(f.cuota_iva) ? _fcEur(f.cuota_iva) : `<span class="fc-sub">exenta</span>`}</td>
        <td><strong>${_fcEur(f.total)}</strong></td>
        <td><span class="fc-pill ${f.anulada ? "fc-pill-off" : f.estado_aeat === "aceptada" ? "fc-pill-ok" : "fc-pill-wait"}">${_fcEsc(f.anulada ? "anulada" : f.estado_aeat === "no_remitida" ? "registrada" : f.estado_aeat)}</span></td>
        <td style="white-space:nowrap">
          <button class="fc-btn fc-btn-sm" onclick="_fcPdf('${escArg(f.id)}')">PDF</button>
          ${!f.anulada && f.tipo_factura !== "R1" ? `<button class="fc-btn fc-btn-sm" onclick="_fcRectificar('${escArg(f.id)}')">Rectificar</button>` : ""}
        </td></tr>`).join("")}
    </tbody></table>` : `<div class="fc-empty">Aún no has emitido ninguna factura.</div>`}`;
}

// Emite la factura de un pago concreto. Devuelve la factura creada o null.
async function _fcEmitirPago(pago, opts) {
  opts = opts || {};
  const fiscal = _fcFiscal;
  const alumno = _fcAlumnos.find(a => a.id === pago.alumno_id) || pago.alumnos || null;

  // 1) Reserva atómica de número (evita huecos y carreras entre usuarios)
  const { data: numData, error: numErr } = await sb.rpc("siguiente_numero_factura", { p_centro: ctrId });
  if (numErr) throw new Error("No se pudo reservar número de factura: " + numErr.message);
  const fila = Array.isArray(numData) ? numData[0] : numData;
  const serie = fila?.serie || fiscal.serie_factura || "FA";
  const numero = Number(fila?.numero || 1);
  const anio = String(pago.fecha || _fcHoy()).slice(0, 4);
  const numCompleto = `${serie}/${anio}/${String(numero).padStart(4, "0")}`;

  // 2) Encadena con la huella de la última factura registrada
  const { data: prev } = await sb.rpc("ultima_huella_factura", { p_centro: ctrId });
  const huellaAnterior = (typeof prev === "string" ? prev : (prev && prev[0]) || "") || "";

  // 3) Importes. La enseñanza suele ir exenta (art. 20.Uno.9º LIVA) → tipo 0.
  const tipoIva = Number(opts.tipo_iva != null ? opts.tipo_iva : (fiscal.tipo_iva || 0));
  const total = Number(pago.importe || 0) * (opts.signo || 1);
  const base = tipoIva > 0 ? total / (1 + tipoIva / 100) : total;
  const cuota = total - base;

  const reg = {
    nif: fiscal.nif,
    num_completo: numCompleto,
    fecha_expedicion: String(pago.fecha || _fcHoy()).slice(0, 10),
    tipo_factura: opts.tipo_factura || "F1",
    cuota_iva: cuota,
    total,
    huella_anterior: huellaAnterior,
    fecha_hora_registro: _fcIsoHuso(),
  };
  const huella = await _fcHuella(reg);
  const qr = _fcQrUrl(reg);

  const row = {
    centro_id: ctrId,
    alumno_id: pago.alumno_id || null,
    pago_id: pago.id || null,
    serie, numero, num_completo: numCompleto,
    fecha_expedicion: reg.fecha_expedicion,
    fecha_hora_registro: reg.fecha_hora_registro,
    destinatario_nombre: opts.destinatario_nombre || _fcNombre(alumno),
    destinatario_nif: opts.destinatario_nif || null,
    destinatario_direccion: alumno?.direccion || null,
    concepto: opts.concepto || pago.concepto || "Servicios de enseñanza",
    base_imponible: Math.round(base * 100) / 100,
    tipo_iva: tipoIva,
    cuota_iva: Math.round(cuota * 100) / 100,
    total: Math.round(total * 100) / 100,
    exencion: tipoIva > 0 ? null : (fiscal.exencion_iva || "E1"),
    tipo_factura: reg.tipo_factura,
    rectifica_id: opts.rectifica_id || null,
    huella, huella_anterior: huellaAnterior || null,
    qr_url: qr,
    created_by: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
  };
  const { data, error } = await sb.from("facturas").insert(row).select().single();
  if (error) throw new Error(error.message);
  if (pago.id) await sb.from("pagos").update({ factura_id: data.id }).eq("id", pago.id).eq("centro_id", ctrId);
  return data;
}

async function _fcEmitir(pagoId, btn) {
  const pago = _fcPagos.find(p => p.id === pagoId); if (!pago) return;
  const orig = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "Emitiendo…"; }
  try {
    const f = await _fcEmitirPago(pago);
    showToastGlobal("Factura " + f.num_completo + " emitida", "success");
    await initFacturacion();
  } catch (e) {
    showToastGlobal("Error: " + (e.message || e), "error");
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

async function _fcFacturarTodos(btn) {
  const sinFactura = _fcPagos.filter(p => p.estado === "pagado" && !p.factura_id);
  if (!sinFactura.length) return;
  if (!confirm(`¿Emitir ${sinFactura.length} factura(s)? La numeración es correlativa y no se puede deshacer: para corregir habría que rectificar.`)) return;
  if (btn) { btn.disabled = true; btn.textContent = "Emitiendo…"; }
  // Secuencial a propósito: la cadena de huellas exige orden estricto.
  let ok = 0, fallo = null;
  const orden = sinFactura.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  for (const p of orden) {
    try { await _fcEmitirPago(p); ok++; if (btn) btn.textContent = `Emitiendo… ${ok}/${orden.length}`; }
    catch (e) { fallo = e; break; }
  }
  showToastGlobal(ok + " factura(s) emitidas" + (fallo ? " · se detuvo por un error: " + fallo.message : ""), fallo ? "error" : "success");
  await initFacturacion();
}

async function _fcRectificar(id) {
  const f = _fcFacturas.find(x => x.id === id); if (!f) return;
  if (!confirm(`¿Emitir factura rectificativa de ${f.num_completo} por ${_fcEur(-f.total)}? La original quedará anulada.`)) return;
  try {
    await _fcEmitirPago(
      { alumno_id: f.alumno_id, importe: f.total, fecha: _fcHoy(), concepto: "Rectificación de " + f.num_completo, alumnos: f.alumnos },
      { tipo_factura: "R1", rectifica_id: f.id, signo: -1, tipo_iva: f.tipo_iva, destinatario_nombre: f.destinatario_nombre }
    );
    await sb.from("facturas").update({ anulada: true, fecha_anulacion: new Date().toISOString() }).eq("id", f.id).eq("centro_id", ctrId);
    showToastGlobal("Rectificativa emitida", "success");
    await initFacturacion();
  } catch (e) { showToastGlobal("Error: " + (e.message || e), "error"); }
}

// ── PDF de factura con QR de cotejo ────────────────────────────────────────
function _fcQrModulos(texto) {
  if (typeof qrcode !== "function") return null;
  const qr = qrcode(0, "M");
  qr.addData(texto); qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { const fila = []; for (let c = 0; c < n; c++) fila.push(qr.isDark(r, c)); m.push(fila); }
  return m;
}

function _fcPdf(id) {
  const f = _fcFacturas.find(x => x.id === id); if (!f) return;
  if (!window.jspdf || !window.jspdf.jsPDF) { showToastGlobal("No se pudo cargar el generador PDF", "error"); return; }
  const fi = _fcFiscal || {};
  const doc = new window.jspdf.jsPDF();
  doc.setFont("helvetica", "normal");

  // Emisor
  doc.setFontSize(17); doc.text(String(fi.razon_social || ctrName || "Academia"), 20, 22);
  doc.setFontSize(9); doc.setTextColor(110);
  const emisor = [fi.nif ? "NIF: " + fi.nif : "", fi.direccion || "", [fi.cp, fi.ciudad, fi.provincia].filter(Boolean).join(" ")].filter(Boolean);
  emisor.forEach((l, i) => doc.text(String(l), 20, 29 + i * 5));

  doc.setTextColor(0); doc.setFontSize(13);
  doc.text(f.tipo_factura === "R1" ? "FACTURA RECTIFICATIVA" : "FACTURA", 140, 22);
  doc.setFontSize(10);
  doc.text("Nº " + String(f.num_completo), 140, 29);
  doc.text("Fecha: " + _fcFechaES(f.fecha_expedicion), 140, 35);

  // Destinatario
  let y = 56;
  doc.setDrawColor(210); doc.line(20, y - 6, 190, y - 6);
  doc.setFontSize(9); doc.setTextColor(110); doc.text("FACTURAR A", 20, y); doc.setTextColor(0);
  doc.setFontSize(11); doc.text(String(f.destinatario_nombre || "—"), 20, y + 7);
  doc.setFontSize(9); doc.setTextColor(110);
  if (f.destinatario_nif) doc.text("NIF: " + f.destinatario_nif, 20, y + 13);
  if (f.destinatario_direccion) doc.text(String(f.destinatario_direccion).slice(0, 60), 20, y + 19);

  // Líneas
  y = 90; doc.setTextColor(0); doc.setFontSize(10);
  doc.setDrawColor(180); doc.line(20, y, 190, y);
  doc.text("Concepto", 22, y + 7); doc.text("Base", 130, y + 7); doc.text("IVA", 152, y + 7); doc.text("Importe", 168, y + 7);
  doc.line(20, y + 10, 190, y + 10);
  doc.setFontSize(10);
  doc.text(String(f.concepto || "Servicios de enseñanza").slice(0, 55), 22, y + 18);
  doc.text(_fcNum2(f.base_imponible) + " €", 130, y + 18);
  doc.text(Number(f.tipo_iva) ? Number(f.tipo_iva) + "%" : "Exento", 152, y + 18);
  doc.text(_fcNum2(f.total) + " €", 168, y + 18);
  doc.line(20, y + 24, 190, y + 24);

  doc.setFontSize(10); doc.text("Base imponible", 130, y + 32); doc.text(_fcNum2(f.base_imponible) + " €", 168, y + 32);
  doc.text("Cuota IVA", 130, y + 38); doc.text(_fcNum2(f.cuota_iva) + " €", 168, y + 38);
  doc.setFontSize(12); doc.text("TOTAL", 130, y + 47); doc.text(_fcNum2(f.total) + " €", 168, y + 47);

  if (!Number(f.tipo_iva)) {
    doc.setFontSize(8); doc.setTextColor(110);
    doc.text("Operación exenta de IVA (art. 20.Uno.9º Ley 37/1992).", 20, y + 47);
  }

  // QR de cotejo + leyenda
  const mods = _fcQrModulos(f.qr_url || "");
  if (mods) {
    const n = mods.length, size = 32, px = size / n, x0 = 20, y0 = 205;
    doc.setFillColor(255, 255, 255); doc.rect(x0 - 2, y0 - 2, size + 4, size + 4, "F");
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (mods[r][c]) doc.rect(x0 + c * px, y0 + r * px, px, px, "F");
    doc.setFontSize(8); doc.setTextColor(0);
    doc.text("VERI*FACTU", x0 + size + 6, y0 + 8);
    doc.setTextColor(110);
    doc.text("Factura verificable en la sede electrónica", x0 + size + 6, y0 + 14);
    doc.text("de la Agencia Tributaria.", x0 + size + 6, y0 + 19);
  }

  doc.setFontSize(7); doc.setTextColor(150);
  doc.text("Huella del registro: " + String(f.huella || "").slice(0, 32) + "…", 20, 252);
  if (fi.pie_factura) doc.text(String(fi.pie_factura).slice(0, 110), 20, 258);
  doc.text("Documento generado por DidactIA Academias.", 20, 285);
  doc.save("factura-" + String(f.num_completo).replace(/\//g, "-") + ".pdf");
}

function _fcExportarLibro() {
  if (typeof XLSX === "undefined") { showToastGlobal("No se pudo cargar el exportador Excel", "error"); return; }
  const rows = _fcFacturas.map(f => ({
    "Nº factura": f.num_completo,
    "Fecha": f.fecha_expedicion,
    "Tipo": f.tipo_factura,
    "Destinatario": f.destinatario_nombre || _fcNombre(f.alumnos),
    "NIF": f.destinatario_nif || "",
    "Concepto": f.concepto || "",
    "Base imponible": Number(f.base_imponible || 0),
    "Tipo IVA": Number(f.tipo_iva || 0),
    "Cuota IVA": Number(f.cuota_iva || 0),
    "Total": Number(f.total || 0),
    "Exención": f.exencion || "",
    "Estado": f.anulada ? "anulada" : f.estado_aeat,
    "Huella": f.huella,
    "Huella anterior": f.huella_anterior || "",
    "Registro": f.fecha_hora_registro,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Libro de facturas");
  XLSX.writeFile(wb, "libro-facturas-" + _fcHoy() + ".xlsx");
}

// ═══════════════════════ SEPA ═══════════════════════
function _fcSepaHtml() {
  if (!_fcSepaOk()) {
    return `<div class="fc-note"><strong>Para domiciliar recibos</strong> necesitas el IBAN de la academia y tu identificador de acreedor SEPA (te lo da tu banco; tiene el formato <span class="fc-mono">ES + 2 dígitos + ZZZ + NIF</span>).
      <div style="margin-top:8px"><button class="fc-btn fc-btn-p fc-btn-sm" onclick="_fcGo('fiscal')">Completar datos bancarios</button></div></div>`;
  }
  const activos = _fcMandatos.filter(m => m.estado === "activo");
  const conMandato = new Set(activos.map(m => m.alumno_id));
  const sinMandato = _fcAlumnos.filter(a => a.estado === "activo" && !conMandato.has(a.id));
  const domiciliables = _fcPagos.filter(p => p.estado === "pendiente" && !p.remesa_id && conMandato.has(p.alumno_id));
  const totalDom = domiciliables.reduce((s, p) => s + Number(p.importe || 0), 0);

  return `
    <div class="fc-kpis">
      <div class="fc-kpi"><div class="fc-kpi-n">${activos.length}</div><div class="fc-kpi-l">Mandatos activos</div></div>
      <div class="fc-kpi"><div class="fc-kpi-n">${sinMandato.length}</div><div class="fc-kpi-l">Alumnos sin mandato</div></div>
      <div class="fc-kpi"><div class="fc-kpi-n">${domiciliables.length}</div><div class="fc-kpi-l">Recibos domiciliables</div></div>
      <div class="fc-kpi"><div class="fc-kpi-n">${_fcEur(totalDom)}</div><div class="fc-kpi-l">Importe a remesar</div></div>
    </div>

    <div class="fc-sec">Generar remesa
      ${domiciliables.length ? `<button class="fc-btn fc-btn-p" onclick="_fcGenerarRemesa(this)">🏦 Generar remesa de ${domiciliables.length} recibo(s)</button>` : ""}</div>
    ${domiciliables.length
      ? `<div class="fc-form">
          <div class="fc-grid">
            <div><label class="fc-lbl">Fecha de cobro</label><input class="fc-in" id="fc-rem-fecha" type="date" value="${_fcProximoCobro()}"></div>
            <div><label class="fc-lbl">Concepto en el extracto</label><input class="fc-in" id="fc-rem-concepto" value="Cuota ${_fcEsc(_fcPeriodo())}"></div>
            <div><label class="fc-lbl">Recibos incluidos</label><input class="fc-in" value="${domiciliables.length} · ${_fcEur(totalDom)}" disabled></div>
          </div>
          <div class="fc-sub">Se genera un fichero <strong>XML pain.008.001.02</strong> listo para subir a la banca electrónica. Presenta la remesa con al menos 2 días hábiles de antelación sobre la fecha de cobro.</div>
        </div>`
      : `<div class="fc-empty">No hay recibos pendientes de alumnos con mandato. Genera los recibos del mes en <strong>Cobros</strong> y da de alta los mandatos aquí.</div>`}

    <div class="fc-sec">Remesas generadas</div>
    ${_fcRemesas.length ? `<table class="fc-tbl"><thead><tr><th>Fecha cobro</th><th>Concepto</th><th>Operaciones</th><th>Importe</th><th>Estado</th><th></th></tr></thead><tbody>
      ${_fcRemesas.map(r => `<tr>
        <td>${_fcEsc(r.fecha_cobro)}</td><td>${_fcEsc(r.nombre || "—")}</td><td>${r.num_operaciones}</td><td><strong>${_fcEur(r.importe_total)}</strong></td>
        <td><span class="fc-pill ${r.estado === "cobrada" ? "fc-pill-ok" : "fc-pill-wait"}">${_fcEsc(r.estado)}</span></td>
        <td style="white-space:nowrap">
          <button class="fc-btn fc-btn-sm" onclick="_fcDescargarRemesa('${escArg(r.id)}')">Descargar XML</button>
          ${r.estado !== "cobrada" ? `<button class="fc-btn fc-btn-sm" onclick="_fcMarcarCobrada('${escArg(r.id)}')">Marcar cobrada</button>` : ""}
        </td></tr>`).join("")}
    </tbody></table>` : `<div class="fc-empty">Todavía no has generado ninguna remesa.</div>`}

    <div class="fc-sec">Mandatos de domiciliación
      <button class="fc-btn fc-btn-p" onclick="_fcToggleMandato()">${_fcNuevoMandato ? "Cancelar" : "+ Nuevo mandato"}</button></div>
    ${_fcNuevoMandato ? `<div class="fc-form">
      <div class="fc-grid">
        <div><label class="fc-lbl">Alumno</label><select class="fc-sel" id="fc-m-alumno">${_fcAlumnos.filter(a => a.estado === "activo").map(a => `<option value="${a.id}">${_fcEsc(_fcNombre(a))}</option>`).join("") || `<option value="">(sin alumnos activos)</option>`}</select></div>
        <div><label class="fc-lbl">Titular de la cuenta</label><input class="fc-in" id="fc-m-titular" placeholder="Nombre y apellidos"></div>
        <div><label class="fc-lbl">NIF del titular</label><input class="fc-in" id="fc-m-nif" placeholder="12345678Z"></div>
        <div style="grid-column:span 2"><label class="fc-lbl">IBAN</label><input class="fc-in" id="fc-m-iban" placeholder="ES91 2100 0418 4502 0005 1332"></div>
        <div><label class="fc-lbl">Fecha de firma</label><input class="fc-in" id="fc-m-fecha" type="date" value="${_fcHoy()}"></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center"><button class="fc-btn fc-btn-p" onclick="_fcCrearMandato()">Guardar mandato</button><span class="fc-sub" id="fc-m-msg"></span></div>
      <div class="fc-sub" style="margin-top:8px">La orden de domiciliación debe estar firmada por el titular. Puedes recogerla firmada desde <strong>Documentos</strong> y quedará vinculada al mandato.</div>
    </div>` : ""}
    ${_fcMandatos.length ? `<table class="fc-tbl"><thead><tr><th>Alumno</th><th>Titular</th><th>IBAN</th><th>Referencia</th><th>Secuencia</th><th>Estado</th><th></th></tr></thead><tbody>
      ${_fcMandatos.map(m => `<tr${m.estado !== "activo" ? ` style="opacity:.5"` : ""}>
        <td>${_fcEsc(_fcNombre(m.alumnos))}</td><td>${_fcEsc(m.titular)}</td>
        <td class="fc-mono">${_fcEsc(_fcIbanEnmascarado(m.iban))}</td>
        <td class="fc-mono">${_fcEsc(m.referencia)}</td>
        <td>${_fcEsc(m.tipo_secuencia)}</td>
        <td><span class="fc-pill ${m.estado === "activo" ? "fc-pill-ok" : "fc-pill-off"}">${_fcEsc(m.estado)}</span></td>
        <td>${m.estado === "activo" ? `<button class="fc-btn fc-btn-sm" onclick="_fcRevocarMandato('${escArg(m.id)}')">Revocar</button>` : ""}</td></tr>`).join("")}
    </tbody></table>` : `<div class="fc-empty">Sin mandatos. Añade uno para poder domiciliar las cuotas.</div>`}`;
}

// Nunca mostramos el IBAN completo en pantalla
function _fcIbanEnmascarado(iban) {
  const i = _fcIban(iban);
  return i.length > 8 ? i.slice(0, 4) + " •••• " + i.slice(-4) : i;
}
// Por defecto, cobro dentro de 5 días naturales (margen sobre los 2 días hábiles del CORE)
function _fcProximoCobro() {
  const d = new Date(); d.setDate(d.getDate() + 5);
  return d.toISOString().slice(0, 10);
}

function _fcToggleMandato() { _fcNuevoMandato = !_fcNuevoMandato; _fcRender(); }

async function _fcCrearMandato() {
  const msg = document.getElementById("fc-m-msg");
  const err = (t) => { if (msg) { msg.textContent = t; msg.style.color = "var(--danger)"; } };
  const alumnoId = document.getElementById("fc-m-alumno")?.value;
  const titular = (document.getElementById("fc-m-titular")?.value || "").trim();
  const iban = _fcIban(document.getElementById("fc-m-iban")?.value);
  if (!alumnoId) return err("Selecciona un alumno.");
  if (!titular) return err("Indica el titular de la cuenta.");
  if (!_fcIbanValido(iban)) return err("El IBAN no es válido (revisa los dígitos de control).");

  const alumno = _fcAlumnos.find(a => a.id === alumnoId);
  // Referencia única del mandato (RUM), estable y legible
  const referencia = ("M" + String(alumno?.nombre || "").slice(0, 3) + Date.now().toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 35);
  const { error } = await sb.from("mandatos_sepa").insert({
    centro_id: ctrId, alumno_id: alumnoId, titular,
    nif_titular: (document.getElementById("fc-m-nif")?.value || "").trim() || null,
    iban, referencia,
    fecha_firma: document.getElementById("fc-m-fecha")?.value || _fcHoy(),
    tipo_secuencia: "FRST", estado: "activo",
    created_by: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
  });
  if (error) return err("Error: " + error.message);
  showToastGlobal("Mandato dado de alta", "success");
  _fcNuevoMandato = false;
  await initFacturacion();
}

async function _fcRevocarMandato(id) {
  if (!confirm("¿Revocar este mandato? Dejarán de domiciliarse sus recibos.")) return;
  const { error } = await sb.from("mandatos_sepa").update({ estado: "revocado" }).eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  showToastGlobal("Mandato revocado", "success");
  await initFacturacion();
}

// ── Generación del XML pain.008.001.02 ─────────────────────────────────────
function _fcXmlRemesa(remesa, bloques, fiscal) {
  const ahora = new Date().toISOString().slice(0, 19);
  const total = bloques.reduce((s, b) => s + b.lineas.reduce((t, l) => t + l.importe, 0), 0);
  const nOps = bloques.reduce((s, b) => s + b.lineas.length, 0);

  const pmtInf = bloques.map((b, bi) => {
    const bTotal = b.lineas.reduce((t, l) => t + l.importe, 0);
    return `  <PmtInf>
   <PmtInfId>${_fcXml(remesa.msg_id + "-" + (bi + 1))}</PmtInfId>
   <PmtMtd>DD</PmtMtd>
   <NbOfTxs>${b.lineas.length}</NbOfTxs>
   <CtrlSum>${_fcNum2(bTotal)}</CtrlSum>
   <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>${b.seq}</SeqTp></PmtTpInf>
   <ReqdColltnDt>${_fcXml(remesa.fecha_cobro)}</ReqdColltnDt>
   <Cdtr><Nm>${_fcXml(_fcSepaTxt(fiscal.razon_social || ctrName, 70))}</Nm></Cdtr>
   <CdtrAcct><Id><IBAN>${_fcXml(_fcIban(fiscal.iban))}</IBAN></Id></CdtrAcct>
   <CdtrAgt><FinInstnId>${fiscal.bic ? `<BIC>${_fcXml(fiscal.bic)}</BIC>` : `<Othr><Id>NOTPROVIDED</Id></Othr>`}</FinInstnId></CdtrAgt>
   <ChrgBr>SLEV</ChrgBr>
   <CdtrSchmeId><Id><PrvtId><Othr><Id>${_fcXml(fiscal.sepa_acreedor_id)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${b.lineas.map(l => `   <DrctDbtTxInf>
    <PmtId><EndToEndId>${_fcXml(l.e2e)}</EndToEndId></PmtId>
    <InstdAmt Ccy="EUR">${_fcNum2(l.importe)}</InstdAmt>
    <DrctDbtTx><MndtRltdInf><MndtId>${_fcXml(l.mandato.referencia)}</MndtId><DtOfSgntr>${_fcXml(l.mandato.fecha_firma)}</DtOfSgntr><AmdmntInd>false</AmdmntInd></MndtRltdInf></DrctDbtTx>
    <DbtrAgt><FinInstnId>${l.mandato.bic ? `<BIC>${_fcXml(l.mandato.bic)}</BIC>` : `<Othr><Id>NOTPROVIDED</Id></Othr>`}</FinInstnId></DbtrAgt>
    <Dbtr><Nm>${_fcXml(_fcSepaTxt(l.mandato.titular, 70))}</Nm></Dbtr>
    <DbtrAcct><Id><IBAN>${_fcXml(_fcIban(l.mandato.iban))}</IBAN></Id></DbtrAcct>
    <RmtInf><Ustrd>${_fcXml(_fcSepaTxt(l.concepto, 140))}</Ustrd></RmtInf>
   </DrctDbtTxInf>`).join("\n")}
  </PmtInf>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <CstmrDrctDbtInitn>
  <GrpHdr>
   <MsgId>${_fcXml(remesa.msg_id)}</MsgId>
   <CreDtTm>${_fcXml(ahora)}</CreDtTm>
   <NbOfTxs>${nOps}</NbOfTxs>
   <CtrlSum>${_fcNum2(total)}</CtrlSum>
   <InitgPty><Nm>${_fcXml(_fcSepaTxt(fiscal.razon_social || ctrName, 70))}</Nm><Id><OrgId><Othr><Id>${_fcXml(fiscal.sepa_acreedor_id)}</Id></Othr></OrgId></Id></InitgPty>
  </GrpHdr>
${pmtInf}
 </CstmrDrctDbtInitn>
</Document>`;
}

async function _fcGenerarRemesa(btn) {
  const fiscal = _fcFiscal;
  const fechaCobro = document.getElementById("fc-rem-fecha")?.value || _fcProximoCobro();
  const concepto = (document.getElementById("fc-rem-concepto")?.value || "").trim() || ("Cuota " + _fcPeriodo());
  const mandatos = {}; _fcMandatos.filter(m => m.estado === "activo").forEach(m => { mandatos[m.alumno_id] = m; });
  const recibos = _fcPagos.filter(p => p.estado === "pendiente" && !p.remesa_id && mandatos[p.alumno_id] && Number(p.importe) > 0);
  if (!recibos.length) { showToastGlobal("No hay recibos domiciliables", "info"); return; }

  const msgId = ("DID" + Date.now().toString(36) + Math.floor(Math.random() * 1e4)).toUpperCase().slice(0, 35);
  // El tipo de secuencia debe ser homogéneo dentro de cada bloque PmtInf
  const porSeq = { FRST: [], RCUR: [] };
  recibos.forEach((p, i) => {
    const m = mandatos[p.alumno_id];
    porSeq[m.tipo_secuencia === "RCUR" ? "RCUR" : "FRST"].push({
      pago: p, mandato: m, importe: Number(p.importe),
      concepto: p.concepto || concepto,
      e2e: (msgId + "-" + String(i + 1)).slice(0, 35),
    });
  });
  const bloques = Object.entries(porSeq).filter(([, l]) => l.length).map(([seq, lineas]) => ({ seq, lineas }));
  const total = recibos.reduce((s, p) => s + Number(p.importe || 0), 0);

  if (!confirm(`¿Generar remesa de ${recibos.length} recibo(s) por ${_fcEur(total)} con cargo el ${fechaCobro}?`)) return;
  if (btn) { btn.disabled = true; btn.textContent = "Generando…"; }
  try {
    const remesaBase = { msg_id: msgId, fecha_cobro: fechaCobro };
    const xml = _fcXmlRemesa(remesaBase, bloques, fiscal);

    const { data: rem, error: e1 } = await sb.from("remesas_sepa").insert({
      centro_id: ctrId, nombre: concepto, periodo: _fcPeriodo(), fecha_cobro: fechaCobro,
      msg_id: msgId, num_operaciones: recibos.length, importe_total: Math.round(total * 100) / 100,
      estado: "generada", xml,
      created_by: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
    }).select().single();
    if (e1) throw new Error(e1.message);

    const lineas = bloques.flatMap(b => b.lineas).map(l => ({
      centro_id: ctrId, remesa_id: rem.id, pago_id: l.pago.id, mandato_id: l.mandato.id,
      alumno_id: l.pago.alumno_id, importe: l.importe, e2e_id: l.e2e,
    }));
    const { error: e2 } = await sb.from("remesa_lineas").insert(lineas);
    if (e2) throw new Error(e2.message);

    // Marca los recibos y pasa los mandatos de primer adeudo a recurrente
    await sb.from("pagos").update({ remesa_id: rem.id, metodo: "domiciliacion" }).in("id", recibos.map(p => p.id)).eq("centro_id", ctrId);
    const primeros = bloques.find(b => b.seq === "FRST");
    if (primeros) {
      await sb.from("mandatos_sepa").update({ tipo_secuencia: "RCUR" })
        .in("id", [...new Set(primeros.lineas.map(l => l.mandato.id))]).eq("centro_id", ctrId);
    }

    _fcDescargarXml(xml, "remesa-" + fechaCobro + ".xml");
    showToastGlobal("Remesa generada · " + recibos.length + " recibo(s) · " + _fcEur(total), "success");
    await initFacturacion();
  } catch (e) {
    showToastGlobal("Error: " + (e.message || e), "error");
    if (btn) { btn.disabled = false; btn.textContent = "🏦 Generar remesa"; }
  }
}

function _fcDescargarXml(xml, nombre) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

async function _fcDescargarRemesa(id) {
  const r = _fcRemesas.find(x => x.id === id); if (!r) return;
  if (!r.xml) { showToastGlobal("Esta remesa no tiene XML guardado", "error"); return; }
  _fcDescargarXml(r.xml, "remesa-" + r.fecha_cobro + ".xml");
}

async function _fcMarcarCobrada(id) {
  const r = _fcRemesas.find(x => x.id === id); if (!r) return;
  if (!confirm(`¿Marcar la remesa del ${r.fecha_cobro} como cobrada? Se darán por pagados sus ${r.num_operaciones} recibo(s).`)) return;
  const { error: e1 } = await sb.from("remesas_sepa").update({ estado: "cobrada" }).eq("id", id).eq("centro_id", ctrId);
  if (e1) { showToastGlobal("Error: " + e1.message, "error"); return; }
  const { error: e2 } = await sb.from("pagos").update({ estado: "pagado", fecha: r.fecha_cobro }).eq("remesa_id", id).eq("centro_id", ctrId);
  if (e2) { showToastGlobal("Error al liquidar recibos: " + e2.message, "error"); return; }
  showToastGlobal("Remesa cobrada · " + r.num_operaciones + " recibo(s) liquidados", "success");
  await initFacturacion();
}

// ═══════════════════════ PAGO ONLINE (Stripe) ═══════════════════════
function _fcOnlineHtml() {
  const p = _fcPasarela || {};
  const activo = !!p.activo;
  const hook = `${SB_URL}/functions/v1/stripe-webhook`;
  return `
    <div class="fc-sec">Cobro con tarjeta
      <span class="fc-pill ${activo ? "fc-pill-ok" : "fc-pill-wait"}">${activo ? "activo" : p.configurada ? "configurado, en pausa" : "sin configurar"}</span></div>

    <div class="fc-note">El dinero entra <strong>directamente en tu cuenta de Stripe</strong>: DidactIA no es intermediario y no te cobra comisión por transacción (Stripe aplicará la suya). Las claves se guardan cifradas del lado del servidor y no vuelven a mostrarse: ni siquiera desde esta pantalla se pueden leer.</div>

    <div class="fc-form">
      <div class="fc-grid-2">
        <div><label class="fc-lbl">Clave secreta (sk_live_… o sk_test_…)</label><input class="fc-in" id="fc-s-secret" type="password" autocomplete="new-password" placeholder="${p.secret_pista ? _fcEsc(p.secret_pista) + " · déjalo vacío para conservarla" : "sk_live_…"}"></div>
        <div><label class="fc-lbl">Clave publicable (pk_…)</label><input class="fc-in" id="fc-s-public" placeholder="pk_live_…"></div>
        <div style="grid-column:span 2"><label class="fc-lbl">Secreto del webhook (whsec_…)</label><input class="fc-in" id="fc-s-hook" type="password" autocomplete="new-password" placeholder="${p.webhook_configurado ? "configurado · déjalo vacío para conservarlo" : "whsec_…"}"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:6px 0 12px">
        <input type="checkbox" id="fc-s-activo" ${activo ? "checked" : ""} style="width:auto;accent-color:var(--ink)">
        Aceptar pagos con tarjeta
      </label>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="fc-btn fc-btn-p" onclick="_fcGuardarPasarela(this)">Guardar configuración</button>
        <span class="fc-sub" id="fc-s-msg"></span>
      </div>
    </div>

    <div class="fc-sec">Cómo conectarlo</div>
    <div class="fc-form">
      <ol style="font-size:13px;line-height:1.75;margin:0;padding-left:20px;color:var(--txt2,#555)">
        <li>Entra en tu panel de Stripe → <strong>Desarrolladores → Claves de API</strong> y copia aquí la clave secreta y la publicable.</li>
        <li>En <strong>Desarrolladores → Webhooks</strong>, añade un endpoint apuntando a:<div class="fc-mono" style="margin:5px 0 3px;user-select:all">${_fcEsc(hook)}</div></li>
        <li>Suscríbelo a los eventos <span class="fc-mono">checkout.session.completed</span> y <span class="fc-mono">checkout.session.async_payment_succeeded</span>.</li>
        <li>Copia el secreto de firma que te da Stripe (<span class="fc-mono">whsec_…</span>) en el campo de arriba.</li>
      </ol>
      <div class="fc-sub" style="margin-top:10px">Con esto, cada recibo pendiente tendrá un enlace de pago en <strong>Cobros</strong> y las familias verán el botón <strong>Pagar</strong> en su portal. Al completarse el pago, el recibo se marca como cobrado solo.</div>
    </div>`;
}

async function _fcGuardarPasarela(btn) {
  const msg = document.getElementById("fc-s-msg");
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  const secret = val("fc-s-secret");
  if (secret && !/^sk_(live|test)_/.test(secret)) {
    if (msg) { msg.textContent = "La clave secreta de Stripe empieza por sk_live_ o sk_test_."; msg.style.color = "var(--danger)"; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  try {
    const { error } = await sb.rpc("guardar_pasarela", {
      p_centro: ctrId,
      p_secret: secret || null,
      p_public: val("fc-s-public") || null,
      p_webhook: val("fc-s-hook") || null,
      p_activo: !!document.getElementById("fc-s-activo")?.checked,
    });
    if (error) throw new Error(error.message);
    showToastGlobal("Configuración de cobro online guardada", "success");
    await initFacturacion();
  } catch (e) {
    if (msg) { msg.textContent = "Error: " + (e.message || e); msg.style.color = "var(--danger)"; }
    if (btn) { btn.disabled = false; btn.textContent = "Guardar configuración"; }
  }
}

// ═══════════════════════ DATOS FISCALES ═══════════════════════
function _fcFiscalHtml() {
  const f = _fcFiscal || {};
  const v = (k) => _fcEsc(f[k] == null ? "" : f[k]);
  return `
    <div class="fc-sec">Identificación fiscal</div>
    <div class="fc-form">
      <div class="fc-grid">
        <div style="grid-column:span 2"><label class="fc-lbl">Razón social *</label><input class="fc-in" id="fc-f-razon" value="${v("razon_social")}" placeholder="${_fcEsc(ctrName || "")}"></div>
        <div><label class="fc-lbl">NIF / CIF *</label><input class="fc-in" id="fc-f-nif" value="${v("nif")}" placeholder="B12345678"></div>
        <div style="grid-column:span 2"><label class="fc-lbl">Dirección</label><input class="fc-in" id="fc-f-dir" value="${v("direccion")}"></div>
        <div><label class="fc-lbl">Código postal</label><input class="fc-in" id="fc-f-cp" value="${v("cp")}"></div>
        <div><label class="fc-lbl">Ciudad</label><input class="fc-in" id="fc-f-ciudad" value="${v("ciudad")}"></div>
        <div><label class="fc-lbl">Provincia</label><input class="fc-in" id="fc-f-prov" value="${v("provincia")}"></div>
        <div><label class="fc-lbl">Email de facturación</label><input class="fc-in" id="fc-f-email" value="${v("email")}"></div>
      </div>
    </div>

    <div class="fc-sec">Numeración e IVA</div>
    <div class="fc-form">
      <div class="fc-grid">
        <div><label class="fc-lbl">Serie</label><input class="fc-in" id="fc-f-serie" value="${_fcEsc(f.serie_factura || "FA")}"></div>
        <div><label class="fc-lbl">Próximo número</label><input class="fc-in" id="fc-f-num" type="number" min="1" value="${_fcEsc(f.proximo_numero || 1)}" ${_fcFacturas.length ? "disabled" : ""}></div>
        <div><label class="fc-lbl">Tipo de IVA (%)</label><input class="fc-in" id="fc-f-iva" type="number" step="0.01" min="0" value="${_fcEsc(f.tipo_iva != null ? f.tipo_iva : 0)}"></div>
      </div>
      <div class="fc-sub">La enseñanza reglada está normalmente <strong>exenta de IVA</strong> (art. 20.Uno.9º LIVA): deja el tipo en 0 salvo que tu asesoría te indique lo contrario. ${_fcFacturas.length ? "El próximo número no se puede cambiar porque ya hay facturas emitidas: la numeración debe ser correlativa." : ""}</div>
      <div style="margin-top:10px"><label class="fc-lbl">Pie de factura (opcional)</label><input class="fc-in" id="fc-f-pie" value="${v("pie_factura")}" placeholder="Inscrita en el Registro Mercantil de…"></div>
    </div>

    <div class="fc-sec">Datos bancarios (para las remesas SEPA)</div>
    <div class="fc-form">
      <div class="fc-grid">
        <div style="grid-column:span 2"><label class="fc-lbl">IBAN de la academia</label><input class="fc-in" id="fc-f-iban" value="${_fcEsc(f.iban ? _fcIbanBonito(f.iban) : "")}" placeholder="ES91 2100 0418 4502 0005 1332"></div>
        <div><label class="fc-lbl">BIC / SWIFT (opcional)</label><input class="fc-in" id="fc-f-bic" value="${v("bic")}" placeholder="CAIXESBBXXX"></div>
        <div style="grid-column:span 2"><label class="fc-lbl">Identificador de acreedor SEPA</label><input class="fc-in" id="fc-f-acr" value="${v("sepa_acreedor_id")}" placeholder="ES12ZZZB12345678"></div>
      </div>
      <div class="fc-sub">El identificador de acreedor te lo facilita tu banco al contratar el servicio de adeudos directos. Sin él no puedes presentar remesas.</div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;margin-top:14px">
      <button class="fc-btn fc-btn-p" onclick="_fcGuardarFiscal(this)">Guardar datos fiscales</button>
      <span class="fc-sub" id="fc-f-msg"></span>
    </div>`;
}

async function _fcGuardarFiscal(btn) {
  const msg = document.getElementById("fc-f-msg");
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  const iban = _fcIban(val("fc-f-iban"));
  if (iban && !_fcIbanValido(iban)) {
    if (msg) { msg.textContent = "El IBAN no es válido."; msg.style.color = "var(--danger)"; }
    return;
  }
  const row = {
    centro_id: ctrId,
    razon_social: val("fc-f-razon") || null,
    nif: val("fc-f-nif").toUpperCase() || null,
    direccion: val("fc-f-dir") || null,
    cp: val("fc-f-cp") || null,
    ciudad: val("fc-f-ciudad") || null,
    provincia: val("fc-f-prov") || null,
    email: val("fc-f-email") || null,
    serie_factura: val("fc-f-serie") || "FA",
    tipo_iva: Number(val("fc-f-iva") || 0),
    pie_factura: val("fc-f-pie") || null,
    iban: iban || null,
    bic: val("fc-f-bic").toUpperCase() || null,
    sepa_acreedor_id: val("fc-f-acr").toUpperCase() || null,
    updated_at: new Date().toISOString(),
  };
  // El número solo es editable mientras no haya facturas emitidas
  if (!_fcFacturas.length) row.proximo_numero = Math.max(1, Number(val("fc-f-num") || 1));

  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  const { error } = await sb.from("datos_fiscales").upsert(row, { onConflict: "centro_id" });
  if (btn) { btn.disabled = false; btn.textContent = "Guardar datos fiscales"; }
  if (error) { if (msg) { msg.textContent = "Error: " + error.message; msg.style.color = "var(--danger)"; } return; }
  showToastGlobal("Datos fiscales guardados", "success");
  await initFacturacion();
}

window.initFacturacion = initFacturacion;
window._fcGo = _fcGo;
window._fcEmitir = _fcEmitir; window._fcFacturarTodos = _fcFacturarTodos; window._fcRectificar = _fcRectificar;
window._fcPdf = _fcPdf; window._fcExportarLibro = _fcExportarLibro;
window._fcToggleMandato = _fcToggleMandato; window._fcCrearMandato = _fcCrearMandato; window._fcRevocarMandato = _fcRevocarMandato;
window._fcGenerarRemesa = _fcGenerarRemesa; window._fcDescargarRemesa = _fcDescargarRemesa; window._fcMarcarCobrada = _fcMarcarCobrada;
window._fcGuardarFiscal = _fcGuardarFiscal; window._fcGuardarPasarela = _fcGuardarPasarela;
