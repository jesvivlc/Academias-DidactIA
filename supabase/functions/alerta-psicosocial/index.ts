import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Alumno { id: string; nombre: string; grupo_horario: string; }
interface AlertaNueva {
  centro_id: string; alumno_id: string; tipo: string; nivel: string;
  descripcion: string; condicion_a: boolean; condicion_b: boolean; condicion_c: boolean;
}

function getDiasLaborables(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const d = new Date(desde);
  const h = new Date(hasta);
  while (d <= h) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dias.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

function buildEmail(alertas: AlertaNueva[], alumnos: Alumno[], centroNombre: string): string {
  const rows = alertas.map(a => {
    const al = alumnos.find(x => x.id === a.alumno_id);
    const conds = [
      a.condicion_a ? "🍽️ Absentismo comedor" : null,
      a.condicion_b ? "🔄 Inestabilidad docente" : null,
      a.condicion_c ? "⚠️ Múltiples incidencias" : null,
    ].filter(Boolean).join(", ");
    const color = a.nivel === "alto" ? "#b91c1c" : "#c2410c";
    const bg    = a.nivel === "alto" ? "#fef2f2" : "#fff7ed";
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee">${al?.nombre ?? "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee">${al?.grupo_horario ?? "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee">
        <span style="background:${bg};color:${color};padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">${a.nivel.toUpperCase()}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px">${conds}</td>
    </tr>`;
  }).join("");

  return `<div style="font-family:system-ui,sans-serif;max-width:620px;margin:0 auto">
    <div style="background:#b91c1c;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="color:white;margin:0;font-size:18px">⚠️ Alertas de riesgo psicosocial — ${centroNombre}</h2>
      <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:13px">Detección automática DidactIA · ${new Date().toLocaleDateString("es-ES")}</p>
    </div>
    <div style="background:white;padding:20px 24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
      <p style="color:#374151;font-size:14px">Se han detectado <strong>${alertas.length}</strong> alumno(s) con señales de riesgo psicosocial combinando 2 o más indicadores.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Alumno</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Grupo</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Nivel</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Indicadores</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">Accede a DidactIA → Analytics → Alertas Tempranas para gestionar estas alertas.</p>
    </div>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { centro_id } = await req.json();
    if (!centro_id) throw new Error("Falta centro_id");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const hoy = new Date().toISOString().slice(0, 10);

    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const hace30str = hace30.toISOString().slice(0, 10);

    const semIni = new Date();
    const dow = semIni.getDay() || 7;
    semIni.setDate(semIni.getDate() - dow + 1);
    const semIniStr = semIni.toISOString().slice(0, 10);

    /* ── Cargar alumnos ── */
    const { data: alumnos } = await sb
      .from("alumnos")
      .select("id, nombre, grupo_horario")
      .eq("centro_id", centro_id);

    if (!alumnos || alumnos.length === 0) {
      return new Response(JSON.stringify({ alertas_creadas: 0, mensaje: "Sin alumnos" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    /* ── Datos paralelos para las 3 condiciones ── */
    const [asistRes, sustRes, incRes] = await Promise.all([
      sb.from("asistencia_comedor")
        .select("alumno_id, fecha, se_queda")
        .in("alumno_id", alumnos.map((a: Alumno) => a.id))
        .gte("fecha", hace30str)
        .lte("fecha", hoy)
        .order("fecha", { ascending: false }),
      sb.from("sustituciones")
        .select("grupo_horario")
        .eq("centro_id", centro_id)
        .gte("fecha", semIniStr)
        .lte("fecha", hoy)
        .eq("cubierta", false),
      sb.from("incidencias")
        .select("alumno_nombre")
        .eq("centro_id", centro_id)
        .eq("estado", "abierta"),
    ]);

    /* Condición A: mapa alumno_id → registros de comedor (desc) */
    const asistMap: Record<string, { fecha: string; se_queda: boolean }[]> = {};
    (asistRes.data ?? []).forEach((r: { alumno_id: string; fecha: string; se_queda: boolean }) => {
      (asistMap[r.alumno_id] ??= []).push({ fecha: r.fecha, se_queda: r.se_queda });
    });

    /* Condición B: grupos con >3 sustituciones sin cubrir esta semana */
    const sustPorGrupo: Record<string, number> = {};
    (sustRes.data ?? []).forEach((r: { grupo_horario: string }) => {
      sustPorGrupo[r.grupo_horario] = (sustPorGrupo[r.grupo_horario] ?? 0) + 1;
    });

    /* Condición C: alumnos con >2 incidencias abiertas */
    const incPorAlumno: Record<string, number> = {};
    (incRes.data ?? []).forEach((r: { alumno_nombre: string | null }) => {
      if (r.alumno_nombre) incPorAlumno[r.alumno_nombre] = (incPorAlumno[r.alumno_nombre] ?? 0) + 1;
    });

    const diasLab = getDiasLaborables(hace30str, hoy);

    const alertasNuevas: AlertaNueva[] = [];

    for (const alumno of alumnos as Alumno[]) {
      /* ── Condición A ── */
      let condA = false;
      const historial = asistMap[alumno.id] ?? [];
      const vecesCom = historial.filter(h => h.se_queda).length;
      if (vecesCom >= 5) {
        let racha = 0;
        for (const dia of [...diasLab].reverse()) {
          const reg = historial.find(h => h.fecha === dia);
          if (!reg || !reg.se_queda) racha++;
          else break;
        }
        condA = racha > 3;
      }

      /* ── Condición B ── */
      const condB = (sustPorGrupo[alumno.grupo_horario] ?? 0) > 3;

      /* ── Condición C ── */
      const condC = (incPorAlumno[alumno.nombre] ?? 0) > 2;

      const numCond = [condA, condB, condC].filter(Boolean).length;
      if (numCond < 2) continue;

      /* Evitar duplicar alertas no resueltas */
      const { data: existente } = await sb
        .from("alertas_predictivas")
        .select("id")
        .eq("centro_id", centro_id)
        .eq("alumno_id", alumno.id)
        .eq("resuelta", false)
        .maybeSingle();

      if (existente) continue;

      const nivel = numCond === 3 ? "alto" : "medio";
      alertasNuevas.push({
        centro_id,
        alumno_id: alumno.id,
        tipo: "riesgo_psicosocial",
        nivel,
        descripcion: `${alumno.nombre} (${alumno.grupo_horario}): ${[
          condA ? "Absentismo comedor" : null,
          condB ? "Alta inestabilidad docente" : null,
          condC ? "Múltiples incidencias abiertas" : null,
        ].filter(Boolean).join(", ")}`,
        condicion_a: condA,
        condicion_b: condB,
        condicion_c: condC,
      });
    }

    if (alertasNuevas.length > 0) {
      await sb.from("alertas_predictivas").insert(alertasNuevas);
    }

    /* ── Enviar email si hay alertas nuevas ── */
    if (alertasNuevas.length > 0 && resendKey) {
      const [{ data: admins }, { data: centro }] = await Promise.all([
        sb.from("profiles").select("email, full_name")
          .eq("centro_id", centro_id).in("rol", ["admin"]).neq("activo", false),
        sb.from("centros").select("nombre").eq("id", centro_id).single(),
      ]);

      const centroNombre = (centro as { nombre: string } | null)?.nombre ?? "Centro";
      const html = buildEmail(alertasNuevas, alumnos as Alumno[], centroNombre);

      for (const admin of admins ?? []) {
        const email = (admin as { email: string; full_name: string }).email;
        if (!email?.includes("@")) continue;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "DidactIA <alertas@didactia.eu>",
            to: [email],
            subject: `⚠️ ${alertasNuevas.length} alerta(s) psicosocial — ${centroNombre}`,
            html,
          }),
        });
      }
    }

    return new Response(JSON.stringify({ alertas_creadas: alertasNuevas.length }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...CORS, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
