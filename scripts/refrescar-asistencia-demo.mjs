// Rellena la asistencia demo de EducaMentes desde la última fecha registrada
// hasta hoy, vía REST bajo RLS (login admin). Replica la lógica del seed
// (sql/demo-seed-academias.sql §7): reparte presente/retraso/ausente/justificada
// de forma determinista por alumno+fecha, con ~1 de cada 9 alumnos "en riesgo".
// Idempotente: upsert con ignore-duplicates sobre UNIQUE(centro,alumno,fecha,grupo).
//
// Uso: DEMO_PASS='...' node scripts/refrescar-asistencia-demo.mjs
//      (DEMO_EMAIL opcional; por defecto el admin demo)

import { readFileSync } from "node:fs";

const cfg = readFileSync(new URL("../js/config.js", import.meta.url), "utf8");
const SB_URL = cfg.match(/https:\/\/[a-z0-9]+\.supabase\.co/)[0];
const KEY = cfg.match(/eyJ[A-Za-z0-9_.-]+/)[0];
const EMAIL = process.env.DEMO_EMAIL || "jesvivlc@gmail.com";
const PASS = process.env.DEMO_PASS;
if (!PASS) { console.error("Falta DEMO_PASS."); process.exit(1); }

const login = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
}).then(r => r.json());
if (!login.access_token) { console.error("Login fallido:", login.msg || login.error_description); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${login.access_token}`, "Content-Type": "application/json" };
const get = (path) => fetch(`${SB_URL}/rest/v1/${path}`, { headers: H }).then(r => r.json());

// hash determinista (mismo espíritu que hashtext del seed; no idéntico, no importa)
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function estadoPara(alumnoId, fecha) {
  const enRiesgo = hash(alumnoId) % 9 === 0;
  const r = hash(alumnoId + fecha) % 100;
  if (r < (enRiesgo ? 34 : 8)) return "ausente";
  if (r < 15) return "retraso";
  if (r < 18) return "justificada";
  return "presente";
}

const [ultima] = await get("asistencia?select=fecha,centro_id&order=fecha.desc&limit=1");
if (!ultima) { console.error("No hay asistencia previa; ejecuta antes el seed completo."); process.exit(1); }
const centroId = ultima.centro_id;

const sesiones = await get(`grupo_sesiones?select=grupo_id,dia_semana&centro_id=eq.${centroId}`);
const mg = await get(`matricula_grupo?select=grupo_id,matriculas!inner(alumno_id,estado)&centro_id=eq.${centroId}&matriculas.estado=eq.activa`);
const alumnosPorGrupo = {};
for (const row of mg) {
  (alumnosPorGrupo[row.grupo_id] ??= []).push(row.matriculas.alumno_id);
}

const desde = new Date(ultima.fecha + "T00:00:00Z");
desde.setUTCDate(desde.getUTCDate() + 1);
const hoy = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

const filas = [];
for (let d = new Date(desde); d <= hoy; d.setUTCDate(d.getUTCDate() + 1)) {
  const fecha = d.toISOString().slice(0, 10);
  const isodow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  for (const s of sesiones.filter(x => x.dia_semana === isodow)) {
    for (const alumnoId of alumnosPorGrupo[s.grupo_id] || []) {
      filas.push({
        centro_id: centroId, alumno_id: alumnoId, grupo_id: s.grupo_id,
        fecha, estado: estadoPara(alumnoId, fecha), notificado_familia: true,
      });
    }
  }
}
console.log(`Rango ${desde.toISOString().slice(0,10)} → ${hoy.toISOString().slice(0,10)}: ${filas.length} filas a insertar.`);
if (!filas.length) { console.log("Nada que hacer: la asistencia ya está al día."); process.exit(0); }

for (let i = 0; i < filas.length; i += 500) {
  const lote = filas.slice(i, i + 500);
  const res = await fetch(`${SB_URL}/rest/v1/asistencia?on_conflict=centro_id,alumno_id,fecha,grupo_id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(lote),
  });
  if (!res.ok) { console.error("Error insertando lote:", await res.text()); process.exit(1); }
  console.log(`  lote ${i / 500 + 1}: ${lote.length} filas OK`);
}
console.log("✅ Asistencia demo al día.");
