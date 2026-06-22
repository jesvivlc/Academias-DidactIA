import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LO_DESC: Record<string, string> = {
  LO1: "Identificar propias fortalezas y desarrollar áreas de mejora",
  LO2: "Demostrar que los retos se han afrontado y superado",
  LO3: "Iniciativa y planificación de actividades CAS",
  LO4: "Demostrar compromiso y perseverancia",
  LO5: "Trabajar de forma colaborativa con otros",
  LO6: "Compromiso global con implicaciones éticas",
  LO7: "Reconocer y considerar la ética de las acciones y decisiones",
};

const VALID_LOS = Object.keys(LO_DESC);

async function _sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// fetch a Gemini con timeout (AbortController) + 1 reintento. Las llamadas de
// clasificación son idempotentes (sin efectos), así que reintentar es seguro.
async function _geminiFetch(url: string, body: unknown, timeoutMs = 20000): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(to);
      return r;
    } catch (e) { clearTimeout(to); lastErr = e; }
  }
  throw lastErr;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { actividad } = await req.json();
    if (!actividad) throw new Error("Falta el campo 'actividad' en el body");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

    // Caché de IA: misma actividad → mismos Learning Outcomes (clasificación pura, sin fecha).
    // Fail-open: si la tabla ia_cache no existe o falla, se ignora y se llama a Gemini.
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cacheKey = await _sha256Hex("cas-analyzer:" + JSON.stringify({
      tipo: actividad.tipo ?? "", titulo: actividad.titulo ?? "",
      descripcion: actividad.descripcion ?? "", reflexion: actividad.reflexion ?? "",
    }));
    try {
      const { data: hit } = await sb.from("ia_cache").select("output").eq("cache_key", cacheKey).maybeSingle();
      if (hit?.output) {
        return new Response(JSON.stringify(hit.output), { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
      }
    } catch (_) { /* tabla no disponible → seguir con Gemini */ }

    const losList = VALID_LOS.map((code) => `- ${code}: ${LO_DESC[code]}`).join("\n");

    const prompt = `Eres un coordinador del Diploma IB especialista en CAS (Creativity, Activity, Service). Analiza esta actividad CAS y determina qué Learning Outcomes del programa IB trabaja el alumno.

LEARNING OUTCOMES IB CAS:
${losList}

ACTIVIDAD A ANALIZAR:
Tipo: ${actividad.tipo ?? "no especificado"}
Título: ${actividad.titulo ?? "sin título"}
Descripción: ${actividad.descripcion ?? "sin descripción"}
Reflexión del alumno: ${actividad.reflexion ?? "sin reflexión"}

Devuelve ÚNICAMENTE un objeto JSON con este formato exacto, sin texto adicional ni bloques de código:
{"los":["LO1","LO3"]}

Reglas:
- Incluye solo los LOs que la actividad trabaja de forma clara y justificada.
- Mínimo 1, máximo 5 LOs.
- Solo valores válidos: LO1, LO2, LO3, LO4, LO5, LO6, LO7.`;

    const geminiRes = await _geminiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.1,
          thinking_config: { thinking_budget: 0 },
          responseMimeType: "application/json",
        },
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini error ${geminiRes.status}: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "sin_candidatos", raw: geminiData }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Parse JSON — Gemini with responseMimeType returns clean JSON, but guard anyway
    let parsed: { los?: string[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*?\}/);
      if (!match) throw new Error("Gemini no devolvió JSON válido: " + rawText);
      parsed = JSON.parse(match[0]);
    }

    const los = (parsed.los ?? []).filter((lo: string) => VALID_LOS.includes(lo));

    // Guardar en caché (fire-and-forget; ignora errores / tabla ausente)
    sb.from("ia_cache").upsert(
      { cache_key: cacheKey, fn: "cas-analyzer", output: { los } },
      { onConflict: "cache_key" },
    ).then(() => {}, () => {});

    return new Response(
      JSON.stringify({ los }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
