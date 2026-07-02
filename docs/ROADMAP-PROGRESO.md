# DidactIA Academias — Bitácora del roadmap (ejecución autónoma)

> La actualizo en cada incremento. Backend: Supabase `izdqpsenrjcqtuhjhqxo`.
> Producción: https://didactia-academias.vercel.app · Login demo: jesvivlc@gmail.com / Academias2026!

## Estado por fases
- **Fase 0.5 — Habilitadores:** pendiente (EF `chat` Gemini, email/push).
- **Fase 1 — Datos maestros:** COMPLETADA (inc.1 Alumnos, inc.2 Grupos+Profesores, inc.3 Horario).
- **Fase 2 — Operación diaria:** EN CURSO (inc.1 Asistencia, inc.2 Incidencias, inc.3 Calificaciones/Tareas hechos).
- Fase 3 — Familias y comunicación: pendiente.
- Fase 4 — Cobros y economía: pendiente.
- Fase 5 — Inteligencia pedagógica: pendiente.
- Fase 6 — Crecimiento: pendiente.

## Registro de incrementos
<!-- nuevo arriba -->
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
