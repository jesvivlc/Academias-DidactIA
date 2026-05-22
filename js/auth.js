// ── AUTH UI ──
function showRegister() {
  document.getElementById("form-login").style.display = "none";
  document.getElementById("form-register").style.display = "block";
  document.getElementById("auth-title").textContent = "Crear cuenta";
  document.getElementById("auth-sub").textContent = "Regístrate para acceder a tu centro educativo.";
}
function showLogin() {
  document.getElementById("form-register").style.display = "none";
  document.getElementById("form-login").style.display = "block";
  document.getElementById("form-recovery").style.display = "none";
  document.getElementById("auth-title").textContent = "Bienvenido a DidactIA";
  document.getElementById("auth-sub").textContent = "Accede con tu cuenta para continuar.";
}

function showRecovery() {
  document.getElementById("form-login").style.display = "none";
  document.getElementById("form-register").style.display = "none";
  document.getElementById("form-recovery").style.display = "block";
  document.getElementById("auth-title").textContent = "Nueva contraseña";
  document.getElementById("auth-sub").textContent = "Introduce tu nueva contraseña para acceder a DidactIA.";
}

async function doRecovery() {
  const pass = document.getElementById("recovery-pass").value;
  const pass2 = document.getElementById("recovery-pass2").value;
  const errEl = document.getElementById("recovery-err");
  errEl.style.display = "none";

  if (!pass || !pass2) { errEl.textContent = "Rellena ambos campos."; errEl.style.display = "block"; return; }
  if (pass.length < 6) { errEl.textContent = "La contraseña debe tener al menos 6 caracteres."; errEl.style.display = "block"; return; }
  if (pass !== pass2) { errEl.textContent = "Las contraseñas no coinciden."; errEl.style.display = "block"; return; }

  const { error } = await sb.auth.updateUser({ password: pass });
  if (error) { errEl.textContent = error.message; errEl.style.display = "block"; return; }

  // Password updated — load profile and enter app
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    window.location.hash = "";
    await loadUserProfile(user);
  }
}

// ── LOGIN ──
async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pass  = document.getElementById("login-pass").value;
  const errEl = document.getElementById("login-err");
  errEl.style.display = "none";
  if (!email || !pass) { errEl.textContent = "Rellena email y contraseña."; errEl.style.display = "block"; return; }
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { errEl.textContent = error.message; errEl.style.display = "block"; return; }
  await loadUserProfile(data.user);
}

// ── REGISTER ──
let regCentroId = null; // centro verified in step 1
let regRol = "familia";
let selectedAlumnos = new Set();

function onRolChange() {
  const rolEl = document.getElementById("reg-rol");
  if (rolEl) regRol = rolEl.value;
}

async function doRegisterStep1() {
  const name   = document.getElementById("reg-name").value.trim();
  const email  = document.getElementById("reg-email").value.trim();
  const pass   = document.getElementById("reg-pass").value;
  const codigo = document.getElementById("reg-codigo").value.trim().toUpperCase();
  // rol determined by access code
  const errEl  = document.getElementById("reg-err");
  errEl.style.display = "none";

  if (!name || !email || !pass || !codigo) {
    errEl.textContent = "Rellena todos los campos."; errEl.style.display = "block"; return;
  }
  if (pass.length < 6) {
    errEl.textContent = "La contraseña debe tener al menos 6 caracteres."; errEl.style.display = "block"; return;
  }

  // Check code against both codigo_familia and codigo_profesional
  const { data: centros, error: cErr } = await sb
    .from("centros")
    .select("id,nombre,codigo_familia,codigo_profesional");

  if (cErr || !centros?.length) {
    errEl.textContent = "Error al verificar el código. Inténtalo de nuevo.";
    errEl.style.display = "block"; return;
  }

  let matchedCentro = null;
  regRol = null;

  for (const c of centros) {
    if (c.codigo_familia?.toUpperCase() === codigo) {
      matchedCentro = c; regRol = "familia"; break;
    }
    if (c.codigo_profesional?.toUpperCase() === codigo) {
      matchedCentro = c; regRol = "profesional"; break;
    }
  }

  if (!matchedCentro) {
    errEl.textContent = "Código incorrecto. Comprueba que lo has escrito bien.";
    errEl.style.display = "block"; return;
  }

  regCentroId = matchedCentro.id;
  const centroNombre = matchedCentro.nombre;

  // If profesional, skip step 2
  if (regRol === "profesional") {
    await finishRegister(name, email, pass, []);
    return;
  }

  // Show step 2 — load alumnos of this centro
  document.getElementById("centro-verificado").textContent = centroNombre;
  document.getElementById("step2-bar").style.background = "var(--ink)";
  document.getElementById("reg-step1").style.display = "none";
  document.getElementById("reg-step2").style.display = "block";
  document.getElementById("auth-title").textContent = "Vincular alumno/s";
  document.getElementById("auth-sub").textContent = "Selecciona el alumno o alumnos que tienes en este centro.";

  // Load alumnos
  const { data: alumnos } = await sb
    .from("alumnos").select("id,nombre,curso")
    .eq("centro_id", regCentroId)
    .order("curso").order("nombre");

  const lista = document.getElementById("alumnos-lista");
  if (!alumnos?.length) {
    lista.innerHTML = '<div style="font-size:13px;color:var(--txt3);text-align:center;padding:12px;">No hay alumnos registrados aún. El administrador debe añadirlos.</div>';
  } else {
    lista.innerHTML = alumnos.map(a => `
      <div class="alumno-card" id="ac-${a.id}" onclick="toggleAlumno('${a.id}')">
        <div class="chk" id="chk-${a.id}">✓</div>
        <div class="alumno-info">
          <div class="alumno-nombre">${a.nombre}</div>
          <div class="alumno-curso">${a.curso || ""}</div>
        </div>
      </div>`).join("");
  }

  // Store name/email/pass for step 2
  window._regData = { name, email, pass };
}

function toggleAlumno(id) {
  if (selectedAlumnos.has(id)) {
    selectedAlumnos.delete(id);
    document.getElementById("ac-"+id)?.classList.remove("selected");
  } else {
    selectedAlumnos.add(id);
    document.getElementById("ac-"+id)?.classList.add("selected");
  }
  const count = selectedAlumnos.size;
  const selDiv = document.getElementById("alumnos-seleccionados");
  selDiv.style.display = count > 0 ? "block" : "none";
  document.getElementById("sel-count").textContent = count;
}

async function doRegisterStep2(skip = false) {
  const { name, email, pass } = window._regData || {};
  const alumnosIds = skip ? [] : [...selectedAlumnos];
  await finishRegister(name, email, pass, alumnosIds);
}

async function finishRegister(name, email, pass, alumnosIds) {
  const errEl = document.getElementById("reg-err2") || document.getElementById("reg-err");
  errEl.style.display = "none";

  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { full_name: name } }
  });
  if (error) { errEl.textContent = error.message; errEl.style.display = "block"; return; }

  if (data.user) {
    // Create profile
    await sb.from("profiles").upsert({
      id: data.user.id,
      user_id: data.user.id,
      full_name: name,
      email: email,
      centro_id: regCentroId,
      rol: regRol
    }, { onConflict: "user_id" });

    // Link alumnos if familia
    if (alumnosIds.length > 0) {
      const links = alumnosIds.map(aid => ({
        profile_id: data.user.id,
        alumno_id: aid,
        relacion: "familiar"
      }));
      await sb.from("familia_alumno").insert(links);
    }

    await loadUserProfile(data.user);
  } else {
    errEl.textContent = "Revisa tu email para confirmar la cuenta antes de entrar.";
    errEl.style.color = "var(--ink)";
    errEl.style.display = "block";
  }
}

// ── LOGOUT ──
async function doLogout() {
  await sb.auth.signOut();
  currentUser = null; ctrId = null; ctrName = ""; history = [];
  document.getElementById("setup").style.display = "flex";
  document.getElementById("app-hdr").style.display = "none";
  document.getElementById("app-tabs").style.display = "none";
  document.getElementById("app-main").style.display = "none";
  showLogin();
}

// ── LOAD PROFILE AFTER LOGIN ──
async function loadUserProfile(user) {
  currentUser = user;
  // Get profile with centro info
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, centro_id, rol, full_name, activo")
    .eq("user_id", user.id)
    .single();

  if (error || !profile) {
    // Profile not found — show error
    const errMsg = document.getElementById("login-err");
    errMsg.textContent = "Tu cuenta existe pero no tiene perfil asignado. Contacta con el administrador del centro o escribe a soporte@didactia.eu.";
    errMsg.style.display = "block";
    await sb.auth.signOut();
    return;
  }

  role = profile.rol || "familia";
  currentUserName = profile.full_name || user.email;

  if (profile.activo === false) {
    const errEl = document.getElementById("login-err");
    errEl.textContent = "Tu cuenta ha sido desactivada. Contacta con el administrador del centro.";
    errEl.style.display = "block";
    await sb.auth.signOut();
    return;
  }

  // Superadmin: load all centros and let them pick
  if (role === "superadmin") {
    const { data: allCentros } = await sb.from("centros").select("id,nombre,modulos_activos,color_primario,logo_url").order("nombre");
    ctrId = allCentros?.[0]?.id || null;
    ctrName = allCentros?.[0]?.nombre || "Todos los centros";
    modulosActivos = allCentros?.[0]?.modulos_activos || [];
    setTimeout(() => applyTheme(allCentros?.[0]?.color_primario, allCentros?.[0]?.logo_url), 100);
    // Build centro selector for superadmin
    const hdrRight = document.getElementById("ctr-name-hdr");
    if (allCentros?.length > 1) {
      const sel = document.createElement("select");
      sel.className = "ctr-sel";
      sel.id = "super-ctr-sel";
      sel.innerHTML = allCentros.map(c => `<option value="${c.id}" data-n="${c.nombre}">${c.nombre}</option>`).join("");
      sel.onchange = async function() {
        ctrId = this.value;
        ctrName = this.options[this.selectedIndex].dataset.n;
        // Reload modulos for selected centro
        const { data: ctr } = await sb.from("centros").select("modulos_activos,color_primario,logo_url").eq("id", ctrId).single();
        modulosActivos = ctr?.modulos_activos || [];
        // Update comedor tab visibility
        const cTab = document.getElementById("tab-comedor");
        if (cTab) cTab.style.display = modulosActivos.includes("comedor") ? "block" : "none";
        const eTab = document.getElementById("tab-espacios");
        if (eTab) eTab.style.display = modulosActivos.includes("espacios") ? "block" : "none";
        history = []; resetChat(); updateUI(); loadAdmin();
        applyTheme(ctr?.color_primario, ctr?.logo_url);
      };
      hdrRight.replaceWith(sel);
    } else {
      hdrRight.textContent = ctrName;
    }
  } else {
    ctrId = profile.centro_id;
    // Load centro name and modulos
    if (ctrId) {
      const { data: ctr } = await sb.from("centros").select("nombre,modulos_activos,color_primario,logo_url").eq("id", ctrId).single();
      ctrName = ctr?.nombre || "Mi centro";
      modulosActivos = ctr?.modulos_activos || [];
      applyTheme(ctr?.color_primario, ctr?.logo_url);
    }
    document.getElementById("ctr-name-hdr").textContent = ctrName;
  }

  // Load linked alumnos if familia
  if (role === "familia") {
    const { data: vinculos } = await sb
      .from("familia_alumno")
      .select("alumnos(nombre, curso, grupo_horario)")
      .eq("profile_id", profile.id);
    currentUserAlumnos = vinculos?.map(v => v.alumnos).filter(Boolean) || [];
  }

  // Update UI
  const ctrHdr = document.getElementById("ctr-name-hdr");
  if (ctrHdr) ctrHdr.textContent = ctrName;
  const pill = document.getElementById("role-pill");
  const roleLabels = { familia:"👨‍👩‍👧 Familia", profesional:"👩‍🏫 Profesional", admin:"⚙️ Admin", superadmin:"🔑 Superadmin" };
  pill.textContent = roleLabels[role] || role;
  pill.className = "role-pill " + (role === "familia" ? "fam" : "pro");

  // Show/hide admin tab based on role
  const adminTab = document.getElementById("tab-admin");
  adminTab.style.display = (role === "admin" || role === "superadmin") ? "block" : "none";

  // Show comedor tab only if module is active for this centro AND user has right role
  const comedorTab = document.getElementById("tab-comedor");
  const hasComedor = modulosActivos.includes("comedor");
  if (comedorTab) comedorTab.style.display = (hasComedor && ["profesional","admin","superadmin"].includes(role)) ? "block" : "none";

  const tabSust = document.getElementById("tab-sust");
  if (tabSust) tabSust.style.display = (role === "admin" || role === "profesional" || role === "superadmin") ? "block" : "none";

  const tabInc = document.getElementById("tab-incidencias");
  if (tabInc) tabInc.style.display = (role === "profesional" || role === "admin" || role === "superadmin") ? "block" : "none";

  const tabEsp = document.getElementById("tab-espacios");
  if (tabEsp) tabEsp.style.display = (modulosActivos.includes("espacios") && ["profesional","admin","superadmin"].includes(role)) ? "block" : "none";





  const usersTab = document.getElementById("tab-users");
  if (usersTab) usersTab.style.display = (role === "admin" || role === "superadmin") ? "block" : "none";

  const tabRrhh = document.getElementById("tab-rrhh");
  if (tabRrhh) tabRrhh.style.display = (["profesional","admin","superadmin"].includes(role)) ? "block" : "none";

  // Show app
  document.getElementById("setup").style.display = "none";
  document.getElementById("app-hdr").style.display = "flex";
  document.getElementById("app-tabs").style.display = "flex";
  document.getElementById("app-main").style.display = "flex";

  updateUI();
  loadAdmin();
  setTimeout(initWelcomeExtras, 400);
  setTimeout(initRealtimeNotifications, 800);
}

function onCtrChange() {
  // No longer used — center comes from profile
}
function updateUI() {
  const n = ctrName;
  // Update welcome center name
  const wlcEl = document.getElementById("wlc-ctr");
  if (wlcEl) wlcEl.textContent = n;
  const admEl = document.getElementById("adm-ctr");
  if (admEl) admEl.textContent = n;
  const bnrEl = document.getElementById("bnr-ctr");
  if (bnrEl) bnrEl.textContent = n;
  // Update header center name only if not superadmin selector
  const hdrEl = document.getElementById("ctr-name-hdr");
  if (hdrEl) hdrEl.textContent = n;
}
function resetChat() {
  var extraIds = ["role-cards-container","ficha-centro-container","comedor-hijos-container","mis-hijos-container","busqueda-alumno-container"];
  for (var i = 0; i < extraIds.length; i++) {
    var el = document.getElementById(extraIds[i]);
    if (el) el.style.display = "none";
  }
  const msgs = document.getElementById("chat-msgs");
  msgs.innerHTML = `<div class="welcome" id="welcome">
    <div class="wlc-ico">D</div>
    <div class="wlc-title">Hola, soy DidactIA</div>
    <div class="wlc-sub">Tu asistente para <strong id="wlc-ctr">${ctrName}</strong>. Respondo preguntas sobre horarios, menús, reuniones y más.</div>
    <div class="quick-qs">
      <div class="quick-q" onclick="askQ('¿Cuándo es la próxima reunión de familias?')">¿Cuándo es la próxima reunión?</div>
      <div class="quick-q" onclick="askQ('¿Cuál es el teléfono de secretaría?')">¿Cuál es el teléfono de secretaría?</div>
      <div class="quick-q" onclick="askQ('¿Qué actividades extraescolares hay?')">¿Qué actividades extraescolares hay?</div>
    </div></div>`;
}
function toggleRole() {
  role = role === "familia" ? "profesional" : "familia";
  const p = document.getElementById("role-pill");
  p.textContent = role === "familia" ? "👨‍👩‍👧 Familia" : "👩‍🏫 Profesional";
  p.className = "role-pill " + (role === "familia" ? "fam" : "pro");
}
function showTab(t) {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
  document.getElementById("tab-"+t).classList.add("active");
  document.getElementById("panel-"+t).classList.add("active");
  if (t === "admin") loadAdmin();
  if (t === "users") loadUsersPanel();
  if (t === "comedor") loadComedor();
  if (t === "sust") {
    initSustPanel();
    var st = document.getElementById("tab-sust");
    if (st) { st.style.outline = ""; st.style.outlineOffset = ""; }
  }
  if (t === "incidencias") initIncidenciasPanel();
  if (t === "espacios") loadEspacios();
  if (t === "rrhh") loadRrhhPanel();
}
// ── NAVEGACIÓN: IR AL INICIO ──
function applyTheme(colorPrimario, logoUrl) {
  var root = document.documentElement;
  var color = colorPrimario && /^#[0-9a-fA-F]{6}$/.test(colorPrimario) ? colorPrimario : null;

  if (color) {
    var r = parseInt(color.slice(1,3),16);
    var g = parseInt(color.slice(3,5),16);
    var b = parseInt(color.slice(5,7),16);
    root.style.setProperty("--ink", color);
    root.style.setProperty("--ink-l", "rgba(" + r + "," + g + "," + b + ",0.15)");
    root.style.setProperty("--ink-ll", "rgba(" + r + "," + g + "," + b + ",0.07)");
  }

  var logoEl = document.getElementById("brand-logo");
  if (logoEl) {
    if (logoUrl) {
      var img = document.createElement("img");
      img.src = logoUrl;
      img.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:6px;";
      img.onerror = function() { logoEl.textContent = "D"; logoEl.style.background = ""; };
      logoEl.innerHTML = "";
      logoEl.style.background = "white";
      logoEl.style.padding = "3px";
      logoEl.appendChild(img);
    } else {
      logoEl.textContent = "D";
      logoEl.style.background = "";
      logoEl.style.padding = "";
    }
  }

  var appLogoEl = document.getElementById("app-brand-logo");
  if (appLogoEl) {
    if (logoUrl) {
      var img2 = document.createElement("img");
      img2.src = logoUrl;
      img2.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:6px;";
      img2.onerror = function() { appLogoEl.textContent = "D"; appLogoEl.style.background = ""; };
      appLogoEl.innerHTML = "";
      appLogoEl.style.background = "white";
      appLogoEl.style.padding = "3px";
      appLogoEl.appendChild(img2);
    } else {
      appLogoEl.textContent = "D";
      appLogoEl.style.background = "";
      appLogoEl.style.padding = "";
    }
  }

  var wlcIco = document.querySelector("#welcome .wlc-ico");
  if (wlcIco) {
    if (logoUrl) {
      wlcIco.style.cssText = "width:180px;height:90px;border-radius:10px;background:white;padding:6px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;";
      var img3 = document.createElement("img");
      img3.src = logoUrl;
      img3.style.cssText = "width:100%;height:100%;object-fit:contain;";
      img3.onerror = function() { wlcIco.textContent = "D"; wlcIco.style.cssText = ""; };
      wlcIco.innerHTML = "";
      wlcIco.appendChild(img3);
    } else {
      wlcIco.textContent = "D";
      wlcIco.style.cssText = "";
    }
  }
}

function goHome() {
  showTab("chat");
  var msgs = document.getElementById("chat-msgs");
  if (msgs) {
    msgs.innerHTML = '<div class="welcome" id="welcome">' +
      '<div class="wlc-ico">D</div>' +
      '<div class="wlc-title">Hola, soy DidactIA</div>' +
      '<div class="wlc-sub">Tu asistente para <strong id="wlc-ctr">' + ctrName + '</strong>. Puedo responder preguntas sobre horarios, menús, reuniones y mucho más.</div>' +
      '<div class="quick-qs">' +
      '<div class="quick-q" onclick="askQ(\'¿Cuándo es la próxima reunión de familias?\')">¿Cuándo es la próxima reunión?</div>' +
      '<div class="quick-q" onclick="askQ(\'¿Cuál es el teléfono de secretaría?\')">¿Cuál es el teléfono de secretaría?</div>' +
      '<div class="quick-q" onclick="askQ(\'¿Qué actividades extraescolares hay?\')">¿Qué actividades extraescolares hay?</div>' +
      '</div>' +
      '<div id="role-cards-container" style="display:none;"><div class="role-cards" id="role-cards"></div></div>' +
      '<div id="ficha-centro-container" style="display:none;"><div id="ficha-centro-data" style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px 16px;display:flex;flex-direction:column;gap:6px;text-align:left;"></div></div>' +
      '<div id="comedor-hijos-container" style="display:none;"><div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);margin-bottom:6px;text-align:left;">Comedor hoy</div><div id="comedor-hijos-list" style="display:flex;flex-direction:column;gap:6px;"></div></div>' +
      '<div id="mis-hijos-container" style="display:none;"><div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);margin-bottom:6px;text-align:left;">Mis hijos</div><div id="mis-hijos-list" style="display:flex;flex-direction:column;gap:6px;"></div></div>' +
      '<div id="busqueda-alumno-container" style="display:none;"><div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);margin-bottom:6px;text-align:left;">Búsqueda rápida de alumno</div><input class="chat-inp" id="busqueda-alumno-inp" placeholder="Buscar por nombre…" style="min-height:38px;font-size:13px;" oninput="buscarAlumnoRapido(this.value)" /><div id="busqueda-alumno-res"></div></div>' +
      '</div>';
    applyTheme(document.documentElement.style.getPropertyValue('--ink') || null,
      document.getElementById('app-brand-logo')?.querySelector('img')?.src || null);
    setTimeout(initWelcomeExtras, 300);
  }
}
