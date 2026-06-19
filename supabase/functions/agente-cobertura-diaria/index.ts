// Agente de cobertura diaria (modo "preparar + avisar").
// Programado a primera hora: detecta las ausencias del día, propone un sustituto
// por tramo (guardia → equidad, asignación global sin conflictos) y ENVÍA el plan
// por email + push a la dirección. NO asigna nada: la dirección confirma en la app.
//
// Body: {} (todos los centros) o {"centro_id": "..."} (uno).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

const norm = (s: string) =>
  String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/,/g, " ").replace(/\s+/g, " ").trim();
const esGuardia = (a: string) => {
  const n = String(a || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return n.includes("guardia") || n.includes("vigilanc") || n === "g" || n === "gd" || n === "g.";
};
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 2);
const coincide = (loose: string, hor: string) => {
  const lt = tokens(loose); if (!lt.length) return false;
  const ht = new Set(tokens(hor)); return lt.every((t) => ht.has(t));
};
const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({})) as { centro_id?: string };
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Hoy en horario de Madrid; saltar fines de semana
    const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const dow = new Date(fecha + "T12:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) {
      return new Response(JSON.stringify({ ok: true, skip: "fin_de_semana", fecha }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    let centros: string[] = [];
    if (body.centro_id) centros = [body.centro_id];
    else {
      const { data } = await sb.from("centros").select("id");
      centros = (data || []).map((c: { id: string }) => c.id);
    }

    const resultados: Record<string, unknown>[] = [];
    for (const centro_id of centros) {
      const r = await procesarCentro(sb, centro_id, fecha);
      if (r) resultados.push(r);
    }
    return new Response(JSON.stringify({ ok: true, fecha, centros_con_aviso: resultados }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
  }
});

// deno-lint-ignore no-explicit-any
async function procesarCentro(sb: any, centro_id: string, fecha: string) {
  const dia = DIAS[new Date(fecha + "T12:00:00Z").getUTCDay()];

  // Curso activo
  const { data: info } = await sb.from("info_centro").select("curso_activo").eq("centro_id", centro_id).limit(1);
  const curso = info?.[0]?.curso_activo || "2025-26";

  // Sustituciones pendientes del día (sin sustituto)
  const { data: sustData } = await sb.from("sustituciones")
    .select("id,fecha,tramo,hora_inicio,hora_fin,grupo_horario,profesor_ausente,profesor_sustituto,cubierta")
    .eq("centro_id", centro_id).eq("fecha", fecha);
  let pend = (sustData || []).filter((s: any) => !s.profesor_sustituto && !s.cubierta);
  if (!pend.length) return null;

  // Horario del centro (curso activo)
  const { data: hg } = await sb.from("horarios_grupo")
    .select("dia,tramo,hora_inicio,hora_fin,grupo_horario,profesor_nombre,actividad_nombre")
    .eq("centro_id", centro_id).eq("curso_escolar", curso).eq("dia", dia)
    .not("profesor_nombre", "is", null).limit(20000);
  const clasesDia = hg || [];
  const todosNombres = [...new Set((await sb.from("horarios_grupo").select("profesor_nombre")
    .eq("centro_id", centro_id).eq("curso_escolar", curso).not("profesor_nombre", "is", null).limit(20000))
    .data?.map((r: any) => r.profesor_nombre).filter(Boolean) || [])] as string[];

  // Dedup display por clave normalizada (prefiere sin coma)
  const dispMap = new Map<string, string>();
  for (const n of todosNombres) { const k = norm(n); const prev = dispMap.get(k); if (!prev || (prev.includes(",") && !n.includes(","))) dispMap.set(k, n); }

  // Expandir filas de día completo (tramo null) usando el horario del ausente
  const expandidas: any[] = [];
  for (const s of pend) {
    if (s.tramo != null) { expandidas.push(s); continue; }
    const suyas = clasesDia.filter((c: any) => coincide(s.profesor_ausente, c.profesor_nombre) && !esGuardia(c.actividad_nombre) && !/recreo|patio|comedor|reunion/i.test(c.actividad_nombre || ""));
    suyas.forEach((c: any) => expandidas.push({ ...s, tramo: c.tramo, hora_inicio: c.hora_inicio, hora_fin: c.hora_fin, grupo_horario: c.grupo_horario }));
  }
  pend = expandidas.filter((s) => s.hora_inicio);
  if (!pend.length) return null;
  pend.sort((a, b) => (parseInt(a.tramo) || 99) - (parseInt(b.tramo) || 99) || String(a.hora_inicio).localeCompare(String(b.hora_inicio)));

  // Equidad: guardias asignadas (últimos 120 días) por nombre normalizado
  const desdeEq = new Date(); desdeEq.setDate(desdeEq.getDate() - 120);
  const { data: ghist } = await sb.from("sustituciones").select("profesor_sustituto")
    .eq("centro_id", centro_id).gte("fecha", desdeEq.toISOString().slice(0, 10)).not("profesor_sustituto", "is", null);
  const load: Record<string, number> = {};
  (ghist || []).forEach((g: any) => { const k = norm(g.profesor_sustituto); if (k) load[k] = (load[k] || 0) + 1; });

  // Ausentes del día (para no proponerlos)
  const ausentesKeys = new Set<string>();
  pend.forEach((s) => {
    ausentesKeys.add(norm(s.profesor_ausente));
    [...dispMap.values()].filter((n) => coincide(s.profesor_ausente, n)).forEach((n) => ausentesKeys.add(norm(n)));
  });

  // Candidatos por hora (guardia / libres)
  const horas = [...new Set(pend.map((s) => String(s.hora_inicio).slice(0, 5)))];
  const cand: Record<string, { guardia: any[]; libres: any[] }> = {};
  for (const h of horas) {
    const hSql = h + ":00";
    const enSlot = clasesDia.filter((c: any) => String(c.hora_inicio).slice(0, 8) <= hSql && String(c.hora_fin).slice(0, 8) > hSql);
    const ocup = new Set<string>(), guard = new Set<string>();
    enSlot.forEach((c: any) => { const k = norm(c.profesor_nombre); if (!k) return; if (esGuardia(c.actividad_nombre)) guard.add(k); else ocup.add(k); });
    guard.forEach((k) => ocup.delete(k));
    const disp = [...dispMap.keys()].filter((k) => !ocup.has(k) && !ausentesKeys.has(k));
    const mk = (k: string) => ({ nombre: dispMap.get(k)!, carga: load[k] || 0, key: k });
    const ord = (a: any, b: any) => a.carga - b.carga || a.nombre.localeCompare(b.nombre, "es");
    cand[h] = {
      guardia: disp.filter((k) => guard.has(k)).map(mk).sort(ord),
      libres: disp.filter((k) => !guard.has(k)).map(mk).sort(ord),
    };
  }

  // Asignación global: escasez primero + sin doble-asignación a la misma hora + reparto
  const proj: Record<string, number> = { ...load };
  const usedByHora: Record<string, Set<string>> = {};
  const slots = pend.map((s) => ({ s, h: String(s.hora_inicio).slice(0, 5) }));
  const nCand = (h: string) => cand[h].guardia.length + cand[h].libres.length;
  slots.sort((a, b) => nCand(a.h) - nCand(b.h));
  const plan: any[] = [];
  for (const slot of slots) {
    const used = usedByHora[slot.h] || (usedByHora[slot.h] = new Set());
    let pick: any = null, tipo: string | null = null;
    for (const [t, pool] of [["guardia", cand[slot.h].guardia], ["libre", cand[slot.h].libres]] as [string, any[]][]) {
      const avail = pool.filter((c) => !used.has(c.key)).sort((a, b) => (proj[a.key] ?? a.carga) - (proj[b.key] ?? b.carga) || a.nombre.localeCompare(b.nombre, "es"));
      if (avail.length) { pick = avail[0]; tipo = t; break; }
    }
    if (pick) { used.add(pick.key); proj[pick.key] = (proj[pick.key] ?? pick.carga) + 1; }
    plan.push({ s: slot.s, propuesta: pick ? pick.nombre : null, tipo, carga: pick ? pick.carga : null });
  }
  plan.sort((a, b) => (parseInt(a.s.tramo) || 99) - (parseInt(b.s.tramo) || 99) || String(a.s.hora_inicio).localeCompare(String(b.s.hora_inicio)));

  // Email + push a dirección
  const { data: centro } = await sb.from("centros").select("nombre").eq("id", centro_id).single();
  const centroNombre = centro?.nombre || "Centro";
  const { data: admins } = await sb.from("profiles").select("id,email,full_name")
    .eq("centro_id", centro_id).in("rol", ["admin", "admin_institucional", "director", "jefatura"]).eq("activo", true);
  const emails = (admins || []).map((p: any) => p.email).filter((e: string) => e?.includes("@"));
  const userIds = (admins || []).map((p: any) => p.id).filter(Boolean);

  const cubiertos = plan.filter((p) => p.propuesta).length;
  const sinCobertura = plan.length - cubiertos;
  const ausentes = [...new Set(pend.map((s) => s.profesor_ausente).filter(Boolean))];
  const fechaLeg = new Date(fecha + "T12:00:00Z").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" });

  const filas = plan.map((p) => {
    const hora = p.s.hora_inicio ? String(p.s.hora_inicio).slice(0, 5) + "–" + String(p.s.hora_fin || "").slice(0, 5) : "Tramo " + (p.s.tramo || "—");
    const prop = p.propuesta
      ? `<strong>${esc(p.propuesta)}</strong> <span style="color:#888;font-size:12px;">(${p.tipo === "guardia" ? "🛡 guardia" : "libre"})</span>`
      : `<span style="color:#b83232;">⚠ Sin cobertura</span>`;
    return `<tr><td style="padding:7px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${esc(hora)}</td><td style="padding:7px 10px;border-bottom:1px solid #eee;">${esc(p.s.grupo_horario || "—")}</td><td style="padding:7px 10px;border-bottom:1px solid #eee;">${esc(p.s.profesor_ausente || "—")}</td><td style="padding:7px 10px;border-bottom:1px solid #eee;">${prop}</td></tr>`;
  }).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:auto;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;">
      <div style="background:#C76B3D;padding:20px 26px;color:#fff;"><h2 style="margin:0;font-size:18px;">🤖 Plan de cobertura — ${esc(centroNombre)}</h2>
        <div style="font-size:13px;opacity:.9;margin-top:3px;text-transform:capitalize;">${esc(fechaLeg)}</div></div>
      <div style="padding:22px 26px;">
        <p style="font-size:14px;color:#222;line-height:1.5;margin:0 0 16px;">Buenos días. He revisado el día: <strong>${ausentes.length}</strong> profesor(es) de baja y <strong>${plan.length}</strong> tramo(s) a cubrir. Propongo <strong>${cubiertos}</strong> coberturas${sinCobertura ? ` y hay <strong style="color:#b83232;">${sinCobertura} sin cobertura</strong>` : ", todo cubierto"}.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr><th style="text-align:left;padding:7px 10px;border-bottom:2px solid #ddd;font-size:11px;text-transform:uppercase;color:#888;">Tramo</th><th style="text-align:left;padding:7px 10px;border-bottom:2px solid #ddd;font-size:11px;text-transform:uppercase;color:#888;">Grupo</th><th style="text-align:left;padding:7px 10px;border-bottom:2px solid #ddd;font-size:11px;text-transform:uppercase;color:#888;">Ausente</th><th style="text-align:left;padding:7px 10px;border-bottom:2px solid #ddd;font-size:11px;text-transform:uppercase;color:#888;">Sustituto propuesto</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div style="text-align:center;margin:22px 0 6px;"><a href="https://didactia.eu/app.html" style="display:inline-block;background:#C76B3D;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 26px;border-radius:8px;">Revisar y confirmar en DidactIA →</a></div>
        <p style="font-size:12px;color:#999;text-align:center;margin:6px 0 0;">Esto es una propuesta. Nada se ha asignado todavía — confírmalo desde Sustituciones → Agente.</p>
      </div>
      <div style="padding:12px 26px;border-top:1px solid #eee;color:#999;font-size:12px;">${esc(centroNombre)} · Agente de cobertura de DidactIA</div>
    </div>`;

  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  let enviados = 0;
  if (RESEND_KEY && emails.length) {
    for (const to of emails) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "DidactIA <notificaciones@didactia.eu>", to, subject: `🤖 Plan de cobertura del día — ${centroNombre}`, html }),
        });
        if (res.ok) enviados++;
      } catch (_) { /* noop */ }
    }
  }

  // Push a dirección
  if (userIds.length) {
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ user_ids: userIds, title: "🤖 Plan de cobertura listo", body: `${plan.length} tramo(s) a cubrir hoy${sinCobertura ? ` · ${sinCobertura} sin cobertura` : ""}. Revisa y confirma.`, tag: "cobertura", url: "/app.html" }),
      });
    } catch (_) { /* noop */ }
  }

  return { centro_id, tramos: plan.length, cubiertos, sin_cobertura: sinCobertura, emails: enviados };
}
