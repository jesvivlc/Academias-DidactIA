// ── USERS PANEL ──
let _usersData = [];
let _centrosData = [];
let _usersFiltroRol = "";
let _editingProfile = null;
let _editingAlumnoIds = new Set();
let _invAlumnosSeleccionados = new Set();
let _usersBusqueda = "";

// Escape single quotes for inline onclick attrs
function _esc(s) { return (s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

async function loadUsersPanel() {
  const isSuperadmin = role === "superadmin";
  document.getElementById("centros-modulos-card").style.display = isSuperadmin ? "block" : "none";
  const filterSel = document.getElementById("filter-centro");
  if (filterSel) filterSel.style.display = isSuperadmin ? "inline-block" : "none";

  if (isSuperadmin) {
    const { data: centros } = await sb.from("centros").select("id,nombre,modulos_activos").order("nombre");
    _centrosData = centros || [];
    filterSel.innerHTML = "<option value=''>Todos los centros</option>" +
      _centrosData.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
    renderModulosLista(_centrosData);
  } else {
    _centrosData = [];
  }
  await loadUsers();
}

async function loadUsers() {
  const container = document.getElementById("users-list");
  container.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;"><span class="spin">⟳</span> Cargando…</div>';
  _usersBusqueda = (document.getElementById("users-search")?.value || "").toLowerCase();
  const filterCentro = document.getElementById("filter-centro")?.value || null;

  const { data, error } = await sb.rpc("get_users_with_auth", { p_centro_id: filterCentro || null });
  if (error) {
    container.innerHTML = `<div style="text-align:center;color:var(--red);font-size:13px;padding:16px;">Error: ${error.message}</div>`;
    return;
  }
  _usersData = data || [];
  renderUserCounters();
  renderUserFilters();
  renderUsersTable();
}

function renderUserCounters() {
  const total = _usersData.length;
  const prof  = _usersData.filter(u => u.rol === "profesional").length;
  const fam   = _usersData.filter(u => u.rol === "familia").length;
  const adm   = _usersData.filter(u => u.rol === "admin" || u.rol === "superadmin").length;
  const el = document.getElementById("users-counters");
  if (el) el.textContent = `${total} usuarios · ${prof} profesionales · ${fam} familias · ${adm} admins`;
}

function renderUserFilters() {
  const roles = [
    { key: "", label: "Todos" },
    { key: "familia", label: "👨‍👩‍👧 Familia" },
    { key: "profesional", label: "👩‍🏫 Profesional" },
    { key: "admin", label: "⚙️ Admin" },
    { key: "superadmin", label: "🔑 Superadmin" },
  ];
  const el = document.getElementById("users-filtros-rol");
  if (!el) return;
  el.innerHTML = roles.map(r => {
    const on = _usersFiltroRol === r.key;
    return `<button onclick="filtrarUsuariosPorRol('${r.key}')" style="background:${on ? "var(--ink)" : "var(--srf2)"};color:${on ? "#fff" : "var(--txt2)"};border:1px solid ${on ? "var(--ink)" : "var(--bdr)"};border-radius:20px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:${on ? 600 : 400};">${r.label}</button>`;
  }).join("");
}

function filtrarUsuariosPorRol(rol) {
  _usersFiltroRol = rol;
  renderUserFilters();
  renderUsersTable();
}

function buscarUsuarios(q) {
  _usersBusqueda = q.toLowerCase();
  renderUsersTable();
}

function renderUsersTable() {
  const container = document.getElementById("users-list");
  const isSuperadmin = role === "superadmin";

  let filtered = _usersData;
  if (_usersFiltroRol) filtered = filtered.filter(u => u.rol === _usersFiltroRol);
  if (_usersBusqueda)  filtered = filtered.filter(u =>
    (u.full_name || "").toLowerCase().includes(_usersBusqueda) ||
    (u.email || "").toLowerCase().includes(_usersBusqueda)
  );

  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:20px;">No hay usuarios que coincidan.</div>';
    return;
  }

  const ROL_BADGE = {
    familia:    { bg: "#e8f5e9", color: "#2e7d32", label: "Familia" },
    profesional:{ bg: "#e3f2fd", color: "#1565c0", label: "Profesional" },
    admin:      { bg: "#fff3e0", color: "#e65100", label: "Admin" },
    superadmin: { bg: "#fce4ec", color: "#c62828", label: "Superadmin" },
  };

  function rolBadge(u) {
    const rb = ROL_BADGE[u.rol] || ROL_BADGE.familia;
    return `<span style="background:${rb.bg};color:${rb.color};border-radius:12px;padding:2px 9px;font-size:11px;font-weight:500;">${rb.label}</span>`;
  }

  function statusBadge(u) {
    if (!u.email_confirmed_at)
      return '<span style="background:#fff9c4;color:#f57f17;border-radius:12px;padding:2px 9px;font-size:11px;font-weight:500;">Pendiente</span>';
    if (u.activo === false)
      return '<span style="background:#f5f5f5;color:#757575;border-radius:12px;padding:2px 9px;font-size:11px;font-weight:500;">Inactivo</span>';
    return '<span style="background:#e8f5e9;color:#2e7d32;border-radius:12px;padding:2px 9px;font-size:11px;font-weight:500;">Activo</span>';
  }

  function lastAccess(u) {
    if (!u.last_sign_in_at) return "Nunca";
    return new Date(u.last_sign_in_at).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  const BTN = "background:none;border:1px solid var(--bdr);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;";

  const rows = filtered.map(u => {
    const isSelf = u.user_id === currentUser?.id;
    const name   = _esc(u.full_name || u.email);
    const email  = _esc(u.email);

    const editBtn   = `<button title="Editar" onclick="mostrarModalEditar('${u.id}')" style="${BTN}color:var(--txt2);">✏️</button>`;
    const resendBtn = !u.email_confirmed_at
      ? `<button title="Reenviar invitación" onclick="reenviarInvitacion('${email}','${name}','${u.centro_id}','${u.rol}')" style="${BTN}color:var(--txt2);">📧</button>`
      : "";
    const toggleBtn = isSelf ? "" : (
      u.activo !== false
        ? `<button title="Desactivar" onclick="desactivarUsuario('${u.id}','${name}')" style="${BTN}color:var(--txt2);">⏸</button>`
        : `<button title="Reactivar"  onclick="reactivarUsuario('${u.id}')"             style="${BTN}color:var(--txt2);">▶</button>`
    );
    // Eliminar solo usuarios pendientes (sin sesión activa en auth.users)
    const delBtn = isSelf || u.email_confirmed_at ? ""
      : `<button title="Eliminar invitación pendiente" onclick="deleteUser('${u.id}','${name}')" style="${BTN}color:var(--red);">🗑️</button>`;

    const centroCel = isSuperadmin ? `<td style="font-size:12px;color:var(--txt3);">${u.centro_nombre || "—"}</td>` : "";

    return `<tr>
      <td style="font-weight:500;">${u.full_name || "—"}</td>
      <td style="font-size:12px;color:var(--txt3);">${u.email || "—"}</td>
      ${centroCel}
      <td>${rolBadge(u)}</td>
      <td>${statusBadge(u)}</td>
      <td style="font-size:12px;color:var(--txt3);">${lastAccess(u)}</td>
      <td><div style="display:flex;gap:4px;">${editBtn}${resendBtn}${toggleBtn}${delBtn}</div></td>
    </tr>`;
  }).join("");

  const centroTh = isSuperadmin ? "<th>Centro</th>" : "";
  container.innerHTML = `<div style="overflow-x:auto;"><table class="tbl">
    <thead><tr><th>Nombre</th><th>Email</th>${centroTh}<th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── MÓDULOS POR CENTRO ──
function renderModulosLista(centros) {
  const MODULOS = [
    { key: "comedor",   label: "🍽️ Comedor" },
    { key: "espacios",  label: "🏫 Espacios" },
    { key: "incidencias", label: "⚠️ Incidencias" },
  ];
  const container = document.getElementById("centros-modulos-list");
  if (!container) return;
  container.innerHTML = centros.map(c => {
    const activos = c.modulos_activos || [];
    const toggles = MODULOS.map(m => {
      const on = activos.includes(m.key);
      return `<div class="toggle-wrap" onclick="toggleModulo('${c.id}','${m.key}',${!on},this)">` +
        `<div class="${on ? "toggle-track on" : "toggle-track"}"><div class="toggle-thumb"></div></div>` +
        `<span style="font-size:13px;color:var(--txt2);">${m.label}</span></div>`;
    }).join("");
    return `<div style="padding:14px 0;border-bottom:1px solid var(--bdr);">` +
      `<div style="font-size:14px;font-weight:600;color:var(--txt);margin-bottom:10px;">${c.nombre}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:16px;">${toggles}</div></div>`;
  }).join("");
}

async function toggleModulo(centroId, modulo, activate, el) {
  el.querySelector(".toggle-track").classList.toggle("on", activate);
  const { data: centro } = await sb.from("centros").select("modulos_activos").eq("id", centroId).single();
  let modulos = centro?.modulos_activos || [];
  modulos = activate
    ? (modulos.includes(modulo) ? modulos : [...modulos, modulo])
    : modulos.filter(m => m !== modulo);
  await sb.from("centros").update({ modulos_activos: modulos }).eq("id", centroId);
  if (centroId === ctrId) {
    modulosActivos = modulos;
    ["comedor","espacios"].forEach(k => {
      const t = document.getElementById("tab-" + k);
      if (t) t.style.display = modulosActivos.includes(k) ? "block" : "none";
    });
  }
}

// ── MODAL INVITAR ──
async function mostrarModalInvitar() {
  const modal = document.getElementById("modal-invitar");
  if (!modal) return;

  // Reset
  document.getElementById("inv-name").value = "";
  document.getElementById("inv-email").value = "";
  document.getElementById("inv-status").style.display = "none";
  document.getElementById("inv-alumnos-wrap").style.display = "none";
  document.getElementById("inv-alumnos-lista").innerHTML = "";
  _invAlumnosSeleccionados = new Set();

  const invCentroSel  = document.getElementById("inv-centro");
  const invCentroWrap = document.getElementById("inv-centro-wrap");
  const invRolSel     = document.getElementById("inv-rol");
  invCentroSel.disabled = false;

  if (role === "superadmin") {
    invCentroSel.innerHTML = "<option value=''>Selecciona un centro…</option>" +
      _centrosData.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
    invCentroWrap.style.display = "block";
    invRolSel.innerHTML = `
      <option value="familia">👨‍👩‍👧 Familia</option>
      <option value="profesional">👩‍🏫 Profesional</option>
      <option value="admin">⚙️ Administrador</option>
      <option value="superadmin">🔑 Superadmin</option>`;
  } else {
    // Admin: lock to own centro, no superadmin option
    invCentroSel.innerHTML = `<option value="${ctrId}">${ctrName}</option>`;
    invCentroSel.disabled = true;
    invCentroWrap.style.display = "block";
    invRolSel.innerHTML = `
      <option value="familia">👨‍👩‍👧 Familia</option>
      <option value="profesional">👩‍🏫 Profesional</option>
      <option value="admin">⚙️ Administrador</option>`;
    // Pre-load alumnos since centro is fixed and familia is default
    document.getElementById("inv-alumnos-wrap").style.display = "block";
    await cargarAlumnosCentroInv();
  }

  invRolSel.value = "familia";
  if (role === "admin") {
    document.getElementById("inv-alumnos-wrap").style.display = "block";
  }

  modal.style.display = "flex";
}

function cerrarModalInvitar() {
  const modal = document.getElementById("modal-invitar");
  if (modal) modal.style.display = "none";
  document.getElementById("inv-centro").disabled = false;
}

function onInvRolChange() {
  const rol  = document.getElementById("inv-rol").value;
  const wrap = document.getElementById("inv-alumnos-wrap");
  if (wrap) wrap.style.display = rol === "familia" ? "block" : "none";
}

async function cargarAlumnosCentroInv() {
  const centroId = document.getElementById("inv-centro").value;
  const lista    = document.getElementById("inv-alumnos-lista");
  if (!lista) return;
  if (!centroId) {
    lista.innerHTML = '<div style="font-size:12px;color:var(--txt3);">Selecciona un centro primero.</div>';
    return;
  }
  lista.innerHTML = '<div style="font-size:12px;color:var(--txt3);">Cargando…</div>';
  const { data: alumnos } = await sb.from("alumnos").select("id,nombre,curso")
    .eq("centro_id", centroId).order("curso").order("nombre");
  _invAlumnosSeleccionados = new Set();
  if (!alumnos?.length) {
    lista.innerHTML = '<div style="font-size:12px;color:var(--txt3);">No hay alumnos en este centro.</div>';
    return;
  }
  lista.innerHTML = alumnos.map(a => `
    <div id="inv-al-${a.id}" onclick="toggleInvAlumno('${a.id}')" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;background:var(--srf2);">
      <div id="inv-chk-${a.id}" style="width:16px;height:16px;border-radius:4px;border:2px solid var(--bdr);background:var(--srf);display:flex;align-items:center;justify-content:center;font-size:10px;color:transparent;">✓</div>
      <div style="font-size:13px;">${a.nombre} <span style="color:var(--txt3);font-size:12px;">${a.curso || ""}</span></div>
    </div>`).join("");
}

function toggleInvAlumno(id) {
  const chk  = document.getElementById("inv-chk-" + id);
  const card = document.getElementById("inv-al-"  + id);
  if (_invAlumnosSeleccionados.has(id)) {
    _invAlumnosSeleccionados.delete(id);
    if (chk)  { chk.style.background = "var(--srf)"; chk.style.borderColor = "var(--bdr)"; chk.style.color = "transparent"; }
    if (card) card.style.background = "var(--srf2)";
  } else {
    _invAlumnosSeleccionados.add(id);
    if (chk)  { chk.style.background = "var(--ink)"; chk.style.borderColor = "var(--ink)"; chk.style.color = "#fff"; }
    if (card) card.style.background = "var(--ink-ll)";
  }
}

async function inviteUser() {
  const name     = document.getElementById("inv-name").value.trim();
  const email    = document.getElementById("inv-email").value.trim();
  const centroId = document.getElementById("inv-centro").value;
  const rol      = document.getElementById("inv-rol").value;
  const status   = document.getElementById("inv-status");

  if (!name || !email || !centroId) {
    status.textContent = "Rellena todos los campos obligatorios.";
    status.style.background = "var(--red-l)"; status.style.color = "var(--red)";
    status.style.display = "block"; return;
  }

  status.textContent = "⟳ Enviando invitación…";
  status.style.background = "var(--srf2)"; status.style.color = "var(--txt2)";
  status.style.display = "block";

  try {
    const res = await fetch(`${SB_URL}/functions/v1/invite-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
      body: JSON.stringify({ email, full_name: name, centro_id: centroId, rol, caller_user_id: currentUser.id })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Link alumnos if familia and selection exists
    if (rol === "familia" && _invAlumnosSeleccionados.size > 0 && data.user_id) {
      const links = [..._invAlumnosSeleccionados].map(aid => ({ profile_id: data.user_id, alumno_id: aid }));
      await sb.from("familia_alumno").insert(links);
    }

    status.textContent = `✅ Invitación enviada a ${email}`;
    status.style.background = "var(--ink-ll)"; status.style.color = "var(--ink)";
    document.getElementById("inv-name").value = "";
    document.getElementById("inv-email").value = "";
    _invAlumnosSeleccionados = new Set();
    await loadUsers();
  } catch(e) {
    status.textContent = "Error: " + e.message;
    status.style.background = "#fde8e8"; status.style.color = "var(--red)";
  }
}

// ── MODAL EDITAR ──
async function mostrarModalEditar(profileId) {
  _editingProfile = _usersData.find(u => u.id === profileId) || null;
  if (!_editingProfile) return;
  _editingAlumnoIds = new Set();

  document.getElementById("edit-name").value = _editingProfile.full_name || "";
  document.getElementById("edit-status").style.display = "none";

  const editRolSel = document.getElementById("edit-rol");
  const isSelf = _editingProfile.user_id === currentUser?.id;

  // Build role options: admin cannot assign superadmin; self cannot change own role
  if (role === "admin") {
    editRolSel.innerHTML = `
      <option value="familia">👨‍👩‍👧 Familia</option>
      <option value="profesional">👩‍🏫 Profesional</option>
      <option value="admin">⚙️ Administrador</option>`;
  } else {
    editRolSel.innerHTML = `
      <option value="familia">👨‍👩‍👧 Familia</option>
      <option value="profesional">👩‍🏫 Profesional</option>
      <option value="admin">⚙️ Administrador</option>
      <option value="superadmin">🔑 Superadmin</option>`;
  }
  editRolSel.value    = _editingProfile.rol;
  editRolSel.disabled = isSelf;

  const editAlumnosWrap = document.getElementById("edit-alumnos-wrap");
  if (_editingProfile.rol === "familia") {
    editAlumnosWrap.style.display = "block";
    await cargarAlumnosEditar();
  } else {
    editAlumnosWrap.style.display = "none";
  }

  document.getElementById("modal-editar").style.display = "flex";
}

function cerrarModalEditar() {
  document.getElementById("modal-editar").style.display = "none";
  const editRolSel = document.getElementById("edit-rol");
  if (editRolSel) editRolSel.disabled = false;
  _editingProfile = null;
}

function onEditRolChange() {
  const rol  = document.getElementById("edit-rol").value;
  const wrap = document.getElementById("edit-alumnos-wrap");
  if (!wrap) return;
  if (rol === "familia") {
    wrap.style.display = "block";
    cargarAlumnosEditar();
  } else {
    wrap.style.display = "none";
  }
}

async function cargarAlumnosEditar() {
  if (!_editingProfile) return;
  const lista = document.getElementById("edit-alumnos-lista");
  if (!lista) return;
  lista.innerHTML = '<div style="font-size:12px;color:var(--txt3);">Cargando…</div>';

  const [{ data: alumnos }, { data: vinculos }] = await Promise.all([
    sb.from("alumnos").select("id,nombre,curso").eq("centro_id", _editingProfile.centro_id).order("curso").order("nombre"),
    sb.from("familia_alumno").select("alumno_id").eq("profile_id", _editingProfile.id)
  ]);

  _editingAlumnoIds = new Set((vinculos || []).map(v => v.alumno_id));

  if (!alumnos?.length) {
    lista.innerHTML = '<div style="font-size:12px;color:var(--txt3);">No hay alumnos en este centro.</div>';
    return;
  }
  lista.innerHTML = alumnos.map(a => {
    const sel = _editingAlumnoIds.has(a.id);
    return `<div id="edit-al-${a.id}" onclick="toggleEditAlumno('${a.id}')" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;background:${sel ? "var(--ink-ll)" : "var(--srf2)"};">
      <div id="edit-chk-${a.id}" style="width:16px;height:16px;border-radius:4px;border:2px solid ${sel ? "var(--ink)" : "var(--bdr)"};background:${sel ? "var(--ink)" : "var(--srf)"};display:flex;align-items:center;justify-content:center;font-size:10px;color:${sel ? "#fff" : "transparent"};">✓</div>
      <div style="font-size:13px;">${a.nombre} <span style="color:var(--txt3);font-size:12px;">${a.curso || ""}</span></div>
    </div>`;
  }).join("");
}

function toggleEditAlumno(id) {
  const chk  = document.getElementById("edit-chk-" + id);
  const card = document.getElementById("edit-al-"  + id);
  if (_editingAlumnoIds.has(id)) {
    _editingAlumnoIds.delete(id);
    if (chk)  { chk.style.background = "var(--srf)"; chk.style.borderColor = "var(--bdr)"; chk.style.color = "transparent"; }
    if (card) card.style.background = "var(--srf2)";
  } else {
    _editingAlumnoIds.add(id);
    if (chk)  { chk.style.background = "var(--ink)"; chk.style.borderColor = "var(--ink)"; chk.style.color = "#fff"; }
    if (card) card.style.background = "var(--ink-ll)";
  }
}

async function guardarCambiosUsuario() {
  if (!_editingProfile) return;
  const nombre = document.getElementById("edit-name").value.trim();
  const newRol = document.getElementById("edit-rol").value;
  const status = document.getElementById("edit-status");
  status.style.display = "none";

  const updates = {};
  if (nombre && nombre !== _editingProfile.full_name) updates.full_name = nombre;
  if (newRol && newRol !== _editingProfile.rol) updates.rol = newRol;

  if (Object.keys(updates).length > 0) {
    const { error } = await sb.from("profiles").update(updates).eq("id", _editingProfile.id);
    if (error) {
      status.textContent = "Error: " + error.message;
      status.style.background = "#fde8e8"; status.style.color = "var(--red)";
      status.style.display = "block"; return;
    }
    if (updates.rol) {
      try {
        const { data: { session } } = await sb.auth.getSession();
        await fetch(`${SB_URL}/functions/v1/notify-role`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify({ profileId: _editingProfile.id, newRol })
        });
      } catch(e) { console.warn("notify-role falló:", e); }
    }
  }

  // Sync familia_alumno links if role is (or becomes) familia
  if (newRol === "familia") {
    await sb.from("familia_alumno").delete().eq("profile_id", _editingProfile.id);
    if (_editingAlumnoIds.size > 0) {
      const links = [..._editingAlumnoIds].map(aid => ({ profile_id: _editingProfile.id, alumno_id: aid }));
      await sb.from("familia_alumno").insert(links);
    }
  }

  status.textContent = "✅ Cambios guardados.";
  status.style.background = "var(--ink-ll)"; status.style.color = "var(--ink)";
  status.style.display = "block";
  setTimeout(cerrarModalEditar, 900);
  await loadUsers();
}

// ── ACCIONES ──
async function desactivarUsuario(profileId, nombre) {
  if (!confirm(`¿Desactivar la cuenta de "${nombre}"?\nEl usuario no podrá iniciar sesión.`)) return;
  const { error } = await sb.from("profiles").update({ activo: false }).eq("id", profileId);
  if (error) alert("Error: " + error.message);
  else await loadUsers();
}

async function reactivarUsuario(profileId) {
  const { error } = await sb.from("profiles").update({ activo: true }).eq("id", profileId);
  if (error) alert("Error: " + error.message);
  else await loadUsers();
}

async function reenviarInvitacion(email, nombre, centroId, rol) {
  if (!confirm(`¿Reenviar invitación a "${nombre}" (${email})?`)) return;
  try {
    const res = await fetch(`${SB_URL}/functions/v1/invite-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
      body: JSON.stringify({ email, full_name: nombre, centro_id: centroId, rol: rol || "familia", caller_user_id: currentUser.id })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    alert(`✅ Invitación reenviada a ${email}`);
  } catch(e) {
    alert("Error al reenviar: " + e.message);
  }
}

async function deleteUser(profileId, name) {
  if (!confirm(`¿Eliminar la invitación pendiente de "${name}"?\nEl usuario nunca aceptó la invitación y no tiene sesión activa.`)) return;
  const { error } = await sb.from("profiles").delete().eq("id", profileId);
  if (error) alert("Error: " + error.message);
  else await loadUsers();
}

async function changeRole(profileId, newRol) {
  const { error } = await sb.from("profiles").update({ rol: newRol }).eq("id", profileId);
  if (error) { alert("Error al cambiar el rol: " + error.message); return; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    await fetch(`${SB_URL}/functions/v1/notify-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId, newRol })
    });
  } catch(e) { console.warn("notify-role falló:", e); }
  await loadUsers();
}
