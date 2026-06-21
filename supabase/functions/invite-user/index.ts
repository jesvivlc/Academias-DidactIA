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

    // ── Identidad del caller: preferir el JWT (auth.getUser) ──
    // Fallback a caller_user_id del body solo mientras el cliente siga llamando con
    // la anon key (debería reenviar el access_token del usuario para cerrarlo del todo).
    // En AMBOS casos el rol se verifica contra `profiles` con service role — nunca se
    // confía en un rol enviado por el cliente.
    const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    let callerId: string | null = null;
    if (token) { const { data: uData } = await sb.auth.getUser(token); callerId = uData?.user?.id ?? null; }
    if (!callerId) callerId = caller_user_id ?? null;
    if (!callerId) {
      return new Response(
        JSON.stringify({ error: "No autenticado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const { data: profile } = await sb
      .from("profiles")
      .select("rol, centro_id")
      .eq("user_id", callerId)
      .single();

    const MANAGE = ["admin", "superadmin", "director", "jefatura", "admin_institucional"];
    if (!profile || !MANAGE.includes(profile.rol)) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 403 },
      );
    }

    // El superadmin y el admin_institucional pueden invitar a cualquier centro;
    // el resto (admin/director/jefatura) solo a SU propio centro.
    const multiCentro = profile.rol === "superadmin" || profile.rol === "admin_institucional";
    const effCentroId = multiCentro ? centro_id : (profile.centro_id ?? centro_id);

    // Invitar usuario
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { full_name, centro_id: effCentroId, rol },
    });
    if (error) throw error;

    // Pre-crear perfil
    await sb.from("profiles").upsert(
      {
        id: crypto.randomUUID(),
        user_id: data.user.id,
        full_name,
        email,
        centro_id: effCentroId,
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
