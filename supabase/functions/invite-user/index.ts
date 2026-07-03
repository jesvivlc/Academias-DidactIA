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
    const redirectTo = "https://didactia-academias.vercel.app/app.html";

    // generateLink NO envía email (evita el límite del correo integrado de Supabase):
    // crea el usuario si es nuevo y devuelve el enlace para que la dirección lo comparta.
    // Si el usuario ya existe (reinvitación), se genera un enlace de recuperación.
    let userId: string | null = null;
    let link: string | null = null;
    let created = true;

    let gen = await sb.auth.admin.generateLink({
      type: "invite", email,
      options: { data: { full_name, centro_id: effCentroId, rol }, redirectTo },
    });
    if (gen.error) {
      const msg = (gen.error.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exist")) {
        created = false;
        gen = await sb.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
        if (gen.error) throw gen.error;
      } else {
        throw gen.error;
      }
    }
    userId = gen.data?.user?.id ?? null;
    link = gen.data?.properties?.action_link ?? null;

    if (userId) {
      await sb.from("profiles").upsert(
        { id: userId, user_id: userId, full_name, email, centro_id: effCentroId, rol },
        { onConflict: "user_id" },
      );
    }

    return new Response(
      JSON.stringify({
        success: true, user_id: userId, invite_link: link, created,
        message: created ? `Cuenta creada para ${email}` : `Enlace regenerado para ${email}`,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
  }
});
