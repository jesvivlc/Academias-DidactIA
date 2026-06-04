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
  {
    name: "mover_clase",
    description:
      "Mueve una clase YA EXISTENTE del horario generado por el Planner (tabla horario_generado) de un día/tramo a otro, SIN regenerar el horario completo. Verifica que el destino esté libre para el grupo y para el profesor y que el movimiento no rompa las restricciones (una materia no puede repetirse el mismo día, ni dejar huecos libres en la jornada). LLAMAR cuando el admin diga cosas como 'mueve matemáticas de 1ESO A del lunes tercera hora a martes cuarta'.",
    parameters: {
      type: "OBJECT",
      properties: {
        grupo:         { type: "STRING",  description: "Grupo (ej: '1ESOA' o '1ESO A')" },
        materia_id:    { type: "STRING",  description: "Nombre o ID de la materia a mover (ej: 'Matemáticas')" },
        dia_origen:    { type: "STRING",  description: "Día actual: lunes, martes, miércoles, jueves o viernes" },
        tramo_origen:  { type: "INTEGER", description: "Número de tramo actual (1, 2, 3...). 'tercera hora' = 3" },
        dia_destino:   { type: "STRING",  description: "Día de destino" },
        tramo_destino: { type: "INTEGER", description: "Número de tramo de destino. 'cuarta hora' = 4" },
      },
      required: ["grupo", "materia_id", "dia_origen", "tramo_origen", "dia_destino", "tramo_destino"],
    },
  },
  {
    name: "eliminar_clase",
    description:
      "Elimina una clase del horario generado por el Planner (tabla horario_generado). LLAMAR cuando el admin diga cosas como 'elimina la clase de música de 3ESO A el jueves sexta hora'. Si no se indica el tramo y solo hay una clase de esa materia ese día, se elimina esa.",
    parameters: {
      type: "OBJECT",
      properties: {
        grupo:      { type: "STRING",  description: "Grupo (ej: '3ESOA')" },
        materia_id: { type: "STRING",  description: "Nombre o ID de la materia" },
        dia:        { type: "STRING",  description: "Día: lunes, martes, miércoles, jueves o viernes" },
        tramo:      { type: "INTEGER", description: "Número de tramo (1, 2, 3...). Opcional si solo hay una clase de esa materia ese día" },
      },
      required: ["grupo", "materia_id", "dia"],
    },
  },
  {
    name: "añadir_clase",
    description:
      "Añade una nueva clase al horario generado por el Planner (tabla horario_generado). Verifica la disponibilidad del profesor y del grupo en ese tramo y que no se rompan las restricciones (materia no repetida el mismo día, sin huecos). LLAMAR cuando el admin quiera colocar una clase concreta en un hueco del horario.",
    parameters: {
      type: "OBJECT",
      properties: {
        grupo:       { type: "STRING",  description: "Grupo (ej: '2ESOB')" },
        materia_id:  { type: "STRING",  description: "Nombre o ID de la materia" },
        profesor_id: { type: "STRING",  description: "Nombre o ID del profesor que imparte la clase" },
        dia:         { type: "STRING",  description: "Día: lunes, martes, miércoles, jueves o viernes" },
        tramo:       { type: "INTEGER", description: "Número de tramo (1, 2, 3...)" },
      },
      required: ["grupo", "materia_id", "profesor_id", "dia", "tramo"],
    },
  },
  {
    name: "cambiar_profesor",
    description:
      "Cambia el profesor de una clase YA EXISTENTE del horario generado por el Planner (tabla horario_generado). Verifica que el nuevo profesor esté libre en ese tramo. LLAMAR cuando el admin diga cosas como 'cambia el profesor de inglés de 2ESO B del miércoles por Carmen Sánchez'. Si no se indica el tramo y solo hay una clase de esa materia ese día, se cambia esa.",
    parameters: {
      type: "OBJECT",
      properties: {
        grupo:             { type: "STRING",  description: "Grupo (ej: '2ESOB')" },
        materia_id:        { type: "STRING",  description: "Nombre o ID de la materia" },
        dia:               { type: "STRING",  description: "Día: lunes, martes, miércoles, jueves o viernes" },
        tramo:             { type: "INTEGER", description: "Número de tramo (1, 2, 3...). Opcional si solo hay una clase de esa materia ese día" },
        nuevo_profesor_id: { type: "STRING",  description: "Nombre o ID del nuevo profesor (ej: 'Carmen Sánchez')" },
      },
      required: ["grupo", "materia_id", "dia", "nuevo_profesor_id"],
    },
  },
  {
    name: "asignar_profesor",
    description:
      "Asigna un profesor a UNA clase concreta del horario generado por el Planner (tabla horario_generado), típicamente a un slot que estaba sin asignar. Verifica que el profesor no tenga ya clase en ese día y tramo. LLAMAR cuando el admin diga cosas como 'pon a Juan García en matemáticas de 1ESO A el lunes' o 'asigna a María en la clase de Lengua de 2ESO B del martes a tercera hora'. Si no se indica el tramo y solo hay una clase de esa materia ese día, se asigna esa.",
    parameters: {
      type: "OBJECT",
      properties: {
        materia_id:  { type: "STRING",  description: "Nombre o ID de la materia" },
        grupo:       { type: "STRING",  description: "Grupo (ej: '1ESOA')" },
        dia:         { type: "STRING",  description: "Día: lunes, martes, miércoles, jueves o viernes" },
        tramo:       { type: "INTEGER", description: "Número de tramo (1, 2, 3...). Opcional si solo hay una clase de esa materia ese día" },
        profesor_id: { type: "STRING",  description: "Nombre o ID del profesor a asignar" },
      },
      required: ["materia_id", "grupo", "dia", "profesor_id"],
    },
  },
  {
    name: "asignar_profesor_materia",
    description:
      "Asigna un profesor a TODAS las clases de una materia del horario generado por el Planner (tabla horario_generado) en todo el centro, de una sola vez. Para cada slot verifica que el profesor no tenga ya clase ese día y tramo; los que generen conflicto se dejan sin asignar y se informan. LLAMAR cuando el admin diga cosas como 'asigna a Carmen Sánchez todas las clases de Filosofía' o 'pon a Juan en toda la Educación Física del centro'.",
    parameters: {
      type: "OBJECT",
      properties: {
        materia_id:  { type: "STRING", description: "Nombre o ID de la materia" },
        profesor_id: { type: "STRING", description: "Nombre o ID del profesor a asignar a todas sus clases" },
      },
      required: ["materia_id", "profesor_id"],
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

/* ── Helpers para edición de horario_generado ── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeGrupo(g: string): string {
  return String(g ?? "").toUpperCase().replace(/\s+/g, "");
}

function normalizeDia(d: string): string {
  const k = String(d ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const map: Record<string, string> = {
    lunes: "lunes", martes: "martes", miercoles: "miércoles", jueves: "jueves", viernes: "viernes",
  };
  return map[k] ?? String(d ?? "").trim();
}

async function resolveMateria(sb: SB, centro_id: string, value: string): Promise<{ id: string; nombre: string }> {
  const v = String(value ?? "").trim();
  if (!v) throw new Error("Falta el nombre de la materia.");
  if (UUID_RE.test(v)) {
    const { data } = await sb.from("materias").select("id, nombre").eq("centro_id", centro_id).eq("id", v).maybeSingle();
    if (data) return data as { id: string; nombre: string };
  }
  const { data } = await sb.from("materias").select("id, nombre").eq("centro_id", centro_id).ilike("nombre", `%${v}%`).limit(2);
  if (!data?.length) throw new Error(`No encontré la materia "${value}" en este centro.`);
  return data[0] as { id: string; nombre: string };
}

async function resolveProfesor(sb: SB, centro_id: string, value: string): Promise<{ id: string; nombre: string }> {
  const v = String(value ?? "").trim();
  if (!v) throw new Error("Falta el nombre del profesor.");
  if (UUID_RE.test(v)) {
    const { data } = await sb.from("profesores").select("id, nombre").eq("centro_id", centro_id).eq("id", v).maybeSingle();
    if (data) return data as { id: string; nombre: string };
  }
  let q = sb.from("profesores").select("id, nombre").eq("centro_id", centro_id);
  for (const p of v.split(/\s+/).filter((w) => w.length >= 2)) q = q.ilike("nombre", `%${p}%`);
  const { data } = await q.limit(2);
  if (!data?.length) throw new Error(`No encontré al profesor "${value}" en este centro.`);
  return data[0] as { id: string; nombre: string };
}

async function materiaNombre(sb: SB, id: string): Promise<string> {
  const { data } = await sb.from("materias").select("nombre").eq("id", id).maybeSingle();
  return (data as { nombre: string } | null)?.nombre ?? "otra materia";
}

/* Tramos de clase del centro (sin descansos), ordenados. [] si no hay configuración. */
async function getClassTramos(sb: SB, centro_id: string): Promise<number[]> {
  const { data } = await sb.from("tramos_centro").select("numero, es_descanso").eq("centro_id", centro_id).order("numero");
  if (!data?.length) return [];
  return (data as { numero: number; es_descanso: boolean }[])
    .filter((t) => !t.es_descanso).map((t) => Number(t.numero));
}

type DaySlot = { materia_id: string; profesor_id: string | null; tramo_horario: number };
async function getDaySlots(sb: SB, centro_id: string, grupo: string, dia: string): Promise<DaySlot[]> {
  const { data } = await sb.from("horario_generado")
    .select("materia_id, profesor_id, tramo_horario")
    .eq("centro_id", centro_id).eq("grupo_horario", grupo).eq("dia_semana", dia);
  return (data as DaySlot[] | null) ?? [];
}

async function grupoOcupado(sb: SB, centro_id: string, grupo: string, dia: string, tramo: number): Promise<{ materia: string } | null> {
  const { data } = await sb.from("horario_generado").select("materia_id")
    .eq("centro_id", centro_id).eq("grupo_horario", grupo).eq("dia_semana", dia).eq("tramo_horario", tramo).maybeSingle();
  return data ? { materia: (data as { materia_id: string }).materia_id } : null;
}

async function profesorOcupado(sb: SB, centro_id: string, profId: string, dia: string, tramo: number): Promise<{ grupo: string } | null> {
  const { data } = await sb.from("horario_generado").select("grupo_horario")
    .eq("centro_id", centro_id).eq("profesor_id", profId).eq("dia_semana", dia).eq("tramo_horario", tramo).maybeSingle();
  return data ? { grupo: (data as { grupo_horario: string }).grupo_horario } : null;
}

/* Una fila en disponibilidad_profesor significa que el profesor NO está disponible ahí. */
async function disponibilidadBloqueada(sb: SB, profId: string, dia: string, tramo: number): Promise<boolean> {
  const { data } = await sb.from("disponibilidad_profesor").select("id")
    .eq("profesor_id", profId).eq("dia_semana", dia).eq("tramo_horario", tramo).maybeSingle();
  return !!data;
}

/* Localiza la fila exacta de horario_generado. Si tramo es null y hay una sola, la usa. */
async function findSlot(
  sb: SB, centro_id: string, grupo: string, materiaId: string, dia: string, tramo: number | null,
): Promise<{ id: string; profesor_id: string | null; tramo_horario: number }> {
  let q = sb.from("horario_generado").select("id, profesor_id, tramo_horario")
    .eq("centro_id", centro_id).eq("grupo_horario", grupo).eq("materia_id", materiaId).eq("dia_semana", dia);
  if (tramo != null) q = q.eq("tramo_horario", tramo);
  const { data } = await q;
  const rows = (data as { id: string; profesor_id: string | null; tramo_horario: number }[] | null) ?? [];
  if (!rows.length) {
    throw new Error(`No encontré ninguna clase de esa materia en ${grupo} el ${dia}${tramo != null ? ` (tramo ${tramo})` : ""}.`);
  }
  if (rows.length > 1) throw new Error(`Hay varias clases de esa materia en ${grupo} el ${dia}; indica el número de tramo.`);
  return rows[0];
}

/* HC-VENTANA (≤8 tramos/día) + HC-INICIO-FIN (sin huecos). Devuelve motivo o null si es válido. */
function checkVentanaYContiguidad(occupiedTramos: number[], classTramos: number[]): string | null {
  if (occupiedTramos.length > 8) return "el grupo superaría 8 tramos lectivos ese día";
  if (!classTramos.length || occupiedTramos.length <= 1) return null;
  const idxs = occupiedTramos.map((t) => classTramos.indexOf(t));
  if (idxs.some((i) => i < 0)) return null; // algún tramo fuera de la rejilla de clase: no se evalúa contigüidad
  const min = Math.min(...idxs), max = Math.max(...idxs);
  if (max - min + 1 !== idxs.length) return "quedaría un hueco libre en mitad de la jornada";
  return null;
}

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

    case "mover_clase": {
      const grupo   = normalizeGrupo(args.grupo);
      const materia = await resolveMateria(sb, centro_id, args.materia_id);
      const diaO    = normalizeDia(args.dia_origen);
      const diaD    = normalizeDia(args.dia_destino);
      const trO     = Number(args.tramo_origen);
      const trD     = Number(args.tramo_destino);
      if (!trO || !trD) throw new Error("Los tramos de origen y destino deben ser números válidos.");

      const src    = await findSlot(sb, centro_id, grupo, materia.id, diaO, trO);
      const profId = src.profesor_id;

      if (diaO === diaD && trO === trD) {
        return `La clase de ${materia.nombre} de ${grupo} ya está en ${diaO}, tramo ${trO}.`;
      }

      /* destino libre para el grupo */
      const gOcc = await grupoOcupado(sb, centro_id, grupo, diaD, trD);
      if (gOcc) {
        throw new Error(`No se puede mover: ${grupo} ya tiene clase de ${await materiaNombre(sb, gOcc.materia)} el ${diaD} en el tramo ${trD}.`);
      }

      /* destino libre para el profesor + disponibilidad */
      if (profId) {
        const pOcc = await profesorOcupado(sb, centro_id, profId, diaD, trD);
        if (pOcc && pOcc.grupo !== grupo) {
          throw new Error(`No se puede mover: el profesor ya imparte clase a ${pOcc.grupo} el ${diaD} en el tramo ${trD}.`);
        }
        if (await disponibilidadBloqueada(sb, profId, diaD, trD)) {
          throw new Error(`No se puede mover: el profesor no está disponible el ${diaD} en el tramo ${trD}.`);
        }
      }

      /* hard constraints */
      const classTramos = await getClassTramos(sb, centro_id);
      const destSlots   = await getDaySlots(sb, centro_id, grupo, diaD);

      if (diaO !== diaD && destSlots.some((s) => s.materia_id === materia.id)) {
        throw new Error(`No se puede mover: ${grupo} ya tiene ${materia.nombre} el ${diaD} (una materia no puede repetirse el mismo día).`);
      }

      if (diaO === diaD) {
        const occ = destSlots.map((s) => s.tramo_horario).filter((t) => t !== trO);
        occ.push(trD);
        const err = checkVentanaYContiguidad(occ, classTramos);
        if (err) throw new Error(`No se puede mover: ${err}.`);
      } else {
        const occDest = destSlots.map((s) => s.tramo_horario); occDest.push(trD);
        const errD = checkVentanaYContiguidad(occDest, classTramos);
        if (errD) throw new Error(`No se puede mover al destino: ${errD}.`);
        const origSlots = await getDaySlots(sb, centro_id, grupo, diaO);
        const occOrig   = origSlots.map((s) => s.tramo_horario).filter((t) => t !== trO);
        const errO = checkVentanaYContiguidad(occOrig, classTramos);
        if (errO) throw new Error(`No se puede mover: al quitar la clase de ${diaO}, ${errO}.`);
      }

      const { error } = await sb.from("horario_generado")
        .update({ dia_semana: diaD, tramo_horario: trD }).eq("id", src.id);
      if (error) throw new Error(`Error al mover la clase: ${error.message}`);
      return `✅ ${materia.nombre} de ${grupo} movida de ${diaO} (tramo ${trO}) a ${diaD} (tramo ${trD}).`;
    }

    case "eliminar_clase": {
      const grupo   = normalizeGrupo(args.grupo);
      const materia = await resolveMateria(sb, centro_id, args.materia_id);
      const dia     = normalizeDia(args.dia);
      const tramo   = args.tramo != null && String(args.tramo) !== "" ? Number(args.tramo) : null;

      const slot = await findSlot(sb, centro_id, grupo, materia.id, dia, tramo);
      const { error } = await sb.from("horario_generado").delete().eq("id", slot.id);
      if (error) throw new Error(`Error al eliminar la clase: ${error.message}`);
      return `✅ Clase de ${materia.nombre} de ${grupo} eliminada (${dia}, tramo ${slot.tramo_horario}).`;
    }

    case "añadir_clase": {
      const grupo   = normalizeGrupo(args.grupo);
      const materia = await resolveMateria(sb, centro_id, args.materia_id);
      const prof    = await resolveProfesor(sb, centro_id, args.profesor_id);
      const dia     = normalizeDia(args.dia);
      const tramo   = Number(args.tramo);
      if (!tramo) throw new Error("El tramo debe ser un número válido.");

      const gOcc = await grupoOcupado(sb, centro_id, grupo, dia, tramo);
      if (gOcc) {
        throw new Error(`No se puede añadir: ${grupo} ya tiene clase de ${await materiaNombre(sb, gOcc.materia)} el ${dia} en el tramo ${tramo}.`);
      }
      const pOcc = await profesorOcupado(sb, centro_id, prof.id, dia, tramo);
      if (pOcc) throw new Error(`No se puede añadir: ${prof.nombre} ya imparte clase a ${pOcc.grupo} el ${dia} en el tramo ${tramo}.`);
      if (await disponibilidadBloqueada(sb, prof.id, dia, tramo)) {
        throw new Error(`No se puede añadir: ${prof.nombre} no está disponible el ${dia} en el tramo ${tramo}.`);
      }

      const classTramos = await getClassTramos(sb, centro_id);
      const daySlots    = await getDaySlots(sb, centro_id, grupo, dia);
      if (daySlots.some((s) => s.materia_id === materia.id)) {
        throw new Error(`No se puede añadir: ${grupo} ya tiene ${materia.nombre} el ${dia} (una materia no puede repetirse el mismo día).`);
      }
      const occ = daySlots.map((s) => s.tramo_horario); occ.push(tramo);
      const err = checkVentanaYContiguidad(occ, classTramos);
      if (err) throw new Error(`No se puede añadir: ${err}.`);

      const { error } = await sb.from("horario_generado").insert({
        centro_id, grupo_horario: grupo, materia_id: materia.id, profesor_id: prof.id,
        dia_semana: dia, tramo_horario: tramo, es_fijo: false,
      });
      if (error) throw new Error(`Error al añadir la clase: ${error.message}`);
      return `✅ ${materia.nombre} con ${prof.nombre} añadida a ${grupo} el ${dia} (tramo ${tramo}).`;
    }

    case "cambiar_profesor": {
      const grupo     = normalizeGrupo(args.grupo);
      const materia   = await resolveMateria(sb, centro_id, args.materia_id);
      const dia       = normalizeDia(args.dia);
      const tramo     = args.tramo != null && String(args.tramo) !== "" ? Number(args.tramo) : null;
      const nuevoProf = await resolveProfesor(sb, centro_id, args.nuevo_profesor_id);

      const slot = await findSlot(sb, centro_id, grupo, materia.id, dia, tramo);
      const tr   = slot.tramo_horario;

      if (slot.profesor_id === nuevoProf.id) {
        return `${materia.nombre} de ${grupo} (${dia}, tramo ${tr}) ya la imparte ${nuevoProf.nombre}.`;
      }
      const pOcc = await profesorOcupado(sb, centro_id, nuevoProf.id, dia, tr);
      if (pOcc) throw new Error(`No se puede cambiar: ${nuevoProf.nombre} ya imparte clase a ${pOcc.grupo} el ${dia} en el tramo ${tr}.`);
      if (await disponibilidadBloqueada(sb, nuevoProf.id, dia, tr)) {
        throw new Error(`No se puede cambiar: ${nuevoProf.nombre} no está disponible el ${dia} en el tramo ${tr}.`);
      }

      const { error } = await sb.from("horario_generado").update({ profesor_id: nuevoProf.id }).eq("id", slot.id);
      if (error) throw new Error(`Error al cambiar el profesor: ${error.message}`);
      return `✅ ${materia.nombre} de ${grupo} (${dia}, tramo ${tr}) ahora la imparte ${nuevoProf.nombre}.`;
    }

    case "asignar_profesor": {
      const grupo   = normalizeGrupo(args.grupo);
      const materia = await resolveMateria(sb, centro_id, args.materia_id);
      const dia     = normalizeDia(args.dia);
      const tramo   = args.tramo != null && String(args.tramo) !== "" ? Number(args.tramo) : null;
      const prof    = await resolveProfesor(sb, centro_id, args.profesor_id);

      const slot = await findSlot(sb, centro_id, grupo, materia.id, dia, tramo);
      const tr   = slot.tramo_horario;

      if (slot.profesor_id === prof.id) {
        return `${materia.nombre} de ${grupo} (${dia}, tramo ${tr}) ya la imparte ${prof.nombre}.`;
      }
      const pOcc = await profesorOcupado(sb, centro_id, prof.id, dia, tr);
      if (pOcc) throw new Error(`No se puede asignar: ${prof.nombre} ya tiene clase con ${pOcc.grupo} el ${dia} en el tramo ${tr}.`);
      if (await disponibilidadBloqueada(sb, prof.id, dia, tr)) {
        throw new Error(`No se puede asignar: ${prof.nombre} no está disponible el ${dia} en el tramo ${tr}.`);
      }

      const { error } = await sb.from("horario_generado").update({ profesor_id: prof.id }).eq("id", slot.id);
      if (error) throw new Error(`Error al asignar el profesor: ${error.message}`);
      return `✅ ${prof.nombre} asignado a ${materia.nombre} de ${grupo} (${dia}, tramo ${tr}).`;
    }

    case "asignar_profesor_materia": {
      const materia = await resolveMateria(sb, centro_id, args.materia_id);
      const prof    = await resolveProfesor(sb, centro_id, args.profesor_id);

      const { data: filas, error: selErr } = await sb.from("horario_generado")
        .select("id, grupo_horario, dia_semana, tramo_horario, profesor_id")
        .eq("centro_id", centro_id).eq("materia_id", materia.id)
        .order("dia_semana").order("tramo_horario");
      if (selErr) throw new Error(`Error al leer el horario: ${selErr.message}`);
      const rows = (filas as { id: string; grupo_horario: string; dia_semana: string; tramo_horario: number; profesor_id: string | null }[] | null) ?? [];
      if (!rows.length) return `No hay clases de ${materia.nombre} en el horario generado del centro.`;

      /* ocupación actual del profesor (otras materias ya asignadas) + indisponibilidad */
      const { data: ocup } = await sb.from("horario_generado")
        .select("dia_semana, tramo_horario")
        .eq("centro_id", centro_id).eq("profesor_id", prof.id);
      const busy = new Set((ocup as { dia_semana: string; tramo_horario: number }[] | null ?? [])
        .map((r) => `${r.dia_semana}_${r.tramo_horario}`));
      const { data: disp } = await sb.from("disponibilidad_profesor")
        .select("dia_semana, tramo_horario").eq("profesor_id", prof.id);
      const noDisp = new Set((disp as { dia_semana: string; tramo_horario: number }[] | null ?? [])
        .map((r) => `${r.dia_semana}_${r.tramo_horario}`));

      const toAssign: string[] = [];
      const conflictos: string[] = [];
      let yaAsignadas = 0;
      for (const r of rows) {
        const k = `${r.dia_semana}_${r.tramo_horario}`;
        if (r.profesor_id === prof.id) { yaAsignadas++; continue; }
        if (noDisp.has(k)) { conflictos.push(`${r.grupo_horario} ${r.dia_semana} T${r.tramo_horario} (no disponible)`); continue; }
        if (busy.has(k)) { conflictos.push(`${r.grupo_horario} ${r.dia_semana} T${r.tramo_horario} (ya ocupado)`); continue; }
        toAssign.push(r.id);
        busy.add(k); /* evita doble asignación en el mismo día/tramo dentro del lote */
      }

      if (toAssign.length) {
        const { error } = await sb.from("horario_generado").update({ profesor_id: prof.id }).in("id", toAssign);
        if (error) throw new Error(`Error al asignar: ${error.message}`);
      }

      let msg = `✅ ${prof.nombre} asignado a ${toAssign.length} clase(s) de ${materia.nombre}`;
      if (yaAsignadas) msg += ` (${yaAsignadas} ya estaban asignadas a ${prof.nombre.split(/\s+/)[0]})`;
      msg += ".";
      if (conflictos.length) {
        msg += ` ${conflictos.length} no se pudieron asignar por conflicto: ${conflictos.join("; ")}.`;
      }
      return msg;
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
