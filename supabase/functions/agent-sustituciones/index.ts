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
  "Eres el agente de sustituciones de DidactIA. Tu tarea es encontrar profesores " +
  "disponibles para cubrir guardias. Cuando te den fecha y tramo, usa la herramienta " +
  "buscar_profesores_libres para obtener los profesores libres y presenta el resultado " +
  "de forma clara. " +
  "El centro_id ya está disponible en cada llamada a la herramienta — nunca lo pidas al " +
  "usuario. Tienes toda la información necesaria para ejecutar buscar_profesores_libres " +
  "directamente.";

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
function normNombre(n: string): string {
  return String(n ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
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

/* ── Herramienta: buscar_profesores_libres ──
   Universo = profesores del centro. Ocupados = profesores con clase en
   horarios_grupo ese día+tramo. Libres = universo − ocupados.
   Filtra SIEMPRE por centro_id (el de confianza, recibido en el body, nunca
   el que pudiera inventar el modelo). */
async function buscarProfesoresLibres(
  sb: SB,
  fecha: string,
  tramo: string,
  centro_id: string,
): Promise<string> {
  if (!centro_id) throw new Error("Falta centro_id.");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida; usa el formato YYYY-MM-DD.");
  }
  if (tramo == null || String(tramo).trim() === "") throw new Error("Falta el tramo.");

  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const diaIdx = new Date(fecha + "T12:00:00Z").getUTCDay();
  const dia = DIAS[diaIdx];
  if (diaIdx === 0 || diaIdx === 6) {
    return `El ${fecha} es ${dia}: no hay actividad lectiva, no aplica buscar guardias.`;
  }

  // Universo: todos los profesores del centro
  const { data: profes, error: pErr } = await sb
    .from("profesores")
    .select("nombre")
    .eq("centro_id", centro_id);
  if (pErr) throw new Error(`Error al leer profesores: ${pErr.message}`);

  const universo = [
    ...new Set((profes ?? []).map((p: { nombre: string }) => p.nombre).filter(Boolean)),
  ] as string[];

  if (!universo.length) {
    return "No hay profesores registrados en este centro.";
  }

  // Ocupados: profesores con clase ese día y tramo (tramo se guarda como texto)
  const { data: ocupadosRows, error: oErr } = await sb
    .from("horarios_grupo")
    .select("profesor_nombre")
    .eq("centro_id", centro_id)
    .eq("dia", dia)
    .eq("tramo", String(tramo))
    .not("profesor_nombre", "is", null);
  if (oErr) throw new Error(`Error al leer horarios: ${oErr.message}`);

  const ocupadosNorm = new Set(
    (ocupadosRows ?? [])
      .map((r: { profesor_nombre: string }) => normNombre(r.profesor_nombre))
      .filter(Boolean),
  );

  const libres = universo
    .filter((nombre) => !ocupadosNorm.has(normNombre(nombre)))
    .sort((a, b) => a.localeCompare(b, "es"));

  if (!libres.length) {
    return `No hay profesores libres el ${fecha} (${dia}) en el tramo ${tramo}.`;
  }
  return (
    `Profesores libres el ${fecha} (${dia}, tramo ${tramo}) — ${libres.length} de ` +
    `${universo.length}: ${libres.join(", ")}.`
  );
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

    // Mensaje inicial: Gemini decide llamar a la herramienta.
    const contents: unknown[] = [
      {
        role: "user",
        parts: [{
          text:
            `Busca los profesores libres para el centro ${centro_id}, fecha ${fecha}, ` +
            `tramo ${tramoStr}. Ejecuta la herramienta directamente con estos datos.`,
        }],
      },
    ];

    const geminiRes = await callGemini(apiKey, contents, true, SYSTEM_PROMPT);
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${errText.slice(0, 300)}`);
    }
    const geminiData = await geminiRes.json();
    if (!geminiData.candidates?.[0]) {
      throw new Error("Sin candidatos en la respuesta de Gemini.");
    }

    const parts: Record<string, unknown>[] =
      geminiData.candidates[0].content?.parts ?? [];
    const toolCallPart = parts.find((p) => p.functionCall);

    if (toolCallPart) {
      const { name, args } = toolCallPart.functionCall as {
        name: string;
        args: Record<string, string>;
      };

      if (name !== "buscar_profesores_libres") {
        throw new Error(`Herramienta desconocida: ${name}`);
      }

      // centro_id de confianza = el del body, nunca el que sugiera el modelo.
      const toolResult = await buscarProfesoresLibres(
        sb,
        args.fecha ?? fecha,
        args.tramo ?? tramoStr,
        centro_id,
      );

      // Segunda llamada (sin tools) para redactar la respuesta final.
      const contentsWithResult = [
        ...contents,
        { role: "model", parts: [{ functionCall: { name, args } }] },
        { role: "user", parts: [{ functionResponse: { name, response: { result: toolResult } } }] },
      ];
      const geminiRes2 = await callGemini(apiKey, contentsWithResult, false, SYSTEM_PROMPT);
      const geminiData2 = await geminiRes2.json();
      const content =
        geminiData2.candidates?.[0]?.content?.parts?.[0]?.text ?? toolResult;
      return jsonRes({ type: "text", content });
    }

    // Gemini respondió sin usar la herramienta.
    const content =
      (parts.find((p) => p.text)?.text as string) ??
      "No pude determinar los profesores libres.";
    return jsonRes({ type: "text", content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: msg }, 500);
  }
});
