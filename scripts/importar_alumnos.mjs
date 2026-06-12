// Importación masiva de alumnos (y vínculos de familia) desde CSV → Supabase.
// Sin dependencias. La service_role key se lee de la variable de entorno
// SUPABASE_SERVICE_ROLE_KEY (NUNCA hardcodeada en el repo).
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/importar_alumnos.mjs <csv> <centro_id> [--dry-run]
//
// CSV — cabecera flexible (acentos/sinónimos tolerados). Columnas reconocidas:
//   nombre         (obligatoria)  → alumnos.nombre
//   curso          (opcional)     → alumnos.curso          (ej. "1º ESO")
//   grupo_horario  (opcional)     → alumnos.grupo_horario  (ej. "1ESOA")
//   familia_email  (opcional)     → vincula a profiles.email (rol familia) vía familia_alumno
//   relacion       (opcional)     → familia_alumno.relacion (default "tutor")
//
// Ejemplo de CSV:
//   nombre,curso,grupo_horario,familia_email,relacion
//   Juan Pérez García,1º ESO,1ESOA,madre.juan@example.com,madre
//   Lucía Marín,1º ESO,1ESOA,,
//
// Idempotente: no duplica alumnos (dedupe por nombre normalizado dentro del centro)
// ni vínculos (por profile_id+alumno_id). Re-ejecutable sin riesgo.

import fs from "fs";

const SUPABASE_URL = "https://rflfsbrdmgaidhvbuvwb.supabase.co";
const SR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const positional = args.filter((a) => !a.startsWith("--"));
const CSV_PATH = positional[0];
const CENTRO_ID = positional[1];

function fail(msg) { console.error("ERROR: " + msg); process.exit(1); }

if (!SR_KEY) fail("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");
if (!CSV_PATH) fail("Falta la ruta del CSV. Uso: node scripts/importar_alumnos.mjs <csv> <centro_id> [--dry-run]");
if (!CENTRO_ID) fail("Falta el centro_id (UUID).");
if (!fs.existsSync(CSV_PATH)) fail("No existe el archivo: " + CSV_PATH);

const HEADERS = {
  apikey: SR_KEY,
  Authorization: "Bearer " + SR_KEY,
  "Content-Type": "application/json",
};

// ── Helpers REST ─────────────────────────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function sbInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT ${table} [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── CSV parser (comillas, comas internas, BOM) ───────────────────────────────
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/,/g, " ").split(/\s+/).filter(Boolean).sort().join(" ").trim();
}

// Mapea una cabecera del CSV a un campo conocido.
function mapHeader(h) {
  const k = norm(h).replace(/\s+/g, "_");
  if (/(^|_)nombre|alumno|name|estudiante/.test(k)) return "nombre";
  if (/curso|course|nivel/.test(k)) return "curso";
  if (/grupo|clase|aula|group/.test(k)) return "grupo_horario";
  if (/familia.*mail|mail.*familia|tutor.*mail|mail/.test(k)) return "familia_email";
  if (/relacion|parentesco|relation/.test(k)) return "relacion";
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const rows = parseCSV(fs.readFileSync(CSV_PATH, "utf8"));
  if (rows.length < 2) fail("El CSV no tiene filas de datos.");

  const headerCols = rows[0].map(mapHeader);
  if (!headerCols.includes("nombre")) {
    fail('El CSV debe tener una columna de nombre (cabeceras detectadas: ' + rows[0].join(", ") + ")");
  }
  const idx = {};
  headerCols.forEach((c, i) => { if (c && idx[c] === undefined) idx[c] = i; });

  const data = rows.slice(1).map((r) => ({
    nombre: (r[idx.nombre] ?? "").trim(),
    curso: idx.curso != null ? (r[idx.curso] ?? "").trim() : "",
    grupo_horario: idx.grupo_horario != null ? (r[idx.grupo_horario] ?? "").trim() : "",
    familia_email: idx.familia_email != null ? (r[idx.familia_email] ?? "").trim().toLowerCase() : "",
    relacion: idx.relacion != null ? (r[idx.relacion] ?? "").trim() : "",
  })).filter((x) => x.nombre);

  console.log(`CSV: ${data.length} filas con nombre. Centro: ${CENTRO_ID}${DRY ? "  [DRY-RUN]" : ""}`);

  // Alumnos existentes del centro → dedupe por nombre normalizado
  const existentes = await sbGet(`alumnos?centro_id=eq.${CENTRO_ID}&select=id,nombre,curso,grupo_horario`);
  const porNombre = new Map();
  existentes.forEach((a) => porNombre.set(norm(a.nombre), a));

  let creados = 0, yaExistian = 0, vinculos = 0, sinPerfilFamilia = 0;
  const aInsertar = [];

  for (const row of data) {
    const key = norm(row.nombre);
    if (!porNombre.has(key)) {
      aInsertar.push(row);
    } else {
      yaExistian++;
    }
  }

  // Insertar alumnos nuevos (en bloque)
  if (aInsertar.length && !DRY) {
    const payload = aInsertar.map((r) => ({
      centro_id: CENTRO_ID, nombre: r.nombre,
      curso: r.curso || null, grupo_horario: r.grupo_horario || null,
    }));
    const inserted = await sbInsert("alumnos", payload);
    inserted.forEach((a) => porNombre.set(norm(a.nombre), a));
    creados = inserted.length;
  } else if (aInsertar.length) {
    creados = aInsertar.length; // dry-run: solo contar
  }

  // Vínculos de familia (para filas con familia_email)
  for (const row of data) {
    if (!row.familia_email) continue;
    const alumno = porNombre.get(norm(row.nombre));
    if (!alumno || !alumno.id) continue; // en dry-run los nuevos no tienen id → se omite

    const perfiles = await sbGet(
      `profiles?email=eq.${encodeURIComponent(row.familia_email)}&centro_id=eq.${CENTRO_ID}&select=id`,
    );
    if (!perfiles.length) { sinPerfilFamilia++; continue; }
    const profileId = perfiles[0].id;

    const yaVinc = await sbGet(
      `familia_alumno?profile_id=eq.${profileId}&alumno_id=eq.${alumno.id}&select=id`,
    );
    if (yaVinc.length) continue;

    if (!DRY) {
      await sbInsert("familia_alumno", [{
        profile_id: profileId, alumno_id: alumno.id, relacion: row.relacion || "tutor",
      }]);
    }
    vinculos++;
  }

  console.log("\n── Resumen ──");
  console.log(`  Alumnos creados:        ${creados}`);
  console.log(`  Ya existían (omitidos): ${yaExistian}`);
  console.log(`  Vínculos de familia:    ${vinculos}`);
  if (sinPerfilFamilia) console.log(`  ⚠ familia_email sin perfil en el centro: ${sinPerfilFamilia} (la familia debe registrarse/ser invitada primero)`);
  if (DRY) console.log("  (DRY-RUN: no se escribió nada)");
})().catch((e) => fail(e.message));
