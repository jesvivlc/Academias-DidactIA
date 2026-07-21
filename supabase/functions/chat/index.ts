// Edge Function `chat` — DidactIA Academias
// Proxy limpio a Gemini 2.5 Flash. Recibe { contents, system_prompt } del cliente
// (js/chat.js) y devuelve { type:"text", text }. Sin function-calling de Centros.
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "gemini-2.5-flash";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const contents = Array.isArray(body?.contents) ? body.contents : [];
    const systemPrompt = body?.system_prompt || body?.systemPrompt || "";

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY no configurada" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
    }

    // ⚠️ `thinkingBudget: 0` es imprescindible en gemini-2.5-flash: los tokens de
    // razonamiento se descuentan del MISMO presupuesto que la respuesta visible,
    // así que con 1024 y el razonamiento activado las salidas largas (resumen
    // semanal, informe de evolución, planes de retención) llegaban cortadas a
    // media frase. Además se pagaban tokens que no producían texto.
    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    if (systemPrompt) payload.systemInstruction = { parts: [{ text: systemPrompt }] };

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();

    if (!r.ok) {
      const msg = d?.error?.message || `Gemini HTTP ${r.status}`;
      return new Response(JSON.stringify({ error: msg }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
    }

    const cand = d?.candidates?.[0];
    const text = cand?.content?.parts?.map((p: { text?: string }) => p.text || "").join("")
      || "Lo siento, no he podido generar una respuesta.";

    // Se expone `finish_reason` para que un corte por longitud deje de ser
    // invisible: antes el cliente recibía media respuesta sin forma de saberlo.
    const finish = cand?.finishReason ?? null;
    return new Response(JSON.stringify({
      type: "text",
      text,
      finish_reason: finish,
      truncada: finish === "MAX_TOKENS",
    }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
  }
});
