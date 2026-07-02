# DidactIA Academias — Bitácora del roadmap (ejecución autónoma)

> La actualizo en cada incremento. Backend: Supabase `izdqpsenrjcqtuhjhqxo`.
> Producción: https://didactia-academias.vercel.app · Login demo: jesvivlc@gmail.com / Academias2026!

## Estado por fases
- **Fase 0.5 — Habilitadores:** pendiente (EF `chat` Gemini, email/push).
- **Fase 1 — Datos maestros:** COMPLETADA (inc.1 Alumnos, inc.2 Grupos+Profesores, inc.3 Horario).
- **Fase 2 — Operación diaria:** COMPLETADA (Asistencia, Incidencias, Calificaciones/Tareas, Portal profesor, Calendario/Resumen semanal).
- **Fase 3 — Familias y comunicación:** COMPLETADA (RLS familia + Portal familia + Comunicaciones; Chat IA 24h con hook pendiente de Gemini).
- **Fase 4 — Cobros y economía:** COMPLETADA (pagos, impagos, económico, factura PDF).
- Fase 5 — Inteligencia pedagógica: pendiente.
- Fase 6 — Crecimiento: pendiente.

## Registro de incrementos
<!-- nuevo arriba -->
- **Fase 4 — Cobros (completa en un incremento).** SQL `sql/fase4-cobros.sql` (tabla `pagos`
  + RLS staff/dirección). Módulo `js/cobros.js` (tab `cobros`): KPIs (ingresos del mes, nº
  pagos, impagos, previsión), registrar pago (alumno/concepto/importe/método/fecha/periodo),
  **bloque IMPAGOS** (matrículas activas con cuota sin pago del mes → botón "Registrar cobro"),
  **Economía** (ingresos, previsión=Σcuotas activas, bajas del mes, ingresos por método),
  pagos recientes y **Factura PDF** por pago con jsPDF. Nav "Gestión → Cobros". Verificado
  bajo RLS. **FASE 4 COMPLETA.** Próximo: **Fase 5 · Detección de riesgo (determinista)**.
- **Fase 3 · inc.3 — Chat IA 24h (HOOK, no desplegable sin clave).** La carpeta
  `supabase/functions/chat` existe (heredada de Centros) y `js/chat.js` ya apunta a
  `/functions/v1/chat`. Para activar el asistente IA hay que: (1) tener el **CLI de Supabase**
  y (2) un secret **`GEMINI_API_KEY`**, y desplegar la EF (`supabase functions deploy chat`).
  No disponibles en la ejecución autónoma → queda como hook. El resto del asistente (UI,
  resolución de horarios en cliente) funciona. **FASE 3 COMPLETA** (con este hook pendiente).
  Próximo: **Fase 4 · Cobros**.
- **Fase 3 · inc.2 — Comunicaciones (cola).** SQL `sql/fase3-comunicaciones.sql` (tabla
  `comunicaciones` + RLS staff read / dirección write). Módulo `js/comunicaciones.js` (tab
  `comunicaciones`): alta con destinatario (todos/grupo/alumno), canal (email/push/whatsapp),
  título y cuerpo → INSERT estado «pendiente» + historial. Aviso en UI de "modo borrador".
  ⚠️ **SIN envío real**: requiere Resend (email), VAPID (push) y WhatsApp Business API. Verificado
  bajo RLS. Próximo: **Fase 3 · inc.3 — Chat IA 24h** (comprobar EF/Gemini).
- **Fase 3 · inc.1 — RLS de familia + Portal familia.** SQL `sql/fase3-rls-familia.sql`:
  función `_mis_alumnos()` + políticas `*_fam_read` (SELECT) en asistencia/calificaciones/
  incidencias/matriculas (por alumno_id de sus hijos) y tareas/grupos/grupo_sesiones (por los
  grupos de sus hijos), sin tocar las de staff. Módulo `js/portalfam.js` (tab `famportal`,
  grupo nav "Familia", solo rol familia): selector de hijo + KPIs (%asistencia, nota media,
  incidencias) + bloques tareas/notas/asistencia/incidencias, usando `currentUserAlumnos`.
  **VERIFICADO con cuenta familia real**: ve solo los datos de su hijo, `[]` para otros; el
  staff sigue leyendo todo.
  Próximo: **Fase 3 · inc.2 — Comunicaciones** (cola sin envío real).
- **Fase 2 · inc.5 — Calendario + resumen semanal.** SQL `sql/fase2-eventos.sql` (tabla
  `eventos` + RLS staff read / dirección write). Módulo `js/calendario.js` (tab `calendario`):
  **Resumen de la semana** determinista (junta eventos ≤7d + exámenes + tareas próximas,
  agrupado por día tipo secretaría), lista de próximos eventos y alta (título/fecha/hora/tipo/
  descripción). Nav "Gestión → Calendario". Verificado bajo RLS. **FASE 2 COMPLETA.**
  Próximo: **Fase 3 · inc.1 — RLS de familia + Portal familia**.
- **Fase 2 · inc.4 — Portal profesor ("Mi docencia").** Módulo `js/portalprof.js` (solo
  lectura, sin SQL). KPIs (grupos activos, clases hoy, exámenes 7d, ausencias 7d) + 4 paneles:
  **horario de hoy** (grupo_sesiones del día), **próximos exámenes** (tareas tipo examen ≤7d),
  **ausencias recientes** (asistencia ausente ≤7d) y **notas para reforzar** (calificaciones
  <5 ≤30d). Nav "Gestión → Mi docencia" (tab `docencia`). Muestra todo el centro hasta que se
  asocien cuentas de profesor a su ficha. Verificado bajo RLS.
  Próximo: **Fase 2 · inc.5 — Calendario + recordatorios + resumen semanal** (cierra Fase 2).
- **Fase 2 · inc.3 — Calificaciones + Tareas/Exámenes.** SQL `sql/fase2-calificaciones.sql`
  (tablas `calificaciones` y `tareas` + RLS staff read/write). Módulo `js/calificaciones.js`
  (tab key `notas`): pestaña **Notas** (grupo → alumnos → nota 0–10 + observación por alumno,
  con etiqueta de evaluación/prueba y fecha → insert) y pestaña **Tareas y exámenes** (por
  grupo: lista + alta de deber/examen/proyecto con fecha). Nav "Gestión → Calificaciones".
  Verificado bajo RLS. Familias las leerán en Fase 3.
  Próximo: **Fase 2 · inc.4 — Portal profesor** (sus grupos/horario + alumnos del día: próximos
  exámenes, ausencias, notas bajas).
- **Fase 2 · inc.2 — Incidencias.** SQL `sql/fase2-incidencias.sql` (tabla `incidencias` +
  RLS staff read/write). Módulo `js/incidencias.js` (ids `incidencias2` para no chocar con
  restos previos): KPIs (abiertas/en seguimiento/graves activas), filtros por estado y
  gravedad, alta (alumno opcional, tipo, gravedad, descripción), tarjetas con cambio de
  estado (en seguimiento/cerrar/reabrir) y borrado. Nav "Gestión → Incidencias". Verificado
  bajo RLS incl. join a alumnos y on-delete-set-null.
  Próximo: **Fase 2 · inc.3 — Calificaciones / deberes / exámenes**.
- **Fase 2 · inc.1 — Control de asistencia.** SQL `sql/fase2-asistencia.sql` (tabla
  `asistencia` UNIQUE(centro_id,alumno_id,fecha,grupo_id) + RLS staff read / dirección+
  profesorado write). Módulo `js/asistencia.js`: pestaña **Pasar lista** (grupo+fecha →
  alumnos del grupo → estado presente/retraso/ausente/justificada por alumno + observación
  → upsert) y pestaña **Informe** (rango de fechas → KPIs + tabla por alumno con %asistencia
  coloreado y flag "seguimiento" si ≥3 ausencias). Nav "Gestión → Asistencia". Upsert
  verificado bajo RLS. NOTA: aviso real a familias queda para Fase 3 (email/push); de momento
  se registra el estado y `notificado_familia=false`.
  Próximo: **Fase 2 · inc.2 — Incidencias**.
- **Fase 1 · inc.3 — Horario semanal.** Módulo `js/horario.js` (solo lectura). Parrilla
  semanal (Lun–Vie, +finde si hay sesiones) cruzando `grupo_sesiones`+`grupos`+`profesores`,
  chips coloreados por grupo con hora/profesor/aula, filtro por grupo o profesor, y
  **detección de solapes de profesor y de aula** con panel de avisos. Nav "Gestión → Horario".
  **Fase 1 COMPLETA.** Próximo: **Fase 2 · inc.1 — Control de asistencia** (registrar faltas
  por sesión/día + aviso a familia + detección de ausencias repetidas + estadísticas).
- **Fase 1 · inc.2 — Grupos + Profesores.** Módulo `js/grupos.js` (sin SQL nuevo; usa
  tablas de inc.1). Dos pestañas: **Grupos** (CRUD nombre/asignatura/nivel/profesor/aula/
  capacidad/cuota/color, **sesiones semanales** día+horario con validación de solape, y
  **asignar alumnos** activos vía `matricula_grupo` con creación de matrícula si falta) y
  **Profesores** (alta/lista/baja). Nav "Gestión → Grupos" (staff). Verificado end-to-end
  bajo RLS incl. join anidado matricula_grupo→matriculas→alumnos.
  Próximo: **inc.3 — Horario semanal** (vista grupo/profesor cruzando grupo_sesiones + detección de solapes de profesor/aula).
- **Fase 1 · inc.1 — Alumnos/Matrícula.** SQL `sql/fase1-datos-maestros.sql` aplicado
  (tablas `profesores`,`grupos`,`grupo_sesiones`,`matriculas`,`matricula_grupo` + campos
  nuevos en `alumnos`: apellidos, nivel, NEE, estado, RGPD, etc. + RLS). Módulo `js/alumnos.js`
  (directorio + búsqueda + filtros activo/prospecto/baja + ficha completa + alta/baja/reactivar
  + cuota). Nav "Gestión → Alumnos" (staff). Flujo alumno+matrícula verificado end-to-end bajo RLS.
  Próximo: **inc.2 — Grupos** (CRUD grupos + sesiones semanales + asignar alumnos a grupos).
- (inicio) Base limpia desplegada; esquema fase-0 aplicado; login verificado.
