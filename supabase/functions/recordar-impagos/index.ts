// Edge Function `recordar-impagos` — DidactIA Academias
// Recibe { centro_id, periodo }, calcula los alumnos con la cuota del periodo sin
// pagar y envía un recordatorio a sus familias vía Resend. Devuelve { sent, impagos }.
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const FROM = Deno.env.get("MAIL_FROM") || "DidactIA Academias <onboarding@resend.dev>";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" }, status: s });
  try {
    const { centro_id, periodo } = await req.json();
    if (!centro_id || !periodo) return json({ error: "Faltan centro_id/periodo" }, 400);
    const RK = Deno.env.get("RESEND_API_KEY");
    if (!RK) return json({ error: "RESEND_API_KEY no configurada" }, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: mats } = await sb.from("matriculas").select("alumno_id,cuota_mensual,estado").eq("centro_id", centro_id).eq("estado", "activa");
    const conCuota = (mats || []).filter((m: { cuota_mensual?: number }) => Number(m.cuota_mensual || 0) > 0);
    if (!conCuota.length) return json({ sent: 0, impagos: 0 });

    const { data: pagos } = await sb.from("pagos").select("alumno_id,estado,periodo,fecha").eq("centro_id", centro_id);
    const pagados = new Set((pagos || []).filter((p: { estado: string; periodo?: string; fecha?: string }) =>
      p.estado === "pagado" && (p.periodo === periodo || String(p.fecha || "").slice(0, 7) === periodo)).map((p: { alumno_id: string }) => p.alumno_id));
    const impagoIds = [...new Set(conCuota.map((m: { alumno_id: string }) => m.alumno_id).filter((id: string) => !pagados.has(id)))];
    if (!impagoIds.length) return json({ sent: 0, impagos: 0 });

    const { data: links } = await sb.from("familia_alumno").select("profile_id").in("alumno_id", impagoIds);
    const pids = [...new Set((links || []).map((l: { profile_id: string }) => l.profile_id))];
    let emails: string[] = [];
    if (pids.length) {
      const { data: profs } = await sb.from("profiles").select("email").in("id", pids);
      emails = [...new Set((profs || []).map((p: { email?: string }) => (p.email || "").trim().toLowerCase()).filter((e) => e.includes("@")))];
    }
    if (!emails.length) return json({ sent: 0, impagos: impagoIds.length });

    const html = `<div style="font-family:sans-serif;font-size:15px;color:#222"><p>Os recordamos que la <b>cuota de ${escapeHtml(periodo)}</b> está pendiente de pago.</p><p>Si ya lo habéis abonado, ignorad este mensaje. Cualquier duda, contactad con la academia. Gracias.</p><p style="color:#888;font-size:12px">DidactIA Academias</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [FROM.replace(/.*<(.*)>.*/, "$1")], bcc: emails, subject: `Recordatorio de pago — cuota ${periodo}`, html }),
    });
    const rd = await r.json();
    if (!r.ok) return json({ error: rd?.message || "Error Resend", sent: 0, impagos: impagoIds.length });
    return json({ sent: emails.length, impagos: impagoIds.length, id: rd?.id });
  } catch (err) {
    return json({ error: (err as Error).message, sent: 0 });
  }
});

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));
}
