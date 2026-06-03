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
const READ_ONLY = new Set(["consultar_profesor_libre", "listar_tramos_centro"]);

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
  {
    name: "listar_tramos_centro",
    description: "Devuelve los tramos horarios actuales del centro como lista legible. No requiere confirmación.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "generar_tramos_horario",
    description:
      "CREA y persiste por primera vez (o reconfigura completamente) los tramos horarios del planner del centro calculándolos automáticamente a partir de los parámetros de la jornada escolar. LLAMAR cuando el usuario diga cosas como: 'crea los tramos', 'genera los tramos horarios', 'configura los tramos del planner', 'el horario empieza a las X', 'las clases duran Y minutos', 'quiero configurar el horario del centro'. Esta herramienta NO consulta horarios de alumnos — es exclusivamente para CREAR o REGENERAR la estructura de tramos del centro a partir de hora de inicio, duración de cada clase en minutos, descansos/recreos y hora de fin de jornada.",
    parameters: {
      type: "OBJECT",
      properties: {
        hora_inicio: {
          type: "STRING",
          description: "Hora de inicio de la primera clase en formato HH:MM (ej: '08:50')",
        },
        duracion_minutos: {
          type: "INTEGER",
          description: "Duración de cada clase en minutos (ej: 55)",
        },
        descansos: {
          type: "ARRAY",
          description: "Lista de descansos/recreos con su hora exacta de inicio y fin",
          items: {
            type: "OBJECT",
            properties: {
              hora_inicio: { type: "STRING", description: "Inicio del descanso HH:MM" },
              hora_fin:    { type: "STRING", description: "Fin del descanso HH:MM" },
              nombre:      { type: "STRING", description: "Nombre del descanso (ej: 'Recreo', 'Comida')" },
            },
            required: ["hora_inicio", "hora_fin"],
          },
        },
        hora_fin_jornada: {
          type: "STRING",
          description: "Hora de fin de la jornada escolar en formato HH:MM (ej: '17:00')",
        },
      },
      required: ["hora_inicio", "duracion_minutos", "hora_fin_jornada"],
    },
  },
  {
    name: "crear_tramos_centro",
    description:
      "Crea o reemplaza completamente los tramos horarios del centro. Elimina los tramos existentes e inserta los nuevos en orden. Usar cuando el admin dicte su horario de tramos.",
    parameters: {
      type: "OBJECT",
      properties: {
        tramos: {
          type: "ARRAY",
          description: "Lista ordenada de tramos horarios a configurar",
          items: {
            type: "OBJECT",
            properties: {
              numero:      { type: "INTEGER", description: "Número de orden del tramo (1, 2, 3...)" },
              hora_inicio: { type: "STRING",  description: "Hora de inicio en formato HH:MM" },
              hora_fin:    { type: "STRING",  description: "Hora de fin en formato HH:MM" },
              nombre:      { type: "STRING",  description: "Nombre del tramo, p.ej. 'Recreo' (opcional)" },
              es_descanso: { type: "BOOLEAN", description: "true si es recreo o descanso (opcional)" },
            },
            required: ["numero", "hora_inicio", "hora_fin"],
          },
        },
      },
      required: ["tramos"],
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

    case "listar_tramos_centro": {
      // deno-lint-ignore no-explicit-any
      const sbAny = sb as any;
      const { data, error } = await sbAny
        .from("tramos_centro")
        .select("numero, hora_inicio, hora_fin, nombre, es_descanso")
        .eq("centro_id", centro_id)
        .order("numero");
      if (error) throw new Error(`Error al listar tramos: ${error.message}`);
      if (!data?.length) return "No hay tramos horarios configurados para este centro.";
      type Tramo = { numero: number; hora_inicio: string; hora_fin: string; nombre: string | null; es_descanso: boolean };
      const lines = (data as Tramo[]).map((t) => {
        const etiq = t.nombre ? ` (${t.nombre})` : t.es_descanso ? " (Descanso)" : "";
        return `Tramo ${t.numero}: ${t.hora_inicio}–${t.hora_fin}${etiq}`;
      });
      return `Tramos horarios del centro:\n${lines.join("\n")}`;
    }

    case "crear_tramos_centro": {
      type TramoInput = { numero: number; hora_inicio: string; hora_fin: string; nombre?: string; es_descanso?: boolean };
      const tramos = (args as unknown as { tramos: TramoInput[] }).tramos;
      if (!tramos?.length) throw new Error("La lista de tramos está vacía.");

      // deno-lint-ignore no-explicit-any
      const sbAny = sb as any;
      const { error: delErr } = await sbAny
        .from("tramos_centro")
        .delete()
        .eq("centro_id", centro_id);
      if (delErr) throw new Error(`Error al eliminar tramos existentes: ${delErr.message}`);

      const rows = tramos.map((t) => ({
        centro_id,
        numero:      Number(t.numero),
        hora_inicio: t.hora_inicio,
        hora_fin:    t.hora_fin,
        nombre:      t.nombre ?? null,
        es_descanso: t.es_descanso ?? false,
      }));

      const { error: insErr } = await sbAny.from("tramos_centro").insert(rows);
      if (insErr) throw new Error(`Error al insertar tramos: ${insErr.message}`);

      const resumen = tramos
        .map((t) => {
          const etiq = t.nombre ? ` (${t.nombre})` : t.es_descanso ? " (Descanso)" : "";
          return `T${t.numero}: ${t.hora_inicio}–${t.hora_fin}${etiq}`;
        })
        .join(", ");
      return `✅ ${tramos.length} tramos configurados: ${resumen}`;
    }

    case "generar_tramos_horario": {
      type DescansoInput = { hora_inicio: string; hora_fin: string; nombre?: string };
      type TramoGen = { numero: number; hora_inicio: string; hora_fin: string; nombre?: string; es_descanso: boolean };

      const input = args as unknown as {
        hora_inicio: string;
        duracion_minutos: number;
        descansos?: DescansoInput[];
        hora_fin_jornada: string;
      };

      /* ── helpers de tiempo ── */
      const toMin = (hhmm: string): number => {
        const [h, m] = hhmm.split(":").map(Number);
        return h * 60 + m;
      };
      const toHHMM = (min: number): string => {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      };

      const finJornada  = toMin(input.hora_fin_jornada);
      const duracion    = Number(input.duracion_minutos);
      if (!duracion || duracion <= 0) throw new Error("duracion_minutos debe ser un entero positivo.");

      /* descansos ordenados por hora de inicio */
      const breaks = (input.descansos ?? [])
        .map((d) => ({ ...d, ini: toMin(d.hora_inicio), fin: toMin(d.hora_fin) }))
        .sort((a, b) => a.ini - b.ini);

      /* ── algoritmo de generación ── */
      const tramos: TramoGen[] = [];
      let cursor   = toMin(input.hora_inicio);
      let numero   = 1;
      let breakIdx = 0;

      while (cursor < finJornada) {
        /* ① ¿hay un descanso que empieza en cursor o que ya hemos sobrepasado? */
        if (breakIdx < breaks.length && breaks[breakIdx].ini <= cursor) {
          const b = breaks[breakIdx++];
          tramos.push({ numero: numero++, hora_inicio: b.hora_inicio, hora_fin: b.hora_fin, nombre: b.nombre, es_descanso: true });
          cursor = Math.max(cursor, b.fin);
          continue;
        }

        const nextEnd = cursor + duracion;

        /* ② ¿el próximo descanso empieza dentro del siguiente tramo de clase? */
        if (breakIdx < breaks.length && breaks[breakIdx].ini < nextEnd) {
          const b = breaks[breakIdx];
          /* clase hasta el inicio del descanso (si hay tiempo) */
          if (cursor < b.ini) {
            tramos.push({ numero: numero++, hora_inicio: toHHMM(cursor), hora_fin: toHHMM(b.ini), es_descanso: false });
          }
          /* descanso */
          tramos.push({ numero: numero++, hora_inicio: b.hora_inicio, hora_fin: b.hora_fin, nombre: b.nombre, es_descanso: true });
          cursor = b.fin;
          breakIdx++;
        } else {
          /* ③ clase completa (recortada al fin de jornada si es la última) */
          const realFin = Math.min(nextEnd, finJornada);
          tramos.push({ numero: numero++, hora_inicio: toHHMM(cursor), hora_fin: toHHMM(realFin), es_descanso: false });
          cursor = realFin;
        }
      }

      if (!tramos.length) throw new Error("No se generó ningún tramo. Verifica los parámetros de hora.");

      /* ── persistir: DELETE + INSERT (misma lógica que crear_tramos_centro) ── */
      // deno-lint-ignore no-explicit-any
      const sbAny = sb as any;
      const { error: delErr } = await sbAny.from("tramos_centro").delete().eq("centro_id", centro_id);
      if (delErr) throw new Error(`Error al eliminar tramos existentes: ${delErr.message}`);

      const rows = tramos.map((t) => ({
        centro_id,
        numero:      t.numero,
        hora_inicio: t.hora_inicio,
        hora_fin:    t.hora_fin,
        nombre:      t.nombre ?? null,
        es_descanso: t.es_descanso,
      }));
      const { error: insErr } = await sbAny.from("tramos_centro").insert(rows);
      if (insErr) throw new Error(`Error al insertar tramos: ${insErr.message}`);

      /* ── resumen ── */
      const nClases    = tramos.filter((t) => !t.es_descanso).length;
      const nDescansos = tramos.filter((t) =>  t.es_descanso).length;
      const lista = tramos
        .map((t) => {
          const etiq = t.nombre ? ` (${t.nombre})` : t.es_descanso ? " (Descanso)" : "";
          return `T${t.numero}: ${t.hora_inicio}–${t.hora_fin}${etiq}`;
        })
        .join(", ");
      return `✅ ${tramos.length} tramos generados (${nClases} clases + ${nDescansos} descansos): ${lista}`;
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
      try {
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
      } catch (e) {
        console.error("[Path A] confirm_tool error:", confirm_tool, JSON.stringify(confirm_args), e);
        throw e;
      }
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
