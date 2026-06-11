// ── CONFIG ──
const SB_URL = "https://rflfsbrdmgaidhvbuvwb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTAxNDgsImV4cCI6MjA4Nzc2NjE0OH0.tJuFxAZCSxdukUvL9BbhdxtCbudCmmv2HLZr6qp7LPs";
const API = `${SB_URL}/functions/v1/chat`;
const ANON_KEY = SB_KEY;
// Clave pública VAPID para notificaciones push (es pública por diseño).
// TODO:VAPID_PUBLIC_KEY — sustituir por el valor real del secret VAPID_PUBLIC_KEY de Supabase.
const VAPID_PUBLIC_KEY = "TODO:VAPID_PUBLIC_KEY";

let sb = null, ctrId = null, ctrName = "", role = "familia", history = [], busy = false, cache = {};
let currentUser = null, currentUserName = "", currentUserAlumnos = [], modulosActivos = [];
let cursoActivo = '2025-26'; // se actualiza tras login leyendo info_centro.curso_activo

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
