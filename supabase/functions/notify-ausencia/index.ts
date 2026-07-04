// Edge Function `notify-ausencia` — DidactIA Academias
// Recibe { alumno_id, fecha }, resuelve los emails de las familias del alumno y
// envía un aviso de ausencia vía Resend. Devuelve { sent }.
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
    const { alumno_id, fecha } = await req.json();
    if (!alumno_id) return json({ error: "Falta alumno_id" }, 400);
    const RK = Deno.env.get("RESEND_API_KEY");
    if (!RK) return json({ error: "RESEND_API_KEY no configurada" }, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: al } = await sb.from("alumnos").select("nombre,apellidos").eq("id", alumno_id).single();
    const nombre = al ? [al.nombre, al.apellidos].filter(Boolean).join(" ") : "el alumno/a";

    const { data: links } = await sb.from("familia_alumno").select("profile_id").eq("alumno_id", alumno_id);
    const pids = [...new Set((links || []).map((l: { profile_id: string }) => l.profile_id))];
    let emails: string[] = [];
    if (pids.length) {
      const { data: profs } = await sb.from("profiles").select("email").in("id", pids);
      emails = (profs || []).map((p: { email?: string }) => (p.email || "").trim().toLowerCase()).filter((e) => e.includes("@"));
      emails = [...new Set(emails)];
    }
    if (!emails.length) return json({ sent: 0, note: "Sin familias con email" });

    const html = `<div style="font-family:sans-serif;font-size:15px;color:#222"><p>Os informamos de que <b>${escapeHtml(nombre)}</b> ha faltado hoy (${escapeHtml(String(fecha || ""))}).</p><p>Si se trata de un error o queréis justificar la ausencia, contactad con la academia.</p><p style="color:#888;font-size:12px">DidactIA Academias</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [FROM.replace(/.*<(.*)>.*/, "$1")], bcc: emails, subject: `Ausencia de ${nombre} (${fecha || ""})`, html }),
    });
    const rd = await r.json();
    if (!r.ok) return json({ error: rd?.message || "Error Resend", sent: 0 });
    return json({ sent: emails.length, id: rd?.id });
  } catch (err) {
    return json({ error: (err as Error).message, sent: 0 });
  }
});

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));
}
