import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAVEDAD_LABEL: Record<string, string> = {
  leve: "🟢 Leve",
  grave: "🟠 Grave",
  muy_grave: "🔴 Muy grave",
};

const GRAVEDAD_COLOR: Record<string, string> = {
  leve: "#2e7d32",
  grave: "#e65100",
  muy_grave: "#b71c1c",
};

const TIPO_LABEL: Record<string, string> = {
  convivencia: "Convivencia",
  material: "Material",
  instalaciones: "Instalaciones",
  otro: "Otro",
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

    if (!inc.alumno_nombre) {
      return new Response(JSON.stringify({ error: "sin_alumno", message: "La incidencia no tiene alumno registrado" }), {
        headers: { ...CORS, "Content-Type": "application/json" }, status: 400,
      });
    }

    // 2. Buscar alumno en el mismo centro
    const { data: alumnos } = await sb
      .from("alumnos")
      .select("id, nombre")
      .eq("centro_id", inc.centro_id)
      .ilike("nombre", `%${inc.alumno_nombre}%`);

    if (!alumnos || alumnos.length === 0) {
      return new Response(JSON.stringify({ error: "sin_alumnos", message: `No se encontró "${inc.alumno_nombre}" en el centro` }), {
        headers: { ...CORS, "Content-Type": "application/json" }, status: 404,
      });
    }

    // 3. Obtener familias vinculadas → emails
    const alumnoIds = alumnos.map((a: { id: string }) => a.id);
    const { data: vinculos } = await sb
      .from("familia_alumno")
      .select("profile_id")
      .in("alumno_id", alumnoIds);

    if (!vinculos || vinculos.length === 0) {
      return new Response(JSON.stringify({ error: "sin_familias", message: "El alumno no tiene familias vinculadas" }), {
        headers: { ...CORS, "Content-Type": "application/json" }, status: 404,
      });
    }

    const profileIds = vinculos.map((v: { profile_id: string }) => v.profile_id);
    const { data: familiaProfiles } = await sb
      .from("profiles")
      .select("email, full_name")
      .in("id", profileIds)
      .eq("activo", true);

    const emails = (familiaProfiles || [])
      .map((p: { email: string }) => p.email)
      .filter((e: string) => e && e.includes("@"));

    if (emails.length === 0) {
      return new Response(JSON.stringify({ error: "sin_emails", message: "Las familias no tienen email válido" }), {
        headers: { ...CORS, "Content-Type": "application/json" }, status: 404,
      });
    }

    // 4. Nombre del centro
    let centroNombre = "su centro educativo";
    const { data: centro } = await sb
      .from("centros")
      .select("nombre")
      .eq("id", inc.centro_id)
      .single();
    if (centro?.nombre) centroNombre = centro.nombre;

    // 5. Enviar emails via Resend
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) throw new Error("RESEND_API_KEY no configurada");

    const gravedad = inc.gravedad || "leve";
    const gravedadLabel = GRAVEDAD_LABEL[gravedad] || gravedad;
    const gravedadColor = GRAVEDAD_COLOR[gravedad] || "#1565c0";
    const tipoLabel = TIPO_LABEL[inc.tipo] || inc.tipo || "—";
    const fecha = inc.fecha || new Date().toISOString().split("T")[0];

    const htmlBody = `
      <div style='font-family:sans-serif;max-width:560px;margin:auto;padding:0;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;'>
        <div style='background:${gravedadColor};padding:24px 32px;'>
          <h2 style='color:#fff;margin:0;font-size:20px;'>${gravedadLabel} — Incidencia escolar</h2>
          <p style='color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;'>${centroNombre}</p>
        </div>
        <div style='padding:24px 32px;'>
          <p style='color:#333;font-size:15px;'>Estimada familia,</p>
          <p style='color:#333;font-size:14px;'>Le informamos de que se ha registrado una incidencia relacionada con su hijo/a en ${centroNombre}.</p>
          <table style='width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;'>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;width:120px;font-weight:500;'>Alumno/a</td>
              <td style='padding:10px 0;color:#222;font-weight:600;'>${inc.alumno_nombre}</td>
            </tr>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;font-weight:500;'>Tipo</td>
              <td style='padding:10px 0;color:#222;'>${tipoLabel}</td>
            </tr>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;font-weight:500;'>Gravedad</td>
              <td style='padding:10px 0;color:${gravedadColor};font-weight:600;'>${gravedadLabel}</td>
            </tr>
            <tr style='border-bottom:1px solid #e0e0e0;'>
              <td style='padding:10px 0;color:#666;font-weight:500;'>Fecha</td>
              <td style='padding:10px 0;color:#222;'>${fecha}</td>
            </tr>
            <tr>
              <td style='padding:10px 0;color:#666;font-weight:500;vertical-align:top;'>Descripción</td>
              <td style='padding:10px 0;color:#222;'>${inc.descripcion || '—'}</td>
            </tr>
          </table>
          <p style='color:#555;font-size:13px;'>Si desea más información o tiene alguna consulta, contacte con el equipo del centro.</p>
          <p style='color:#888;font-size:12px;margin-top:24px;border-top:1px solid #e0e0e0;padding-top:16px;'>${centroNombre} · Gestionado con DidactIA</p>
        </div>
      </div>
    `;

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
          subject: `${gravedadLabel}: Incidencia escolar — ${inc.alumno_nombre}`,
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
