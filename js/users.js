// ── USERS PANEL ──
async function loadUsersPanel() {
  const { data: centros } = await sb.from("centros").select("id,nombre,modulos_activos").order("nombre");
  if (centros?.length) {
    const invSel = document.getElementById("inv-centro");
    const filterSel = document.getElementById("filter-centro");
    invSel.innerHTML = centros.map(c => "<option value=" + JSON.stringify(c.id) + ">" + c.nombre + "</option>").join("");
    filterSel.innerHTML = "<option value=''>Todos los centros</option>" +
      centros.map(c => "<option value=" + JSON.stringify(c.id) + ">" + c.nombre + "</option>").join("");

    const MODULOS = [
      { key: "comedor", label: "🍽️ Módulo comedor" },
      // { key: "espacios", label: "🏫 Módulo espacios" }, // Pendiente de implementar
    ];
    const container = document.getElementById("centros-modulos-list");
    container.innerHTML = centros.map(function(c) {
      const activos = c.modulos_activos || [];
      const togglesHtml = MODULOS.map(function(m) {
        const on = activos.includes(m.key);
        const onClass = on ? "toggle-track on" : "toggle-track";
        return "<div class='toggle-wrap' onclick='toggleModulo(\"" + c.id + "\",\"" + m.key + "\"," + (!on) + ",this)'>" +
          "<div class='" + onClass + "'><div class='toggle-thumb'></div></div>" +
          "<span style='font-size:13px;color:var(--txt2);'>" + m.label + "</span></div>";
      }).join("");
      return "<div style='padding:14px 0;border-bottom:1px solid var(--bdr);'>" +
        "<div style='font-size:14px;font-weight:600;color:var(--txt);margin-bottom:10px;'>" + c.nombre + "</div>" +
        "<div style='display:flex;flex-wrap:wrap;gap:16px;'>" + togglesHtml + "</div></div>";
    }).join("");
  }
  await loadUsers();
}

async function toggleModulo(centroId, modulo, activate, el) {
  // Update local UI immediately
  const track = el.querySelector(".toggle-track");
  track.classList.toggle("on", activate);

  // Update in Supabase
  const { data: centro } = await sb.from("centros").select("modulos_activos").eq("id", centroId).single();
  let modulos = centro?.modulos_activos || [];

  if (activate && !modulos.includes(modulo)) {
    modulos = [...modulos, modulo];
  } else if (!activate) {
    modulos = modulos.filter(m => m !== modulo);
  }

  await sb.from("centros").update({ modulos_activos: modulos }).eq("id", centroId);

  // If this is the current centro, update local state and tab visibility
  if (centroId === ctrId) {
    modulosActivos = modulos;
    const cTab = document.getElementById("tab-comedor");
    if (cTab) cTab.style.display = modulosActivos.includes("comedor") ? "block" : "none";
  }
}

async function loadUsers() {
  const container = document.getElementById("users-list");
  container.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;"><span class="spin">⟳</span> Cargando…</div>';

  const filterCentro = document.getElementById("filter-centro")?.value;
  let query = sb.from("profiles").select("id,user_id,full_name,email,rol,centro_id,centros(nombre)").order("rol").order("full_name");
  if (filterCentro) query = query.eq("centro_id", filterCentro);

  const { data: users, error } = await query;
  if (error || !users?.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay usuarios registrados.</div>';
    return;
  }

  const roleLabels = { familia:"👨‍👩‍👧 Familia", profesional:"👩‍🏫 Profesional", admin:"⚙️ Admin", superadmin:"🔑 Superadmin" };
  container.innerHTML = `<table class="tbl">
    <thead><tr><th>Nombre</th><th>Email</th><th>Centro</th><th>Rol</th><th>Acción</th></tr></thead>
    <tbody>${users.map(u => `
      <tr>
        <td style="font-weight:500;">${u.full_name || "—"}</td>
        <td style="color:var(--txt3);">${u.email || "—"}</td>
        <td>${u.centros?.nombre || "—"}</td>
        <td>
          <select style="font-size:12px;padding:3px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--srf2);" 
            onchange="changeRole('${u.id}', this.value)">
            ${["familia","profesional","admin","superadmin"].map(r =>
              `<option value="${r}" ${u.rol===r?"selected":""}>${roleLabels[r]}</option>`
            ).join("")}
          </select>
        </td>
        <td>
          <button class="btn btn-s" style="font-size:11px;padding:4px 10px;" onclick="deleteUser('${u.id}','${u.full_name||u.email}')">🗑️</button>
        </td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

async function changeRole(profileId, newRol) {
  const { error } = await sb.from("profiles").update({ rol: newRol }).eq("id", profileId);
  if (error) alert("Error al cambiar el rol: " + error.message);
  else await loadUsers();
}

async function deleteUser(profileId, name) {
  if (!confirm(`¿Eliminar al usuario "${name}"? Esta acción no se puede deshacer.`)) return;
  const { error } = await sb.from("profiles").delete().eq("id", profileId);
  if (error) alert("Error: " + error.message);
  else await loadUsers();
}

async function inviteUser() {
  const name = document.getElementById("inv-name").value.trim();
  const email = document.getElementById("inv-email").value.trim();
  const centroId = document.getElementById("inv-centro").value;
  const rol = document.getElementById("inv-rol").value;
  const status = document.getElementById("inv-status");

  if (!name || !email || !centroId) {
    status.textContent = "Rellena todos los campos.";
    status.style.background = "var(--red-l)"; status.style.color = "var(--red)";
    status.style.display = "block"; return;
  }

  status.textContent = "⟳ Enviando invitación…";
  status.style.background = "var(--srf2)"; status.style.color = "var(--txt2)";
  status.style.display = "block";

  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SB_URL}/functions/v1/invite-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": ANON_KEY
      },
      body: JSON.stringify({ email, full_name: name, centro_id: centroId, rol })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    status.textContent = `✅ Invitación enviada a ${email}`;
    status.style.background = "var(--ink-ll)"; status.style.color = "var(--ink)";
    document.getElementById("inv-name").value = "";
    document.getElementById("inv-email").value = "";
    await loadUsers();
  } catch(e) {
    status.textContent = "Error: " + e.message;
    status.style.background = "#fde8e8"; status.style.color = "var(--red)";
  }
}
