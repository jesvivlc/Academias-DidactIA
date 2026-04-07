// ── CONFIG ──
const SB_URL = "https://rflfsbrdmgaidhvbuvwb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTAxNDgsImV4cCI6MjA4Nzc2NjE0OH0.tJuFxAZCSxdukUvL9BbhdxtCbudCmmv2HLZr6qp7LPs";
const API = `${SB_URL}/functions/v1/chat`;
const ANON_KEY = SB_KEY;

let sb = null, ctrId = null, ctrName = "", role = "familia", history = [], busy = false, cache = {};
let currentUser = null, currentUserName = "", currentUserAlumnos = [], modulosActivos = [];

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

  // Check if this is a password recovery redirect
  const hash = window.location.hash;
  if (hash.includes("type=recovery") || hash.includes("access_token")) {
    const params = new URLSearchParams(hash.replace("#", "?"));
    const accessToken = params.get("access_token");
    const type = params.get("type");
    if (type === "recovery" && accessToken) {
      // Set the session from the recovery token
      await sb.auth.setSession({ access_token: accessToken, refresh_token: params.get("refresh_token") || "" });
      showRecovery();
      return;
    }
  }

  // Check existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session) await loadUserProfile(session.user);
});
