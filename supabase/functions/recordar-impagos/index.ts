// Edge Function `recordar-impagos` — DidactIA Academias
// Recibe { centro_id, periodo }. Calcula la deuda de cada alumno (recibos pendientes de
// CUALQUIER mes + cuota del periodo actual si aún no tiene recibo/pago) y envía a cada
// familia un email PERSONALIZADO con el detalle e importe total adeudado, vía Resend.
// Devuelve { sent, impagos }.
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
    const [{ data: mats }, { data: pagos }, { data: centro }] = await Promise.all([
      sb.from("matriculas").select("alumno_id,cuota_mensual,descuento").eq("centro_id", centro_id).eq("estado", "activa"),
      sb.from("pagos").select("alumno_id,estado,periodo,fecha,importe").eq("centro_id", centro_id),
      sb.from("centros").select("nombre").eq("id", centro_id).single(),
    ]);
    const academia = centro?.nombre || "la academia";

    // Deuda por alumno = recibos pendientes (cualquier mes) + cuota neta del periodo si no tiene pago/recibo
    type Deuda = { total: number; lineas: string[] };
    const deuda = new Map<string, Deuda>();
    const perDe = (p: { periodo?: string; fecha?: string }) => p.periodo || String(p.fecha || "").slice(0, 7);
    for (const p of pagos || []) {
      if (p.estado !== "pendiente") continue;
      const d = deuda.get(p.alumno_id) || { total: 0, lineas: [] };
      d.total += Number(p.importe || 0);
      d.lineas.push(`Cuota ${perDe(p)}: ${eur(p.importe)}`);
      deuda.set(p.alumno_id, d);
    }
    const conPagoMes = new Set((pagos || []).filter((p) => perDe(p) === periodo).map((p) => p.alumno_id));
    for (const m of mats || []) {
      const neta = Math.max(0, Number(m.cuota_mensual || 0) - Number(m.descuento || 0));
      if (neta <= 0 || conPagoMes.has(m.alumno_id)) continue;
      const d = deuda.get(m.alumno_id) || { total: 0, lineas: [] };
      d.total += neta;
      d.lineas.push(`Cuota ${periodo}: ${eur(neta)}`);
      deuda.set(m.alumno_id, d);
    }
    // Solo alumnos con matrícula activa cuentan como impago accionable
    const activos = new Set((mats || []).map((m) => m.alumno_id));
    const impagoIds = [...deuda.keys()].filter((id) => activos.has(id) && deuda.get(id)!.total > 0);
    if (!impagoIds.length) return json({ sent: 0, impagos: 0 });

    const [{ data: alumnos }, { data: links }] = await Promise.all([
      sb.from("alumnos").select("id,nombre,apellidos").in("id", impagoIds),
      sb.from("familia_alumno").select("profile_id,alumno_id").in("alumno_id", impagoIds),
    ]);
    const nombre = new Map((alumnos || []).map((a) => [a.id, [a.nombre, a.apellidos].filter(Boolean).join(" ")]));
    const porFamilia = new Map<string, string[]>();
    for (const l of links || []) {
      const arr = porFamilia.get(l.profile_id) || [];
      if (!arr.includes(l.alumno_id)) arr.push(l.alumno_id);
      porFamilia.set(l.profile_id, arr);
    }
    if (!porFamilia.size) return json({ sent: 0, impagos: impagoIds.length });

    const { data: profs } = await sb.from("profiles").select("id,email").in("id", [...porFamilia.keys()]);
    let sent = 0;
    for (const prof of profs || []) {
      const email = (prof.email || "").trim().toLowerCase();
      if (!email.includes("@")) continue;
      const hijos = porFamilia.get(prof.id) || [];
      let total = 0;
      const bloques = hijos.map((id) => {
        const d = deuda.get(id)!;
        total += d.total;
        return `<p style="margin:8px 0 2px"><b>${escapeHtml(nombre.get(id) || "Alumno/a")}</b></p><ul style="margin:2px 0">${d.lineas.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
      }).join("");
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#222">
        <p>Os escribimos desde <b>${escapeHtml(academia)}</b> para recordaros que tenéis cuotas pendientes de pago:</p>
        ${bloques}
        <p style="font-size:16px"><b>Total pendiente: ${escapeHtml(eur(total))}</b></p>
        <p>Si ya lo habéis abonado, ignorad este mensaje. Cualquier duda, contactad con la academia. Gracias.</p>
        <p style="color:#888;font-size:12px">DidactIA Academias</p></div>`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RK}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [email], subject: `Recordatorio de pago — ${academia} (${eur(total)} pendientes)`, html }),
      });
      if (r.ok) sent++;
      await new Promise((res) => setTimeout(res, 550)); // Resend: ~2 req/s
    }
    return json({ sent, impagos: impagoIds.length });
  } catch (err) {
    return json({ error: (err as Error).message, sent: 0 });
  }
});

function eur(n: unknown) {
  return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));
}
