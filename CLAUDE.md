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
  comunicados.js        initComunicadosPanel, enviarComunicado, _comCheckAndBadge
  familias.js           initFamiliaView, loadFamiliaComedor, loadAvisos, initPushFamilias (suscripción Web Push: banner + pushManager.subscribe + INSERT push_subscriptions)
  planner.js            initPlannerPanel, _generarHorario (CSP+H-MRV-SA), plannerPublicar, drag & drop tablero, Dictar tab, Importar (.xlsx → planner_inputs)
  analytics.js          initAnalyticsPanel, CMI Cuadro de Mando Integral, alertas predictivas psicosociales (pill "Dashboard" del módulo Análisis)
  calificaciones.js     initCalificaciones (gradebook): vista profesor (entrada notas) / vista dirección (consulta + export CSV/PDF)
  materiales.js         initMateriales (hub de materiales): subida multi-grupo a Storage privado/enlace, descarga signed URL, toggle "Mis materiales/Todos", form "solo mis clases"
  informes.js           initInformes (Informes de dirección): PDF consolidado por periodo (jsPDF + autotable, logo+color del centro); solo lee tablas existentes (pill "Informes PDF" del módulo Análisis)
  orientacion.js        initOrientacion (módulo Orientación): lista de expedientes, expediente individual (4 pestañas), IA (borrador informe + síntesis cuestionarios vía EF chat), panel de riesgo (detección IA), exportación RGPD (PDF) + estadísticas (Chart.js/PDF/Excel), push (send-push), portal familias
  calidad.js            initCalidad (módulo Calidad): dashboard 5 métricas, No Conformidades (lista/filtros/modal+voz+IA/CAPA), Feedback Familias (lista/sentimiento IA/respuesta IA); helper _calGemini reutilizable
  palette.js            command palette global ⌘K (alumnos/profesores/aulas)
sql/
  planner-tables.sql    DDL: materias, aulas, disponibilidad_profesor, necesidades_lectivas, horario_generado
supabase/migrations/
  calificaciones.sql    DDL gradebook: tabla calificaciones + RLS (4 políticas) + índices
  planner_inputs.sql    DDL entrada del Planner: 7 tablas planner_* + RLS por centro
  planner_grupos.sql    DDL tabla planner_grupos (hoja "Grupos") + RLS
  materiales.sql        DDL materiales + RLS + bucket privado 'materiales' + RLS de Storage
  orientacion_base.sql  DDL Orientación: 6 tablas (expedientes_orientacion, informes_psicopedagogicos, medidas_atencion, cuestionarios_docentes, tramites_orientacion, alertas_orientacion) + índices + RLS por centro
manifest.json                   PWA manifest (sin service worker aún)
n8n-briefing-matutino.json      Workflow n8n: briefing matutino automático (importar en n8n)
tests/
  aislamiento-centros.spec.js   Playwright e2e: RLS multi-tenant (Agora vs Buñol)
scripts/
  importar_horarios_profes.py   Import CSV de horarios → Supabase
playwright.config.js            Config Playwright: chromium, baseURL didactia.eu, dotenv
.env.example                    Plantilla de credenciales para tests (nunca commitear .env)
```

---

## Tablas de Supabase

| Tabla | Campos clave | Notas |
|-------|-------------|-------|
| `centros` | id, nombre, modulos_activos[], color_primario, logo_url, ccaa | `ccaa` determina normativa convivencia: 'valenciana'\|'madrid'\|'andalucia'\|'cataluna'\|NULL (estatal) |
| `profiles` | id, user_id, full_name, email, rol, centro_id, activo (bool DEFAULT true), created_at | Extiende auth.users. `id = user_id` (ambos = auth UUID). `activo=false` bloquea el login |
<!-- info_centro actualizado en línea horarios_grupo arriba -->
| `horarios` | centro_id, dia, hora, profesor, actividad | Tabla legacy — chatbot búsqueda por apellido |
| `horarios_grupo` | centro_id, grupo_horario, **curso_escolar** (TEXT NOT NULL DEFAULT '2025-26'), dia, tramo, hora_inicio, hora_fin, actividad_nombre, profesor_nombre, aula | Tabla principal — lógica horaria directa. Multi-curso: filtrar siempre por `curso_escolar = cursoActivo` (global en config.js). Índice: `idx_hg_curso(centro_id, curso_escolar)` |
| `info_centro` | centro_id, nombre_config, datos (jsonb), visible_para, **curso_activo** (TEXT NOT NULL DEFAULT '2025-26') | Contexto del chatbot. `curso_activo` controla qué horario ven chat y sustituciones |
| `alumnos` | centro_id, nombre, curso, grupo_horario | Vinculados vía familia_alumno |
| `familia_alumno` | profile_id, alumno_id | N:M familias↔alumnos |
| `asistencia_comedor` | centro_id, alumno_id, fecha, se_queda, plaza_fija, registrado_por | Una fila por alumno/día |
| `sustituciones` | centro_id, fecha, hora_inicio, hora_fin, tramo, grupo_horario, profesor_ausente, profesor_sustituto, observaciones, cubierta, creado_por | `cubierta` tiene toggle en la tabla. Se auto-genera desde RRHH al aprobar ausencias |
| `profesores` | centro_id, profile_id, nombre, especialidad, departamento, horas_semanales, tipo_jornada, activo | Ficha HR del profesor; `profile_id` opcional (puede no tener cuenta) |
| `ausencias_profesor` | centro_id, profile_id, fecha, fecha_fin, tipo, motivo, estado, aprobada_por, motivo_rechazo, trimestre (NOT NULL), curso_escolar (NOT NULL), tramo (nullable), created_at | Estado: pendiente/aprobada/rechazada; tipo: baja_medica/permiso/asunto_propio/formacion/sindical/otros. Las instrucciones para el sustituto van en `sustituciones.observaciones`, NO aquí. `trabajo_alumnos` y `justificante_url` NO existen en el esquema real. |
| `guardias_realizadas` | centro_id, profile_id, ausencia_id, fecha, tramo, grupo_horario, aula, observaciones, trimestre, curso_escolar, created_at | Guardias cubiertas; `ausencia_id` FK → ausencias_profesor |
| `incidencias` | centro_id, fecha, tipo, gravedad, descripcion, alumno_nombre, grupo_horario, registrado_por, estado, informe_borrador, normativa_ref, medidas_propuestas[], protocolo_previ, created_at | Estado: abierta/cerrada; tipo: convivencia/material/instalaciones/otro; gravedad: leve/grave/muy_grave. Campos IA: `normativa_ref` (decreto aplicado), `medidas_propuestas` (text[]), `protocolo_previ` (bool), `informe_borrador` (texto editable antes de guardar) |
| `comunicados` | centro_id, titulo, cuerpo, destinatarios, creado_por, fecha, estado, plantilla, created_at | `destinatarios`: 'todos'/'solo_profesores'/'solo_familias'/'grupo:XXXX'; `estado`: borrador/enviado; `plantilla`: reunion/horario/plazo/null |
| `materias` | centro_id, nombre, color | Materias del Planner; `color` hex para fichas del tablero |
| `aulas` | centro_id, nombre, tipo, capacidad | Aulas reservables en el Planner |
| `disponibilidad_profesor` | profesor_id, dia_semana, tramo_horario, estado | Restricciones de disponibilidad para el CSP |
| `necesidades_lectivas` | centro_id, grupo_horario, materia_id, profesor_id, horas_semanales, tipo_aula_requerida | Input del generador: X horas/sem de materia Y con prof Z para grupo G |
| `horario_generado` | centro_id, grupo_horario, materia_id, profesor_id (**nullable**), aula_id, dia_semana, tramo_horario, es_fijo | Output del CSP antes de publicar; UNIQUE(profesor_id,dia,tramo) y UNIQUE(grupo,dia,tramo). `profesor_id` nullable → soporta horarios "sin profesores" (slots a asignar después) |
| `calificaciones` | centro_id, alumno_id, alumno_nombre, grupo, asignatura, evaluacion, nota (NUMERIC 0–10), observaciones, profesor_id, profesor_nombre, updated_at | Gradebook. `evaluacion` CHECK ('1ª/2ª/3ª Evaluación','Final'); UNIQUE(centro_id,alumno_id,asignatura,evaluacion). RLS: lectura mismo centro/superadmin; insert/update por profesor dueño (`profesor_id=auth.uid()`) o admin; delete solo dirección. Módulo `js/calificaciones.js` |
| `materiales` | centro_id, grupo, asignatura, titulo, tipo ('archivo'\|'enlace'), url, storage_path, descripcion, profesor_id, profesor_nombre, created_at | Hub de materiales. RLS: lectura todos los roles del centro; insert/update docente+dirección; delete subidor o admin. Archivos en **bucket privado `materiales`** (`{centro_id}/…`, signed URL). Módulo `js/materiales.js` |
| `expedientes_orientacion` | centro_id, alumno_id, orientador_id (→profiles), fecha_apertura, estado ('activo'\|'archivado'), notas_internas, created_at; UNIQUE(centro_id,alumno_id) | Uno por alumno. RLS `orientacion_centro` (superadmin + centro). Módulo `js/orientacion.js` |
| `informes_psicopedagogicos` | centro_id, expediente_id (CASCADE), tipo ('evaluacion_inicial'\|'revision'\|'dictamen'\|'otro'), borrador_texto, texto_final, estado ('borrador'\|'validado'\|'firmado'), creado_por, fecha_validacion, created_at | `texto_final` NUNCA se sobreescribe si `estado='firmado'` (guardia en UI). Borrador IA vía EF chat |
| `medidas_atencion` | centro_id, expediente_id (CASCADE), tipo ('ACNS'\|'ACS'\|'NEE'\|'NEAE'\|'PECAI'\|'otro'), descripcion, asignaturas_afectadas (jsonb[]), activa (bool), fecha_inicio, fecha_fin, created_at | Medida más grave activa (ACS>ACNS>NEE>NEAE>PECAI>otro) en la lista de expedientes |
| `cuestionarios_docentes` | centro_id, expediente_id (CASCADE), profesor_id (→profiles), asignatura, respuestas (jsonb: dificultades/metodologias/lagunas/observaciones), estado ('pendiente'\|'completado'), created_at | Enviar a docente / rellenar 4 preguntas fijas / sintetizar con IA |
| `tramites_orientacion` | centro_id, expediente_id (CASCADE), tipo ('dictamen'\|'escolarizacion'\|'alta_capacidades'\|'otro'), estado_tramite, descripcion, fecha_estimada, visible_familia (bool), created_at | `visible_familia=true` → visible en el portal de familias y dispara push a familias |
| `alertas_orientacion` | centro_id, alumno_id, tipo ('rendimiento'\|'asistencia'\|'conducta'\|'combinada'), nivel_riesgo ('bajo'\|'medio'\|'alto'), descripcion_ia, estado ('nueva'\|'en_seguimiento'\|'resuelta'), created_at | Panel de riesgo; alta manual o detección IA (asistencia_comedor+sustituciones→Gemini) |
| `planner_profesores`, `planner_cargas`, `planner_tramos`, `planner_grupos`, `planner_restricciones`, `planner_disponibilidad`, `planner_espacios`, `planner_reglas` | (centro_id + columnas por hoja) | **Datos de ENTRADA** del Planner (una tabla por hoja de `DidactIA_Planner_datos_26-27.xlsx`). RLS `centro_isolation`. Se rellenan desde Planner → pestaña **Importar**. **Nota:** la hoja "Cargas" NO va a `planner_cargas` sino a `materias`+`profesores`+`necesidades_lectivas` (lo que lee el generador) |
| `tramos_centro` | id, centro_id, numero (int), hora_inicio (HH:MM), hora_fin (HH:MM), nombre (text\|null), es_descanso (bool) | Tramos horarios configurables por centro; gestionables por voz vía chatbot (`crear_tramos_centro`, `listar_tramos_centro`) |
| `espacios` | centro_id, nombre, capacidad | Salas/espacios reservables del centro |
| `reservas_espacios` | centro_id, espacio_id, fecha, tramo, hora_inicio, hora_fin, reservado_por, motivo, created_at | `espacio_id` FK → espacios |
| `plazos_ib` | centro_id, curso_escolar, titulo, descripcion, fecha_limite, tipo, afecta_a, estado, created_at | Estado: pendiente/completado; tipo: entrega_ia/tok/cas/examen/formulario/reunion/otro |
| `cas_actividades` | centro_id, alumno_id, titulo, tipo, descripcion, reflexion, fecha_inicio, horas, estado, created_at | Actividades CAS del Diploma IB; tipo: creatividad/actividad/servicio; estado: en_curso/completada. Creada en `sql/demo-center.sql` |
| `extended_essay` | centro_id, alumno_id, titulo, asignatura, supervisor_nombre, estado, fecha_entrega_limite, palabras_actuales, created_at | Extended Essay del Diploma IB; estado: en_proceso/primer_borrador/borrador_final/entregado. Creada en `sql/demo-center.sql` |
| `salidas_didacticas` | centro_id, titulo, descripcion, fecha_salida, hora_salida, hora_regreso, curso_grupos (jsonb), coste, responsable_id, estado, datos_autobus (jsonb), created_at | Estado: borrador/publicada/cerrada/cancelada. `datos_autobus`: {empresa,matricula,telefono,plazas,notas} |
| `participantes_salida` | centro_id, salida_id, alumno_id, autorizado, pagado, necesita_picnic, alergias_confirmadas, fecha_autorizacion, created_at | UNIQUE(salida_id,alumno_id). Generados en batch al crear la salida desde los grupos seleccionados |
| `notificaciones_salida` | centro_id, salida_id, tipo, enviada, fecha_envio, created_at | tipo: recordatorio/cierre/llegada/cocina |
| `no_conformidades` | centro_id, reporter_id, proceso_categoria, prioridad, descripcion_raw, estado, reported_at, created_at | Módulo Calidad. `prioridad`: baja/media/alta/critica; `estado`: abierta/en_analisis/capa_ejecutada/cerrada; `proceso_categoria`: docencia/mantenimiento/comedor/transporte/convivencia/administracion/seguridad/general |
| `acciones_capa` | centro_id, nc_id (FK→no_conformidades), causa_raiz, plan_accion, responsable_id, fecha_objetivo, fecha_verificacion, es_eficaz (bool nullable), created_at | Acciones correctivas/preventivas vinculadas a una NC. `es_eficaz=null` = pendiente de verificar |
| `feedback_familias` | centro_id, familia_user_id, alumno_id, canal, texto_raw, categoria_ia, sentimiento_ia (numeric −1..1), resumen_ia, requiere_accion (bool), respuesta_borrador, estado, created_at | Feedback de familias. `canal`: formulario/email/chat/presencial; `estado`: pendiente/en_gestion/resuelto. Análisis IA asíncrono post-INSERT |
| `documentos_calidad` | centro_id, titulo, tipo, contenido, created_at | Documentos del SGC (sistema de gestión de calidad) |
| `plantillas_calidad` | centro_id, nombre, tipo, contenido_plantilla, campos_requeridos (jsonb) | Plantillas de documentos (entrevista familia, acta reunión, informe incidencia, plan mejora). Seed: `supabase/seeds/plantillas_calidad_default.sql` |
| `push_subscriptions` | id, user_id (NOT NULL), centro_id (nullable), subscription (jsonb), created_at | Suscripciones Web Push. RLS `push_own` + `push_superadmin`. La EF `send-push` lee de aquí (service_role); las familias se suscriben desde `js/familias.js` (`initPushFamilias`) |

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
| `agent-sustituciones` | **Agente autónomo** (Gemini 2.5 Flash, function calling en bucle). Recibe `{centro_id, fecha}` + JWT del usuario (cliente con RLS por centro). 3 herramientas en secuencia: `obtener_ausencias_sin_cubrir` (siempre 1ª; si vacío → para), `buscar_profesores_libres`, `sugerir_sustituto` (equidad por guardias del trimestre, top 3). `centro_id` SIEMPRE el del body; `.eq("centro_id", …)` en las 3 queries. Devuelve `{type:"text", content}`. Código: `supabase/functions/agent-sustituciones/index.ts` |
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
- **Home familia** (`renderHomeFamilia` en `js/mejoras.js`): render en `#familia-home-content` dentro de `#inicio-familia`. Estado `_homeFamiliaHijoIdx` (chip selector si hay >1 hijo). 5 bloques async fire-and-forget (cada uno con try/catch independiente): (1) Horario de hoy — `horarios_grupo` por `grupo_horario+dia+curso_escolar`; (2) Comedor hoy — `asistencia_comedor.maybeSingle`, solo si módulo activo; (3) Incidencias recientes — `incidencias ilike alumno_nombre`, limit 3, solo si hay datos; (4) Próximas salidas — `participantes_salida` → `salidas_didacticas` estado publicada ≥ hoy, limit 3; (5) Comunicados no leídos — reutiliza `_comGetLeidos()`, limit 3. `window._fhSelectHijo(idx)` cambia el hijo activo y fuerza recarga.
- **Grids "Módulos"/"Acceso rápido" eliminados** (redundantes con el sidebar).
- **Command palette ⌘K** (`js/palette.js`): overlay global `#cmd-palette`, atajo ⌘K/Ctrl+K + lupa del topbar; busca alumnos, profesores y aulas (profesores/aulas se sacan de `profesores`/`espacios` **y** de `horarios_grupo`, deduplicados, porque muchos centros sólo tienen los datos en `horarios_grupo`).

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
- Toggle de módulos por centro (comedor, espacios, incidencias) — solo superadmin

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

### Bolsa de guardias con equidad (guardias.js)
- `loadBolsaGuardias()`: cuenta `sustituciones.profesor_sustituto` del trimestre actual → ranking menor→mayor
  - Profesores del ranking: todos los que aparecen en `horarios_grupo` + los que ya hicieron guardia ese trimestre
  - Barra de progreso relativa + badge: verde (0) · azul (1-3) · ámbar (4-6) · rojo (7+)
- `getGuardiaCountsByName()`: devuelve mapa `{nombre: count}` usado por `admin.js` para ordenar el selector de sustitutos
- `registrarGuardiaEnBD(nombre, fecha, tramo, grupo)`: resuelve `profile_id` por `ilike(full_name)` e inserta en `guardias_realizadas` con `ausencia_id: null`
- Card "Bolsa de guardias" integrada en `panel-sust`, se recarga al abrir el tab y tras cada registro
- Helpers: `_guardiaTrimActual()`, `_guardiaTrimDates(trim)`, `_guardiaCursoActual()`

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
- **Soporte multi-curso**: `horarios_grupo.curso_escolar TEXT NOT NULL DEFAULT '2025-26'`; `info_centro.curso_activo TEXT NOT NULL DEFAULT '2025-26'`; global `cursoActivo` en `config.js` actualizado tras login desde `info_centro`; 7 queries en `chat.js` y 4 en `admin.js` filtran por `curso_escolar` con fallback `'2025-26'`. Migración: `supabase/migrations/horarios_curso_escolar.sql` (PENDIENTE ejecutar en SQL Editor)

### Análisis — Dashboard CMI + Informes PDF (analytics.js + informes.js)
- **Módulo fusionado** (2026-06-10): un único nav item **"📊 Análisis"** (`#nav-analisis`, grupo Administración) visible para `admin`/`director`/`jefatura`/`superadmin`. `#panel-analisis` con dos pills internas (`analisisTab()` en el script inline de `app.html`):
  - **Dashboard** → `analytics.js` (renderiza en `#analytics-container`, init `initAnalyticsPanel`)
  - **Informes PDF** → `informes.js` (renderiza en `#inf-container`, init `initInformes`)
  - Cada pill hace lazy init del sub-módulo al activarse; la lógica interna de ambos módulos quedó intacta
- (Histórico) Tab **"Analytics"** visible solo para `admin` y `superadmin`
- **CMI tiles**: 6 KPIs en tiempo real — guardias sin cubrir, ausencias activas, incidencias abiertas, comensales hoy, ocupación espacios, usuarios activos
- **Gráficos Chart.js**: línea de tendencia de incidencias (30 días), barras de guardias por profesor (trimestre), dona de distribución de tipos de ausencia
- **Alertas predictivas psicosociales**: análisis automático de patrones anómalos (picos de absentismo, acumulación de incidencias por grupo/alumno, profesor con exceso de guardias). Llama Edge Function `alerta-psicosocial`
- **Edge Function `alerta-psicosocial`**: recibe `{centro_id}`, analiza últimos 30 días de datos de tres tablas, devuelve array de alertas con `nivel` (verde/amarillo/rojo), `mensaje` y `accion_sugerida`. Requiere tabla `alertas_predictivas` (pendiente ejecutar `sql/alertas-predictivas.sql`)
- **Tabla `alertas_predictivas`**: `centro_id, tipo, nivel, mensaje, datos_json, leida, created_at` — **pendiente ejecutar SQL en Supabase**

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
- **Tablas**: `no_conformidades`, `acciones_capa`, `feedback_familias`, `documentos_calidad`, `plantillas_calidad` — pendiente ejecutar DDL en Supabase SQL Editor (`sql/calidad-tables.sql`)

### Orientación — departamento de orientación (orientacion.js)
- Nav **"🧭 Orientación"** (grupo Centro), visible `orientador`/`jefatura`/`director`/`admin`/`superadmin` (familia solo ve el portal de trámites). Tablas: ver arriba (6 de `orientacion_base.sql`). Todas las queries filtran `centro_id`; la IA va vía EF `chat` con `role:"familia"` (texto puro) y **nunca persiste sin acción manual del orientador**.
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
- **Portal de familias** (`oriRenderTramitesFamilia`): sección autocontenida inyectada en la home de la familia (MutationObserver, sin tocar otros archivos); muestra trámites de hijos vinculados con `visible_familia=true` — **sin datos clínicos**.
- **Responsive** (CSS inyectado una vez, sin tocar `styles.css`): tabla→tarjetas en <768px, pestañas→`<select>`, modales 95%+×, FAB "Nuevo expediente", ellipsis. Toasts verde/rojo reutilizan `_calToast`/`showToast`.

---

## Estado del proyecto (2026-05-29)

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
| `materiales` | Privado + RLS de Storage por centro (carpeta `{centro_id}/…`) | Archivos del módulo Materiales; descarga vía signed URL (1h) |
| `documents` | Público | Bucket genérico existente |

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
| IB (plazos/CAS/EE) | ✅ (si hijo en IB) | ✅ | ✅ | ✅ |
| Administración | — | — | ✅ | ✅ |
| Usuarios | — | — | ✅ (su centro) | ✅ (todos) |
| Planner | — | — | ✅ | ✅ |
| Análisis (Dashboard CMI + Informes PDF) | — | — | ✅ | ✅ |
| Calidad (NCs + Feedback + CAPA) | — | — | ✅ | ✅ |
| Orientación | (portal trámites visible_familia) | — | ✅ | ✅ (+orientador/jefatura/director) |
| Salidas Didácticas | ✅ (autorización) | ✅ | ✅ | ✅ |

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
<script src="js/analytics.js"></script>
<script src="js/calificaciones.js"></script>
<script src="js/materiales.js"></script>
<script src="js/informes.js"></script>
<script src="js/orientacion.js"></script>
<script src="js/calidad.js"></script>
<script src="js/salidas.js"></script>
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
- [x] Planner — generador de horarios: motor CSP backtracking + H-MRV-SA, tablero drag & drop, CRUD materias/necesidades, publicación en horarios_grupo (solo admin/superadmin)
- [x] Planner V2: tooltip LOMLOE co-docencia, sistema de tramos configurables (`tramos_centro`), tab Dictar con IA multimodal (voz/texto/audio), Edge Function `parse-restricciones`
- [x] Chatbot agente ejecutor: Gemini function calling con 7 herramientas (crear_sustitucion, crear_incidencia, consultar_profesor_libre, registrar_ausencia_profesor, avisar_comedor, listar_tramos_centro, crear_tramos_centro), tarjeta de confirmación UI, EF desplegada
- [x] Analytics CMI: Cuadro de Mando Integral con 6 KPIs, gráficos Chart.js, alertas predictivas psicosociales via EF `alerta-psicosocial`
- [x] Testing e2e con Playwright: test de aislamiento multi-tenant — login por UI como admin de Agora, extracción de JWT desde localStorage, petición REST directa a Supabase verificando que RLS devuelve 0 filas para IES Buñol y >0 filas para Agora (`npm run test:e2e`)
- [x] Mobile responsive: 24 issues cubiertos — modales, formularios, safe-area toasts, iOS zoom (16px inputs), touch targets 44px, tabla overflow-x, bottom nav clearance
- [x] Mobile nav: Planner en drawer Más móvil, selector de centro para superadmin en drawer Más
- [x] Dashboard Classroom-style: banners por rol, métricas pill, grid de módulos con color por módulo, sidebar active con tint de color por módulo (`--nav-color`)
- [x] Chatbot agente ejecutor — fix crítico: `systemInstruction` en Gemini API, `toolInstr` con instrucción de ejecución inmediata (sin pedir confirmación textual), `system_prompt` propagado al flujo de confirmación
- [x] Auditoría técnica (`docs/auditoria-app.md`): 12 módulos, 11 EFs, 4 workflows n8n, deuda técnica P0/P1/P2, seguridad
- [x] Fix banners dashboard: banner bienvenida siempre muestra el centro activo (`updateBentoDashboard` llamado desde `updateUI` en `auth.js`); aviso urgente ya se elimina correctamente (DELETE en `info_centro` + sync inmediato de `#banner-aviso`)
- [x] Landing actualizada: planes Operativa €249/mes · Internacional €399/mes, 8 módulos (+RRHH, Incidencias, Comunicados), FUNDAE €2.988–4.788 bonificable, © 2026
- [x] Registro con código de centro opcional (`codigo_acceso`): si el campo queda vacío el usuario se registra sin centro asignado; `codigo_acceso` añadido al bucle de matching en `doRegisterStep1`
- [x] Chatbot agente ejecutor — nuevas herramientas de tramos: `crear_tramos_centro` y `listar_tramos_centro` implementadas en EF `chat` y desplegadas a producción
- [x] Módulo Salidas Didácticas: lista, detalle 4 tabs (Dashboard/Cocina/Autobús/Administración), vista familia con autorización por hijo, push notifications, Excel 3 hojas, circular IA
- [x] Roles `orientador` y `admin_institucional`: nuevas opciones en selectores de invitación/edición de usuarios; `admin_institucional` tiene selector multi-centro propio
- [x] Módulo Calidad base: dashboard 5 KPIs, No Conformidades (lista+filtros+modal voz+IA+detalle+CAPA), Feedback Familias (lista+sentimiento+análisis IA asíncrono+respuesta IA); tablas `no_conformidades`/`acciones_capa`/`feedback_familias` (DDL pendiente ejecutar)

### En progreso — Redesign visual completo (design_handoff_didactia/)
- [x] Design tokens v2 + layout shell
- [x] Logo brand SVG + wordmark sidebar
- [x] Inicio admin (Classroom-style: banner ink, metrics pills, modules grid con colores)
- [ ] Inicio profesor (horario del día, stats distintas)
- [ ] Alumnos — split tabla/perfil drawer (`02-alumnos.png`)
- [ ] Asistente IA — pantalla full-screen chat split (`06-chat.png`)
- [ ] Sustituciones — tabla densa + popover + banner IA (`04-sustituciones.png`)
- [ ] Incidencias — split lista/detalle con timeline (`05-incidencias.png`)

> **Regla de implementación UI:** NO tocar archivos JS. Solo `app.html` e `css/styles.css`. Mantener TODOS los IDs existentes. Usar `var(--ink)` en lugar de colores navy fijos para respetar tematización.

### Próximo sprint — App Familias / Portal familias
- [ ] **App Familias (PWA separada o tab nuevo)** — onboarding, dashboard hijo, chat con el centro, notificaciones push
- [x] **Notificaciones push** — Web Push API; notificar familias cuando alumno falta al comedor (pendiente: sustituir TODO `VAPID_PUBLIC_KEY` en `config.js` con el valor real del secret de Supabase)
- [ ] **Módulo IB en la app** — gestión de `plazos_ib`, CAS tracker, Extended Essay status (para centros con IB)
- [ ] **Página de recuperación de contraseña** — UX mejorable; actualmente funciona via hash
- [ ] **Onboarding de nuevo centro** — wizard guiado: info_centro, importar horarios, alumnos, primer admin

### Backlog
- [x] **P0 seguridad (cerrado):** `disponibilidad_profesor` no tiene columna `centro_id`. El aislamiento ya está garantizado por dos capas: (1) cliente filtra por `profesor_id IN (profIds)` donde `profIds` viene de `profesores` filtrado por `centro_id`; (2) RLS con policy `centro_isolation` aísla vía FK `profesor_id → profesores.centro_id`. No hay fuga cross-tenant. Sin cambios necesarios.
- [x] **P0 deploy resuelto:** EF `chat` redesplegada el 2026-06-03 con 7 herramientas. Deploy vía `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy chat --project-ref rflfsbrdmgaidhvbuvwb`
- [x] **P1 versionar EFs:** `invite-user` y `notify-role` extraídos del bundle ESZIP de producción y añadidos al repo (`c232c38`). `notify-sustitucion` ya estaba versionada (no está deployada actualmente). Nota: en producción también existen `rapid-processor` y `cas-analyzer` sin versionar en el repo.
- [ ] Ejecutar `sql/alertas-predictivas.sql` en Supabase para activar tabla `alertas_predictivas` (Analytics CMI)
- [ ] Importación masiva de alumnos via CSV (existe script Python para horarios, falta alumnos/familias)
- [ ] Estadísticas avanzadas cross-centro para superadmin
- [ ] Limpiar `repomix-output.xml` y `edubot-supabase (1).html` del repo (añadir a `.gitignore`)
- [x] Sustituir `TODO:VAPID_PUBLIC_KEY` en `config.js` con el valor real ✅ (par regenerado 2026-06-11, secrets actualizados vía Management API, EF `send-push` redesplegada)
- [ ] Bug menor `send-push`: el delete por 410/404 borra todas las filas del `user_id` en lugar de solo el endpoint fallido — si un usuario tiene varios dispositivos puede perder suscripciones válidas

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
> - `supabase/migrations/horarios_curso_escolar.sql` — `horarios_grupo.curso_escolar` + `info_centro.curso_activo` + índice. **Ejecutar antes de que el código multi-curso entre en producción.**
> - `sql/calidad-tables.sql` — tablas `no_conformidades` + `acciones_capa` + `feedback_familias` + `documentos_calidad` + `plantillas_calidad` + `evaluaciones_platinum` + RLS por centro. **Pendiente crear el archivo y ejecutarlo.** El módulo Calidad mostrará error hasta que existan las tablas.
>
> **Migraciones ejecutadas** (ya en producción):
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

## Registro de cambios recientes
- `2026-06-12 07:26` · `c232c38` — feat: versionar EFs `invite-user` y `notify-role` — código extraído del bundle ESZIP de producción vía Management API. `notify-sustitucion` ya estaba en el repo (sin deploy activo). Funciones en prod no versionadas aún: `rapid-processor`, `cas-analyzer`.
- `2026-06-12 01:16` · `a0ca561` — docs(CLAUDE.md): home familia documentada — renderHomeFamilia, VAPID fix
- `2026-06-12 00:56` · `967a728` — feat(familia): home mejorada — `renderHomeFamilia()` en `mejoras.js`; 5 bloques fire-and-forget (horario hoy, comedor, incidencias, salidas, comunicados no leídos); selector de hijo con chips; render target `#familia-home-content` en `app.html`; fix `const VAPID_PUBLIC_KEY` duplicado (eliminado de `mejoras.js`, permanece solo en `config.js`)
- `2026-06-11 23:50` · `6fd3497` — fix: VAPID_PUBLIC_KEY real en config.js — par regenerado, secrets actualizados, send-push redesplegada
- `2026-06-11 23:36` · `1e1302b` — docs: agent-sustituciones + push familias documentados en roadmap
- `2026-06-11` — feat(push-familias): **suscripción a notificaciones push para familias** (`js/familias.js`, `js/auth.js`, `js/config.js`). `initPushFamilias()` llamada tras login de rol familia: comprueba soporte Push API, consulta si ya suscrito, muestra banner `#push-banner-familia` con botón Activar y ✕ persistente (localStorage). `_pushActivar()`: SW ready → `pushManager.subscribe` con VAPID → INSERT en `push_subscriptions` fire-and-forget → toast confirmación. `VAPID_PUBLIC_KEY` en `config.js` (TODO pendiente de sustituir con valor real). SW ya tenía handler push completo — sin cambios.
- `2026-06-11` — feat(agent-sustituciones): **primer agente IA autónomo** (`supabase/functions/agent-sustituciones/index.ts`). Edge Function con Gemini function calling y 3 herramientas encadenadas: `obtener_ausencias_sin_cubrir` (sustituciones sin cubrir hoy), `buscar_profesores_libres` (cruza `horarios_grupo` con profesores del centro), `sugerir_sustituto` (ordena por equidad trimestral). El agente solo actúa cuando hay ausencias reales — si no hay, responde "No hay ausencias sin cubrir hoy." Integrado en la home del rol admin/director/jefatura como bloque "🤖 Resumen de guardias" (fire-and-forget, no bloquea carga). P0 seguridad `disponibilidad_profesor` cerrado (aislamiento garantizado por RLS + filtro cliente, no requería cambio).
- `2026-06-11 10:27` · `d969c51` — Merge branch 'main' of https://github.com/jesvivlc/DidactIA
- `2026-06-12` — feat(agent): detalle adicional de `agent-sustituciones` — el `centro_id` es SIEMPRE el del body (nunca el del modelo), `.eq("centro_id", …)` en las 3 queries, log por herramienta; herramientas dedup por nombre normalizado y filtro de PENDIENTE / nombres con `?`/`/`; `sugerir_sustituto` top 3; integración UI: botón "🤖 Buscar profesor libre" en `#sust-vista-admin` (`buscarProfesorLibreAgente`) + briefing `_renderAgentBriefing` en home admin.
- `2026-06-11 00:54` · `81de9b4` — docs(CLAUDE.md): sesión 2026-06-11 — Calidad NCs+CAPA+Feedback, roles orientador/admin_institucional, tablas calidad
- `2026-06-11` · **Módulo Calidad — No Conformidades + CAPA + Feedback Familias** (`763bb5e`): implementación completa de las dos secciones principales de `js/calidad.js`. Bug crítico previo: `getElementById('cal-container')` devolvía el contenedor de Calificaciones (ID duplicado) → spinner infinito. Fix: renombrar a `calidad-cont` (`af8ac5e`). Secciones implementadas:
  - **No Conformidades**: lista paginada con filtros (estado/prioridad/categoría), NC ID `NC-{año}-{6HEX}`, ordenado por prioridad+fecha; modal con dictación por voz (`SpeechRecognition` + `try/catch` completo) + análisis IA en `onblur` que actualiza selectores automáticamente; detalle con cambio de estado inline + análisis 5 Porqués con Gemini; CAPA inline (modal causa/plan/responsable/fechas, eficacia, cierre automático cuando todas eficaces)
  - **Feedback Familias**: lista con filtros por estado y sentimiento (rango numérico −1..1 → emoji 😊/😐/😤); modal entrada + análisis IA asíncrono non-blocking tras INSERT (UPDATE `categoria_ia/sentimiento_ia/resumen_ia/requiere_accion`); detalle con email de familia (lazy load), generación de respuesta IA, guardado + cierre
  - Helper `_calGemini()` centralizado (API/ANON_KEY/ctrId de config.js); `_calEsc()` en todo innerHTML; `node --check` OK
- `2026-06-11` · `af8ac5e` — fix: calidad — renombrar cal-container a calidad-cont (conflicto de ID con panel-calificaciones)
- `2026-06-11` · `06d7f10` — fix: calidad — estructura del panel igual que módulos funcionales
- `2026-06-10 23:16–23:42` · `4401cc5`/`1fe8671`/`04a84b5` — debug(calidad): instrumentación diagnóstico para trazar spinner infinito; Service Worker v6→v7 + precache calidad/salidas/orientacion
- `2026-06-10 23:03` · `ac7410b` — fix: favicon SVG inline — eliminar 404 favicon.ico
- `2026-06-10 22:52–23:00` · `e838641`/`2ae1c13`/`56442e7` — fix + cleanup: calidad dashboard error handling explícito; eliminación de logs diagnóstico temporales
- `2026-06-10 21:20` · `f5b4458` — feat: módulo Calidad — estructura base y dashboard (5 KPIs + semáforo, 3 listas resumen, botones de sección)
- `2026-06-10 20:58` · `75c9032` — feat: rol `admin_institucional` — selector multi-centro propio en drawer Más + opciones en modales invitar/editar usuarios
- `2026-06-10 20:46` · `9589f2d` — feat: rol `orientador` — visible en selectores de usuario; acceso a módulo Orientación
- `2026-06-10 20:18` · `f627b48` — fix: salidas — botón alergias y modal circular IA
- `2026-06-10 20:05` · `64473bd` — docs(CLAUDE.md): salidas didácticas — módulo completo documentado
- `2026-06-10 20:02` · `d19a492` — feat: salidas didácticas — detalle completo, cocina, autobús, administración y familias
- `2026-06-11` — feat(orientación): **notificaciones push + UX responsive** (`js/orientacion.js`). Push vía EF `send-push` (helper `_oriPush`, silencioso/no bloqueante) en 4 momentos: cuestionario completado→orientador; nueva alerta (manual y detección IA)→orientador/jefatura/director/admin; informe validado→director/admin; trámite `visible_familia`→familias (`familia_alumno.profile_id`). Responsive (CSS inyectado una vez, sin tocar `styles.css`): tabla→tarjetas en <768px, pestañas→`<select>`, modales 95%+×, FAB "Nuevo expediente", ellipsis en celdas. Pulido: estados vacíos con acción, confirmaciones descriptivas, toasts verde/rojo (reutiliza `_calToast`/`showToast`).
- `2026-06-11` — feat(orientación): **exportación RGPD + estadísticas** (`js/orientacion.js`). "📥 Exportar expediente completo" (role-gated admin/director/jefatura/superadmin) → PDF único (jsPDF+autotable) con portada (logo+color, nota legal Art. 15 RGPD/LOPDGDD), medidas, informes (texto completo), observaciones docentes, trámites, alertas + pie/nº página + nota de cierre. "📈 Estadísticas": 6 bloques (4 tarjetas, barras por medida, línea alertas 6m por nivel, donut estado informes, top-10 cuestionarios pendientes, trámites por estado) con Chart.js + export PDF (tablas) y Excel (6 hojas).
- `2026-06-11` — feat(orientación): **IA + panel de riesgo + portal familias** (`js/orientacion.js`). Informes: "✨ Generar borrador con IA" (LOMLOE, vuelca sin guardar). Adaptaciones: "✨ Sintetizar observaciones docentes" (≥2 cuestionarios). Panel de riesgo: alertas activas ordenadas, alerta manual y "✨ Detectar riesgos automáticamente" (asistencia_comedor+sustituciones 30d→Gemini JSON→checkboxes→INSERT confirmados). Portal familias: sección autocontenida en la home (rol familia) con trámites `visible_familia=true`. IA vía EF `chat` con `role:"familia"` (texto puro); ninguna IA persiste sin acción manual.
- `2026-06-11` — feat(orientación): **expediente individual con 4 pestañas** (`oriAbrirExpediente`). Resumen (ficha + medidas activas + alertas + trámites), Informes (Ver/Editar con guardia firmado=solo lectura, Nuevo, Exportar PDF), Adaptaciones (medidas detalladas + cuestionarios docentes Rellenar/Ver/Enviar), Trámites (filtro + editar + badge visible familia).
- `2026-06-11` — feat(orientación): **módulo nuevo + tablas** (`js/orientacion.js`, `supabase/migrations/orientacion_base.sql` ejecutado vía Management API). 6 tablas (`expedientes_orientacion`, `informes_psicopedagogicos`, `medidas_atencion`, `cuestionarios_docentes`, `tramites_orientacion`, `alertas_orientacion`) + RLS por centro. Lista de expedientes (JOIN alumno+orientador, medida más grave activa, nivel de riesgo, filtros, contador, export XLSX, modal nuevo expediente). Nav item "🧭 Orientación" (grupo Centro, visible orientador/jefatura/director/admin/superadmin).
- `2026-06-10` — feat(login): **logo y color del centro en la pantalla de login** (antes de autenticar). `themeLoginScreen()` (en `js/auth.js`, llamada desde el boot de `js/config.js` tras crear el cliente) detecta el centro por la URL —`?centro=<uuid>` (por `id`) o `?centro=`/`?c=`/`?codigo=` con un código de acceso (cruza `codigo_familia`/`codigo_profesional`/`codigo_acceso`)— y aplica `applyTheme(color_primario, logo_url)` (que ya tematiza `#brand-logo` del login). Fallback: sin pista en URL → última marca usada en este navegador (`localStorage didactia_brand`, persistida por `_cacheBrand` tras login); sin nada → marca DidactIA por defecto. Todo en `try/catch` → nunca lanza error. No toca la lógica de autenticación.
- `2026-06-10` — feat(analisis): **fusión Analytics CMI + Informes en un módulo único "📊 Análisis"** (`app.html` + `js/auth.js`; `analytics.js`/`informes.js` intactos). Un único nav item (grupo Administración, visible admin/director/jefatura/superadmin) y `#panel-analisis` con dos pills internas: **Dashboard** (contenedor `#analytics-container`) e **Informes PDF** (`#inf-container`). `analisisTab()`/`initAnalisis()` conmutan visibilidad y hacen lazy init del sub-módulo activo (`initAnalyticsPanel()`/`initInformes()`). Eliminados nav/tab/panel separados de Analytics e Informes; quitada de `auth.js#showTab` la rama `informes` y la visibilidad de `tab-informes`.
- `2026-06-09` · **Multi-curso horarios_grupo** — `curso_escolar TEXT NOT NULL DEFAULT '2025-26'` + `info_centro.curso_activo`; global `cursoActivo` en `config.js`; auth.js carga `curso_activo` tras login (fire-and-forget); 7 queries `chat.js` + 4 `admin.js` filtran por `curso_escolar`; Planner Publicar: selector 2025-26/2026-27, aviso si es el curso activo, DELETE filtra por `centro_id+curso_escolar+grupo_horario`. Migración `horarios_curso_escolar.sql` PENDIENTE ejecutar manualmente.
- `2026-06-09` · **Planner: HC-MATERIA-DIA en H-MRV-SA** — `TimetableSolver` añade `subjectDayOccupancy` y `maxPerDay=ceil(h/5)` en constructor; `getValidSlots` las comprueba; `assignBlock`/`removeBlock` las mantienen sincronizadas. Aplica en fase greedy (MRV) y SA (SWAP+RELOCATE) en los 3 Workers.
- `2026-06-09` · **Planner fix: slots sin profesor_id** — `plannerElegirVariante` construía slots sin `profesor_id`, `materia_id`, `codocente_prof_ids` → `_slotSinProfesor()` = true → "⚠ Sin asignar" en todas las celdas. Fix: extraer `tIds=item.teacherIds`, poblar los tres campos + `sin_asignar`.
- `2026-06-09` · **Agora tramos 26-27** — 10 tramos cargados vía Management API: 8 lectivos (08:50–17:00) + Recreo (11:20–11:50) + Comida (14:20–15:20). Anteriores 7 genéricos borrados.
- `2026-06-09` · **`scripts/importar_cargas_eso.mjs`** — importa `data/Cargas_ESO_limpia.xlsx` hoja "Cargas ESO" para 1ºESO A/B/C + 3ºESO A/B/C. Borra necesidades_lectivas del centro, get-or-create materias+profesores por nombre normalizado, placeholders `PENDIENTE-<Grupo>-<Materia>` para celdas sin profesor. Resultado: 75 filas, 0 nulls.
- `2026-06-09` · **push_subscriptions** — tabla confirmada en producción (aplicada en sesión anterior): `id, user_id, centro_id, subscription jsonb, created_at`; RLS `push_own` + `push_superadmin`. VAPID secrets configurados en EF `send-push`.
- `2026-06-09` · `a4684f1` — feat(informes): módulo **Informes de dirección** (`js/informes.js`, sin SQL — solo lee tablas existentes). Selector de periodo (presets Esta semana/mes/trimestre/curso + rango personalizado) → **PDF consolidado** con jsPDF + **jspdf-autotable** (CDN on-demand). Cabecera por página: logo + nombre del centro + "INFORME DE DIRECCIÓN" + periodo, banda con `color_primario` (patrón de `plannerExportarPDF`); pie con centro + nº página. 6 secciones (Resumen, Sustituciones, Ausencias RRHH, Guardias, Incidencias, Comedor), cada una con su query por `centro_id`+rango; sin datos → "Sin registros en este período". Registrado en `app.html` (tab/nav grupo Administración/panel/TAB_MAP) + `auth.js` (showTab; visible solo admin/director/jefatura/superadmin). SW `v5→v6`.
- `2026-06-09` · `4cfcc31`/`b9bf71c` — feat(materiales): form de subida **multi-grupo** (`<select multiple>`; sube el archivo 1 vez y crea 1 registro por grupo; al borrar solo quita de Storage si ningún otro registro comparte `storage_path`) + **"solo mis clases"** (match nombre normalizado del profesor contra `profesores.nombre`, sin acentos/coma/orden → grupos de `necesidades_lectivas`; fallback a `alumnos`→`necesidades_lectivas` + aviso).
- `2026-06-09` · `dc9f12c`/`0c225fd` — feat(materiales): módulo **hub de materiales** por grupo/asignatura (`js/materiales.js`, tabla `materiales` + bucket privado `materiales`, `supabase/migrations/materiales.sql` ejecutado). Lectura todos los roles del centro; subida (archivo a Storage privado con signed URL 1h, o enlace) para docentes/dirección; borrado subidor o admin. RLS de tabla + de Storage por centro. Vista profesor: por defecto **"Mis materiales"** (`profesor_id=auth.uid()`) con toggle "Mis materiales/Todos"; filtros Grupo/Asignatura poblados desde la vista actual. Registrado en `app.html` (tab/nav grupo Docencia/panel/TAB_MAP) + `auth.js` (showTab; tab visible a todos los roles). SW `v4→v5`.
- `2026-06-09` · `2d705b1` — feat(planner): la hoja **"Cargas"** del importador deja de ir a `planner_cargas` y se vuelca a lo que lee el generador → **materias + profesores + necesidades_lectivas** (con `centro_id=ctrId`). Casa asignatura→`materia_id` (nombre normalizado) y profesor→`profesor_id` (palabras ordenadas sin coma: "Cerro, Sara" ≡ "Sara Cerro"), crea los que falten; borra+inserta necesidades; filas sin horas no se importan. (`_impCargasANecesidades`). Matching de hojas tolerante a prefijos "N. " e ignora "LÉEME" (`458dc02`); tabla extra `planner_grupos` para la hoja Grupos.
- `2026-06-09` · `21bf059` — feat(planner): modelo de datos de **entrada del generador** + importador. 7 tablas (`planner_profesores`, `planner_cargas`, `planner_tramos`, `planner_restricciones`, `planner_disponibilidad`, `planner_espacios`, `planner_reglas`), todas con `centro_id` + índice + RLS `centro_isolation` (`sql`/`supabase/migrations/planner_inputs.sql`, ejecutado vía Management API). Nueva sub-pestaña **Importar** del Planner: botón "Importar datos de horario" que lee un `.xlsx` con SheetJS, mapea cada hoja→tabla por nombre (tolerante a acentos/sinónimos) y columnas por cabecera (alias + conversión num/int/bool Sí-No/hora Excel→HH:MM), vuelca con el `centro_id` de Agora (`ad0168e8…`) reemplazando datos previos (delete+insert) y muestra log por hoja. (`_renderImportar`/`plannerImportarArchivo`/`_impProcesar` en `js/planner.js`).
- `2026-06-09` · `e38176e` — feat(calificaciones): módulo gradebook nuevo (`js/calificaciones.js`). Tabla `calificaciones` + RLS (`supabase/migrations/calificaciones.sql`, ejecutado). Vista profesor (`profesional`): grupo/asignatura/evaluación → tabla editable de notas (0–10) con prerelleno y upsert masivo (`onConflict centro_id,alumno_id,asignatura,evaluacion`). Vista dirección (`admin`/`superadmin`): filtros + tabla solo lectura + export CSV (SheetJS) y PDF (jsPDF). Registrado en `app.html` (tab/nav grupo Docencia/panel/TAB_MAP) + `auth.js` (showTab + visibilidad; no familia). SW `v3→v4`.
- `2026-06-05` · Asistente IA como **burbuja flotante** + **sidebar rediseñado**. (1) El chat sale del rail fijo a un **overlay deslizante** (`#asistente-overlay`/`.asist-panel`, derecha, IDs del chat intactos → listeners OK); **burbuja FAB** (`#asistente-fab`, 56px, color `--ink` del centro) abajo-derecha + globo de invitación (`#asistente-hint`, una vez, localStorage `asist_hint_dismissed`); home full-width; dos accesos (item sidebar "Asistente IA" → `openAsistente()` y burbuja). `askQ` (chat.js) abre el overlay. Funciones `open/close/toggleAsistente` en el script inline de `app.html`. (2) Sidebar agrupado: Inicio + Asistente (sin cabecera) · grupos **DOCENCIA** (Sustituciones/Incidencias/Comunicados/Comedor) y **CENTRO** (IB/RRHH/Espacios) · iconos 19px con color por familia (`--nav-color`), activo = `color-mix` tintado del color de familia (Inicio/Asistente = `--info`); perfil abajo con `border-top`.
- `2026-06-05` · Home rediseñada (6 cambios) — cabecera compacta + buscador protagonista; topbar minimalista (logo+centro+lupa+avatar); bloque "Mi horario de hoy" (`renderMiHorarioHoy`); métricas accionables (`renderHomeMetrics`); eliminados grids "Módulos"/"Acceso rápido"; command palette global ⌘K (`js/palette.js`, busca alumnos/profesores/aulas en tablas + `horarios_grupo`). Ver "Home rediseñada" arriba.
- `2026-06-05` · **Incidencias** — vistas diferenciadas por rol: admin ve pantalla completa (tipificar IA, cerrar, eliminar); profesional ve formulario simple (selector alumno de sus grupos, descripción, sin IA) + historial readonly. `initIncidenciasPanel()` bifurca a `#inc-vista-admin` / `#inc-vista-profesor`. `_incLoadAlumnosProfesor()` carga solo alumnos de los grupos del profesor via `horarios_grupo`. Notificación automática a jefatura al registrar.
- `2026-06-05` · **Fix chat EF** — eliminados los 5 `console.log` de debug temporal de `callGemini`; restaurado a fetch directo. EF redesplegada.
- `2026-06-05` · **Fix ausencias** — eliminado campo inexistente `trabajo_alumnos` del INSERT a `ausencias_profesor`; `trimestre` y `curso_escolar` (NOT NULL) calculados inline sin depender de `rrhh.js`.
- `2026-06-05` · **Flujo unificado ausencias** — formulario único en Sustituciones (vista profesional) reemplaza los dos módulos separados: fecha inicio/fin, motivo (6 tipos RRHH), grupos, tramos/todo el día, instrucciones para sustituto, justificante opcional. `notificarAusenciaProfesor()` dual-write: INSERT `ausencias_profesor` (admin) + INSERT `sustituciones` por cada día lectivo (operativo) con `§RRHH§{ausencia_id}` en observaciones. Historial unificado 7 cols con estado operativo + estado RRHH. RRHH profesional simplificado a historial readonly + banner redirect.
- `2026-06-05` · **Sustituciones notificaciones** — EF `notify-sustitucion`: email al ausente ("cubierta por X") + email al sustituto (grupo, tramo, instrucciones) al asignar. `registrarSustitucion()` y `toggleCubierta()` llaman la EF. EF `notify-justificante`: recordatorio 48h sin justificante. Cron pg_cron `notify-justificante-daily` `0 8 * * *` via migración SQL. `window._subirJustificante` + `window._descargarJustificante` en admin.js.
- `2026-06-05` · **Sustituciones vistas por rol** — `initSustPanel()` bifurca: admin → `#sust-vista-admin` (pantalla actual); profesional → `#sust-vista-profesor` (form notificación + historial). Selector alumno pre-cargado con grupos del profesor. EF `notify-ausencia` actualizada con `motivo` y `fecha_fin`.
- `2026-06-05` · **Migration** — `20260605002_sustituciones_sustituto_nullable.sql`: `profesor_sustituto DROP NOT NULL` (permite registrar ausencias sin sustituto asignado). Aplicada vía Management API.
- `2026-06-05` · **Planner fallback** — `TRAMOS_DEFAULT` reemplazado por horas redondas genéricas (8:00–14:30, sin coincidir con ningún centro real). Banner `#planner-tramos-warn` aparece cuando el centro no tiene `tramos_centro` configurados, con botón directo a la pestaña Tramos.
- `2026-06-05` · **Comedor contextual** — `_detectarContextoProfesor()` usa `tramos_centro` + `horarios_grupo` para detectar clase activa. Banner `#comedor-contexto-banner` con chips de grupos. Eliminada dependencia de tabla legacy `horarios`.
- `2026-06-05` · **Auth invite flow** — `config.js` detecta `type=invite` y `type=recovery` en hash Y query params. `showRecovery(type)` muestra "Crea tu contraseña" para invitados, "Nueva contraseña" para recovery. Mínimo contraseña subido a 8 caracteres.
- `2026-06-05` · **Chat EF routing** — descripción `generar_tramos_horario` mejorada con triggers explícitos. Regla 5 en `toolInstr`: bypass del interceptor cliente cuando la petición es de creación de tramos (`esCreacionTramos` en `chat.js`). Debug logs de Gemini eliminados.
- `2026-06-04` · Exportaciones — SheetJS (xlsx 0.18.5) cargado en `app.html`. **Planner**: botones PDF (jsPDF, página por grupo + por profesor, cabecera con logo/color del centro y curso escolar) y Excel (hoja por grupo, por profesor y resumen del centro); hidrata desde `horario_generado` si el tablero está vacío. **Sustituciones/Comedor/Incidencias**: CSV → .xlsx (Comedor con 2ª hoja desglose por grupo). **RRHH**: nuevo botón Exportar → .xlsx (ausencias + resumen por profesor). **Guardias**: nuevo botón Exportar → .xlsx (ranking equidad + detalle). **Alertas predictivas**: índice creado, tabla `alertas_predictivas` ya operativa.
- `2026-06-04` · Planner — horarios SIN profesor asignado: (1) `horario_generado.profesor_id` nullable; (2) modo CSP "sin profesores" (`plannerGenerarSinProf`, slots `profesor_id null`); (3) Tablero: slots rayados "Sin asignar", modal selector + panel lateral de profesores arrastrables; (4) chat: `asignar_profesor` + `asignar_profesor_materia` (masivo). Validación de conflicto profesor en todos los caminos. EF desplegada. `scripts/verify-sin-profesor.js`
- `2026-06-04` · Planner Tablero — drag & drop con validación de hard constraints al soltar (`_ejecutarDrop` simular-validar-revertir, flash rojo + toast en rechazo) + zona "Aparcados" persistida en localStorage (retirar clases temporalmente, recolocar arrastrando, aviso en recarga/publicación). `scripts/verify-tablero-dnd.js` (14 checks)
- `2026-06-04` · EF `chat` — 4 herramientas Gemini para editar `horario_generado` del Planner sin regenerar: `mover_clase`, `eliminar_clase`, `añadir_clase`, `cambiar_profesor`. Resuelven materia/profesor por nombre o ID y validan hard constraints (HC-MATERIA-DIA/HC-VENTANA/HC-INICIO-FIN) + disponibilidad y ocupación de profesor/grupo. Requieren confirmación. ✅ Desplegada a producción (rflfsbrdmgaidhvbuvwb)
- `2026-06-04` · `9b0e81d` — feat(planner): hard constraints universales HC-VENTANA + HC-INICIO-FIN en `_esHardValido()` (V2); reetiquetada HC-MATERIA-DIA; `scripts/verify-hard-constraints.js` valida los 3 invariantes con IES Demo
- `2026-06-03 23:45` · `aedc22f` — feat: EF chat — herramienta generar_tramos_horario
- `2026-06-03 23:30` · `7e3e7ca` — docs: CLAUDE.md — changelog sesión 2026-06-03 noche
- `2026-06-03 23:29` · `1fe6497` — fix: nombre de usuario usa profile.full_name en lugar del email
- `2026-06-03 23:21` · `6f255fd` — test: entorno RLS — 4 usuarios de test + script de provisioning
- `2026-06-03 21:32` · `dadcca2` — test: Playwright pre-demo check — 8 módulos con reporte HTML
- `2026-06-03 21:11` · `f31876f` — docs: CLAUDE.md — estado completo 2026-06-03
- `2026-06-03` · Supabase deploy — EF `chat` redesplegada a producción (7 herramientas, +tramos)
- `2026-06-03 20:45` · `cb2c115` — feat: EF chat — herramientas crear_tramos_centro y listar_tramos_centro
- `2026-06-03 20:40` · `727edc1` — feat: landing — precios 249/399, 8 módulos, FUNDAE actualizado, © 2026
- `2026-06-03 20:32` · `04ca622` — fix: aviso urgente persiste tras borrarlo + banner bienvenida (2 bugs)
- `2026-06-03 20:27` · `dbea96e` — fix: banner bienvenida siempre muestra el centro activo
- `2026-06-03 00:09` · `3941d91` — docs: CLAUDE.md — guía de elección de modelo por tipo de tarea
- `2026-06-03 09:52` · `59989e3` — chore: migración add_codigo_acceso — columna centros ya existía en producción
- `2026-06-03 09:45` · `d2ddc16` — feat: código de centro opcional en registro — columna codigo_acceso
- `2026-06-03 00:06` · `7807ade` — docs: CLAUDE.md — infraestructura Playwright e2e y convención credenciales test
- `2026-06-03 00:03` · `528eeb2` — test: Playwright e2e — aislamiento multi-tenant RLS entre Agora y Buñol
- `2026-05-29 22:53` · `6de52a7` — debug: EF chat — try/catch con console.error en Path A confirm_tool
- `2026-05-29 22:49` · `7ec8fde` — fix: EF chat — profesor_sustituto null en crear_sustitucion
- `2026-05-29 22:48` · `38796b8` — fix: sustitucion — añadir hora_inicio/hora_fin a _sustData y EF chat
- `2026-05-29 22:44` · `f7aa9e1` — fix: EF chat — creado_por usa user_id (UUID) no user_name en crear_sustitucion
- `2026-05-29 22:40` · `4b34bd0` — fix: chatbot — pending_contents fallback a history cuando es null (bypass Gemini)
- `2026-05-29 22:39` · `eaa2685` — fix: chatbot — _sustData al inicio de sendMsg para evitar scope error
- `2026-05-29 22:37` · `958075f` — fix: chatbot — mover _sustData al scope del if (!grupoTarget) externo
- `2026-05-29 22:21` · `43ff95e` — feat: chatbot — bypass Gemini para sustitución con datos resueltos, mostrar tarjeta directamente
- `2026-05-29 22:18` · `bb4740f` — fix: chatbot — eliminar console.log de debug temporales
- `2026-05-29 22:17` · `d2b914c` — feat: chatbot — datos estructurados para sustitución en horarioGrupoCtx
- `2026-05-29 22:09` · `801e8fd` — debug: chatbot — log horarioGrupoCtx tras else-if sustitucion (temporal)
- `2026-05-29 22:07` · `0382040` — debug: chatbot — logs diaFinal, clasesDia y respuestaHorarioDirecta (temporal)
- `2026-05-29 22:05` · `4ebc8a0` — debug: chatbot — logs búsqueda profesor (temporal)
- `2026-05-29 22:00` · `a3ca508` — fix: chatbot — restituir busy/return en rama horario directo + limpiar flujo sustitucion
- `2026-05-29 21:52` · `5014b02` — docs: CLAUDE.md — flujo sustitución inteligente documentado
- `2026-05-29` · (este) — docs: CLAUDE.md actualización — flujo sustitución inteligente documentado
- `2026-05-29` · `a3ec38f` — fix: sustitucion busca horario profesor automaticamente (CLAUDE.md)
- `2026-05-29` · `ce6663a` — feat: chatbot — sustitucion activa esConsultaHorario + inyecta contexto horario a Gemini
- `2026-05-29` · `3f5c9da` — docs: CLAUDE.md actualización 2026-05-29 noche — chatbot contexto profesor + bugs RRHH/incidencias
- `2026-05-29` · `19d25e4` — fix: contexto profesor entre turnos + tramos ordinales + stopwords (CLAUDE.md)
- `2026-05-29` · `4c024f0` — feat: chatbot — detectar tramos ordinales en extractDiaHora (tercera hora → 10:40)
- `2026-05-29` · `383f2a9` — feat: chatbot — guardar contexto último profesor entre turnos (_ultimoProfesor)
- `2026-05-29` · `ab16a70` — fix: chatbot — ampliar STOPWORDS_PROF (50+ términos: sustitución, ordinales, partículas)
- `2026-05-29` · `db97149` — docs: CLAUDE.md — migraciones bugs-prod-2026-05-29 ejecutadas en Supabase
- `2026-05-29` · `89d1cda` — fix: 2 bugs producción Agora — ausencias_profesor.tramo DROP NOT NULL + columnas IA incidencias + profesor_sustituto null (admin.js)
- `2026-05-29` · `d3bbb4b` — fix: chatbot — búsqueda profesor tolerante a tildes, stopwords y diminutivos (Salva→Salvador)
- `2026-05-29` · `b96172d` — merge: integrar cambios del PC de casa + sanitizeReply en chat agente
- `2026-05-29` · `6ace69a` — fix: 5 edge cases — selector sustitutos usa fecha formulario, guard re-aprobación, tab IB para profesional, límite comunicados 500, superadmin sin centros muestra mensaje
- `2026-05-29` · `f1e1582` — fix: 4 issues de seguridad — contraseña en _regPass, SB_URL en notify-role, sanitizeReply Gemini, JSON.stringify en onclick alumnos
- `2026-05-29` · `70960c3` — fix: 8 bugs moderados — RRHH (privacidad motivo, null sustituto, ilike nombre), admin (badge sin cubrir, filtro al eliminar), incidencias (cache por ctrId), comunicados (grupo vacío), usuarios (eliminar solo pendientes)
- `2026-05-29` · `d7c654a` — fix: 5 bugs críticos — comedor (horaActual, toggleAsistencia fecha, filtro grupo, histórico limit), guardias (ilike wildcards)
- `2026-05-29 01:16` · `449da65` — docs: auditoría técnica exhaustiva — módulos, EFs, n8n, seguridad, deuda técnica
- `2026-05-29 01:01` · `f87dcf8` — fix: chatbot agente ejecutor — systemInstruction + toolInstr sin confirmación
- `2026-05-29 00:51` · `5ce7a90` — feat: dashboard Classroom-style — module cards, metrics pills, sidebar tint
- `2026-05-29 00:37` · `f892da7` — docs: CLAUDE.md actualización completa 2026-05-29
- `2026-05-29 00:29` · `d23d852` — docs: CLAUDE.md — chatbot agente ejecutor + deploy EF chat
- `2026-05-29` · Supabase deploy — EF `chat` desplegada con function calling (5 herramientas)
- `2026-05-29 00:26` · `fc4c6a1` — fix: móvil — Planner en drawer Más + selector de centro para superadmin
- `2026-05-29 00:19` · `636e534` — fix: revisión completa móvil — 24 issues cubiertos
- `2026-05-29 00:11` · `5d7cf08` — feat: chatbot agente ejecutor — function calling con confirmación UI
- `2026-05-29 00:02` · `ad12d40` — fix: mobile responsive — planner list view, forms 44px, analytics charts, comunicados en drawer Más
- `2026-05-28 14:47` · `bf2a3fc` — feat: CMI Analytics — Cuadro de Mando Integral con alertas predictivas
- `2026-05-28 14:22` · `48d624b` — feat: Planner — H-MRV-SA UI connection (progreso, variantes, diagnóstico)
- `2026-05-28 06:48` · `02420d1` — feat: motor H-MRV-SA — TimetableSolver + DidactIAPlanner (motor puro)
- `2026-05-28 01:06` · `a44a77a` — feat: Planner — tab Dictar con IA multimodal (voz/texto/audio) + EF parse-restricciones desplegada
- `2026-05-28 00:48` · `90bb22b` — feat: planner — tooltip LOMLOE + configuración de tramos horarios
- `2026-05-28 00:20` · `42e700b` — fix: planner — incluir profesores con activo=null en query
- `2026-05-27 23:59` · `eb4b0eb` — design: landing page — animaciones con propósito, anti-patterns eliminados, CSS premium
- `2026-05-27 23:45` · `54827f4` — docs: CLAUDE.md actualización 2026-05-27 — módulo Planner completo
- `2026-05-27` · SQL ejecutado en Supabase — tablas planner activas en producción (rflfsbrdmgaidhvbuvwb)
- `2026-05-26 06:55` · `255a1b2` — feat: DidactIA Planner — generador de horarios con CSP + drag & drop
- `2026-05-26 01:07` · `3415272` — fix: patch Recientes click handlers via MutationObserver
- `2026-05-26 00:59` · `d5fb03e` — fix: tipografía, barra stat tiles y greeting — fidelidad visual 01-inicio-admin
- `2026-05-26 00:53` · `5afc6b3` — feat: inicio admin layout — stat2 tiles, AI rail, sidebar SVG brand, topbar v2
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
