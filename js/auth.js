// ── AUTH UI ──
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
  document.getElementById("auth-sub").textContent = "Regístrate para acceder a tu centro educativo.";
}
function showLogin() {
  _hideAuthForms();
  document.getElementById("form-login").style.display = "block";
  document.getElementById("auth-title").textContent = "Bienvenido a DidactIA";
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
    ? "Bienvenido a DidactIA. Elige una contraseña para activar tu cuenta."
    : "Introduce tu nueva contraseña para acceder a DidactIA.";
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
      ? "No encontramos este correo. Por favor, verifica que sea el mismo que diste en secretaría."
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
    errEl.textContent = "Código de centro no válido.";
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

  // Store name/email for step 2 — pass en variable de módulo, no en window
  _regPass = pass;
  window._regData = { name, email };
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
  const { name, email } = window._regData || {};
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

    if (!allCentros?.length) {
      document.getElementById("setup").style.display = "none";
      document.getElementById("app-hdr").style.display = "flex";
      document.getElementById("app-main").style.display = "flex";
      const main = document.getElementById("app-main");
      if (main) main.innerHTML = '<div style="padding:60px 24px;text-align:center;color:var(--txt3);font-size:15px;">No hay centros configurados.<br>Crea el primer centro desde el panel de Supabase.</div>';
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
      sel.innerHTML = allCentros.map(c => `<option value="${c.id}" data-n="${c.nombre}">${c.nombre}</option>`).join("");
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
        const cTab = document.getElementById("tab-comedor");
        if (cTab) cTab.style.display = modulosActivos.includes("comedor") ? "block" : "none";
        const eTab = document.getElementById("tab-espacios");
        if (eTab) eTab.style.display = modulosActivos.includes("espacios") ? "block" : "none";
        history = []; resetChat(); updateUI(); loadAdmin();
        applyTheme(ctr?.color_primario, ctr?.logo_url);
        const ibCont = document.getElementById("ib-container");
        if (ibCont) ibCont.innerHTML = "";
        const ibPanel = document.getElementById("panel-ib");
        if (ibPanel && ibPanel.classList.contains("active")) loadIbPanel();
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
        ctrName = ctr?.nombre || "Mi centro";
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
        document.getElementById("ctr-name-hdr").textContent = "Sin centros";
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
            `<option value="${c.id}" data-n="${c.nombre}" ${c.id === ctrId ? "selected" : ""}>${c.nombre}</option>`
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
            const cTab = document.getElementById("tab-comedor");
            if (cTab) cTab.style.display = modulosActivos.includes("comedor") ? "block" : "none";
            const eTab = document.getElementById("tab-espacios");
            if (eTab) eTab.style.display = modulosActivos.includes("espacios") ? "block" : "none";
            history = []; resetChat(); updateUI(); loadAdmin();
            applyTheme(ctr?.color_primario, ctr?.logo_url);
            const ibCont = document.getElementById("ib-container");
            if (ibCont) ibCont.innerHTML = "";
            const ibPanel = document.getElementById("panel-ib");
            if (ibPanel && ibPanel.classList.contains("active")) loadIbPanel();
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
      ctrName = ctr?.nombre || "Mi centro";
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

  // Show/hide admin tab based on role
  const adminTab = document.getElementById("tab-admin");
  adminTab.style.display = (["admin","admin_institucional","superadmin"].includes(role)) ? "block" : "none";

  // Show comedor tab only if module is active for this centro AND user has right role
  const comedorTab = document.getElementById("tab-comedor");
  const hasComedor = modulosActivos.includes("comedor");
  if (comedorTab) comedorTab.style.display = (hasComedor && (role === "familia" || ["profesional","admin","admin_institucional","superadmin"].includes(role))) ? "block" : "none";

  // Alumnos: directorio del centro — staff y dirección (no familia)
  const tabAlumnos = document.getElementById("tab-alumnos");
  if (tabAlumnos) tabAlumnos.style.display = (["profesional","admin","admin_institucional","superadmin","director","jefatura","orientador"].includes(role)) ? "block" : "none";

  // Pasar lista (asistencia de aula por fecha) — profesores y dirección (no familia)
  const tabPasarLista = document.getElementById("tab-pasarlista");
  if (tabPasarLista) tabPasarLista.style.display = (["profesional","admin","admin_institucional","superadmin","director","jefatura"].includes(role)) ? "block" : "none";

  // Tutorías: tutores (profesional) y familias reservan citas; admin/dirección ven resumen
  const tabTutorias = document.getElementById("tab-tutorias");
  if (tabTutorias) tabTutorias.style.display = (["profesional","admin","admin_institucional","superadmin","director","jefatura","familia"].includes(role)) ? "block" : "none";

  // Agenda del Centro: visible para todos los roles autenticados
  const navAgenda = document.getElementById("nav-agenda");
  if (navAgenda) navAgenda.style.display = "flex";
  const tabAgenda = document.getElementById("tab-agenda");
  if (tabAgenda) tabAgenda.style.display = "block";

  const tabSust = document.getElementById("tab-sust");
  if (tabSust) tabSust.style.display = (["admin","admin_institucional","profesional","superadmin"].includes(role)) ? "block" : "none";

  const tabInc = document.getElementById("tab-incidencias");
  if (tabInc) tabInc.style.display = (["profesional","admin","admin_institucional","superadmin"].includes(role)) ? "block" : "none";

  const tabEsp = document.getElementById("tab-espacios");
  if (tabEsp) tabEsp.style.display = (modulosActivos.includes("espacios") && ["profesional","admin","admin_institucional","superadmin"].includes(role)) ? "block" : "none";





  const usersTab = document.getElementById("tab-users");
  if (usersTab) usersTab.style.display = (["admin","admin_institucional","superadmin"].includes(role)) ? "block" : "none";

  const tabRrhh = document.getElementById("tab-rrhh");
  if (tabRrhh) tabRrhh.style.display = (["profesional","admin","admin_institucional","superadmin"].includes(role)) ? "block" : "none";

  // Calificaciones: profesores, dirección y familias (familia = solo lectura de sus hijos)
  const tabCal = document.getElementById("tab-calificaciones");
  if (tabCal) tabCal.style.display = (["profesional","admin","admin_institucional","superadmin","jefatura","director","familia"].includes(role)) ? "block" : "none";

  // Materiales: lectura para todos los roles del centro (incl. familia)
  const tabMat = document.getElementById("tab-materiales");
  if (tabMat) tabMat.style.display = "block";

  // Salidas: visible para profesional, admin, superadmin y familia
  const tabSal = document.getElementById("tab-salidas");
  if (tabSal) tabSal.style.display = (["profesional","admin","admin_institucional","superadmin","familia"].includes(role)) ? "block" : "none";

  const tabIb = document.getElementById("tab-ib");
  if (tabIb) {
    const isIbStaff = ["admin","admin_institucional","superadmin","profesional"].includes(role);
    const isIbFamilia = role === "familia"
      ? currentUserAlumnos.some(a => a.grupo_horario === "1IB" || a.grupo_horario === "2IB")
      : false;
    tabIb.style.display = (isIbStaff || isIbFamilia) ? "block" : "none";
  }

  const tabCom = document.getElementById("tab-comunicados");
  if (tabCom) tabCom.style.display = "block";

  const tabAvisos = document.getElementById("tab-avisos");
  if (tabAvisos) tabAvisos.style.display = role === "familia" ? "block" : "none";

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
  loadAdmin();
  setTimeout(initWelcomeExtras, 400);
  if (role === "familia") setTimeout(initFamiliaView, 300);
  setTimeout(initRealtimeNotifications, 800);
  setTimeout(_comCheckAndBadge, 1200);
  setTimeout(function() { if (typeof window._initPushButton === "function") window._initPushButton(); }, 1500);
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
  if (t === "comedor") { if (role === "familia") loadFamiliaComedor(); else loadComedor(); }
  if (t === "avisos") loadAvisos();
  if (t === "sust") {
    initSustPanel();
    var st = document.getElementById("tab-sust");
    if (st) { st.style.outline = ""; st.style.outlineOffset = ""; }
  }
  if (t === "incidencias") initIncidenciasPanel();
  if (t === "espacios") loadEspacios();
  if (t === "rrhh") loadRrhhPanel();
  if (t === "ib") loadIbPanel();
  if (t === "comunicados") initComunicadosPanel();
  if (t === "calificaciones") initCalificaciones();
  if (t === "materiales") initMateriales();
  if (t === "salidas") initSalidasPanel();
  if (t === "tutorias") initTutorias();
  if (t === "agenda") initAgenda();
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
      : "Tu asistente para <strong id=\"wlc-ctr\">" + ctrName + "</strong>. Puedo responder preguntas sobre horarios, menús, reuniones y mucho más.";
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
