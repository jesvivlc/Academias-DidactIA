import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES_ES: Record<string, string> = {
  familia: "Familia",
  profesional: "Profesional",
  admin: "Administrador",
  superadmin: "Superadministrador",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { profileId, newRol } = await req.json();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verificar que el caller es admin/superadmin usando el JWT del request
    const authHeader = req.headers.get("Authorization");
    const sbClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } },
    );

    const { data: { user } } = await sbClient.auth.getUser();
    const { data: callerProfile } = await sbClient
      .from("profiles")
      .select("rol")
      .eq("user_id", user?.id)
      .single();

    if (callerProfile?.rol !== "superadmin") {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 403 },
      );
    }

    // Obtener datos del usuario afectado
    const { data: profile } = await sb
      .from("profiles")
      .select("email, full_name, centro_id")
      .eq("id", profileId)
      .single();

    if (!profile?.email) {
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 404 },
      );
    }

    // Obtener nombre del centro
    let centroNombre = "tu centro educativo";
    if (profile.centro_id) {
      const { data: centro } = await sb
        .from("centros")
        .select("nombre")
        .eq("id", profile.centro_id)
        .single();
      if (centro?.nombre) centroNombre = centro.nombre;
    }

    const rolNombre = ROLES_ES[newRol] || newRol;
    const nombre = profile.full_name || profile.email;

    // Enviar email via Resend si está configurado
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "DidactIA <noreply@didactia.eu>",
          to: profile.email,
          subject: "Tu rol en DidactIA ha sido actualizado",
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;">
              <h2 style="color:#2a3d2b;">DidactIA</h2>
              <p>Hola <strong>${nombre}</strong>,</p>
              <p>Tu rol en la plataforma DidactIA de <strong>${centroNombre}</strong> ha sido actualizado a:</p>
              <p style="font-size:20px;font-weight:bold;color:#2a3d2b;text-align:center;
                         padding:16px;background:#eaf4eb;border-radius:8px;">${rolNombre}</p>
              <p>A partir de ahora tendrás acceso a las funcionalidades correspondientes a tu nuevo perfil.</p>
              <p>Si tienes alguna duda, contacta con el administrador de tu centro.</p>
              <br>
              <p style="color:#888;font-size:12px;">El equipo de DidactIA</p>
            </div>
          `,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: `Notificación enviada a ${profile.email}` }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
