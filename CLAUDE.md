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
  utils.js              Helpers globales centralizados: escH (escape HTML/XSS), escAttr (string JS), escArg (arg seguro para onclick="f('…')": JS + &quot;), hoyISO, fmtFecha, showToastGlobal, pushNotify. ÚNICA fuente de lógica de escape. Cargado ANTES de auth.js
  pdf-utils.js          Helpers PDF centralizados: pdfEnsureLibs (jsPDF+autotable on-demand), pdfCentroInfo, pdfHexToRgb, pdfHeader. Cargado ANTES de informes.js
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
  calificaciones.js     initCalificaciones (gradebook): vista profesor (entrada notas; al guardar, push "nueva calificación" a familias de notas que cambiaron vía _calNotificarFamilias; **botón "✨ Comentarios IA"** `_calGenComentarios` → 1 llamada a Gemini (EF chat, `_calIA`, role:familia) que devuelve un comentario de boletín por alumno con nota, rellena solo las observaciones vacías, editable; **botón "🎯 Competencial IA"** `_calGenCompetencial` → abre modal con selector de nivel por competencia LOMLOE (●●○○ Iniciado/En proceso/Adquirido/Avanzado) para cada alumno, comentario IA por alumno + plantilla auto-generada al cambiar niveles, persistencia en `comentarios_competenciales`, copia para Alexia SGA) / vista dirección (consulta + export CSV/PDF lista + **boletín PDF por alumno** en el split detail + sección competencial LOMLOE si hay datos) / vista familia (solo lectura: tabla pivote asignatura×evaluación de sus hijos, selector si >1 hijo). **Boletín PDF** `_calBoletinPDF(hijo?, btnId?)` (jsPDF+autotable, helpers de informes.js): familia → hijo seleccionado (por `alumno_id`); dirección → `_calAbrirAlumno` guarda `window._calAdminAlumno {nombre,grupo}` y el botón consulta por `alumno_nombre`+`grupo`. Incluye tabla pivote asignatura×evaluación + sección **"Observaciones del profesorado"** + sección **"Competencias clave LOMLOE"** (si hay datos en `comentarios_competenciales`). **Panel admin detalle** `_calAbrirAlumno` + `_calLoadCompetencialAdmin` (async fire-and-forget): tras mostrar la tabla de notas, carga y renderiza los niveles competenciales del alumno con pills de color por nivel
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

> **🔐 Seguridad EF (Fase 0, 2026-06-22):** `chat`, `alerta-psicosocial`, `send-push`, `invite-user` y `agent-sustituciones` derivan identidad/centro/rol del **JWT** (`auth.getUser`) + `profiles`, **nunca del body** (el `centro_id`/`role` del body se ignoran; el superadmin sí puede indicar centro). `agente-cobertura-diaria` y `notify-justificante` validan la cabecera `x-cron-secret` contra el secret `CRON_SECRET`. Regla: toda EF nueva deriva identidad del JWT, no del body.

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

> **Home / Inicio (rediseño 2026-06-05):** detalle histórico en `CLAUDE-ARCHIVE.md` §4. Resumen: `#panel-chat` reorganizado en torno al horario del día; `renderMiHorarioHoy` + `renderHomeMetrics` (staff/admin) y `renderHomeFamilia` (hub del portal familiar, 7 bloques async) en `js/mejoras.js`; command palette ⌘K en `js/palette.js`.

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
14. **Escapar siempre** datos de BD/usuario antes de insertarlos vía `innerHTML`: usar `escH()` de `utils.js` para texto/atributos, y `escArg()` para argumentos dentro de `onclick="f('…')"`. Los escapers locales por módulo (`_xxEsc`, etc.) ya delegan en estos helpers — no recrear lógica de escape, usar siempre los de `utils.js`.
15. **Edge Functions:** derivar identidad/centro/rol del JWT (`auth.getUser`), nunca del body

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

> **🔐 Secret pendiente — `CRON_SECRET` (Fase 0 seguridad):** Las Edge Functions cron `agente-cobertura-diaria` y `notify-justificante` validan ahora la cabecera `x-cron-secret` contra el secret `CRON_SECRET`. La comprobación es *fail-open hasta configurarse* (no bloquea mientras `CRON_SECRET` no exista), por lo que el cron sigue funcionando hasta que se complete la configuración. Para activar la protección:
> 1. Crear el secret: `SUPABASE_ACCESS_TOKEN=sbp_xxx npx supabase secrets set CRON_SECRET=<valor-aleatorio> --project-ref rflfsbrdmgaidhvbuvwb` (o desde el dashboard → Edge Functions → Secrets).
> 2. Actualizar los jobs de `pg_cron` (`20260619_cron_agente_cobertura.sql`, `20260605_cron_notify_justificante.sql`) para que el `net.http_post` incluya la cabecera `'x-cron-secret': '<mismo-valor>'` en `headers`.
> Hasta hacer (1), la protección permanece inactiva (sin bloqueo); en cuanto exista el secret, toda invocación sin la cabecera correcta devuelve 401.

> **Migraciones pendientes de ejecutar:** ninguna. (`ia_cache.sql` y `calificaciones_competenciales.sql` aplicadas el 2026-06-22.)
>
> Redeploy de EFs de IA: ✅ hecho 2026-06-22 (`cas-analyzer`, `tipificar-incidencia`). Caché A8 verificada en producción (cas-analyzer escribe en `ia_cache`).
>
> El histórico de **migraciones ya ejecutadas** se mantiene en `CLAUDE-ARCHIVE.md`.

---

## Mantenimiento de la documentación

Esta documentación se carga **entera** en cada sesión de Claude Code vía los `@imports` del pie. Para que siga siendo útil (y no malgaste contexto), se mantiene bajo control de tamaño.

**Límite duro: ningún archivo cargado debe superar 35 000 caracteres.** Comprobar con:
```bash
for f in CLAUDE*.md; do printf "%-22s %s\n" "$f" "$(wc -m < "$f")"; done
```

**Qué va en cada archivo:**
| Archivo | Contenido | Cargado por Claude | Límite |
|---------|-----------|:--:|:--:|
| `CLAUDE.md` | Índice maestro: producto, stack, arquitectura, estructura, EFs, convenciones, flujo de arranque, migraciones **pendientes** | ✅ (`@`) | 35k |
| `CLAUDE-MODULOS.md` | Resumen funcional por módulo (1 bloque/módulo) | ✅ (`@`) | 35k |
| `CLAUDE-TABLAS.md` | Esquema de BD, buckets, RPCs, módulos por rol | ✅ (`@`) | 35k |
| `CLAUDE-ROADMAP.md` | n8n, centro demo, roadmap **activo**, propuesta comercial | ✅ (`@`) | 35k |
| `CLAUDE-CHANGELOG.md` | Solo entradas **recientes** (rotación) | ✅ (`@`) | 20k |
| `CLAUDE-ARCHIVE.md` | Histórico: changelog viejo, migraciones aplicadas, roadmap completado | ❌ **(sin `@`)** | sin límite |

**Reglas de rotación (revisar cada ~10 entradas de changelog o cuando un archivo se acerque a 30k):**
1. **Changelog:** mantener ≤30 entradas o ≤20k chars. Al superarse, mover las más antiguas a la sección 1 de `CLAUDE-ARCHIVE.md`.
2. **Roadmap:** cuando un ítem pasa a "Completado", mover la línea detallada a la sección 3 del archivo; en el roadmap dejar como mucho un resumen de una línea.
3. **Migraciones:** al confirmarse en producción, mover de "pendientes" (en CLAUDE.md) a la sección 2 del archivo.
4. **Nunca** añadir `@CLAUDE-ARCHIVE.md` al pie — su razón de ser es NO cargarse.

---

Ver también (cargados automáticamente): @CLAUDE-MODULOS.md | @CLAUDE-TABLAS.md | @CLAUDE-ROADMAP.md | @CLAUDE-CHANGELOG.md
Histórico (consulta manual, NO se carga): `CLAUDE-ARCHIVE.md`


---
