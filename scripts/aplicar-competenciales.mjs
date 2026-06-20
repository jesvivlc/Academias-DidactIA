// Aplica la migración comentarios_competenciales.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/aplicar-competenciales.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF   = 'rflfsbrdmgaidhvbuvwb';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token && !srKey) {
  console.error('❌  Falta SUPABASE_ACCESS_TOKEN o SUPABASE_SERVICE_ROLE_KEY');
  console.error('    Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/aplicar-competenciales.mjs');
  process.exit(1);
}

const sql = readFileSync(
  join(__dir, '../supabase/migrations/calificaciones_competenciales.sql'),
  'utf8'
);

async function run() {
  if (token) {
    // Vía Management API
    const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: sql }),
    });
    const body = await r.json();
    if (!r.ok) { console.error('❌', JSON.stringify(body, null, 2)); process.exit(1); }
    console.log('✅ Migración aplicada vía Management API.');
  } else {
    // Vía service role (PostgREST rpc)
    const url = `https://${REF}.supabase.co/rest/v1/rpc/exec_sql`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: srKey,
        Authorization: `Bearer ${srKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('❌', t);
      console.error('\nAlternativa: ejecuta el SQL en https://supabase.com/dashboard/project/rflfsbrdmgaidhvbuvwb/sql/new');
      process.exit(1);
    }
    console.log('✅ Migración aplicada vía service role.');
  }
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
