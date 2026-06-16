#!/usr/bin/env node
/**
 * verify-columns.js — QA estática de la capa de datos.
 *
 * Cruza las columnas referenciadas en las consultas Supabase del JS de `js/`
 * (`.from("tabla").select(...)/.eq(...)/.order(...)/.in(...)/.ilike(...)`, etc.)
 * contra el esquema real de la base de datos (snapshot en scripts/schema-snapshot.json).
 * Detecta la clase de bug "columna inexistente" (p.ej. `actividad` vs
 * `actividad_nombre`) que provoca errores 400 en runtime.
 *
 * Uso:
 *   node scripts/verify-columns.js              # verifica contra el snapshot versionado
 *   node scripts/verify-columns.js --refresh    # regenera el snapshot desde la BD y verifica
 *                                               # (requiere SUPABASE_MGMT_TOKEN en el entorno)
 *
 * Sale con código 1 si hay columnas referenciadas que no existen en el esquema.
 * Ignora los joins embebidos `tabla(col1,col2)` (sus columnas son de la tabla embebida).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT = path.join(__dirname, 'schema-snapshot.json');
const PROJECT_REF = 'rflfsbrdmgaidhvbuvwb';
const JS_DIR = path.join(ROOT, 'js');

// ── Refresh opcional del snapshot vía Management API ────────────────────────────
async function refreshSnapshot() {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  if (!token) {
    console.error('ERROR: --refresh necesita SUPABASE_MGMT_TOKEN en el entorno.');
    process.exit(2);
  }
  const query =
    "select table_name, string_agg(column_name, ',' order by column_name) as cols " +
    "from information_schema.columns where table_schema='public' group by table_name order by table_name;";
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    console.error(`ERROR Management API [${res.status}]: ${await res.text()}`);
    process.exit(2);
  }
  const rows = await res.json();
  const tables = {};
  rows.forEach(r => { tables[r.table_name] = r.cols.split(',').sort(); });
  const out = {
    _meta: {
      description: 'Snapshot de columnas por tabla (esquema public) para scripts/verify-columns.js. Regenerar con: node scripts/verify-columns.js --refresh (requiere SUPABASE_MGMT_TOKEN).',
      projectRef: PROJECT_REF,
      generatedAt: new Date().toISOString().split('T')[0],
      tableCount: Object.keys(tables).length,
    },
    tables,
  };
  fs.writeFileSync(SNAPSHOT, JSON.stringify(out, null, 2) + '\n');
  console.log(`🔄 Snapshot regenerado: ${out._meta.tableCount} tablas (${out._meta.generatedAt}).`);
}

// ── Parser: columnas referenciadas por tabla en js/ ────────────────────────────
const FILTER = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*["'`]([a-zA-Z_]\w*)["'`]/g;
// Quita joins embebidos `tabla(...)` para no confundir sus columnas con las de la tabla principal.
const stripEmbeds = s => s.replace(/[a-zA-Z_]\w*\s*\([^()]*\)/g, '');

function scanReferences(schemaTables) {
  const refs = {}; // { table: { col: Set(file) } }
  const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).map(f => path.join(JS_DIR, f));

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    const fromRe = /\.from\(\s*["'`]([a-zA-Z_]\w*)["'`]\s*\)/g;
    let m;
    while ((m = fromRe.exec(text))) {
      const table = m[1];
      if (!schemaTables[table]) continue; // tabla no en esquema (RPC/vista no listada) → saltar
      const start = m.index + m[0].length;
      let end = text.indexOf('.from(', start);
      if (end === -1 || end - start > 700) end = start + 700;
      const win = text.slice(start, end);
      refs[table] = refs[table] || {};

      const sel = /\.select\(\s*["'`]([^"'`]*)["'`]/.exec(win);
      if (sel) {
        stripEmbeds(sel[1]).split(',').forEach(tok => {
          tok = tok.trim();
          if (!tok || tok === '*' || tok.includes('(') || tok.includes(')') || tok.includes(':')) return;
          (refs[table][tok] = refs[table][tok] || new Set()).add(rel);
        });
      }
      let f;
      while ((f = FILTER.exec(win))) {
        (refs[table][f[2]] = refs[table][f[2]] || new Set()).add(rel);
      }
    }
  }
  return refs;
}

async function main() {
  if (process.argv.includes('--refresh')) await refreshSnapshot();

  if (!fs.existsSync(SNAPSHOT)) {
    console.error('ERROR: falta scripts/schema-snapshot.json. Genera con --refresh.');
    process.exit(2);
  }
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const schemaTables = snap.tables || {};
  const refs = scanReferences(schemaTables);

  let problemas = 0;
  for (const table of Object.keys(refs).sort()) {
    const cols = schemaTables[table];
    const bad = Object.keys(refs[table]).filter(c => !cols.includes(c));
    if (bad.length) {
      problemas++;
      console.log(`\n⚠️  ${table}:`);
      bad.forEach(c => console.log(`     "${c}"  (en ${[...refs[table][c]].join(', ')})`));
    }
  }

  console.log('');
  if (problemas) {
    console.log(`❌ ${problemas} tabla(s) con columnas referenciadas que no existen en el esquema (${snap._meta && snap._meta.generatedAt}).`);
    console.log('   Si el esquema cambió, regenera el snapshot: node scripts/verify-columns.js --refresh');
    process.exit(1);
  }
  console.log(`✅ 0 mismatches: todas las columnas referenciadas en js/ existen en el esquema (${Object.keys(schemaTables).length} tablas, snapshot ${snap._meta && snap._meta.generatedAt}).`);
}

main().catch(err => { console.error(err); process.exit(2); });
