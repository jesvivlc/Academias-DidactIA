// Ejecuta sql/calidad-tables.sql en Supabase vía Management API.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/ejecutar-calidad-tables.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const sql    = readFileSync(join(__dir, '../sql/calidad-tables.sql'), 'utf8');
const token  = process.env.SUPABASE_ACCESS_TOKEN;
const ref    = 'rflfsbrdmgaidhvbuvwb';

if (!token) {
  console.error('❌  Falta SUPABASE_ACCESS_TOKEN');
  console.error('    Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/ejecutar-calidad-tables.mjs');
  process.exit(1);
}

console.log('▶  Ejecutando sql/calidad-tables.sql en proyecto', ref, '…');

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ query: sql })
});

const body = await res.json().catch(() => res.text());

if (!res.ok) {
  console.error('❌  Error HTTP', res.status);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log('✅  Tablas de Calidad creadas correctamente.');
console.log(JSON.stringify(body, null, 2));
