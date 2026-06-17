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
    const { centro_id, profesor_nombre, fecha, fecha_fin, tipo_ausencia, motivo, grupos, instrucciones } =
      await req.json() as {
        centro_id: string;
        profesor_nombre: string;
        fecha: string;
        fecha_fin?: string;
        tipo_ausencia: string;
        motivo?: string;
        grupos: string;
        instrucciones: string;
      };

    if (!centro_id || !profesor_nombre || !fecha) {
      throw new Error("Faltan campos obligatorios: centro_id, profesor_nombre, fecha");
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Centro name + admin emails
    const { data: centro } = await sb
      .from("centros").select("nombre").eq("id", centro_id).single();
    const centroNombre = centro?.nombre ?? "Centro Educativo";

    const { data: admins } = await sb
      .from("profiles")
      .select("email, full_name")
      .eq("centro_id", centro_id)
      .in("rol", ["admin", "superadmin"])
      .eq("activo", true);

    const emails = (admins ?? [])
      .map((p: { email: string }) => p.email)
      .filter((e: string) => e?.includes("@"));

    if (!emails.length) {
      return new Response(
        JSON.stringify({ ok: false, reason: "sin_admin_email" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(
        JSON.stringify({ ok: false, reason: "resend_no_configurado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <div style="background:#1a73e8;padding:22px 28px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">📋 Notificación de ausencia — ${centroNombre}</h2>
        </div>
        <div style="padding:24px 28px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:10px 0;color:#666;width:140px;font-weight:500;">Profesor/a</td>
              <td style="padding:10px 0;color:#222;font-weight:600;">${profesor_nombre}</td>
            </tr>
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:10px 0;color:#666;font-weight:500;">Fecha</td>
              <td style="padding:10px 0;color:#222;">${fecha_fin && fecha_fin !== fecha ? `${fecha} → ${fecha_fin}` : fecha}</td>
            </tr>
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:10px 0;color:#666;font-weight:500;">Tramos</td>
              <td style="padding:10px 0;color:#222;">${tipo_ausencia}</td>
            </tr>
            ${motivo ? `<tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:10px 0;color:#666;font-weight:500;">Motivo</td>
              <td style="padding:10px 0;color:#222;">${motivo}</td>
            </tr>` : ""}
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:10px 0;color:#666;font-weight:500;">Grupos</td>
              <td style="padding:10px 0;color:#222;">${grupos}</td>
            </tr>
          </table>
          <div style="background:#f8f9fa;border-left:4px solid #1a73e8;border-radius:0 6px 6px 0;padding:14px 18px;margin-bottom:20px;">
            <p style="font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.5px;margin:0 0 8px;">
              Instrucciones para el sustituto
            </p>
            <p style="font-size:14px;color:#222;margin:0;white-space:pre-wrap;">${instrucciones}</p>
          </div>
          <div style="text-align:center;margin:8px 0 4px;">
            <a href="https://didactia.eu/app.html" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
              Gestionar la cobertura en DidactIA →
            </a>
          </div>
          <p style="font-size:12px;color:#999;text-align:center;margin:6px 0 0;">
            Accede a Sustituciones para asignar guardia.
          </p>
          <p style="color:#999;font-size:12px;margin-top:20px;border-top:1px solid #e0e0e0;padding-top:14px;">
            ${centroNombre} · Gestionado con DidactIA
          </p>
        </div>
      </div>`;

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
          subject: `DidactIA — Ausencia notificada: ${profesor_nombre} · ${fecha}`,
          html: htmlBody,
        }),
      });
      if (res.ok) enviados++;
    }

    return new Response(
      JSON.stringify({ ok: true, enviados, total: emails.length }),
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
