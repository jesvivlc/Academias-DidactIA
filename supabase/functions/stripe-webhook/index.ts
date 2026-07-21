// Edge Function `stripe-webhook` — DidactIA Academias
//
// Recibe los eventos de Stripe y marca el recibo como pagado cuando la sesión
// de Checkout se completa. Verifica la firma con el webhook secret de LA
// ACADEMIA a la que pertenece el pago (cada una registra su propio endpoint).
//
// Requiere: verify_jwt = false (Stripe no envía JWT de Supabase).
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Comparación en tiempo constante: no filtramos información por el tiempo de respuesta
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function hmacSha256Hex(clave: string, mensaje: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(clave),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cabecera: t=<timestamp>,v1=<firma>[,v1=<otra>]
async function firmaValida(cuerpo: string, cabecera: string, secreto: string): Promise<boolean> {
  const partes = Object.create(null) as Record<string, string[]>;
  for (const trozo of cabecera.split(",")) {
    const [k, v] = trozo.split("=", 2);
    if (!k || !v) continue;
    (partes[k.trim()] ||= []).push(v.trim());
  }
  const t = partes["t"]?.[0];
  const firmas = partes["v1"] || [];
  if (!t || !firmas.length) return false;

  // Ventana de 5 minutos para cortar reenvíos
  const edad = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(edad) || edad > 300) return false;

  const esperada = await hmacSha256Hex(secreto, `${t}.${cuerpo}`);
  return firmas.some((f) => igualSeguro(f, esperada));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" }, status: s });

  try {
    const cuerpo = await req.text();
    const cabecera = req.headers.get("stripe-signature") || "";
    if (!cabecera) return json({ error: "Falta firma" }, 400);

    let evento: Record<string, unknown>;
    try { evento = JSON.parse(cuerpo); } catch { return json({ error: "Cuerpo no válido" }, 400); }

    const objeto = ((evento as { data?: { object?: Record<string, unknown> } }).data?.object) || {};
    const meta = (objeto.metadata || {}) as Record<string, string>;
    const pagoId = meta.pago_id || (objeto.client_reference_id as string) || null;
    if (!pagoId) return json({ recibido: true, nota: "Evento sin pago_id" });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: pago } = await sb.from("pagos").select("id, centro_id, estado").eq("id", pagoId).maybeSingle();
    if (!pago) return json({ recibido: true, nota: "Pago no encontrado" });

    const { data: cfg } = await sb.from("pasarela_config")
      .select("webhook_secret").eq("centro_id", pago.centro_id).maybeSingle();
    if (!cfg?.webhook_secret) return json({ error: "Webhook no configurado para esta academia" }, 409);

    if (!(await firmaValida(cuerpo, cabecera, cfg.webhook_secret))) {
      return json({ error: "Firma no válida" }, 401);
    }

    const tipo = String((evento as { type?: string }).type || "");
    if (tipo === "checkout.session.completed" || tipo === "checkout.session.async_payment_succeeded") {
      if (pago.estado !== "pagado") {
        await sb.from("pagos").update({
          estado: "pagado",
          pagado_online: true,
          metodo: "tarjeta",
          fecha: new Date().toISOString().slice(0, 10),
        }).eq("id", pago.id);
      }
    }

    return json({ recibido: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
