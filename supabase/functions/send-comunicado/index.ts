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
    const { comunicado_id } = await req.json();
    if (!comunicado_id) throw new Error("Falta comunicado_id");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Obtener comunicado
    const { data: com, error: comErr } = await sb
      .from("comunicados")
      .select("*")
      .eq("id", comunicado_id)
      .single();

    if (comErr || !com) {
      return new Response(JSON.stringify({ error: "comunicado_no_encontrado" }), {
        headers: { ...CORS, "Content-Type": "application/json" }, status: 404,
      });
    }

    // 2. Nombre del centro
    const { data: centro } = await sb
      .from("centros")
      .select("nombre")
      .eq("id", com.centro_id)
      .single();
    const centroNombre = centro?.nombre ?? "Centro Educativo";

    // 3. Obtener destinatarios
    const destinatarios: string = com.destinatarios || "todos";
    let emails: string[] = [];

    if (destinatarios.startsWith("grupo:")) {
      // Familias cuyos alumnos están en ese grupo
      const grupo = destinatarios.replace("grupo:", "");
      const { data: alumnos } = await sb
        .from("alumnos")
        .select("id")
        .eq("centro_id", com.centro_id)
        .eq("grupo_horario", grupo);

      if (alumnos && alumnos.length > 0) {
        const alumnoIds = (alumnos as { id: string }[]).map((a) => a.id);
        const { data: vinculos } = await sb
          .from("familia_alumno")
          .select("profile_id")
          .in("alumno_id", alumnoIds);

        if (vinculos && vinculos.length > 0) {
          const profileIds = (vinculos as { profile_id: string }[]).map((v) => v.profile_id);
          const { data: profiles } = await sb
            .from("profiles")
            .select("email")
            .in("id", profileIds)
            .eq("activo", true);
          emails = ((profiles ?? []) as { email: string }[])
            .map((p) => p.email)
            .filter((e) => e && e.includes("@"));
        }
      }
    } else {
      // Consulta directa a profiles filtrada por rol
      let q = sb
        .from("profiles")
        .select("email")
        .eq("centro_id", com.centro_id)
        .eq("activo", true);

      if (destinatarios === "solo_profesores") {
        q = q.in("rol", ["profesional", "admin"]);
      } else if (destinatarios === "solo_familias") {
        q = q.eq("rol", "familia");
      }
      // "todos" → sin filtro de rol adicional

      const { data: profiles } = await q;
      emails = ((profiles ?? []) as { email: string }[])
        .map((p) => p.email)
        .filter((e) => e && e.includes("@"));
    }

    if (emails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, enviados: 0, total: 0, warning: "sin_destinatarios" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // 4. Construir email HTML
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) throw new Error("RESEND_API_KEY no configurada");

    const cuerpoHtml = (com.cuerpo || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const htmlBody = `
      <div style='font-family:sans-serif;max-width:580px;margin:auto;padding:0;
                  border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;'>
        <div style='background:#1a73e8;padding:22px 28px;'>
          <h2 style='color:#fff;margin:0;font-size:18px;'>📢 ${com.titulo}</h2>
          <p style='color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;'>
            ${centroNombre}
          </p>
        </div>
        <div style='padding:24px 28px;'>
          <div style='font-size:14px;color:#333;line-height:1.8;'>${cuerpoHtml}</div>
          <p style='color:#888;font-size:12px;margin-top:24px;border-top:1px solid #e0e0e0;
                    padding-top:14px;'>
            ${centroNombre} · Gestionado con DidactIA
          </p>
        </div>
      </div>`;

    const subject = `${centroNombre}: ${com.titulo}`;

    // 5. Enviar un email por destinatario
    let enviados = 0;
    for (const email of emails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "DidactIA <notificaciones@didactia.eu>",
          to: email,
          subject,
          html: htmlBody,
        }),
      });
      if (res.ok) enviados++;
    }

    return new Response(
      JSON.stringify({ success: true, enviados, total: emails.length }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
