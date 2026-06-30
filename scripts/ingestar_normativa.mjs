// ============================================================================
// ingestar_normativa.mjs — Ingesta de normativa al RAG (kb_chunks). Fase 1.
// ----------------------------------------------------------------------------
// Lee los manifest.json de docs/normativa/, trocea cada documento, lo embebe con
// Gemini gemini-embedding-001 (768 dims) e inserta los fragmentos en kb_chunks.
// Idempotente: borra los fragmentos previos de cada documento antes de reinsertar.
//
// Formatos de documento admitidos:
//   .txt / .md  → se leen directamente (sin dependencias).
//   .pdf        → requiere `npm i pdf-parse` (se carga de forma perezosa). Si no
//                 está instalado, avisa y omite ese documento.
//
// Credenciales (NUNCA hardcodeadas) — variables de entorno:
//   SUPABASE_SERVICE_ROLE_KEY   (escribe en kb_chunks, bypass RLS)
//   GEMINI_API_KEY              (embeddings)
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=… GEMINI_API_KEY=… node scripts/ingestar_normativa.mjs [carpeta] [--dry-run]
//   · sin argumentos → procesa docs/normativa/global + docs/normativa/centro/<slug>/
//   · [carpeta]      → procesa sólo esa carpeta (debe contener un manifest.json)
//   · --dry-run      → trocea y cuenta, pero NO embebe ni inserta
//
// Estructura esperada (ver docs/normativa/README.md):
//   docs/normativa/global/manifest.json            (scope global; ambito por doc)
//   docs/normativa/centro/<slug>/manifest.json     (scope centro; centro_slug en el manifest)
// ============================================================================
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://rflfsbrdmgaidhvbuvwb.supabase.co";
const SR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const positional = args.filter((a) => !a.startsWith("--"));
const ROOT = path.resolve("docs/normativa");

// Troceado: ~900 caracteres por fragmento con ~150 de solape, cortando por párrafos.
const CHUNK_CHARS = 900;
const OVERLAP_CHARS = 150;

function fail(msg) { console.error("ERROR: " + msg); process.exit(1); }
function info(msg) { console.log(msg); }

if (!SR_KEY) fail("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");
if (!DRY && !GEMINI_KEY) fail("Falta GEMINI_API_KEY en el entorno (necesaria salvo en --dry-run).");

const HEADERS = {
  apikey: SR_KEY,
  Authorization: "Bearer " + SR_KEY,
  "Content-Type": "application/json",
};

// ── Helpers REST ─────────────────────────────────────────────────────────────
async function sbGet(pathq) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathq}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${pathq} [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function sbDelete(pathq) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathq}`, { method: "DELETE", headers: HEADERS });
  if (!res.ok) throw new Error(`DELETE ${pathq} [${res.status}]: ${(await res.text()).slice(0, 200)}`);
}
async function sbInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT ${table} [${res.status}]: ${(await res.text()).slice(0, 300)}`);
}

// ── Embeddings (Gemini gemini-embedding-001 → 768 dims, Matryoshka) ───────────
// outputDimensionality:768 para casar con kb_chunks.embedding vector(768).
// taskType RETRIEVAL_DOCUMENT (la consulta usa RETRIEVAL_QUERY en la EF kb-ask).
const EMBED_MODEL = "gemini-embedding-001";
async function embed(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`;
  const MAX = 6;
  for (let i = 0; i < MAX; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: 768,
          taskType: "RETRIEVAL_DOCUMENT",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const values = data?.embedding?.values;
        if (Array.isArray(values)) return values;
        throw new Error("respuesta sin 'values'");
      }
      // Rate-limit / server: backoff progresivo (hasta ~12s) — tandas largas.
      if (res.status === 429 || res.status >= 500) { await sleep(Math.min(2000 * (i + 1), 12000)); continue; }
      throw new Error(`embed [${res.status}]: ${(await res.text()).slice(0, 160)}`);
    } catch (e) {
      if (i === MAX - 1) throw e;
      await sleep(Math.min(1500 * (i + 1), 12000));
    }
  }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Extracción de texto por formato ──────────────────────────────────────────
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt" || ext === ".md") {
    return fs.readFileSync(filePath, "utf8");
  }
  if (ext === ".pdf") {
    let PDFParse;
    try {
      ({ PDFParse } = await import("pdf-parse")); // pdf-parse v2 (clase PDFParse)
    } catch {
      throw new Error(
        `'${path.basename(filePath)}' es PDF y falta la dependencia 'pdf-parse'. ` +
        `Instálala (npm i pdf-parse) o aporta el documento en .txt/.md.`
      );
    }
    const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(filePath)) });
    const res = await parser.getText();
    return res.text || "";
  }
  throw new Error(`Formato no soportado: ${ext} (usa .txt, .md o .pdf)`);
}

// ── Troceado por párrafos con solape ─────────────────────────────────────────
function chunk(text) {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if (buf && (buf.length + p.length + 2) > CHUNK_CHARS) {
      chunks.push(buf.trim());
      buf = buf.slice(Math.max(0, buf.length - OVERLAP_CHARS)); // arrastra solape
    }
    buf += (buf ? "\n\n" : "") + p;
    // Párrafo solo mayor que el límite → trocéalo duro.
    while (buf.length > CHUNK_CHARS * 1.6) {
      chunks.push(buf.slice(0, CHUNK_CHARS).trim());
      buf = buf.slice(CHUNK_CHARS - OVERLAP_CHARS);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter((c) => c.length > 40); // descarta fragmentos triviales
}

// ── Procesa una carpeta con manifest.json ────────────────────────────────────
async function procesarCarpeta(dir) {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    info(`· (sin manifest) ${dir} → omitido`);
    return { docs: 0, chunks: 0 };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const scope = manifest.scope === "centro" ? "centro" : "global";

  let centroId = null;
  if (scope === "centro") {
    const slug = manifest.centro_slug;
    if (!slug) throw new Error(`${manifestPath}: scope 'centro' requiere 'centro_slug'`);
    const rows = await sbGet(`centros?slug=eq.${encodeURIComponent(slug)}&select=id,ccaa`);
    if (!rows.length) throw new Error(`No existe centro con slug '${slug}'`);
    centroId = rows[0].id;
  }

  let totalChunks = 0;
  const documentos = manifest.documentos || [];
  for (const doc of documentos) {
    if (doc.archivo && doc.archivo.startsWith("_")) continue; // permite comentarios
    const filePath = path.join(dir, doc.archivo);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ falta el archivo: ${doc.archivo} → omitido`);
      continue;
    }
    let text;
    try {
      text = await extractText(filePath);
    } catch (e) {
      console.warn(`  ⚠ ${e.message}`);
      continue;
    }
    const pieces = chunk(text);
    const ambito = scope === "global" ? (doc.ambito || "estatal") : "estatal";
    info(`  · ${doc.titulo || doc.archivo} → ${pieces.length} fragmentos (${ambito})`);
    totalChunks += pieces.length;

    if (DRY) continue;

    // Idempotencia: borra los fragmentos previos de este documento.
    const delFilter = scope === "centro"
      ? `kb_chunks?scope=eq.centro&centro_id=eq.${centroId}&doc_titulo=eq.${encodeURIComponent(doc.titulo)}`
      : `kb_chunks?scope=eq.global&doc_titulo=eq.${encodeURIComponent(doc.titulo)}`;
    await sbDelete(delFilter);

    // Embebe e inserta por lotes.
    const rows = [];
    for (let i = 0; i < pieces.length; i++) {
      const embedding = await embed(pieces[i]);
      rows.push({
        scope,
        centro_id: centroId,
        ambito,
        doc_titulo: doc.titulo || doc.archivo,
        doc_tipo: doc.tipo || "otro",
        fecha_doc: doc.fecha_doc || null,
        vigente: doc.vigente !== false,
        chunk_index: i,
        chunk_text: pieces[i],
        embedding,
        source_url: doc.source_url || null,
      });
      if (rows.length >= 20) { await sbInsert("kb_chunks", rows.splice(0)); }
    }
    if (rows.length) await sbInsert("kb_chunks", rows);
  }
  return { docs: documentos.length, chunks: totalChunks };
}

// ── Recolecta las carpetas a procesar ────────────────────────────────────────
function carpetasObjetivo() {
  if (positional[0]) return [path.resolve(positional[0])];
  const dirs = [];
  const global = path.join(ROOT, "global");
  if (fs.existsSync(path.join(global, "manifest.json"))) dirs.push(global);
  const centroRoot = path.join(ROOT, "centro");
  if (fs.existsSync(centroRoot)) {
    for (const slug of fs.readdirSync(centroRoot)) {
      const d = path.join(centroRoot, slug);
      if (fs.statSync(d).isDirectory() && fs.existsSync(path.join(d, "manifest.json"))) dirs.push(d);
    }
  }
  return dirs;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const dirs = carpetasObjetivo();
  if (!dirs.length) fail(`No hay carpetas con manifest.json bajo ${ROOT}. Crea docs/normativa/global/manifest.json (ver README).`);

  info(`Ingesta de normativa${DRY ? " (DRY-RUN, sin escribir)" : ""}:`);
  let docs = 0, chunks = 0;
  for (const dir of dirs) {
    info(`\n▸ ${path.relative(process.cwd(), dir)}`);
    const r = await procesarCarpeta(dir);
    docs += r.docs; chunks += r.chunks;
  }
  info(`\n${DRY ? "[DRY] " : "✓ "}${docs} documento(s), ${chunks} fragmento(s)${DRY ? " (no insertados)" : " insertados en kb_chunks"}.`);
})().catch((e) => fail(e.message));
