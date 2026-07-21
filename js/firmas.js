// ── DOCUMENTOS Y FIRMA DIGITAL (Fase 10) ──
// Autorizaciones, RGPD, normas y hojas de matrícula firmadas por la familia
// desde el móvil con un enlace de un solo uso. Tab `firmas`, para no chocar con
// el `documentos` heredado del código de Centros.

let _fmTab = "envios";
let _fmPlantillas = [], _fmDocs = [], _fmAlumnos = [], _fmEditando = null, _fmEnviando = false;

const _fmTipos = [
  ["autorizacion", "Autorización"],
  ["rgpd", "Protección de datos"],
  ["normas", "Normas de la academia"],
  ["matricula", "Hoja de matrícula"],
  ["sepa", "Orden de domiciliación"],
  ["otro", "Otro"],
];

const _fmSemillas = [
  {
    titulo: "Autorización de uso de imagen",
    tipo: "autorizacion",
    cuerpo: `Yo, como padre/madre o tutor/a legal de {{alumno}}, autorizo a {{academia}} a captar y utilizar imágenes y vídeos en los que aparezca el alumno/a, tomados durante las actividades de la academia, con la finalidad de difundir su actividad educativa en la web, redes sociales y material informativo de la academia.

Esta autorización es voluntaria y puede revocarse en cualquier momento comunicándolo por escrito a la academia, sin efectos retroactivos sobre el material ya publicado.

Fecha: {{fecha}}`,
  },
  {
    titulo: "Información y consentimiento de protección de datos",
    tipo: "rgpd",
    cuerpo: `{{academia}} tratará los datos personales del alumno/a {{alumno}} y de sus responsables legales con la finalidad de gestionar la matrícula, el seguimiento académico, la comunicación con las familias y la facturación de los servicios contratados.

La base jurídica del tratamiento es la ejecución del contrato de servicios educativos y el consentimiento prestado. Los datos se conservarán mientras dure la relación y, después, durante los plazos legalmente exigidos. No se cederán a terceros salvo obligación legal.

Puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad dirigiéndose a la academia.

Fecha: {{fecha}}`,
  },
  {
    titulo: "Normas de funcionamiento y condiciones de baja",
    tipo: "normas",
    cuerpo: `Como responsable del alumno/a {{alumno}}, declaro conocer y aceptar las normas de funcionamiento de {{academia}}:

1. La cuota es mensual y se abona por adelantado dentro de los primeros días de cada mes, con independencia de las clases a las que se asista.
2. Las bajas deben comunicarse por escrito antes del día 25 del mes anterior; en caso contrario se girará la mensualidad siguiente.
3. Las faltas de asistencia no dan derecho a devolución ni a recuperación automática de la clase.
4. La academia podrá reorganizar grupos y horarios por necesidades pedagógicas, avisando con antelación.
5. Es obligatorio comunicar cualquier dato médico o necesidad específica relevante para la seguridad del alumno/a.

Fecha: {{fecha}}`,
  },
];

function _fmEsc(s) { return escH(s); }
function _fmHoy() { return new Date().toISOString().slice(0, 10); }
function _fmNombre(a) { return a ? ([a.nombre, a.apellidos].filter(Boolean).join(" ") || "(alumno)") : "—"; }
function _fmFecha(iso) { return iso ? new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
function _fmUrl(token) { return `${location.origin}/firmar.html?t=${encodeURIComponent(token)}`; }

// Token de 64 hex generado con el CSPRNG del navegador
function _fmToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

function _fmRellenar(cuerpo, alumno) {
  return String(cuerpo || "")
    .replace(/\{\{alumno\}\}/g, _fmNombre(alumno))
    .replace(/\{\{academia\}\}/g, ctrName || "la academia")
    .replace(/\{\{fecha\}\}/g, new Date().toLocaleDateString("es-ES"));
}

function _fmEnsureStyles() {
  if (document.getElementById("fm-styles")) return;
  const st = document.createElement("style"); st.id = "fm-styles";
  st.textContent = `
    #panel-firmas{padding:0!important;overflow-y:auto}
    .fm-wrap{padding:22px 26px;max-width:1000px}
    .fm-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .fm-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .fm-tabs{display:flex;gap:6px;margin:16px 0 4px;border-bottom:1px solid var(--line,var(--bdr))}
    .fm-tab{padding:8px 14px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--muted,var(--txt3));border-bottom:2px solid transparent;font-family:inherit}
    .fm-tab.on{color:var(--ink);border-bottom-color:var(--ink)}
    .fm-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .fm-kpi{background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));border-radius:12px;padding:13px 17px;min-width:132px}
    .fm-kpi-n{font-family:var(--font-display,serif);font-size:24px;font-weight:600}
    .fm-kpi-l{font-size:11px;color:var(--muted,var(--txt3))}
    .fm-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .fm-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px;background:var(--paper-2,var(--srf2));margin-bottom:14px}
    .fm-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:10px}
    .fm-in,.fm-sel,.fm-ta{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit;color:var(--txt,inherit)}
    .fm-ta{min-height:190px;resize:vertical;line-height:1.55;font-size:13px}
    .fm-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .fm-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
    .fm-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .fm-btn-sm{padding:4px 10px;font-size:12px}
    .fm-tbl{width:100%;border-collapse:collapse;font-size:13px}
    .fm-tbl th,.fm-tbl td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line,var(--bdr));vertical-align:middle}
    .fm-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,var(--txt3))}
    .fm-pill{font-size:11px;padding:2px 8px;border-radius:20px;display:inline-block}
    .fm-pill-ok{background:var(--success-soft,#e3f2ec);color:var(--success,#2e7d32)}
    .fm-pill-wait{background:var(--warning-soft,#fbf0dc);color:var(--warning,#b8860b)}
    .fm-pill-off{background:var(--danger-soft,#fae6e0);color:var(--danger,#c0392b)}
    .fm-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:6px 0}
    .fm-al{max-height:230px;overflow-y:auto;border:1px solid var(--line,var(--bdr));border-radius:8px;padding:8px;background:var(--srf)}
    .fm-al label{display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 4px;cursor:pointer}
    .fm-al input{accent-color:var(--ink)}
    .fm-card{border:1px solid var(--line,var(--bdr));border-radius:10px;padding:12px 14px;margin-bottom:9px;background:var(--srf)}
    .fm-card-t{font-weight:600;font-size:14px;margin-bottom:2px}
    .fm-prev{white-space:pre-wrap;font-size:12.5px;color:var(--txt2,#555);line-height:1.55;max-height:78px;overflow:hidden;position:relative}
    @media(max-width:700px){.fm-grid{grid-template-columns:1fr}.fm-wrap{padding:16px 14px}}
  `;
  document.head.appendChild(st);
}

async function initFirmas() {
  _fmEnsureStyles();
  const panel = document.getElementById("panel-firmas"); if (!panel) return;
  panel.innerHTML = `<div class="fm-wrap"><div class="fm-sub">Cargando…</div></div>`;
  const [pl, dc, al] = await Promise.all([
    sb.from("documentos_plantilla").select("*").eq("centro_id", ctrId).order("created_at"),
    sb.from("documentos_firma").select("*,alumnos(nombre,apellidos)").eq("centro_id", ctrId).order("created_at", { ascending: false }).limit(400),
    sb.from("alumnos").select("id,nombre,apellidos,estado").eq("centro_id", ctrId).eq("estado", "activo").order("nombre"),
  ]);
  _fmPlantillas = pl.data || []; _fmDocs = dc.data || []; _fmAlumnos = al.data || [];
  _fmRender();
}

function _fmRender() {
  const panel = document.getElementById("panel-firmas"); if (!panel) return;
  const tabs = [["envios", "Documentos enviados"], ["plantillas", "Plantillas"]];
  panel.innerHTML = `
    <div class="fm-wrap">
      <h1 class="fm-h">Documentos</h1>
      <div class="fm-sub">Autorizaciones y consentimientos firmados por la familia desde el móvil</div>
      <div class="fm-tabs">${tabs.map(([k, l]) => `<button class="fm-tab ${_fmTab === k ? "on" : ""}" onclick="_fmGo('${k}')">${l}</button>`).join("")}</div>
      ${_fmTab === "envios" ? _fmEnviosHtml() : _fmPlantillasHtml()}
    </div>`;
}
function _fmGo(t) { _fmTab = t; _fmEditando = null; _fmEnviando = false; _fmRender(); }

// ═══════════════════ ENVÍOS ═══════════════════
function _fmEnviosHtml() {
  const pend = _fmDocs.filter(d => d.estado === "pendiente");
  const firm = _fmDocs.filter(d => d.estado === "firmado");
  const caducados = pend.filter(d => new Date(d.expira_en) < new Date()).length;
  const pct = _fmDocs.length ? Math.round(firm.length / _fmDocs.length * 100) : 0;

  return `
    <div class="fm-kpis">
      <div class="fm-kpi"><div class="fm-kpi-n">${pend.length}</div><div class="fm-kpi-l">Pendientes de firma</div></div>
      <div class="fm-kpi"><div class="fm-kpi-n">${firm.length}</div><div class="fm-kpi-l">Firmados</div></div>
      <div class="fm-kpi"><div class="fm-kpi-n">${pct}%</div><div class="fm-kpi-l">Tasa de firma</div></div>
      ${caducados ? `<div class="fm-kpi"><div class="fm-kpi-n">${caducados}</div><div class="fm-kpi-l">Enlaces caducados</div></div>` : ""}
    </div>

    <div class="fm-sec">Enviar a firmar
      <button class="fm-btn fm-btn-p" onclick="_fmToggleEnviar()">${_fmEnviando ? "Cancelar" : "+ Enviar documento"}</button></div>

    ${_fmEnviando ? (_fmPlantillas.filter(p => p.activo).length ? `<div class="fm-form">
      <div class="fm-grid">
        <div><label class="fm-lbl">Plantilla</label><select class="fm-sel" id="fm-e-plantilla">${_fmPlantillas.filter(p => p.activo).map(p => `<option value="${p.id}">${_fmEsc(p.titulo)}</option>`).join("")}</select></div>
        <div><label class="fm-lbl">Validez del enlace</label><select class="fm-sel" id="fm-e-dias"><option value="15">15 días</option><option value="30" selected>30 días</option><option value="60">60 días</option></select></div>
      </div>
      <label class="fm-lbl">Alumnos <button class="fm-btn fm-btn-sm" style="margin-left:6px" onclick="_fmTodos(true)">Todos</button> <button class="fm-btn fm-btn-sm" onclick="_fmTodos(false)">Ninguno</button></label>
      <div class="fm-al" id="fm-e-alumnos">
        ${_fmAlumnos.length ? _fmAlumnos.map(a => `<label><input type="checkbox" value="${a.id}"> ${_fmEsc(_fmNombre(a))}</label>`).join("") : `<div class="fm-empty">No hay alumnos activos.</div>`}
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px">
        <button class="fm-btn fm-btn-p" onclick="_fmEnviar(this)">Generar enlaces de firma</button>
        <label style="display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--muted,var(--txt3))">
          <input type="checkbox" id="fm-e-email" checked style="accent-color:var(--ink)"> Avisar por email a las familias
        </label>
        <span class="fm-sub" id="fm-e-msg"></span>
      </div>
    </div>` : `<div class="fm-empty">Primero crea una plantilla en la pestaña <strong>Plantillas</strong>.</div>`) : ""}

    <div class="fm-sec">Historial</div>
    ${_fmDocs.length ? `<table class="fm-tbl"><thead><tr><th>Documento</th><th>Alumno</th><th>Enviado</th><th>Estado</th><th>Firmado por</th><th></th></tr></thead><tbody>
      ${_fmDocs.slice(0, 150).map(d => {
        const caducado = d.estado === "pendiente" && new Date(d.expira_en) < new Date();
        return `<tr>
        <td>${_fmEsc(d.titulo)}</td>
        <td>${_fmEsc(_fmNombre(d.alumnos))}</td>
        <td>${_fmEsc(String(d.created_at).slice(0, 10))}</td>
        <td><span class="fm-pill ${d.estado === "firmado" ? "fm-pill-ok" : caducado || d.estado === "anulado" ? "fm-pill-off" : "fm-pill-wait"}">${caducado ? "caducado" : _fmEsc(d.estado)}</span></td>
        <td>${d.firmante_nombre ? _fmEsc(d.firmante_nombre) + `<div class="fm-sub">${_fmEsc(_fmFecha(d.firmado_en))}</div>` : "—"}</td>
        <td style="white-space:nowrap">
          ${d.estado === "pendiente" ? `<button class="fm-btn fm-btn-sm" onclick="_fmCopiar('${escArg(d.token)}',this)">Copiar enlace</button>` : ""}
          ${d.estado === "firmado" ? `<button class="fm-btn fm-btn-sm" onclick="_fmPdf('${escArg(d.id)}')">PDF firmado</button>` : ""}
          ${d.estado === "pendiente" ? `<button class="fm-btn fm-btn-sm" onclick="_fmAnular('${escArg(d.id)}')">Anular</button>` : ""}
        </td></tr>`;
      }).join("")}
    </tbody></table>` : `<div class="fm-empty">Todavía no has enviado ningún documento a firmar.</div>`}`;
}

function _fmToggleEnviar() { _fmEnviando = !_fmEnviando; _fmRender(); }
function _fmTodos(v) {
  document.querySelectorAll("#fm-e-alumnos input[type=checkbox]").forEach(c => { c.checked = v; });
}

async function _fmEnviar(btn) {
  const msg = document.getElementById("fm-e-msg");
  const plantillaId = document.getElementById("fm-e-plantilla")?.value;
  const dias = Number(document.getElementById("fm-e-dias")?.value || 30);
  const avisar = !!document.getElementById("fm-e-email")?.checked;
  const ids = [...document.querySelectorAll("#fm-e-alumnos input[type=checkbox]:checked")].map(c => c.value);
  if (!plantillaId) return;
  if (!ids.length) { if (msg) { msg.textContent = "Selecciona al menos un alumno."; msg.style.color = "var(--danger)"; } return; }
  const plantilla = _fmPlantillas.find(p => p.id === plantillaId); if (!plantilla) return;

  if (btn) { btn.disabled = true; btn.textContent = "Generando…"; }
  const expira = new Date(Date.now() + dias * 86400000).toISOString();
  const uid = (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null;
  const filas = ids.map(id => {
    const alumno = _fmAlumnos.find(a => a.id === id);
    return {
      centro_id: ctrId, alumno_id: id, plantilla_id: plantilla.id,
      titulo: plantilla.titulo, cuerpo: _fmRellenar(plantilla.cuerpo, alumno),
      token: _fmToken(), estado: "pendiente", expira_en: expira, created_by: uid,
    };
  });
  const { data, error } = await sb.from("documentos_firma").insert(filas).select("id,token,alumno_id");
  if (error) {
    if (msg) { msg.textContent = "Error: " + error.message; msg.style.color = "var(--danger)"; }
    if (btn) { btn.disabled = false; btn.textContent = "Generar enlaces de firma"; }
    return;
  }

  let enviados = 0;
  if (avisar) {
    if (btn) btn.textContent = "Avisando a las familias…";
    // Reutiliza la cola de comunicaciones ya desplegada: un email por alumno,
    // que llega a las familias vinculadas a esa ficha.
    for (const d of (data || [])) {
      try {
        const alumno = _fmAlumnos.find(a => a.id === d.alumno_id);
        const { data: com, error: e1 } = await sb.from("comunicaciones").insert({
          centro_id: ctrId,
          titulo: plantilla.titulo + " · firma pendiente",
          cuerpo: `Hola:\n\nNecesitamos vuestra firma en el documento "${plantilla.titulo}"${alumno ? ` de ${_fmNombre(alumno)}` : ""}.\n\nSe firma desde el móvil en un minuto, en este enlace:\n${_fmUrl(d.token)}\n\nEl enlace caduca en ${dias} días.\n\nGracias.\n${ctrName || ""}`,
          destinatario: "alumno", destinatario_ref: d.alumno_id,
          canal: "email", estado: "pendiente", created_by: uid,
        }).select("id").single();
        if (e1) continue;
        await sb.functions.invoke("send-comunicacion", { body: { comunicacion_id: com.id } });
        enviados++;
      } catch (e) { /* seguimos con el resto */ }
    }
  }

  showToastGlobal(filas.length + " documento(s) generados" + (avisar ? ` · ${enviados} aviso(s) por email` : ""), "success");
  _fmEnviando = false;
  await initFirmas();
}

function _fmCopiar(token, btn) {
  const url = _fmUrl(token);
  if (!navigator.clipboard) { prompt("Copia el enlace:", url); return; }
  navigator.clipboard.writeText(url).then(() => {
    const t = btn.textContent; btn.textContent = "¡Copiado!";
    setTimeout(() => { btn.textContent = t; }, 1600);
  }).catch(() => prompt("Copia el enlace:", url));
}

async function _fmAnular(id) {
  if (!confirm("¿Anular este documento? El enlace dejará de funcionar.")) return;
  const { error } = await sb.from("documentos_firma").update({ estado: "anulado" }).eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  await initFirmas();
}

// PDF del documento firmado, con el trazo y la huella
function _fmPdf(id) {
  const d = _fmDocs.find(x => x.id === id); if (!d) return;
  if (!window.jspdf || !window.jspdf.jsPDF) { showToastGlobal("No se pudo cargar el generador PDF", "error"); return; }
  const doc = new window.jspdf.jsPDF();
  doc.setFont("helvetica", "normal");

  doc.setFontSize(16); doc.text(String(ctrName || "Academia"), 20, 20);
  doc.setFontSize(13); doc.text(String(d.titulo).slice(0, 70), 20, 32);
  doc.setDrawColor(200); doc.line(20, 36, 190, 36);

  doc.setFontSize(10.5); doc.setTextColor(40);
  const lineas = doc.splitTextToSize(String(d.cuerpo || ""), 170);
  let y = 46;
  lineas.forEach(l => {
    if (y > 215) { doc.addPage(); y = 22; }
    doc.text(l, 20, y); y += 5.6;
  });

  y = Math.min(Math.max(y + 12, 200), 218);
  doc.setDrawColor(210); doc.line(20, y, 95, y);
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text("Firma del responsable legal", 20, y + 5);
  doc.setTextColor(0); doc.setFontSize(10);
  doc.text(String(d.firmante_nombre || ""), 20, y + 12);
  if (d.firmante_nif) doc.text("NIF: " + String(d.firmante_nif), 20, y + 18);
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text("Firmado el " + _fmFecha(d.firmado_en), 20, y + 25);

  if (d.firma_img && String(d.firma_img).startsWith("data:image")) {
    try { doc.addImage(d.firma_img, "PNG", 118, y - 26, 62, 26); } catch (e) { /* firma ilegible: seguimos sin ella */ }
  }

  doc.setFontSize(7); doc.setTextColor(150);
  doc.text("Huella SHA-256 del documento firmado:", 20, 272);
  doc.text(String(d.hash || "—"), 20, 276);
  doc.text("Documento firmado electrónicamente y conservado por la academia. Generado por DidactIA Academias.", 20, 285);
  doc.save("firmado-" + String(d.titulo).slice(0, 30).replace(/[^\w\-]+/g, "-") + ".pdf");
}

// ═══════════════════ PLANTILLAS ═══════════════════
function _fmPlantillasHtml() {
  if (_fmEditando) {
    const p = _fmEditando;
    return `<div class="fm-sec">${p.id ? "Editar plantilla" : "Nueva plantilla"}</div>
      <div class="fm-form">
        <div class="fm-grid">
          <div><label class="fm-lbl">Título</label><input class="fm-in" id="fm-p-titulo" value="${_fmEsc(p.titulo || "")}"></div>
          <div><label class="fm-lbl">Tipo</label><select class="fm-sel" id="fm-p-tipo">${_fmTipos.map(([k, l]) => `<option value="${k}" ${p.tipo === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        </div>
        <label class="fm-lbl">Texto del documento</label>
        <textarea class="fm-ta" id="fm-p-cuerpo">${_fmEsc(p.cuerpo || "")}</textarea>
        <div class="fm-sub" style="margin-top:6px">Puedes usar <strong>{{alumno}}</strong>, <strong>{{academia}}</strong> y <strong>{{fecha}}</strong>: se sustituyen al enviar el documento.</div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px">
          <button class="fm-btn fm-btn-p" onclick="_fmGuardarPlantilla(this)">Guardar</button>
          <button class="fm-btn" onclick="_fmCancelar()">Cancelar</button>
          <span class="fm-sub" id="fm-p-msg"></span>
        </div>
      </div>`;
  }
  return `
    <div class="fm-sec">Plantillas
      <span style="display:flex;gap:8px">
        ${!_fmPlantillas.length ? `<button class="fm-btn" onclick="_fmSembrar(this)">Crear las 3 plantillas habituales</button>` : ""}
        <button class="fm-btn fm-btn-p" onclick="_fmNueva()">+ Nueva plantilla</button>
      </span></div>
    ${_fmPlantillas.length ? _fmPlantillas.map(p => `<div class="fm-card">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="fm-card-t">${_fmEsc(p.titulo)} ${!p.activo ? `<span class="fm-pill fm-pill-off">inactiva</span>` : ""}</div>
          <div class="fm-sub">${_fmEsc((_fmTipos.find(t => t[0] === p.tipo) || [, p.tipo])[1])}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="fm-btn fm-btn-sm" onclick="_fmEditar('${escArg(p.id)}')">Editar</button>
          <button class="fm-btn fm-btn-sm" onclick="_fmActivar('${escArg(p.id)}',${p.activo ? "false" : "true"})">${p.activo ? "Desactivar" : "Activar"}</button>
        </div>
      </div>
      <div class="fm-prev" style="margin-top:8px">${_fmEsc(String(p.cuerpo || "").slice(0, 320))}${String(p.cuerpo || "").length > 320 ? "…" : ""}</div>
    </div>`).join("") : `<div class="fm-empty">Sin plantillas. Crea las habituales de un tirón o añade la tuya.</div>`}
    <div class="fm-sub" style="margin-top:12px">Los textos que se crean son una base de trabajo, no asesoramiento jurídico: revísalos con tu asesoría antes de usarlos.</div>`;
}

function _fmNueva() { _fmEditando = { titulo: "", tipo: "autorizacion", cuerpo: "" }; _fmRender(); }
function _fmEditar(id) { _fmEditando = { ..._fmPlantillas.find(p => p.id === id) }; _fmRender(); }
function _fmCancelar() { _fmEditando = null; _fmRender(); }

async function _fmGuardarPlantilla(btn) {
  const msg = document.getElementById("fm-p-msg");
  const titulo = (document.getElementById("fm-p-titulo")?.value || "").trim();
  const cuerpo = (document.getElementById("fm-p-cuerpo")?.value || "").trim();
  if (!titulo || !cuerpo) { if (msg) { msg.textContent = "Título y texto son obligatorios."; msg.style.color = "var(--danger)"; } return; }
  const row = { centro_id: ctrId, titulo, tipo: document.getElementById("fm-p-tipo")?.value || "otro", cuerpo };
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  const { error } = _fmEditando.id
    ? await sb.from("documentos_plantilla").update(row).eq("id", _fmEditando.id).eq("centro_id", ctrId)
    : await sb.from("documentos_plantilla").insert({ ...row, created_by: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null });
  if (error) {
    if (msg) { msg.textContent = "Error: " + error.message; msg.style.color = "var(--danger)"; }
    if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
    return;
  }
  showToastGlobal("Plantilla guardada", "success");
  _fmEditando = null;
  await initFirmas();
}

async function _fmActivar(id, activo) {
  const { error } = await sb.from("documentos_plantilla").update({ activo }).eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  await initFirmas();
}

async function _fmSembrar(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Creando…"; }
  const uid = (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null;
  const { error } = await sb.from("documentos_plantilla").insert(_fmSemillas.map(s => ({ ...s, centro_id: ctrId, created_by: uid })));
  if (error) { showToastGlobal("Error: " + error.message, "error"); if (btn) btn.disabled = false; return; }
  showToastGlobal("Plantillas creadas · revísalas antes de enviarlas", "success");
  await initFirmas();
}

window.initFirmas = initFirmas;
window._fmGo = _fmGo; window._fmToggleEnviar = _fmToggleEnviar; window._fmTodos = _fmTodos; window._fmEnviar = _fmEnviar;
window._fmCopiar = _fmCopiar; window._fmAnular = _fmAnular; window._fmPdf = _fmPdf;
window._fmNueva = _fmNueva; window._fmEditar = _fmEditar; window._fmCancelar = _fmCancelar;
window._fmGuardarPlantilla = _fmGuardarPlantilla; window._fmActivar = _fmActivar; window._fmSembrar = _fmSembrar;
