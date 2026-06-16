# DidactIA — Tablas de Supabase

> Referenciado desde CLAUDE.md. Toda consulta filtra por `centro_id`.

## Tablas de Supabase

| Tabla | Campos clave | Notas |
|-------|-------------|-------|
| `centros` | id, nombre, **slug** (NOT NULL), codigo_familia, codigo_profesional, codigo_acceso, modulos_activos[], color_primario, logo_url, institucion_id, created_at | Centros educativos. Se crean desde el panel de Usuarios (superadmin → "+ Nuevo centro", `nuevoCentroWizard`). **Nota:** la columna `ccaa` NO existe en producción (la EF `tipificar-incidencia` la lee → cae al fallback estatal). |
| `profiles` | id, user_id, full_name, email, rol, centro_id, activo (bool DEFAULT true), created_at | Extiende auth.users. `id = user_id` (ambos = auth UUID). `activo=false` bloquea el login |
| `horarios` | centro_id, dia, hora, profesor, actividad | Tabla legacy — chatbot búsqueda por apellido |
| `horarios_grupo` | centro_id, grupo_horario, **curso_escolar** (TEXT NOT NULL DEFAULT '2025-26'), dia, tramo, hora_inicio, hora_fin, actividad_nombre, profesor_nombre, aula | Tabla principal — lógica horaria directa. Multi-curso: filtrar siempre por `curso_escolar = cursoActivo` (global en config.js). Índice: `idx_hg_curso(centro_id, curso_escolar)` |
| `info_centro` | centro_id, nombre_config, datos (jsonb), visible_para, **curso_activo** (TEXT NOT NULL DEFAULT '2025-26') | Contexto del chatbot. `curso_activo` controla qué horario ven chat y sustituciones |
| `alumnos` | centro_id, nombre, curso, grupo_horario, **alergias** (text), **dieta_especial** (text) | Vinculados vía familia_alumno. `alergias`/`dieta_especial`: perfil alimentario permanente — editables por familia (portal) y admin (modal usuarios); mostrados como badge en comedor; pre-rellenados en autorizaciones de salidas |
| `familia_alumno` | profile_id, alumno_id | N:M familias↔alumnos |
| `asistencia_comedor` | centro_id, alumno_id, fecha, se_queda, plaza_fija, registrado_por, **nota_dia** (text) | Una fila por alumno/día. `nota_dia`: nota puntual editable por el docente desde el módulo comedor (ej: "menú alternativo confirmado"), mostrada como badge azul 📝 |
| `asistencia_clase` | centro_id, alumno_id, profesor_id, grupo_horario, fecha, tramo, **estado** (presente/ausente/retraso), observacion, notificado_familia, created_at; UNIQUE(centro_id,alumno_id,fecha,tramo) | Control de asistencia de aula. RLS `asistencia_clase_centro`. Push inmediato a familias al marcar ausente; al confirmar lista para retrasos |
| `sustituciones` | centro_id, fecha, hora_inicio, hora_fin, tramo, grupo_horario, profesor_ausente, profesor_sustituto, observaciones, cubierta, creado_por | `cubierta` tiene toggle en la tabla. Se auto-genera desde RRHH al aprobar ausencias |
| `profesores` | centro_id, profile_id, nombre, especialidad, departamento, horas_semanales, tipo_jornada, activo | Ficha HR del profesor; `profile_id` opcional (puede no tener cuenta) |
| `ausencias_profesor` | centro_id, profile_id, fecha, fecha_fin, tipo, motivo, estado, aprobada_por, motivo_rechazo, trimestre (NOT NULL), curso_escolar (NOT NULL), tramo (nullable), created_at | Estado: pendiente/aprobada/rechazada; tipo: baja_medica/permiso/asunto_propio/formacion/sindical/otros. Las instrucciones para el sustituto van en `sustituciones.observaciones`, NO aquí. `trabajo_alumnos` y `justificante_url` NO existen en el esquema real. |
| `guardias_realizadas` | centro_id, profile_id, ausencia_id, fecha, tramo, grupo_horario, aula, observaciones, trimestre, curso_escolar, created_at | Guardias cubiertas; `ausencia_id` FK → ausencias_profesor |
| `incidencias` | centro_id, fecha, tipo, gravedad, descripcion, alumno_nombre, grupo_horario, registrado_por, estado, informe_borrador, normativa_ref, medidas_propuestas[], protocolo_previ, created_at | Estado: abierta/cerrada; tipo: convivencia/material/instalaciones/otro; gravedad: leve/grave/muy_grave. Campos IA: `normativa_ref` (decreto aplicado), `medidas_propuestas` (text[]), `protocolo_previ` (bool), `informe_borrador` (texto editable antes de guardar) |
| `comunicados` | centro_id, titulo, cuerpo, destinatarios, creado_por, fecha, estado, plantilla, created_at | `destinatarios`: 'todos'/'solo_profesores'/'solo_familias'/'grupo:XXXX'; `estado`: borrador/enviado; `plantilla`: reunion/horario/plazo/null |
| `materias` | centro_id, nombre, color | Materias del Planner; `color` hex para fichas del tablero |
| `aulas` | centro_id, nombre, tipo, capacidad | Aulas reservables en el Planner |
| `disponibilidad_profesor` | profesor_id, dia_semana, tramo_horario, estado | Restricciones de disponibilidad para el CSP |
| `necesidades_lectivas` | centro_id, grupo_horario, materia_id, profesor_id, horas_semanales, tipo_aula_requerida | Input del generador: X horas/sem de materia Y con prof Z para grupo G |
| `horario_generado` | centro_id, grupo_horario, materia_id, profesor_id (**nullable**), aula_id, dia_semana, tramo_horario, es_fijo | Output del CSP antes de publicar; UNIQUE(profesor_id,dia,tramo) y UNIQUE(grupo,dia,tramo). `profesor_id` nullable → soporta horarios "sin profesores" (slots a asignar después) |
| `calificaciones` | centro_id, alumno_id, alumno_nombre, grupo, asignatura, evaluacion, nota (NUMERIC 0–10), observaciones, profesor_id, profesor_nombre, updated_at | Gradebook. `evaluacion` CHECK ('1ª/2ª/3ª Evaluación','Final'); UNIQUE(centro_id,alumno_id,asignatura,evaluacion). RLS: lectura staff del mismo centro + superadmin; **familia solo las notas de sus hijos** (`alumno_id ∈ familia_alumno(profile_id=auth.uid())`, ver `calificaciones_familia_rls.sql`); insert/update por profesor dueño (`profesor_id=auth.uid()`) o admin; delete solo dirección. Módulo `js/calificaciones.js` (vista profesor/dirección/familia) |
| `materiales` | centro_id, grupo, asignatura, titulo, tipo ('archivo'\|'enlace'), url, storage_path, descripcion, profesor_id, profesor_nombre, created_at | Hub de materiales. RLS: lectura todos los roles del centro; insert/update docente+dirección; delete subidor o admin. Archivos en **bucket privado `materiales`** (`{centro_id}/…`, signed URL). Módulo `js/materiales.js` |
| `expedientes_orientacion` | centro_id, alumno_id, orientador_id (→profiles), fecha_apertura, estado ('activo'\|'archivado'), notas_internas, created_at; UNIQUE(centro_id,alumno_id) | Uno por alumno. RLS `orientacion_centro` (superadmin + centro). Módulo `js/orientacion.js` |
| `informes_psicopedagogicos` | centro_id, expediente_id (CASCADE), tipo ('evaluacion_inicial'\|'revision'\|'dictamen'\|'otro'), borrador_texto, texto_final, estado ('borrador'\|'validado'\|'firmado'), creado_por, fecha_validacion, created_at | `texto_final` NUNCA se sobreescribe si `estado='firmado'` (guardia en UI). Borrador IA vía EF chat |
| `medidas_atencion` | centro_id, expediente_id (CASCADE), tipo ('ACNS'\|'ACS'\|'NEE'\|'NEAE'\|'PECAI'\|'otro'), descripcion, asignaturas_afectadas (jsonb[]), activa (bool), fecha_inicio, fecha_fin, created_at | Medida más grave activa (ACS>ACNS>NEE>NEAE>PECAI>otro) en la lista de expedientes |
| `cuestionarios_docentes` | centro_id, expediente_id (CASCADE), profesor_id (→profiles), asignatura, respuestas (jsonb: dificultades/metodologias/lagunas/observaciones), estado ('pendiente'\|'completado'), created_at | Enviar a docente / rellenar 4 preguntas fijas / sintetizar con IA |
| `tramites_orientacion` | centro_id, expediente_id (CASCADE), tipo ('dictamen'\|'escolarizacion'\|'alta_capacidades'\|'otro'), estado_tramite, descripcion, fecha_estimada, visible_familia (bool), created_at | `visible_familia=true` → visible en el portal de familias y dispara push a familias |
| `alertas_orientacion` | centro_id, alumno_id, tipo ('rendimiento'\|'asistencia'\|'conducta'\|'combinada'), nivel_riesgo ('bajo'\|'medio'\|'alto'), descripcion_ia, estado ('nueva'\|'en_seguimiento'\|'resuelta'), created_at | Panel de riesgo; alta manual o detección IA (asistencia_comedor+sustituciones→Gemini) |
| `planner_profesores`, `planner_cargas`, `planner_tramos`, `planner_grupos`, `planner_restricciones`, `planner_disponibilidad`, `planner_espacios`, `planner_reglas` | (centro_id + columnas por hoja) | **Datos de ENTRADA** del Planner (una tabla por hoja de `DidactIA_Planner_datos_26-27.xlsx`). RLS `centro_isolation`. Se rellenan desde Planner → pestaña **Importar**. **Nota:** la hoja "Cargas" NO va a `planner_cargas` sino a `materias`+`profesores`+`necesidades_lectivas` (lo que lee el generador) |
| `tramos_centro` | id, centro_id, numero (int), hora_inicio (HH:MM), hora_fin (HH:MM), nombre (text\|null), es_descanso (bool) | Tramos horarios configurables por centro; gestionables por voz vía chatbot (`crear_tramos_centro`, `listar_tramos_centro`) |
| `espacios` | centro_id, nombre, capacidad | Salas/espacios reservables del centro |
| `reservas_espacios` | centro_id, espacio_id, fecha, tramo, hora_inicio, hora_fin, reservado_por, motivo, created_at | `espacio_id` FK → espacios |
| `plazos_ib` | centro_id, curso_escolar, titulo, descripcion, fecha_limite, tipo, afecta_a, estado, created_at | Estado: pendiente/completado; tipo: entrega_ia/tok/cas/examen/formulario/reunion/otro |
| `cas_actividades` | centro_id, alumno_id, titulo, tipo, descripcion, reflexion, fecha_inicio, horas, estado, created_at | Actividades CAS del Diploma IB; tipo: creatividad/actividad/servicio; estado: en_curso/completada. Creada en `sql/demo-center.sql` |
| `extended_essay` | centro_id, alumno_id, titulo, asignatura, supervisor_nombre, estado, fecha_entrega_limite, palabras_actuales, **nota** (A–E), created_at | Extended Essay del Diploma IB; estado: en_proceso/primer_borrador/borrador_final/entregado. `nota` para la matriz core. Creada en `sql/demo-center.sql` |
| `ib_tok` | centro_id, alumno_id, ensayo_titulo, ensayo_estado, ensayo_nota (A–E), exhibicion_tema, exhibicion_estado, exhibicion_nota, comentarios, updated_at; UNIQUE(centro_id,alumno_id) | TOK (Theory of Knowledge): ensayo + exhibición. RLS `ib_tok_centro`. Módulo `js/ib.js` |
| `ee_borradores` | centro_id, extended_essay_id (CASCADE), version, palabras, comentario_supervisor, fecha, created_at | Borradores y feedback del supervisor del Extended Essay |
| `ib_resultados` | centro_id, alumno_id, asignatura, nivel (HL/SL), prediccion (1–7), nota_final (1–7), updated_at; UNIQUE(centro_id,alumno_id,asignatura) | Predicciones y resultados por asignatura (IBIS-adjacent). Σ + matriz core = total /45 |
| `salidas_didacticas` | centro_id, titulo, descripcion, fecha_salida, hora_salida, hora_regreso, curso_grupos (jsonb), coste, responsable_id, estado, datos_autobus (jsonb), created_at | Estado: borrador/publicada/cerrada/cancelada. `datos_autobus`: {empresa,matricula,telefono,plazas,notas} |
| `participantes_salida` | centro_id, salida_id, alumno_id, autorizado, pagado, necesita_picnic, alergias_confirmadas, fecha_autorizacion, created_at | UNIQUE(salida_id,alumno_id). Generados en batch al crear la salida desde los grupos seleccionados |
| `notificaciones_salida` | centro_id, salida_id, tipo, enviada, fecha_envio, created_at | tipo: recordatorio/cierre/llegada/cocina |
| `no_conformidades` | centro_id, reporter_id, proceso_categoria, prioridad, descripcion_raw, estado, reported_at, created_at | Módulo Calidad. `prioridad`: baja/media/alta/critica; `estado`: abierta/en_analisis/capa_ejecutada/cerrada; `proceso_categoria`: docencia/mantenimiento/comedor/transporte/convivencia/administracion/seguridad/general |
| `acciones_capa` | centro_id, nc_id (FK→no_conformidades), causa_raiz, plan_accion, responsable_id, fecha_objetivo, fecha_verificacion, es_eficaz (bool nullable), created_at | Acciones correctivas/preventivas vinculadas a una NC. `es_eficaz=null` = pendiente de verificar |
| `feedback_familias` | centro_id, familia_user_id, alumno_id, canal, texto_raw, categoria_ia, sentimiento_ia (numeric −1..1), resumen_ia, requiere_accion (bool), respuesta_borrador, estado, created_at | Feedback de familias. `canal`: formulario/email/chat/presencial; `estado`: pendiente/en_gestion/resuelto. Análisis IA asíncrono post-INSERT |
| `documentos_calidad` | centro_id, titulo, tipo, contenido, created_at | Documentos del SGC (sistema de gestión de calidad) |
| `plantillas_calidad` | centro_id, nombre, tipo, contenido_plantilla, campos_requeridos (jsonb) | Plantillas de documentos (entrevista familia, acta reunión, informe incidencia, plan mejora). Seed: `supabase/seeds/plantillas_calidad_default.sql` |
| `push_subscriptions` | id, user_id (NOT NULL), centro_id (nullable), subscription (jsonb), created_at | Suscripciones Web Push. RLS `push_own` + `push_superadmin`. La EF `send-push` lee de aquí (service_role); las familias se suscriben desde `js/familias.js` (`initPushFamilias`) |
| `tutoria_disponibilidad` | centro_id, tutor_id (→profiles), grupo_horario, dia_semana (1–5), hora_inicio (time), hora_fin (time), duracion_min (DEFAULT 20), activo (bool), created_at | Ventanas de disponibilidad del tutor. RLS: staff ALL; familia SELECT solo activas. Módulo `js/tutoria.js` |
| `tutoria_citas` | centro_id, disp_id (→tutoria_disponibilidad), tutor_id, alumno_id, alumno_nombre (denom.), grupo_horario (denom.), familia_id, fecha, hora_inicio, hora_fin, motivo, notas_tutor, estado (solicitada/confirmada/realizada/cancelada), cancelada_por (tutor/familia); UNIQUE(disp_id, fecha, hora_inicio) | Citas de tutoría. El UNIQUE impide doble reserva con race condition. RLS: staff ALL; familia SELECT/INSERT/UPDATE propias (`familia_id=auth.uid()`). Módulo `js/tutoria.js` |

---

## Estado del proyecto (2026-05-29)

### Tablas verificadas en Supabase (proyecto: rflfsbrdmgaidhvbuvwb)

| Tabla | Estado | Notas |
|-------|--------|-------|
| `centros` | ✅ OK | `modulos_activos[]` controla tabs visibles |
| `profiles` | ✅ OK | Añadidas columnas `activo` y `created_at` |
| `info_centro` | ✅ OK | |
| `horarios` | ✅ OK | Tabla legacy, se mantiene para compatibilidad |
| `horarios_grupo` | ✅ OK | Tabla principal de horarios |
| `alumnos` | ✅ OK | |
| `familia_alumno` | ✅ OK | RLS ampliada con policy `admin_gestiona_familia` |
| `asistencia_comedor` | ✅ OK | |
| `sustituciones` | ✅ OK | Realtime activado para notificaciones push |
| `profesores` | ✅ OK | Creada con `rrhh_migration.sql` |
| `ausencias_profesor` | ✅ OK | Ampliada con `trabajo_alumnos` y `justificante_url` vía ALTER TABLE |
| `guardias_realizadas` | ✅ OK | Creada con `rrhh_migration.sql` |
| `incidencias` | ✅ OK | Ampliada con `informe_borrador`, `normativa_ref`, `medidas_propuestas[]`, `protocolo_previ` vía `sql/add-incidencias-fields.sql` |
| `comunicados` | ✅ OK | Creada con SQL del módulo comunicados (sesión 2026-05-24) |
| `espacios` | ✅ OK | Creada con SQL del CLAUDE.md (sesión anterior) |
| `reservas_espacios` | ✅ OK | Creada con SQL del CLAUDE.md (sesión anterior) |
| `plazos_ib` | ✅ OK | Creada con SQL del workflow alertas IB + RLS + índice |
| `cas_actividades` | ✅ OK | Creada en `sql/demo-center.sql` con IF NOT EXISTS |
| `extended_essay` | ✅ OK | Creada en `sql/demo-center.sql` con IF NOT EXISTS |
| `materias` | ✅ OK | Creada con `sql/planner-tables.sql` — módulo Planner |
| `aulas` | ✅ OK | Creada con `sql/planner-tables.sql` — módulo Planner |
| `disponibilidad_profesor` | ✅ OK | Creada con `sql/planner-tables.sql` — módulo Planner |
| `necesidades_lectivas` | ✅ OK | Creada con `sql/planner-tables.sql` — módulo Planner |
| `horario_generado` | ✅ OK | Creada con `sql/planner-tables.sql` — módulo Planner |

### Storage buckets en Supabase

| Bucket | Acceso | Uso |
|--------|--------|-----|
| `documentos` | Privado + RLS de Storage staff-only por centro (carpeta `justificantes/{centro_id}/…`, `centro_id` = segmento `[2]`) | Justificantes de ausencias (`js/admin.js`: upload en `notificarAusenciaProfesor` + `_subirJustificante`/`_descargarJustificante` con signed URL 1h). **Creado 2026-06-16** (`bucket_documentos_justificantes.sql`): antes el código subía a este bucket pero NO existía → los justificantes se perdían en silencio. NO existe bucket `justificantes` (el path empieza por `justificantes/` pero el bucket es `documentos`) |
| `materiales` | Privado + RLS de Storage por centro (carpeta `{centro_id}/…`) | Archivos del módulo Materiales; descarga vía signed URL (1h) |
| `documents` | Público | Bucket genérico existente |

### Funciones RPC en Supabase

| Función | Descripción |
|---------|-------------|
| `get_users_with_auth(p_centro_id)` | SECURITY DEFINER. JOIN profiles + auth.users + centros. Admin ve solo su centro; superadmin ve todos |
| `_caller_rol()` | Helper SECURITY DEFINER para RLS policies sin recursión |
| `_caller_centro()` | Helper SECURITY DEFINER para RLS policies sin recursión |

### Módulos operativos por rol

| Módulo | familia | profesional | admin | superadmin |
|--------|---------|-------------|-------|------------|
| Chatbot | ✅ | ✅ | ✅ | ✅ |
| Comedor | — | ✅ (módulo) | ✅ (módulo) | ✅ |
| Sustituciones | — | ✅ | ✅ | ✅ |
| Incidencias | — | ✅ | ✅ | ✅ |
| Espacios | — | ✅ (módulo) | ✅ (módulo) | ✅ |
| RRHH | — | ✅ (vista propia) | ✅ (gestión) | ✅ |
| Comunicados | ✅ (lectura) | ✅ (lectura) | ✅ (envío+lectura) | ✅ |
| IB (plazos/CAS/EE) | ✅ (si hijo en IB) | ✅ | ✅ | ✅ |
| Administración | — | — | ✅ | ✅ |
| Usuarios | — | — | ✅ (su centro) | ✅ (todos) |
| Planner | — | — | ✅ | ✅ |
| Análisis (Dashboard CMI + Informes PDF) | — | — | ✅ | ✅ |
| Calidad (NCs + Feedback + CAPA) | — | — | ✅ | ✅ |
| Orientación | (portal trámites visible_familia) | — | ✅ | ✅ (+orientador/jefatura/director) |
| Salidas Didácticas | ✅ (autorización) | ✅ | ✅ | ✅ |
| Alumnos (directorio + ficha) | — | ✅ | ✅ | ✅ (+orientador/director/jefatura) |

`(módulo)` = visible solo si `modulos_activos` del centro lo incluye.

### Orden de carga de scripts en app.html
```html
<script src="js/config.js"></script>
<script src="js/auth.js"></script>
<script src="js/users.js"></script>
<script src="js/admin.js"></script>
<script src="js/chat.js"></script>
<script src="js/comedor.js"></script>
<script src="js/mejoras.js"></script>
<script src="js/incidencias.js"></script>
<script src="js/espacios.js"></script>
<script src="js/rrhh.js"></script>
<script src="js/guardias.js"></script>
<script src="js/comunicados.js"></script>
<script src="js/familias.js"></script>
<script src="js/planner.js"></script>
<script src="js/analytics.js"></script>
<script src="js/calificaciones.js"></script>
<script src="js/materiales.js"></script>
<script src="js/informes.js"></script>
<script src="js/orientacion.js"></script>
<script src="js/calidad.js"></script>
<script src="js/salidas.js"></script>
<script src="js/alumnos.js"></script>
```
