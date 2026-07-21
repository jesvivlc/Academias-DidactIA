// Edge Function `crear-pago-stripe` — DidactIA Academias
//
// Recibe { pago_id, return_url? } y devuelve { url } con la sesión de Stripe
// Checkout para cobrar ese recibo.
//
// Autorización: se comprueba leyendo el pago CON EL JWT DE QUIEN LLAMA, de modo
// que las políticas RLS deciden (dirección de la academia o familia del alumno).
// Solo después se usa la service_role para leer la clave de Stripe del centro,
// que vive en `pasarela_config` (tabla sin políticas: nadie más la ve).
//
// Requiere: verify_jwt = true.
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" }, status: s });

  try {
    const { pago_id, return_url } = await req.json();
    if (!pago_id) return json({ error: "Falta pago_id" }, 400);

    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ error: "No autenticado" }, 401);

    const SB_URL = Deno.env.get("SUPABASE_URL")!;

    // 1) Autorización delegada en RLS: si el llamante no puede ver el pago, no cobra.
    const sbUser = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: pago, error: e1 } = await sbUser
      .from("pagos")
      .select("id, centro_id, alumno_id, concepto, importe, estado, periodo")
      .eq("id", pago_id)
      .maybeSingle();
    if (e1) return json({ error: e1.message }, 400);
    if (!pago) return json({ error: "Recibo no encontrado" }, 404);
    if (pago.estado === "pagado") return json({ error: "Este recibo ya está pagado" }, 409);

    const importe = Math.round(Number(pago.importe || 0) * 100);
    if (!(importe > 0)) return json({ error: "Importe no válido" }, 400);

    // 2) Credenciales de la academia (solo service_role llega aquí)
    const sbAdmin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await sbAdmin
      .from("pasarela_config")
      .select("secret_key, activo")
      .eq("centro_id", pago.centro_id)
      .maybeSingle();
    if (!cfg?.secret_key || !cfg.activo) return json({ error: "La academia no tiene el pago online activado" }, 409);

    const { data: centro } = await sbAdmin
      .from("centros").select("nombre").eq("id", pago.centro_id).maybeSingle();

    // 3) Sesión de Stripe Checkout
    const base = (return_url || req.headers.get("origin") || "https://didactia-academias.vercel.app").replace(/\/$/, "");
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${base}/app.html?pago=ok`);
    params.set("cancel_url", `${base}/app.html?pago=cancelado`);
    params.set("client_reference_id", String(pago.id));
    params.set("metadata[pago_id]", String(pago.id));
    params.set("metadata[centro_id]", String(pago.centro_id));
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", "eur");
    params.set("line_items[0][price_data][unit_amount]", String(importe));
    params.set("line_items[0][price_data][product_data][name]", String(pago.concepto || "Cuota"));
    params.set("line_items[0][price_data][product_data][description]", String(centro?.nombre || "Academia"));

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.secret_key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const sesion = await r.json();
    if (!r.ok) return json({ error: sesion?.error?.message || "Stripe rechazó la petición" }, 502);

    // Guardamos la sesión para poder conciliar si el webhook llega tarde
    await sbAdmin.from("pagos").update({ stripe_session_id: sesion.id }).eq("id", pago.id);

    return json({ url: sesion.url, session_id: sesion.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
