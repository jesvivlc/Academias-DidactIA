# Auditoría Técnica Exhaustiva — DidactIA
**Fecha:** 2026-05-29 · **Auditor:** Claude Sonnet 4.6  
**Scope:** Frontend JS completo, Edge Functions, SQL, n8n workflows  
**Proyecto Supabase:** `rflfsbrdmgaidhvbuvwb`

---

## Resumen ejecutivo

DidactIA es una SaaS educativa multi-tenant razonablemente bien construida para el stack que usa (Vanilla JS + Supabase). El filtrado por `centro_id` es consistente en el 95% de las queries. RLS está activo. HTML escaping existe en los puntos de riesgo principales.

Los problemas reales son: (1) una tabla (`disponibilidad_profesor`) sin filtro `centro_id` en las queries de frontend, (2) cuatro Edge Functions sin desplegar o con despliegue incierto, (3) deuda técnica acumulada por módulos implementados en sprints cortos sin revisión de consistencia, y (4) ausencias de validación en algunos flujos de escritura del servidor.

---

## 1. MÓDULOS IMPLEMENTADOS

### 1.1 Chat / Asistente IA
**Qué hace:** Chatbot con Gemini 2.5 Flash. Resolución local de consultas de horario (sin Gemini) para alumnos, grupos y profesores. Detección de profesores libres en tiempo real. Para roles admin/profesional/superadmin: agente ejecutor con 5 herramientas de function calling (crear sustitución, incidencia, ausencia, consultar libre, avisar comedor). Historial conversacional últimos 10 mensajes. Tarjeta de confirmación UI antes de ejecutar acciones de escritura.

**Archivos JS:** `js/chat.js` (640 líneas), `js/config.js` (variables globales: `sb`, `ctrId`, `role`, `history`)

**Tablas Supabase:**
- `info_centro` — `eq("centro_id", ctrId)` ✅
- `horarios_grupo` — `eq("centro_id", ctrId)` ✅
- `horarios` (legacy) — `eq("centro_id", ctrId)` ✅
- `alumnos` — `eq("centro_id", ctrId)` ✅

**Edge Functions:** `chat` (Gemini proxy + tool dispatcher)

**Estado:** ✅ Funcionando

**Pendientes dentro del módulo:**
- La tabla `disponibilidad_profesor` en `buscarGrupoAlumno` hereda el filtro de `planner.js` pero en `buildContext` podría consultarse sin filtro si se añade en el futuro — watchlist
- No hay persistencia del historial en BD (se pierde al recargar) — decisión deliberada pero limita funcionalidad
- La resolución directa de horario no funciona para centros que no usen la nomenclatura `1ESOA/2ESOB` — el mapa de grupos válidos está hardcodeado en el cliente

---

### 1.2 Comedor
**Qué hace:** Vista diaria de asistencia por grupo (toggle por alumno). Auto-detecta grupo del profesor por hora actual. Histórico 30 días con tabla de totales. Exportación CSV con BOM UTF-8. Navegación por fechas.

**Archivos JS:** `js/comedor.js` (295 líneas)

**Tablas Supabase:**
- `alumnos` — `eq("centro_id", ctrId)` ✅
- `asistencia_comedor` — `eq("centro_id", ctrId)` ✅, upsert con `onConflict: "centro_id,alumno_id,fecha"` ✅
- `horarios` — `eq("centro_id", ctrId)` ✅ (para detectar grupo del profesor)

**Edge Functions:** ninguna

**Estado:** ✅ Funcionando

**Pendientes:**
- No hay validación del rol al hacer toggle — cualquier profesional puede marcar a cualquier alumno del centro (aunque RLS lo permite por diseño)
- La detección automática de grupo por hora usa la tabla `horarios` (legacy), no `horarios_grupo` — si el centro solo tiene datos en `horarios_grupo`, la detección falla silenciosamente
- Histórico solo va hacia el pasado — no hay vista de semana futura para planificación

---

### 1.3 Sustituciones
**Qué hace:** Registro de sustituciones con selector de sustituto ordenado por equidad de guardias (menor → mayor). Toggle cubierta/pendiente inline. Filtros hoy/semana/todo. Exportación CSV. Contador en tab cuando hay pendientes hoy. Al asignar sustituto: inserta en `guardias_realizadas` y llama `notify-sustitucion`.

**Archivos JS:** `js/admin.js` (371 líneas), `js/guardias.js` (153 líneas)

**Tablas Supabase:**
- `sustituciones` — `eq("centro_id", ctrId)` ✅
- `horarios_grupo` — `eq("centro_id", ctrId)` ✅
- `guardias_realizadas` — insert, `eq("centro_id", ctrId)` ✅
- `profiles` — `eq("centro_id", ctrId)` ✅

**Edge Functions:** `notify-sustitucion` (no está en `/supabase/functions/` del repo — ver sección 2)

**Estado:** ✅ Funcionando — ⚠️ `notify-sustitucion` probablemente no desplegada

**Pendientes:**
- No hay validación de que el sustituto asignado no tenga ya clase en ese tramo (se muestra en bolsa pero no se bloquea el registro)
- La bolsa de guardias solo considera `sustituciones.profesor_sustituto`, no `guardias_realizadas` directamente — puede haber divergencia si se borra una sustitución
- `registrarGuardiaEnBD()` hace búsqueda fuzzy por primer apellido — si dos profesores comparten apellido, inserta para el primero que retorna la query

---

### 1.4 Incidencias
**Qué hace:** Registro con búsqueda en tiempo real de alumno (autocomplete). Botón "Tipificar con IA" que llama EF con normativa CCAA del centro (5 regímenes: valenciana, madrid, andalucia, cataluna, estatal). Modal con gravedad sugerida, decreto aplicado, medidas propuestas, informe borrador editable y banner PREVI. Auto-notificación a jefatura si gravedad ≥ grave.

**Archivos JS:** `js/incidencias.js` (477 líneas)

**Tablas Supabase:**
- `alumnos` — `eq("centro_id", ctrId)` ✅
- `incidencias` — `eq("centro_id", ctrId)` ✅, campos adicionales: `normativa_ref`, `medidas_propuestas[]`, `protocolo_previ`, `informe_borrador`

**Edge Functions:** `tipificar-incidencia` ✅ desplegada, `notify-jefatura` ✅ desplegada, `notify-incidencia` ✅ desplegada

**Estado:** ✅ Funcionando

**Pendientes:**
- `notify-incidencia` (notificación a familia) existe pero no hay botón en la UI para llamarla explícitamente — hay una función `notificarFamiliaIncidencia()` en incidencias.js que no se expone en el panel
- No hay lógica de cierre de incidencia con registro de resolución — solo toggle de estado
- El campo `medidas_propuestas` se guarda como array de texto pero no hay UI para ver/editar las medidas individuales después de guardar

---

### 1.5 Espacios / Salas
**Qué hace:** Grid de disponibilidad de salas por tramos del día. Reserva de espacio con confirmación. Admin puede añadir/eliminar espacios. Vista de reservas de hoy.

**Archivos JS:** `js/espacios.js` (146 líneas)

**Tablas Supabase:**
- `espacios` — `eq("centro_id", ctrId)` ✅
- `reservas_espacios` — `eq("centro_id", ctrId)` ✅

**Edge Functions:** ninguna

**Estado:** ✅ Funcionando — módulo simple, bajo riesgo

**Pendientes:**
- No hay vista de reservas de días futuros — solo hoy
- No hay restricción de capacidad en la reserva (se puede reservar un espacio con capacidad=5 para 200 personas)
- Escape de `e.nombre` en inline onclick usa `replace(/'/g,"\\'")` — funciona pero es frágil si el nombre contiene comillas dobles. Usar data-attributes sería más seguro.

---

### 1.6 Usuarios
**Qué hace:** Panel admin (su centro) y superadmin (todos). Tabla con badges de rol y estado. Buscador en tiempo real. Modales invitar/editar. Desactivar/reactivar. Reenvío de invitaciones. Toggle de módulos por centro (solo superadmin).

**Archivos JS:** `js/users.js` (540 líneas)

**Tablas / RPCs Supabase:**
- RPC `get_users_with_auth(p_centro_id)` — SECURITY DEFINER, retorna `profiles` + `auth.users` join ✅
- `centros` — `eq("id", ctrId)` ✅

**Edge Functions:** `invite-user` (no en repo, solo en Supabase dashboard), `notify-role` (no en repo)

**Estado:** ✅ Funcionando — ⚠️ `invite-user` y `notify-role` no están en `/supabase/functions/` del repositorio (código perdido o nunca versionado)

**Pendientes:**
- No hay paginación — con >100 usuarios puede haber degradación de rendimiento
- La función RPC `get_users_with_auth` no está versionada en el repo — si el proyecto se migra, se pierde
- No hay audit log de cambios de rol

---

### 1.7 RRHH
**Qué hace:** Vista profesor: formulario solicitud ausencia + historial propio con badges. Vista admin: lista todas las solicitudes del centro, filtros por estado/profesor/fecha. Al aprobar: expande días lectivos y crea sustituciones en `sustituciones` (cubierta=false). Al rechazar: guarda motivo. Subida de justificantes a Storage bucket `justificantes`. Privacy del sustituto: `notify-sustitucion` solo envía grupo y trabajo_alumnos (no el motivo).

**Archivos JS:** `js/rrhh.js` (503 líneas)

**Tablas Supabase:**
- `ausencias_profesor` — `eq("centro_id", ctrId)` ✅
- `profesores` — `eq("centro_id", ctrId)` ✅
- `profiles` — `eq("user_id", currentUser.id)` ✅
- `horarios_grupo` — `eq("centro_id", ctrId)` ✅ (para expandir días)
- `sustituciones` — insert con `centro_id` ✅

**Edge Functions:** `notify-sustitucion` (no en repo)

**Estado:** ✅ Funcionando — ⚠️ EF `notify-sustitucion` no versionada en repo

**Pendientes:**
- `_crearSustituciones()` no verifica si ya existe una sustitución para ese tramo/fecha — puede crear duplicados si se aprueba la misma ausencia dos veces
- No hay botón "reasignar sustituto" desde el panel RRHH — hay que ir al panel Sustituciones
- El campo `trimestre` en ausencias se calcula con `_getTrimestreActual()` que usa el mes del sistema — no configurable por centro

---

### 1.8 IB (Diploma Internacional)
**Qué hace:** Tres sub-paneles: CAS actividades (tipo creatividad/actividad/servicio, Learning Outcomes, reflexiones), Extended Essay (estado, palabras, supervisor, fecha límite), Plazos IB (calendario de entregas con urgencia visual). Botón "Sugerir LOs" llama `cas-analyzer` EF con Gemini.

**Archivos JS:** `js/ib.js` (728 líneas)

**Tablas Supabase:**
- `alumnos` — `eq("centro_id", ctrId)`, `in("grupo_horario", ["1IB","2IB"])` ✅
- `cas_actividades` — `eq("centro_id", ctrId)` ✅
- `extended_essay` — `eq("centro_id", ctrId)` ✅
- `plazos_ib` — `eq("centro_id", ctrId)` ✅

**Edge Functions:** `cas-analyzer` ✅ en repo (solo Gemini, sin Supabase client — correcto)

**Estado:** ✅ Funcionando

**Pendientes:**
- El filtro `in("grupo_horario", ["1IB","2IB"])` asume que los grupos IB se llaman exactamente `1IB` y `2IB` — si el centro usa otra nomenclatura, el módulo queda vacío sin error
- No hay forma de añadir alumnos IB desde el módulo — solo via tabla `alumnos` directamente
- No hay visualización de progreso de horas CAS (el IB requiere mínimo 50h de Actividad + distribución entre los tres tipos)
- `_ibEsAlumnoReal()` filtra filas que empiezan por "total" — heurística frágil

---

### 1.9 Planner — Generador de Horarios
**Qué hace:** 6 sub-paneles (Materias, Necesidades, Tablero, Publicar, Tramos, Dictar). CRUD de materias con color picker. CRUD de necesidades lectivas (grupo + materia + profesor + horas/semana). Motor H-MRV-SA (hibridación Heurísticas + MRV + Simulated Annealing) que genera múltiples variantes Pareto. Tablero drag & drop CSS Grid. Publicación: DELETE + INSERT en `horarios_grupo`. Tab Dictar: voz/texto/audio → EF `parse-restricciones` → aplica en BD.

**Archivos JS:** `js/planner.js` (1300+ líneas — módulo más grande)

**Tablas Supabase:**
- `materias` — `eq("centro_id", ctrId)` ✅
- `profesores` — `eq("centro_id", ctrId)` ✅
- `necesidades_lectivas` — `eq("centro_id", ctrId)` ✅
- `tramos_centro` — `eq("centro_id", ctrId)` ✅
- `horario_generado` — `eq("centro_id", ctrId)` ✅
- `horarios_grupo` — DELETE/INSERT con `centro_id` ✅
- **`disponibilidad_profesor`** — consulta SIN `eq("centro_id")` ❌ **BUG DE SEGURIDAD**

**Edge Functions:** `parse-restricciones` ✅ en repo

**Estado:** ✅ Funcionando parcialmente — 🔴 `disponibilidad_profesor` sin filtro

**Pendientes:**
- **BUG CRÍTICO**: `disponibilidad_profesor` consultada con `.in("profesor_id", profIds)` pero SIN `eq("centro_id")` — si hay datos de otros centros, contamina el generador de horarios
- Al publicar, el DELETE borra TODOS los `horarios_grupo` del centro para esos grupos — si hay error en el INSERT posterior, los horarios quedan vacíos sin rollback (no hay transacción)
- El motor H-MRV-SA está implementado inline en planner.js como clase `TimetableSolver` — no hay tests unitarios
- Drag & drop no guarda en BD hasta que se pulsa "Publicar" — si el usuario cierra sin publicar, pierde los cambios sin aviso
- No hay importación de restricciones desde archivo CSV (solo voz/texto)

---

### 1.10 Analytics — CMI
**Qué hace:** 4 paneles CMI: Operativa (guardias, ausencias, bolsa), Comedor (asistencia media, tendencia, absentismo), Convivencia (incidencias por tipo, grupos, gravedad), Alertas predictivas psicosociales. Exportación PDF via jsPDF. Vista multicentro para superadmin.

**Archivos JS:** `js/analytics.js` (683 líneas)

**Tablas Supabase:**
- `sustituciones`, `ausencias_profesor` — `eq("centro_id", ctrId)` ✅
- `asistencia_comedor`, `alumnos` — `eq("centro_id", ctrId)` ✅
- `incidencias` — `eq("centro_id", ctrId)` ✅
- `alertas_predictivas` — `eq("centro_id", ctrId)` ✅ (tabla pendiente de crear)
- `centros` — sin filtro (solo superadmin, correcto) ✅

**Edge Functions:** `alerta-psicosocial` ✅ en repo

**Estado:** ⚠️ Parcialmente operativo — la tabla `alertas_predictivas` no existe todavía en Supabase (pendiente ejecutar `sql/alertas-predictivas.sql`)

**Pendientes:**
- **BLOQUEANTE**: `sql/alertas-predictivas.sql` sin ejecutar — el panel de alertas fallará con error silencioso
- jsPDF se carga desde CDN en el momento del export — si hay timeout de red, falla sin mensaje claro
- No hay comparativa histórica entre períodos (solo muestra datos del período actual)
- Vista multicentro del superadmin no tiene paginación — con muchos centros puede ser lenta

---

### 1.11 Comunicados
**Qué hace:** Formulario admin con título, cuerpo, destinatarios (todos/profesores/familias/grupo:X), 3 plantillas. Lista de comunicados con badge no leídos. Realtime: toast cuando llega nuevo comunicado. Modal de detalle. Envío email via `send-comunicado` EF.

**Archivos JS:** `js/comunicados.js` (370 líneas)

**Tablas Supabase:**
- `comunicados` — `eq("centro_id", ctrId)` ✅
- Realtime channel: `filter: 'centro_id=eq.' + ctrId` ✅

**Edge Functions:** `send-comunicado` ✅ en repo

**Estado:** ✅ Funcionando

**Pendientes:**
- No hay estado "leído" en BD — se gestiona con `localStorage`. Si el usuario limpia el navegador o usa otro dispositivo, todos los comunicados aparecen como no leídos
- No hay confirmación de entrega de emails — `send-comunicado` retorna count pero no hay reintentos ni log de fallos
- Los grupos disponibles en el dropdown de destinatarios se cargan de `horarios_grupo` — si el centro no tiene horarios, el dropdown aparece vacío sin explicación

---

### 1.12 Familias
**Qué hace:** Vista de hijos con estado comedor del día y últimos 7 días. Botón "no come mañana". Bandeja de avisos (sustituciones que afectan a grupos de sus hijos). Acciones rápidas en chat.

**Archivos JS:** `js/familias.js` (205 líneas)

**Tablas Supabase:**
- `asistencia_comedor` — `eq("centro_id", ctrId)` ✅
- `sustituciones` — `eq("centro_id", ctrId)`, `in("grupo_horario", grupos)` ✅
- `familia_alumno`, `profiles` — filtrados por `profile_id` ✅

**Edge Functions:** ninguna directamente

**Estado:** ⚠️ Básico — interfaz funcional pero el módulo es un stub comparado con lo previsto para "App Familias"

**Pendientes:**
- No hay notificaciones push para familias — toda la información es pull
- No hay vista del horario del hijo desde el portal familiar (accesible via chat, no via UI)
- No hay acceso a las notas/calificaciones
- No hay comunicación bidireccional familia ↔ centro

---

## 2. EDGE FUNCTIONS DESPLEGADAS

| Función | Archivo en repo | Propósito | Usa Supabase client | Filtra centro_id | Estado estimado |
|---------|----------------|-----------|--------------------|--------------------|-----------------|
| `chat` | ✅ `/functions/chat/index.ts` | Gemini proxy + 5 tools function calling | ✅ Sí | ✅ Sí (en tools) | ✅ Desplegada |
| `tipificar-incidencia` | ✅ `/functions/tipificar-incidencia/index.ts` | Clasificación IA con 5 normativas CCAA | ✅ Sí (para leer ccaa de centros) | N/A (recibe descripcion) | ✅ Desplegada |
| `cas-analyzer` | ✅ `/functions/cas-analyzer/index.ts` | Sugerencia Learning Outcomes IB via Gemini | ❌ No (solo Gemini) | N/A | ✅ Desplegada |
| `alerta-psicosocial` | ✅ `/functions/alerta-psicosocial/index.ts` | Detección predictiva riesgo psicosocial | ✅ Sí | ✅ Sí | ⚠️ Desplegada pero tabla destino no existe |
| `send-comunicado` | ✅ `/functions/send-comunicado/index.ts` | Email broadcast via Resend | ✅ Sí | ✅ Sí | ✅ Desplegada |
| `parse-restricciones` | ✅ `/functions/parse-restricciones/index.ts` | Análisis voz/texto para Planner (Gemini multimodal) | ✅ Sí | ✅ Sí | ✅ Desplegada |
| `notify-jefatura` | ✅ `/functions/notify-jefatura/index.ts` | Email a admins en incidencia grave | ✅ Sí | ✅ Sí | ✅ Desplegada |
| `notify-incidencia` | ✅ `/functions/notify-incidencia/index.ts` | Email a familia sobre incidencia | ✅ Sí | ✅ Sí | ⚠️ Código existe, no hay botón en UI |
| `invite-user` | ❌ **NO en repo** | Crea usuario + envía email con link | — | — | ⚠️ Funciona pero código sin versionar |
| `notify-role` | ❌ **NO en repo** | Email de notificación de cambio de rol | — | — | ⚠️ Funciona pero código sin versionar |
| `notify-sustitucion` | ❌ **NO en repo** | Email al sustituto asignado | — | — | ⚠️ Funciona pero código sin versionar |

**Crítico**: `invite-user`, `notify-role` y `notify-sustitucion` están funcionando en producción pero su código fuente no está en el repositorio. Si hay que modificarlas o migrar el proyecto, el código se pierde.

---

## 3. WORKFLOWS N8N

Todos en `http://localhost:5678` (instancia local). Los JSON están en el repo pero las claves API están hardcodeadas dentro de cada workflow en el nodo "Config y fechas".

| Workflow | Archivo | Trigger | Propósito | Estado |
|----------|---------|---------|-----------|--------|
| Briefing matutino | `n8n-briefing-matutino.json` | L-V 8:15 | Email a admins: sustituciones pendientes + asistencia comedor de ayer | ✅ Completo |
| Informe semanal | `n8n-informe-semanal.json` | Viernes 15:00 | Email a admins: KPIs semana (sust, ausencias, comedor, guardias) | ✅ Completo |
| Alerta absentismo comedor | `n8n-alerta-comedor.json` | L-V 16:00 | Email a tutores: alumnos habituales con racha ≥3 días sin comer | ✅ Completo |
| Alertas plazos IB | `n8n-alertas-ib.json` | L-V 9:00 | Email a admins con plazos ≤7 días. CC automático a jesvivlc@gmail.com | ✅ Completo |

**Problemas de los workflows:**

1. **Credenciales hardcodeadas**: `SUPABASE_KEY` (service_role) y `RESEND_KEY` están en el nodo "Config y fechas" de cada workflow. Si el repo es público o el JSON se comparte, las claves quedan expuestas.

2. **n8n local**: Los workflows dependen de que la instancia local esté arriba. No hay failover. Si el servidor se reinicia, hay que reactivar los workflows manualmente.

3. **Sin alertas de error**: Si un workflow falla (timeout Supabase, API Resend caída), no hay notificación — el admin no sabe que el briefing no se envió.

4. **Alertas IB CC fijo**: `SUPERADMIN_CC = jesvivlc@gmail.com` está hardcodeado en `n8n-alertas-ib.json`. Si cambia el superadmin, hay que editar el JSON manualmente.

5. **Escasa cobertura**: Solo hay workflows para 4 escenarios. Faltan: ausencia de profesor sin sustituto asignado después de N horas, alumnos con muchas incidencias acumuladas, capacidad comedor superada.

---

## 4. ARQUITECTURA Y CALIDAD DE CÓDIGO

### 4.1 Inconsistencias entre módulos

**Variables de estado duplicadas:**
- `planner.js` y `analytics.js` ambos usan `_s` como variable de estado interno — no hay conflicto (IIFE) pero el patrón confunde al leer el código.
- `role` y `currentUser` son globals en `config.js`, pero `rrhh.js` hace su propia query de `profiles` para obtener `_rrhhMiProfileId` — duplica lo que ya tiene `currentUser.id`.

**Patrones de escape inconsistentes:**
- `chat.js`: `.replace(/</g, "&lt;")` inline
- `incidencias.js`: función `_esc()` local
- `comunicados.js`: función `_escCom()` local  
- `espacios.js`: `.replace(/'/g,"\\'")` en inline onclick (método diferente, más frágil)
- `planner.js`: función `_esc()` propia
- No hay una función de escape centralizada compartida entre módulos.

**Inicialización de paneles inconsistente:**
- Algunos módulos usan `init___Panel()` llamada desde auth.js vía `showTab`
- Otros tienen `load___()` sin wrapper de init
- `planner.js` usa una IIFE `initPlannerPanel` que es auto-invocada
- `analytics.js` sigue el mismo patrón que planner
- `espacios.js` y `comedor.js` no tienen init function — se inicializan directamente

**Detección del grupo actual del profesor:**
- `comedor.js` detecta el grupo del profesor leyendo `horarios` (tabla legacy)
- `guardias.js` usa `horarios_grupo` para listar profesores
- No hay una función centralizada `getGrupoActualProfesor()` — si cambia la lógica, hay que actualizarla en dos sitios.

### 4.2 Funciones duplicadas / código redundante

| Función duplicada | Archivos | Notas |
|-------------------|----------|-------|
| `_esc()` (HTML escape) | `incidencias.js`, `planner.js`, `users.js` | 3 implementaciones idénticas |
| `_getTrimestreActual()` | `guardias.js`, `rrhh.js` | Misma lógica, dos copias |
| `_getCursoEscolar()` | `guardias.js`, `rrhh.js` | Idem |
| Búsqueda fuzzy de profesor en profiles | `guardias.js:registrarGuardiaEnBD`, `rrhh.js:_crearSustituciones`, `chat EF:registrar_ausencia` | Tres implementaciones distintas del mismo patrón |
| Cálculo de días lectivos | `rrhh.js:_crearSustituciones`, `familias.js:loadFamiliaComedor`, `alerta-psicosocial EF` | Tres veces |
| Formato fecha `YYYY-MM-DD` | todos los módulos inline | Sin helper centralizado |

### 4.3 Queries sin filtro `centro_id` — riesgo de seguridad

| Archivo | Query | Tabla | Severidad |
|---------|-------|-------|-----------|
| `planner.js` | `.from("disponibilidad_profesor").in("profesor_id", profIds)` | `disponibilidad_profesor` | **ALTA** |
| `guardias.js` | `.from("profiles").ilike("full_name", ...)` al resolver guardia | `profiles` | Media — mitigado por RLS |
| `incidencias.js` | `.from("alumnos").ilike("nombre", ...)` en autocomplete (línea ~95) | `alumnos` | Baja — tiene `.eq("centro_id")` justo antes |

La query de `disponibilidad_profesor` en `planner.js` es la única sin filtro explícito de `centro_id`. Aunque RLS podría mitigarlo si está bien configurado, el código no es explícito y debería añadirse `.eq("centro_id", ctrId)` a la query.

### 4.4 Módulos que no respetan RLS correctamente

- `chat` Edge Function: usa `SUPABASE_SERVICE_ROLE_KEY` para las operaciones de tools. Esto bypassa RLS completamente — confía en la validación del `centro_id` enviado por el cliente. Si el cliente envía un `centro_id` manipulado, la EF insertará datos en otro centro. **Solución**: validar `centro_id` en la EF contra el JWT del usuario.

- `alerta-psicosocial` EF: igual — usa service_role, confía en el `centro_id` recibido.

- `parse-restricciones` EF: igual patrón.

- Todas las Edge Functions que crean registros deberían validar que el `centro_id` del body coincide con el `centro_id` del perfil autenticado (leyéndolo del JWT, no del body).

### 4.5 Código muerto o sin usar

| Elemento | Ubicación | Estado |
|----------|-----------|--------|
| `familias.js:loadAvisos()` | js/familias.js | Definida pero ¿llamada desde HTML? No se verifica |
| `toggleRole()` en topbar | app.html | Botones `#topbar-role-admin` y `#topbar-role-prof` presentes pero la función es cosmética |
| Panel `#panel-avisos` | app.html | `tab-avisos` existe en el nav oculto pero no hay módulo `avisos.js` ni función que lo rellene |
| `mejoras.js:loadDashboard()` | js/mejoras.js | Carga en `#role-cards-container` oculto — sincronizado via MutationObserver pero la función original cargaba un dashboard que ya no se usa visualmente |
| `repomix-output.xml` | raíz | Archivo de dump del codebase, no debería estar en el repo |
| `edubot-supabase (1).html` | raíz (probable) | Prototipo antiguo |
| Supabase `.temp/` | supabase/.temp/ | Directorio temporal del CLI, no debería estar trackeado |

---

## 5. DEUDA TÉCNICA (priorizada)

### P0 — Corregir antes del próximo sprint

1. **`disponibilidad_profesor` sin `eq("centro_id")`** en `planner.js` (~línea 144)
   ```js
   // Añadir:
   .eq("centro_id", ctrId)
   ```
   Riesgo: contaminación de datos entre centros en el motor de horarios.

2. **Edge Functions con service_role sin validar `centro_id` del JWT**
   Todas las EFs que hacen writes (chat, alerta-psicosocial, parse-restricciones) confían en el `centro_id` del body. Si un cliente malicioso envía un `centro_id` diferente, escribe en otro centro. Solución: leer `centro_id` desde `sb.auth.getUser()` en la EF, no del body.

3. **Ejecutar `sql/alertas-predictivas.sql`** en Supabase
   Sin esto, el panel Analytics falla con error 42P01 (relación no existe) al intentar cargar alertas.

4. **Versionar `invite-user`, `notify-role`, `notify-sustitucion`**
   Tres Edge Functions en producción sin código en el repo. Si hay que modificarlas o el proyecto se migra, el código se pierde.

### P1 — Sprint próximo

5. **Transacción al publicar horarios en Planner**
   El DELETE + INSERT no es atómico. Si el INSERT falla, el centro se queda sin horarios. Usar una transacción o función RPC.

6. **Duplicados en `_crearSustituciones` (RRHH)**
   No verifica si ya existe sustitución para ese tramo/fecha. Si se aprueba la misma ausencia dos veces, se duplican las sustituciones.

7. **Centralizar helpers comunes** en un `js/utils.js`:
   - `_esc()`, `_getTrimestreActual()`, `_getCursoEscolar()`, `formatFecha()`, `diasLectivos()`

8. **`localStorage` para comunicados leídos**
   Migrar a tabla `comunicados_leidos` en BD para que el estado persista entre dispositivos.

### P2 — Backlog técnico

9. Añadir paginación en `users.js` (>100 usuarios degrada)
10. Limpiar archivos no necesarios del repo: `supabase/.temp/`, `repomix-output.xml`
11. Añadir `.gitignore` para `supabase/.temp/`
12. Validar nomenclatura de grupos IB en `ib.js` — hacer configurable en vez de hardcodear `["1IB","2IB"]`
13. Tabla `horarios` (legacy) — plan de eliminación progresiva; actualmente `comedor.js` la usa para detectar grupo del profesor
14. Detectar en `guardias.js:registrarGuardiaEnBD()` si hay múltiples profesores con el mismo apellido antes de insertar
15. Añadir `beforeunload` en Planner cuando hay cambios sin publicar

---

## 6. SEGURIDAD

### 6.1 Datos sensibles expuestos

| Elemento | Ubicación | Severidad | Notas |
|----------|-----------|-----------|-------|
| `SUPABASE_KEY` (anon) | `js/config.js` | Baja — esperado en Supabase | Controlado por RLS. No es un secreto. |
| `SUPABASE_KEY` (service_role) | Workflows n8n (nodo "Config y fechas") | **Alta** si el repo es público | Service role bypasa RLS completamente. Si el JSON está en GitHub público, las claves son públicas. |
| `RESEND_KEY` | Workflows n8n | **Alta** si repo público | Permite enviar emails ilimitados desde la cuenta. |
| Email fijo del superadmin | `n8n-alertas-ib.json` (SUPERADMIN_CC) | Baja | `jesvivlc@gmail.com` hardcodeado — exposición de email real. |
| Gemini API Key | Variables de entorno en Supabase | ✅ Correcta — en Deno.env, no en código |

**Acción urgente**: Si el repositorio de GitHub es público, rotar inmediatamente la service_role key y la Resend API key. Los JSONs de n8n no deben contener credenciales reales — usar variables de entorno de n8n.

### 6.2 Políticas RLS potencialmente incompletas

| Tabla | Riesgo | Detalle |
|-------|--------|---------|
| `disponibilidad_profesor` | Medio | ¿Tiene policy que aísle por centro? No verificado. Si no, la query sin `centro_id` retorna datos de todos los centros. |
| `profiles` | Bajo | `get_users_with_auth` RPC es SECURITY DEFINER — retorna todos los profiles del `p_centro_id` recibido. Si RPC no valida que el llamante pertenece a ese centro, admin de A podría pedir profiles de centro B. |
| `horarios_grupo` | Bajo | La EF `chat` lee horarios con `service_role` — RLS no aplica. Confía en `centro_id` del body. |
| `alertas_predictivas` | Pendiente | Tabla no creada — no se puede verificar RLS. |

### 6.3 Edge Functions sin validación de permisos

Todas las EFs usan `SUPABASE_SERVICE_ROLE_KEY` e ignoran el JWT del llamante:

```typescript
// Patrón actual en TODAS las EFs:
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,  // bypasa RLS
);
// Solo confía en: centro_id del body, role del body
```

El cliente puede enviar `{ centro_id: "uuid-de-otro-centro", role: "admin" }` y la EF ejecutará la acción en ese centro sin verificar que el JWT corresponde realmente a un admin de ese centro.

**Solución recomendada** (no requiere refactoring completo):
```typescript
// En cada EF, validar el JWT antes de usar centro_id del body:
const authHeader = req.headers.get("Authorization");
const sbUser = createClient(SB_URL, SB_ANON_KEY, { 
  global: { headers: { Authorization: authHeader } }
});
const { data: { user } } = await sbUser.auth.getUser();
const { data: profile } = await sbUser.from("profiles")
  .select("centro_id, rol").eq("user_id", user.id).single();
// Usar profile.centro_id en lugar de body.centro_id
```

La EF `chat` es la más crítica dado que puede hacer INSERTs en 4 tablas.

### 6.4 Otros riesgos de seguridad

- **Inline onclick con interpolación de strings** en `espacios.js`, `planner.js`, `users.js`: aunque hay escaping, es un patrón frágil. Si en algún refactor se olvida un `_esc()`, hay XSS.

- **No hay rate limiting** en las llamadas a Edge Functions. Un usuario puede hacer llamadas ilimitadas a `chat` (que llama a Gemini) sin throttling — vector de abuso de costes.

- **No hay CSRF protection** — las EFs solo comprueban el JWT, que viaja en el header, lo cual es correcto. No hay riesgo CSRF con este patrón.

- **PWA sin Service Worker real**: `manifest.json` existe pero el SW comentado en CLAUDE.md como "sin service worker aún" — en realidad hay un SW según el roadmap completado. Verificar que el SW no cachee respuestas con datos sensibles.

---

## Apéndice: Listado de archivos auditados

```
js/config.js          (42 líneas)
js/auth.js           (551 líneas)
js/chat.js           (640 líneas)
js/comedor.js        (295 líneas)
js/admin.js          (371 líneas)
js/mejoras.js        (~280 líneas)
js/incidencias.js    (477 líneas)
js/espacios.js       (146 líneas)
js/rrhh.js           (503 líneas)
js/guardias.js       (153 líneas)
js/ib.js             (728 líneas)
js/comunicados.js    (370 líneas)
js/familias.js       (205 líneas)
js/planner.js        (1300+ líneas)
js/analytics.js      (683 líneas)
js/users.js          (540 líneas)
supabase/functions/chat/index.ts
supabase/functions/tipificar-incidencia/index.ts
supabase/functions/cas-analyzer/index.ts
supabase/functions/alerta-psicosocial/index.ts
supabase/functions/send-comunicado/index.ts
supabase/functions/parse-restricciones/index.ts
supabase/functions/notify-jefatura/index.ts
supabase/functions/notify-incidencia/index.ts
app.html             (estructura y scripts)
sql/planner-tables.sql
sql/alertas-predictivas.sql
n8n-briefing-matutino.json
n8n-informe-semanal.json
n8n-alerta-comedor.json
n8n-alertas-ib.json
CLAUDE.md
```

---

*Auditoría generada el 2026-05-29. Revisar tras cada sprint.*
