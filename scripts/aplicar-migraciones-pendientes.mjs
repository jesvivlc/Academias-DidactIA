// Aplica las migraciones pendientes vía Supabase Management API.
// Uso (con tu token sbp_ de Account → Access Tokens):
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/aplicar-migraciones-pendientes.mjs
//
// No persiste el token: se lee solo del entorno para esta ejecución.
import { readFileSync } from "node:fs";

const REF = "rflfsbrdmgaidhvbuvwb";
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token || !token.startsWith("sbp_")) {
  console.error("❌  Falta SUPABASE_ACCESS_TOKEN (token sbp_ de Supabase → Account → Access Tokens).");
  console.error("    Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/aplicar-migraciones-pendientes.mjs");
  process.exit(1);
}

const MIGRACIONES = [
  "supabase/migrations/ia_cache.sql",
  "supabase/migrations/calificaciones_competenciales.sql",
];

async function ejecutar(path) {
  const sql = readFileSync(path, "utf8");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`❌  ${path} → HTTP ${res.status}: ${body.slice(0, 500)}`);
    return false;
  }
  console.log(`✅  ${path} aplicada.`);
  return true;
}

let ok = 0;
for (const m of MIGRACIONES) {
  if (await ejecutar(m)) ok++;
}

// Verificación: RLS de las tablas creadas
const check = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    query: "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('ia_cache','comentarios_competenciales') ORDER BY tablename;",
  }),
});
console.log("\nVerificación:", await check.text());
console.log(`\n${ok}/${MIGRACIONES.length} migraciones aplicadas.`);
