-- Plantillas de calidad genéricas para Agora Lledó
-- Ejecutar manualmente en Supabase SQL Editor tras crear las tablas.
-- Sustituir el centro_id si es necesario.

INSERT INTO plantillas_calidad
  (centro_id, nombre, tipo, contenido_plantilla, campos_requeridos)
VALUES

-- 1. Entrevista con familia
(
  'ad0168e8-6c24-4597-8917-ee54cac8234b',
  'Entrevista con familia',
  'entrevista_familia',
  'ENTREVISTA CON FAMILIA
Fecha: {fecha}
Tutor/a: {tutor}
Familia: {familia}
Alumno/a: {alumno}
Curso: {curso}

MOTIVO DE LA ENTREVISTA:
{motivo}

DESARROLLO:
{desarrollo}

ACUERDOS Y COMPROMISOS:
{acuerdos}

PRÓXIMA REVISIÓN:
{proxima_revision}

Firma del tutor/a: _______________',
  '["fecha","tutor","familia","alumno","curso","motivo","desarrollo","acuerdos","proxima_revision"]'
),

-- 2. Acta de reunión de departamento
(
  'ad0168e8-6c24-4597-8917-ee54cac8234b',
  'Acta de reunión de departamento',
  'acta_reunion',
  'ACTA DE REUNIÓN DE DEPARTAMENTO
Departamento: {departamento}
Fecha: {fecha}
Participantes: {participantes}

ORDEN DEL DÍA:
{orden_dia}

ACUERDOS ADOPTADOS:
{acuerdos}

PRÓXIMA REUNIÓN:
{proxima_reunion}

Secretario/a: _______________     Jefe/a de departamento: _______________',
  '["departamento","fecha","participantes","orden_dia","acuerdos","proxima_reunion"]'
),

-- 3. Informe de incidencia
(
  'ad0168e8-6c24-4597-8917-ee54cac8234b',
  'Informe de incidencia',
  'informe_incidencia',
  'INFORME DE INCIDENCIA
Fecha del incidente: {fecha}
Responsable del informe: {responsable}

DESCRIPCIÓN DE LOS HECHOS:
{descripcion}

ALUMNOS IMPLICADOS:
{alumnos_implicados}

MEDIDAS ADOPTADAS DE FORMA INMEDIATA:
{medidas_adoptadas}

SEGUIMIENTO Y PRÓXIMAS ACCIONES:
{seguimiento}

Fecha del informe: _______________     Firma: _______________',
  '["fecha","responsable","descripcion","alumnos_implicados","medidas_adoptadas","seguimiento"]'
),

-- 4. Plan de mejora
(
  'ad0168e8-6c24-4597-8917-ee54cac8234b',
  'Plan de mejora',
  'plan_mejora',
  'PLAN DE MEJORA
Área de mejora: {area_mejora}
Responsable: {responsable}
Plazo: {plazo}

SITUACIÓN ACTUAL:
{situacion_actual}

OBJETIVO DE MEJORA:
{objetivo}

ACCIONES PLANIFICADAS:
{acciones}

INDICADOR DE ÉXITO:
{indicador_exito}

Fecha de elaboración: _______________     Firma: _______________',
  '["area_mejora","responsable","plazo","situacion_actual","objetivo","acciones","indicador_exito"]'
);
