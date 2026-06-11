import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ──────────────────────────────────────────────────────────────────────────
   agent-sustituciones — agente autónomo de sustituciones de DidactIA.
   Recibe { centro_id, fecha } (+ tramo opcional, ya no se usa a nivel global)
   + JWT del usuario (header Authorization). Gemini 2.5 Flash con function
   calling. El agente SOLO actúa si hay ausencias sin cubrir.
   Flujo: obtener_ausencias_sin_cubrir → (por cada una) buscar_profesores_libres
   → sugerir_sustituto. Mismo patrón de Gemini que chat/index.ts.
   ────────────────────────────────────────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SYSTEM_PROMPT =
  "Eres el agente de sustituciones de DidactIA.\n" +
  "Flujo obligatorio:\n" +
  "1. Llama SIEMPRE primero a obtener_ausencias_sin_cubrir para ver si hay trabajo.\n" +
  "2. Si no hay ausencias: responde 'No hay ausencias sin cubrir hoy.' y para.\n" +
  "3. Si hay ausencias: para CADA ausencia llama a buscar_profesores_libres y luego a sugerir_sustituto.\n" +
  "4. Presenta el resultado como: [Grupo] [Tramo] — Ausente: [nombre] → Sugeridos: [nombre (N guardias)], [nombre (N guardias)], [nombre (N guardias)]\n" +
  "Nunca pidas datos al usuario. Tienes toda la información necesaria.";

const TOOL_DECLARATIONS = [
  {
    name: "obtener_ausencias_sin_cubrir",
    description:
      "Devuelve las ausencias del centro en una fecha que todavía NO están cubiertas ni " +
      "tienen sustituto asignado. Llámala SIEMPRE primero: si devuelve una lista vacía, no " +
      "hay trabajo que hacer.",
    parameters: {
      type: "OBJECT",
      properties: {
        fecha: { type: "STRING", description: "Fecha en formato YYYY-MM-DD" },
        centro_id: { type: "STRING", description: "ID del centro (UUID)" },
      },
      required: ["fecha", "centro_id"],
    },
  },
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
      "hechas en el trimestre actual primero) y devuelve los 3 mejores candidatos con su " +
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

/* Normaliza nombres para comparar y deduplicar:
   minúsculas + sin tildes + sin comas/puntos + tokens ordenados alfabéticamente
   (descarta tokens de 1 letra) → "Cerro, Sara" ≡ "Sara Cerro". */
function normalizarNombre(nombre: string): string {
  return String(nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes: á→a é→e í→i ó→o ú→u ü→u ñ→n
    .replace(/[.,]/g, " ") // comas y puntos
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .sort((a, b) => a.localeCompare(b))
    .join(" ")
    .trim();
}

/* Nombre no válido como profesor real: placeholder del importador ("PENDIENTE-…")
   o nombre con caracteres basura (? o /), típicos de filas mal importadas. */
function nombreInvalido(nombre: string): boolean {
  const n = String(nombre ?? "").trim();
  if (!n) return true;
  if (/^pendiente/i.test(n)) return true;
  if (/[?/]/.test(n)) return true;
  return false;
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

function validarFecha(fecha: string, centro_id: string) {
  if (!centro_id) throw new Error("Falta centro_id.");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida; usa el formato YYYY-MM-DD.");
  }
}
function validarTramo(tramo: string) {
  if (tramo == null || String(tramo).trim() === "") throw new Error("Falta el tramo.");
}

/* ── Herramienta 1: obtener_ausencias_sin_cubrir ──
   Ausencias del centro en la fecha que NO están cubiertas ni tienen sustituto.
   Filtra SIEMPRE por centro_id (el de confianza del body). */
async function obtenerAusenciasSinCubrir(
  sb: SB,
  fecha: string,
  centro_id: string,
): Promise<string> {
  console.log("[agent-sustituciones] obtener_ausencias_sin_cubrir · centro_id:", centro_id, "· fecha:", fecha);
  validarFecha(fecha, centro_id);

  const { data, error } = await sb
    .from("sustituciones")
    .select("id, grupo_horario, tramo, profesor_ausente, observaciones, cubierta, profesor_sustituto")
    .eq("centro_id", centro_id)
    .eq("fecha", fecha);
  if (error) throw new Error(`Error al leer sustituciones: ${error.message}`);

  const sinCubrir = (data ?? []).filter((s: {
    cubierta: boolean | null;
    profesor_sustituto: string | null;
  }) => {
    const noCubierta = s.cubierta === false || s.cubierta == null;
    const sinSustituto = s.profesor_sustituto == null || String(s.profesor_sustituto).trim() === "";
    return noCubierta && sinSustituto;
  }).map((s: {
    id: string; grupo_horario: string | null; tramo: string | number | null;
    profesor_ausente: string | null; observaciones: string | null;
  }) => ({
    id: s.id,
    grupo_horario: s.grupo_horario ?? "",
    tramo: s.tramo ?? "",
    profesor_ausente: s.profesor_ausente ?? "",
    observaciones: s.observaciones ?? "",
  }));

  if (!sinCubrir.length) return "No hay ausencias sin cubrir hoy.";
  return JSON.stringify(sinCubrir);
}

/* Núcleo reutilizable: profesores libres del centro en fecha+tramo.
   Universo = profesores del centro (deduplicados por nombre normalizado, sin
   placeholders ni nombres basura). Ocupados = profesores con clase en
   horarios_grupo ese día+tramo. Libres = universo − ocupados. Filtra por centro_id. */
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
    if (nombreInvalido(nombre)) continue;
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
    if (nombreInvalido(pn)) continue;
    const key = normalizarNombre(pn);
    if (key) ocupadosNorm.add(key);
  }

  const libres = [...universo.entries()]
    .filter(([key]) => !ocupadosNorm.has(key))
    .map(([, display]) => display)
    .sort((a, b) => a.localeCompare(b, "es"));

  return { dia, finde: false, universoSize: universo.size, libres };
}

/* ── Herramienta 2: buscar_profesores_libres ── */
async function buscarProfesoresLibres(
  sb: SB,
  fecha: string,
  tramo: string,
  centro_id: string,
): Promise<string> {
  console.log("[agent-sustituciones] buscar_profesores_libres · centro_id:", centro_id, "· fecha:", fecha, "· tramo:", tramo);
  validarFecha(fecha, centro_id);
  validarTramo(tramo);
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

/* ── Herramienta 3: sugerir_sustituto ──
   Deduplica la lista de libres (por nombre normalizado) ANTES de cruzar con el
   conteo de guardias del trimestre actual, ordena por equidad y devuelve los 3
   mejores con su conteo. */
async function sugerirSustituto(
  sb: SB,
  fecha: string,
  tramo: string,
  centro_id: string,
  profesoresLibres: unknown,
): Promise<string> {
  console.log("[agent-sustituciones] sugerir_sustituto · centro_id:", centro_id, "· fecha:", fecha, "· tramo:", tramo);
  validarFecha(fecha, centro_id);
  validarTramo(tramo);

  // Lista de libres: la que pasa el modelo, o recalculada como fallback robusto.
  let libres: string[] = Array.isArray(profesoresLibres)
    ? (profesoresLibres as unknown[]).map((x) => String(x ?? "").trim())
    : [];
  libres = libres.filter((s) => !nombreInvalido(s));
  if (!libres.length) {
    const r = await _calcularLibres(sb, fecha, tramo, centro_id);
    if (r.finde) return `El ${fecha} es ${r.dia}: no hay actividad lectiva, no aplica sugerir sustituto.`;
    libres = r.libres;
  }
  if (!libres.length) return "No hay profesores libres para sugerir como sustituto.";

  // Deduplicar ANTES de cruzar con guardias (por nombre normalizado, 1º gana).
  const vistos = new Set<string>();
  const libresDedup: string[] = [];
  for (const nombre of libres) {
    const key = normalizarNombre(nombre);
    if (!key || vistos.has(key)) continue;
    vistos.add(key);
    libresDedup.push(nombre);
  }

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

  // Cruza: cada libre con sus guardias (0 si no aparece). Orden ASC, top 3.
  const ranking = libresDedup
    .map((nombre) => ({ nombre, guardias: conteoNorm.get(normalizarNombre(nombre)) ?? 0 }))
    .sort((a, b) => a.guardias - b.guardias || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 3);

  const detalle = ranking
    .map((r) => `${r.nombre} (${r.guardias} guardia${r.guardias === 1 ? "" : "s"})`)
    .join(", ");
  return (
    `Sustitutos sugeridos por equidad (trimestre ${trimestre}, menos guardias primero): ` +
    `${detalle}.`
  );
}

/* Dispatcher: ejecuta la herramienta pedida por Gemini SIEMPRE con el centro_id
   de confianza del body (nunca el que sugiera el modelo). El tramo viene de los
   argumentos del modelo (cada ausencia tiene su propio tramo). */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  sb: SB,
  centro_id: string,
  fecha: string,
): Promise<string> {
  const f = (args.fecha as string) ?? fecha;
  const t = args.tramo != null ? String(args.tramo) : "";
  if (name === "obtener_ausencias_sin_cubrir") {
    return await obtenerAusenciasSinCubrir(sb, f, centro_id);
  }
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
    const { centro_id, fecha } = body as { centro_id?: string; fecha?: string };

    if (!centro_id) return jsonRes({ error: "Falta centro_id." }, 400);
    if (!fecha) return jsonRes({ error: "Falta fecha (YYYY-MM-DD)." }, 400);

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
            `Centro ${centro_id}, fecha ${fecha}. Revisa si hay ausencias sin cubrir y, si las ` +
            `hay, sugiere sustitutos para cada una. Ejecuta las herramientas directamente.`,
        }],
      },
    ];

    // Bucle de tool-calling: itera mientras Gemini llame a herramientas. Cada
    // ausencia consume ~2 llamadas (buscar + sugerir), por eso un tope amplio.
    const MAX_PASOS = 20;
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
      const toolResult = await executeTool(name, args ?? {}, sb, centro_id, fecha);

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
