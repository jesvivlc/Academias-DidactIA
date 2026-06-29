// One-off: descarga el texto consolidado (XML BOE) de varias normas, extrae el
// <texto> verbatim a .txt en docs/normativa/global/ y devuelve entradas de manifest.
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("docs/normativa/global");

// id BOE → metadatos de catálogo (ámbito decidido a mano: leyes CV = valenciana).
const DOCS = [
  { id: "BOE-A-2010-20015", archivo: "Ley_15-2010_autoridad_profesorado_CV.txt",
    titulo: "Ley 15/2010, de 3 de diciembre, de la Generalitat, de Autoridad del Profesorado (CV)",
    tipo: "ley", ambito: "valenciana", fecha_doc: "2010-12-03",
    source_url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-20015" },
  { id: "BOE-A-2019-1986", archivo: "Ley_26-2018_infancia_adolescencia_CV.txt",
    titulo: "Ley 26/2018, de 21 de diciembre, de la Generalitat, de derechos y garantías de la Infancia y la Adolescencia (CV)",
    tipo: "ley", ambito: "valenciana", fecha_doc: "2018-12-21",
    source_url: "https://www.boe.es/buscar/act.php?id=BOE-A-2019-1986" },
  { id: "BOE-A-2021-9347", archivo: "LO_8-2021_LOPIVI.txt",
    titulo: "Ley Orgánica 8/2021, de 4 de junio, de protección integral a la infancia y la adolescencia frente a la violencia (LOPIVI)",
    tipo: "ley", ambito: "estatal", fecha_doc: "2021-06-04",
    source_url: "https://www.boe.es/buscar/act.php?id=BOE-A-2021-9347" },
  { id: "BOE-A-2018-16673", archivo: "LO_3-2018_LOPDGDD.txt",
    titulo: "Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD)",
    tipo: "ley", ambito: "estatal", fecha_doc: "2018-12-05",
    source_url: "https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673" },
];

function decode(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");
}

function xmlToText(xml) {
  // El cuerpo articulado es el <texto> que sigue a </analisis> (los <texto>
  // previos son referencias cortas dentro de <analisis>). Greedy hasta su cierre.
  const tail = xml.split(/<\/analisis>/i).pop();
  const m = tail.match(/<texto[^>]*>([\s\S]*)<\/texto>/i);
  if (!m) return "";
  let body = m[1];
  body = body
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")        // resto de etiquetas
    .replace(/[ \t]+\n/g, "\n");
  return decode(body).replace(/\n{3,}/g, "\n\n").trim();
}

const entries = [];
for (const d of DOCS) {
  const res = await fetch(`https://www.boe.es/diario_boe/xml.php?id=${d.id}`);
  if (!res.ok) { console.error(`✗ ${d.id} HTTP ${res.status}`); continue; }
  const xml = await res.text();
  const vigente = /<estatus_derogacion[^>]*>S<\/estatus_derogacion>/i.test(xml) ? false : true;
  const text = xmlToText(xml);
  if (text.length < 500) { console.error(`✗ ${d.id} texto demasiado corto (${text.length})`); continue; }
  const header = `${d.titulo}\nFuente oficial: ${d.source_url}\n\n`;
  fs.writeFileSync(path.join(OUT_DIR, d.archivo), header + text, "utf8");
  console.log(`✓ ${d.archivo} → ${text.length} chars · vigente=${vigente} · ${d.ambito}`);
  entries.push({ archivo: d.archivo, titulo: d.titulo, tipo: d.tipo, ambito: d.ambito,
                 fecha_doc: d.fecha_doc, vigente, source_url: d.source_url });
}
fs.writeFileSync(path.join(OUT_DIR, "_boe_entries.json"), JSON.stringify(entries, null, 2));
console.log(`\n${entries.length} documentos extraídos. Entradas en _boe_entries.json`);
