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
| Testing e2e | Playwright 1.60 + Chromium (`npm run test:e2e`) |
| Exportación | SheetJS/xlsx 0.18.5 (Excel) + jsPDF 2.5.1 (PDF), vía CDN en `app.html` |

## Centros activos

- **IES Buñol** — centro de pruebas, menos crítico
- **Agora Lledó** — centro de producción

---

## Arquitectura multi-tenant

Cada centro tiene `centro_id` único. Toda consulta a Supabase filtra por `centro_id`.

**Roles:**
- `familia` — ve sus hijos vinculados, comedor, chatbot personal
- `profesional` — ve su horario, sustituciones, comedor
- `orientador` — igual que profesional + acceso a módulo Orientación
- `admin` — gestión completa de su centro
- `admin_institucional` — admin multi-centro (vinculado a institución; selector de centro propio)
- `director` / `jefatura` — igual que admin a efectos de módulos
- `superadmin` — acceso global (sin `centro_id`). Cuenta: jesvivlc+admin@gmail.com

**Auth:** JWT con ECC (nunca volver a HMAC). RLS activa en todas las tablas.

---

## Estructura de archivos

```
index.html                      Landing page (Playfair + Geist, Navy/Blue/Amber)
app.html                        Aplicación: login, header, tabs, paneles
css/styles.css          Tokens CSS + estilos globales
js/
  config.js             SB_URL, SB_KEY, VAPID_PUBLIC_KEY, variables globales, boot DOMContentLoaded (llama themeLoginScreen pre-login)
  auth.js               doLogin, loadUserProfile, showTab, applyTheme, themeLoginScreen (marca centro pre-login), goHome
  chat.js               sendMsg, buildContext, horarios por grupo, Gemini fetch
  comedor.js            loadComedor, toggleAsistencia, histórico 30 días, export Excel
  admin.js              loadAdmin, loadSustituciones, registrarSustitucion, initSustPanel
  mejoras.js            loadDashboard, loadComedorHijos, buscarAlumnoRapido, toggleVoice
  users.js              loadUsersPanel, inviteUser, changeRole, toggleModulo
  incidencias.js        loadIncidencias, registrarIncidencia, tipificarIncidenciaIA, initIncidenciasPanel
  espacios.js           loadEspacios, reservarEspacio
  rrhh.js               loadRrhhPanel, solicitarAusencia, aprobarAusencia, rechazarAusencia
  guardias.js           loadBolsaGuardias, getGuardiaCountsByName, registrarGuardiaEnBD
  ib.js                 loadIbPanel (plazos IB, CAS, Extended Essay)
  comunicados.js        initComunicadosPanel, enviarComunicado (email vía send-comunicado + push a familias destinatarias vía _comPushFamilias/send-push), _comCheckAndBadge. **Multi-idioma**: el modal de detalle (`_comVerComunicado`) tiene selector de idioma (es/en/fr/ar/ro/uk/zh/de/pt); `_comTraducir` traduce título+cuerpo con Gemini (EF chat, `_comIA` role:familia), cacheado por (comunicado,idioma), RTL para árabe, "Español" restaura el original
  familias.js           initFamiliaView, loadFamiliaComedor, loadAvisos, initPushFamilias (suscripción Web Push: banner + pushManager.subscribe + INSERT push_subscriptions)
  planner.js            initPlannerPanel, _generarHorario (CSP+H-MRV-SA), plannerPublicar, drag & drop tablero, Dictar tab, Importar (.xlsx → planner_inputs)
  analytics.js          initAnalyticsPanel, CMI Cuadro de Mando Integral, alertas predictivas psicosociales (pill "Dashboard" del módulo Análisis)
  calificaciones.js     initCalificaciones (gradebook): vista profesor (entrada notas; al guardar, push "nueva calificación" a familias de notas que cambiaron vía _calNotificarFamilias; **botón "✨ Comentarios IA"** `_calGenComentarios` → 1 llamada a Gemini (EF chat, `_calIA`, role:familia) que devuelve un comentario de boletín por alumno con nota, rellena solo las observaciones vacías, editable) / vista dirección (consulta + export CSV/PDF lista + **boletín PDF por alumno** en el split detail) / vista familia (solo lectura: tabla pivote asignatura×evaluación de sus hijos, selector si >1 hijo). **Boletín PDF** `_calBoletinPDF(hijo?, btnId?)` (jsPDF+autotable, helpers de informes.js): familia → hijo seleccionado (por `alumno_id`); dirección → `_calAbrirAlumno` guarda `window._calAdminAlumno {nombre,grupo}` y el botón consulta por `alumno_nombre`+`grupo`. Incluye tabla pivote asignatura×evaluación + sección **"Observaciones del profesorado"** con las observaciones no vacías (los comentarios IA editados/guardados)
  materiales.js         initMateriales (hub de materiales): subida multi-grupo a Storage privado/enlace, descarga signed URL, toggle "Mis materiales/Todos", form "solo mis clases"
  informes.js           initInformes (Informes de dirección): PDF consolidado por periodo (jsPDF + autotable, logo+color del centro); solo lee tablas existentes (pill "Informes PDF" del módulo Análisis)
  orientacion.js        initOrientacion (módulo Orientación): lista de expedientes, expediente individual (4 pestañas), IA (borrador informe + síntesis cuestionarios vía EF chat), panel de riesgo (detección IA), exportación RGPD (PDF) + estadísticas (Chart.js/PDF/Excel), push (send-push), portal familias
  calidad.js            initCalidad (módulo Calidad): dashboard 5 métricas, No Conformidades (lista/filtros/modal+voz+IA/CAPA), Feedback Familias (lista/sentimiento IA/respuesta IA); helper _calGemini reutilizable
  alumnos.js            initAlumnos (módulo Alumnos): directorio del centro (lista+búsqueda+filtro por grupo) + ficha individual (alumnosAbrirFicha: familias vinculadas, horario semanal, comedor 14d, incidencias, calificaciones). No familia
  asistencia.js         abrirPasarLista (modal fullscreen pasar lista de clase): toggle Presente/Retraso/Ausente + observacion; UPSERT asistencia_clase; push familias (ausente=inmediato, retraso=al confirmar). window._asistCambiarEstado, window._asistConfirmar, window._asistCerrar. + initAsistenciaVista (tab "Pasar lista" #panel-pasarlista) con **toggle Pasar lista / Informe**: (a) **Pasar lista** — selector de fecha (hoy/días anteriores) + (admin) grupo → clases del día con resumen ✓/⚡/✗ y botón; (b) **Informe** (`_asistInformeCargar`) — rango de fechas + grupo → tabla por alumno (presente/retraso/ausente/total/% asistencia, ordenada por ausencias desc) + KPIs (registros, ausencias, retrasos, alumnos con ≥3 ausencias) + export Excel (`_asistInformeExportar`). Profesor: sus grupos (match por tokens); dirección: selector de grupo. `_aEnsureStyles` comparte estilos (idempotente)
  tutoria.js            initTutorias (módulo Tutorías): vista profesional (Mis citas: confirmar/cancelar/realizada/notas_tutor + **acta PDF** `_tutActaPDF` en citas confirmadas/realizadas — jsPDF, helpers de informes.js, incluye notas_tutor → solo vista profesor por privacidad + Mi disponibilidad: CRUD ventanas semanales por grupo) / vista familia (selector hijo → disponibilidad del tutor → date picker → sub-slots → solicitar + Mis citas: historial+cancelar) / vista admin/dirección (tabla read-only). Push tutor←→familia vía EF send-push. CSS self-contained _tutEnsureStyles. Tablas: tutoria_disponibilidad + tutoria_citas (UNIQUE disp_id+fecha+hora_inicio)
  agenda.js             initAgenda (Agenda del Centro): calendario mensual unificado — sustituciones + tutorías + salidas + ausencias + **eventos del centro** (`eventos_centro`). Split-view: grilla mes (izquierda 340px) + panel del día (derecha). Eventos coloreados por tipo (danger=sust sin cubrir, success=sust cubiertas, #7A5C9E=tutorías, info=salidas, warning=ausencias, #1F7A8C=eventos). **"+ Nuevo evento"** (admin/dir/jefatura) → modal (título/fecha/hora opcional/tipo/visible_para/descripción) → INSERT; borrables desde el panel de día por staff. Exportación `.ics` (`_agExportICS`). RLS filtra por rol. CSS self-contained _agEnsureStyles.
  encuestas.js          initEncuestas (Encuestas a familias): dirección crea encuestas (preguntas escala/opción/sí-no/texto, destinatarios todos|grupo, anónima, cierre) → publica (push) → resultados agregados (medias/barras/textos); familia responde (anti-doble-respuesta). Tablas encuestas + encuesta_respuestas
  menu.js               renderMenuComedor(target, opts) (vista semanal de solo lectura) + menuComedorEditor (editor por semana, dirección). Vista "Menú" en Comedor + bloque en home de familias (#fh-menu, hideIfEmpty). Tabla menu_comedor (upsert por centro+fecha)
  recursos.js           initRecursos (Préstamo de recursos): pills Préstamos (activos+vencidos+historial, devolver) e Inventario (CRUD recursos, prestar). Sincroniza recursos.estado. Tablas recursos + prestamos. Staff, no familia
  actas.js              initActas (Actas de reuniones): dictado/pegado de notas → "✨ Generar acta con IA" (EF chat role:familia, JSON resumen/acuerdos/tareas editable) → guardar; lista por fecha, detalle, PDF (helpers de informes.js). Tabla actas_reunion. Dirección
  prevision.js          window.preverCobertura (sin tab): botón "Previsión" en Sustituciones → sustituciones futuras sin cubrir (14d), cruza horarios_grupo para profesores libres, ordena por equidad (getGuardiaCountsByName), asigna sugerido en un clic (_prevAsignar → UPDATE + guardia + notify-sustitucion)
  documentos.js         initDocumentos (Biblioteca de documentos): tablón de circulares/normativa/PGA/calendario/formularios; dirección sube archivo (bucket privado `documentos-centro`, signed URL) o enlace con categoría + visible_para (todos/familias/staff); filtro por categoría; descarga según rol (RLS). Tabla documentos_centro
  participacion.js      initParticipacion (pill "Participación familiar" en Análisis): KPIs de familias registradas/con push/que respondieron encuestas/que pidieron tutoría + tasa autorización de salidas + respuesta por encuesta. Solo lee tablas existentes
  palette.js            command palette global ⌘K (alumnos/profesores/aulas)
sql/
  planner-tables.sql    DDL: materias, aulas, disponibilidad_profesor, necesidades_lectivas, horario_generado
supabase/migrations/
  calificaciones.sql    DDL gradebook: tabla calificaciones + RLS (4 políticas) + índices
  planner_inputs.sql    DDL entrada del Planner: 7 tablas planner_* + RLS por centro
  planner_grupos.sql    DDL tabla planner_grupos (hoja "Grupos") + RLS
  materiales.sql        DDL materiales + RLS + bucket privado 'materiales' + RLS de Storage
  orientacion_base.sql  DDL Orientación: 6 tablas (expedientes_orientacion, informes_psicopedagogicos, medidas_atencion, cuestionarios_docentes, tramites_orientacion, alertas_orientacion) + índices + RLS por centro
  tutorias.sql          DDL Tutorías: tutoria_disponibilidad + tutoria_citas + RLS (5 políticas: staff ALL + familia read/CUD propio) + índices
  eventos_centro.sql    DDL eventos_centro (Agenda) + RLS ev_read/ev_manage + índice
  encuestas.sql         DDL encuestas + encuesta_respuestas + RLS por centro/rol + índices (UNIQUE anti-doble-respuesta)
  menu_comedor.sql      DDL menu_comedor + RLS menu_read/menu_manage + UNIQUE(centro,fecha)
  recursos.sql          DDL recursos + prestamos + RLS staff-only + índices
  actas_reunion.sql     DDL actas_reunion (resumen IA claustros) + RLS actas_all + índice
  documentos_centro.sql DDL documentos_centro + RLS + bucket privado documentos-centro + RLS de Storage
  tutoria_espera.sql    DDL tutoria_espera (lista de espera tutorías) + RLS + índice
manifest.json                   PWA manifest (start_url /app.html, scope /, iconos SVG incl. maskable, id, categories)
sw.js                           Service Worker (network-first, precache de todos los js/, push handler con icono inline, notificationclick → enfoca/abre /app.html). CACHE didactia-v11
n8n-briefing-matutino.json      Workflow n8n: briefing matutino automático (importar en n8n)
tests/
  aislamiento-centros.spec.js   Playwright e2e: RLS multi-tenant (Agora vs Buñol)
scripts/
  importar_horarios_profes.py   Import CSV de horarios → Supabase (service_role desde env)
  importar_alumnos.mjs          Import CSV masivo de alumnos + vínculos de familia (idempotente; `SUPABASE_SERVICE_ROLE_KEY` desde env). Uso: `SUPABASE_SERVICE_ROLE_KEY=… node scripts/importar_alumnos.mjs <csv> <centro_id> [--dry-run]`
playwright.config.js            Config Playwright: chromium, baseURL didactia.eu, dotenv
.env.example                    Plantilla de credenciales para tests (nunca commitear .env)
```

---

## Edge Functions (Supabase)

| Función | Propósito |
|---------|-----------|
| `chat` | Proxy a Gemini 2.5 Flash con function calling. Path A: confirmación de herramienta (`confirm_tool/confirm_args/pending_contents`). Path B: chat normal → devuelve `{type:"text"}` o `{type:"tool_call"}`. Herramientas: `crear_sustitucion`, `crear_incidencia`, `consultar_profesor_libre` (auto-execute), `registrar_ausencia_profesor`, `avisar_comedor`, `listar_tramos_centro` (auto-execute), `crear_tramos_centro`, `generar_tramos_horario`, y edición de `horario_generado` del Planner: `mover_clase`, `eliminar_clase`, `añadir_clase`, `cambiar_profesor`, `asignar_profesor` (un slot), `asignar_profesor_materia` (masivo: todas las clases de una materia en el centro) (todas requieren confirmación; resuelven materia/profesor por nombre o ID y validan hard constraints HC-MATERIA-DIA/HC-VENTANA/HC-INICIO-FIN + disponibilidad y ocupación de profesor/grupo) |
| `invite-user` | Crea usuario en auth + envía email con link. Requiere `caller_user_id` |
| `notify-role` | Email de notificación al cambiar rol de usuario |
| `notify-sustitucion` | Notifica cuando jefatura asigna sustituto (`evento: asignacion\|cobertura`). Email al **ausente**: "tu ausencia queda cubierta por X". Email al **sustituto**: grupo, tramo, instrucciones del ausente. Busca emails en `profiles` por `full_name ilike`. Requiere `RESEND_API_KEY`. |
| `notify-ausencia` | Notificación consolidada a admins del centro cuando un profesor notifica su ausencia. Payload: `{centro_id, profesor_nombre, fecha, fecha_fin?, tipo_ausencia, motivo?, grupos, instrucciones}`. Incluye tabla HTML con fecha-rango, motivo y bloque de instrucciones para sustituto. |
| `notify-justificante` | Recordatorio automático de justificante pendiente. Busca `sustituciones` con `fecha ≤ hace48h`, `creado_por != null` y sin `§JUST§` en `observaciones`. Envía email al profesor ausente. Programado via pg_cron a las 08:00 UTC. POST `{}` → todos los centros; POST `{centro_id}` → solo ese centro. |
| `tipificar-incidencia` | Clasifica incidencia con Gemini 2.5 Flash según normativa CCAA del centro. Recibe `{ descripcion, centro_id }`. Devuelve `{ gravedad, tipo_normativo, medidas, informe_borrador, normativa_ref, paradigma, protocolo_previ, alerta_urgente? }` |
| `notify-jefatura` | Email de alerta a admins del centro cuando se registra incidencia grave/muy_grave. Recibe `{ incidencia_id }`. Incluye informe borrador, medidas y banner PREVI si aplica |
| `send-comunicado` | Envía comunicado por email a los destinatarios del centro vía Resend. Recibe `{ comunicado_id }`. Enruta por `destinatarios`: todos/solo_profesores/solo_familias/grupo:XXXX |
| `parse-restricciones` | Analiza texto libre y/o audio con Gemini 2.5 Flash multimodal. Recibe `{ texto?, audio_base64?, mime_type?, centro_id }`. Devuelve `{ materias[], restricciones_profesor[], restricciones_materia[], necesidades[], preguntas[] }`. Contexto del centro (profesores y materias existentes) inyectado para matching exacto de nombres. |
| `agent-sustituciones` | **Agente autónomo** (Gemini 2.5 Flash, function calling en bucle). Recibe `{centro_id, fecha}` + JWT del usuario (cliente con RLS por centro). 3 herramientas en secuencia: `obtener_ausencias_sin_cubrir` (siempre 1ª; si vacío → para), `buscar_profesores_libres`, `sugerir_sustituto` (equidad por guardias del trimestre, top 3). `centro_id` SIEMPRE el del body; `.eq("centro_id", …)` en las 3 queries. Devuelve `{type:"text", content}`. Código: `supabase/functions/agent-sustituciones/index.ts`. **Fix 2026-06-17 (✅ desplegado, v12):** `_calcularLibres` ahora excluye también a los profesores que figuran como `profesor_ausente` en alguna sustitución de esa fecha (antes, un profe ausente todo el día con un hueco libre podía sugerirse para cubrir a otro). |
| `send-push` | Envía Web Push (web-push + VAPID) a `user_ids[]`. Lee suscripciones de `push_subscriptions` (service_role), payload `{title, body, tag}`. Auto-borra suscripciones `410/404`. Secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` configurados |

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
- `updateBentoDashboard()`: gestiona secciones de rol del Inicio y topbar; calcula el subline "Fecha · Rol" de la cabecera compacta, fija `#topbar-ctr-name`, e invoca `renderMiHorarioHoy()` + `renderHomeMetrics()` (staff/admin) y `renderHomeFamilia()` (familia)
- `syncBentoMetrics()`: legacy, ahora no-op inocuo (las métricas viejas `#bento-*` ya no existen; sigue null-guarded)

### Home rediseñada (2026-06-05)
La pantalla de Inicio (`#panel-chat` en `app.html`) se reorganizó alrededor del horario del día y se eliminaron duplicaciones con el sidebar:
- **Cabecera compacta** `.home-head` (sustituye la banda azul `.cls-banner`): saludo + "Jueves 5 de junio · Profesor".
- **Buscador protagonista** `.home-search` (readonly) que abre el command palette; el buscador del topbar global se eliminó.
- **Topbar minimalista**: logo (`#app-brand-logo`, tematizado por `applyTheme`) + nombre del centro (`#topbar-ctr-name`) + lupa (`#topbar-search-btn` → palette) + avatar. Sin role-switch/IA/campana.
- **"Mi horario de hoy"** `.home-card` (`renderMiHorarioHoy` en `js/mejoras.js`): consulta `horarios_grupo` por centro+día (día en minúsculas sin tilde), cruza `full_name` vs `profesor_nombre` por tokens normalizados, resalta la clase AHORA por `hora_inicio/fin` reales.
- **Métricas accionables** `.home-metric` (`renderHomeMetrics`): Sustituciones hoy / Comunicados nuevos (rojo si >0) / Incidencias abiertas, clicables a su sección.
- **Home familia** (`renderHomeFamilia` en `js/mejoras.js`): render en `#familia-home-content` dentro de `#inicio-familia`. Estado `_homeFamiliaHijoIdx` (chip selector si hay >1 hijo). Es el **hub del portal familiar**: 7 bloques async fire-and-forget (cada uno con try/catch independiente), en orden: (0) **Avisos** (`#fh-avisos`) — aviso importante del centro (`info_centro.aviso_activo`, respeta `visible_para`) + **Cambios en clases hoy** (`sustituciones` del `grupo_horario` del hijo, hoy, con badge Cubierta/Pendiente); (1) Horario de hoy — `horarios_grupo` por `grupo_horario+dia+curso_escolar`; (2) **Comedor accionable** — estado de hoy + botón "📩 Avisar que no come mañana" (`window._fhAvisoManana` → upsert `asistencia_comedor` se_queda=false para mañana + `renderHomeFamilia(true)`), solo si módulo activo; (3) Incidencias recientes — RPC `familia_incidencias_hijos()` (SECURITY DEFINER; la tabla `incidencias` es staff-only por RLS), filtrado en cliente por el hijo, limit 3; (4) Próximas salidas — `participantes_salida` → `salidas_didacticas` estado publicada ≥ hoy, limit 3; (5) Comunicados no leídos — reutiliza `_comGetLeidos()`, limit 3. `window._fhSelectHijo(idx)` cambia el hijo activo y fuerza recarga. Los bloques (0) consolidan el contenido del antiguo panel `panel-avisos`/`loadAvisos` (huérfano: no tiene `nav-avisos` en el sidebar). El sidebar oculta los encabezados de grupo (`.sb-group-label`) cuyo grupo queda sin items visibles vía `syncGroupLabels()` (script inline de `app.html`), así la familia no ve "Administración" vacío.
- **Grids "Módulos"/"Acceso rápido" eliminados** (redundantes con el sidebar).
- **Command palette ⌘K** (`js/palette.js`): overlay global `#cmd-palette`, atajo ⌘K/Ctrl+K + lupa del topbar; busca alumnos, profesores y aulas (profesores/aulas se sacan de `profesores`/`espacios` **y** de `horarios_grupo`, deduplicados, porque muchos centros sólo tienen los datos en `horarios_grupo`).

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

### Convenciones de seguridad (añadidas 2026-05-29)
9. **Nunca** hardcodear la URL de Supabase — usar siempre `SB_URL` (definido en `config.js`)
10. **Nunca** almacenar contraseñas en `window.*` — usar variables de módulo (`let _regPass`)
11. **Siempre** sanitizar respuestas de Gemini antes de insertar en `innerHTML` (`_sanitizeReply` en `chat.js`)
12. En botones con `onclick` inline que incluyen nombres de usuario, usar `JSON.stringify` para escapar — nunca concatenar con comillas simples
13. **Nunca** hardcodear credenciales en tests — usar siempre variables de entorno (`process.env.*`). Plantilla en `.env.example`; el `.env` real está en `.gitignore`

### Convenciones UI / Design System
13. **No tocar archivos JS** para cambios de UI — solo `app.html` e `css/styles.css`
10. **No cambiar IDs existentes** — auth.js, mejoras.js y otros módulos los referencian por ID
11. Usar `var(--ink)` (NO colores navy fijos) en elementos que deben respetar la tematización por centro
12. `--ink` es el color del centro sobreescrito por `applyTheme()` — nunca asumir que es azul Google
13. Los archivos de referencia visual están en `design_handoff_didactia/`:
    - `VISUAL_FIDELITY.md` — checklist y especificaciones exactas (leer antes de tocar UI)
    - `screenshots/` — capturas de referencia; el output DEBE parecerse a estas
    - `reference/DidactIA.html` — prototipo navegable completo
17. Toda pantalla de UI debe pasar el checklist de la sección 9 de `VISUAL_FIDELITY.md` antes de declararse "hecha"

---

## Elección de modelo según tarea

**Sonnet** (default para todo lo rutinario):
- Ediciones CSS / HTML
- Cambios en módulos existentes (comedor, sustituciones, usuarios)
- CRUD JS, ajuste de funciones, copy de textos
- Añadir campos a formularios o tablas
- Tests Playwright (salvo diseño inicial)

**Opus** (escalar solo cuando lo necesites):
- Bugs que no se resuelven en 1-2 intentos con Sonnet
- Refactors que tocan más de 2-3 archivos a la vez
- Lógica de Edge Functions (chat, invite-user, notify-role)
- Cualquier cosa que involucre RLS o permisos de Supabase
- Nuevos módulos desde cero (espacios, email comedor)

**Opus con extended thinking Alto** (usar con criterio, consume cuota escasa):
- Decisiones de arquitectura que afectan a toda la app
- Análisis de seguridad / revisión de políticas RLS
- Cuando Opus normal no llega en 2 intentos

**Cómo cambiar de modelo en sesión:**
- Bajar a Sonnet: `/model claude-sonnet-4-6`
- Subir a Opus: `/model claude-opus-4-8`

El modelo por defecto configurado en settings.json es Sonnet.
Escalar a Opus es una decisión consciente, no el default.

---

## Cómo trabajar

```bash
# Ver estado del proyecto
git status && git log --oneline -5

# Después de cada cambio funcional
git add <archivos> && git commit -m "tipo: descripción" && git push
# Vercel despliega automáticamente desde main

# Tests e2e (requiere .env con credenciales — ver .env.example)
npm run test:e2e
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
> - _(ninguna)_
>
> **Migraciones ejecutadas** (ya en producción):
> - `supabase/migrations/documentos_centro.sql` — tabla `documentos_centro` (biblioteca de circulares/normativa/PGA) + RLS `docs_read`/`docs_manage` + bucket privado `documentos-centro` + 4 políticas de Storage por centro ✅ aplicado 2026-06-17 vía Management API
> - `supabase/migrations/tutoria_espera.sql` — tabla `tutoria_espera` (lista de espera de tutorías) + RLS (staff ALL + familia read/ins/del propio) + índice ✅ aplicado 2026-06-17 vía Management API
> - `supabase/migrations/eventos_centro.sql` — tabla `eventos_centro` (eventos generales de la Agenda) + RLS `ev_read`/`ev_manage` + índice ✅ aplicado 2026-06-17 vía Management API
> - `supabase/migrations/encuestas.sql` — tablas `encuestas` + `encuesta_respuestas` (encuestas a familias) + RLS por centro/rol + índices (incl. UNIQUE por familia anti-doble-respuesta) ✅ aplicado 2026-06-17 vía Management API
> - `supabase/migrations/menu_comedor.sql` — tabla `menu_comedor` (menú semanal del comedor) + RLS `menu_read`(todo el centro)/`menu_manage`(dirección) + UNIQUE(centro,fecha) ✅ aplicado 2026-06-17 vía Management API
> - `supabase/migrations/recursos.sql` — tablas `recursos` + `prestamos` (préstamo de material) + RLS staff-only + índices ✅ aplicado 2026-06-17 vía Management API
> - `supabase/migrations/actas_reunion.sql` — tabla `actas_reunion` (resumen IA de claustros) + RLS `actas_all` (dirección) + índice ✅ aplicado 2026-06-17 vía Management API
> - `supabase/migrations/tutorias.sql` — 2 tablas (`tutoria_disponibilidad` + `tutoria_citas`) + RLS (5 políticas: staff ALL + familia read/CUD propio) + índices. ✅ aplicado y verificado 2026-06-17 vía Management API (tutoria_citas 4 políticas, tutoria_disponibilidad 2). El módulo `js/tutoria.js` ya estaba desplegado pero sus tablas no existían en prod → quedaba roto hasta aplicar esto.
> - `supabase/migrations/bucket_documentos_justificantes.sql` — **fix bug pérdida de datos**: crea el bucket privado `documentos` + 4 políticas de Storage staff-only por centro (path `justificantes/{centro_id}/…`, `centro_id` = segmento `[2]`). `js/admin.js` subía justificantes a este bucket pero no existía → se perdían en silencio (`.catch(()=>{})`, ahora con `console.warn`). ✅ aplicado y verificado 2026-06-16 vía Management API (bucket privado + documentos_read/insert/update/delete)
> - `supabase/migrations/rls_familia_lockdown_fase3.sql` — **fix privacidad RGPD (fase 3)**: restricciones para `sustituciones` (familia: SELECT solo grupos de sus hijos), `comunicados` (familia: SELECT sin `solo_profesores` y solo enviados), `salidas_didacticas` (familia: SELECT solo `estado='publicada'`), `participantes_salida` (familia: SELECT+UPDATE solo sus hijos), `notificaciones_salida` (staff-only). 10 políticas creadas. ✅ aplicado 2026-06-15 vía Management API
> - `supabase/migrations/asistencia_clase.sql` — tabla `asistencia_clase` + RLS `asistencia_clase_centro` + índice `idx_asistencia_clase_fecha` ✅ ejecutado 2026-06-13 vía Management API
> - `supabase/migrations/alergias_dietas.sql` — `alumnos.alergias` + `alumnos.dieta_especial` + `asistencia_comedor.nota_dia` ✅ ejecutado 2026-06-12 vía Management API
> - `supabase/migrations/rls_familia_lockdown_fase2.sql` — **fix privacidad RGPD (fase 2)**: `expedientes_orientacion`, `tramites_orientacion`, `incidencias` → staff-only; las familias obtienen sus datos vía RPCs `SECURITY DEFINER` `familia_tramites_visibles()` (trámites `visible_familia` de sus hijos) y `familia_incidencias_hijos()` (incidencias de sus hijos, solo campos visibles — no `informe_borrador`/`normativa_ref`); `feedback_familias`: `cal_fb_read`/`cal_fb_update` restringidas a staff (familia conserva lo suyo vía `feedback_centro`). JS acoplado desplegado (`oriRenderTramitesFamilia` y bloque incidencias de `renderHomeFamilia` → RPC). ✅ aplicado y verificado 2026-06-12 vía Management API (políticas + RPCs SECURITY DEFINER con EXECUTE para `authenticated`, ejecutan sin error).
> - `supabase/migrations/rls_familia_lockdown_fase1.sql` — **fix privacidad RGPD (fase 1)**: 7 tablas que ninguna vista de familia consume pasan a staff-only (`rol <> 'familia'`): `informes_psicopedagogicos`, `medidas_atencion`, `cuestionarios_docentes`, `alertas_orientacion`, `alertas_predictivas`, `no_conformidades`, `acciones_capa`. Antes, cualquier cuenta `familia` (que tiene `centro_id`) podía leer por API datos psicopedagógicos y de riesgo de TODOS los alumnos. ✅ aplicado y verificado 2026-06-12 vía Management API (9 políticas, todas excluyen `familia`). Fase 2 (tablas con lectura legítima de familia) pendiente — ver migraciones pendientes.
> - `supabase/migrations/calificaciones_familia_rls.sql` — **fix privacidad RGPD**: `cal_read` restringe a las familias a leer solo las notas de sus hijos (`familia_alumno.profile_id=auth.uid()`); staff lee su centro; superadmin todo. ✅ ejecutado y verificado 2026-06-12 vía Management API (qual incluye el subselect de `familia_alumno`)
> - `supabase/migrations/ib_avanzado.sql` — IB avanzado: tablas `ib_tok`, `ee_borradores`, `ib_resultados` (+RLS por centro) + `extended_essay.nota` ✅ ejecutado 2026-06-12 vía Management API
> - `supabase/migrations/horarios_curso_escolar.sql` — `horarios_grupo.curso_escolar` + `info_centro.curso_activo` + índice `idx_hg_curso` ✅ verificado en producción 2026-06-12 (columnas NOT NULL DEFAULT '2025-26', 2.733 filas pobladas)
> - `sql/calidad-tables.sql` — 6 tablas del módulo Calidad (`no_conformidades`, `acciones_capa`, `feedback_familias`, `documentos_calidad`, `plantillas_calidad`, `evaluaciones_platinum`) + RLS + políticas por centro ✅ verificado en producción 2026-06-12
> - `supabase/migrations/20260609_push_subscriptions.sql` — tabla `push_subscriptions` + RLS + índices ✅ 2026-06-09 vía Management API (confirmado)
> - `supabase/migrations/orientacion_base.sql` — 6 tablas de Orientación (`expedientes_orientacion`, `informes_psicopedagogicos`, `medidas_atencion`, `cuestionarios_docentes`, `tramites_orientacion`, `alertas_orientacion`) + índices + RLS por centro ✅ ejecutado 2026-06-11 vía Management API
> - `supabase/migrations/planner_inputs.sql` — 7 tablas de entrada del Planner (`planner_profesores/cargas/tramos/restricciones/disponibilidad/espacios/reglas`) + RLS por centro ✅ ejecutado 2026-06-09 vía Management API
> - `supabase/migrations/materiales.sql` — tabla `materiales` + RLS + bucket privado `materiales` + RLS de Storage ✅ ejecutado 2026-06-09 vía Management API
> - `supabase/migrations/planner_grupos.sql` — tabla `planner_grupos` (hoja "Grupos") + RLS ✅ ejecutado 2026-06-09 vía Management API
> - `supabase/migrations/calificaciones.sql` — tabla `calificaciones` + RLS (4 políticas) + índices ✅ ejecutado 2026-06-09 vía Management API
> - `supabase/migrations/20260605_cron_notify_justificante.sql` — pg_cron job `notify-justificante-daily` `0 8 * * *` + pg_net ✅ 2026-06-05
> - `supabase/migrations/20260605002_sustituciones_sustituto_nullable.sql` — `sustituciones.profesor_sustituto DROP NOT NULL` ✅ 2026-06-05 vía Management API
> - `sql/alertas-predictivas.sql` — tabla `alertas_predictivas` (Analytics CMI): tabla+RLS+policy ya existían; índice `idx_alertas_centro_activas` creado ✅ completado 2026-06-04 vía Management API
> - `sql/horario-generado-profesor-nullable.sql` — `horario_generado.profesor_id DROP NOT NULL` (horarios sin profesor) ✅ ejecutado 2026-06-04 vía Management API
> - `sql/fix-bugs-prod-2026-05-29.sql` — `ausencias_profesor.tramo DROP NOT NULL` + columnas IA incidencias ✅ ejecutado 2026-05-29
> - `sql/planner-tables.sql` — tablas planner + RLS + índices ✅ ejecutado 2026-05-27
> - `sql/add-incidencias-fields.sql` — campos IA en incidencias ✅ ejecutado 2026-05-29
> - `sql/fix-ausencias-tramo-nullable.sql` — `ausencias_profesor.tramo DROP NOT NULL` ✅ ejecutado 2026-05-29
> - Tabla `comunicados` + RLS ✅
> - Tablas RRHH (`profesores`, `ausencias_profesor`, `guardias_realizadas`) ✅

---

Ver también: @CLAUDE-MODULOS.md | @CLAUDE-TABLAS.md | @CLAUDE-ROADMAP.md | @CLAUDE-CHANGELOG.md


---

## Registro de cambios recientes
- `2026-06-17` · `a3b3c84` — fix(tramos): **auditoría y eliminación de tiempos hardcodeados de Agora** — 9 ubicaciones en 5 archivos; todos los módulos leen ahora `tramos_centro` del centro activo. Detalles en CLAUDE-CHANGELOG.md
- `2026-06-17 00:14` · `55d52cf` — fix(agent-sustituciones): día sin tilde en DIAS[] + limit(1) en info_centro
- `2026-06-16 23:52` · `5738525` — fix(sustituciones): corregir flujo ausencia profesor → admin approval
- `2026-06-16 17:47` · `df932b2` — fix(agent-sustituciones): excluir actividades 'guardia' del cómputo de ocupados
- `2026-06-16 17:37` · `1f56427` — fix(agent-sustituciones): usar hora_inicio para identificar ocupados + logging diagnóstico + .limit(5000) universo
- `2026-06-16 17:14` · `d5510e9` — fix(agent-sustituciones): universo de profes desde horarios_grupo + filtro curso_activo
- `2026-06-16 17:07` · `068fa09` — feat(agenda): Agenda del Centro — calendario mensual unificado
- `2026-06-16 16:54` · `362ce3b` — docs(CLAUDE.md): sesión 2026-06-16 — módulo Tutorías documentado
- `2026-06-16 16:51` · `37865ab` — feat(tutorias): módulo de reserva de citas tutor-familia
- `2026-06-16 16:33` · `6dd9a09` — docs: sesión 2026-06-16 portátil — asistencia informe, boletín PDF, PWA, push suite familias
- `2026-06-16` · `99f3006` — feat(familia): push a familias al enviar un comunicado
- `2026-06-16` · `442c2fa` — feat(calificaciones): boletín PDF por alumno también en la vista dirección
- `2026-06-16` · `fe8c566` — feat(familia): boletín de calificaciones en PDF descargable
- `2026-06-16` · `fe7eba4` — feat(familia): push de nuevas notas e incidencias a las familias
- `2026-06-16` · `637acee` — feat(pwa): app instalable para familias + SW v8
- `2026-06-16` · `b53abf6` — fix(storage): bucket 'documentos' faltante — justificantes se perdían en silencio
- `2026-06-16` · `eab94f3` — chore(qa): verify-columns + job static-checks en CI
- `2026-06-16` · `40c90ce` — test(rls): automatizar la cuenta familia de prueba en setup-test-users
- `2026-06-16` · `4d81205` — fix(qa): handlers rotos — JSON.stringify legacy + apóstrofo en nombre
- `2026-06-16` · `bc8d96c` — fix(css): regla .pill/.pill-active para los chips de filtro de Alumnos
- `2026-06-16` · `9358a8e` — feat(asistencia): informe/estadísticas de asistencia de aula por alumno
- `2026-06-16` · `03d2644` — feat(asistencia): vista "Pasar lista" por fecha
- `2026-06-16` · `6015db1` — feat(asistencia): permitir pasar lista de clases ya concluidas (mismo día)
- `2026-06-16` · `ebb1463` — fix: botón "Pasar lista" y handlers rotos por JSON.stringify en onclick="…"
- `2026-06-16` · `c25c95d` — docs(roadmap): fase 3 RLS confirmada aplicada en producción
- `2026-06-16` · `54c739d` — docs(CLAUDE.md): sesión 2026-06-16 — redesign Planner + Análisis documentado
- `2026-06-16` · `85bce6d` — feat(redesign): cabeceras Newsreader en paneles Planner y Análisis — header fijo eyebrow + h1 30px + subtítulo; tabs `.tabs-in-hdr`; banner tramos-warn con tokens design system; Analytics CSS oculta título duplicado JS; `planner-wrap` → `flex:1;min-height:0`
- `2026-06-16` · `8c0ce33` — docs(CLAUDE.md): sprint 4 planner cobertura documentado
- `2026-06-16` · `2038d33` — feat(planner): sprint 4 — cobertura del horario — `_calcCobertura()`, `plannerCobertura()` modal, badges ✓/⚠/❌ en selector de grupo, banner verde/ámbar en Publicar
- `2026-06-16` · `6b156e0` — feat(planner): sprint 3 — validación de viabilidad pre-generación — `_validarViabilidad()`, `plannerVerificar()` modal, `_diagnosticarFallo(grupo)`, botón "🔍 Verificar"
- `2026-06-16` · `cd739f4` — feat(planner): sprint 2 — vista por profesor cross-grupo + resumen de carga — `_renderProfesorView`, tab "👤 Profe", panel "Carga semanal"
- `2026-06-16` · `d791cf8` — fix(planner): sprint 1 — persistencia tablero + CSP timeout + confirmación regenerar — `_guardarHorarioGenerado` tras drop, límite 500k nodos, `TNUMS.length`, `IMPORT_CENTRO=ctrId`
- `2026-06-15 23:17` · `48e1608` — docs(CLAUDE.md): sesion 2026-06-15 — incidencias detalle, calificaciones split, flex panel fixes
- `2026-06-15 23:08` · `c29d6b0` — fix: flex-direction:column en paneles materiales, orientacion y calidad
- `2026-06-15 23:05` · `28b9753` — feat(calificaciones): split layout admin — lista + expediente de notas por alumno
- `2026-06-15 22:50` · `f78f661` — fix(comedor): añadir flex-direction:column al panel para que ocupe el ancho completo
- `2026-06-15 22:32` · `e83a655` — feat(incidencias): clic en fila abre panel de detalle
- `2026-06-15 22:23` · `16c388b` — fix(alumnos): quitar display:flex !important en #panel-alumnos — sobreescribía display:none y partía la pantalla
- `2026-06-15 22:18` · `6e240a1` — feat(familia): onboarding wizard primer acceso
- `2026-06-15 19:35` · `b69ae0e` — feat(alumnos): redesign split layout — lista + drawer de perfil
- `2026-06-15 06:50` · `4c869b7` — fix: agente detecta sustituciones sin sustituto + topbar nombre centro
- `2026-06-15 01:06` · `c21e4d9` — feat(mobile): rediseño móvil — hint reposicionado, tablas a tarjetas, espaciado optimizado, touch targets
- `2026-06-15 00:56` · `b124a72` — feat(familia): portal familiar rediseñado — hero alumno + nav rápido + reorden bloques
- `2026-06-15 00:41` · `690973c` — fix(chat): renombrar añadir_clase → agregar_clase en EF chat
- `2026-06-15 00:13` · `76e3c4c` — fix(seguridad RGPD): auditoría RLS fase 3 — sustituciones, comunicados, salidas, participantes
- `2026-06-14 22:56` · `89c0553` — feat(redesign): redesign visual 3 paneles — Asistente IA, Sustituciones, Incidencias
