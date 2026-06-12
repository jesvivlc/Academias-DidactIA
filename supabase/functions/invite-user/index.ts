import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    // Verificar que el caller es superadmin usando service role
    const { data: profile } = await sb
      .from("profiles")
      .select("rol")
      .eq("user_id", caller_user_id)
      .single();

    if (profile?.rol !== "superadmin") {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 403 },
      );
    }

    // Invitar usuario
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { full_name, centro_id, rol },
    });
    if (error) throw error;

    // Pre-crear perfil
    await sb.from("profiles").upsert(
      {
        id: crypto.randomUUID(),
        user_id: data.user.id,
        full_name,
        email,
        centro_id,
        rol,
      },
      { onConflict: "user_id" },
    );

    return new Response(
      JSON.stringify({ success: true, message: `Invitación enviada a ${email}` }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
