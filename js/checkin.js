// ── CHECK-IN POR QR (Fase 11) ──
// Carnet con QR por alumno + pantalla de mostrador que lo lee con la cámara.
// Registra entrada/salida, marca la asistencia del grupo en curso y avisa si
// el alumno arrastra recibos pendientes.

let _ckAlumnos = [], _ckHoy = [], _ckStream = null, _ckRaf = null, _ckPausa = false;

function _ckEsc(s) { return escH(s); }
function _ckNombre(a) { return a ? ([a.nombre, a.apellidos].filter(Boolean).join(" ") || "(alumno)") : "—"; }
function _ckEur(n) { return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function _ckHora(h) { return String(h || "").slice(0, 5); }

function _ckEnsureStyles() {
  if (document.getElementById("ck-styles")) return;
  const st = document.createElement("style"); st.id = "ck-styles";
  st.textContent = `
    #panel-checkin{padding:0!important;overflow-y:auto}
    .ck-wrap{padding:22px 26px;max-width:960px}
    .ck-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .ck-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .ck-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .ck-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:132px}
    .ck-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .ck-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .ck-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .ck-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
    .ck-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .ck-btn-sm{padding:4px 10px;font-size:12px}
    .ck-btn-xl{padding:15px 28px;font-size:15.5px;border-radius:11px}
    .ck-tbl{width:100%;border-collapse:collapse;font-size:13px}
    .ck-tbl th,.ck-tbl td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line,var(--bdr))}
    .ck-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,var(--txt3))}
    .ck-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
    .ck-note{border:1px solid var(--line,var(--bdr));border-left:3px solid var(--info,#4D6FA8);border-radius:8px;padding:10px 13px;font-size:12.5px;color:var(--txt2,#555);background:var(--paper-2,var(--srf2));margin:10px 0}
    .ck-pill{font-size:11px;padding:2px 8px;border-radius:20px;display:inline-block;background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr))}

    /* Modo mostrador a pantalla completa */
    #ck-kiosco{position:fixed;inset:0;z-index:9998;background:#12141a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px;font-family:inherit}
    #ck-kiosco .k-top{position:absolute;top:18px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 22px}
    #ck-kiosco .k-marca{font-family:var(--font-display,serif);font-size:19px;opacity:.9}
    #ck-kiosco .k-cerrar{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:9px;padding:8px 15px;cursor:pointer;font-size:13.5px;font-weight:600;font-family:inherit}
    .k-cam{position:relative;width:min(420px,80vw);aspect-ratio:1;border-radius:22px;overflow:hidden;background:#000;box-shadow:0 20px 60px rgba(0,0,0,.5)}
    .k-cam video{width:100%;height:100%;object-fit:cover}
    .k-mira{position:absolute;inset:14%;border:3px solid rgba(255,255,255,.65);border-radius:16px;pointer-events:none}
    .k-msg{margin-top:24px;font-size:17px;opacity:.75;text-align:center;max-width:420px;line-height:1.5}
    .k-manual{margin-top:18px;display:flex;gap:8px}
    .k-manual input{padding:11px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-size:15px;font-family:ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;width:190px}
    .k-manual input::placeholder{color:rgba(255,255,255,.4);letter-spacing:normal;text-transform:none}
    .k-manual button{padding:11px 18px;border-radius:10px;border:none;background:#fff;color:#12141a;font-weight:600;cursor:pointer;font-family:inherit;font-size:14px}
    .k-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#12141a;padding:26px;text-align:center;animation:k-in .18s ease-out}
    @keyframes k-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
    .k-ic{width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:48px;margin-bottom:22px}
    .k-ok{background:rgba(46,139,122,.18);color:#4fd1b0}
    .k-no{background:rgba(192,57,43,.18);color:#ff8a7a}
    .k-warn{background:rgba(184,134,11,.2);color:#f0c04a}
    .k-nombre{font-family:var(--font-display,serif);font-size:36px;font-weight:600;margin-bottom:8px;line-height:1.2}
    .k-detalle{font-size:17px;opacity:.72;margin-bottom:6px}
    .k-deuda{margin-top:20px;background:rgba(192,57,43,.16);border:1px solid rgba(255,138,122,.35);color:#ff9c8c;border-radius:12px;padding:13px 20px;font-size:15.5px}
    @media(max-width:700px){.ck-wrap{padding:16px 14px}.k-nombre{font-size:28px}}
  `;
  document.head.appendChild(st);
}

async function initCheckin() {
  _ckEnsureStyles();
  const panel = document.getElementById("panel-checkin"); if (!panel) return;
  panel.innerHTML = `<div class="ck-wrap"><div class="ck-sub">Cargando…</div></div>`;
  const hoy = new Date().toISOString().slice(0, 10);
  const [al, ck] = await Promise.all([
    sb.from("alumnos").select("id,nombre,apellidos,estado,codigo_qr,nivel_educativo").eq("centro_id", ctrId).eq("estado", "activo").order("nombre"),
    sb.from("checkins").select("*,alumnos(nombre,apellidos)").eq("centro_id", ctrId).eq("fecha", hoy).order("hora", { ascending: false }),
  ]);
  _ckAlumnos = al.data || []; _ckHoy = ck.data || [];
  _ckRender();
}

function _ckRender() {
  const panel = document.getElementById("panel-checkin"); if (!panel) return;
  const sinCodigo = _ckAlumnos.filter(a => !a.codigo_qr).length;
  const entradas = _ckHoy.filter(c => c.tipo === "entrada");
  const dentro = entradas.length - _ckHoy.filter(c => c.tipo === "salida").length;

  panel.innerHTML = `
    <div class="ck-wrap">
      <h1 class="ck-h">Check-in</h1>
      <div class="ck-sub">Entrada por carnet QR, asistencia automática y aviso de recibos pendientes</div>

      <div class="ck-kpis">
        <div class="ck-kpi"><div class="ck-kpi-n">${entradas.length}</div><div class="ck-kpi-l">Entradas de hoy</div></div>
        <div class="ck-kpi"><div class="ck-kpi-n">${Math.max(0, dentro)}</div><div class="ck-kpi-l">Ahora en la academia</div></div>
        <div class="ck-kpi"><div class="ck-kpi-n">${_ckAlumnos.length - sinCodigo}</div><div class="ck-kpi-l">Carnets emitidos</div></div>
        ${sinCodigo ? `<div class="ck-kpi"><div class="ck-kpi-n">${sinCodigo}</div><div class="ck-kpi-l">Sin carnet</div></div>` : ""}
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0">
        <button class="ck-btn ck-btn-p ck-btn-xl" onclick="_ckAbrirKiosco()">📷 Abrir modo mostrador</button>
        ${sinCodigo ? `<button class="ck-btn ck-btn-xl" onclick="_ckGenerarCodigos(this)">Emitir ${sinCodigo} carnet(s)</button>` : ""}
        ${_ckAlumnos.length - sinCodigo ? `<button class="ck-btn ck-btn-xl" onclick="_ckCarnets()">🖨 Descargar carnets PDF</button>` : ""}
      </div>

      <div class="ck-note">Abre el modo mostrador en la tablet o el ordenador de recepción y deja la pantalla encendida: cada alumno acerca su carnet y queda registrado. Si tiene clase en ese momento, se le marca la asistencia automáticamente. La cámara necesita que la página se sirva por HTTPS.</div>

      <div class="ck-sec">Movimientos de hoy</div>
      ${_ckHoy.length ? `<table class="ck-tbl"><thead><tr><th>Hora</th><th>Alumno</th><th>Tipo</th><th>Origen</th></tr></thead><tbody>
        ${_ckHoy.map(c => `<tr>
          <td>${_ckEsc(_ckHora(c.hora))}</td>
          <td>${_ckEsc(_ckNombre(c.alumnos))}</td>
          <td><span class="ck-pill">${_ckEsc(c.tipo)}</span></td>
          <td class="ck-sub">${_ckEsc(c.origen)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="ck-empty">Todavía no hay movimientos hoy.</div>`}

      <div class="ck-sec">Carnets</div>
      ${_ckAlumnos.length ? `<table class="ck-tbl"><thead><tr><th>Alumno</th><th>Curso</th><th>Código</th></tr></thead><tbody>
        ${_ckAlumnos.slice(0, 100).map(a => `<tr>
          <td>${_ckEsc(_ckNombre(a))}</td>
          <td class="ck-sub">${_ckEsc(a.nivel_educativo || "—")}</td>
          <td style="font-family:ui-monospace,monospace;letter-spacing:.08em">${a.codigo_qr ? _ckEsc(a.codigo_qr) : `<span class="ck-sub">sin carnet</span>`}</td></tr>`).join("")}
      </tbody></table>` : `<div class="ck-empty">No hay alumnos activos.</div>`}
    </div>`;
}

async function _ckGenerarCodigos(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Emitiendo…"; }
  const { data, error } = await sb.rpc("generar_codigos_qr", { p_centro: ctrId });
  if (error) { showToastGlobal("Error: " + error.message, "error"); if (btn) btn.disabled = false; return; }
  showToastGlobal((data || 0) + " carnet(s) emitidos", "success");
  await initCheckin();
}

// ── Modo mostrador ─────────────────────────────────────────────────────────
function _ckAbrirKiosco() {
  if (document.getElementById("ck-kiosco")) return;
  const ov = document.createElement("div");
  ov.id = "ck-kiosco";
  ov.innerHTML = `
    <div class="k-top">
      <div class="k-marca">${_ckEsc(ctrName || "Academia")}</div>
      <button class="k-cerrar" onclick="_ckCerrarKiosco()">Salir</button>
    </div>
    <div class="k-cam" id="k-cam">
      <video id="k-video" playsinline muted></video>
      <div class="k-mira"></div>
    </div>
    <div class="k-msg" id="k-msg">Acerca el carnet al recuadro</div>
    <div class="k-manual">
      <input id="k-cod" placeholder="o escribe el código" maxlength="10" autocomplete="off">
      <button onclick="_ckManual()">Entrar</button>
    </div>`;
  document.body.appendChild(ov);
  document.getElementById("k-cod").addEventListener("keydown", (e) => { if (e.key === "Enter") _ckManual(); });
  _ckArrancarCamara();
}

function _ckCerrarKiosco() {
  if (_ckRaf) { cancelAnimationFrame(_ckRaf); _ckRaf = null; }
  if (_ckStream) { _ckStream.getTracks().forEach(t => t.stop()); _ckStream = null; }
  const ov = document.getElementById("ck-kiosco"); if (ov) ov.remove();
  _ckPausa = false;
  initCheckin();
}

async function _ckArrancarCamara() {
  const msg = document.getElementById("k-msg");
  if (typeof jsQR !== "function") {
    if (msg) msg.textContent = "No se ha podido cargar el lector de QR. Puedes escribir el código a mano.";
    return;
  }
  try {
    _ckStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch (e) {
    if (msg) msg.textContent = "No hemos podido abrir la cámara (" + (e.name || "error") + "). Puedes escribir el código a mano.";
    return;
  }
  const video = document.getElementById("k-video");
  if (!video) return;
  video.srcObject = _ckStream;
  await video.play().catch(() => {});

  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });

  const tick = () => {
    _ckRaf = requestAnimationFrame(tick);
    if (_ckPausa || video.readyState !== video.HAVE_ENOUGH_DATA) return;
    // Muestreamos a baja resolución: sobra para un QR y no calienta la tablet
    const ancho = 420;
    const alto = Math.round(video.videoHeight * (ancho / video.videoWidth)) || 420;
    lienzo.width = ancho; lienzo.height = alto;
    ctx.drawImage(video, 0, 0, ancho, alto);
    const img = ctx.getImageData(0, 0, ancho, alto);
    const res = jsQR(img.data, ancho, alto, { inversionAttempts: "dontInvert" });
    if (res && res.data) _ckProcesar(res.data.trim());
  };
  tick();
}

function _ckManual() {
  const i = document.getElementById("k-cod");
  const v = (i?.value || "").trim().toUpperCase();
  if (!v) return;
  if (i) i.value = "";
  _ckProcesar(v);
}

async function _ckProcesar(codigo) {
  if (_ckPausa) return;
  _ckPausa = true;
  // El QR del carnet lleva el código a secas, pero admitimos también una URL
  const limpio = (codigo.includes("/") ? codigo.split("/").pop() : codigo).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  try {
    const { data, error } = await sb.rpc("checkin_por_codigo", { p_codigo: limpio });
    if (error) throw new Error(error.message);
    if (!data || data.ok === false) { _ckTarjeta("no", "✕", "Carnet no reconocido", (data && data.error) || "Prueba de nuevo o escribe el código."); return; }
    const a = data.alumno || {};
    const entrada = data.tipo === "entrada";
    const deuda = Number(data.deuda || 0);
    _ckTarjeta(
      deuda > 0 ? "warn" : "ok",
      entrada ? "✓" : "→",
      a.nombre || "Alumno",
      [
        entrada ? "Entrada registrada" : "Salida registrada",
        data.grupo ? "Clase: " + data.grupo : "",
        data.asistencia_marcada ? "Asistencia marcada" : "",
      ].filter(Boolean).join(" · "),
      deuda > 0 ? `Tiene ${data.recibos_pendientes} recibo(s) pendiente(s) · ${_ckEur(deuda)}` : ""
    );
  } catch (e) {
    _ckTarjeta("no", "✕", "No se ha podido registrar", e.message || String(e));
  }
}

function _ckTarjeta(tipo, icono, titulo, detalle, aviso) {
  const cam = document.getElementById("k-cam"); if (!cam) { _ckPausa = false; return; }
  const el = document.createElement("div");
  el.className = "k-card";
  el.innerHTML = `
    <div class="k-ic k-${tipo}">${icono}</div>
    <div class="k-nombre">${_ckEsc(titulo)}</div>
    ${detalle ? `<div class="k-detalle">${_ckEsc(detalle)}</div>` : ""}
    ${aviso ? `<div class="k-deuda">${_ckEsc(aviso)}</div>` : ""}`;
  cam.appendChild(el);
  setTimeout(() => { el.remove(); _ckPausa = false; }, aviso ? 5000 : 2800);
}

// ── Carnets imprimibles ────────────────────────────────────────────────────
function _ckCarnets() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showToastGlobal("No se pudo cargar el generador PDF", "error"); return; }
  if (typeof qrcode !== "function") { showToastGlobal("No se pudo cargar el generador de QR", "error"); return; }
  const conCodigo = _ckAlumnos.filter(a => a.codigo_qr);
  if (!conCodigo.length) { showToastGlobal("Primero emite los carnets", "info"); return; }

  const doc = new window.jspdf.jsPDF();
  doc.setFont("helvetica", "normal");
  const W = 90, H = 52, COLS = 2, FILAS = 5, MX = 15, MY = 15, GX = 10, GY = 4;

  conCodigo.forEach((a, i) => {
    const enPagina = i % (COLS * FILAS);
    if (i && enPagina === 0) doc.addPage();
    const col = enPagina % COLS, fila = Math.floor(enPagina / COLS);
    const x = MX + col * (W + GX), y = MY + fila * (H + GY);

    doc.setDrawColor(205); doc.roundedRect(x, y, W, H, 3, 3);

    // QR con el código del carnet
    const qr = qrcode(0, "M");
    qr.addData(a.codigo_qr); qr.make();
    const n = qr.getModuleCount(), lado = 32, px = lado / n;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(x + 5 + c * px, y + 10 + r * px, px, px, "F");

    doc.setFontSize(8); doc.setTextColor(130);
    doc.text(String(ctrName || "Academia").slice(0, 40), x + 5, y + 7);

    doc.setTextColor(0); doc.setFontSize(12);
    const nombre = doc.splitTextToSize(_ckNombre(a), W - 48);
    doc.text(nombre.slice(0, 2), x + 42, y + 20);

    doc.setFontSize(8.5); doc.setTextColor(120);
    if (a.nivel_educativo) doc.text(String(a.nivel_educativo).slice(0, 24), x + 42, y + 32);
    doc.setFontSize(11); doc.setTextColor(40);
    doc.text(String(a.codigo_qr), x + 42, y + 42);
  });

  doc.save("carnets-" + new Date().toISOString().slice(0, 10) + ".pdf");
}

window.initCheckin = initCheckin;
window._ckAbrirKiosco = _ckAbrirKiosco; window._ckCerrarKiosco = _ckCerrarKiosco;
window._ckManual = _ckManual; window._ckGenerarCodigos = _ckGenerarCodigos; window._ckCarnets = _ckCarnets;
