/**
 * Importa 1ºESO y 3ºESO desde data/Cargas_ESO_limpia.xlsx → necesidades_lectivas
 * Uso: node scripts/importar_cargas_eso.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import XLSX from 'xlsx';

const __dir = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://rflfsbrdmgaidhvbuvwb.supabase.co';
// La service_role key se lee del entorno (NUNCA hardcodeada en el repo).
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) {
  console.error('ERROR: Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}
const CENTRO_ID   = 'ad0168e8-6c24-4597-8917-ee54cac8234b';

const XLSX_PATH   = join(__dir, '..', 'data', 'Cargas_ESO_limpia.xlsx');
const SHEET_NAME  = 'Cargas ESO';

// Grupos a importar (normalizados sin tilde en la º para comparación)
const GRUPOS_TARGET = new Set([
  '1ºESO A','1ºESO B','1ºESO C',
  '3ºESO A','3ºESO B','3ºESO C',
]);

// ── helpers ────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function profKey(s) {
  return norm(String(s == null ? '' : s).replace(/,/g, ' '))
    .split(' ').filter(Boolean).sort().join(' ');
}

async function sbFetch(path, opts = {}) {
  const { headers: extraHeaders = {}, ...restOpts } = opts;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      'apikey':         SUPABASE_KEY,
      'Authorization':  `Bearer ${SUPABASE_KEY}`,
      'Content-Type':   'application/json',
      'Prefer':         'return=representation',
      ...extraHeaders,
    },
    ...restOpts,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

// ── MAIN ───────────────────────────────────────────────────────────────────

const wb = XLSX.readFile(XLSX_PATH);
if (!wb.SheetNames.includes(SHEET_NAME)) {
  console.error('Hoja no encontrada. Disponibles:', wb.SheetNames); process.exit(1);
}
const ws   = wb.Sheets[SHEET_NAME];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log(`Filas totales en la hoja: ${rows.length}`);

// Detectar columnas reales (pueden tener tildes/mayúsculas)
const sampleKeys = rows.length ? Object.keys(rows[0]) : [];
console.log('Columnas detectadas:', sampleKeys);

function getCol(row, candidates) {
  for (const k of Object.keys(row)) {
    if (candidates.includes(norm(k))) return String(row[k]).trim();
  }
  return '';
}

// Normalizar grupo: "1ºESO A" → canónico para comparar con GRUPOS_TARGET
function normGrupo(g) {
  // Preservar tilde en º si ya la tiene, añadir si falta (e.g. "1 ESO A" → "1ºESO A")
  const s = String(g).trim()
    .replace(/^(\d)\s*[ºo°]?\s*(ESO|BAC|IB)\s*/i, (_, n, e) => `${n}º${e.toUpperCase()} `)
    .replace(/\s+/g, ' ').trim();
  return s;
}

// Filtrar filas de los 6 grupos
const filasFiltradas = rows.filter(row => {
  const g = normGrupo(getCol(row, ['grupo', 'curso', 'clase']));
  return GRUPOS_TARGET.has(g);
});
console.log(`Filas de 1ºESO+3ºESO: ${filasFiltradas.length}`);
if (!filasFiltradas.length) {
  // Show sample grupos found for debugging
  const gruposVistos = [...new Set(rows.map(r => normGrupo(getCol(r, ['grupo','curso','clase']))))].slice(0, 15);
  console.error('No se encontraron filas. Grupos vistos:', gruposVistos);
  process.exit(1);
}

// ── PASO A: contar necesidades actuales ───────────────────────────────────
const necActuales = await sbFetch(
  `/rest/v1/necesidades_lectivas?select=id&centro_id=eq.${CENTRO_ID}&limit=2000`
);
console.log(`\nNecesidades actuales en Agora: ${necActuales.length}`);

// ── PASO B: borrar necesidades_lectivas de Agora ──────────────────────────
console.log('Borrando necesidades_lectivas del centro…');
await sbFetch(
  `/rest/v1/necesidades_lectivas?centro_id=eq.${CENTRO_ID}`,
  { method: 'DELETE', headers: { 'Prefer': '' } }
);
console.log('Borradas correctamente.');

// ── PASO C: get-or-create materias ───────────────────────────────────────
const matExist = await sbFetch(`/rest/v1/materias?select=id,nombre&centro_id=eq.${CENTRO_ID}&limit=1000`);
const matByKey  = {};
matExist.forEach(m => { matByKey[norm(m.nombre)] = m.id; });

const materiasNuevas = [];
const materiasVistas  = new Map(); // normName → rawName
filasFiltradas.forEach(row => {
  const raw = getCol(row, ['materia', 'asignatura']);
  if (!raw) return;
  const k = norm(raw);
  if (!materiasVistas.has(k)) materiasVistas.set(k, raw);
});

for (const [k, rawNombre] of materiasVistas) {
  if (matByKey[k]) continue;
  const ins = await sbFetch(`/rest/v1/materias`, {
    method: 'POST',
    body: JSON.stringify({ centro_id: CENTRO_ID, nombre: rawNombre }),
    headers: { 'Prefer': 'return=representation' },
  });
  matByKey[k] = ins[0].id;
  materiasNuevas.push(rawNombre);
}
console.log(`\nMaterias: ${materiasNuevas.length} creadas, ${materiasVistas.size - materiasNuevas.length} reutilizadas`);

// ── PASO D: get-or-create profesores ─────────────────────────────────────
const profExist = await sbFetch(`/rest/v1/profesores?select=id,nombre&centro_id=eq.${CENTRO_ID}&limit=1000`);
const profByKey  = {};
profExist.forEach(p => { profByKey[profKey(p.nombre)] = p.id; });

const profesoresNuevos = [];
const profesoresVistos  = new Map(); // profKey → rawName
const placeholders = [];

filasFiltradas.forEach(row => {
  const rawProf = getCol(row, ['profesor', 'docente', 'nombre profesor']);
  const rawMat  = getCol(row, ['materia', 'asignatura']);
  const rawGrp  = normGrupo(getCol(row, ['grupo', 'curso', 'clase']));

  let nombreFinal = rawProf;
  if (!rawProf || rawProf === '?' || norm(rawProf) === '') {
    nombreFinal = `PENDIENTE-${rawGrp}-${rawMat}`;
    placeholders.push(nombreFinal);
  }

  const k = profKey(nombreFinal);
  if (!profesoresVistos.has(k)) profesoresVistos.set(k, nombreFinal);
});

for (const [k, rawNombre] of profesoresVistos) {
  if (profByKey[k]) continue;
  const ins = await sbFetch(`/rest/v1/profesores`, {
    method: 'POST',
    body: JSON.stringify({ centro_id: CENTRO_ID, nombre: rawNombre, activo: true }),
    headers: { 'Prefer': 'return=representation' },
  });
  profByKey[k] = ins[0].id;
  profesoresNuevos.push(rawNombre);
}
console.log(`Profesores: ${profesoresNuevos.length} creados, ${profesoresVistos.size - profesoresNuevos.length} reutilizados`);

// ── PASO E: insertar necesidades_lectivas ─────────────────────────────────
const necRows = [];
let sinHoras = 0, sinMateria = 0;

filasFiltradas.forEach(row => {
  const rawGrp  = normGrupo(getCol(row, ['grupo', 'curso', 'clase']));
  const rawMat  = getCol(row, ['materia', 'asignatura']);
  const rawProf = getCol(row, ['profesor', 'docente', 'nombre profesor']);
  const rawHrs  = getCol(row, ['horas', 'sesiones', 'h']);

  const horas = parseInt(rawHrs, 10);
  if (isNaN(horas) || horas <= 0) { sinHoras++; return; }

  const matId = matByKey[norm(rawMat)];
  if (!matId) { sinMateria++; return; }

  let profNomFinal = rawProf;
  if (!rawProf || rawProf === '?' || norm(rawProf) === '') {
    profNomFinal = `PENDIENTE-${rawGrp}-${rawMat}`;
  }
  const profId = profByKey[profKey(profNomFinal)];

  necRows.push({
    centro_id:       CENTRO_ID,
    grupo_horario:   rawGrp,
    materia_id:      matId,
    profesor_id:     profId || null,
    horas_semanales: horas,
  });
});

console.log(`\nFilas a insertar: ${necRows.length}  (sin horas: ${sinHoras}, sin materia: ${sinMateria})`);

// Insertar en lotes de 100
for (let i = 0; i < necRows.length; i += 100) {
  const lote = necRows.slice(i, i + 100);
  await sbFetch(`/rest/v1/necesidades_lectivas`, {
    method: 'POST',
    body: JSON.stringify(lote),
    headers: { 'Prefer': 'return=minimal' },
  });
}

// ── PASO F: verificar ─────────────────────────────────────────────────────
const inserted = await sbFetch(
  `/rest/v1/necesidades_lectivas?select=id,grupo_horario,materia_id,profesor_id,horas_semanales&centro_id=eq.${CENTRO_ID}&limit=200`
);
const nullMat  = inserted.filter(r => !r.materia_id).length;
const nullProf = inserted.filter(r => !r.profesor_id).length;

const materiasDist = new Set(inserted.map(r => r.materia_id)).size;
const profDist     = new Set(inserted.map(r => r.profesor_id).filter(Boolean)).size;

console.log('\n── RESUMEN ──────────────────────────────────────');
console.log(`Filas en BD:        ${inserted.length}`);
console.log(`Materias distintas: ${materiasDist}`);
console.log(`Profesores usados:  ${profDist}`);
console.log(`Null materia_id:    ${nullMat}`);
console.log(`Null profesor_id:   ${nullProf}`);
console.log(`Placeholders PENDIENTE creados: ${[...new Set(placeholders)].length}`);
if (placeholders.length) {
  console.log('  ' + [...new Set(placeholders)].join('\n  '));
}
console.log('────────────────────────────────────────────────\n');
