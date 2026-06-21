import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Envía recordatorios de justificante pendiente.
 * Busca sustituciones de hace ≥48h donde el profesor notificó su ausencia
 * (creado_por != null) y no se ha subido justificante aún (observaciones
 * no contiene §JUST§).
 *
 * Llamada manual: POST {} → procesa todos los centros.
 * Llamada acotada: POST { centro_id } → solo ese centro.
 * Para automatizar: crear Supabase Cron Schedule desde el dashboard
 * (Edge Functions → Schedule) que llame a esta EF cada día a las 08:00.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Protección de invocación: solo el cron (o un caller con el secreto compartido) ──
  // Se activa en cuanto CRON_SECRET esté configurado en los secrets de Supabase; hasta
  // entonces no bloquea (evita tumbar el cron antes de actualizar el job con la cabecera).
  const _cronSecret = Deno.env.get("CRON_SECRET");
  if (_cronSecret && req.headers.get("x-cron-secret") !== _cronSecret) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  try {
    const body = await req.json().catch(() => ({})) as { centro_id?: string };

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ ok: false, reason: "resend_no_configurado" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
    }

    // Sustituciones de hace ≥ 48h sin justificante subido
    const hace48h = new Date();
    hace48h.setHours(hace48h.getHours() - 48);
    const fechaCorte = hace48h.toISOString().split("T")[0];

    // deno-lint-ignore no-explicit-any
    const sbAny = sb as any;
    let q = sbAny.from("sustituciones")
      .select("id, centro_id, fecha, tramo, hora_inicio, hora_fin, grupo_horario, profesor_ausente, observaciones, creado_por")
      .lte("fecha", fechaCorte)
      .not("creado_por", "is", null); // solo filas notificadas por el propio profesor

    if (body.centro_id) q = q.eq("centro_id", body.centro_id);

    const { data: pendientes, error } = await q;
    if (error) throw new Error("Error consultando sustituciones: " + error.message);

    // Filtrar las que NO tienen justificante
    const sinJust = (pendientes || []).filter(
      (s: { observaciones: string }) => !String(s.observaciones || "").includes("§JUST§"),
    );

    const recordatorios: string[] = [];

    for (const s of sinJust) {
      // Buscar email del profesor ausente
      const partes = (s.profesor_ausente || "").trim().split(/\s+/).filter((p: string) => p.length > 2).slice(0, 2);
      if (!partes.length) continue;
      // deno-lint-ignore no-explicit-any
      let eq = sbAny.from("profiles").select("email").eq("centro_id", s.centro_id).eq("activo", true);
      for (const p of partes) eq = eq.ilike("full_name", `%${p}%`);
      const { data: pData } = await eq.limit(1);
      const email = pData?.[0]?.email;
      if (!email?.includes("@")) continue;

      const tramoTxt = s.tramo ? `tramo ${s.tramo}` : "todo el día";
      const horas = s.hora_inicio && s.hora_fin
        ? ` (${String(s.hora_inicio).slice(0,5)}–${String(s.hora_fin).slice(0,5)})`
        : "";

      const html = `<div style="font-family:sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <div style="background:#e65100;padding:18px 24px;">
          <h2 style="color:#fff;margin:0;font-size:16px;">⚠️ Justificante pendiente — DidactIA</h2>
        </div>
        <div style="padding:22px 24px;">
          <p style="font-size:14px;color:#333;margin:0 0 12px;">
            Hola <strong>${s.profesor_ausente}</strong>,
          </p>
          <p style="font-size:14px;color:#333;margin:0 0 16px;">
            Tu ausencia del <strong>${s.fecha}</strong> (${tramoTxt}${horas}, grupo ${s.grupo_horario || "—"})
            aún no tiene justificante adjunto en DidactIA.
          </p>
          <p style="font-size:14px;color:#333;margin:0 0 16px;">
            Accede a <strong>DidactIA → Sustituciones → Mis ausencias</strong> y haz clic en
            <em>"📎 Adjuntar justificante"</em> para subir el documento.
          </p>
          <p style="color:#999;font-size:12px;margin-top:20px;border-top:1px solid #e0e0e0;padding-top:12px;">
            Este recordatorio se ha enviado automáticamente 48h después de la ausencia.
          </p>
        </div>
      </div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "DidactIA <notificaciones@didactia.eu>",
          to: email,
          subject: `DidactIA — Recuerda adjuntar tu justificante (ausencia del ${s.fecha})`,
          html,
        }),
      });
      if (res.ok) recordatorios.push(email);
    }

    return new Response(
      JSON.stringify({ ok: true, pendientes_sin_just: sinJust.length, recordatorios_enviados: recordatorios.length }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
  }
});
