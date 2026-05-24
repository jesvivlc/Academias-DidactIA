import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Normativa Comunitat Valenciana ──────────────────────────────
const NORMATIVA_VALENCIANA = `
NORMATIVA APLICABLE: Decreto 195/2022, de 21 de octubre, del Consell de la Generalitat Valenciana, por el que se establecen los derechos, los deberes y las normas de convivencia en los centros docentes no universitarios sostenidos con fondos públicos.

CONDUCTAS CONTRARIAS A LA CONVIVENCIA (gravedad: leve) — Arts. 30-36:
- Faltas injustificadas de puntualidad o asistencia a clase
- Perturbaciones leves del funcionamiento normal de las actividades lectivas
- Falta de respeto leve, en palabra o en obra, hacia cualquier miembro de la comunidad educativa
- Descuido o mal uso leve del material e instalaciones del centro o de pertenencias ajenas
- Incumplimiento reiterado de las instrucciones del profesorado u otro personal del centro
- Uso no autorizado de dispositivos electrónicos durante las actividades lectivas
- No aportar el material necesario para el desarrollo de las clases de forma reiterada

MEDIDAS CORRECTORAS EDUCATIVAS para conductas leves:
- Amonestación oral privada
- Amonestación escrita con comunicación a la familia
- Realización de tareas de reflexión sobre la conducta y sus consecuencias
- Realización de tareas de mediación o de reparación del daño causado
- Prestación de servicios al centro durante el periodo de recreo (máx. 5 días)
- Suspensión temporal del derecho al recreo (máx. 2 días)

CONDUCTAS GRAVEMENTE PERJUDICIALES PARA LA CONVIVENCIA (gravedad: grave o muy_grave) — Arts. 47-55:

GRAVES:
- Agresión física o psicológica grave o acto de acoso puntual hacia cualquier miembro de la comunidad educativa
- Intimidación, amenazas o coacciones
- Usurpación o daños graves en bienes de la comunidad educativa o de terceros
- Actuaciones perjudiciales para la salud e integridad personal del alumnado
- Introducción en el centro de objetos o sustancias peligrosas o perjudiciales para la salud
- Reiteración en el mismo curso escolar de tres o más conductas contrarias a la convivencia

MUY GRAVES (probablemente requieren Protocolo PREVI):
- Acoso escolar sistemático (bullying físico, psicológico, verbal o cyberbullying): conductas de intimidación, hostigamiento, humillación o exclusión social reiteradas hacia un alumno
- Agresión física grave con resultado de lesión o con instrumento potencialmente lesivo
- Discriminación sistemática por razón de sexo, origen racial o étnico, orientación sexual, identidad de género, religión u otras circunstancias personales
- Incitación al odio, la violencia o la discriminación hacia personas o colectivos
- Actos que atenten gravemente contra el derecho a la intimidad o contra el honor: grabación y difusión no consentida de imágenes o sonidos
- Comportamientos de naturaleza sexual no deseados o que atenten contra la dignidad

MEDIDAS CORRECTORAS EDUCATIVAS para conductas graves y muy graves:
- Suspensión del derecho a participar en actividades complementarias y extraescolares
- Cambio temporal de grupo (1-15 días lectivos), con seguimiento del tutor/a
- Prestación de servicios a la comunidad educativa en horario no lectivo
- Suspensión temporal del derecho de asistencia a determinadas clases (máx. 15 días lectivos), con deberes y seguimiento
- Suspensión temporal del derecho de asistencia al centro (máx. 15 días lectivos) — requiere apertura de expediente disciplinario
- Cambio de centro docente — requiere resolución de la dirección territorial competente

PROTOCOLO PREVI (Programa de Reducción de la Violencia e Incremento de la Seguridad Escolar):
Activar (protocolo_previ: true) cuando se detecten indicios de:
- Acoso escolar en cualquiera de sus formas (bullying, cyberbullying)
- Violencia física grave o con resultado de lesión
- Conductas discriminatorias sistemáticas o violencia de género
- Situaciones que comprometan seriamente la seguridad o integridad del alumnado
Procedimiento: comunicación inmediata a la dirección → notificación al inspector/a de zona → activación del equipo de orientación y del SAII si procede → seguimiento y evaluación periódica → comunicación a las familias.
`.trim();

// ── Normativa estatal (fallback) ────────────────────────────────
const NORMATIVA_ESTATAL = `
NORMATIVA APLICABLE: Ley Orgánica 2/2006, de 3 de mayo, de Educación (LOE), modificada por la Ley Orgánica 3/2020 (LOMLOE); Real Decreto 732/1995, de 5 de mayo, por el que se establecen los derechos y deberes de los alumnos y las normas de convivencia en los centros.

CONDUCTAS CONTRARIAS A LAS NORMAS DE CONVIVENCIA DEL CENTRO (gravedad: leve) — Art. 43 RD 732/1995:
- Las conductas que perturben el normal desarrollo de las actividades de clase
- Las faltas injustificadas de puntualidad o de asistencia a clase
- Los actos que perturben el normal funcionamiento del centro
- Las faltas de respeto, en palabra u obra, al personal del centro y a los compañeros
- El deterioro leve causado intencionadamente en las dependencias del centro, su material o los objetos y pertenencias de otros miembros de la comunidad educativa
- El incumplimiento reiterado de las normas de convivencia del centro

MEDIDAS CORRECTORAS EDUCATIVAS para conductas leves:
- Amonestación oral o escrita
- Realización de tareas que contribuyan a la mejora y reparación de los daños causados
- Suspensión del derecho a participar en actividades complementarias o extraescolares
- Cambio de grupo temporal
- Realización de tareas educativas en horario no lectivo en el centro

CONDUCTAS GRAVEMENTE PERJUDICIALES PARA LA CONVIVENCIA (gravedad: grave o muy_grave) — Arts. 48-49 RD 732/1995:

GRAVES:
- Los actos de indisciplina, injuria u ofensas graves contra miembros de la comunidad educativa
- La reiteración en un mismo curso escolar de conductas contrarias a las normas de convivencia
- La agresión física o psicológica grave, o las amenazas graves contra cualquier miembro de la comunidad educativa
- Las actuaciones perjudiciales para la salud e integridad personal del alumnado

MUY GRAVES:
- Los actos de agresión grave o que produzcan lesión física o psicológica grave
- Las conductas de acoso escolar en cualquiera de sus manifestaciones (bullying, cyberbullying)
- La discriminación y los actos vejatorios por razón de nacimiento, raza, sexo, religión, orientación sexual, discapacidad u otras circunstancias personales
- La difusión por cualquier medio de imágenes o informaciones que atenten contra la intimidad, el honor o la dignidad de miembros de la comunidad educativa
- Los daños graves causados intencionadamente en las instalaciones o materiales del centro
- La suplantación de personalidad en actos de la vida docente y la falsificación o sustracción de documentos académicos

MEDIDAS CORRECTORAS EDUCATIVAS para conductas graves y muy graves (requieren expediente disciplinario):
- Suspensión del derecho de asistencia al centro por un período máximo de treinta días lectivos
- Cambio de centro docente
- La expulsión definitiva del centro (en centros privados; en centros públicos requiere resolución administrativa)

INDICIOS PARA ACTIVAR PROTOCOLO DE ACOSO ESCOLAR (protocolo_previ: true):
- Conductas de intimidación, hostigamiento o exclusión social reiterada hacia un alumno
- Agresiones con resultado de lesión o de impacto psicológico significativo y continuado
- Situaciones de discriminación sistemática
Procedimiento: comunicación a la dirección del centro → activación del protocolo anti-acoso del centro → informe al inspector/a de referencia → comunicación a las familias → seguimiento del caso.
`.trim();

// ── Edge Function ───────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { descripcion, centro_id } = await req.json();

    if (!descripcion || String(descripcion).trim().length < 10)
      throw new Error("La descripción de la incidencia es demasiado breve");
    if (!centro_id)
      throw new Error("Falta el campo centro_id");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: centro } = await sb
      .from("centros")
      .select("ccaa, nombre")
      .eq("id", centro_id)
      .single();

    const ccaa = centro?.ccaa ?? null;
    const nombreCentro = centro?.nombre ?? "Centro Educativo";
    const esValenciana = ccaa === "valenciana";
    const normativa = esValenciana ? NORMATIVA_VALENCIANA : NORMATIVA_ESTATAL;
    const normaRef = esValenciana
      ? "Decreto 195/2022 de la Comunitat Valenciana"
      : "LOE/LOMLOE y Real Decreto 732/1995";

    const prompt = `Eres un experto en convivencia escolar y orientación educativa con profundo conocimiento de la normativa española vigente. Analiza la descripción de la incidencia y tipifícala rigurosamente.

${normativa}

PRINCIPIOS IRRENUNCIABLES:
- PROHIBIDO usar los términos "sanción" o "castigo". Usa siempre "medida correctora educativa".
- El objetivo de cualquier intervención es la reeducación, la reparación y la restauración de la convivencia.
- Las medidas deben ser proporcionales a la conducta, educativas y orientadas a la mejora personal del alumno.
- El informe_borrador debe estar redactado en lenguaje formal y administrativo, como un parte oficial de incidencia.

CONTEXTO:
- Centro educativo: ${nombreCentro}
- Normativa de referencia: ${normaRef}
- Fecha del informe: ${new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}

INCIDENCIA A ANALIZAR:
${String(descripcion).trim()}

Devuelve ÚNICAMENTE un objeto JSON con este formato exacto, sin texto adicional ni bloques de código markdown:
{
  "gravedad": "leve|grave|muy_grave",
  "tipificacion": "Artículo y descripción legal de la conducta según la normativa aplicable",
  "medidas_propuestas": ["Medida correctora educativa 1", "Medida correctora educativa 2"],
  "informe_borrador": "PARTE DE INCIDENCIA\\n\\nCentro: ${nombreCentro}\\nFecha: [fecha]\\n\\nDESCRIPCIÓN DE LOS HECHOS:\\n[Descripción objetiva y formal de los hechos, sin juicios de valor, en tercera persona]\\n\\nTIPIFICACIÓN:\\nLa conducta descrita se tipifica como [tipificación] según [norma], constituyendo una conducta de gravedad [gravedad].\\n\\nMEDIDAS CORRECTORAS EDUCATIVAS PROPUESTAS:\\n[Lista numerada de las medidas propuestas]\\n\\nSEGUIMIENTO:\\n[Indicaciones sobre la comunicación a la familia, seguimiento tutorial y cualquier protocolo adicional que deba activarse.]\\n\\nFdo.: El/la Jefe/a de Estudios",
  "protocolo_previ": false,
  "justificacion": "Explicación breve y fundamentada de la tipificación elegida y las medidas propuestas, con referencia al artículo concreto de la normativa"
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 2000,
            temperature: 0.2,
            thinking_config: { thinking_budget: 0 },
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini error ${geminiRes.status}: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "sin_candidatos", raw: geminiData }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let parsed: {
      gravedad: string;
      tipificacion: string;
      medidas_propuestas: string[];
      informe_borrador: string;
      protocolo_previ: boolean;
      justificacion: string;
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Gemini no devolvió JSON válido: " + rawText.slice(0, 300));
      parsed = JSON.parse(match[0]);
    }

    // Validar gravedad
    const GRAVEDADES_VALIDAS = ["leve", "grave", "muy_grave"];
    if (!GRAVEDADES_VALIDAS.includes(parsed.gravedad)) parsed.gravedad = "leve";

    // Normalizar medidas (asegurar array)
    if (!Array.isArray(parsed.medidas_propuestas)) parsed.medidas_propuestas = [];

    const result: Record<string, unknown> = { ...parsed, normativa_ref: normaRef };

    // Alerta urgente visible cuando protocolo_previ = true
    if (parsed.protocolo_previ) {
      result.alerta_urgente =
        "⚠️ PROTOCOLO PREVI — Activación inmediata requerida. " +
        "Comunique esta incidencia a la dirección del centro y al servicio de orientación antes de finalizar la jornada. " +
        "Notifique también al inspector/a de referencia según el procedimiento establecido.";
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...CORS, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
