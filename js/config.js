// ── CONFIG — DidactIA Academias ──
// var en lugar de const/let para que window.SB_URL, window.sb, window.ctrId, etc.
// funcionen en los módulos que los referencian como window.X
//
// ⚠️ Backend nuevo: sustituye estos dos valores por los de tu proyecto de Supabase
// (Project Settings → API → Project URL y anon/public key).
var SB_URL = "https://izdqpsenrjcqtuhjhqxo.supabase.co";
var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZHFwc2VucmpjcXR1aGpocXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTYxNjksImV4cCI6MjA5ODU5MjE2OX0.psyWEO9aX88ZR1ZqrKzXROP7gYXSU8s34bhwPkHKF8Q";
var API = `${SB_URL}/functions/v1/chat`;
var ANON_KEY = SB_KEY;
// Clave pública VAPID para notificaciones push (es pública por diseño).
// Rellenar solo cuando se active Web Push en el nuevo backend.
var VAPID_PUBLIC_KEY = "";

var sb = null, ctrId = null, ctrName = "", role = "familia", history = [], busy = false, cache = {};
var currentUser = null, currentUserName = "", currentUserAlumnos = [], modulosActivos = [];
var cursoActivo = '2025-26'; // se actualiza tras login leyendo info_centro.curso_activo

// Base limpia (Fase 0): sin módulos operativos activados por defecto. Los módulos
// específicos de academia se irán añadiendo aquí a medida que se implementen.
var MODULOS_BASE = [];
function _conModulosBase(arr) { return [...new Set([...(arr || []), ...MODULOS_BASE])]; }

// ── BOOT ──
window.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase CDN no se ha cargado correctamente.");
    const loginErr = document.getElementById("login-err");
    if (loginErr) {
      loginErr.textContent = "No se ha podido cargar Supabase. Recarga la página.";
      loginErr.style.display = "block";
    }
    return;
  }

  sb = window.supabase.createClient(SB_URL, SB_KEY);

  // Tematiza la pantalla de login (logo + color del centro) antes de autenticar.
  // No bloquea el arranque: si no detecta centro, conserva la marca DidactIA.
  if (typeof themeLoginScreen === "function") themeLoginScreen();

  // Detect invite/recovery tokens — Supabase may embed them in the hash (#) or query (?),
  // depending on whether the project uses implicit or PKCE flow.
  let _accessToken = null, _refreshToken = null, _tokenType = null;

  const _hash = window.location.hash.replace(/^#/, "");
  const _query = window.location.search.replace(/^\?/, "");

  for (const src of [_hash, _query]) {
    if (!src) continue;
    const p = new URLSearchParams(src);
    const t = p.get("type");
    if ((t === "recovery" || t === "invite") && p.get("access_token")) {
      _accessToken  = p.get("access_token");
      _refreshToken = p.get("refresh_token") || "";
      _tokenType    = t;
      break;
    }
  }

  if (_tokenType && _accessToken) {
    await sb.auth.setSession({ access_token: _accessToken, refresh_token: _refreshToken });
    showRecovery(_tokenType);
    return;
  }

  // Check existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session) await loadUserProfile(session.user);
});
