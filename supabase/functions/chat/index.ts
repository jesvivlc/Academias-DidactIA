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

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
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

    const text = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("")
      || "Lo siento, no he podido generar una respuesta.";

    return new Response(JSON.stringify({ type: "text", text }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
  }
});
