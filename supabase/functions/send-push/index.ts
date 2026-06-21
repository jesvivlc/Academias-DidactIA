import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/web-push"
import webpush from "npm:web-push";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { user_ids, title, body, tag } = await req.json() as {
      user_ids: string[];
      title: string;
      body: string;
      tag?: string;
    };

    if (!user_ids?.length) throw new Error("Falta user_ids");

    const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:soporte@didactia.eu";

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(
        JSON.stringify({ ok: false, reason: "VAPID keys no configuradas" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
      );
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // ── Filtrado por centro del llamante (anti envío cross-tenant) ──
    // Reglas según la identidad del que llama:
    //  - service_role (cron/n8n)      → backend de confianza, sin restricción
    //  - usuario real (JWT)           → solo user_ids de su mismo centro (superadmin: sin restricción)
    //  - solo anon key (sin usuario)  → no identificable; se mantiene el envío pero se avisa
    //    (los clientes del navegador deberían reenviar el JWT del usuario para cerrar esto del todo)
    const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    let targetIds: string[] = user_ids;
    if (token && token === serviceKey) {
      // backend de confianza → sin restricción
    } else {
      let caller: { id: string } | null = null;
      if (token) { const { data: uData } = await sb.auth.getUser(token); caller = uData?.user ?? null; }
      if (caller) {
        const { data: cp } = await sb.from("profiles").select("centro_id, rol").eq("id", caller.id).single();
        if (cp && cp.rol !== "superadmin") {
          const { data: members } = await sb.from("profiles")
            .select("user_id").eq("centro_id", cp.centro_id).in("user_id", user_ids);
          const allowed = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
          const discarded = user_ids.filter((id) => !allowed.has(id));
          if (discarded.length) {
            console.warn(`[send-push] ${discarded.length} user_ids descartados por no pertenecer al centro ${cp.centro_id}: ${discarded.join(", ")}`);
          }
          targetIds = user_ids.filter((id) => allowed.has(id));
        }
      } else {
        console.warn("[send-push] llamante sin identidad de usuario (anon key): no se aplica filtro por centro. Los clientes deberían reenviar el JWT del usuario.");
      }
    }

    if (!targetIds.length) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, total: 0, skipped: "sin destinatarios válidos para el centro del llamante" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Fetch subscriptions for the requested user IDs
    const { data: rows, error } = await sb
      .from("push_subscriptions")
      .select("id, user_id, subscription")
      .in("user_id", targetIds);

    if (error) throw new Error("Error fetching subscriptions: " + error.message);

    const payload = JSON.stringify({
      title: title || "DidactIA",
      body:  body  || "",
      tag:   tag   || "didactia",
    });

    let sent = 0;
    const errors: string[] = [];

    for (const row of rows ?? []) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${row.user_id}: ${msg}`);
        // If this subscription is expired/invalid, remove ONLY this row (by id),
        // not every subscription of the user (un usuario puede tener varios dispositivos).
        if (msg.includes("410") || msg.includes("404")) {
          await sb.from("push_subscriptions").delete().eq("id", row.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, total: rows?.length ?? 0, errors }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
