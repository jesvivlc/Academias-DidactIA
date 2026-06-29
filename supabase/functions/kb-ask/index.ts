// ============================================================================
// kb-ask — Consulta normativa con RAG (Fase 1)
// ----------------------------------------------------------------------------
// Flujo: identidad por JWT → embebe la pregunta (gemini-embedding-001, 768d) →
//        match_kb (global del ámbito del centro + normativa del centro) →
//        Gemini 2.5 Flash responde CITANDO las fuentes recuperadas.
//
// Convención de seguridad (Fase 0): centro/rol/ámbito se derivan del JWT +
// profiles + centros, NUNCA del body. El superadmin puede indicar centro_id.
//
// Devuelve: { answer, sources: [{ titulo, tipo, fecha_doc, source_url, fragmento, similarity }] }
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";
// Umbral mínimo de similitud coseno para considerar un fragmento relevante.
const MIN_SIMILARITY = 0.55;

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    headers: { ...CORS, "Content-Type": "application/json" },
    status,
  });
}

// fetch a Gemini con timeout (AbortController) + 1 reintento (idempotente).
async function geminiFetch(url: string, body: unknown, timeoutMs = 20000): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      return r;
    } catch (e) { clearTimeout(to); lastErr = e; }
  }
  throw lastErr;
}

// Embebe un texto con gemini-embedding-001 → vector de 768 dims (Matryoshka).
// outputDimensionality:768 para casar con kb_chunks.embedding vector(768).
// taskType RETRIEVAL_QUERY (la ingesta usa RETRIEVAL_DOCUMENT).
async function embed(apiKey: string, text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await geminiFetch(url, {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text }] },
    outputDimensionality: 768,
    taskType: "RETRIEVAL_QUERY",
  });
  if (!res.ok) throw new Error(`Embedding error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("Respuesta de embedding sin 'values'");
  return values;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { pregunta, centro_id: bodyCentroId } = await req.json() as {
      pregunta?: string;
      centro_id?: string;
    };
    if (!pregunta || !pregunta.trim()) throw new Error("Falta el campo 'pregunta'");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Identidad real desde el JWT — nunca del body ──
    const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    let authUser: { id: string } | null = null;
    if (token) {
      const { data: uData } = await sb.auth.getUser(token);
      authUser = uData?.user ?? null;
    }
    if (!authUser) return jsonRes({ error: "No autenticado" }, 401);

    const { data: profile } = await sb
      .from("profiles").select("centro_id, rol").eq("id", authUser.id).single();
    if (!profile) return jsonRes({ error: "Perfil no encontrado" }, 401);

    const isSuper = profile.rol === "superadmin";
    const effCentroId = (isSuper ? (bodyCentroId ?? profile.centro_id) : profile.centro_id) ?? null;

    // Ámbito autonómico del centro (para filtrar el corpus global). Fallback: estatal.
    let ambito = "estatal";
    if (effCentroId) {
      const { data: ctr } = await sb.from("centros").select("ccaa").eq("id", effCentroId).maybeSingle();
      if (ctr?.ccaa) ambito = ctr.ccaa;
    }

    // ── 1) Embeber la pregunta ──
    const qEmbedding = await embed(apiKey, pregunta.trim());

    // ── 2) Recuperar fragmentos ──
    const { data: matches, error: matchErr } = await sb.rpc("match_kb", {
      query_embedding: qEmbedding,
      p_centro_id: effCentroId,
      p_ambito: ambito,
      match_count: 6,
    });
    if (matchErr) throw new Error("match_kb: " + matchErr.message);

    const relevant = (matches ?? []).filter((m: { similarity: number }) => m.similarity >= MIN_SIMILARITY);

    if (relevant.length === 0) {
      return jsonRes({
        answer: "No he encontrado normativa indexada que responda a esa pregunta. " +
          "Asegúrate de que el documento aplicable se ha ingestado en la base de conocimiento.",
        sources: [],
      });
    }

    // ── 3) Construir contexto y preguntar a Gemini ──
    const contexto = relevant.map((m: {
      doc_titulo: string; doc_tipo: string; fecha_doc: string | null;
      chunk_text: string; source_url: string | null;
    }, i: number) =>
      `[Fuente ${i + 1}] ${m.doc_titulo}${m.fecha_doc ? ` (${m.fecha_doc})` : ""}\n${m.chunk_text}`
    ).join("\n\n---\n\n");

    const prompt = `Eres un asistente normativo para equipos directivos de centros educativos españoles. Responde a la pregunta del usuario APOYÁNDOTE ÚNICAMENTE en los fragmentos de normativa que se incluyen como contexto. Reglas estrictas:

- Cita las fuentes usando su número entre corchetes, p. ej. [Fuente 1], al final de cada afirmación relevante.
- Si los fragmentos no contienen la respuesta, dilo claramente: "La normativa indexada no responde a esta pregunta". NO inventes ni recurras a conocimiento general.
- Sé conciso y práctico. Mantén un tono orientativo (no es asesoría jurídica vinculante).
- Responde en español.

CONTEXTO (fragmentos de normativa recuperados):
${contexto}

PREGUNTA: ${pregunta.trim()}`;

    const chatRes = await geminiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
      },
    );
    if (!chatRes.ok) throw new Error(`Gemini error ${chatRes.status}: ${(await chatRes.text()).slice(0, 200)}`);
    const chatData = await chatRes.json();
    const answer = chatData.candidates?.[0]?.content?.parts?.[0]?.text
      ?? "No se pudo generar respuesta.";

    const sources = relevant.map((m: {
      doc_titulo: string; doc_tipo: string; fecha_doc: string | null;
      chunk_text: string; source_url: string | null; similarity: number;
    }) => ({
      titulo: m.doc_titulo,
      tipo: m.doc_tipo,
      fecha_doc: m.fecha_doc,
      source_url: m.source_url,
      fragmento: m.chunk_text.length > 600 ? m.chunk_text.slice(0, 600) + "…" : m.chunk_text,
      similarity: Math.round(m.similarity * 100) / 100,
    }));

    return jsonRes({ answer, sources });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: msg }, 500);
  }
});
