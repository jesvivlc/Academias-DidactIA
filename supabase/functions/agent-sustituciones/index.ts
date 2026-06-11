import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ──────────────────────────────────────────────────────────────────────────
   agent-sustituciones — primer agente autónomo de DidactIA.
   Recibe { centro_id, fecha, tramo } + JWT del usuario (header Authorization).
   Gemini 2.5 Flash con function calling decide cuándo llamar a la única
   herramienta disponible: buscar_profesores_libres.
   Mismo patrón de llamada a Gemini que supabase/functions/chat/index.ts.
   ────────────────────────────────────────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SYSTEM_PROMPT =
  "Eres el agente de sustituciones de DidactIA. Para encontrar el mejor sustituto: " +
  "primero usa buscar_profesores_libres para obtener quién está libre, luego usa " +
  "sugerir_sustituto con esa lista para ordenar por equidad. Presenta el resultado final " +
  "como una lista corta con el número de guardias de cada uno. Nunca pidas datos al " +
  "usuario — tienes toda la información necesaria.";

const TOOL_DECLARATIONS = [
  {
    name: "buscar_profesores_libres",
    description:
      "Busca los profesores del centro que NO tienen clase asignada en una fecha y " +
      "tramo concretos — es decir, los que están libres para cubrir una guardia.",
    parameters: {
      type: "OBJECT",
      properties: {
        fecha: { type: "STRING", description: "Fecha en formato YYYY-MM-DD" },
        tramo: { type: "STRING", description: "Número de tramo horario (ej: '1', '2', '3')" },
        centro_id: { type: "STRING", description: "ID del centro (UUID)" },
      },
      required: ["fecha", "tramo", "centro_id"],
    },
  },
  {
    name: "sugerir_sustituto",
    description:
      "A partir de una lista de profesores libres, los ordena por equidad (menos guardias " +
      "hechas en el trimestre actual primero) y devuelve los 5 mejores candidatos con su " +
      "número de guardias. Úsala DESPUÉS de buscar_profesores_libres, pasándole la lista obtenida.",
    parameters: {
      type: "OBJECT",
      properties: {
        fecha: { type: "STRING", description: "Fecha en formato YYYY-MM-DD" },
        tramo: { type: "STRING", description: "Número de tramo horario (ej: '1', '2', '3')" },
        centro_id: { type: "STRING", description: "ID del centro (UUID)" },
        profesores_libres: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Lista de nombres de profesores libres devuelta por buscar_profesores_libres.",
        },
      },
      required: ["fecha", "tramo", "centro_id", "profesores_libres"],
    },
  },
];

type SB = SupabaseClient;

/* ── Helpers ── */

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* Normaliza nombres para comparar (sin tildes, minúsculas, palabras ordenadas,
   sin comas) → "Cerro, Sara" ≡ "Sara Cerro". */
function normalizarNombre(nombre: string): string {
  return String(nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes: á→a é→e í→i ó→o ú→u ü→u ñ→n
    .replace(/[.,]/g, " ")           // comas y puntos
    .split(/\s+/)                    // colapsa espacios múltiples
    .filter((w) => w.length > 1)     // elimina palabras de 1 letra
    .sort((a, b) => a.localeCompare(b)) // ordena alfabéticamente
    .join(" ")
    .trim();
}

// Placeholders del importador de cargas ("PENDIENTE-1ESOA-Mates"): no son profesores reales.
function esPlaceholder(nombre: string): boolean {
  return /^pendiente/i.test(String(nombre ?? "").trim());
}

async function callGemini(
  apiKey: string,
  contents: unknown[],
  withTools: boolean,
  systemInstruction?: string,
): Promise<Response> {
  const payload: Record<string, unknown> = { contents };
  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (withTools) {
    payload.tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
    payload.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  return fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function validarFechaTramo(fecha: string, tramo: string, centro_id: string) {
  if (!centro_id) throw new Error("Falta centro_id.");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida; usa el formato YYYY-MM-DD.");
  }
  if (tramo == null || String(tramo).trim() === "") throw new Error("Falta el tramo.");
}

/* Núcleo reutilizable: calcula los profesores libres del centro en fecha+tramo.
   Universo = profesores del centro (deduplicados por nombre normalizado, sin
   placeholders PENDIENTE). Ocupados = profesores con clase en horarios_grupo ese
   día+tramo. Libres = universo − ocupados. Filtra SIEMPRE por centro_id. */
async function _calcularLibres(
  sb: SB,
  fecha: string,
  tramo: string,
  centro_id: string,
): Promise<{ dia: string; finde: boolean; universoSize: number; libres: string[] }> {
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const diaIdx = new Date(fecha + "T12:00:00Z").getUTCDay();
  const dia = DIAS[diaIdx];
  if (diaIdx === 0 || diaIdx === 6) {
    return { dia, finde: true, universoSize: 0, libres: [] };
  }

  // Universo: Map<normalizado, display> — el primer nombre encontrado gana como display.
  const { data: profes, error: pErr } = await sb
    .from("profesores")
    .select("nombre")
    .eq("centro_id", centro_id);
  if (pErr) throw new Error(`Error al leer profesores: ${pErr.message}`);

  const universo = new Map<string, string>();
  for (const p of (profes ?? []) as { nombre: string }[]) {
    const nombre = (p.nombre ?? "").trim();
    if (!nombre || esPlaceholder(nombre)) continue;
    const key = normalizarNombre(nombre);
    if (!key) continue;
    if (!universo.has(key)) universo.set(key, nombre);
  }

  // Ocupados: profesores con clase ese día y tramo (tramo se guarda como texto).
  const { data: ocupadosRows, error: oErr } = await sb
    .from("horarios_grupo")
    .select("profesor_nombre")
    .eq("centro_id", centro_id)
    .eq("dia", dia)
    .eq("tramo", String(tramo))
    .not("profesor_nombre", "is", null);
  if (oErr) throw new Error(`Error al leer horarios: ${oErr.message}`);

  const ocupadosNorm = new Set<string>();
  for (const r of (ocupadosRows ?? []) as { profesor_nombre: string }[]) {
    const pn = (r.profesor_nombre ?? "").trim();
    if (!pn || esPlaceholder(pn)) continue;
    const key = normalizarNombre(pn);
    if (key) ocupadosNorm.add(key);
  }

  const libres = [...universo.entries()]
    .filter(([key]) => !ocupadosNorm.has(key))
    .map(([, display]) => display)
    .sort((a, b) => a.localeCompare(b, "es"));

  return { dia, finde: false, universoSize: universo.size, libres };
}

/* ── Herramienta 1: buscar_profesores_libres ── */
async function buscarProfesoresLibres(
  sb: SB,
  fecha: string,
  tramo: string,
  centro_id: string,
): Promise<string> {
  console.log("[agent-sustituciones] buscar_profesores_libres · centro_id:", centro_id, "· fecha:", fecha, "· tramo:", tramo);
  validarFechaTramo(fecha, tramo, centro_id);
  const { dia, finde, universoSize, libres } = await _calcularLibres(sb, fecha, tramo, centro_id);
  if (finde) return `El ${fecha} es ${dia}: no hay actividad lectiva, no aplica buscar guardias.`;
  if (!universoSize) return "No hay profesores registrados en este centro.";
  if (!libres.length) return `No hay profesores libres el ${fecha} (${dia}) en el tramo ${tramo}.`;
  return (
    `Profesores libres el ${fecha} (${dia}, tramo ${tramo}) — ${libres.length} de ` +
    `${universoSize}: ${libres.join(", ")}.`
  );
}

/* Trimestre actual (cálculo por mes, según la fecha de la guardia). */
function trimestreDeFecha(fecha: string): { trimestre: string; from: string; to: string } {
  const d = new Date(fecha + "T12:00:00Z");
  const mes = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  if (mes <= 3) return { trimestre: "1T", from: `${y}-01-01`, to: `${y}-03-31` };
  if (mes <= 5) return { trimestre: "2T", from: `${y}-04-01`, to: `${y}-05-31` };
  if (mes <= 8) return { trimestre: "verano", from: `${y}-06-01`, to: `${y}-08-31` };
  return { trimestre: "3T", from: `${y}-09-01`, to: `${y}-12-31` };
}

/* ── Herramienta 2: sugerir_sustituto ──
   Ordena los profesores libres por equidad (menos guardias hechas en el trimestre
   actual primero) y devuelve los 5 mejores con su conteo. */
async function sugerirSustituto(
  sb: SB,
  fecha: string,
  tramo: string,
  centro_id: string,
  profesoresLibres: unknown,
): Promise<string> {
  console.log("[agent-sustituciones] sugerir_sustituto · centro_id:", centro_id, "· fecha:", fecha, "· tramo:", tramo);
  validarFechaTramo(fecha, tramo, centro_id);

  // Lista de libres: la que pasa el modelo, o recalculada como fallback robusto.
  let libres: string[] = Array.isArray(profesoresLibres)
    ? (profesoresLibres as unknown[])
        .map((x) => String(x ?? "").trim())
        .filter((s) => s && !esPlaceholder(s))
    : [];
  if (!libres.length) {
    const r = await _calcularLibres(sb, fecha, tramo, centro_id);
    if (r.finde) return `El ${fecha} es ${r.dia}: no hay actividad lectiva, no aplica sugerir sustituto.`;
    libres = r.libres;
  }
  if (!libres.length) return "No hay profesores libres para sugerir como sustituto.";

  // Conteo de guardias del trimestre actual por profesor sustituto.
  const { trimestre, from, to } = trimestreDeFecha(fecha);
  const { data: subs, error: sErr } = await sb
    .from("sustituciones")
    .select("profesor_sustituto")
    .eq("centro_id", centro_id)
    .gte("fecha", from)
    .lte("fecha", to)
    .not("profesor_sustituto", "is", null);
  if (sErr) throw new Error(`Error al leer sustituciones: ${sErr.message}`);

  const conteoNorm = new Map<string, number>();
  for (const s of (subs ?? []) as { profesor_sustituto: string }[]) {
    const n = (s.profesor_sustituto ?? "").trim();
    if (!n) continue;
    const key = normalizarNombre(n);
    if (!key) continue;
    conteoNorm.set(key, (conteoNorm.get(key) ?? 0) + 1);
  }

  // Cruza: cada libre con sus guardias (0 si no aparece). Orden ASC, top 5.
  const ranking = libres
    .map((nombre) => ({ nombre, guardias: conteoNorm.get(normalizarNombre(nombre)) ?? 0 }))
    .sort((a, b) => a.guardias - b.guardias || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 5);

  const detalle = ranking
    .map((r) => `${r.nombre} (${r.guardias} guardia${r.guardias === 1 ? "" : "s"})`)
    .join(", ");
  return (
    `Sustitutos sugeridos por equidad (trimestre ${trimestre}, menos guardias primero): ` +
    `${detalle}.`
  );
}

/* Dispatcher: ejecuta la herramienta pedida por Gemini SIEMPRE con el centro_id
   de confianza del body (nunca el que sugiera el modelo). */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  sb: SB,
  centro_id: string,
  fecha: string,
  tramo: string,
): Promise<string> {
  const f = (args.fecha as string) ?? fecha;
  const t = (args.tramo != null ? String(args.tramo) : tramo);
  if (name === "buscar_profesores_libres") {
    return await buscarProfesoresLibres(sb, f, t, centro_id);
  }
  if (name === "sugerir_sustituto") {
    return await sugerirSustituto(sb, f, t, centro_id, args.profesores_libres);
  }
  throw new Error(`Herramienta desconocida: ${name}`);
}

/* ── Main handler ── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { centro_id, fecha, tramo } = body as {
      centro_id?: string;
      fecha?: string;
      tramo?: number | string;
    };

    if (!centro_id) return jsonRes({ error: "Falta centro_id." }, 400);
    if (!fecha) return jsonRes({ error: "Falta fecha (YYYY-MM-DD)." }, 400);
    if (tramo == null || String(tramo).trim() === "") {
      return jsonRes({ error: "Falta tramo." }, 400);
    }
    const tramoStr = String(tramo);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada.");

    // Cliente con el JWT del usuario → las consultas respetan la RLS por centro.
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Mensaje inicial: Gemini decide la secuencia de herramientas.
    let convo: unknown[] = [
      {
        role: "user",
        parts: [{
          text:
            `Encuentra el mejor sustituto para el centro ${centro_id}, fecha ${fecha}, ` +
            `tramo ${tramoStr}. Usa buscar_profesores_libres y luego sugerir_sustituto. ` +
            `Ejecuta las herramientas directamente con estos datos.`,
        }],
      },
    ];

    // Bucle de tool-calling: itera mientras Gemini llame a herramientas (con las
    // tools activas para permitir la secuencia de dos pasos). Tope de seguridad.
    const MAX_PASOS = 6;
    for (let i = 0; i < MAX_PASOS; i++) {
      const res = await callGemini(apiKey, convo, true, SYSTEM_PROMPT);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
      }
      const data = await res.json();
      const cand = data.candidates?.[0];
      if (!cand) throw new Error("Sin candidatos en la respuesta de Gemini.");

      const parts: Record<string, unknown>[] = cand.content?.parts ?? [];
      const toolCallPart = parts.find((p) => p.functionCall);

      if (!toolCallPart) {
        // Respuesta final en texto.
        const content =
          (parts.find((p) => p.text)?.text as string) ??
          "No pude determinar una sugerencia.";
        return jsonRes({ type: "text", content });
      }

      const { name, args } = toolCallPart.functionCall as {
        name: string;
        args: Record<string, unknown>;
      };

      // centro_id de confianza = el del body, nunca el que sugiera el modelo.
      const toolResult = await executeTool(name, args ?? {}, sb, centro_id, fecha, tramoStr);

      convo = [
        ...convo,
        { role: "model", parts: [{ functionCall: { name, args } }] },
        { role: "user", parts: [{ functionResponse: { name, response: { result: toolResult } } }] },
      ];
    }

    return jsonRes({ type: "text", content: "No pude completar la consulta (demasiados pasos)." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: msg }, 500);
  }
});
