import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Eres un experto en planificación de horarios escolares españoles. Analiza el texto del jefe de estudios y extrae las restricciones de forma estructurada. Devuelve SOLO un JSON válido sin markdown:
{
  "materias": [{ "nombre": string, "horas_semanales": number, "carga_cognitiva": "alta|media|baja", "tipo_dinamica": "estatica|motriz|colaborativa", "es_optativa": boolean, "grupo_optativas": string|null }],
  "restricciones_profesor": [{ "profesor": string, "tipo": "no_primera_hora|no_ultima_hora|no_disponible_tramo|max_horas_dia", "detalle": string }],
  "restricciones_materia": [{ "materia": string, "evitar_tramos": number[], "mismo_tramo_que": string[] }],
  "necesidades": [{ "grupo": string, "materia": string, "profesor": string, "horas": number }],
  "preguntas": ["pregunta si algo no quedó claro"]
}

Reglas de clasificación:
- Carga cognitiva alta: matemáticas, física, química, lengua, idiomas, filosofía
- Carga cognitiva media: historia, geografía, biología, tecnología, economía
- Carga cognitiva baja: educación física, música, plástica, religión, tutoría
- tipo_dinamica motriz: educación física, danza
- tipo_dinamica colaborativa: proyectos, laboratorio, talleres
- tipo_dinamica estatica: el resto

Si el profesor menciona optativas que deben coincidir en horario, agrúpalas en grupo_optativas con el mismo ID string (ej: "opt-latin-info"). Las necesidades de optativas del mismo grupo deben compartir ese mismo grupo_optativas.

Si no se menciona un campo, usa valores por defecto razonables. grupo = grupo del alumno en formato español (ej: 1ESOA, 2BACHB, 3ESOC).`;

interface ParsedResult {
  materias: Array<{
    nombre: string;
    horas_semanales: number;
    carga_cognitiva: string;
    tipo_dinamica: string;
    es_optativa: boolean;
    grupo_optativas: string | null;
  }>;
  restricciones_profesor: Array<{
    profesor: string;
    tipo: string;
    detalle: string;
  }>;
  restricciones_materia: Array<{
    materia: string;
    evitar_tramos: number[];
    mismo_tramo_que: string[];
  }>;
  necesidades: Array<{
    grupo: string;
    materia: string;
    profesor: string;
    horas: number;
  }>;
  preguntas: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { texto, audio_base64, mime_type, centro_id } = body;

    if (!centro_id) throw new Error("Falta el campo centro_id");
    if (!texto && !audio_base64) throw new Error("Se requiere texto o audio_base64");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* Contexto del centro para mejorar el matching de nombres */
    const [{ data: profesores }, { data: materias }] = await Promise.all([
      sb.from("profesores").select("nombre").eq("centro_id", centro_id).or("activo.is.null,activo.eq.true"),
      sb.from("materias").select("nombre").eq("centro_id", centro_id),
    ]);

    const profNames = (profesores || []).map((p: { nombre: string }) => p.nombre).join(", ");
    const matNames  = (materias  || []).map((m: { nombre: string }) => m.nombre).join(", ");

    const contextLines = [
      texto || "Analiza el audio adjunto y extrae todas las restricciones y necesidades horarias.",
      "",
      profNames ? `Profesores conocidos en el centro (úsalos para matching exacto de nombres): ${profNames}` : "",
      matNames  ? `Materias ya configuradas (úsalas si coinciden): ${matNames}` : "",
    ].filter(Boolean).join("\n");

    /* Construir parts de Gemini (texto + audio opcional) */
    const parts: unknown[] = [];
    if (audio_base64 && mime_type) {
      parts.push({ inlineData: { mimeType: mime_type, data: audio_base64 } });
    }
    parts.push({ text: contextLines });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.1,
            thinking_config: { thinking_budget: 0 },
            responseMimeType: "application/json",
          },
        }),
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

    let parsed: ParsedResult;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Gemini no devolvió JSON válido: " + rawText.slice(0, 300));
      parsed = JSON.parse(match[0]);
    }

    /* Normalizar estructura por si Gemini omite arrays */
    if (!Array.isArray(parsed.materias))               parsed.materias               = [];
    if (!Array.isArray(parsed.restricciones_profesor)) parsed.restricciones_profesor = [];
    if (!Array.isArray(parsed.restricciones_materia))  parsed.restricciones_materia  = [];
    if (!Array.isArray(parsed.necesidades))            parsed.necesidades            = [];
    if (!Array.isArray(parsed.preguntas))              parsed.preguntas              = [];

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...CORS, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
