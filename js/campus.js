// ── CAMPUS VIRTUAL (Fase 13) ──
// Material compartido con alumnos y familias: apuntes, exámenes resueltos,
// vídeos y enlaces, por grupo o para toda la academia. Almacenamiento en el
// bucket privado `recursos`; la descarga usa URLs firmadas de un minuto.
// Tab `campus` (el `recursos` heredado del código de Centros sigue libre).

let _cmpRecursos = [], _cmpGrupos = [], _cmpSubiendo = false, _cmpFiltro = "";

function _cmpEsc(s) { return escH(s); }
function _cmpPeso(b) {
  const n = Number(b || 0);
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function _cmpIcono(r) {
  if (r.tipo === "enlace") return "🔗";
  const m = String(r.mime || "");
  if (m.startsWith("image/")) return "🖼";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("audio/")) return "🎧";
  if (m.includes("pdf")) return "📕";
  if (m.includes("sheet") || m.includes("excel")) return "📊";
  if (m.includes("word") || m.includes("document")) return "📄";
  if (m.includes("zip") || m.includes("compressed")) return "🗜";
  return "📎";
}

function _cmpEnsureStyles() {
  if (document.getElementById("cmp-styles")) return;
  const st = document.createElement("style"); st.id = "cmp-styles";
  st.textContent = `
    #panel-campus{padding:0!important;overflow-y:auto}
    .cmp-wrap{padding:22px 26px;max-width:980px}
    .cmp-h{font-family:var(--font-display,serif);font-size:25px;margin:0 0 2px}
    .cmp-sub{font-size:12.5px;color:var(--muted,var(--txt3))}
    .cmp-sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:20px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .cmp-form{border:1px solid var(--line,var(--bdr));border-radius:12px;padding:14px;background:var(--paper-2,var(--srf2));margin-bottom:14px}
    .cmp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .cmp-in,.cmp-sel{padding:8px 11px;border:1px solid var(--line,var(--bdr));border-radius:8px;font-size:13px;background:var(--srf);width:100%;font-family:inherit;color:var(--txt,inherit)}
    .cmp-lbl{font-size:11px;font-weight:600;color:var(--muted,var(--txt3));text-transform:uppercase;display:block;margin-bottom:3px}
    .cmp-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--line,var(--bdr));background:var(--srf);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
    .cmp-btn-p{background:var(--ink);color:#fff;border-color:var(--ink)}
    .cmp-btn-sm{padding:4px 10px;font-size:12px}
    .cmp-drop{border:2px dashed var(--line,var(--bdr));border-radius:12px;padding:26px;text-align:center;color:var(--muted,var(--txt3));font-size:13.5px;cursor:pointer;transition:border-color .12s,background .12s}
    .cmp-drop.on{border-color:var(--ink);background:var(--paper-2,var(--srf2))}
    .cmp-item{display:flex;gap:12px;align-items:center;border:1px solid var(--line,var(--bdr));border-radius:10px;padding:11px 14px;margin-bottom:8px;background:var(--srf)}
    .cmp-ic{font-size:22px;line-height:1;flex-shrink:0}
    .cmp-it-n{font-weight:600;font-size:13.5px}
    .cmp-it-m{font-size:11.5px;color:var(--muted,var(--txt3));margin-top:1px}
    .cmp-tag{font-size:10.5px;padding:1px 8px;border-radius:20px;background:var(--paper-2,var(--srf2));border:1px solid var(--line,var(--bdr));color:var(--muted,var(--txt3))}
    .cmp-empty{font-size:12.5px;color:var(--muted,var(--txt3));padding:10px 0}
    .cmp-bar{height:5px;border-radius:5px;background:var(--paper-2,var(--srf2));overflow:hidden;margin-top:10px}
    .cmp-bar i{display:block;height:100%;background:var(--ink);width:0;transition:width .2s}
    @media(max-width:700px){.cmp-grid{grid-template-columns:1fr}.cmp-wrap{padding:16px 14px}}
  `;
  document.head.appendChild(st);
}

async function initCampus() {
  _cmpEnsureStyles();
  const panel = document.getElementById("panel-campus"); if (!panel) return;
  panel.innerHTML = `<div class="cmp-wrap"><div class="cmp-sub">Cargando…</div></div>`;
  const [re, gr] = await Promise.all([
    sb.from("recursos").select("*,grupos(nombre)").eq("centro_id", ctrId).order("created_at", { ascending: false }).limit(300),
    sb.from("grupos").select("id,nombre").eq("centro_id", ctrId).eq("activo", true).order("nombre"),
  ]);
  _cmpRecursos = re.data || []; _cmpGrupos = gr.data || [];
  _cmpRender();
}

function _cmpRender() {
  const panel = document.getElementById("panel-campus"); if (!panel) return;
  const q = _cmpFiltro.trim().toLowerCase();
  const vis = q ? _cmpRecursos.filter(r => (r.titulo + " " + (r.descripcion || "") + " " + (r.grupos?.nombre || "")).toLowerCase().includes(q)) : _cmpRecursos;
  const total = _cmpRecursos.reduce((s, r) => s + Number(r.tamano || 0), 0);

  panel.innerHTML = `
    <div class="cmp-wrap">
      <h1 class="cmp-h">Campus</h1>
      <div class="cmp-sub">Apuntes, exámenes resueltos, vídeos y enlaces para tus alumnos y sus familias</div>

      <div class="cmp-sec">
        <span>${_cmpRecursos.length} recurso(s) · ${_cmpPeso(total) || "0 KB"}</span>
        <span style="display:flex;gap:8px;align-items:center">
          <input class="cmp-in" style="width:210px" placeholder="Buscar…" value="${_cmpEsc(_cmpFiltro)}" oninput="_cmpBuscar(this.value)">
          <button class="cmp-btn cmp-btn-p" onclick="_cmpToggle()">${_cmpSubiendo ? "Cancelar" : "+ Añadir material"}</button>
        </span>
      </div>

      ${_cmpSubiendo ? `<div class="cmp-form">
        <div class="cmp-grid">
          <div style="grid-column:span 2"><label class="cmp-lbl">Título *</label><input class="cmp-in" id="cmp-titulo" placeholder="Tema 4 · Ecuaciones de segundo grado"></div>
          <div><label class="cmp-lbl">Grupo</label><select class="cmp-sel" id="cmp-grupo"><option value="">Toda la academia</option>${_cmpGrupos.map(g => `<option value="${g.id}">${_cmpEsc(g.nombre)}</option>`).join("")}</select></div>
          <div style="grid-column:span 3"><label class="cmp-lbl">Descripción</label><input class="cmp-in" id="cmp-desc" placeholder="Opcional"></div>
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:12px">
          <input type="checkbox" id="cmp-visible" checked style="width:auto;accent-color:var(--ink)"> Visible para las familias
        </label>

        <div class="cmp-drop" id="cmp-drop" onclick="document.getElementById('cmp-file').click()">
          Arrastra aquí un archivo o haz clic para elegirlo<br>
          <span style="font-size:12px">PDF, imágenes, vídeo, audio, Word, Excel… hasta 50 MB</span>
        </div>
        <input type="file" id="cmp-file" style="display:none" onchange="_cmpElegido(this)">
        <div id="cmp-elegido" class="cmp-sub" style="margin-top:8px"></div>
        <div class="cmp-bar" id="cmp-bar" style="display:none"><i></i></div>

        <div style="margin:14px 0 4px"><label class="cmp-lbl">…o pega un enlace (YouTube, Drive, un vídeo…)</label><input class="cmp-in" id="cmp-url" placeholder="https://…"></div>

        <div style="display:flex;gap:10px;align-items:center;margin-top:12px">
          <button class="cmp-btn cmp-btn-p" onclick="_cmpGuardar(this)">Publicar</button>
          <span class="cmp-sub" id="cmp-msg"></span>
        </div>
      </div>` : ""}

      <div id="cmp-lista">
        ${vis.length ? vis.map(r => `<div class="cmp-item">
          <div class="cmp-ic">${_cmpIcono(r)}</div>
          <div style="flex:1;min-width:0">
            <div class="cmp-it-n">${_cmpEsc(r.titulo)}</div>
            <div class="cmp-it-m">${[r.descripcion, String(r.created_at).slice(0, 10), _cmpPeso(r.tamano)].filter(Boolean).map(_cmpEsc).join(" · ")}</div>
          </div>
          <span class="cmp-tag">${_cmpEsc(r.grupos?.nombre || "Toda la academia")}</span>
          ${!r.visible_familias ? `<span class="cmp-tag">solo interno</span>` : ""}
          <button class="cmp-btn cmp-btn-sm" onclick="_cmpAbrir('${escArg(r.id)}',this)">Abrir</button>
          <button class="cmp-btn cmp-btn-sm" onclick="_cmpBorrar('${escArg(r.id)}')">Borrar</button>
        </div>`).join("") : `<div class="cmp-empty">${_cmpRecursos.length ? "Ningún recurso coincide con la búsqueda." : "Todavía no has subido material. El primero puede ser el temario del trimestre."}</div>`}
      </div>
    </div>`;

  const drop = document.getElementById("cmp-drop");
  if (drop) {
    ["dragenter", "dragover"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add("on"); }));
    ["dragleave", "drop"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove("on"); }));
    drop.addEventListener("drop", ev => {
      const f = ev.dataTransfer?.files?.[0];
      if (!f) return;
      const input = document.getElementById("cmp-file");
      const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
      _cmpElegido(input);
    });
  }
}

function _cmpToggle() { _cmpSubiendo = !_cmpSubiendo; _cmpRender(); }
function _cmpBuscar(v) {
  _cmpFiltro = v;
  clearTimeout(window._cmpT);
  window._cmpT = setTimeout(() => {
    const lista = document.getElementById("cmp-lista");
    if (!lista) return;
    _cmpRender();
    const i = document.querySelector('#panel-campus .cmp-in[placeholder="Buscar…"]');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }, 250);
}

function _cmpElegido(input) {
  const f = input.files?.[0];
  const el = document.getElementById("cmp-elegido");
  if (!el) return;
  if (!f) { el.textContent = ""; return; }
  el.textContent = f.name + " · " + _cmpPeso(f.size);
  const tit = document.getElementById("cmp-titulo");
  if (tit && !tit.value) tit.value = f.name.replace(/\.[^.]+$/, "");
}

async function _cmpGuardar(btn) {
  const msg = document.getElementById("cmp-msg");
  const err = (t) => { if (msg) { msg.textContent = t; msg.style.color = "var(--danger)"; } };
  const titulo = (document.getElementById("cmp-titulo")?.value || "").trim();
  const url = (document.getElementById("cmp-url")?.value || "").trim();
  const file = document.getElementById("cmp-file")?.files?.[0] || null;
  if (!titulo) return err("Pon un título.");
  if (!file && !url) return err("Sube un archivo o pega un enlace.");
  if (file && file.size > 50 * 1024 * 1024) return err("El archivo pasa de 50 MB. Súbelo a Drive y pega el enlace.");

  if (btn) { btn.disabled = true; btn.textContent = "Publicando…"; }
  try {
    const fila = {
      centro_id: ctrId,
      grupo_id: document.getElementById("cmp-grupo")?.value || null,
      titulo,
      descripcion: (document.getElementById("cmp-desc")?.value || "").trim() || null,
      visible_familias: !!document.getElementById("cmp-visible")?.checked,
      subido_por: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null,
    };

    if (file) {
      const barra = document.getElementById("cmp-bar");
      if (barra) { barra.style.display = ""; barra.firstElementChild.style.width = "35%"; }
      // Nombre seguro: la primera carpeta debe ser el centro (lo exige la policy)
      const limpio = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");
      const ruta = `${ctrId}/${Date.now()}-${limpio}`;
      const { error: e1 } = await sb.storage.from("recursos").upload(ruta, file, { contentType: file.type || undefined, upsert: false });
      if (e1) throw new Error(e1.message);
      if (barra) barra.firstElementChild.style.width = "85%";
      Object.assign(fila, { tipo: "archivo", path: ruta, mime: file.type || null, tamano: file.size });
    } else {
      Object.assign(fila, { tipo: "enlace", url });
    }

    const { error } = await sb.from("recursos").insert(fila);
    if (error) throw new Error(error.message);
    showToastGlobal("Material publicado", "success");
    _cmpSubiendo = false;
    await initCampus();
  } catch (e) {
    err("Error: " + (e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = "Publicar"; }
  }
}

async function _cmpAbrir(id, btn) {
  const r = _cmpRecursos.find(x => x.id === id); if (!r) return;
  if (r.tipo === "enlace" && r.url) { window.open(r.url, "_blank", "noopener"); return; }
  if (!r.path) { showToastGlobal("Este recurso no tiene archivo", "error"); return; }
  const orig = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    const { data, error } = await sb.storage.from("recursos").createSignedUrl(r.path, 60);
    if (error) throw new Error(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  } catch (e) {
    showToastGlobal("No se ha podido abrir: " + (e.message || e), "error");
  } finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}

async function _cmpBorrar(id) {
  const r = _cmpRecursos.find(x => x.id === id); if (!r) return;
  if (!confirm(`¿Borrar "${r.titulo}"? Dejará de estar disponible para alumnos y familias.`)) return;
  if (r.path) await sb.storage.from("recursos").remove([r.path]);
  const { error } = await sb.from("recursos").delete().eq("id", id).eq("centro_id", ctrId);
  if (error) { showToastGlobal("Error: " + error.message, "error"); return; }
  showToastGlobal("Recurso borrado", "success");
  await initCampus();
}

window.initCampus = initCampus;
window._cmpToggle = _cmpToggle; window._cmpBuscar = _cmpBuscar; window._cmpElegido = _cmpElegido;
window._cmpGuardar = _cmpGuardar; window._cmpAbrir = _cmpAbrir; window._cmpBorrar = _cmpBorrar;
