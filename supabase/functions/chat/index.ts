import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/* Tools that don't need user confirmation (read-only) */
const READ_ONLY = new Set(["consultar_profesor_libre"]);

const TOOL_DECLARATIONS = [
  {
    name: "crear_sustitucion",
    description:
      "Registra una sustitución docente en el sistema cuando un profesor está ausente y necesita cobertura.",
    parameters: {
      type: "OBJECT",
      properties: {
        fecha:            { type: "STRING", description: "Fecha en formato YYYY-MM-DD" },
        tramo:            { type: "STRING", description: "Número de tramo horario (ej: '1', '2', '3')" },
        grupo_horario:    { type: "STRING", description: "Grupo afectado (ej: '1ESOA', '2BACB')" },
        profesor_ausente: { type: "STRING", description: "Nombre completo del profesor ausente" },
        observaciones:    { type: "STRING", description: "Observaciones adicionales (opcional)" },
      },
      required: ["fecha", "tramo", "grupo_horario", "profesor_ausente"],
    },
  },
  {
    name: "crear_incidencia",
    description: "Registra una incidencia de convivencia, material o instalaciones en el sistema.",
    parameters: {
      type: "OBJECT",
      properties: {
        alumno_nombre: { type: "STRING", description: "Nombre del alumno implicado" },
        grupo_horario: { type: "STRING", description: "Grupo del alumno (ej: '2ESOB')" },
        tipo:          { type: "STRING", description: "Tipo: convivencia, material, instalaciones, otro" },
        gravedad:      { type: "STRING", description: "Gravedad: leve, grave, muy_grave" },
        descripcion:   { type: "STRING", description: "Descripción detallada del incidente" },
      },
      required: ["alumno_nombre", "grupo_horario", "tipo", "gravedad", "descripcion"],
    },
  },
  {
    name: "consultar_profesor_libre",
    description:
      "Consulta qué profesores están libres (sin clase asignada) en un tramo y día concreto. No requiere confirmación.",
    parameters: {
      type: "OBJECT",
      properties: {
        fecha: { type: "STRING", description: "Fecha en formato YYYY-MM-DD" },
        tramo: { type: "STRING", description: "Número de tramo horario" },
      },
      required: ["fecha", "tramo"],
    },
  },
  {
    name: "registrar_ausencia_profesor",
    description:
      "Registra una solicitud de ausencia para un profesor. Quedará en estado pendiente de aprobación por jefatura.",
    parameters: {
      type: "OBJECT",
      properties: {
        profesor_nombre: { type: "STRING", description: "Nombre completo del profesor" },
        fecha_inicio:    { type: "STRING", description: "Fecha de inicio en formato YYYY-MM-DD" },
        fecha_fin:       { type: "STRING", description: "Fecha de fin en formato YYYY-MM-DD" },
        tipo: {
          type: "STRING",
          description: "Tipo: baja_medica, permiso, asunto_propio, formacion, sindical, otros",
        },
      },
      required: ["profesor_nombre", "fecha_inicio", "fecha_fin", "tipo"],
    },
  },
  {
    name: "avisar_comedor",
    description: "Registra que un alumno concreto no comerá en el comedor en una fecha específica.",
    parameters: {
      type: "OBJECT",
      properties: {
        alumno_nombre: { type: "STRING", description: "Nombre del alumno" },
        fecha:         { type: "STRING", description: "Fecha en formato YYYY-MM-DD" },
      },
      required: ["alumno_nombre", "fecha"],
    },
  },
];

/* ── helpers ── */

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type SB = ReturnType<typeof createClient>;

async function callGemini(
  apiKey: string,
  contents: unknown[],
  withTools: boolean,
  systemInstruction?: string,
): Promise<Response> {
  const payload: Record<string, unknown> = { contents };
  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (withTools) {
    payload.tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
    payload.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  return fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function executeTool(
  tool: string,
  args: Record<string, string>,
  sb: SB,
  centro_id: string,
  user_id: string,
  user_name: string,
): Promise<string> {
  const hoy = new Date().toISOString().slice(0, 10);

  switch (tool) {
    case "crear_sustitucion": {
      const { fecha, tramo, grupo_horario, profesor_ausente, observaciones, hora_inicio, hora_fin } = args;
      const { error } = await sb.from("sustituciones").insert({
        centro_id,
        fecha: fecha || hoy,
        tramo: String(tramo),
        grupo_horario,
        profesor_ausente,
        hora_inicio: hora_inicio || "",
        hora_fin: hora_fin || "",
        observaciones: observaciones || "",
        profesor_sustituto: null,
        cubierta: false,
        creado_por: user_id,
      });
      if (error) throw new Error(`Error al registrar sustitución: ${error.message}`);
      return `✅ Sustitución registrada para ${grupo_horario} el ${fecha} en el tramo ${tramo}.`;
    }

    case "crear_incidencia": {
      const { alumno_nombre, grupo_horario, tipo, gravedad, descripcion } = args;
      const { error } = await sb.from("incidencias").insert({
        centro_id,
        fecha: hoy,
        tipo: tipo || "convivencia",
        gravedad: gravedad || "leve",
        descripcion,
        alumno_nombre,
        grupo_horario,
        registrado_por: user_name || user_id,
        estado: "abierta",
      });
      if (error) throw new Error(`Error al registrar incidencia: ${error.message}`);
      return `✅ Incidencia registrada para ${alumno_nombre}. Gravedad: ${gravedad}.`;
    }

    case "consultar_profesor_libre": {
      const { fecha, tramo: tramoNum } = args;
      const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
      const dia = DIAS[new Date(fecha + "T12:00:00Z").getUTCDay()];

      const { data: todos } = await sb
        .from("horarios_grupo")
        .select("profesor_nombre")
        .eq("centro_id", centro_id)
        .not("profesor_nombre", "is", null);

      const todosProfes = [
        ...new Set(
          (todos ?? [])
            .map((r: { profesor_nombre: string }) => r.profesor_nombre)
            .filter(Boolean),
        ),
      ].sort() as string[];

      const { data: ocupados } = await sb
        .from("horarios_grupo")
        .select("profesor_nombre")
        .eq("centro_id", centro_id)
        .eq("dia", dia)
        .eq("tramo", String(tramoNum));

      const ocupadosSet = new Set(
        (ocupados ?? [])
          .map((r: { profesor_nombre: string }) => r.profesor_nombre)
          .filter(Boolean),
      );

      const libres = todosProfes.filter((p) => !ocupadosSet.has(p));
      if (!libres.length) return `No hay profesores libres el ${fecha} en el tramo ${tramoNum}.`;
      return `Profesores libres el ${fecha} (tramo ${tramoNum}): ${libres.join(", ")}.`;
    }

    case "registrar_ausencia_profesor": {
      const { profesor_nombre, fecha_inicio, fecha_fin, tipo } = args;
      const primerApellido = profesor_nombre.trim().split(/\s+/)[0];
      const { data: perfil } = await sb
        .from("profiles")
        .select("id")
        .eq("centro_id", centro_id)
        .ilike("full_name", `%${primerApellido}%`)
        .maybeSingle();

      const { error } = await sb.from("ausencias_profesor").insert({
        centro_id,
        profile_id: (perfil as { id: string } | null)?.id ?? null,
        fecha: fecha_inicio,
        fecha_fin: fecha_fin || fecha_inicio,
        tipo: tipo || "asunto_propio",
        motivo: `Registrado via asistente IA por ${user_name}`,
        estado: "pendiente",
        trabajo_alumnos: "",
      });
      if (error) throw new Error(`Error al registrar ausencia: ${error.message}`);
      return `✅ Ausencia registrada para ${profesor_nombre} del ${fecha_inicio} al ${fecha_fin}. Pendiente de aprobación por jefatura.`;
    }

    case "avisar_comedor": {
      const { alumno_nombre, fecha } = args;
      const palabras = alumno_nombre.trim().split(/\s+/).filter((p: string) => p.length >= 3);
      let query = sb.from("alumnos").select("id, nombre").eq("centro_id", centro_id);
      for (const p of palabras) query = query.ilike("nombre", `%${p}%`);
      const { data: alumnos } = await query.limit(5);

      if (!alumnos?.length) {
        return `⚠️ No se encontró al alumno "${alumno_nombre}" en la base de datos.`;
      }
      const alumno = (alumnos as { id: string; nombre: string }[])[0];

      const { error } = await sb.from("asistencia_comedor").upsert(
        {
          centro_id,
          alumno_id: alumno.id,
          fecha: fecha || hoy,
          se_queda: false,
          registrado_por: user_name || user_id,
        },
        { onConflict: "centro_id,alumno_id,fecha" },
      );
      if (error) throw new Error(`Error al actualizar comedor: ${error.message}`);
      return `✅ Anotado que ${alumno.nombre} no comerá el ${fecha}.`;
    }

    default:
      throw new Error(`Herramienta desconocida: ${tool}`);
  }
}

/* ── Main handler ── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const {
      contents,
      system_prompt,
      centro_id,
      role,
      user_name,
      user_id,
      confirm_tool,
      confirm_args,
      pending_contents,
    } = body as {
      contents?: unknown[];
      system_prompt?: string;
      centro_id?: string;
      role?: string;
      user_name?: string;
      user_id?: string;
      confirm_tool?: string;
      confirm_args?: Record<string, string>;
      pending_contents?: unknown[];
    };

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /* ── Path A: tool confirmation ── */
    if (confirm_tool && confirm_args && pending_contents) {
      const toolResult = await executeTool(
        confirm_tool,
        confirm_args,
        sb,
        centro_id ?? "",
        user_id ?? "",
        user_name ?? "",
      );

      const contentsWithResult = [
        ...pending_contents,
        { role: "model", parts: [{ functionCall: { name: confirm_tool, args: confirm_args } }] },
        { role: "user",  parts: [{ functionResponse: { name: confirm_tool, response: { result: toolResult } } }] },
      ];

      const geminiRes = await callGemini(apiKey, contentsWithResult, false, system_prompt);
      const geminiData = await geminiRes.json();
      const text =
        geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? toolResult;
      return jsonRes({ type: "text", text });
    }

    /* ── Path B: normal chat ── */
    if (!contents) throw new Error("Falta contents");

    const canUseTool =
      role === "admin" || role === "profesional" || role === "superadmin";

    const geminiRes = await callGemini(apiKey, contents, canUseTool, system_prompt);
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${errText.slice(0, 300)}`);
    }
    const geminiData = await geminiRes.json();

    if (!geminiData.candidates?.[0]) {
      throw new Error("Sin candidatos en respuesta de Gemini");
    }

    const parts: Record<string, unknown>[] =
      geminiData.candidates[0].content?.parts ?? [];

    const toolCallPart = parts.find((p) => p.functionCall);

    if (toolCallPart) {
      const { name, args } = toolCallPart.functionCall as {
        name: string;
        args: Record<string, string>;
      };

      /* Read-only: auto-execute without confirmation */
      if (READ_ONLY.has(name)) {
        const toolResult = await executeTool(
          name, args, sb, centro_id ?? "", user_id ?? "", user_name ?? "",
        );
        const contentsWithResult = [
          ...contents,
          { role: "model", parts: [{ functionCall: { name, args } }] },
          { role: "user",  parts: [{ functionResponse: { name, response: { result: toolResult } } }] },
        ];
        const geminiRes2 = await callGemini(apiKey, contentsWithResult, false, system_prompt);
        const geminiData2 = await geminiRes2.json();
        const text =
          geminiData2.candidates?.[0]?.content?.parts?.[0]?.text ?? toolResult;
        return jsonRes({ type: "text", text });
      }

      /* Write tools: return to client for confirmation */
      return jsonRes({ type: "tool_call", tool: name, args, pending_contents: contents });
    }

    /* Plain text response */
    const text =
      (parts.find((p) => p.text)?.text as string) ??
      "Lo siento, no pude procesar tu consulta.";
    return jsonRes({ type: "text", text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: msg }, 500);
  }
});
