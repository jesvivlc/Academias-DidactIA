import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAVEDAD_LABEL: Record<string, string> = {
  leve: "Leve", grave: "Grave", muy_grave: "Muy grave",
};
const GRAVEDAD_COLOR: Record<string, string> = {
  leve: "#2e7d32", grave: "#e65100", muy_grave: "#b71c1c",
};
const GRAVEDAD_EMOJI: Record<string, string> = {
  leve: "🟢", grave: "🟠", muy_grave: "🔴",
};
const TIPO_LABEL: Record<string, string> = {
  convivencia: "Convivencia", material: "Material",
  instalaciones: "Instalaciones", otro: "Otro",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { incidencia_id } = await req.json();
    if (!incidencia_id) throw new Error("Falta incidencia_id");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Obtener incidencia
    const { data: inc, error: incErr } = await sb
      .from("incidencias")
      .select("*")
      .eq("id", incidencia_id)
      .single();

    if (incErr || !inc) {
      return new Response(JSON.stringify({ error: "incidencia_no_encontrada" }), {
        headers: { ...CORS, "Content-Type": "application/json" }, status: 404,
      });
    }

    // 2. Nombre del centro + email(s) de admin
    const { data: centro } = await sb
      .from("centros")
      .select("nombre")
      .eq("id", inc.centro_id)
      .single();
    const centroNombre = centro?.nombre ?? "Centro Educativo";

    const { data: admins } = await sb
      .from("profiles")
      .select("email, full_name")
      .eq("centro_id", inc.centro_id)
      .eq("rol", "admin")
      .eq("activo", true);

    const emails = (admins ?? [])
      .map((p: { email: string }) => p.email)
      .filter((e: string) => e && e.includes("@"));

    if (emails.length === 0) {
      return new Response(JSON.stringify({ error: "sin_admin_email", message: "No hay admin activo con email válido en el centro" }), {
        headers: { ...CORS, "Content-Type": "application/json" }, status: 404,
      });
    }

    // 3. Construir email
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) throw new Error("RESEND_API_KEY no configurada");

    const gravedad = inc.gravedad || "leve";
    const gravedadLabel = GRAVEDAD_LABEL[gravedad] ?? gravedad;
    const gravedadColor = GRAVEDAD_COLOR[gravedad] ?? "#1565c0";
    const gravedadEmoji = GRAVEDAD_EMOJI[gravedad] ?? "";
    const tipoLabel = TIPO_LABEL[inc.tipo] ?? inc.tipo ?? "—";
    const fecha = inc.fecha ?? new Date().toISOString().split("T")[0];

    const medidasHtml = Array.isArray(inc.medidas_propuestas) && inc.medidas_propuestas.length
      ? `<ol style='margin:6px 0 0;padding-left:20px;font-size:13px;color:#333;line-height:1.8;'>${
          (inc.medidas_propuestas as string[]).map((m) => `<li>${m}</li>`).join("")
        }</ol>`
      : `<p style='color:#888;font-size:13px;margin:0;'>—</p>`;

    const informeHtml = inc.informe_borrador
      ? `<pre style='background:#f8f9fa;padding:14px;border-radius:6px;font-size:12px;
              white-space:pre-wrap;word-break:break-word;font-family:monospace;
              color:#333;border:1px solid #e0e0e0;margin:0;'>${inc.informe_borrador}</pre>`
      : `<p style='color:#888;font-size:13px;margin:0;'>No disponible</p>`;

    const normativaRow = inc.normativa_ref
      ? `<tr style='border-bottom:1px solid #e0e0e0;'>
           <td style='padding:10px 0;color:#666;width:130px;font-weight:500;vertical-align:top;'>Normativa</td>
           <td style='padding:10px 0;color:#222;font-size:12px;'>${inc.normativa_ref}</td>
         </tr>`
      : "";

    const previBanner = inc.protocolo_previ
      ? `<div style='background:#fce8e6;border-left:4px solid #b71c1c;padding:14px 18px;
              border-radius:8px;margin-bottom:20px;'>
           <strong style='color:#b71c1c;font-size:13px;display:block;margin-bottom:4px;'>
             ⚠️ PROTOCOLO DE ACTUACIÓN INMEDIATA ACTIVADO
           </strong>
           <span style='color:#a50e0e;font-size:12px;'>
             Notificar a Jefatura de Estudios, Orientación y Coordinador/a de Bienestar
             antes de finalizar la jornada escolar.
           </span>
         </div>`
      : "";

    const htmlBody = `
      <div style='font-family:sans-serif;max-width:640px;margin:auto;border-radius:8px;
                  overflow:hidden;border:1px solid #e0e0e0;'>
        <div style='background:${gravedadColor};padding:24px 32px;'>
          <h2 style='color:#fff;margin:0;font-size:20px;'>
            ${gravedadEmoji} Incidencia ${gravedadLabel} — Notificación a Jefatura
          </h2>
          <p style='color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;'>
            ${centroNombre}
          </p>
        </div>
        <div style='padding:24px 32px;'>
          ${previBanner}
          <table style='width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;'>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;width:130px;font-weight:500;'>Alumno/a</td>
              <td style='padding:10px 0;color:#222;font-weight:600;'>${inc.alumno_nombre ?? "—"}</td>
            </tr>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;font-weight:500;'>Grupo</td>
              <td style='padding:10px 0;color:#222;'>${inc.grupo_horario ?? "—"}</td>
            </tr>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;font-weight:500;'>Tipo</td>
              <td style='padding:10px 0;color:#222;'>${tipoLabel}</td>
            </tr>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;font-weight:500;'>Gravedad</td>
              <td style='padding:10px 0;color:${gravedadColor};font-weight:600;'>
                ${gravedadEmoji} ${gravedadLabel}
              </td>
            </tr>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;font-weight:500;'>Fecha</td>
              <td style='padding:10px 0;color:#222;'>${fecha}</td>
            </tr>
            ${normativaRow}
            <tr>
              <td style='padding:10px 0;color:#666;font-weight:500;vertical-align:top;'>Descripción</td>
              <td style='padding:10px 0;color:#222;'>${inc.descripcion ?? "—"}</td>
            </tr>
          </table>

          <div style='margin-bottom:20px;'>
            <p style='font-size:12px;font-weight:600;color:#555;text-transform:uppercase;
                      letter-spacing:.5px;margin:0 0 8px;'>Medidas correctoras propuestas</p>
            ${medidasHtml}
          </div>

          <div style='margin-bottom:20px;'>
            <p style='font-size:12px;font-weight:600;color:#555;text-transform:uppercase;
                      letter-spacing:.5px;margin:0 0 8px;'>Informe borrador</p>
            ${informeHtml}
          </div>

          <p style='color:#888;font-size:12px;margin-top:24px;border-top:1px solid #e0e0e0;
                    padding-top:16px;'>
            ${centroNombre} · Gestionado con DidactIA
          </p>
        </div>
      </div>`;

    const gravedadPlain = `${gravedadEmoji} ${gravedadLabel}`;
    const alumnoPlain = inc.alumno_nombre ? `: ${inc.alumno_nombre}` : "";
    const subject = `DidactIA — Incidencia ${gravedadPlain} registrada${alumnoPlain}`;

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
