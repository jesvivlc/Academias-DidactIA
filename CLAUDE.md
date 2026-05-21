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
index.html              Landing page (Playfair + Geist, Navy/Blue/Amber)
app.html                Aplicación: login, header, tabs, paneles
css/styles.css          Tokens CSS + estilos globales
js/
  config.js             SB_URL, SB_KEY, variables globales, boot DOMContentLoaded
  auth.js               doLogin, loadUserProfile, showTab, applyTheme, goHome
  chat.js               sendMsg, buildContext, horarios por grupo, Gemini fetch
  comedor.js            loadComedor, toggleAsistencia, histórico 30 días, CSV export
  admin.js              loadAdmin, loadSustituciones, registrarSustitucion, initSustPanel
  mejoras.js            loadDashboard, loadComedorHijos, buscarAlumnoRapido, toggleVoice
  users.js              loadUsersPanel, inviteUser, changeRole, toggleModulo
manifest.json           PWA manifest (sin service worker aún)
scripts/
  importar_horarios_profes.py   Import CSV de horarios → Supabase
```

---

## Tablas de Supabase

| Tabla | Campos clave | Notas |
|-------|-------------|-------|
| `centros` | id, nombre, modulos_activos[], color_primario, logo_url | Configura tematización y módulos |
| `profiles` | id, user_id, full_name, email, rol, centro_id | Extiende auth.users |
| `info_centro` | centro_id, nombre_config, datos (jsonb), visible_para | Contexto del chatbot |
| `horarios` | centro_id, dia, hora, profesor, actividad | Tabla legacy — chatbot búsqueda por apellido |
| `horarios_grupo` | centro_id, grupo_horario, dia, tramo, hora_inicio, hora_fin, actividad_nombre, profesor_nombre, aula | Tabla principal — lógica horaria directa |
| `alumnos` | centro_id, nombre, curso, grupo_horario | Vinculados vía familia_alumno |
| `familia_alumno` | profile_id, alumno_id | N:M familias↔alumnos |
| `asistencia_comedor` | centro_id, alumno_id, fecha, se_queda, plaza_fija, registrado_por | Una fila por alumno/día |
| `sustituciones` | centro_id, fecha, hora_inicio, hora_fin, tramo, grupo_horario, profesor_ausente, profesor_sustituto, observaciones, cubierta, creado_por | Campo `cubierta` existe pero sin UI |

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
- Registro: profesor ausente, sustituto (filtrado a profesores de guardia), grupo, tramo, fecha, observaciones
- `initSustPanel()`: auto-detecta tramo actual por hora del sistema, pre-rellena fecha con hoy
- Filtros "Hoy / Esta semana / Todo" con estado activo visual (`sustFiltroActivo`)
- Contador en el tab: "🔄 Sustituciones (N)" cuando hay sustituciones hoy
- Badges ✓ Cubierta / ⚠ Pendiente
- Exportación CSV completa del historial
- Eliminación desde la tabla

### Dashboard por rol (mejoras.js)
- `familia`: hijos con estado comedor del día, próximas reuniones, quick actions
- `profesional`: acceso rápido a horario y sustituciones
- `admin/superadmin`: contadores guardias sin cubrir / profesores ausentes / incidencias
- Búsqueda rápida de alumno con debounce 280ms (solo admin/profesional/superadmin)
- Historial de preguntas recientes en localStorage por usuario
- Input de voz (Web Speech API, es-ES)

### Gestión de usuarios (users.js)
- Invitación por email con rol y centro
- Lista de usuarios con cambio de rol en línea + notificación email
- Toggle de módulos por centro (actualmente solo `comedor`)

### Administración (admin.js)
- Editor de `info_centro` (10 campos, con visibilidad por rol)
- Visor de horarios en tabla
- Estadísticas: nº configs, nº entradas de horario

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
- [ ] **Marcar sustitución como cubierta** — el campo `cubierta` existe en BD pero no hay botón en la UI para cambiarlo. Añadir toggle en la fila de la tabla.
- [ ] **Contador de profesores ausentes** — `stat-ausentes` en el dashboard de admin siempre muestra "—". Cruzar con tabla `sustituciones` del día para contar profesores únicos ausentes.

### Media prioridad
- [x] **Módulo de incidencias** — `js/incidencias.js` creado. Panel con formulario (tipo, fecha, alumno, grupo, descripción), filtros abiertas/cerradas/todas, cierre y eliminación. `stat-incidencias` en dashboard admin ahora consulta la BD. **Requiere crear tabla `incidencias` en Supabase** (ver SQL más abajo).
- [x] **Módulo de espacios/salas** — `js/espacios.js` creado. Grid de disponibilidad por tramo horario. Admin puede añadir/eliminar espacios. Toggle en users.js activado. **Requiere crear tablas `espacios` y `reservas_espacios` en Supabase** (ver SQL más abajo).
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

**Orden de carga de scripts en app.html:**
```html
<script src="js/config.js"></script>   <!-- globals + boot -->
<script src="js/auth.js"></script>      <!-- auth + navegación -->
<script src="js/users.js"></script>
<script src="js/admin.js"></script>
<script src="js/chat.js"></script>
<script src="js/comedor.js"></script>
<script src="js/mejoras.js"></script>
```

---

## Protocolo al terminar cada tarea

Al completar cualquier tarea o funcionalidad, seguir este orden **antes de continuar**:

1. **Actualizar este CLAUDE.md** — marcar lo completado en "Funcionalidades pendientes", añadir decisiones técnicas nuevas, actualizar tablas de BD si hubo cambios de esquema.
2. **Commit del CLAUDE.md** junto con los archivos de la tarea.
3. **Confirmar con el usuario** antes de pasar al siguiente sprint o tarea.


---

## SQL pendiente de ejecutar en Supabase

### Tabla `incidencias`
```sql
CREATE TABLE public.incidencias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL DEFAULT 'convivencia',
  descripcion text NOT NULL,
  alumno_nombre text,
  grupo_horario text,
  registrado_por uuid,
  estado text NOT NULL DEFAULT 'abierta',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centro_isolation" ON public.incidencias FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE user_id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE user_id = auth.uid()) = 'superadmin'
  );
```

### Tablas `espacios` y `reservas_espacios`
```sql
CREATE TABLE public.espacios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  capacidad int
);
ALTER TABLE public.espacios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centro_isolation" ON public.espacios FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE user_id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE user_id = auth.uid()) = 'superadmin'
  );

CREATE TABLE public.reservas_espacios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  espacio_id uuid REFERENCES public.espacios(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tramo int NOT NULL,
  hora_inicio text,
  hora_fin text,
  reservado_por uuid REFERENCES public.profiles(id),
  motivo text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.reservas_espacios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centro_isolation" ON public.reservas_espacios FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE user_id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE user_id = auth.uid()) = 'superadmin'
  );
```

> **Nota Realtime:** Para que las notificaciones de sustituciones funcionen, activar Realtime en la tabla `sustituciones` desde el dashboard de Supabase → Database → Replication.

---

## Registro de cambios recientes

- `2026-05-21 23:22` · `5948071` — docs: añadir protocolo de cierre de tarea a CLAUDE.md
