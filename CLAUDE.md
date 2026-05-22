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
  incidencias.js        loadIncidencias, registrarIncidencia, initIncidenciasPanel
  espacios.js           loadEspacios, reservarEspacio
  rrhh.js               loadRrhhPanel, solicitarAusencia, aprobarAusencia, rechazarAusencia
  guardias.js           loadBolsaGuardias, getGuardiaCountsByName, registrarGuardiaEnBD
manifest.json                   PWA manifest (sin service worker aún)
n8n-briefing-matutino.json      Workflow n8n: briefing matutino automático (importar en n8n)
scripts/
  importar_horarios_profes.py   Import CSV de horarios → Supabase
```

---

## Tablas de Supabase

| Tabla | Campos clave | Notas |
|-------|-------------|-------|
| `centros` | id, nombre, modulos_activos[], color_primario, logo_url | Configura tematización y módulos |
| `profiles` | id, user_id, full_name, email, rol, centro_id, activo (bool DEFAULT true), created_at | Extiende auth.users. `id = user_id` (ambos = auth UUID). `activo=false` bloquea el login |
| `info_centro` | centro_id, nombre_config, datos (jsonb), visible_para | Contexto del chatbot |
| `horarios` | centro_id, dia, hora, profesor, actividad | Tabla legacy — chatbot búsqueda por apellido |
| `horarios_grupo` | centro_id, grupo_horario, dia, tramo, hora_inicio, hora_fin, actividad_nombre, profesor_nombre, aula | Tabla principal — lógica horaria directa |
| `alumnos` | centro_id, nombre, curso, grupo_horario | Vinculados vía familia_alumno |
| `familia_alumno` | profile_id, alumno_id | N:M familias↔alumnos |
| `asistencia_comedor` | centro_id, alumno_id, fecha, se_queda, plaza_fija, registrado_por | Una fila por alumno/día |
| `sustituciones` | centro_id, fecha, hora_inicio, hora_fin, tramo, grupo_horario, profesor_ausente, profesor_sustituto, observaciones, cubierta, creado_por | `cubierta` tiene toggle en la tabla. Se auto-genera desde RRHH al aprobar ausencias |
| `profesores` | centro_id, profile_id, nombre, especialidad, departamento, horas_semanales, tipo_jornada, activo | Ficha HR del profesor; `profile_id` opcional (puede no tener cuenta) |
| `ausencias_profesor` | centro_id, profile_id, fecha, fecha_fin, tipo, motivo, estado, aprobada_por, motivo_rechazo, trimestre, curso_escolar, created_at | Estado: pendiente/aprobada/rechazada; tipo: baja_medica/permiso/asunto_propio/formacion/sindical/otros. Tabla base creada con `rrhh_migration.sql`; columnas extendidas vía ALTER TABLE |
| `guardias_realizadas` | centro_id, profile_id, ausencia_id, fecha, tramo, grupo_horario, aula, observaciones, trimestre, curso_escolar, created_at | Guardias cubiertas; `ausencia_id` FK → ausencias_profesor |
| `incidencias` | centro_id, fecha, tipo, descripcion, alumno_nombre, grupo_horario, registrado_por, estado, created_at | Estado: abierta/cerrada; tipo por defecto 'convivencia' |
| `espacios` | centro_id, nombre, capacidad | Salas/espacios reservables del centro |
| `reservas_espacios` | centro_id, espacio_id, fecha, tramo, hora_inicio, hora_fin, reservado_por, motivo, created_at | `espacio_id` FK → espacios |

---

## Edge Functions (Supabase)

| Función | Propósito |
|---------|-----------|
| `chat` | Proxy a Gemini 2.5 Flash. Recibe `{ contents: [...] }` en formato Gemini |
| `invite-user` | Crea usuario en auth + envía email con link. Requiere `caller_user_id` |
| `notify-role` | Email de notificación al cambiar rol de usuario |

---

## Tokens CSS (css/styles.css)

```css
--bg, --srf, --srf2      fondos (gris claro, blanco, gris muy claro)
--bdr                    borde (#e0e0e0)
--txt, --txt2, --txt3    texto (oscuro → gris claro)
--ink, --ink-l, --ink-ll color primario del centro (por defecto azul Google #1a73e8)
--amb, --amb-l           ámbar (avisos)
--red, --red-l           rojo (errores)
--r, --r-sm              border-radius (12px, 8px)
--sh, --sh-lg            sombras
```

`applyTheme(colorPrimario, logoUrl)` en `auth.js` sobreescribe `--ink` y derivadas con el color del centro. Se llama en: login, cambio de centro (superadmin), y `goHome()`.

---

## Flujo de arranque

```
DOMContentLoaded (config.js)
  → sb.auth.getSession()
  → loadUserProfile(user)        [auth.js]
      → sb.from("profiles")
      → sb.from("centros")       (superadmin carga todos)
      → applyTheme()
      → showTab("chat")
          → loadComedor()        si tab comedor activo
          → initSustPanel()      si tab sust activo
          → loadAdmin()          si tab admin activo
      → initWelcomeExtras()      [mejoras.js]
          → loadDashboard()
          → loadMisHijos()
          → loadComedorHijos()   solo familia + módulo comedor
```

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

### Bolsa de guardias con equidad (guardias.js)
- `loadBolsaGuardias()`: cuenta `sustituciones.profesor_sustituto` del trimestre actual → ranking menor→mayor
  - Profesores del ranking: todos los que aparecen en `horarios_grupo` + los que ya hicieron guardia ese trimestre
  - Barra de progreso relativa + badge: verde (0) · azul (1-3) · ámbar (4-6) · rojo (7+)
- `getGuardiaCountsByName()`: devuelve mapa `{nombre: count}` usado por `admin.js` para ordenar el selector de sustitutos
- `registrarGuardiaEnBD(nombre, fecha, tramo, grupo)`: resuelve `profile_id` por `ilike(full_name)` e inserta en `guardias_realizadas` con `ausencia_id: null`
- Card "Bolsa de guardias" integrada en `panel-sust`, se recarga al abrir el tab y tras cada registro
- Helpers: `_guardiaTrimActual()`, `_guardiaTrimDates(trim)`, `_guardiaCursoActual()`

---

## Estado del proyecto (2026-05-22)

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
| `ausencias_profesor` | ✅ OK | Creada con migration + ALTER TABLE para campos extra |
| `guardias_realizadas` | ✅ OK | Creada con `rrhh_migration.sql` |
| `incidencias` | ✅ OK | Creada con SQL del CLAUDE.md (sesión anterior) |
| `espacios` | ✅ OK | Creada con SQL del CLAUDE.md (sesión anterior) |
| `reservas_espacios` | ✅ OK | Creada con SQL del CLAUDE.md (sesión anterior) |

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
| Administración | — | — | ✅ | ✅ |
| Usuarios | — | — | ✅ (su centro) | ✅ (todos) |

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
```

---

## Automatizaciones n8n

n8n instalado en local (`http://localhost:5678`). Los workflows se versionan como JSON en el repo y se importan manualmente en n8n.

### Briefing matutino (`n8n-briefing-matutino.json`)

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
| Send Resend | httpRequest | POST `https://api.resend.com/emails` con body `{from, to, subject, html}` |

**Claves a configurar:** editar las líneas 1-2 del nodo "Config y fechas":
```js
const SUPABASE_KEY = 'eyJ...service_role_key...';
const RESEND_KEY   = 're_...resend_api_key...';
```

**Notas de implementación:**
- `asistencia_comedor` se obtiene con `fetch()` dentro de Build Emails en lugar de un nodo HTTP separado — evita que un resultado vacío corte el workflow
- `_get(name)` soporta ambos modos de n8n: respuesta como array único o auto-dividida en items
- `to` se castea explícitamente a `String` y se filtra con `.includes('@')` antes de enviar
- El email HTML usa `<table>` para compatibilidad con clientes de correo; atributos en comillas simples dentro de template literals

**Para importar:** Workflows → Import from file → `n8n-briefing-matutino.json` → guardar → editar Config y fechas → Execute Workflow para probar → activar toggle.

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

---

## Funcionalidades pendientes

### Alta prioridad
- [x] **Marcar sustitución como cubierta** — toggle en la fila de la tabla, actualiza campo `cubierta` en BD.
- [x] **Contador de profesores ausentes** — `stat-ausentes` ahora cruza con `sustituciones` del día y cuenta profesores únicos ausentes.

### Media prioridad
- [x] **Módulo de incidencias** — `js/incidencias.js` creado. Panel con formulario (tipo, fecha, alumno, grupo, descripción), filtros abiertas/cerradas/todas, cierre y eliminación. `stat-incidencias` en dashboard admin ahora consulta la BD. Tabla `incidencias` creada en Supabase con RLS.
- [x] **Módulo de espacios/salas** — `js/espacios.js` creado. Grid de disponibilidad por tramo horario. Admin puede añadir/eliminar espacios. Toggle en users.js activado. Tablas `espacios` y `reservas_espacios` creadas en Supabase con RLS.
- [x] **PWA Service Worker** — `sw.js` creado con cache-first para assets locales y pass-through para Supabase. Registrado en `app.html`.
- [x] **Notificaciones Realtime** — `initRealtimeNotifications()` en `mejoras.js` suscribe a INSERT en `sustituciones` vía Supabase Realtime. Toast + outline en tab cuando llega nueva sustitución.

### Baja prioridad / mejoras
- [ ] **Página de recuperación de contraseña** — funciona via hash pero la UX es mejorable.
- [ ] **Onboarding de nuevo centro** — flujo guiado para configurar info_centro, importar horarios y alumnos.
- [ ] **Vista móvil mejorada** — la app funciona en móvil pero no está optimizada.
- [ ] Limpiar `repomix-output.xml` y `edubot-supabase (1).html` del repo (añadir a `.gitignore`).

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

---

## Registro de cambios recientes

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
