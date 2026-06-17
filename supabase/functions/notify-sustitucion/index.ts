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
    const { sustitucion_id, evento } = await req.json() as {
      sustitucion_id: string;
      evento: "asignacion" | "cobertura";
    };
    if (!sustitucion_id) throw new Error("Falta sustitucion_id");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ ok: false, reason: "resend_no_configurado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
    }

    // Obtener fila de sustituciones
    const { data: s, error: sErr } = await sb
      .from("sustituciones").select("*").eq("id", sustitucion_id).single();
    if (sErr || !s) throw new Error("Sustitución no encontrada");

    const { data: centro } = await sb
      .from("centros").select("nombre").eq("id", s.centro_id).single();
    const centroNombre = centro?.nombre ?? "Centro Educativo";

    const tramoTxt = s.tramo ? `tramo ${s.tramo}` : "todo el día";
    const horas    = s.hora_inicio && s.hora_fin
      ? ` (${String(s.hora_inicio).slice(0,5)}–${String(s.hora_fin).slice(0,5)})`
      : "";
    const instrText = String(s.observaciones || "")
      .replace(/\n§JUST§[^\n]*/g, "").trim() || "Sin instrucciones específicas.";

    const enviados: string[] = [];

    // ── Notificar al PROFESOR AUSENTE ──
    const ausenteEmail = await _lookupEmail(sb, s.centro_id, s.profesor_ausente);
    if (ausenteEmail) {
      const subject = `Tu ausencia del ${s.fecha} queda cubierta — ${centroNombre}`;
      const html = _emailWrap(centroNombre, `
        <h3 style="margin:0 0 16px;font-size:16px;font-weight:600;">Guardia cubierta ✓</h3>
        <p style="font-size:14px;color:#333;margin:0 0 12px;">
          Tu ausencia del <strong>${s.fecha}</strong>, ${tramoTxt}${horas}, grupo <strong>${s.grupo_horario || "—"}</strong>
          queda cubierta por <strong>${s.profesor_sustituto || "jefatura"}</strong>.
        </p>
        <p style="font-size:13px;color:#666;margin:0;">
          Puedes ver el estado en tu historial de ausencias en DidactIA.
        </p>`);
      await _sendEmail(RESEND_KEY, ausenteEmail, subject, html);
      enviados.push(`ausente:${ausenteEmail}`);
    }

    // ── Notificar al PROFESOR SUSTITUTO ──
    if (s.profesor_sustituto) {
      const sustEmail = await _lookupEmail(sb, s.centro_id, s.profesor_sustituto);
      if (sustEmail) {
        const subject = `Guardia asignada — ${s.fecha} · ${centroNombre}`;
        const html = _emailWrap(centroNombre, `
          <h3 style="margin:0 0 16px;font-size:16px;font-weight:600;">Tienes guardia asignada</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:8px 0;color:#666;width:120px;font-weight:500;">Fecha</td>
              <td style="padding:8px 0;color:#222;font-weight:600;">${s.fecha}</td>
            </tr>
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:8px 0;color:#666;font-weight:500;">Tramo</td>
              <td style="padding:8px 0;color:#222;">${tramoTxt}${horas}</td>
            </tr>
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:8px 0;color:#666;font-weight:500;">Grupo</td>
              <td style="padding:8px 0;color:#222;">${s.grupo_horario || "—"}</td>
            </tr>
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:8px 0;color:#666;font-weight:500;">Cubre a</td>
              <td style="padding:8px 0;color:#222;">${s.profesor_ausente || "—"}</td>
            </tr>
          </table>
          <div style="background:#f8f9fa;border-left:4px solid #1a73e8;border-radius:0 6px 6px 0;padding:14px 18px;">
            <p style="font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.5px;margin:0 0 6px;">
              Instrucciones del profesor ausente
            </p>
            <p style="font-size:14px;color:#222;margin:0;white-space:pre-wrap;">${instrText}</p>
          </div>`);
        await _sendEmail(RESEND_KEY, sustEmail, subject, html);
        enviados.push(`sustituto:${sustEmail}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, enviados }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
  }
});

async function _lookupEmail(
  sb: ReturnType<typeof createClient>,
  centroId: string,
  nombre: string,
): Promise<string | null> {
  if (!nombre) return null;
  const partes = nombre.trim().split(/\s+/).filter((p) => p.length > 2).slice(0, 2);
  if (!partes.length) return null;
  // deno-lint-ignore no-explicit-any
  let q = (sb as any).from("profiles")
    .select("email")
    .eq("centro_id", centroId)
    .eq("activo", true);
  for (const p of partes) q = q.ilike("full_name", `%${p}%`);
  const { data } = await q.limit(1);
  const email = data?.[0]?.email;
  return email?.includes("@") ? email : null;
}

async function _sendEmail(key: string, to: string, subject: string, html: string) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "DidactIA <notificaciones@didactia.eu>", to, subject, html }),
  });
}

function _emailWrap(centroNombre: string, body: string): string {
  return `<div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
    <div style="background:#1a73e8;padding:20px 28px;">
      <h2 style="color:#fff;margin:0;font-size:17px;">DidactIA — ${centroNombre}</h2>
    </div>
    <div style="padding:24px 28px;">${body}
      <div style="text-align:center;margin:18px 0 4px;">
        <a href="https://didactia.eu/app.html" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 26px;border-radius:8px;">
          Abrir DidactIA →
        </a>
      </div>
      <p style="color:#999;font-size:12px;margin-top:24px;border-top:1px solid #e0e0e0;padding-top:14px;">
        ${centroNombre} · Gestionado con DidactIA
      </p>
    </div>
  </div>`;
}
