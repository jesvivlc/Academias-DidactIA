// Importar horarios profesores Agora Lledó — versión Node.js (sin dependencias)
// Uso: node scripts/importar_horarios_profes.mjs

import fs from "fs";

// ── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://rflfsbrdmgaidhvbuvwb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE5MDE0OCwiZXhwIjoyMDg3NzY2MTQ4fQ.OHKwIXQK59zJTIzULkCWcMaW9w37t3Uwa8tvswPw23w";
const CENTRO_ID   = "ad0168e8-6c24-4597-8917-ee54cac8234b";
const CSV_PATH    = new URL("./A%20Horarios%20profes%20TODOS%2025-26(Hoja1).csv", import.meta.url).pathname
  .replace(/^\/([A-Z]:)/, "$1")
  .replace(/%20/g, " ")
  .replace(/%28/g, "(")
  .replace(/%29/g, ")");
// ─────────────────────────────────────────────────────────────────────────────

const TRAMOS = {
  "7:55":  [0, "07:55:00", "08:50:00"],
  "8:50":  [1, "08:50:00", "09:45:00"],
  "9:45":  [2, "09:45:00", "10:40:00"],
  "10:40": [3, "10:40:00", "11:35:00"],
  "12:00": [4, "12:00:00", "12:55:00"],
  "12:55": [5, "12:55:00", "13:50:00"],
  "13:50": [6, "13:50:00", "14:45:00"],
  "15:10": [7, "15:10:00", "16:05:00"],
  "16:05": [8, "16:05:00", "17:00:00"],
};

const DIAS    = ["lunes", "martes", "miercoles", "jueves", "viernes"];
const IGNORAR = ["patio", "comida", "claustro"];
// BA[AB] cubre 1BAA/1BAB/2BAA/2BAB (Bachillerato Agora); BI como variante de IB
const GRUPO_RE = /\b([1-4](?:ESO|BAC|BA[AB]|IB|BI|FPB?|CF[A-Z]*)[\s]?[A-D]?)\b/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

function extraerGrupo(actividad) {
  const m = GRUPO_RE.exec(actividad);
  if (!m) return "";
  let g = m[1].replace(/\s/g, "").toUpperCase();
  // Normalizar BAA→BACA, BAB→BACB (notación Agora → notación canónica)
  g = g.replace(/^([1-4])BA([AB])$/, (_, n, l) => `${n}BAC${l}`);
  // Normalizar BI→IB (variante de IB usada en algunas celdas)
  g = g.replace(/^([1-4])BI$/, (_, n) => `${n}IB`);
  return g;
}

function parseHora(horaStr) {
  const s = horaStr.trim();
  for (const [key, info] of Object.entries(TRAMOS)) {
    if (s.startsWith(key)) return info;
  }
  return null;
}

function esVacia(line) {
  return line.trim().replace(/,/g, "").trim() === "";
}

function parseCsvRow(line) {
  // Soporta campos entre comillas dobles con comas internas
  const result = [];
  let inQuote = false, cur = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; }
    else if (c === "," && !inQuote) { result.push(cur); cur = ""; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

// ── Parser de bloques ─────────────────────────────────────────────────────────

function parseBloques(content) {
  const lines = content.split(/\r?\n/);
  const bloques = [];
  let bloque = [];
  for (const line of lines) {
    if (esVacia(line)) {
      if (bloque.length) { bloques.push(bloque); bloque = []; }
    } else {
      bloque.push(line);
    }
  }
  if (bloque.length) bloques.push(bloque);
  return bloques;
}

function procesarBloque(bloque) {
  if (bloque.length < 3) return [null, []];

  const nombreRow = parseCsvRow(bloque[0]);
  const nombre = nombreRow[0].trim().replace(/^"|"$/g, "").trim();

  const registros = [];
  for (let i = 2; i < bloque.length; i++) {
    const partes = parseCsvRow(bloque[i]);
    const horaStr = (partes[0] || "").trim();

    if (IGNORAR.some(ig => horaStr.toLowerCase().includes(ig))) continue;

    const tramoInfo = parseHora(horaStr);
    if (!tramoInfo) continue;

    const [tramoNum, horaInicio, horaFin] = tramoInfo;

    for (let col = 1; col <= 5; col++) {
      const actividad = (partes[col] || "").trim();
      if (!actividad) continue;
      if (IGNORAR.some(ig => actividad.toLowerCase().includes(ig))) continue;

      registros.push({
        centro_id:        CENTRO_ID,
        profesor_nombre:  nombre,
        dia:              DIAS[col - 1],
        hora_inicio:      horaInicio,
        hora_fin:         horaFin,
        tramo:            tramoNum,
        actividad_nombre: actividad,
        grupo_horario:    extraerGrupo(actividad),
      });
    }
  }

  return [nombre, registros];
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────

async function sbDelete(profesores) {
  // Supabase REST no soporta IN con delete en un paso simple — borramos en lotes de 1
  // Usamos filter=profesor_nombre=in.(a,b,c)
  const nombres = profesores.map(n => `"${n.replace(/"/g, '\\"')}"`).join(",");
  const url = `${SUPABASE_URL}/rest/v1/horarios_grupo?centro_id=eq.${CENTRO_ID}&profesor_nombre=in.(${encodeURIComponent(nombres)})`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`DELETE failed ${r.status}: ${txt}`);
  }
}

async function sbInsert(rows) {
  const url = `${SUPABASE_URL}/rest/v1/horarios_grupo`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`INSERT failed ${r.status}: ${txt}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error("ERROR: CSV no encontrado en:", CSV_PATH);
    process.exit(1);
  }

  // Latin-1 para preservar acentos del CSV
  const content = fs.readFileSync(CSV_PATH, "latin1");

  console.log("Parseando CSV...");
  const bloques = parseBloques(content);
  console.log(`  Bloques encontrados: ${bloques.length}`);

  const datos = {};
  for (const bloque of bloques) {
    const [nombre, registros] = procesarBloque(bloque);
    if (nombre && registros.length) {
      datos[nombre] = registros;
    } else if (nombre) {
      console.log(`  AVISO: ${nombre} → sin registros válidos`);
    }
  }

  const profesores = Object.keys(datos);
  if (!profesores.length) {
    console.log("No se encontraron datos válidos.");
    process.exit(0);
  }

  const totalReg = Object.values(datos).reduce((s, r) => s + r.length, 0);
  console.log(`\nProfesores a importar: ${profesores.length}`);
  console.log(`Registros totales: ${totalReg}`);

  console.log("\nEliminando registros existentes...");
  await sbDelete(profesores);
  console.log("  Hecho.");

  console.log("\nInsertando...");
  let insertados = 0;
  for (const [nombre, registros] of Object.entries(datos)) {
    // Lotes de 500
    for (let i = 0; i < registros.length; i += 500) {
      await sbInsert(registros.slice(i, i + 500));
    }
    console.log(`  ${nombre}: ${registros.length} registros`);
    insertados += registros.length;
  }

  console.log(`\n✅ Importación completada: ${insertados} registros para ${profesores.length} profesores.`);
}

main().catch(err => { console.error("ERROR:", err.message); process.exit(1); });
