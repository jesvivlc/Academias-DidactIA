# DidactIA Academias — Bitácora del roadmap (ejecución autónoma)

> La actualizo en cada incremento. Backend: Supabase `izdqpsenrjcqtuhjhqxo`.
> Producción: https://didactia-academias.vercel.app · Login demo: jesvivlc@gmail.com / Academias2026!

## ✅ RESUMEN FINAL DE LA NOCHE

**Las 6 fases del roadmap están COMPLETAS y desplegadas en producción.** La app pasó de un núcleo limpio a una plataforma de gestión de academias con 14 módulos nuevos.

**Fases:** 1 Datos maestros ✅ · 2 Operación diaria ✅ · 3 Familias y comunicación ✅ · 4 Cobros y economía ✅ · 5 Inteligencia pedagógica ✅ · 6 Crecimiento ✅

**Módulos nuevos (14):** alumnos/matrícula, grupos+profesores, horario (con solapes), asistencia, incidencias, calificaciones+tareas, portal profesor (docencia), calendario+resumen semanal, portal familia, comunicaciones, cobros (+factura PDF), detección de riesgo, marketing. (Núcleo previo: auth multi-tenant, usuarios, chat base, PWA.)

**Tablas nuevas (14):** alumnos (ampliada), profesores, grupos, grupo_sesiones, matriculas, matricula_grupo, asistencia, incidencias, calificaciones, tareas, eventos, comunicaciones, pagos + helper `_mis_alumnos()` y políticas RLS `*_fam_read` (familia lee solo lo de sus hijos, **verificado con cuenta familia real**).

**Probado:** cada incremento con `node --check`, prueba de datos bajo RLS (login real) y smoke test HTTP 200 tras cada deploy. Multi-tenant y aislamiento de familia verificados.

### 🔑 Claves pendientes para activar lo que quedó como HOOK
- **`GEMINI_API_KEY`** (+ desplegar EF `chat` con el CLI de Supabase) → Chat IA 24h, tutor del alumno, planes de refuerzo y generación de recursos (botones ✨ de Detección de riesgo), redacción a medida de Marketing.
- **`RESEND_API_KEY`** → envío real de Comunicaciones por email + avisos de asistencia a familias (hoy quedan en cola `pendiente` / `notificado_familia=false`).
- **VAPID (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`)** → notificaciones push.
- **WhatsApp Business API / Meta Graph API** → asistente de WhatsApp y autopublicación en Instagram/Facebook.
- **Stripe** (opcional) → pasarela de pago online (hoy: cobros manuales + factura PDF).

### ⚠️ Seguridad
Rotar cuando puedas: la **service_role key**, la **secret key** y el **Personal Access Token** (`sbp_…`) compartidos en el chat, y cambiar la contraseña demo `Academias2026!`.

### Próximos pasos sugeridos (cuando despiertes)
1. Darme una `GEMINI_API_KEY` para activar toda la capa de IA.
2. Crear el repo Git nuevo y conectarlo a Vercel para deploys automáticos (hoy despliego por CLI).
3. Asociar cada cuenta de profesor a su ficha (`profesores.profile_id`) para acotar "Mi docencia" a sus grupos.

---


## Estado por fases
- **Fase 0.5 — Habilitadores:** pendiente (EF `chat` Gemini, email/push).
- **Fase 1 — Datos maestros:** COMPLETADA (inc.1 Alumnos, inc.2 Grupos+Profesores, inc.3 Horario).
- **Fase 2 — Operación diaria:** COMPLETADA (Asistencia, Incidencias, Calificaciones/Tareas, Portal profesor, Calendario/Resumen semanal).
- **Fase 3 — Familias y comunicación:** COMPLETADA (RLS familia + Portal familia + Comunicaciones; Chat IA 24h con hook pendiente de Gemini).
- **Fase 4 — Cobros y economía:** COMPLETADA (pagos, impagos, económico, factura PDF).
- **Fase 5 — Inteligencia pedagógica:** COMPLETADA (detección de riesgo determinista; tutor/planes/recursos IA como hook Gemini).
- **Fase 6 — Crecimiento:** COMPLETADA (marketing por plantillas; IA/WhatsApp/RRSS como hook).

## Registro de incrementos
<!-- nuevo arriba -->
- **Backlog #8 — Profesor↔cuenta.** En el modal Editar usuario (`app.html`+`js/users.js`), si el
  rol es profesional, selector **Vincular a ficha de profesor** (setea `profesores.profile_id`).
  `js/portalprof.js` (Mi docencia): si el usuario profesional está vinculado, acota grupos/
  sesiones/exámenes/ausencias/notas a **sus** grupos (`profesor_id`); si no, muestra todo con
  aviso. Verificado el vínculo por `profile_id`. Próximo: **#9 Aviso de ausencia por email**.
- **Backlog #7 — Renovación de curso en lote.** `js/alumnos.js`: botón **🔁 Renovar curso**
  (dirección) → pide el nuevo curso (sugiere el siguiente), confirma, marca las matrículas
  activas como `renovada` y crea nuevas `activa` con la cuota/forma de pago copiadas al nuevo
  curso. Verificado. Próximo: **#8 Profesor↔cuenta**.
- **Backlog #6 — Informe de evolución del alumno con IA.** `js/portalfam.js`: botón **✨ Informe
  de evolución** (por hijo) → junta últimas notas + %asistencia(30d) + incidencias → `iaChat`
  (rol orientador: fortalezas, aspectos a reforzar, recomendaciones, objetivos) → `iaModal`.
  Próximo: **#7 Renovación de curso en lote**.
- **Backlog #5 — Secretaría IA.** `js/calendario.js`: botón **✨ Resumen con IA** → junta
  eventos+exámenes+tareas (7d) e impagos del mes → `iaChat` (rol secretaria) → `iaModal` con el
  parte de la semana en lenguaje natural. Verificado IA. Próximo: **#6 Informe de evolución del
  alumno con IA (portal familia)**.
- **Backlog #4 — Económico por profesor/aula/asignatura.** `js/cobros.js`: bloque **Ingresos
  estimados** = cuota_mensual del grupo × nº alumnos asignados (matricula_grupo), agrupado en 3
  tablas (por profesor, por aula, por asignatura) + total mensual. Solo lectura; verificado bajo
  RLS. Próximo: **#5 Secretaría IA (resumen semanal con IA)**.
- **Backlog #3 — Facturación desde matrícula.** `js/cobros.js`: botón **🧾 Generar recibos del
  mes** (crea un pago `pendiente` con la cuota por cada matrícula activa con cuota que no tenga
  recibo del periodo actual, sin duplicar) + columna **Estado** y botón **Marcar pagado** en los
  recibos pendientes (la factura PDF ya existía). Verificado ciclo pendiente→pagado bajo RLS.
  Próximo: **#4 Económico por profesor/aula/asignatura**.
- **Backlog #2 — Mensajería familia↔centro.** SQL `sql/fase7-mensajes.sql` (tabla `mensajes`
  por alumno + RLS: familia sus hijos/remitente propio, staff todo el centro). Módulo
  `js/mensajes.js` (tab `mensajes2`, nav "Gestión → Mensajes"): hilos por alumno + responder +
  marca leídos. Bloque **✉️ Mensajes con el centro** en `js/portalfam.js` (la familia escribe y
  ve respuestas). Verificado bidireccional bajo RLS. Próximo: **#3 Facturación desde matrícula**.
- **Backlog #1 — Portal familia: recibos + calendario.** SQL `sql/fase7-portalfam-rls.sql`
  (políticas `pagos_fam_read` y `eventos_fam_read`). `js/portalfam.js`: dos bloques nuevos
  **💶 Recibos** (pagos del hijo) y **📅 Calendario del centro** (próximos eventos). Verificado
  con cuenta familia real (ve su recibo y los eventos del centro). Próximo: **#2 Mensajería
  familia↔centro**.
- **EMAIL activado (Resend) + Comunicaciones envía de verdad.** Secret `RESEND_API_KEY`
  configurado. EF **`send-comunicacion`** desplegada (resuelve emails de familias server-side
  según destinatario todos/grupo/alumno, envía vía Resend con bcc, marca estado `enviada`).
  `js/comunicaciones.js`: al crear envía automáticamente + botón "📧 Enviar ahora" en pendientes.
  Verificado end-to-end (sent:0 sin familias). ⚠️ **Resend sin dominio verificado** → hasta que
  el usuario verifique un dominio (DNS) solo entrega al email de la cuenta; `from` configurable
  vía secret `MAIL_FROM` (default onboarding@resend.dev).
- **Tutor IA (alumno/familia).** Módulo `js/tutor.js` (tab `tutor`, nav "Tutor IA" visible a
  todos, junto a Asistente IA). Mini-chat pedagógico **multivuelta** sobre la EF `chat`/Gemini:
  resuelve dudas, explica conceptos con ejemplos, genera ejercicios con soluciones, prepara
  exámenes, técnicas de estudio, organización del tiempo. Chips de acción rápida; system prompt
  de tutor paciente en texto plano (sin LaTeX). Verificado multivuelta end-to-end.
- **IA ACTIVADA (Gemini).** `GEMINI_API_KEY` (formato nuevo `AQ.…`, validada contra la API,
  gemini-2.5-flash) guardada como **secret** en Supabase. Desplegada la EF **`chat`** (proxy
  limpio a Gemini, `{contents, system_prompt}` → `{type:"text", text}`, `verify_jwt:true`) →
  **Asistente IA de la app funciona con Gemini real** (sin tocar `js/chat.js`). Verificado
  end-to-end. Añadidos helpers `window.iaChat()` + `window.iaModal()` en `utils.js` y cableados:
  **Detección de riesgo** (✨ Plan de refuerzo / Recursos genera un plan real por alumno) y
  **Marketing** (✨ Versión con IA reescribe el post). Pendiente aún: RESEND (email), VAPID
  (push), WhatsApp/Meta. ⚠️ Rotar la GEMINI_API_KEY compartida en chat cuando convenga.
- **FIX — "email rate limit exceeded" al invitar.** El correo integrado de Supabase está muy
  limitado. Solución sin depender de email: la EF `invite-user` ahora usa **`generateLink`**
  (crea el usuario si es nuevo, o enlace de recuperación si ya existe) y **devuelve el enlace**;
  NO envía correo → sin límite. El frontend (`js/users.js`) muestra el enlace con botón **Copiar**
  (invitar) / `prompt` (reenviar) para compartirlo por WhatsApp/email/etc. Además `inviteUser`
  envía ahora el **access_token del admin** (más seguro; fallback a caller_user_id). Verificado
  end-to-end (devuelve action_link). Cuando se configure SMTP/Resend se puede volver al envío
  automático por email.
- **FIX — Invitar usuario ("Failed to fetch").** Causa: la Edge Function `invite-user` no
  estaba desplegada en el backend nuevo. Solución: **desplegada vía Management API** (multipart,
  `verify_jwt:false`, usa `SUPABASE_SERVICE_ROLE_KEY` autoinyectada; `inviteUserByEmail` +
  pre-crea perfil; ahora devuelve `user_id`). **Verificado end-to-end** (success + perfil creado
  con rol correcto). Además configurada la **Auth Site URL / allowlist** →
  `https://didactia-academias.vercel.app/app.html` para que los enlaces de invitación/recuperación
  caigan en la app. `notify-role` ya estaba en try/catch (no rompe). ⚠️ El **email de invitación**
  usa el servicio integrado de Supabase (muy limitado); para envío fiable configurar **SMTP/Resend**
  en Auth. `send-comunicado`/`notify-*` siguen sin desplegar (no bloquean).
- **Fase 5 — Detección de riesgo + Fase 6 — Marketing (ROADMAP COMPLETO).**
  `js/riesgo.js` (tab `riesgo`): detección temprana DETERMINISTA cruzando asistencia<80%,
  incidencias graves abiertas y media<5 (30d) → lista con semáforo, motivos y KPIs; botones
  de IA (plan/recursos) como hook Gemini. `js/marketing.js` (tab `marketing`): generador de
  posts para RRSS por plantillas locales personalizadas con el nombre de la academia + copiar;
  IA/autopublicación como hook. Navs "Gestión → Detección de riesgo" y "→ Marketing".
  Verificado bajo RLS. **FASES 5 y 6 COMPLETAS → todo el roadmap terminado.**
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

> **CI/CD:** repo conectado a Vercel (rama `main` → producción). Cada `git push` despliega solo.
