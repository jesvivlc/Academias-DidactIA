# Claude Code Instructions

## Task Master AI Instructions

**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

---

# DidactIA — Contexto del proyecto

## Producto

Plataforma educativa SaaS multi-tenant para centros escolares españoles.
URL pública: **didactia.eu**

- `index.html` — landing page pública (presentación comercial)
- `app.html` — aplicación (login, chatbot, módulos operativos)

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JS modular (vanilla, sin frameworks) |
| Backend | Supabase (PostgreSQL, Auth, RLS, Edge Functions) |
| IA | Gemini 2.5 Flash vía Edge Function `chat` |
| Email | Resend (dominio didactia.eu) |
| Deploy | Vercel (frontend) + GitHub (fuente) |
| Automatización | n8n (local, http://localhost:5678) |

## Centros activos

- **IES Buñol** — centro de pruebas, menos crítico
- **Agora Lledó** — centro de producción

---

## Arquitectura multi-tenant

Cada centro tiene `centro_id` único. Toda consulta a Supabase filtra por `centro_id`.

**Roles:**
- `familia` — ve sus hijos vinculados, comedor, chatbot personal
- `profesional` — ve su horario, sustituciones, comedor
- `admin` — gestión completa de su centro
- `superadmin` — acceso global (sin `centro_id`). Cuenta: jesvivlc+admin@gmail.com

**Auth:** JWT con ECC (nunca volver a HMAC). RLS activa en todas las tablas.

---

## Estructura de archivos

```
index.html                      Landing page (Playfair + Geist, Navy/Blue/Amber)
app.html                        Aplicación: login, header, tabs, paneles
css/styles.css          Tokens CSS + estilos globales
js/
  config.js             SB_URL, SB_KEY, variables globales, boot DOMContentLoaded
  auth.js               doLogin, loadUserProfile, showTab, applyTheme, goHome
  chat.js               sendMsg, buildContext, horarios por grupo, Gemini fetch
  comedor.js            loadComedor, toggleAsistencia, histórico 30 días, CSV export
  admin.js              loadAdmin, loadSustituciones, registrarSustitucion, initSustPanel
  mejoras.js            loadDashboard, loadComedorHijos, buscarAlumnoRapido, toggleVoice
  users.js              loadUsersPanel, inviteUser, changeRole, toggleModulo
  incidencias.js        loadIncidencias, registrarIncidencia, tipificarIncidenciaIA, initIncidenciasPanel
  espacios.js           loadEspacios, reservarEspacio
  rrhh.js               loadRrhhPanel, solicitarAusencia, aprobarAusencia, rechazarAusencia
  guardias.js           loadBolsaGuardias, getGuardiaCountsByName, registrarGuardiaEnBD
  ib.js                 loadIbPanel (plazos IB, CAS, Extended Essay)
  comunicados.js        initComunicadosPanel, enviarComunicado, _comCheckAndBadge
  planner.js            initPlannerPanel, _generarHorario (CSP), plannerPublicar, drag & drop tablero
sql/
  planner-tables.sql    DDL: materias, aulas, disponibilidad_profesor, necesidades_lectivas, horario_generado
manifest.json                   PWA manifest (sin service worker aún)
n8n-briefing-matutino.json      Workflow n8n: briefing matutino automático (importar en n8n)
scripts/
  importar_horarios_profes.py   Import CSV de horarios → Supabase
```

---

## Tablas de Supabase

| Tabla | Campos clave | Notas |
|-------|-------------|-------|
| `centros` | id, nombre, modulos_activos[], color_primario, logo_url, ccaa | `ccaa` determina normativa convivencia: 'valenciana'\|'madrid'\|'andalucia'\|'cataluna'\|NULL (estatal) |
| `profiles` | id, user_id, full_name, email, rol, centro_id, activo (bool DEFAULT true), created_at | Extiende auth.users. `id = user_id` (ambos = auth UUID). `activo=false` bloquea el login |
| `info_centro` | centro_id, nombre_config, datos (jsonb), visible_para | Contexto del chatbot |
| `horarios` | centro_id, dia, hora, profesor, actividad | Tabla legacy — chatbot búsqueda por apellido |
| `horarios_grupo` | centro_id, grupo_horario, dia, tramo, hora_inicio, hora_fin, actividad_nombre, profesor_nombre, aula | Tabla principal — lógica horaria directa |
| `alumnos` | centro_id, nombre, curso, grupo_horario | Vinculados vía familia_alumno |
| `familia_alumno` | profile_id, alumno_id | N:M familias↔alumnos |
| `asistencia_comedor` | centro_id, alumno_id, fecha, se_queda, plaza_fija, registrado_por | Una fila por alumno/día |
| `sustituciones` | centro_id, fecha, hora_inicio, hora_fin, tramo, grupo_horario, profesor_ausente, profesor_sustituto, observaciones, cubierta, creado_por | `cubierta` tiene toggle en la tabla. Se auto-genera desde RRHH al aprobar ausencias |
| `profesores` | centro_id, profile_id, nombre, especialidad, departamento, horas_semanales, tipo_jornada, activo | Ficha HR del profesor; `profile_id` opcional (puede no tener cuenta) |
| `ausencias_profesor` | centro_id, profile_id, fecha, fecha_fin, tipo, motivo, estado, aprobada_por, motivo_rechazo, trimestre, curso_escolar, trabajo_alumnos, justificante_url, created_at | Estado: pendiente/aprobada/rechazada; tipo: baja_medica/permiso/asunto_propio/formacion/sindical/otros. `trabajo_alumnos` visible al sustituto; `justificante_url` → Storage bucket `justificantes` |
| `guardias_realizadas` | centro_id, profile_id, ausencia_id, fecha, tramo, grupo_horario, aula, observaciones, trimestre, curso_escolar, created_at | Guardias cubiertas; `ausencia_id` FK → ausencias_profesor |
| `incidencias` | centro_id, fecha, tipo, gravedad, descripcion, alumno_nombre, grupo_horario, registrado_por, estado, informe_borrador, normativa_ref, medidas_propuestas[], protocolo_previ, created_at | Estado: abierta/cerrada; tipo: convivencia/material/instalaciones/otro; gravedad: leve/grave/muy_grave. Campos IA: `normativa_ref` (decreto aplicado), `medidas_propuestas` (text[]), `protocolo_previ` (bool), `informe_borrador` (texto editable antes de guardar) |
| `comunicados` | centro_id, titulo, cuerpo, destinatarios, creado_por, fecha, estado, plantilla, created_at | `destinatarios`: 'todos'/'solo_profesores'/'solo_familias'/'grupo:XXXX'; `estado`: borrador/enviado; `plantilla`: reunion/horario/plazo/null |
| `materias` | centro_id, nombre, color | Materias del Planner; `color` hex para fichas del tablero |
| `aulas` | centro_id, nombre, tipo, capacidad | Aulas reservables en el Planner |
| `disponibilidad_profesor` | profesor_id, dia_semana, tramo_horario, estado | Restricciones de disponibilidad para el CSP |
| `necesidades_lectivas` | centro_id, grupo_horario, materia_id, profesor_id, horas_semanales, tipo_aula_requerida | Input del generador: X horas/sem de materia Y con prof Z para grupo G |
| `horario_generado` | centro_id, grupo_horario, materia_id, profesor_id, aula_id, dia_semana, tramo_horario, es_fijo | Output del CSP antes de publicar; UNIQUE(profesor_id,dia,tramo) y UNIQUE(grupo,dia,tramo) |
| `espacios` | centro_id, nombre, capacidad | Salas/espacios reservables del centro |
| `reservas_espacios` | centro_id, espacio_id, fecha, tramo, hora_inicio, hora_fin, reservado_por, motivo, created_at | `espacio_id` FK → espacios |
| `plazos_ib` | centro_id, curso_escolar, titulo, descripcion, fecha_limite, tipo, afecta_a, estado, created_at | Estado: pendiente/completado; tipo: entrega_ia/tok/cas/examen/formulario/reunion/otro |
| `cas_actividades` | centro_id, alumno_id, titulo, tipo, descripcion, reflexion, fecha_inicio, horas, estado, created_at | Actividades CAS del Diploma IB; tipo: creatividad/actividad/servicio; estado: en_curso/completada. Creada en `sql/demo-center.sql` |
| `extended_essay` | centro_id, alumno_id, titulo, asignatura, supervisor_nombre, estado, fecha_entrega_limite, palabras_actuales, created_at | Extended Essay del Diploma IB; estado: en_proceso/primer_borrador/borrador_final/entregado. Creada en `sql/demo-center.sql` |

---

## Edge Functions (Supabase)

| Función | Propósito |
|---------|-----------|
| `chat` | Proxy a Gemini 2.5 Flash. Recibe `{ contents: [...] }` en formato Gemini |
| `invite-user` | Crea usuario en auth + envía email con link. Requiere `caller_user_id` |
| `notify-role` | Email de notificación al cambiar rol de usuario |
| `notify-sustitucion` | Notifica al sustituto asignado: envía email con grupo, aula y `trabajo_alumnos` (nunca el motivo de la ausencia) |
| `tipificar-incidencia` | Clasifica incidencia con Gemini 2.5 Flash según normativa CCAA del centro. Recibe `{ descripcion, centro_id }`. Devuelve `{ gravedad, tipo_normativo, medidas, informe_borrador, normativa_ref, paradigma, protocolo_previ, alerta_urgente? }` |
| `notify-jefatura` | Email de alerta a admins del centro cuando se registra incidencia grave/muy_grave. Recibe `{ incidencia_id }`. Incluye informe borrador, medidas y banner PREVI si aplica |
| `send-comunicado` | Envía comunicado por email a los destinatarios del centro vía Resend. Recibe `{ comunicado_id }`. Enruta por `destinatarios`: todos/solo_profesores/solo_familias/grupo:XXXX |

---

## Tokens CSS (css/styles.css)

### Tokens originales (compatibilidad)
```css
--bg, --srf, --srf2      fondos (aliasados a --paper y --paper-2 en v2)
--bdr                    borde (aliasado a --line en v2)
--txt, --txt2, --txt3    texto (oscuro → gris claro)
--ink, --ink-l, --ink-ll color primario del centro (por defecto azul Google #1a73e8)
--amb, --amb-l           ámbar (avisos)
--red, --red-l           rojo (errores)
--r, --r-sm              border-radius (12px, 8px)
--sh, --sh-lg            sombras
```

### Tokens Design System v2 (paleta editorial cálida)
```css
--paper:         #FAF9F6   /* fondo principal crema */
--paper-2:       #F4F2EE   /* fondo sidebar y rail */
--surface-sunk:  #ECEBE4   /* fondo chips/badges */
--line:          #E6E3DC   /* borde 1px cálido */
--line-2:        #D9D5CB   /* borde hover */
--line-strong:   #C5BFB2   /* borde fuerte */
--muted:         #787F93   /* texto secundario */
--muted-2:       #B0B5C4   /* texto terciario */
--accent:        #C76B3D   /* terracota (IA/brand accent) */
--accent-soft:   #F3E1D5
--accent-ink:    #7A3E1F
--success:       #3F9367   --success-soft: #E3F2EC
--warning:       #D69540   --warning-soft: #FBF0DC
--danger:        #C24D2F   --danger-soft:  #FAE6E0
--info:          #4D6FA8   --info-soft:    #E3EAFA
--font-display:  "Newsreader", Georgia, serif   /* saludo, títulos, números stat */
--font-ui:       "Geist", "DM Sans", sans-serif /* todo lo demás */
```

`applyTheme(colorPrimario, logoUrl)` en `auth.js` sobreescribe `--ink` y derivadas con el color del centro. Se llama en: login, cambio de centro (superadmin), y `goHome()`.

> **Regla crítica:** `--ink` NO es un navy fijo — es el color del centro (sobrescrito por `applyTheme`). En el CSS de diseño usar `--ink` para elementos que deben respetar la tematización por centro (active nav, greeting em, etc.).

---

## Flujo de arranque

```
DOMContentLoaded (config.js)
  → sb.auth.getSession()
  → loadUserProfile(user)        [auth.js]
      → sb.from("profiles")
      → sb.from("centros")       (superadmin carga todos)
      → applyTheme()
      → ctr-name-hdr ← nombre del centro  (ahora está en .sb-school del sidebar)
      → showTab("chat")          muestra #panel-chat (Inicio dashboard + AI rail)
          → loadComedor()        si tab comedor activo
          → initSustPanel()      si tab sust activo
          → loadAdmin()          si tab admin activo
      → initWelcomeExtras()      [mejoras.js]
          → loadDashboard()      escribe en #role-cards-container (oculto)
          → loadMisHijos()
          → loadComedorHijos()   solo familia + módulo comedor
  → Inline script (app.html)
      → MutationObserver en #app-main → updateUserInfo() → updateBentoDashboard()
      → updateBentoDashboard():
          - muestra #inicio-admin / #inicio-staff / #inicio-familia según rol
          - rellena greeting txt + firstName en cada sección
          - actualiza topbar: #topbar-user-name, #topbar-user-role, role switch
          - setupBentoMetricSync(): MutationObserver en #role-cards-container
            sincroniza #stat-guardias/ausentes/incidencias → #bento-guardias/ausentes/incidencias
```

### Arquitectura inline script (app.html — NO es un archivo JS)
El script inline en `app.html` (≈280 líneas) es editable junto con el HTML. Gestiona:
- `TITLES` map: tab → título topbar (chat = 'Inicio')
- `TAB_MAP`: tab ID → nav-item sidebar + bottom nav
- `BADGE_MAP`: tab → badge sidebar + bottom nav
- Patch de `window.showTab` para sincronizar nav activo
- `updateUserInfo()`: popula sidebar footer + topbar avatar + nombre
- `updateBentoDashboard()`: gestiona secciones de rol del Inicio y topbar
- `syncBentoMetrics()`: sincroniza métricas desde role-cards-container oculto

---

## Módulos implementados

### Chatbot (chat.js)
- Contexto inyectado: info_centro, horario del usuario, hijos vinculados
- Resolución directa (sin Gemini) para consultas de horario de alumno/grupo/profesor
- Búsqueda fuzzy de alumnos por nombre con deduplicación por tokens exactos
- Mapa estático de grupos válidos (1ESOA…2BACB, IB)
- Detección de guardias/profesores libres en tiempo real
- Historial conversacional (últimos 10 mensajes) enviado a Gemini
- Control de acceso por rol en el system prompt

### Comedor (comedor.js)
- Vista día: lista de asistencia con toggle por alumno, filtros, navegación por fechas
- Detección automática de grupo actual del profesor por hora del sistema
- Vista histórico: últimos 30 días, tabla con totales, botón "Ver" navega al día
- Exportación CSV con BOM UTF-8
- Variable `comedorFecha` controla qué día se muestra
- `showComedorVista('dia'|'historico')` alterna las dos vistas

### Sustituciones (admin.js)
- Registro: profesor ausente, sustituto, grupo, tramo, fecha, observaciones
- `initSustPanel()`: auto-detecta tramo por hora del sistema, pre-rellena fecha con hoy
- Selector de sustituto ordenado por equidad (menor → mayor guardias) con recuento `(N g.)` — carga desde `getGuardiaCountsByName()`
- Al registrar sustitución: inserta en `guardias_realizadas` vía `registrarGuardiaEnBD()` y refresca bolsa
- Toggle `cubierta` inline en cada fila de la tabla
- Filtros "Hoy / Esta semana / Todo" con estado activo visual
- Contador en el tab: "🔄 Sustituciones (N)" cuando hay pendientes hoy
- Badges ✓ Cubierta / ⚠ Pendiente, exportación CSV, eliminación desde tabla

### Bolsa de guardias con equidad (guardias.js)
- `loadBolsaGuardias()`: ranking de todos los profesores ordenado por nº de guardias del trimestre (menor → mayor)
- Barra de progreso relativa + badge de color: verde (0) · azul (1-3) · amarillo (4-6) · rojo (7+)
- Cuenta desde `sustituciones.profesor_sustituto` del trimestre actual (sin configuración adicional)
- `getGuardiaCountsByName()`: mapa nombre→count usado por `admin.js` para ordenar el selector
- `registrarGuardiaEnBD()`: inserta en `guardias_realizadas` resolviendo `profile_id` por nombre
- Se carga automáticamente al abrir el tab Sustituciones y se refresca tras cada registro
- Card "Bolsa de guardias" integrada en `panel-sust` (visible junto al formulario)

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
- Modal **Editar**: nombre, rol, alumnos vinculados; llama `notify-role` si cambia rol
- Desactivar/Reactivar (campo `activo` en profiles); login bloqueado si `activo = false`
- Badge "Pendiente" + botón "Reenviar invitación" para usuarios sin `email_confirmed_at`
- Seguridad: admin no puede crear superadmins ni cambiar/desactivar su propio perfil
- Toggle de módulos por centro (comedor, espacios, incidencias) — solo superadmin

### Administración (admin.js)
- Editor de `info_centro` (10 campos, con visibilidad por rol)
- Visor de horarios en tabla
- Estadísticas: nº configs, nº entradas de horario

### RRHH — gestión de ausencias (rrhh.js)
- Tab `👔 RRHH` visible para `profesional`, `admin` y `superadmin`
- **Vista profesor** (`_renderRrhhProfesor`): formulario solicitud (fecha ini/fin, tipo, motivo), historial propio con badges
- **Vista admin/jefatura** (`_renderRrhhAdmin`): lista todas las solicitudes del centro; filtros por estado (pills), profesor y fecha
- `aprobarAusencia(id)`: marca estado=aprobada → llama `_crearSustituciones(ausencia, nombreProf)`
  - `_crearSustituciones`: expande rango de fechas a días lectivos, consulta `horarios_grupo` del profesor por día, inserta una fila en `sustituciones` por cada tramo encontrado (cubierta=false)
  - Nombre del profesor: busca primero en tabla `profesores` (por `profile_id`), luego en `profiles.full_name`
- `rechazarAusencia(id)`: prompt con motivo → guarda `estado=rechazada, motivo_rechazo`
- Badges: ⏳ pendiente · ✓ aprobada · ✕ rechazada
- Helpers: `_getCursoEscolar()`, `_getTrimestreActual()` (mes ≥9 → T1, ≤3 → T2, resto → T3)
- **Justificantes:** formulario de solicitud incluye campo `trabajo_alumnos` (texto libre) y subida de archivo al bucket `justificantes` de Supabase Storage → guarda URL en `justificante_url`
- **Privacidad del sustituto:** al notificar una guardia, la Edge Function `notify-sustitucion` envía solo grupo, aula y `trabajo_alumnos`; el motivo de ausencia y la URL del justificante son invisibles para el sustituto
- **Notificación automática:** al asignar sustituto en el panel de sustituciones, se llama `notify-sustitucion` vía `supabase.functions.invoke()`

### Bolsa de guardias con equidad (guardias.js)
- `loadBolsaGuardias()`: cuenta `sustituciones.profesor_sustituto` del trimestre actual → ranking menor→mayor
  - Profesores del ranking: todos los que aparecen en `horarios_grupo` + los que ya hicieron guardia ese trimestre
  - Barra de progreso relativa + badge: verde (0) · azul (1-3) · ámbar (4-6) · rojo (7+)
- `getGuardiaCountsByName()`: devuelve mapa `{nombre: count}` usado por `admin.js` para ordenar el selector de sustitutos
- `registrarGuardiaEnBD(nombre, fecha, tramo, grupo)`: resuelve `profile_id` por `ilike(full_name)` e inserta en `guardias_realizadas` con `ausencia_id: null`
- Card "Bolsa de guardias" integrada en `panel-sust`, se recarga al abrir el tab y tras cada registro
- Helpers: `_guardiaTrimActual()`, `_guardiaTrimDates(trim)`, `_guardiaCursoActual()`

### Incidencias — tipificación IA y flujo convivencia (incidencias.js)
- Botón **"✨ Tipificar con IA"** junto al formulario de registro: llama Edge Function `tipificar-incidencia`
- `tipificarIncidenciaIA()`: toma `descripcion` + `centro_id`, invoca la EF, muestra modal con resultado
- Modal de tipificación: badge de gravedad sugerida · tipificación legal con decreto aplicado · lista de medidas · textarea editable del informe borrador · banner rojo PREVI si `protocolo_previ=true`
- `_incUsarTipificacion()`: lee de `_incTipData` (estado de módulo) — pre-rellena `gravedad`, `tipo=convivencia`, inyecta sección de informe en el formulario
- `_incMostrarInformeEnForm(data)`: inserta textarea editable `#inc-informe` tras `#inc-desc` con banner normativa
- `registrarIncidencia()` ampliado: guarda `informe_borrador`, `normativa_ref`, `medidas_propuestas[]`, `protocolo_previ`; llama `_incNotificarJefatura()` para gravedad ≥ grave
- `_incNotificarJefatura(incId, msgEl)`: invoca EF `notify-jefatura`, actualiza mensaje de confirmación con `✉ Jefatura notificada (N)`
- Edge Function `tipificar-incidencia`: 5 normativas CCAA (valenciana/madrid/andalucia/cataluna + estatal fallback), Gemini 2.5 Flash, `temperature: 0.2`, JSON forzado
- Edge Function `notify-jefatura`: email HTML a todos los admins del centro con tabla completa + medidas + informe + banner PREVI

### Comunicados internos (comunicados.js)
- Tab **"📢 Comunicados"** visible para todos los roles (siempre activo, sin módulo gate)
- **Vista admin**: formulario colapsable con título, cuerpo, destinatarios, selector de plantilla
- 3 plantillas predefinidas: Convocatoria reunión · Modificación horario · Recordatorio plazo
- `destinatarios`: todos / solo_profesores / solo_familias / grupo:XXXX (dropdown con grupos reales del centro)
- `enviarComunicado()`: guarda en tabla `comunicados`, llama EF `send-comunicado`, muestra `✅ Enviado a N destinatarios`
- **Vista todos**: lista de comunicados con fecha, destinatarios, badge "No leído" y modal de detalle
- **Badge de no leídos**: `_comUpdateTabBadge()` — localStorage key `com_leidos_{userId}_{ctrId}`, actualiza tab a `📢 Comunicados (N)`
- **Realtime**: `_comInitRealtime()` — suscripción Supabase a INSERT en `comunicados` filtrado por `centro_id`; toast para usuarios que no son el creador
- `_comCheckAndBadge()`: ejecutado 1200ms tras login — fetch solo de IDs, actualiza badge, inicia realtime
- EF `send-comunicado`: enruta por `destinatarios`; para `grupo:XXXX` hace join `alumnos→familia_alumno→profiles`; envía un email por destinatario vía Resend

### Planner — generador de horarios (planner.js)
- Tab **"Planner"** visible solo para `admin` y `superadmin`; nav-item controlado desde `updateBentoDashboard()` en el inline script de app.html
- **4 sub-paneles** (pill tabs): Materias · Necesidades · Tablero · Publicar
- **Materias (CRUD)**: formulario inline con nombre + color picker; lista con dot de color, actualización de color y borrado
- **Necesidades lectivas (CRUD)**: grupo horario + materia + profesor + horas/semana; tabla resumen con borrado por fila
- **Motor CSP backtracking** (`_generarHorario`):
  - Expande necesidades en sesiones individuales, ordena más-restringidas primero (más horas → antes)
  - Construye `teacherBusy` desde horarios de otros grupos ya generados (cross-group conflict prevention)
  - `_resolverCSP()` recursivo: itera DIAS × TRAMOS; coloca, recursa, deshace si falla (backtracking clásico)
  - `_esValido()`: ① slot ocupado para el grupo ② profesor ocupado en otro grupo ese tramo ③ misma materia no dos veces el mismo día
  - Si no hay solución → alert informativo con sugerencias de resolución
- **Tablero drag & drop**: CSS Grid 6 cols (hora + L/M/X/J/V) × 8 filas (tramos 08:00–16:00); fichas `.class-card` con borde izquierdo de color por materia; zona libre para quitar sesiones
  - Drag handlers: `plannerDragStart/End/Over/Leave/Drop/DropPool` — validación cross-group en destino, intercambio swap entre slots ocupados
  - `.planner-cell.drag-over` (verde) / `.drag-error` (rojo) feedback visual en tiempo real
- **Publicar**: estadísticas (grupos, sesiones, necesidades), aviso de sobreescritura, botón que:
  1. Elimina `horarios_grupo` de los grupos afectados para el `centro_id`
  2. Inserta filas con `hora_inicio`, `hora_fin`, `actividad_nombre`, `profesor_nombre`, `aula: ''`
  3. El chatbot y sustituciones usan el nuevo horario inmediatamente
- **Tablas en Supabase**: `materias`, `aulas`, `disponibilidad_profesor`, `necesidades_lectivas`, `horario_generado` — ver `sql/planner-tables.sql`
- **XSS**: `_esc()` en todos los `innerHTML` con datos de usuario

---

## Estado del proyecto (2026-05-27)

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
| `justificantes` | Privado (solo autenticados) | Justificantes de ausencias de profesores |

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
| Administración | — | — | ✅ | ✅ |
| Usuarios | — | — | ✅ (su centro) | ✅ (todos) |
| Planner | — | — | ✅ | ✅ |

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
```

---

## Automatizaciones n8n

n8n instalado en local (`http://localhost:5678`). Los workflows se versionan como JSON en el repo y se importan manualmente en n8n.

### Patrón común a todos los workflows

**Configuración de claves** — nodo "Config y fechas" (primeras 2 líneas):
```js
const SUPABASE_KEY = 'eyJ...service_role_key...';
const RESEND_KEY   = 're_...resend_api_key...';
```

**Nodo Send Resend** — configuración HTTP:
- Method: `POST`
- URL: `https://api.resend.com/emails`
- Headers: `Authorization: Bearer {{ $json.resendKey }}` · `Content-Type: application/json`
- Body (JSON): `{ "from": "...", "to": [...], "cc": [...], "subject": "...", "html": "..." }`
- `to` y `cc` son **arrays**; `cc` solo si existe en el item

**Para importar cualquier workflow:** Workflows → Import from file → guardar → editar nodo "Config y fechas" → Execute Workflow para probar → activar toggle.

---

### Briefing matutino (`n8n-briefing-matutino.json`) ✅

**Trigger:** lunes–viernes a las 8:15 (cron `15 8 * * 1-5`)

**Nodos (7):**

| Nodo | Tipo | Descripción |
|------|------|-------------|
| Lunes-Viernes 8:15 | scheduleTrigger | Cron `15 8 * * 1-5` |
| Config y fechas | code | Declara `SUPABASE_KEY`, `RESEND_KEY`, URLs, `today`, `yesterday`, `fechaLegible` |
| Get Admins | httpRequest | `profiles?rol=eq.admin&activo=neq.false` con join `centros(id,nombre)` |
| Get Sustituciones | httpRequest | `sustituciones?cubierta=eq.false&fecha=eq.{today}` |
| Get Ausencias | httpRequest | `ausencias_profesor?estado=eq.aprobada&fecha=lte.{today}&fecha_fin=gte.{today}` |
| Build Emails | code | Fetch inline de `asistencia_comedor` (ayer, se_queda=true); agrupa por centro; genera HTML; devuelve un item por admin |
| Send Resend | httpRequest | POST Resend con `to` del admin |

**Notas de implementación:**
- `asistencia_comedor` se obtiene con `fetch()` dentro de Build Emails — evita que un resultado vacío corte el workflow
- `_get(name)` soporta ambos modos de n8n: respuesta como array único o auto-dividida en items
- `to` se castea explícitamente a `String` y se filtra con `.includes('@')` antes de enviar
- HTML con `<table>`; atributos en comillas simples dentro de template literals

---

### Informe semanal (`n8n-informe-semanal.json`) ✅

**Trigger:** viernes a las 15:00 (cron `0 15 * * 5`)

**Nodos (7):**

| Nodo | Tipo | Descripción |
|------|------|-------------|
| Viernes 15:00 | scheduleTrigger | Cron `0 15 * * 5` |
| Config y fechas | code | Calcula `weekStart` (lunes), `weekEnd` (viernes), array `weekDays`, `semanaLegible`, `fechaEmision` |
| Get Admins | httpRequest | `profiles?rol=eq.admin&activo=neq.false` con join `centros(id,nombre)` |
| Get Sustituciones | httpRequest | `sustituciones?fecha=gte.{weekStart}&fecha=lte.{weekEnd}` — todas (cubiertas y pendientes) |
| Get Ausencias | httpRequest | `ausencias_profesor?estado=eq.aprobada` solapadas con la semana |
| Build Emails | code | Fetch inline de `asistencia_comedor` y `guardias_realizadas` de la semana; genera HTML con 4 tablas; devuelve un item por admin |
| Send Resend | httpRequest | POST `https://api.resend.com/emails` con body `{from, to, subject, html}` |

**Email incluye:**
- KPIs: sustituciones totales, sin cubrir, ausencias, comidas totales
- Tabla resumen por día (sustituciones + comensales) con fila de totales
- Tabla detalle de sustituciones con estado ✓/⚠
- Ranking de profesores con más guardias (top 5)
- Ausencias agrupadas por tipo

---

### Alerta absentismo comedor (`n8n-alerta-comedor.json`) ✅

**Trigger:** lunes–viernes a las 16:00 (cron `0 16 * * 1-5`)

**Nodos (6):**

| Nodo | Tipo | Descripción |
|------|------|-------------|
| Lunes-Viernes 16:00 | scheduleTrigger | Cron `0 16 * * 1-5` |
| Config y fechas | code | Declara `SUPABASE_KEY`, `RESEND_KEY`, `today`, `thirtyDaysAgo`, `fechaLegible` |
| Get Alumnos | httpRequest | `alumnos?select=id,nombre,grupo_horario,centro_id&limit=3000` |
| Get Asistencia | httpRequest | `asistencia_comedor` últimos 30 días. Header `Range: 0-9999` para superar límite de 1000 filas |
| Build Emails | code | 2 fetches inline (`horarios_grupo` + `profiles`). Lógica completa de detección y agrupación por tutor |
| Send Resend | httpRequest | POST `https://api.resend.com/emails` — uno por tutor con alertas |

**Lógica de detección en Build Emails:**
1. Construye mapa `alumno_id → { fecha → se_queda }` de los últimos 30 días
2. **Comedores habituales:** alumno con ≥5 registros `se_queda=true` en 30 días laborables
3. **Racha de ausencia:** itera días laborables hacia atrás desde hoy; corta al encontrar `se_queda=true`. Si racha ≥3 → alerta
4. **Tutor del grupo:** primer `profesor_nombre` del tramo más bajo en `horarios_grupo` ordenado por `grupo_horario.asc,tramo.asc`
5. Cruza nombre del tutor con `profiles` (`rol=in.(profesional,admin)`) para obtener email
6. Agrupa por tutor, ordena alumnos por días descendente, genera HTML naranja con badge de días

**Email incluye:** cabecera naranja `#e65100`, aviso contextual al tutor, tabla con nombre/grupo/días consecutivos (badge rojo ≥5, naranja ≥3), nota con criterio de alerta.

**Si no hay alertas:** `Build Emails` devuelve `[]` y el workflow finaliza sin enviar nada.

---

### Alertas plazos IB (`n8n-alertas-ib.json`) ✅

**Trigger:** lunes–viernes a las 9:00 (cron `0 9 * * 1-5`)

**Tabla requerida:** `plazos_ib` — ver SQL en RRHH migration o ejecutar:
```sql
CREATE TABLE public.plazos_ib (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  curso_escolar text NOT NULL DEFAULT '2024-2025',
  titulo text NOT NULL,
  descripcion text,
  fecha_limite date NOT NULL,
  tipo text NOT NULL DEFAULT 'otro',
  afecta_a text NOT NULL DEFAULT 'coordinador',
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.plazos_ib ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centro_isolation" ON public.plazos_ib FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );
CREATE INDEX idx_plazos_ib_centro_fecha ON public.plazos_ib (centro_id, fecha_limite, estado);
```

**Nodos (6):**

| Nodo | Tipo | Descripción |
|------|------|-------------|
| Lunes-Viernes 9:00 | scheduleTrigger | Cron `0 9 * * 1-5` |
| Config y fechas | code | Claves, `today`, `fechaLegible`, `SUPERADMIN_CC = jesvivlc@gmail.com` |
| Get Admins | httpRequest | `profiles?rol=eq.admin&activo=neq.false` con join `centros` |
| Get Plazos | httpRequest | `plazos_ib?estado=eq.pendiente&order=fecha_limite.asc` |
| Build Emails | code | Calcula días restantes, aplica umbrales, genera HTML con kpis + tabla |
| Send Resend | httpRequest | POST Resend con `to` + `cc` (siempre copia al superadmin) |

**Umbrales y comportamiento:**
- `dias > 7` → no se envía email para ese centro (ningún plazo urgente)
- `3–7 días` → email normal, cabecera azul `#1565c0`
- `0–2 días` → email urgente, cabecera naranja `#e65100`, prefijo `⚠️ URGENTE —` en asunto
- `< 0 días (vencido)` → email crítico, cabecera roja `#b71c1c`, prefijo `🚨 VENCIDO —` en asunto
- La tabla muestra todos los plazos ≤30 días (incluyendo vencidos), con badge de color
- Los KPIs del header cuentan TODOS los plazos pendientes del centro (no solo los ≤30)
- CC siempre a `jesvivlc@gmail.com`

**tipos IB soportados:** `entrega_ia`, `tok`, `cas`, `examen`, `formulario`, `reunion`, `otro`

**Requiere datos en `plazos_ib`** — sin filas, el workflow no envía nada. Usar el centro demo o insertar plazos reales desde la app (pendiente: módulo de gestión IB en la app).

---

## Centro de demostración

Archivo: `sql/demo-center.sql` — ejecutar en Supabase SQL Editor con rol service_role.

**PASO PREVIO obligatorio:** invitar `demo@didactia.eu` como `admin` desde la app (Usuarios → Invitar) antes o después de ejecutar el SQL. No se puede crear via SQL porque `profiles` exige una entrada previa en `auth.users`.

### Datos del centro demo

| Campo | Valor |
|-------|-------|
| UUID fijo | `a0eedbc0-0001-4d52-8f00-000000000001` |
| Nombre | IES Demo |
| Color | `#0f4c81` |
| Módulos | comedor, espacios, incidencias |

### Contenido generado

| Entidad | Cantidad | Notas |
|---------|----------|-------|
| Alumnos | 80 | 13 grupos: 1ESOA/B, 2ESOA/B, 3ESOA/B, 4ESOA/B, 1BACA/B, 2BACA, 1IB, 2IB |
| Profesores | 15 | Solo tabla `profesores` (sin cuentas de usuario) |
| Horarios | 325 filas | 13 grupos × 5 días × 5 tramos (T1-T5, 08:00-13:30) |
| Sustituciones | 10 | 5 cubiertas (días -6 a -2) + 5 pendientes (hoy) |
| Asistencia comedor | ~880 filas | 30 días laborables × 80 alumnos, ~65% se_queda via hashtext |
| Ausencias | 5 | 2 aprobadas, 1 rechazada, 2 pendientes |
| Plazos IB | 3 | +4 días (urgente), +7 días (borderline), +21 días (upcoming) |
| CAS actividades | 30 | 10 alumnos IB × 3 tipos (creatividad/actividad/servicio) |
| Extended Essays | 2 | Primeros 2 alumnos de 2IB, en distintos estados |

### Idempotencia

El script elimina y regenera todos los datos demo en cada ejecución (DELETE en orden FK-safe, luego INSERT). Seguro ejecutarlo múltiples veces.

### Tablas creadas por el script (si no existen)

- `cas_actividades` — ver esquema en sección Tablas de Supabase
- `extended_essay` — ver esquema en sección Tablas de Supabase

---

## Convenciones críticas

1. **Nunca** hardcodear `centro_id` — siempre usar la variable global `ctrId`
2. **Nunca** modificar RLS policies sin revisar el impacto en ambos centros
3. **Nunca** volver a HMAC para JWT
4. Las Edge Functions viven en Supabase, no en Vercel
5. Variables sensibles solo en Vercel dashboard y Supabase dashboard
6. Probar cambios primero en IES Buñol, luego Agora Lledó
7. Hacer `git commit` antes de cada deploy
8. `applyTheme` siempre se llama **después** de `resetChat()` y `updateUI()` para que el DOM esté listo

### Convenciones UI / Design System
9. **No tocar archivos JS** para cambios de UI — solo `app.html` e `css/styles.css`
10. **No cambiar IDs existentes** — auth.js, mejoras.js y otros módulos los referencian por ID
11. Usar `var(--ink)` (NO colores navy fijos) en elementos que deben respetar la tematización por centro
12. `--ink` es el color del centro sobreescrito por `applyTheme()` — nunca asumir que es azul Google
13. Los archivos de referencia visual están en `design_handoff_didactia/`:
    - `VISUAL_FIDELITY.md` — checklist y especificaciones exactas (leer antes de tocar UI)
    - `screenshots/` — capturas de referencia; el output DEBE parecerse a estas
    - `reference/DidactIA.html` — prototipo navegable completo
14. Toda pantalla de UI debe pasar el checklist de la sección 9 de `VISUAL_FIDELITY.md` antes de declararse "hecha"

---

## Roadmap

### Completado ✅
- [x] Chatbot con Gemini 2.5 Flash, contexto multi-rol, resolución directa de horarios
- [x] Módulo comedor: asistencia diaria, histórico 30 días, CSV export
- [x] Sustituciones: registro, toggle cubierta, filtros, CSV, contador de tab
- [x] Bolsa de guardias con equidad (ranking trimestral, barra de progreso, selector ordenado)
- [x] Dashboard por rol con contadores live y búsqueda rápida de alumno
- [x] Gestión de usuarios: invitar, editar, desactivar, reenviar invitación, badges de estado
- [x] Toggle de módulos por centro (superadmin)
- [x] Módulo incidencias: buscador de alumno en tiempo real (autorellena grupo), gravedad, filtro por grupo, CSV, contador en tab, notificación familia
- [x] Módulo incidencias — tipificación IA: botón Tipificar con IA, modal con normativa CCAA (5 regiones), informe borrador editable, pre-relleno automático del formulario
- [x] Módulo incidencias — flujo convivencia: guardar informe/normativa/medidas/PREVI en BD, notificación automática a jefatura (grave/muy_grave) vía Edge Function notify-jefatura
- [x] Módulo comunicados: formulario admin con 3 plantillas, destinatarios por rol/grupo, envío email vía Resend, badge no leídos, Realtime toast, modal detalle
- [x] Módulo espacios/salas: grid de disponibilidad, reservas, gestión de espacios
- [x] RRHH: solicitud de ausencias, aprobación (genera sustituciones automáticas), rechazo
- [x] RRHH: subida de justificantes a Storage, privacidad del sustituto, notificación via Edge Function
- [x] PWA Service Worker (cache-first assets, pass-through Supabase)
- [x] Notificaciones Realtime (sustituciones nuevas → toast)
- [x] n8n Briefing matutino (L-V 8:15, email a admins)
- [x] n8n Informe semanal (viernes 15:00, email a admins)
- [x] n8n Alerta absentismo comedor (L-V 16:00, email a tutores)
- [x] n8n Alertas plazos IB (L-V 9:00, email a admins con CC superadmin)
- [x] Centro demo IES Demo con 80 alumnos, horarios, datos IB y 30 días comedor
- [x] Design System v2: paleta editorial cálida (oklch), Newsreader serif, tokens CSS completos
- [x] Layout shell v2: sidebar 248px con SVG brand (navy+D+spark ámbar), topbar con búsqueda+role switch+avatar, bottom nav móvil
- [x] Inicio admin v2: stat2 tiles (barra lateral 3px, icono soft-tinted, Newsreader 38px, sparkline SVG), timeline, atajos 3×2, AI rail 360px
- [x] Planner — generador de horarios: motor CSP backtracking, tablero drag & drop, CRUD materias/necesidades, publicación en horarios_grupo (solo admin/superadmin)

### En progreso — Redesign visual completo (design_handoff_didactia/)
- [x] Design tokens v2 + layout shell
- [x] Logo brand SVG + wordmark sidebar
- [x] Inicio admin (stat tiles, timeline, AI rail)
- [ ] Inicio profesor (horario del día, stats distintas)
- [ ] Alumnos — split tabla/perfil drawer (`02-alumnos.png`)
- [ ] Asistente IA — pantalla full-screen chat split (`06-chat.png`)
- [ ] Sustituciones — tabla densa + popover + banner IA (`04-sustituciones.png`)
- [ ] Incidencias — split lista/detalle con timeline (`05-incidencias.png`)

> **Regla de implementación UI:** NO tocar archivos JS. Solo `app.html` e `css/styles.css`. Mantener TODOS los IDs existentes. Usar `var(--ink)` en lugar de colores navy fijos para respetar tematización.

### Próximo sprint — App Familias / Portal familias
- [ ] **App Familias (PWA separada o tab nuevo)** — onboarding, dashboard hijo, chat con el centro, notificaciones push
- [ ] **Notificaciones push** — Web Push API; notificar familias cuando alumno falta al comedor
- [ ] **Módulo IB en la app** — gestión de `plazos_ib`, CAS tracker, Extended Essay status (para centros con IB)
- [ ] **Página de recuperación de contraseña** — UX mejorable; actualmente funciona via hash
- [ ] **Onboarding de nuevo centro** — wizard guiado: info_centro, importar horarios, alumnos, primer admin

### Backlog
- [ ] Vista móvil optimizada (actualmente funcional pero no adaptada)
- [ ] Importación masiva de alumnos via CSV (existe script Python para horarios, falta alumnos/familias)
- [ ] Estadísticas avanzadas para dirección (dashboard superadmin con métricas cross-centro)
- [ ] Limpiar `repomix-output.xml` y `edubot-supabase (1).html` del repo (añadir a `.gitignore`)

---

## Propuesta comercial

### Precios (pendiente decisión con Salva)

| Plan | Precio/centro/mes | Incluye |
|------|------------------|---------|
| Básico | 99 € | Chatbot + Sustituciones + RRHH |
| Profesional | 199 € | Todo Básico + Comedor + Incidencias + Espacios + n8n workflows |
| IB | 289 € | Todo Profesional + Módulo IB (plazos, CAS, Extended Essay) |

> **Nota:** nuestra propuesta inicial era 150/250/350 €. La propuesta actual (99/199/289) está pendiente de validación con Salva antes de publicar en la landing.

---

## Contenido y assets preparados

### n8n / Email templates
- Todos los workflows usan HTML con `<table>` + inline styles para compatibilidad máxima con clientes de correo
- Paleta de colores: azul `#1565c0` (normal), naranja `#e65100` (urgente), rojo `#b71c1c` (crítico/vencido), verde `#1e6b3a` (OK)

### Contenido Gemini / IA

**7 Learning Outcomes CAS (IB) con descripciones en español** — listos para inyectar en el system prompt del chatbot cuando el usuario pregunte sobre CAS:
1. LO1 — Identificar propias fortalezas y desarrollar áreas de mejora
2. LO2 — Demostrar que los retos se han afrontado y superado
3. LO3 — Iniciativa y planificación de actividades CAS
4. LO4 — Demostrar compromiso y perseverancia
5. LO5 — Trabajar de forma colaborativa con otros
6. LO6 — Compromiso global con implicaciones éticas
7. LO7 — Reconocer y considerar la ética de las acciones y decisiones

**Plazos oficiales IB convocatoria mayo 2025** — para pre-cargar en `plazos_ib` de centros IB reales:
- Nov 2024: Registro candidatos exámenes mayo
- Dic 2024: Entrega EE primer borrador al supervisor
- Ene 2025: Predicciones a IB (Predicted Grades)
- Feb 2025: TOK Essay borrador final
- Mar 2025: Deadline IAs todas las asignaturas
- Abr 2025: Entrega final EE
- May 2025: Exámenes escritos

**3 reflexiones CAS de ejemplo** (para few-shot prompting en el chatbot cuando alumno pide ayuda para redactar reflexión):
- Reflexión inicial: expectativas, miedos, plan
- Reflexión de proceso: aprendizajes, obstáculos, LOs trabajados
- Reflexión final: evidencias de crecimiento, LOs demostrados, conexión TOK

**3 plantillas de comunicados para centros** (implementadas en `js/comunicados.js`):
- Convocatoria reunión de inicio de curso (destinatario: familias de un grupo)
- Aviso modificación de horario (destinatario: familias de un grupo)
- Recordatorio plazo / último aviso (destinatario: configurable)

**3 incidencias de convivencia de ejemplo** — insertadas en IES Demo para mostrar el módulo:
- Conflicto verbal en pasillo (2ESO)
- Uso de móvil en clase reiterado (3ESO)
- Deterioro de material escolar (1BAC)

### Textos App Familias (pendiente implementación)
- **Onboarding:** "Bienvenido/a a DidactIA — Tu ventana al día a día de [nombre alumno] en [nombre centro]"
- **Dashboard:** estado comedor hoy, próximas guardias que afectan al grupo, incidencias abiertas
- **Chat:** "Pregúntame sobre el horario, el comedor o cualquier comunicado del centro"
- **Notificaciones push:** "[Nombre alumno] no ha marcado asistencia al comedor hoy. ¿Confirmas que no se queda?"

### Copywriting landing page didactia.eu
- Headline: "La gestión escolar que desaparece del camino"
- Subheadline: "Sustituciones, comedor, RRHH y familias — todo en un solo lugar, sin instalaciones ni mantenimiento"
- CTA principal: "Solicitar demo gratuita"
- 3 propuestas de valor: Ahorra 2h/día al equipo directivo · Familias siempre informadas · Sin papel ni Excel

---

## Cómo trabajar

```bash
# Ver estado del proyecto
git status && git log --oneline -5

# Después de cada cambio funcional
git add <archivos> && git commit -m "tipo: descripción" && git push
# Vercel despliega automáticamente desde main
```

---

## Protocolo al terminar cada tarea

Al completar cualquier tarea o funcionalidad, seguir este orden **antes de continuar**:

1. **Actualizar este CLAUDE.md** — marcar lo completado en "Funcionalidades pendientes", añadir decisiones técnicas nuevas, actualizar tablas de BD si hubo cambios de esquema.
2. **Commit del CLAUDE.md** junto con los archivos de la tarea.
3. **Confirmar con el usuario** antes de pasar al siguiente sprint o tarea.


---

> **Nota Realtime:** Para que las notificaciones de sustituciones funcionen, activar Realtime en la tabla `sustituciones` desde el dashboard de Supabase → Database → Replication.

> **Migraciones pendientes de ejecutar manualmente** en Supabase SQL Editor:
> - `sql/add-incidencias-fields.sql` — añade `informe_borrador`, `normativa_ref`, `medidas_propuestas[]`, `protocolo_previ` a la tabla `incidencias`
> - SQL del módulo comunicados (tabla `comunicados` + RLS) — ver mensaje sesión 2026-05-24
>
> **Migraciones ejecutadas** (ya en producción):
> - `sql/planner-tables.sql` — tablas planner + RLS + índices ✅ ejecutado 2026-05-27

---

## Registro de cambios recientes
- `2026-05-27` · `d2c9486` — docs: marcar tablas planner como verificadas en Supabase
- `2026-05-27` · SQL ejecutado en Supabase — tablas planner activas en producción (rflfsbrdmgaidhvbuvwb)
- `2026-05-26 06:55` · `255a1b2` — feat: DidactIA Planner — generador de horarios con CSP + drag & drop (app.html + planner.js + planner-tables.sql + landing index.html)
- `2026-05-26 01:07` · `3415272` — fix: patch Recientes click handlers via MutationObserver
- `2026-05-26 00:59` · `d5fb03e` — fix: tipografía, barra stat tiles y greeting — fidelidad visual 01-inicio-admin
- `2026-05-26 00:56` · `5847af7` — docs: CLAUDE.md actualización 2026-05-26 — design system v2, roadmap UI, convenciones UI
- `2026-05-26 00:53` · `5afc6b3` — feat: inicio admin layout — stat2 tiles, AI rail, sidebar SVG brand, topbar v2
- `2026-05-26 (este)` · CLAUDE.md — documentación design system v2, arquitectura inline script, roadmap UI redesign
- `2026-05-25 20:27` · `e9e9652` — feat: design system v2 — warm editorial tokens + layout shell redesign
- `2026-05-25 19:45` · `4fa987c` — feat: bento grid dashboard with metric cards, welcome banner and chatbot widget
- `2026-05-25 19:17` · `f404ed6` — feat: redesign dashboard — two-column layout with sidebar panel
- `2026-05-25 16:57` · `182b449` — feat: migrar navegación a sidebar lateral con topbar y bottom nav móvil
- `2026-05-25 06:49` · `e93701c` — docs: CLAUDE.md actualización completa 2026-05-25
- `2026-05-24 23:02` · `e755e36` — feat: módulo comunicados internos con envío por email y realtime
- `2026-05-24 22:52` · `68b7a46` — feat: flujo convivencia completo — informe editable + notificación jefatura
- `2026-05-24 22:33` · `93661d8` — feat: botón Tipificar con IA en módulo incidencias
- `2026-05-24 21:43` · `e8089d4` — feat: tipificar-incidencia con normativas de todas las CCAA
- `2026-05-24 21:30` · `67bbe5a` — feat: Edge Function tipificar-incidencia + migración ccaa en centros
- `2026-05-24 21:00` · `58e462c` — fix: dropdown alumno incidencias — data-* attrs + mousedown prevDefaut
- `2026-05-24 20:52` · `059f39a` — feat: mejoras módulo incidencias — buscador alumno, filtro grupo, CSV, contador tab
- `2026-05-23 17:48` · `806175e` — docs: CLAUDE.md actualización completa estado del proyecto 2026-05-23
- `2026-05-23 17:5x` · (este commit) — docs: CLAUDE.md actualización completa — roadmap, precios, contenido, RRHH ampliado, n8n patrón común
- `2026-05-23 17:44` · `bf718d3` — feat: SQL centro demo IES Demo con datos completos para ventas
- `2026-05-23 12:14` · `1484aab` — feat: n8n alertas plazos IB + tabla plazos_ib
- `2026-05-23 12:07` · `52ce5c3` — feat: n8n alerta absentismo comedor
- `2026-05-23 11:53` · `cd592dc` — feat: n8n informe semanal automático para dirección

### 2026-05-23 — Actualización CLAUDE.md completa

| Hash | Tipo | Descripción |
|------|------|-------------|
| (este commit) | docs | Roadmap completo, propuesta comercial (precios 99/199/289 pendiente Salva), assets de contenido Gemini/IB/familias, patrón Send Resend unificado, RRHH ampliado con justificantes y privacidad |

### 2026-05-23 — Centro de demostración IES Demo

| Hash | Tipo | Descripción |
|------|------|-------------|
| (este commit) | feat | `sql/demo-center.sql` — centro demo con UUID fijo, 80 alumnos/13 grupos, 15 profesores, 325 horarios, comedor 30 días, datos IB (CAS + EE + plazos). Tablas `cas_actividades` y `extended_essay` creadas con IF NOT EXISTS |

### 2026-05-23 — n8n alertas plazos IB

| Hash | Tipo | Descripción |
|------|------|-------------|
| (este commit) | feat | `n8n-alertas-ib.json` — workflow L-V 9:00; umbrales 7/2/0 días con cabecera y asunto dinámicos; CC superadmin; tabla `plazos_ib` + RLS + índice |

### 2026-05-23 — n8n alerta absentismo comedor

| Hash | Tipo | Descripción |
|------|------|-------------|
| (este commit) | feat | `n8n-alerta-comedor.json` — workflow alerta L-V 16:00; detección racha ≥3 días laborables en comedores habituales; email por tutor vía Resend |

### 2026-05-23 — n8n informe semanal

| Hash | Tipo | Descripción |
|------|------|-------------|
| (este commit) | feat | `n8n-informe-semanal.json` — workflow informe semanal (cron viernes 15:00, 4 queries Supabase, email HTML con KPIs + 4 tablas por centro vía Resend) |

### 2026-05-22 — n8n briefing matutino

| Hash | Tipo | Descripción |
|------|------|-------------|
| `77ebdd4` | fix | `_get()` robusto para ambos modos de n8n; `to` casteado a String explícito con filtro `@` |
| `1faa4e6` | refactor | Fetch de `asistencia_comedor` inline en Build Emails; eliminado nodo Get Comedor (7 nodos en total) |
| `db64954` | fix | Manejo seguro de respuestas vacías de Supabase en Build Emails con `.all()[0]` |
| `9e2468f` | feat | `n8n-briefing-matutino.json` — workflow completo de briefing matutino (cron L-V 8:15, 3 queries Supabase, email HTML por centro vía Resend) |

### 2026-05-22 — Sprint RRHH + Usuarios

| Hash | Tipo | Descripción |
|------|------|-------------|
| `2365a78` | docs | CLAUDE.md actualizado con bolsa de guardias |
| `e56ccb2` | feat | `js/guardias.js` — bolsa de guardias con equidad por trimestre; selector de sustituto ordenado; auto-registro en `guardias_realizadas` |
| `06adeb2` | docs | CLAUDE.md actualizado con módulo RRHH |
| `15ef7d8` | feat | `js/rrhh.js` — módulo RRHH completo (ausencias, aprobación con sustituciones automáticas, rechazo); `app.html` tab 👔 RRHH |
| `4514510` | docs | Tablas incidencias/espacios/reservas marcadas como creadas |
| `54dbdee` | feat | Tablas RRHH en Supabase: `profesores`, `ausencias_profesor`, `guardias_realizadas` + RLS completa (`rrhh_migration.sql`) |
| `38f3fdf` | feat | Estados activo/inactivo/pendiente en tabla de gestión de usuarios |
| `30c5d91` | docs | CLAUDE.md actualizado con módulo de usuarios |
| `049c9a1` | feat | `js/users.js` reescritura completa — panel admin+superadmin, modales invitar/editar, desactivar/reactivar, reenvío invitación |
| `d92efb1` | docs | Tablas media prioridad marcadas como completadas; SQL pendiente documentado |
