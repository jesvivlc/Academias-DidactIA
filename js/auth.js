// ── AUTH UI ──
let _regData; // estado local del registro (antes _regData)
// Escape HTML para texto/atributos insertados vía innerHTML (XSS-safe)
function _authEsc(s) { return escH(s); } // delegado a utils.js
function _hideAuthForms() {
  ["form-login", "form-register", "form-recovery", "form-reset-request"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}
function showRegister() {
  _hideAuthForms();
  document.getElementById("form-register").style.display = "block";
  document.getElementById("auth-title").textContent = "Crear cuenta";
  document.getElementById("auth-sub").textContent = "Regístrate para acceder a tu academia.";
}
function showLogin() {
  _hideAuthForms();
  document.getElementById("form-login").style.display = "block";
  document.getElementById("auth-title").textContent = "Bienvenido a DidactIA Academias";
  document.getElementById("auth-sub").textContent = "Accede con tu cuenta para continuar.";
}

// Vista para SOLICITAR el email de recuperación (la mitad que faltaba).
function showResetRequest() {
  _hideAuthForms();
  document.getElementById("form-reset-request").style.display = "block";
  document.getElementById("auth-title").textContent = "Recuperar contraseña";
  document.getElementById("auth-sub").textContent = "Te enviaremos un enlace a tu email para restablecerla.";
  // Prerellena con el email ya escrito en el login, si lo había.
  var le = document.getElementById("login-email");
  var re = document.getElementById("reset-email");
  if (le && re && le.value && !re.value) re.value = le.value;
  var msg = document.getElementById("reset-msg");
  if (msg) msg.style.display = "none";
}

async function doRequestReset() {
  var email = (document.getElementById("reset-email").value || "").trim();
  var msg = document.getElementById("reset-msg");
  var btn = document.getElementById("reset-btn");
  msg.style.display = "none";

  if (!email || email.indexOf("@") === -1) {
    msg.textContent = "Introduce un email válido.";
    msg.style.cssText = "display:block;color:var(--red,#c0392b);font-size:13px;margin:4px 0;";
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
  try {
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
  } catch (e) { /* nunca revelamos si la cuenta existe */ }

  // Mensaje neutro (evita enumeración de cuentas): no decimos si el email existe.
  msg.textContent = "Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña. Revisa tu bandeja de entrada (y la carpeta de spam).";
  msg.style.cssText = "display:block;color:#1e6b3a;font-size:13px;background:var(--ink-ll);border-radius:8px;padding:10px 12px;margin:4px 0;";
  if (btn) { btn.disabled = false; btn.textContent = "Reenviar enlace"; }
}

function showRecovery(type) {
  _hideAuthForms();
  document.getElementById("form-recovery").style.display = "block";
  const isInvite = type === "invite";
  document.getElementById("auth-title").textContent = isInvite ? "Crea tu contraseña" : "Nueva contraseña";
  document.getElementById("auth-sub").textContent = isInvite
    ? "Bienvenido a DidactIA Academias. Elige una contraseña para activar tu cuenta."
    : "Introduce tu nueva contraseña para acceder a DidactIA Academias.";
  window._authTokenType = type || "recovery";
}

async function doRecovery() {
  const pass = document.getElementById("recovery-pass").value;
  const pass2 = document.getElementById("recovery-pass2").value;
  const errEl = document.getElementById("recovery-err");
  errEl.style.display = "none";

  if (!pass || !pass2) { errEl.textContent = "Rellena ambos campos."; errEl.style.display = "block"; return; }
  if (pass.length < 8) { errEl.textContent = "La contraseña debe tener al menos 8 caracteres."; errEl.style.display = "block"; return; }
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
  if (error) {
    errEl.textContent = /invalid login|invalid email|user not found/i.test(error.message)
      ? "No encontramos este correo. Por favor, verifica que sea el mismo que diste al registrarte en la academia."
      : error.message;
    errEl.style.display = "block";
    return;
  }
  await loadUserProfile(data.user);
}

// ── REGISTER ──
let regCentroId = null; // centro verified in step 1
let regRol = "familia";
let selectedAlumnos = new Set();
let _regPass = null; // contraseña en variable de módulo, no en window

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

  if (!name || !email || !pass) {
    errEl.textContent = "Rellena nombre, email y contraseña."; errEl.style.display = "block"; return;
  }
  if (pass.length < 6) {
    errEl.textContent = "La contraseña debe tener al menos 6 caracteres."; errEl.style.display = "block"; return;
  }

  // If no code provided, register without centro assignment
  if (!codigo) {
    regCentroId = null;
    regRol = "familia";
    await finishRegister(name, email, pass, []);
    return;
  }

  // Check code against codigo_familia, codigo_profesional and codigo_acceso
  const { data: centros, error: cErr } = await sb
    .from("centros")
    .select("id,nombre,codigo_familia,codigo_profesional,codigo_acceso");

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
    if (c.codigo_acceso?.toUpperCase() === codigo) {
      matchedCentro = c; regRol = "profesional"; break;
    }
  }

  if (!matchedCentro) {
    errEl.textContent = "Código de academia no válido.";
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
  document.getElementById("auth-sub").textContent = "Selecciona el alumno o alumnos que tienes en esta academia.";

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
          <div class="alumno-nombre">${_authEsc(a.nombre)}</div>
          <div class="alumno-curso">${_authEsc(a.curso || "")}</div>
        </div>
      </div>`).join("");
  }

  // Store name/email for step 2 — pass en variable de módulo, no en window
  _regPass = pass;
  _regData = { name, email };
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
  const { name, email } = _regData || {};
  const alumnosIds = skip ? [] : [...selectedAlumnos];
  await finishRegister(name, email, _regPass, alumnosIds);
  _regPass = null;
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
    .select("id, centro_id, rol, full_name, activo, idioma")
    .eq("user_id", user.id)
    .single();

  if (error || !profile) {
    // Profile not found — show error
    const errMsg = document.getElementById("login-err");
    errMsg.textContent = "Tu cuenta existe pero no tiene perfil asignado. Contacta con la dirección de la academia o escribe a soporte@didactia.eu.";
    errMsg.style.display = "block";
    await sb.auth.signOut();
    return;
  }

  role = profile.rol || "familia";
  currentUserName = profile.full_name || user.email;
  window.userIdioma = profile.idioma || "es";   // idioma preferido (auto-traducción)

  if (profile.activo === false) {
    const errEl = document.getElementById("login-err");
    errEl.textContent = "Tu cuenta ha sido desactivada. Contacta con la dirección de la academia.";
    errEl.style.display = "block";
    await sb.auth.signOut();
    return;
  }

  // Superadmin: load all centros and let them pick
  if (role === "superadmin") {
    const { data: allCentros } = await sb.from("centros").select("id,nombre,modulos_activos,color_primario,logo_url").order("nombre");

    if (!allCentros?.length) {
      document.getElementById("setup").style.display = "none";
      document.getElementById("app-hdr").style.display = "flex";
      document.getElementById("app-main").style.display = "flex";
      const main = document.getElementById("app-main");
      if (main) main.innerHTML = '<div style="padding:60px 24px;text-align:center;color:var(--txt3);font-size:15px;">No hay academias configuradas.<br>Crea la primera academia desde el panel de Supabase.</div>';
      return;
    }

    ctrId = allCentros[0].id;
    ctrName = allCentros[0].nombre;
    modulosActivos = _conModulosBase(allCentros?.[0]?.modulos_activos);
    setTimeout(() => applyTheme(allCentros?.[0]?.color_primario, allCentros?.[0]?.logo_url), 100);
    // Build centro selector for superadmin
    const hdrRight = document.getElementById("ctr-name-hdr");
    if (allCentros?.length > 1) {
      const sel = document.createElement("select");
      sel.className = "ctr-sel";
      sel.id = "super-ctr-sel";
      sel.innerHTML = allCentros.map(c => `<option value="${c.id}" data-n="${_authEsc(c.nombre)}">${_authEsc(c.nombre)}</option>`).join("");
      const _applyCentro = async (id, name) => {
        ctrId = id;
        ctrName = name;
        // Sync both selects
        const ds = document.getElementById("super-ctr-sel");
        const ms = document.getElementById("mas-ctr-sel");
        if (ds) ds.value = id;
        if (ms) ms.value = id;
        const { data: ctr } = await sb.from("centros").select("modulos_activos,color_primario,logo_url").eq("id", ctrId).single();
        modulosActivos = _conModulosBase(ctr?.modulos_activos);
        history = []; resetChat(); updateUI();
        applyTheme(ctr?.color_primario, ctr?.logo_url);
      };
      sel.onchange = function() { _applyCentro(this.value, this.options[this.selectedIndex].dataset.n); };
      hdrRight.replaceWith(sel);
      // Mirror selector in mobile MAS drawer
      const masWrap = document.getElementById("mas-centro-wrap");
      if (masWrap) {
        const mobiSel = sel.cloneNode(true);
        mobiSel.id = "mas-ctr-sel";
        mobiSel.onchange = function() { _applyCentro(this.value, this.options[this.selectedIndex].dataset.n); };
        masWrap.innerHTML = '<div class="mas-ctr-label">Centro activo</div>';
        masWrap.appendChild(mobiSel);
        masWrap.style.display = "flex";
      }
    } else {
      hdrRight.textContent = ctrName;
    }
  } else if (role === "admin_institucional") {
    // Load all centers of the same institution
    const instId = profile.institucion_id;
    if (!instId) {
      // No institution assigned yet — fall back to single-center admin behavior
      ctrId = profile.centro_id;
      if (ctrId) {
        const { data: ctr } = await sb.from("centros").select("nombre,modulos_activos,color_primario,logo_url").eq("id", ctrId).single();
        ctrName = ctr?.nombre || "Mi academia";
        modulosActivos = _conModulosBase(ctr?.modulos_activos);
        applyTheme(ctr?.color_primario, ctr?.logo_url);
        _cacheBrand(ctr?.color_primario, ctr?.logo_url);
      }
      document.getElementById("ctr-name-hdr").textContent = ctrName;
    } else {
      const { data: instCentros } = await sb
        .from("centros")
        .select("id,nombre,modulos_activos,color_primario,logo_url")
        .eq("institucion_id", instId)
        .order("nombre");

      if (!instCentros?.length) {
        document.getElementById("ctr-name-hdr").textContent = "Sin academias";
      } else {
        // Use existing centro_id if it belongs to the institution, else take first
        const match = instCentros.find(c => c.id === profile.centro_id);
        const activeCentro = match || instCentros[0];
        ctrId = activeCentro.id;
        ctrName = activeCentro.nombre;
        modulosActivos = _conModulosBase(activeCentro.modulos_activos);
        applyTheme(activeCentro.color_primario, activeCentro.logo_url);
        _cacheBrand(activeCentro.color_primario, activeCentro.logo_url);

        if (instCentros.length > 1) {
          const hdrRight = document.getElementById("ctr-name-hdr");
          const sel = document.createElement("select");
          sel.className = "ctr-sel";
          sel.id = "super-ctr-sel";
          sel.innerHTML = instCentros.map(c =>
            `<option value="${c.id}" data-n="${_authEsc(c.nombre)}" ${c.id === ctrId ? "selected" : ""}>${_authEsc(c.nombre)}</option>`
          ).join("");
          const _applyInstCentro = async (id, name) => {
            ctrId = id; ctrName = name;
            // Update profiles.centro_id so existing RLS keeps working
            await sb.from("profiles").update({ centro_id: id }).eq("id", currentUser.id);
            const ds = document.getElementById("super-ctr-sel");
            const ms = document.getElementById("mas-ctr-sel");
            if (ds) ds.value = id;
            if (ms) ms.value = id;
            const { data: ctr } = await sb.from("centros").select("modulos_activos,color_primario,logo_url").eq("id", ctrId).single();
            modulosActivos = _conModulosBase(ctr?.modulos_activos);
            history = []; resetChat(); updateUI();
            applyTheme(ctr?.color_primario, ctr?.logo_url);
          };
          sel.onchange = function() { _applyInstCentro(this.value, this.options[this.selectedIndex].dataset.n); };
          hdrRight.replaceWith(sel);
          // Mirror in mobile MAS drawer
          const masWrap = document.getElementById("mas-centro-wrap");
          if (masWrap) {
            const mobiSel = sel.cloneNode(true);
            mobiSel.id = "mas-ctr-sel";
            mobiSel.onchange = function() { _applyInstCentro(this.value, this.options[this.selectedIndex].dataset.n); };
            masWrap.innerHTML = '<div class="mas-ctr-label">Centro activo</div>';
            masWrap.appendChild(mobiSel);
            masWrap.style.display = "flex";
          }
        } else {
          document.getElementById("ctr-name-hdr").textContent = ctrName;
        }
      }
    }
  } else {
    ctrId = profile.centro_id;
    // Load centro name and modulos
    if (ctrId) {
      const { data: ctr } = await sb.from("centros").select("nombre,modulos_activos,color_primario,logo_url").eq("id", ctrId).single();
      ctrName = ctr?.nombre || "Mi academia";
      modulosActivos = _conModulosBase(ctr?.modulos_activos);
      applyTheme(ctr?.color_primario, ctr?.logo_url);
      _cacheBrand(ctr?.color_primario, ctr?.logo_url);
    }
    document.getElementById("ctr-name-hdr").textContent = ctrName;
    // Notificaciones push: solo familias (fire-and-forget, no bloquea el login)
    if (role === "familia" && typeof initPushFamilias === "function") initPushFamilias();
    // Invitación a instalar la PWA: solo familias (banner descartable)
    if (role === "familia" && typeof initInstallBanner === "function") initInstallBanner();
  }

  // Load linked alumnos if familia
  if (role === "familia") {
    const { data: vinculos } = await sb
      .from("familia_alumno")
      .select("alumnos(id, nombre, curso, grupo_horario)")
      .eq("profile_id", profile.id);
    currentUserAlumnos = vinculos?.map(v => v.alumnos).filter(Boolean) || [];
  }

  // Update UI
  const ctrHdr = document.getElementById("ctr-name-hdr");
  if (ctrHdr) ctrHdr.textContent = ctrName;
  const pill = document.getElementById("role-pill");
  const roleLabels = { familia:"👨‍👩‍👧 Familia", profesional:"👩‍🏫 Profesional", admin:"⚙️ Admin", admin_institucional:"🏛️ Admin inst.", superadmin:"🔑 Superadmin" };
  pill.textContent = roleLabels[role] || role;
  pill.className = "role-pill " + (role === "familia" ? "fam" : "pro");

  // Portal familiar: solo rol familia
  const _esFam = role === "familia";
  const navFam = document.getElementById("nav-famportal");
  if (navFam) navFam.style.display = _esFam ? "flex" : "none";
  const grpFam = document.getElementById("sb-grp-familia");
  if (grpFam) grpFam.style.display = _esFam ? "" : "none";

  // ── Base limpia (Fase 0): solo el núcleo. Gestión de usuarios para dirección. ──

  // Alumnos / Matrícula (Fase 1): personal de la academia (no familia)
  const _staffAlm = ["admin","admin_institucional","director","jefatura","profesional","orientador","superadmin"].includes(role);
  const navDocencia = document.getElementById("nav-docencia");
  if (navDocencia) navDocencia.style.display = _staffAlm ? "flex" : "none";
  const navAlumnos = document.getElementById("nav-alumnos");
  if (navAlumnos) navAlumnos.style.display = _staffAlm ? "flex" : "none";
  const navGrupos = document.getElementById("nav-grupos");
  if (navGrupos) navGrupos.style.display = _staffAlm ? "flex" : "none";
  const navHorario = document.getElementById("nav-horario");
  if (navHorario) navHorario.style.display = _staffAlm ? "flex" : "none";
  const navAsistencia = document.getElementById("nav-asistencia");
  if (navAsistencia) navAsistencia.style.display = _staffAlm ? "flex" : "none";
  const navInc2 = document.getElementById("nav-incidencias2");
  if (navInc2) navInc2.style.display = _staffAlm ? "flex" : "none";
  const navNotas = document.getElementById("nav-notas");
  if (navNotas) navNotas.style.display = _staffAlm ? "flex" : "none";
  const navCalendario = document.getElementById("nav-calendario");
  if (navCalendario) navCalendario.style.display = _staffAlm ? "flex" : "none";
  const navComunic = document.getElementById("nav-comunicaciones");
  if (navComunic) navComunic.style.display = (["admin","admin_institucional","director","jefatura","superadmin"].includes(role)) ? "flex" : "none";
  const navCobros = document.getElementById("nav-cobros");
  if (navCobros) navCobros.style.display = (["admin","admin_institucional","director","jefatura","superadmin"].includes(role)) ? "flex" : "none";
  const grpGestion = document.getElementById("sb-grp-gestion");
  if (grpGestion) grpGestion.style.display = _staffAlm ? "" : "none";

  // Usuarios: gestión de cuentas y roles — solo dirección de la academia
  const usersTab = document.getElementById("tab-users");
  if (usersTab) usersTab.style.display = (["admin","admin_institucional","superadmin"].includes(role)) ? "block" : "none";
  const navUsers = document.getElementById("nav-users");
  if (navUsers) navUsers.style.display = (["admin","admin_institucional","superadmin"].includes(role)) ? "flex" : "none";

  // Show app
  document.getElementById("setup").style.display = "none";
  document.getElementById("app-hdr").style.display = "flex";
  document.getElementById("app-tabs").style.display = "flex";
  document.getElementById("app-main").style.display = "flex";

  // Leer curso_activo del centro (fire-and-forget; fallback ya está en config.js)
  sb.from("info_centro").select("curso_activo").eq("centro_id", ctrId).maybeSingle()
    .then(function(r) { if (r.data?.curso_activo) cursoActivo = r.data.curso_activo; })
    .catch(function() {});

  updateUI();
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
  // Update topbar center name (direct DOM write — updateBentoDashboard lives inside an IIFE)
  const topbarCtr = document.getElementById("topbar-ctr-name");
  if (topbarCtr) topbarCtr.textContent = n || "—";
  // Sync dashboard welcome banner (defined in app.html inline script)
  if (typeof updateBentoDashboard === 'function') updateBentoDashboard();
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
    <div class="wlc-sub">Tu asistente para <strong id="wlc-ctr">${ctrName}</strong>. Respondo preguntas sobre horarios, clases, reuniones y más.</div>
    <div class="quick-qs">
      <div class="quick-q" onclick="askQ('¿Cuándo es la próxima reunión de familias?')">¿Cuándo es la próxima reunión?</div>
      <div class="quick-q" onclick="askQ('¿Cuál es el teléfono de secretaría?')">¿Cuál es el teléfono de secretaría?</div>
      <div class="quick-q" onclick="askQ('¿Qué actividades extraescolares hay?')">¿Qué actividades extraescolares hay?</div>
    </div></div>`;
}
function showTab(t) {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
  const _tabEl = document.getElementById("tab-"+t);
  if (_tabEl) _tabEl.classList.add("active");
  const _panelEl = document.getElementById("panel-"+t);
  if (_panelEl) _panelEl.classList.add("active");
  // Base limpia (Fase 0): solo el núcleo. Los init de módulos de academia se
  // añadirán aquí a medida que se implementen.
  if (t === "users" && typeof loadUsersPanel === "function") loadUsersPanel();
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
  // También actualizar logo del wizard de onboarding (si existe)
  var onbLogoEl = document.getElementById("onb-brand-logo");
  if (onbLogoEl) {
    if (logoUrl) { onbLogoEl.src = logoUrl; onbLogoEl.style.display = ""; }
    else { onbLogoEl.style.display = "none"; }
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

// ── Marca del centro en la pantalla de LOGIN (antes de autenticar) ──
// Persiste la última marca usada en este navegador para mostrarla en el próximo login.
function _cacheBrand(color, logo) {
  try {
    if (!color && !logo) return;
    localStorage.setItem("didactia_brand", JSON.stringify({ color: color || null, logo: logo || null }));
  } catch (e) {}
}
function _readBrand() {
  try { return JSON.parse(localStorage.getItem("didactia_brand") || "null"); } catch (e) { return null; }
}

// Tematiza el login ANTES de autenticar. Detecta el centro por la URL
// (?centro=<uuid|código> · ?c=<código> · ?codigo=<código>) y, en su defecto,
// recupera la última marca usada en este navegador. Si no hay pista → marca
// DidactIA por defecto (sin error). No interviene en la autenticación.
async function themeLoginScreen() {
  try {
    var params = new URLSearchParams(window.location.search);
    var hint = (params.get("centro") || params.get("c") || params.get("codigo") || "").trim();

    if (hint && sb) {
      var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hint);
      var ctr = null;
      if (isUuid) {
        var r1 = await sb.from("centros").select("color_primario,logo_url").eq("id", hint).maybeSingle();
        ctr = r1 && r1.data;
      } else {
        var code = hint.toUpperCase();
        var r2 = await sb.from("centros")
          .select("color_primario,logo_url,codigo_familia,codigo_profesional,codigo_acceso");
        ctr = (r2 && r2.data || []).find(function (c) {
          return (c.codigo_familia && c.codigo_familia.toUpperCase() === code)
            || (c.codigo_profesional && c.codigo_profesional.toUpperCase() === code)
            || (c.codigo_acceso && c.codigo_acceso.toUpperCase() === code);
        }) || null;
      }
      if (ctr && (ctr.color_primario || ctr.logo_url)) {
        applyTheme(ctr.color_primario, ctr.logo_url);
        _cacheBrand(ctr.color_primario, ctr.logo_url);
        return;
      }
    }

    // Sin pista en la URL → recupera la última marca usada en este navegador.
    var cached = _readBrand();
    if (cached && (cached.color || cached.logo)) applyTheme(cached.color, cached.logo);
    // Si no hay nada → se conserva la marca DidactIA por defecto.
  } catch (e) {
    // Silencioso: cualquier fallo deja la marca DidactIA por defecto.
  }
}

function goHome() {
  showTab("chat");
  var msgs = document.getElementById("chat-msgs");
  if (msgs) {
    var isFam  = role === "familia";
    var title  = isFam ? "Bienvenido a tu portal familiar" : "Hola, soy DidactIA";
    var sub    = isFam
      ? "Toda la información escolar de tus hijos, al instante."
      : "Tu asistente para <strong id=\"wlc-ctr\">" + ctrName + "</strong>. Puedo responder preguntas sobre horarios, clases, reuniones y mucho más.";
    var quickQs = isFam
      ? '<div class="quick-q" onclick="askQ(\'¿Cuándo es la próxima reunión de familias?\')">¿Cuándo es la próxima reunión?</div>' +
        '<div class="quick-q" onclick="askQ(\'¿Cómo justifico una ausencia de mi hijo?\')">¿Cómo justifico una falta?</div>' +
        '<div class="quick-q" onclick="askQ(\'¿Qué actividades extraescolares hay?\')">¿Qué extraescolares hay?</div>'
      : '<div class="quick-q" onclick="askQ(\'¿Cuándo es la próxima reunión de familias?\')">¿Cuándo es la próxima reunión?</div>' +
        '<div class="quick-q" onclick="askQ(\'¿Cuál es el teléfono de secretaría?\')">¿Cuál es el teléfono de secretaría?</div>' +
        '<div class="quick-q" onclick="askQ(\'¿Qué actividades extraescolares hay?\')">¿Qué actividades extraescolares hay?</div>';
    msgs.innerHTML = '<div class="welcome" id="welcome">' +
      '<div class="wlc-ico">D</div>' +
      '<div class="wlc-title">' + title + '</div>' +
      '<div class="wlc-sub">' + sub + '</div>' +
      '<div class="quick-qs">' + quickQs + '</div>' +
      '<div id="role-cards-container" style="display:none;"><div class="role-cards" id="role-cards"></div></div>' +
      '</div>';
    applyTheme(document.documentElement.style.getPropertyValue('--ink') || null,
      document.getElementById('app-brand-logo')?.querySelector('img')?.src || null);
  }
}
