import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NormativaEntry {
  ref: string;
  paradigma: string;
  instrucciones: string; // paradigm-specific prompt instructions
  texto: string;         // full normativa body
}

// ── Normativas ──────────────────────────────────────────────────

const NORMATIVAS: Record<string, NormativaEntry> = {

  valenciana: {
    ref: "Decreto 195/2022 de la Comunitat Valenciana",
    paradigma: "Justicia Restaurativa",
    instrucciones: `PARADIGMA OBLIGATORIO — Justicia Restaurativa:
- PROHIBIDO usar los términos "sanción" o "castigo". Usa siempre "medida correctora educativa".
- El objetivo es la reparación del daño y la restauración de las relaciones, no el castigo.
- Las medidas deben ser proporcionales, educativas y orientadas a la mejora personal del alumno.
- Protocolo PREVI obligatorio ante: acoso escolar, ideación suicida o autolesiones con riesgo, violencia de género o dominación sistemática.`,
    texto: `NORMATIVA: Decreto 195/2022, de 21 de octubre, del Consell de la Generalitat Valenciana, sobre derechos, deberes y normas de convivencia en centros docentes no universitarios sostenidos con fondos públicos.

CONDUCTAS CONTRARIAS A LA CONVIVENCIA (gravedad: leve) — Arts. 30-36:
- Faltas injustificadas de puntualidad o asistencia
- Perturbaciones leves del funcionamiento normal de las actividades lectivas
- Falta de respeto leve, en palabra u obra, hacia cualquier miembro de la comunidad educativa
- Descuido o mal uso leve del material, instalaciones o pertenencias ajenas
- Incumplimiento reiterado de instrucciones del profesorado
- Uso no autorizado de dispositivos electrónicos durante las clases

MEDIDAS CORRECTORAS EDUCATIVAS para conductas leves:
- Amonestación oral privada o escrita con comunicación a la familia
- Tareas de reflexión, mediación o reparación del daño (proporcionales)
- Prestación de servicios al centro en horario no lectivo (máx. 5 días)
- Suspensión temporal del recreo (máx. 2 días)

CONDUCTAS GRAVEMENTE PERJUDICIALES (gravedad: grave o muy_grave) — Arts. 47-55:
GRAVES:
- Agresión física o psicológica grave o acto de acoso puntual
- Intimidación, amenazas o coacciones
- Daños graves en bienes del centro o de terceros
- Reiteración de tres o más conductas leves en el mismo curso

MUY GRAVES (activar protocolo_previ si hay acoso, ideación suicida o violencia de género):
- Acoso escolar sistemático: bullying físico, psicológico, verbal, cyberbullying o por razón de identidad
- Agresión física grave con resultado de lesión
- Discriminación sistemática por cualquier condición personal o social
- Indicios de ideación suicida o autolesiones con riesgo para la integridad
- Violencia de género o ejercida con componente de dominación sistemática
- Grabación y difusión no consentida de imágenes o sonidos

MEDIDAS CORRECTORAS EDUCATIVAS para conductas graves y muy graves:
- Cambio temporal de grupo con seguimiento tutorial (1-15 días lectivos)
- Suspensión temporal de asistencia al centro (máx. 15 días lectivos) — requiere apertura de expediente
- Cambio de centro docente — requiere resolución de la dirección territorial

PROTOCOLOS PREVI OBLIGATORIOS:
- PREVI-Acoso: bullying físico, psicológico, verbal o cyberbullying confirmado o con indicios fundados
- PREVI-Suicidio: conducta autolesiva o ideación suicida con riesgo para la integridad del menor
- PREVI-VdG: violencia de género o con componente de dominación sistemática
Procedimiento: dirección → inspector/a de zona → equipo de orientación → SAII si procede → familia.`,
  },

  madrid: {
    ref: "Decreto 32/2019 de la Comunidad de Madrid",
    paradigma: "Autoridad del Profesor como autoridad pública",
    instrucciones: `PARADIGMA OBLIGATORIO — Autoridad del Profesor como autoridad pública:
- El profesorado ostenta autoridad pública; los actos contra el profesorado tienen tratamiento AGRAVADO.
- Si el agraviado es un/a profesor/a u otro personal del centro, señálalo explícitamente en la tipificación y eleva automáticamente la gravedad al nivel inmediatamente superior.
- El uso de móvil para grabar o difundir imágenes de miembros de la comunidad educativa está expresamente tipificado como conducta grave o muy grave.
- Usa la terminología del Decreto 32/2019: "medidas educativas" para conductas leves, "medidas disciplinarias" para graves/muy graves.`,
    texto: `NORMATIVA: Decreto 32/2019, de 9 de abril, del Consejo de Gobierno de la Comunidad de Madrid, por el que se establece el marco regulador de la convivencia en los centros docentes de la Comunidad de Madrid.

CONDUCTAS PERTURBADORAS DE LA CONVIVENCIA (gravedad: leve):
- Perturbación leve del normal desarrollo de las actividades lectivas o del centro
- Faltas de puntualidad o asistencia injustificadas
- Falta leve de respeto a cualquier miembro de la comunidad educativa
- Uso de dispositivos móviles u otros aparatos electrónicos sin autorización (expresamente tipificado)
- Deterioro leve de material o instalaciones
- Incumplimiento de las instrucciones del profesorado en el ejercicio de sus funciones

MEDIDAS EDUCATIVAS para conductas leves:
- Amonestación oral o escrita
- Privación del tiempo de recreo (máx. 5 días)
- Realización de tareas educativas en el centro fuera del horario lectivo
- Incorporación a la Sala de Reflexión del centro
- Compromiso de mejora firmado por el alumno y comunicado a la familia

CONDUCTAS GRAVEMENTE CONTRARIAS A LA CONVIVENCIA (gravedad: grave o muy_grave):
GRAVES:
- Actos de indisciplina grave o reiterada perturbación del funcionamiento del centro
- Falta de respeto grave al profesorado (AGRAVANTE AUTOMÁTICO: cualquier falta al profesorado se considera grave como mínimo)
- Uso de dispositivo móvil para grabar, fotografiar o difundir imágenes de miembros de la comunidad educativa sin consentimiento
- Reiteración de conductas leves

MUY GRAVES:
- Agresión física o moral grave contra cualquier miembro de la comunidad educativa
- AGRAVANTE ESPECIAL: agresión, amenaza o vejación dirigida a un/a profesor/a u otro personal → calificación automática de MUY GRAVE; puede dar lugar a actuaciones penales por atentado contra la autoridad
- Acoso escolar en cualquiera de sus formas
- Discriminación sistemática por cualquier condición personal o social
- Grabación y difusión de imágenes que atenten contra la dignidad o intimidad

MEDIDAS DISCIPLINARIAS para conductas graves y muy graves (requieren expediente disciplinario):
- Cambio temporal de grupo
- Suspensión temporal de asistencia al centro (máx. 30 días lectivos)
- Cambio de centro docente
- Si los hechos son constitutivos de delito: comunicación al Ministerio Fiscal y a las Fuerzas y Cuerpos de Seguridad del Estado

PROTOCOLO ANTE SITUACIONES DE VIOLENCIA (protocolo_previ: true):
Activar ante: acoso escolar, agresión grave, situación que comprometa la integridad del alumno o del personal.
Pasos: dirección → Inspección Educativa → Unidad de Convivencia de la Comunidad de Madrid → familia → si hay indicios de delito, comunicación a Fuerzas de Seguridad.`,
  },

  andalucia: {
    ref: "Decreto 327/2010 de la Junta de Andalucía",
    paradigma: "Cultura de Paz y Mediación",
    instrucciones: `PARADIGMA OBLIGATORIO — Cultura de Paz y Mediación:
- La MEDIACIÓN ESCOLAR es siempre la primera opción antes de proponer cualquier medida disciplinaria. Indícalo explícitamente en las medidas propuestas.
- El AULA DE CONVIVENCIA es la alternativa educativa a la expulsión del centro; proponla antes de cualquier suspensión.
- Los COMPROMISOS DE CONVIVENCIA con las familias son herramienta prioritaria; mencionarlos cuando proceda.
- Las medidas disciplinarias son el último recurso, solo cuando fallan los mecanismos de mediación y convivencia.`,
    texto: `NORMATIVA: Decreto 327/2010, de 13 de julio, por el que se aprueba el Reglamento Orgánico de los Institutos de Educación Secundaria de la Junta de Andalucía (y Decreto 328/2010 para CEIP). Marco de la Ley 17/2007, de Educación de Andalucía, y el II Plan Andaluz de Convivencia Escolar.

MECANISMOS PRIORITARIOS (usar antes de medidas disciplinarias):
1. MEDIACIÓN ESCOLAR: proceso voluntario facilitado por el orientador/a o el delegado/a de convivencia. Primera opción ante cualquier conflicto interpersonal.
2. AULA DE CONVIVENCIA: espacio alternativo donde el alumno realiza trabajo reflexivo con apoyo del equipo de orientación. Alternativa a la expulsión del centro.
3. COMPROMISOS DE CONVIVENCIA: acuerdos formales centro-familia para mejorar conjuntamente la convivencia del alumno. Incluyen seguimiento periódico.

CONDUCTAS CONTRARIAS A LAS NORMAS DE CONVIVENCIA (gravedad: leve):
- Perturbación del normal desarrollo de las actividades lectivas
- Faltas injustificadas de puntualidad o asistencia
- Trato incorrecto hacia cualquier miembro de la comunidad educativa
- Deterioro leve de instalaciones o material del centro
- Incumplimiento de los deberes del alumnado no calificado como grave

MEDIDAS para conductas leves (solo si falla la mediación):
- Amonestación oral o escrita
- Tareas fuera del horario lectivo que contribuyan a la mejora de la convivencia
- Suspensión del derecho a actividades complementarias o extraescolares
- Incorporación al Aula de Convivencia

CONDUCTAS GRAVEMENTE PERJUDICIALES (gravedad: grave o muy_grave):
GRAVES:
- Actos de indisciplina grave o injurias y ofensas graves
- Actuaciones perjudiciales para la salud o la integridad personal
- Reiteración de conductas leves en el mismo curso

MUY GRAVES:
- Agresión física o moral de especial gravedad
- Acoso escolar o ciberacoso
- Discriminación sistemática por cualquier condición personal o social
- Difusión de imágenes o información que atenten contra la intimidad o dignidad

MEDIDAS para conductas graves y muy graves:
- Tareas fuera del horario lectivo en beneficio de la comunidad educativa
- Suspensión temporal de asistencia al centro (máx. 30 días) — SIEMPRE ofrecer antes el Aula de Convivencia y los Compromisos de Convivencia
- Cambio de centro docente

PROTOCOLO ANTE ACOSO Y VIOLENCIA ESCOLAR (protocolo_previ: true):
Activar ante: acoso escolar confirmado o con indicios fundados, agresión grave, violencia de género o autolesiones con riesgo.
Pasos: dirección del centro → Servicio de Inspección → Equipo de Orientación Educativa → Delegación Provincial de Educación → si hay delito, comunicación a Fuerzas de Seguridad → familia.`,
  },

  cataluna: {
    ref: "Decret 279/2006 i Llei 12/2009 de Catalunya",
    paradigma: "Corresponsabilitat educativa",
    instrucciones: `PARADIGMA OBLIGATORI — Corresponsabilitat educativa:
- La convivència és responsabilitat compartida del centre, la família i l'alumnat.
- Menciona la CARTA DE COMPROMÍS EDUCATIU com a instrument de col·laboració amb la família quan sigui pertinent.
- La MEDIACIÓ ESCOLAR és un dret de l'alumnat; oferir-la sempre que sigui viable.
- Usa "mesures correctores" per a conductes lleus i greus; "mesures sancionadores" estrictament per a conductes molt greus.
- El Protocol USIC s'activa davant de qualsevol situació de violència entre iguals confirmada.`,
    texto: `NORMATIVA: Decret 279/2006, de 4 de juliol, sobre drets i deures de l'alumnat i regulació de la convivència als centres educatius no universitaris de Catalunya; Llei 12/2009, del 10 de juliol, d'educació (LEC).

INSTRUMENTS DE CONVIVÈNCIA PRIORITARIS:
- CARTA DE COMPROMÍS EDUCATIU: document que estableix els drets i deures mutus entre el centre i la família. Instrument central de col·laboració.
- MEDIACIÓ ESCOLAR: dret reconegut de l'alumnat. Sol·licitable en qualsevol fase del procés.
- TUTORIA DE CONVIVÈNCIA: sessió de reflexió obligatòria amb el/la tutor/a per a conductes lleus.

CONDUCTES CONTRÀRIES A LES NORMES (gravetat: leve) — Mesures correctores:
- Pertorbació lleu del funcionament normal de l'aula o del centre
- Manca de respecte lleu envers qualsevol membre de la comunitat educativa
- Ús no autoritzat de dispositius electrònics
- Deteriorament lleu de material o instal·lacions
- Incompliment de les instruccions del professorat

MESURES CORRECTORES per a conductes lleus:
- Amonestació oral o escrita
- Privació del temps d'esbarjo
- Realització de tasques educatives en horari no lectiu
- Tutoria de convivència obligatòria

CONDUCTES GREUMENT PERJUDICIALS (gravetat: grave) — Mesures correctores greus:
- Actes d'indisciplina greu o injúries greus envers membres de la comunitat educativa
- Danys greus en material o instal·lacions del centre
- Reiteració de conductes lleus (3 o més en el mateix curs)

CONDUCTES MOLT GREUS (gravetat: muy_grave) — Mesures sancionadores:
- Agressió física o moral greu
- Assetjament escolar: bullying, ciberassetjament, assetjament per raó de gènere o LGTBI-fòbia
- Discriminació sistemàtica per qualsevol condició personal o social
- Enregistrament i difusió d'imatges sense consentiment que atemptin contra la dignitat

MESURES per a conductes greus i molt greus:
- Canvi temporal de grup amb seguiment tutorial
- Suspensió temporal del dret d'assistència al centre (màx. 30 dies lectius) — cal expedient disciplinari
- Canvi de centre — cal resolució de la Inspecció d'Educació

PROTOCOL USIC I PROTOCOL DE VIOLÈNCIA (protocolo_previ: true):
Activar davant: assetjament escolar confirmat o amb indicis fonamentats, agressió greu, violència de gènere, ideació suïcida amb risc.
Passos: direcció del centre → Inspecció d'Educació → EAP (Equip d'Assessorament Psicopedagògic) → Mossos d'Esquadra / Policia Local si hi ha indicis de delicte → família.`,
  },
};

const NORMATIVA_ESTATAL: NormativaEntry = {
  ref: "LOMLOE (LO 3/2020) + Real Decreto 732/1995 + LOPIVI (LO 8/2021)",
  paradigma: "Marco estatal subsidiario — Coordinador de Bienestar y Protección",
  instrucciones: `PARADIGMA — Marco estatal subsidiario:
- Aplicable cuando la comunidad autónoma no ha desarrollado normativa específica o no se ha especificado.
- La LOPIVI (LO 8/2021) exige la figura del COORDINADOR/A DE BIENESTAR Y PROTECCIÓN en todos los centros.
- Incluir siempre en las medidas propuestas la notificación al Coordinador/a de Bienestar cuando la conducta afecte a la integridad del menor.
- Usa "medidas correctoras" para conductas leves y "medidas disciplinarias" para graves/muy graves.`,
  texto: `NORMATIVA: Ley Orgánica 2/2006, de Educación (LOE), modificada por la LOMLOE (LO 3/2020); Real Decreto 732/1995, de 5 de mayo, sobre derechos y deberes de los alumnos; Ley Orgánica 8/2021, de 4 de junio, de protección integral a la infancia y la adolescencia frente a la violencia (LOPIVI).

FIGURA DEL COORDINADOR/A DE BIENESTAR Y PROTECCIÓN (LOPIVI, art. 35):
- Obligatorio en todos los centros educativos
- Coordina las actuaciones de prevención y protección frente a la violencia
- Debe ser notificado en toda situación de violencia, acoso o riesgo para el menor
- Obligación de comunicar a los Servicios de Protección de Menores las situaciones de riesgo

CONDUCTAS CONTRARIAS A LAS NORMAS DE CONVIVENCIA DEL CENTRO (gravedad: leve) — Art. 43 RD 732/1995:
- Las conductas que perturben el normal desarrollo de las actividades de clase
- Las faltas injustificadas de puntualidad o de asistencia a clase
- Los actos que perturben el normal funcionamiento del centro
- Las faltas de respeto, en palabra u obra, al personal del centro y a los compañeros
- El deterioro leve causado intencionadamente de las dependencias, material u objetos ajenos
- El incumplimiento reiterado de las normas de convivencia del Reglamento de Régimen Interior

MEDIDAS CORRECTORAS para conductas leves:
- Amonestación oral o escrita
- Realización de tareas que contribuyan a la mejora y reparación de daños causados
- Suspensión del derecho a participar en actividades complementarias o extraescolares
- Cambio de grupo temporal

CONDUCTAS GRAVEMENTE PERJUDICIALES PARA LA CONVIVENCIA (gravedad: grave o muy_grave) — Arts. 48-49 RD 732/1995:
GRAVES:
- Actos de indisciplina, injuria u ofensas graves contra miembros de la comunidad educativa
- Agresión física o psicológica grave o amenazas graves
- Reiteración de conductas leves en el mismo curso escolar

MUY GRAVES:
- Actos de agresión grave que produzcan lesión física o psicológica grave
- Acoso escolar en cualquiera de sus formas: bullying, cyberbullying
- Discriminación y actos vejatorios por cualquier condición personal o social
- Difusión de imágenes o información que atente contra la intimidad, honor o dignidad
- Daños graves causados intencionadamente en instalaciones o material del centro

MEDIDAS DISCIPLINARIAS para conductas graves y muy graves (requieren expediente disciplinario):
- Suspensión del derecho de asistencia al centro (máx. 30 días lectivos)
- Cambio de centro docente

PROTOCOLO ANTE VIOLENCIA Y ACOSO (protocolo_previ: true):
Activar ante: acoso escolar, agresión grave, violencia de género, conducta autolesiva o ideación suicida con riesgo, o cualquier situación que comprometa la integridad del menor.
Pasos: notificación INMEDIATA al Coordinador/a de Bienestar y Protección → dirección del centro → Inspección Educativa → Servicios de Protección de Menores si hay riesgo → Fuerzas de Seguridad si hay indicios de delito → familia.`,
};

// ── Selector de normativa ───────────────────────────────────────

function getNormativa(ccaa: string | null): NormativaEntry {
  if (ccaa && NORMATIVAS[ccaa]) return NORMATIVAS[ccaa];
  return NORMATIVA_ESTATAL;
}

// ── Edge Function ───────────────────────────────────────────────

// fetch a Gemini con timeout (AbortController) + 1 reintento. No se cachea esta EF:
// el informe_borrador incrusta la fecha del día, así que una caché serviría partes
// con fecha obsoleta. Solo se añade resiliencia.
async function _geminiFetch(url: string, body: unknown, timeoutMs = 25000): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(to);
      return r;
    } catch (e) { clearTimeout(to); lastErr = e; }
  }
  throw lastErr;
}

// ── RAG: recuperar normativa real (kb_chunks) para citar artículos vigentes ──
// Embebe la descripción (gemini-embedding-001, 768d, RETRIEVAL_QUERY) y consulta
// match_kb. Best-effort: si algo falla, devuelve [] y la tipificación sigue igual.
const KB_MIN_SIMILARITY = 0.5;
async function _embedQuery(apiKey: string, text: string): Promise<number[] | null> {
  try {
    const res = await _geminiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      { model: "models/gemini-embedding-001", content: { parts: [{ text }] }, outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" },
      15000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const v = data?.embedding?.values;
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}
interface KbFuente { titulo: string; tipo: string; fecha_doc: string | null; source_url: string | null; texto: string; similarity: number; }
// deno-lint-ignore no-explicit-any
async function _recuperarNormativa(sb: any, apiKey: string, descripcion: string, centroId: string, ambito: string): Promise<KbFuente[]> {
  try {
    const emb = await _embedQuery(apiKey, descripcion);
    if (!emb) return [];
    const { data, error } = await sb.rpc("match_kb", {
      query_embedding: emb, p_centro_id: centroId, p_ambito: ambito, match_count: 6,
    });
    if (error || !Array.isArray(data)) return [];
    // deno-lint-ignore no-explicit-any
    return data.filter((m: any) => m.similarity >= KB_MIN_SIMILARITY).map((m: any) => ({
      titulo: m.doc_titulo, tipo: m.doc_tipo, fecha_doc: m.fecha_doc,
      source_url: m.source_url, texto: m.chunk_text, similarity: Math.round(m.similarity * 100) / 100,
    }));
  } catch { return []; }
}

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
    const normativa = getNormativa(ccaa);
    const fechaHoy = new Date().toLocaleDateString("es-ES", {
      year: "numeric", month: "long", day: "numeric",
    });

    // RAG: fragmentos literales de la normativa vigente indexada (best-effort).
    const fuentesRag = await _recuperarNormativa(sb, apiKey, String(descripcion).trim(), centro_id, ccaa || "estatal");
    const ragBlock = fuentesRag.length
      ? `\n\nNORMATIVA VIGENTE INDEXADA (fragmentos LITERALES recuperados de fuentes oficiales — PRIORÍZALOS sobre el marco general anterior y cita su título y artículo exacto cuando apliquen):\n` +
        fuentesRag.map((f, i) => `[Fuente ${i + 1}] ${f.titulo}${f.fecha_doc ? ` (${f.fecha_doc})` : ""}\n${f.texto}`).join("\n---\n")
      : "";

    const prompt = `Eres un experto en convivencia escolar y orientación educativa con profundo conocimiento de la normativa española vigente. Analiza la siguiente incidencia escolar y tipifícala rigurosamente según la normativa aplicable al centro.

${normativa.instrucciones}

${normativa.texto}${ragBlock}

CONTEXTO DEL INFORME:
- Centro educativo: ${nombreCentro}
- Normativa aplicable: ${normativa.ref}
- Paradigma: ${normativa.paradigma}
- Fecha: ${fechaHoy}

INCIDENCIA A ANALIZAR:
${String(descripcion).trim()}

Devuelve ÚNICAMENTE un objeto JSON con este formato exacto, sin texto adicional ni bloques de código markdown:
{
  "gravedad": "leve|grave|muy_grave",
  "tipificacion": "Artículo y descripción legal exacta de la conducta según la normativa aplicable",
  "medidas_propuestas": ["Medida 1 (ajustada al paradigma de la normativa)", "Medida 2"],
  "informe_borrador": "PARTE DE INCIDENCIA\\n\\nCentro: ${nombreCentro}\\nFecha: ${fechaHoy}\\nNormativa de referencia: ${normativa.ref}\\n\\nDESCRIPCIÓN DE LOS HECHOS:\\n[Descripción objetiva y formal en tercera persona, sin juicios de valor]\\n\\nTIPIFICACIÓN:\\n[Tipificación legal con referencia al artículo concreto de la normativa aplicable]\\n\\nMEDIDAS PROPUESTAS:\\n[Lista numerada de las medidas, ajustadas al paradigma ${normativa.paradigma}]\\n\\nSEGUIMIENTO:\\n[Indicaciones sobre comunicación a la familia, seguimiento tutorial y protocolos adicionales si procede]\\n\\nFdo.: La Jefatura de Estudios",
  "protocolo_previ": false,
  "justificacion": "Explicación breve y fundamentada de la tipificación y las medidas propuestas, con referencia al artículo concreto de la normativa"
}`;

    const geminiRes = await _geminiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.2,
          thinking_config: { thinking_budget: 0 },
          responseMimeType: "application/json",
        },
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

    // Validar y normalizar campos
    const GRAVEDADES_VALIDAS = ["leve", "grave", "muy_grave"];
    if (!GRAVEDADES_VALIDAS.includes(parsed.gravedad)) parsed.gravedad = "leve";
    if (!Array.isArray(parsed.medidas_propuestas)) parsed.medidas_propuestas = [];

    const result: Record<string, unknown> = {
      ...parsed,
      normativa_ref: normativa.ref,
      paradigma: normativa.paradigma,
      // Fuentes RAG citables (título, fecha, enlace oficial, fragmento) — vacío si no hubo match.
      fuentes: fuentesRag.map((f) => ({
        titulo: f.titulo, tipo: f.tipo, fecha_doc: f.fecha_doc, source_url: f.source_url,
        fragmento: f.texto.length > 500 ? f.texto.slice(0, 500) + "…" : f.texto,
        similarity: f.similarity,
      })),
    };

    if (parsed.protocolo_previ) {
      result.alerta_urgente =
        "⚠️ ACTIVAR PROTOCOLO DE ACTUACIÓN INMEDIATA. " +
        "Notificar a Jefatura de Estudios, Orientación y Coordinador/a de Bienestar " +
        "antes de finalizar la jornada escolar.";
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
