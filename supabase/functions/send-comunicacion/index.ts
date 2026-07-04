// Edge Function `send-comunicacion` — DidactIA Academias
// Recibe { comunicacion_id }, resuelve los emails de las familias destinatarias
// (server-side, service role) y envía el email vía Resend. Marca estado 'enviada'.
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
    const { comunicacion_id } = await req.json();
    if (!comunicacion_id) return json({ error: "Falta comunicacion_id" }, 400);
    const RK = Deno.env.get("RESEND_API_KEY");
    if (!RK) return json({ error: "RESEND_API_KEY no configurada" }, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: c } = await sb.from("comunicaciones").select("*").eq("id", comunicacion_id).single();
    if (!c) return json({ error: "Comunicación no encontrada" }, 404);

    // Resolver alumno_ids destinatarios
    let alumnoIds: string[] | null = null; // null = todas las familias del centro
    if (c.destinatario === "grupo" && c.destinatario_ref) {
      const { data: mg } = await sb.from("matricula_grupo")
        .select("matriculas(alumno_id)").eq("grupo_id", c.destinatario_ref).eq("centro_id", c.centro_id);
      alumnoIds = (mg || []).map((r: { matriculas?: { alumno_id?: string } }) => r.matriculas?.alumno_id).filter(Boolean) as string[];
    } else if (c.destinatario === "alumno" && c.destinatario_ref) {
      alumnoIds = [c.destinatario_ref];
    }

    // Emails de las familias
    let emails: string[] = [];
    if (alumnoIds === null) {
      const { data: fams } = await sb.from("profiles").select("email").eq("centro_id", c.centro_id).eq("rol", "familia");
      emails = (fams || []).map((f: { email?: string }) => f.email).filter(Boolean) as string[];
    } else if (alumnoIds.length) {
      const { data: links } = await sb.from("familia_alumno").select("profile_id").in("alumno_id", alumnoIds);
      const pids = [...new Set((links || []).map((l: { profile_id: string }) => l.profile_id))];
      if (pids.length) {
        const { data: profs } = await sb.from("profiles").select("email").in("id", pids);
        emails = (profs || []).map((p: { email?: string }) => p.email).filter(Boolean) as string[];
      }
    }
    emails = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
    if (!emails.length) { await sb.from("comunicaciones").update({ estado: "enviada" }).eq("id", comunicacion_id); return json({ sent: 0, note: "Sin destinatarios con email" }); }

    const html = `<div style="font-family:sans-serif;font-size:15px;color:#222"><h2>${escapeHtml(c.titulo)}</h2><p>${escapeHtml(c.cuerpo || "").replace(/\n/g, "<br>")}</p><hr><p style="font-size:12px;color:#888">Enviado por DidactIA Academias</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [FROM.replace(/.*<(.*)>.*/, "$1")], bcc: emails, subject: c.titulo, html }),
    });
    const rd = await r.json();
    if (!r.ok) { await sb.from("comunicaciones").update({ estado: "error" }).eq("id", comunicacion_id); return json({ error: rd?.message || "Error Resend", detail: rd }, 200); }

    await sb.from("comunicaciones").update({ estado: "enviada" }).eq("id", comunicacion_id);
    return json({ sent: emails.length, id: rd?.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 200);
  }
});

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));
}
