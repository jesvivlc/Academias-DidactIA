import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { email, centro_id, rol, full_name, caller_user_id } = await req.json();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    let callerId: string | null = null;
    if (token) { const { data } = await sb.auth.getUser(token); callerId = data?.user?.id ?? null; }
    if (!callerId) callerId = caller_user_id ?? null;
    if (!callerId) {
      return new Response(JSON.stringify({ error: "No autenticado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 401 });
    }

    const { data: profile } = await sb.from("profiles")
      .select("rol, centro_id").eq("user_id", callerId).single();

    const MANAGE = ["admin", "superadmin", "director", "jefatura", "admin_institucional"];
    if (!profile || !MANAGE.includes(profile.rol)) {
      return new Response(JSON.stringify({ error: "No autorizado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 403 });
    }

    const multiCentro = profile.rol === "superadmin" || profile.rol === "admin_institucional";
    const effCentroId = multiCentro ? centro_id : (profile.centro_id ?? centro_id);

    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { full_name, centro_id: effCentroId, rol },
    });
    if (error) throw error;

    await sb.from("profiles").upsert(
      { id: data.user.id, user_id: data.user.id, full_name, email, centro_id: effCentroId, rol },
      { onConflict: "user_id" },
    );

    return new Response(
      JSON.stringify({ success: true, user_id: data.user.id, message: `Invitacion enviada a ${email}` }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
  }
});
