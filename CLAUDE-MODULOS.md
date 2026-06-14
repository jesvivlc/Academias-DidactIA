# DidactIA — Módulos implementados y Estado del proyecto

> Referenciado desde CLAUDE.md. Ver también @CLAUDE-TABLAS.md para el esquema de BD.

---

## Módulos implementados

### Chatbot — Agente ejecutor (chat.js + EF chat)
- Contexto inyectado: info_centro, horario del usuario, hijos vinculados
- Resolución directa (sin Gemini) para consultas de horario de alumno/grupo/profesor
- Búsqueda fuzzy de alumnos por nombre con deduplicación por tokens exactos
- Mapa estático de grupos válidos (1ESOA…2BACB, IB)
- Detección de guardias/profesores libres en tiempo real
- Historial conversacional (últimos 10 mensajes) enviado a Gemini
- Control de acceso por rol en el system prompt
- **Búsqueda de profesor tolerante**: `normalizeText()` antes de filtrar stopwords (tildes), prefijos para diminutivos (`Salva` → `Salvador`). `STOPWORDS_PROF` con 50+ términos incluyendo ordinales, términos de sustitución y partículas
- **Contexto entre turnos** (`window._ultimoProfesor`): al encontrar un profesor guarda `{nombre, filas}`. Si el siguiente mensaje no resuelve ningún profesor pero menciona un día/tramo, reutiliza el último profesor encontrado
- **`extractDiaHora` con ordinales**: detecta tramos por nombre ("tercera hora" → `10:40`, "cuarta" → `12:00`, etc.) además de horas numéricas y expresiones "a las X"
- **Flujo sustitución inteligente** (`esConsultaSustitucion`): "sustitución" activa `esConsultaHorario` → busca horario del profesor mencionado → en lugar de mostrarlo, inyecta el horario en `horarioGrupoCtx` → Gemini llama a `crear_sustitucion` con grupo y tramo ya resueltos sin pedir datos manualmente
- **Agente ejecutor** (admin/profesional/superadmin): Gemini function calling con 7 herramientas
  - `crear_sustitucion` — INSERT en `sustituciones` (requiere confirmación)
  - `crear_incidencia` — INSERT en `incidencias` (requiere confirmación)
  - `consultar_profesor_libre` — SELECT en `horarios_grupo` (auto-ejecuta, sin confirmación)
  - `registrar_ausencia_profesor` — INSERT en `ausencias_profesor` estado pendiente (requiere confirmación)
  - `avisar_comedor` — UPSERT `asistencia_comedor` se_queda=false (requiere confirmación)
  - `listar_tramos_centro` — SELECT en `tramos_centro` (auto-ejecuta, sin confirmación)
  - `crear_tramos_centro` — DELETE + INSERT en `tramos_centro` (requiere confirmación); acepta array con numero, hora_inicio, hora_fin, nombre?, es_descanso?
- **Flujo de confirmación**: respuesta `{type:"tool_call"}` → `_showToolCard()` renderiza card con parámetros → usuario confirma/cancela → `window._confirmTool()` envía `confirm_tool/confirm_args/pending_contents` a la EF → resultado final como texto
- `READ_ONLY = Set(["consultar_profesor_libre", "listar_tramos_centro"])` — herramientas de solo lectura se auto-ejecutan sin mostrar card

### Comedor (comedor.js)
- Vista día: lista de asistencia con toggle por alumno, filtros, navegación por fechas
- **Detección contextual para profesional** (`_detectarContextoProfesor`): (1) consulta `tramos_centro` para saber qué tramo está activo ahora (`ahoraMin = hours*60+min`); (2) consulta `horarios_grupo ilike profesor_nombre` para obtener el grupo en ese tramo+día; (3) si hay coincidencia → carga solo alumnos de ese grupo + banner "📍 Mostrando alumnos de [GRUPO] · Tramo N (HH:MM–HH:MM)"; (4) si no hay clase activa (recreo/guardia/fuera de horario) → carga alumnos de TODOS sus grupos con chips de filtro rápido por grupo; (5) admin/superadmin → todos los alumnos del centro sin filtro
- Banner `#comedor-contexto-banner` inyectado por `_renderComedorBanner()`; chip "Ver todos mis grupos" para que el profesor pueda cambiar el filtro manualmente
- `_comedorFiltrarGrupo(g)` / `_comedorVerTodos()`: handlers de los chips
- Vista histórico: últimos 30 días, tabla con totales, botón "Ver" navega al día. Limit 50000 para superar el default de 1000 filas de Supabase
- Exportación a Excel (.xlsx con SheetJS): hoja histórico 30 días + 2ª hoja desglose por grupo
- Variable `comedorFecha` controla qué día se muestra
- `showComedorVista('dia'|'historico')` alterna las dos vistas
- **Crítico:** `toggleAsistencia` usa `comedorFecha` (no `new Date()`) para insertar — editar histórico no corrompe el día actual
- **Crítico:** `comedorData` incluye `grupo_horario` para que el filtro de grupo funcione
- Ya no usa la tabla legacy `horarios` — toda la lógica usa `tramos_centro` + `horarios_grupo`
- **Sistema de alergias/dietas** (`alumnos.alergias`, `alumnos.dieta_especial`, `asistencia_comedor.nota_dia`):
  - `_comedorAlergiasBadges()`: renderiza badges por alumno — rojo "⚠️ ALERGIA: [texto]", naranja "🥗 DIETA: [texto]", azul "📝 [nota_dia]"
  - `_comedorEditarNota(alumnoId)`: modal para editar `nota_dia` del día (UPSERT en `asistencia_comedor`); si no existe registro lo crea
  - `toggleAsistencia`: si el alumno tiene alergia o dieta y se marca como asistente → toast rojo 5s con el aviso (no bloquea el toggle)
  - `_cEsc()`: helper XSS local (no usa el global `_esc` que es de `users.js`)

### Sustituciones (admin.js) — vistas diferenciadas por rol

**Vista admin/superadmin** (`#sust-vista-admin`):
- Registro: profesor ausente, sustituto (selector ordenado por equidad), grupo, tramo, fecha, instrucciones/observaciones
- `initSustPanel()`: auto-detecta tramo por hora del sistema, pre-rellena fecha con hoy
- Al registrar sustitución con sustituto: inserta en `guardias_realizadas` + llama `notify-sustitucion{evento:"asignacion"}` (fire-and-forget)
- Toggle `cubierta`: actualiza BD + llama `notify-sustitucion{evento:"cobertura"}` al marcar cubierta
- Columnas tabla: Fecha, Tramo, Grupo, Ausente, Sustituto, Instrucciones, **Justificante** (📎 Ver / —), Estado, ✕
- Filtros "Hoy / Esta semana / Todo", contador tab (solo sin cubrir), exportación Excel, eliminación

**Vista profesional** (`#sust-vista-profesor`) — formulario unificado ausencia:
- Campos: Fecha inicio, Fecha fin (multi-día → oculta selector tramos), Motivo (6 tipos RRHH), Grupos, Tramos (multi-checkbox desde `tramos_centro`), Instrucciones para sustituto, Justificante (file input opcional)
- `_sustFechaFinChange()`: si fin > inicio → oculta `#notif-tipo-wrap` y fuerza "todo el día"
- `notificarAusenciaProfesor()` al enviar: (1) INSERT `ausencias_profesor` → obtiene `ausencia_id`; (2) INSERT `sustituciones` por cada día lectivo del rango (tramos concretos o todo el día); observaciones incluye `§RRHH§{ausencia_id}` para linked join; (3) sube justificante a Storage si se adjuntó; (4) llama `notify-ausencia` consolidado (fire-and-forget)
- Historial unificado 7 columnas: Fecha, Tramo, Grupo, Instrucciones, Cobertura (⏳/✓+sustituto), Estado RRHH (tipo+badge pendiente/aprobada/rechazada), Justificante
- Join operativo+administrativo: `_rrhhIdFromObs(obs)` extrae `§RRHH§<uuid>` → batch-fetch `ausencias_profesor`
- Botón "📎 Adjuntar" → `window._subirJustificante(sustId, fecha)`: Storage bucket `documentos` path `justificantes/{ctrId}/{sustId}.{ext}`; append `§JUST§{path}` en `observaciones`
- `window._descargarJustificante(path)`: `createSignedUrl` (1h TTL)

**Helpers en admin.js:**
- `_justPath(obs)` — extrae path de `§JUST§`
- `_rrhhIdFromObs(obs)` — extrae UUID de `§RRHH§`
- `_instrLimpias(obs)` — strip `§JUST§` + `§RRHH§` antes de mostrar instrucciones

**Notificaciones:**
- `registrarSustitucion()` → `.select("id").single()` → `notify-sustitucion{evento:"asignacion"}` si hay sustituto
- `toggleCubierta()` → `notify-sustitucion{evento:"cobertura"}` al marcar cubierta

### Bolsa de guardias con equidad (guardias.js)
- `loadBolsaGuardias()`: ranking de todos los profesores ordenado por nº de guardias del trimestre (menor → mayor)
- Barra de progreso relativa + badge de color: verde (0) · azul (1-3) · amarillo (4-6) · rojo (7+)
- Cuenta desde `sustituciones.profesor_sustituto` del trimestre actual (sin configuración adicional)
- `getGuardiaCountsByName()`: mapa nombre→count usado por `admin.js` para ordenar el selector
- `registrarGuardiaEnBD()`: resuelve `profile_id` con `.ilike("full_name", "%nombre%")` (con wildcards) e inserta en `guardias_realizadas`
- Se carga automáticamente al abrir el tab Sustituciones y se refresca tras cada registro
- Card "Bolsa de guardias" integrada en `panel-sust` (visible junto al formulario)
- `loadBolsaGuardias()`: cuenta `sustituciones.profesor_sustituto` del trimestre actual → ranking menor→mayor
  - Profesores del ranking: todos los que aparecen en `horarios_grupo` + los que ya hicieron guardia ese trimestre
  - Barra de progreso relativa + badge: verde (0) · azul (1-3) · ámbar (4-6) · rojo (7+)
- `getGuardiaCountsByName()`: devuelve mapa `{nombre: count}` usado por `admin.js` para ordenar el selector de sustitutos
- `registrarGuardiaEnBD(nombre, fecha, tramo, grupo)`: resuelve `profile_id` por `ilike(full_name)` e inserta en `guardias_realizadas` con `ausencia_id: null`
- Card "Bolsa de guardias" integrada en `panel-sust`, se recarga al abrir el tab y tras cada registro
- Helpers: `_guardiaTrimActual()`, `_guardiaTrimDates(trim)`, `_guardiaCursoActual()`

### Dashboard por rol (mejoras.js)
- `familia`: hijos con estado comedor del día, próximas reuniones, quick actions
- `profesional`: acceso rápido a horario y sustituciones
- `admin/superadmin`: contadores guardias sin cubrir / profesores ausentes / incidencias
- Búsqueda rápida de alumno con debounce 280ms (solo admin/profesional/superadmin)
- Historial de preguntas recientes en localStorage por usuario
- Input de voz (Web Speech API, es-ES)

### Gestión de usuarios (users.js)
- Accesible a `admin` (solo su centro) y `superadmin` (todos los centros)
- Tabla con badges de rol (azul/verde/naranja/rojo) y estado (activo/inactivo/pendiente)
- Buscador en tiempo real y filtros por rol (pills)
- Contador en cabecera: X profesionales · X familias · X admins
- Modal **Invitar**: nombre, email, rol, centro (admin bloqueado al suyo), vinculación de alumnos para familias
- Modal **Editar**: nombre, rol, alumnos vinculados; llama `notify-role` (vía `${SB_URL}/functions/v1/notify-role`) si cambia rol
- Desactivar/Reactivar (campo `activo` en profiles); login bloqueado si `activo = false`
- Badge "Pendiente" + botón "Reenviar invitación" para usuarios sin `email_confirmed_at`
- **Eliminar** solo disponible para usuarios **pendientes** (sin `email_confirmed_at`) — los confirmados solo se pueden desactivar para evitar huérfanos en `auth.users`
- Seguridad: admin no puede crear superadmins ni cambiar/desactivar su propio perfil
- **Sin toggles de módulos por centro**: todos los módulos (comedor, espacios, incidencias) están **siempre disponibles para todos los centros**. El gating por `centros.modulos_activos` se neutraliza en carga vía `_conModulosBase()` (config.js), que fuerza `MODULOS_BASE = ["comedor","espacios","incidencias"]` en `modulosActivos`. El único módulo que sigue siendo opcional es **IB** (gestión aparte). La pestaña Usuarios solo muestra la lista de centros (solo lectura, `renderModulosLista`) + botón "Nuevo centro"; el wizard crea el centro con los módulos base ya activos

### Administración (admin.js)
- Editor de `info_centro` (10 campos, con visibilidad por rol)
- Visor de horarios en tabla
- Estadísticas: nº configs, nº entradas de horario

### RRHH — gestión de ausencias (rrhh.js)
- Tab `👔 RRHH` visible para `profesional`, `admin` y `superadmin`
- **Vista profesor** (`_renderRrhhProfesor`): **simplificada** — ya NO tiene formulario de creación. Muestra banner "Notifica tus ausencias desde la pestaña Sustituciones" + historial administrativo readonly de `ausencias_profesor` (estado aprobación). El formulario de creación está en la vista unificada del tab Sustituciones (ver sección Sustituciones)
- **Vista admin/jefatura** (`_renderRrhhAdmin`): lista todas las solicitudes del centro; filtros por estado (pills), profesor y fecha; botones Aprobar/Rechazar
- `aprobarAusencia(id)`: guard anti-duplicado → marca `estado=aprobada` → llama `_crearSustituciones(ausencia, nombreProf)`
  - `_crearSustituciones`: expande rango de fechas a días lectivos, consulta `horarios_grupo ilike profesor_nombre`, inserta una fila en `sustituciones` por cada tramo (`cubierta=false`, `profesor_sustituto=null`, `observaciones` = tipo de ausencia **sin el motivo** para preservar privacidad)
  - Nombre del profesor: busca primero en `profesores` (por `profile_id`), luego en `profiles.full_name`
- `rechazarAusencia(id)`: prompt motivo → `estado=rechazada, motivo_rechazo`
- Badges: ⏳ pendiente · ✓ aprobada · ✕ rechazada
- Helpers: `_getCursoEscolar()`, `_getTrimestreActual()` — usados también desde `admin.js` (globales)
- **IMPORTANTE:** `ausencias_profesor` NO tiene columnas `trabajo_alumnos` ni `justificante_url` — el CLAUDE.md anterior estaba incorrecto. Las instrucciones van en `sustituciones.observaciones`; los justificantes en Storage con path `justificantes/{ctrId}/{sustId}.{ext}` marcados via `§JUST§` en observaciones

### Incidencias — vistas diferenciadas por rol (incidencias.js)

**Vista admin/superadmin** (`#inc-vista-admin`):
- **Vistas por rol** (`initIncidenciasPanel` bifurca por `role`): `#inc-vista-profesor` = formulario simplificado (`_incProfesorInit`, `_incLoadAlumnosProfesor`, `registrarIncidenciaProfesor`, `_incLoadMisIncidencias`); `#inc-vista-admin` = panel completo (registro avanzado, tipificación IA, filtros, CSV/Excel, notificación a jefatura)
- Formulario completo: tipo, gravedad, fecha, buscador de alumno (dropdown dinámico), grupo, descripción
- Botón **"✨ Tipificar con IA"** junto al formulario: llama Edge Function `tipificar-incidencia`
- `tipificarIncidenciaIA()`: toma `descripcion` + `centro_id`, invoca la EF, muestra modal con resultado
- Modal de tipificación: badge de gravedad sugerida · tipificación legal con decreto aplicado · lista de medidas · textarea editable del informe borrador · banner rojo PREVI si `protocolo_previ=true`
- `_incUsarTipificacion()`: lee de `_incTipData` (estado de módulo) — pre-rellena `gravedad`, `tipo=convivencia`, inyecta sección de informe en el formulario
- `_incMostrarInformeEnForm(data)`: inserta textarea editable `#inc-informe` tras `#inc-desc` con banner normativa
- `registrarIncidencia()` ampliado: guarda `informe_borrador`, `normativa_ref`, `medidas_propuestas[]`, `protocolo_previ`; llama `_incNotificarJefatura()` para gravedad ≥ grave
- `_incNotificarJefatura(incId, msgEl)`: invoca EF `notify-jefatura`, actualiza mensaje de confirmación con `✉ Jefatura notificada (N)`
- Botones Cerrar / Notificar familia / Eliminar disponibles
- Edge Function `tipificar-incidencia`: 5 normativas CCAA (valenciana/madrid/andalucia/cataluna + estatal fallback), Gemini 2.5 Flash, `temperature: 0.2`, JSON forzado
- Edge Function `notify-jefatura`: email HTML a todos los admins del centro con tabla completa + medidas + informe + banner PREVI

**Vista profesional** (`#inc-vista-profesor`):
- Formulario simplificado: selector alumno (solo alumnos de los grupos del profesor, cargados via `horarios_grupo ilike`), grupo (auto-fill al elegir alumno), fecha, descripción libre
- `_incLoadAlumnosProfesor()`: busca grupos del profesor en `horarios_grupo`, luego `alumnos.in(misGrupos)`
- `registrarIncidenciaProfesor()`: INSERT con `tipo=convivencia, gravedad=leve, estado=abierta`; llama `notify-jefatura` automáticamente (fire-and-forget)
- **Sin** botón tipificar IA, **sin** botón cerrar, **sin** botón eliminar
- Historial propio (solo lectura): 4 columnas (Fecha, Alumno/Grupo, Descripción, Estado badge)
- `_incLoadMisIncidencias()`: filtra por `registrado_por = currentUser.id`

### Comunicados internos (comunicados.js)
- Tab **"📢 Comunicados"** visible para todos los roles (siempre activo, sin módulo gate)
- **Vista admin**: formulario colapsable con título, cuerpo, destinatarios, selector de plantilla
- 3 plantillas predefinidas: Convocatoria reunión · Modificación horario · Recordatorio plazo
- `destinatarios`: todos / solo_profesores / solo_familias / grupo:XXXX (dropdown con grupos reales del centro)
- `enviarComunicado()`: guarda en tabla `comunicados`, llama EF `send-comunicado`, muestra `✅ Enviado a N destinatarios`
- **Vista todos**: lista de comunicados con fecha, destinatarios, badge "No leído" y modal de detalle
- **Badge de no leídos**: `_comUpdateTabBadge()` — localStorage key `com_leidos_{userId}_{ctrId}`, actualiza tab a `📢 Comunicados (N)`
- **Realtime**: `_comInitRealtime()` — suscripción Supabase a INSERT en `comunicados` filtrado por `centro_id`; toast para usuarios que no son el creador
- `_comCheckAndBadge()`: ejecutado 1200ms tras login — fetch solo de IDs (limit 500), actualiza badge, inicia realtime
- EF `send-comunicado`: enruta por `destinatarios`; para `grupo:XXXX` hace join `alumnos→familia_alumno→profiles`; envía un email por destinatario vía Resend
- **Validación:** si `destinatarios = grupo_especifico` y el campo grupo está vacío → bloquea el envío con error visible (no cae silenciosamente a "todos")

### Planner — generador de horarios (planner.js)
- Tab **"Planner"** visible solo para `admin` y `superadmin`; `#tab-planner` y `#nav-planner` sincronizados en `updateBentoDashboard()` para que aparezca en el drawer Más móvil
- **6 sub-paneles** (pill tabs): Materias · Necesidades · Tablero · Publicar · Tramos · Dictar
- **Materias (CRUD)**: formulario inline con nombre + color picker; lista con dot de color, actualización de color y borrado
- **Necesidades lectivas (CRUD)**: grupo horario + materia + profesor + horas/semana; tabla resumen con borrado por fila
- **Motor CSP backtracking** (`_generarHorario`):
  - Expande necesidades en sesiones individuales, ordena más-restringidas primero (más horas → antes)
  - Construye `teacherBusy` desde horarios de otros grupos ya generados (cross-group conflict prevention)
  - `_resolverCSP_V2()` recursivo: itera DIAS × TRAMOS (solo tramos de clase, `_tramoNums()` excluye descansos); coloca, recursa, deshace si falla (backtracking clásico)
  - `_esHardValido()` — hard constraints universales (todas las CCAA), validados en **cada paso** del backtracking, no solo en el resultado final:
    - **HC-1**: slot ya ocupado para el grupo
    - **HC-MATERIA-DIA**: la misma materia no puede aparecer más de una vez el mismo día para el mismo grupo
    - **HC-VENTANA**: máximo 8 tramos lectivos por día y grupo (los descansos no cuentan)
    - **HC-INICIO-FIN**: sin huecos libres en mitad de la jornada — las clases del grupo deben ser consecutivas dentro de los tramos lectivos (índices ocupados en `TNUMS` deben formar bloque contiguo; recreo/comida no rompen continuidad)
    - **HC-3**: disponibilidad del profesor + ocupación en otros grupos (cross-group)
  - `_scoreSoft()` — soft constraints neuroeducativos (carga cognitiva, dinámica, horas extremas); ordena candidatos por puntuación
  - **Modo "sin profesores"** (`_s.sinProf`, botón "🧩 Generar sin profesores" → `plannerGenerarSinProf`): el CSP coloca solo las materias omitiendo HC-3 (disponibilidad/ocupación de profesor); los slots quedan con `profesor_id: null` y `sin_asignar: true`. Genera todos los grupos vía `_generarHorario` (motor CSP backtracking, no el worker H-MRV-SA) y persiste en `horario_generado` para que el chat pueda asignar después. Los docentes se asignan luego en el Tablero (clic/drag) o por chat.
  - Si no hay solución → devuelve `null` (nunca un horario que viole un hard constraint) → alert informativo con sugerencias
  - **Verificación**: `scripts/verify-hard-constraints.js` carga el `planner.js` real en un VM de Node y comprueba los 3 invariantes sobre un horario estilo IES Demo (`node scripts/verify-hard-constraints.js`)
- **Tablero drag & drop**: CSS Grid 6 cols (hora + L/M/X/J/V) × 8 filas (tramos 08:00–16:00); fichas `.class-card` con borde izquierdo de color por materia
  - Drag handlers: `plannerDragStart/End/Over/Leave/Drop/DropPool` + `plannerDragStartAparcado/DescartarAparcado`
  - **Validación de hard constraints al soltar** (`_ejecutarDrop` — núcleo simular-validar-revertir, dryRun para feedback en hover): aplica los mismos HC que `mover_clase` (HC-MATERIA-DIA, HC-VENTANA, HC-INICIO-FIN sin huecos en origen y destino) + ocupación cross-group y disponibilidad del profesor (`_validarDiaGrupo`, `_validarProfesorGlobal`). Si el destino no es válido, la clase vuelve a su sitio con flash rojo + toast explicando el motivo. Soporta intercambio swap validado.
  - **Zona "Aparcados"** (`#planner-pool`, reemplaza la antigua "zona libre"): arrastra una clase aquí para retirarla del horario activo sin eliminarla. Estado en `_s.aparcados = [{grupo, slot}]`, persistido en `localStorage` (`planner_aparcados_{ctrId}`) vía `_loadAparcados`/`_saveAparcados`. Tarjetas con materia/grupo/profesor, arrastrables de vuelta a cualquier hueco libre (solo a su mismo grupo); botón ✕ para descartar definitivamente. Al abrir el Planner con aparcados pendientes, toast de aviso "N clases sin asignar"; `plannerPublicar` también avisa que no se publicarán. NO se escriben en `horario_generado`.
  - `.planner-cell.drag-over` (verde) / `.drag-error` (rojo) feedback visual en tiempo real
  - **Slots sin profesor** (`_slotSinProfesor`): se renderizan con fondo rayado suave y etiqueta "⚠ Sin asignar". Dos formas de asignar docente: ① clic en el slot → modal selector de profesor (`plannerAbrirSelectorProfesor`); ② arrastrar un profesor desde el panel lateral "👥 Profesores" (`_buildProfesoresPanel`, chips `prof-chip` arrastrables, `plannerDragStartProfesor`) hasta el slot. La asignación (`_asignarProfesorSlot`) valida que el profesor no tenga ya clase ese día/tramo en otro grupo ni esté indisponible; actualiza memoria + persiste en `horario_generado` (UPDATE por grupo/dia/tramo).
  - **Verificación**: `scripts/verify-tablero-dnd.js` (14 casos drag&drop) + `scripts/verify-sin-profesor.js` (7 casos: generación sin profesores, todos los slots null, asignación válida, rechazo por conflicto/indisponibilidad)
- **Publicar**: estadísticas (grupos, sesiones, necesidades), selector de **curso escolar** (`<select id="planner-curso-escolar">` con opciones 2025-26 / 2026-27; aviso rojo si coincide con `cursoActivo`), botón que:
  1. DELETE en `horarios_grupo` filtrado por `centro_id` AND `curso_escolar` AND `grupo_horario` (nunca toca otros cursos)
  2. Inserta filas con `curso_escolar`, `hora_inicio`, `hora_fin`, `actividad_nombre`, `profesor_nombre`, `aula: ''`
  3. El chatbot y sustituciones usan el horario del curso activo inmediatamente
- **Tab Dictar**: entrada voz (Web Speech API, es-ES, continuo) + texto + archivo audio (FileReader base64). Llama Edge Function `parse-restricciones`. Panel de resultados con checkboxes por ítem (materias/necesidades/restricciones). Botón "Aplicar" crea registros en Supabase: materias nuevas, necesidades_lectivas, disponibilidad_profesor. Soporte de optativas LOMLOE (agrupa por `bloque_interdisciplinar_id`). Botón "Refinar" recupera preguntas de la IA y limpia el resultado.
- **Motor H-MRV-SA** (`TimetableSolver`): hibridación Heurísticas + MRV (Minimum Remaining Values) + Simulated Annealing. Genera múltiples variantes Pareto (3 Web Workers en paralelo), UI de progreso en tiempo real, diagnóstico de conflictos.
  - **Arquitectura**: resuelve TODOS los grupos simultáneamente en un único solver compartido. `teacherOccupancy: Map<tid,Set<slot>>` impide que el mismo profesor esté en dos grupos al mismo tiempo (restricción global).
  - **Hard constraints en `getValidSlots`**: (1) slot ocupado por el grupo (`groupOccupancy`); (2) profesor ocupado en otro grupo o fuera de su disponibilidad (`teacherOccupancy`); (3) **HC-MATERIA-DIA**: `subjectDayOccupancy Map<groupId_subjectId, Map<dayIdx,count>>` con `maxPerDay = ceil(total_sesiones/5)` — excluye slots del día si esa materia ya alcanzó el máximo para ese grupo.
  - `assignBlock` / `removeBlock`: actualizan las tres estructuras de ocupación. Simulated Annealing (SWAP + RELOCATE) llama `getValidSlots` → los HCs aplican en ambas fases automáticamente.
  - **Fix crítico** (`plannerElegirVariante`): al aplicar una variante Pareto, el slot construido ahora incluye `profesor_id`, `materia_id`, `codocente_prof_ids` y `sin_asignar`. Antes faltaban → `_slotSinProfesor()` devolvía `true` → todas las celdas mostraban "⚠ Sin asignar" aunque el motor los había colocado correctamente.
  - **El profesor viene de `necesidades_lectivas.profesor_id`** (predefinido en la necesidad). El motor no asigna profesores; solo respeta los `teacherIds` del bloque. Gemini no interviene en la generación.
- **Tablas en Supabase**: `materias`, `aulas`, `disponibilidad_profesor`, `necesidades_lectivas`, `horario_generado` — ver `sql/planner-tables.sql`
- **XSS**: `_esc()` en todos los `innerHTML` con datos de usuario
- **`TRAMOS_DEFAULT`**: horas redondas genéricas 8:00–14:30 (T1-T7 + Recreo 11:00-11:30) — **NO** corresponden a ningún centro real. Si `tramos_centro` está vacío para el centro, se muestra banner ámbar `#planner-tramos-warn` con enlace directo a la pestaña Tramos (`_s.usingFallbackTramos = true` en `_loadData()`)
- **IES Buñol** (f91b7c02): no tenía `tramos_centro` → mostraba los de Agora Lledó. Fix: TRAMOS_DEFAULT genérico + banner. El centro debe configurar sus tramos reales desde la pestaña Tramos
- **Agora Lledó tramos 26-27**: cargados vía Management API — 10 filas (8 lectivos + Recreo 11:20–11:50 + Comida 14:20–15:20). Tramos lectivos: 08:50–09:40, 09:40–10:30, 10:30–11:20, 11:50–12:40, 12:40–13:30, 13:30–14:20, 15:20–16:10, 16:10–17:00.
- **`scripts/importar_cargas_eso.mjs`**: importa `data/Cargas_ESO_limpia.xlsx` hoja "Cargas ESO" para los 6 grupos 1ºESO+3ºESO → borra necesidades_lectivas del centro, get-or-create materias y profesores por nombre normalizado, crea placeholders `PENDIENTE-<Grupo>-<Materia>` para celdas sin profesor. Resultado: 75 filas, 16 materias distintas, 29 profesores, 0 nulls en materia_id/profesor_id. Uso: `node scripts/importar_cargas_eso.mjs`
- **Soporte multi-curso** (✅ migración aplicada): `horarios_grupo.curso_escolar TEXT NOT NULL DEFAULT '2025-26'` + índice `idx_hg_curso(centro_id, curso_escolar)`; `info_centro.curso_activo TEXT NOT NULL DEFAULT '2025-26'`; global `cursoActivo` en `config.js` actualizado tras login desde `info_centro`; 7 queries en `chat.js` y 4 en `admin.js` filtran por `curso_escolar` con fallback `'2025-26'`. Verificado en producción 2026-06-12 (2.733 filas en '2025-26'). DDL: `supabase/migrations/horarios_curso_escolar.sql`

### Análisis — Dashboard CMI + Informes PDF (analytics.js + informes.js)
- **Módulo fusionado** (2026-06-10): un único nav item **"📊 Análisis"** (`#nav-analisis`, grupo Administración) visible para `admin`/`director`/`jefatura`/`superadmin`. `#panel-analisis` con dos pills internas (`analisisTab()` en el script inline de `app.html`):
  - **Dashboard** → `analytics.js` (renderiza en `#analytics-container`, init `initAnalyticsPanel`)
  - **Informes PDF** → `informes.js` (renderiza en `#inf-container`, init `initInformes`)
  - Cada pill hace lazy init del sub-módulo al activarse; la lógica interna de ambos módulos quedó intacta
- (Histórico) Tab **"Analytics"** visible solo para `admin` y `superadmin`
- **CMI tiles**: 6 KPIs en tiempo real — guardias sin cubrir, ausencias activas, incidencias abiertas, comensales hoy, ocupación espacios, usuarios activos
- **Gráficos Chart.js**: línea de tendencia de incidencias (30 días), barras de guardias por profesor (trimestre), dona de distribución de tipos de ausencia
- **Alertas predictivas psicosociales**: análisis automático de patrones anómalos (picos de absentismo, acumulación de incidencias por grupo/alumno, profesor con exceso de guardias). Llama Edge Function `alerta-psicosocial`
- **Edge Function `alerta-psicosocial`**: recibe `{centro_id}`, analiza últimos 30 días de datos de tres tablas, devuelve array de alertas con `nivel` y descripción. Persiste en `alertas_predictivas`
- **Tabla `alertas_predictivas`** (✅ ya en producción): `id, centro_id, alumno_id, tipo (DEFAULT 'riesgo_abandono'), nivel (DEFAULT 'medio'), descripcion, condicion_a/b/c (bool), resuelta (bool), created_at`. RLS `centro_isolation` + índice `idx_alertas_centro_activas(centro_id, resuelta, created_at DESC)`. DDL: `sql/alertas-predictivas.sql`

### Salidas Didácticas (salidas.js)
- Tab **"🚌 Salidas"** visible para todos los roles; `#panel-salidas` renderizado completamente dinámico (sin HTML estático)
- **Vista lista** (`initSalidasPanel`): genera el shell HTML + tabla + modal en el panel; filtros por estado/mes/grupo; familia solo ve salidas `publicada`
- **Vista detalle** (`salidasAbrirDetalle(id)`): reemplaza el panel completo; "← Volver" llama `initSalidasPanel()`
  - **Header**: título, fecha+hora, grupos (chips), responsable, coste, badge de estado, botón cambiar estado, botón Excel
  - **Tab Dashboard**: 5 contadores (total/autorizados/pagados/picnic/alergias) con barras de progreso; tabla interactiva con checkboxes `autorizado`/`pagado`/`necesita_picnic` (admin/profesional); botón "✨ Generar circular para familias" (Gemini vía EF `chat`)
  - **Tab Cocina**: banner RGPD; resumen agregado sin nombres; tabla alergenos por keyword (15 alergenos + catch-all); tabla de dietas (nombres permitidos para cocina); PDF jsPDF; registra en `notificaciones_salida` tipo='cocina'
  - **Tab Autobús**: formulario editable (empresa/matrícula/teléfono/plazas/notas) → UPDATE `datos_autobus` jsonb; lista de embarque con checkboxes → localStorage key `checkin-{salidaId}`; alerta si alumno no autorizado
  - **Tab Administración**: resumen económico (esperado/cobrado/pendiente); lista pagos pendientes con "Marcar pagado" individual y bulk; cambio de estado (publicar/cerrar/cancelar); al publicar → push a familias de los alumnos participantes vía EF `send-push`; log de `notificaciones_salida`
  - **Vista familia** (role='familia'): reemplaza tabs con vista de autorización por hijo; consulta `familia_alumno` para filtrar participantes; formulario: autorizado, picnic, alergias_confirmadas; al guardar → push al responsable vía EF `send-push`
- **Excel 3 hojas** (`_salExportarDetalle`): Participantes (7 cols) · Cocina (resumen + tabla dietas) · Económico (KPIs + detalle por alumno)
- **Tablas**: `salidas_didacticas`, `participantes_salida`, `notificaciones_salida` (ver `supabase/migrations/salidas_didacticas.sql`, ejecutado en producción)
- **`_salidasAlumnosPorGrupo`**: cache grupo→[alumno_ids] construida en `_salidasCargarGrupos()`, usada en `salGuardar()` para insertar batch de participantes sin query extra

### Calidad — SGC (calidad.js)
- Tab **"⭐ Calidad"** visible para `admin`, `director`, `jefatura`, `superadmin`; `#panel-calidad` con contenedor `#calidad-cont` (IMPORTANTE: no usar `cal-container` — ese ID es de `panel-calificaciones`)
- **Dashboard** (`_calRenderDashboard`): 5 métricas KPI (NCs abiertas, NCs críticas, quejas pendientes, documentos este mes, CAPA vencidas) + semáforo visual; 3 botones de sección; 3 listas resumen (últimas NCs, quejas sin responder, CAPA próximas a vencer 7 días)
- **No Conformidades** (`_calRenderNC`): lista con filtros estado/prioridad/categoría; NC ID formato `NC-{año}-{6HEX}` (derivado de `created_at` + `id.slice(0,6).toUpperCase()`); ordenado por prioridad desc → fecha desc; contador "X abiertas · Y críticas"
  - Modal nueva NC: categoría, prioridad, descripción + botón voz (`_calIniciarVoz` → `SpeechRecognition` con `try/catch`) + análisis IA en `onblur` (`_calNcAnalizarIA` → actualiza selectores + nota "💡 Sugerido por IA")
  - Detalle NC: cambio de estado (botones inline), "✨ Analizar con IA" (5 Porqués + plan correctivo + prevención con Gemini), sección CAPA inline
  - CAPA (`_calCapaNueva`/`_calCapaGuardar`): modal con causa raíz, plan, responsable (selector desde `profiles`), fechas objetivo/verificación; botones "✓ Eficaz" / "✗ No eficaz" (`_calCapaEficacia`); banner "🔒 Cerrar NC" cuando todas las CAPA son eficaces
- **Feedback Familias** (`_calRenderFeedback`): lista con filtros estado/sentimiento (positivo/neutro/negativo por rango `sentimiento_ia`); emoji de sentimiento (`😊`/`😐`/`😤`); contador "X pendientes"
  - Modal nuevo feedback: canal, alumno (opcional, selector desde `alumnos`), texto libre
  - Tras INSERT → análisis IA **asíncrono no bloqueante**: `_calGemini` → UPDATE `categoria_ia`, `sentimiento_ia`, `resumen_ia`, `requiere_accion`
  - Detalle: texto completo, grid análisis IA (categoría/sentimiento/resumen), email de contacto de familia (lazy load desde `profiles`), textarea respuesta, "✨ Generar respuesta" (Gemini), "💾 Guardar y marcar resuelta" (UPDATE `respuesta_borrador` + `estado=resuelto`)
- **Helper `_calGemini(systemPrompt, userMsg)`**: wrapper fetch sobre EF `chat` (usa globals `API`/`ANON_KEY`/`ctrId`/`role`/`currentUserName`/`currentUser`). Devuelve texto o `null`; nunca lanza. Todas las llamadas IA en `try/catch` independiente.
- **Voz `_calIniciarVoz(taId, btnId, onStop)`**: `window.SpeechRecognition || window.webkitSpeechRecognition`, `lang='es-ES'`, modo continuo. `try/catch` completo — si el navegador no soporta reconocimiento muestra toast informativo sin romper el flujo.
- **XSS**: `_calEsc()` en todos los `innerHTML` con datos de usuario (mismo patrón que `_esc()` en planner.js)
- **`_calParseJson(txt)`**: strip ` ```json ``` ` antes de `JSON.parse`
- **Tablas** (✅ ya en producción): `no_conformidades`, `acciones_capa`, `feedback_familias`, `documentos_calidad`, `plantillas_calidad`, `evaluaciones_platinum` — todas con RLS habilitada y políticas por centro (verificado 2026-06-12). DDL: `sql/calidad-tables.sql`

### Orientación — departamento de orientación (orientacion.js)
- Nav **"🧭 Orientación"** (grupo Centro), visible `orientador`/`jefatura`/`director`/`admin`/`superadmin` (familia solo ve el portal de trámites). Tablas: ver `@CLAUDE-TABLAS.md` (6 de `orientacion_base.sql`). Todas las queries filtran `centro_id`; la IA va vía EF `chat` con `role:"familia"` (texto puro) y **nunca persiste sin acción manual del orientador**.
- **Lista de expedientes** (`initOrientacion`/`loadExpedientes`): tabla con alumno (JOIN `alumnos`), grupo, medida más grave activa (ACS>ACNS>NEE>NEAE>PECAI>otro), nivel de riesgo (última alerta activa), estado; filtros estado/riesgo/medida; contador "X activos · Y alertas sin resolver"; export XLSX; modal "Nuevo expediente" (autocomplete alumnos sin expediente + orientador).
- **Expediente individual** (`oriAbrirExpediente`, 4 pestañas):
  - **Resumen**: ficha (alumno/grupo/tutor/orientador/apertura/estado con archivar) + medidas activas (+añadir/desactivar) + alertas activas (marcar resuelta) + trámites en curso (+añadir).
  - **Informes**: lista con badges; Ver/Editar (Guardar borrador / Validar informe; **`texto_final` nunca se sobreescribe si `firmado`** → solo lectura); **"✨ Generar borrador con IA"** (LOMLOE, vuelca sin guardar); Nuevo informe; **Exportar PDF** (jsPDF, cabecera logo+color).
  - **Adaptaciones**: medidas detalladas + cuestionarios docentes (Enviar / Rellenar 4 preguntas fijas→jsonb / Ver respuestas) + **"✨ Sintetizar observaciones docentes"** (≥2 completados → modal editable → crear informe `dictamen`).
  - **Trámites**: lista con filtro por tipo, Editar (modal prellenado), badge "Visible para familia".
- **Panel de riesgo** (`oriPanelRiesgo`): alertas activas del centro ordenadas por nivel+fecha (Ver/Crear expediente, Marcar resuelta); "+ Generar alerta manual"; **"✨ Detectar riesgos automáticamente"** (asistencia_comedor + sustituciones 30d → Gemini JSON → preview con checkboxes → INSERT solo confirmados).
- **Exportación RGPD** (`oriExportarExpedienteCompleto`, role-gated admin/director/jefatura/superadmin): **un PDF** (jsPDF+autotable) con portada (logo+color, nota legal Art. 15 RGPD/LOPDGDD), 5 secciones (medidas, informes con texto completo, observaciones docentes, trámites, alertas), pie con nº de página y nota de cierre.
- **Estadísticas** (`oriEstadisticas`): 6 bloques (4 tarjetas, barras por medida, línea de alertas 6m por nivel, donut estado de informes, top-10 cuestionarios pendientes, trámites por estado) con Chart.js; export **PDF** (tablas) y **Excel** (6 hojas).
- **Notificaciones push** (helper `_oriPush` → EF `send-push`, silencioso/no bloqueante): cuestionario completado→orientador; nueva alerta→orientador/jefatura/director/admin; informe validado→director/admin; trámite `visible_familia`→familias (`familia_alumno.profile_id`).
- **Portal de familias** (`oriRenderTramitesFamilia`): sección autocontenida inyectada en la home de la familia (MutationObserver, sin tocar otros archivos); muestra trámites de hijos vinculados con `visible_familia=true` — **sin datos clínicos**. Lee vía RPC `familia_tramites_visibles()` (SECURITY DEFINER); `expedientes_orientacion`/`tramites_orientacion` son staff-only por RLS (la familia no las consulta directamente).
- **Responsive** (CSS inyectado una vez, sin tocar `styles.css`): tabla→tarjetas en <768px, pestañas→`<select>`, modales 95%+×, FAB "Nuevo expediente", ellipsis. Toasts verde/rojo reutilizan `_calToast`/`showToast`.

---


> Estado del proyecto (tablas verificadas, storage buckets, RPCs, módulos por rol, orden de scripts): @CLAUDE-TABLAS.md
