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

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch subscriptions for the requested user IDs
    const { data: rows, error } = await sb
      .from("push_subscriptions")
      .select("user_id, subscription")
      .in("user_id", user_ids);

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
        // If subscription is expired/invalid, remove it
        if (msg.includes("410") || msg.includes("404")) {
          await sb.from("push_subscriptions").delete().eq("user_id", row.user_id);
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
