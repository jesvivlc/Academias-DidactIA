# DidactIA — Roadmap, Automatizaciones n8n y Registro de cambios

> Referenciado desde CLAUDE.md. Ver también @CLAUDE-MODULOS.md y @CLAUDE-TABLAS.md.

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

- `cas_actividades` — ver esquema en @CLAUDE-TABLAS.md
- `extended_essay` — ver esquema en @CLAUDE-TABLAS.md

---

## Roadmap

### 📍 Punto de retomar — sesión 2026-06-12

**Hecho hoy (todo en `main`, último commit `3388eeb`, desplegado en Vercel + Supabase):**
1. **Módulos siempre disponibles para todos los centros (excepto IB)** — `_conModulosBase()` en `config.js`; eliminados los toggles de módulos del panel Usuarios. Limpieza: `.gitignore` ignora `repomix-output.xml` y `edubot-supabase (1).html`.
2. **Portal familia consolidado** — `renderHomeFamilia` ahora es el hub: bloque Avisos (aviso del centro + cambios de clase hoy, antes huérfano en `panel-avisos`) y comedor accionable ("avisar que no come mañana"). `syncGroupLabels()` oculta encabezados de grupo vacíos en el sidebar.
3. **Módulo Alumnos nuevo** (`js/alumnos.js`) — directorio (buscar/filtrar/**export Excel**) + ficha individual (familias vinculadas, horario, comedor 14d, incidencias, calificaciones) + acciones (**registrar incidencia** prerrellenada, **export PDF** de la ficha) + integración **⌘K** (abre ficha) + acceso desde sidebar (grupo Docencia, `nav-alumnos`). Visible a staff, no familia.
4. **Calificaciones para familias** (solo lectura) — `_calRenderFamilia` (tabla pivote asignatura×evaluación, selector de hijo); tab visible para familia.
5. **🔒 Auditoría RLS + cierre de fuga RGPD sistémica** (lo más importante). Las cuentas `familia` (que tienen `centro_id`) podían leer por API datos de TODOS los alumnos. Aplicado y verificado en producción:
   - `calificaciones_familia_rls.sql` — familia solo notas de sus hijos.
   - `rls_familia_lockdown_fase1.sql` — 7 tablas staff-only (informes/medidas/cuestionarios/alertas de orientación, alertas_predictivas, no_conformidades, acciones_capa).
   - `rls_familia_lockdown_fase2.sql` — expedientes/tramites_orientacion + incidencias → staff-only con RPCs `SECURITY DEFINER` (`familia_tramites_visibles`, `familia_incidencias_hijos`); `feedback_familias` → propio. JS acoplado desplegado.

**Pendiente / próximos pasos:**
- ⚠️ **Rotar el token de Management API `sbp_…`** (tarea del usuario; Account → Access Tokens). Se usó en esta sesión para aplicar las migraciones RLS.
- **Verificación funcional RLS con un usuario familia real**: loguearse como familia y comprobar que (a) ve sus notas/trámites/incidencias y (b) NO puede leer las de otros alumnos por API. Las migraciones están verificadas a nivel de política/RPC, falta la prueba e2e con sesión de familia.
- **Revisar otras tablas con el mismo patrón** `centro_id = mi_centro` por si alguna sensible quedó fuera de la auditoría (se cubrieron orientación, calidad, calificaciones, incidencias, feedback; faltaría repasar p.ej. `ausencias_profesor`, `sustituciones`, `salidas`/`participantes_salida`, `comunicados` — menos críticas pero conviene mirar).
- **Redesign visual** (Alumnos/Asistente/Sustituciones/Incidencias): **bloqueado** — faltan las capturas de `design_handoff_didactia/screenshots/` (el directorio no está en el repo). Si se quiere retomar, hay que aportar las capturas de referencia.
- **App Familias**: el portal está consolidado; quedaría (opcional) una PWA/onboarding dedicado.

### Completado ✅
- [x] Chatbot con Gemini 2.5 Flash, contexto multi-rol, resolución directa de horarios
- [x] Módulo comedor: asistencia diaria, histórico 30 días, CSV export
- [x] Sustituciones: registro, toggle cubierta, filtros, CSV, contador de tab
- [x] Bolsa de guardias con equidad (ranking trimestral, barra de progreso, selector ordenado)
- [x] Dashboard por rol con contadores live y búsqueda rápida de alumno
- [x] Gestión de usuarios: invitar, editar, desactivar, reenviar invitación, badges de estado
- [x] Módulos siempre disponibles para todos los centros (excepto IB) — eliminados los toggles de módulos en Usuarios (`_conModulosBase` en config.js)
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
- [x] Módulo Alumnos (`js/alumnos.js`): directorio del centro (buscar/filtrar por grupo/export Excel) + ficha individual (familias, horario, comedor, incidencias, calificaciones) + acciones (registrar incidencia prerrellenada, export PDF) + integración ⌘K. Staff only.
- [x] Calificaciones para familias (solo lectura): vista pivote asignatura×evaluación de sus hijos (`_calRenderFamilia`)
- [x] Control de asistencia de aula (`js/asistencia.js`): modal 📋 Pasar lista desde clase AHORA en Mi Horario de Hoy; toggle Presente/Retraso/Ausente; UPSERT en `asistencia_clase`; push familias (ausente=inmediato, retraso=al confirmar); métrica CMI Ausencias de aula hoy en Dimensión 1
- [x] Auditoría RLS + cierre de fuga RGPD (familias podían leer datos de todos los alumnos): calificaciones + fase 1 (7 tablas staff-only) + fase 2 (orientación/incidencias vía RPCs SECURITY DEFINER + feedback propio). Las 3 migraciones aplicadas y verificadas en producción

### En progreso — Redesign visual completo (design_handoff_didactia/)
- [x] Design tokens v2 + layout shell
- [x] Logo brand SVG + wordmark sidebar
- [x] Inicio admin (Classroom-style: banner ink, metrics pills, modules grid con colores)
- [x] Inicio profesor (`#inicio-staff`): "Mi horario de hoy" como hero (borde izq `--ink`) + franja "Acciones rápidas" del docente (Notificar ausencia/Registrar incidencia/Materiales/Calificaciones, navegación pura) + métricas bajo "Estado del centro hoy". Solo `app.html`+`styles.css` (`.home-quick`/`.home-quick-btn`/`.home-quick-label`), sin tocar JS ni IDs
- [ ] Alumnos — split tabla/perfil drawer (`02-alumnos.png`)
- [ ] Asistente IA — pantalla full-screen chat split (`06-chat.png`)
- [ ] Sustituciones — tabla densa + popover + banner IA (`04-sustituciones.png`)
- [ ] Incidencias — split lista/detalle con timeline (`05-incidencias.png`)

> **Regla de implementación UI:** NO tocar archivos JS. Solo `app.html` e `css/styles.css`. Mantener TODOS los IDs existentes. Usar `var(--ink)` en lugar de colores navy fijos para respetar tematización.

### Próximo sprint — App Familias / Portal familias
- [ ] **App Familias (PWA separada o tab nuevo)** — onboarding, dashboard hijo, chat con el centro, notificaciones push
- [x] **Notificaciones push** — Web Push API; notificar familias cuando alumno falta al comedor (pendiente: sustituir TODO `VAPID_PUBLIC_KEY` en `config.js` con el valor real del secret de Supabase)
- [x] **Módulo IB en la app** (`js/ib.js`): 6 sub-paneles. Base: CAS (actividades por alumno, aprobar/rechazar, editar Learning Outcomes + sugerencia IA), Extended Essay, Plazos. Ampliación 2026-06-12: **TOK** (ensayo+exhibición, estado/nota A–E), **EE mejorado** (nota final + borradores/feedback del supervisor `ee_borradores`), **Predicciones/Resultados** (rejilla por asignatura HL/SL, 1–7), **Coordinador** (vista global: CAS/EE/TOK/Σpredicción/Σfinal/puntos core matriz TOK×EE/total /45). Cableado `#tab-ib`/`#nav-ib`/`#panel-ib` + `showTab('ib')→loadIbPanel()`. Cubierto por `demo-check` (módulo 15)
- [x] **Recuperación de contraseña** (2026-06-12): enlace "¿Olvidaste tu contraseña?" en login + form `#form-reset-request` → `doRequestReset()` llama `sb.auth.resetPasswordForEmail(email, {redirectTo: app.html})` con mensaje neutro anti-enumeración; `_hideAuthForms()` helper. El enlace del email vuelve a `app.html` (`type=recovery`) → `config.js` → `showRecovery()` → `doRecovery()`. Allowlist de Auth ampliada con `https://didactia.eu/**` y `https://www.didactia.eu/**` (Management API) para permitir el redirect a `/app.html`
- [x] **Onboarding de nuevo centro** (`js/users.js`, 2026-06-12): botón "+ Nuevo centro" en el panel de Usuarios (solo superadmin) → wizard modal (`nuevoCentroWizard`) con nombre, slug autogenerado/único, color, logo, módulos activos y **códigos de acceso autogenerados** (familia/profesional/general) → `INSERT centros` → modal de éxito que muestra los códigos y enlaza a "Invitar primer admin". Siguiente paso del onboarding (alumnos) ya cubierto por `scripts/importar_alumnos.mjs`

### Backlog
- [x] **P0 seguridad (cerrado):** `disponibilidad_profesor` no tiene columna `centro_id`. El aislamiento ya está garantizado por dos capas: (1) cliente filtra por `profesor_id IN (profIds)` donde `profIds` viene de `profesores` filtrado por `centro_id`; (2) RLS con policy `centro_isolation` aísla vía FK `profesor_id → profesores.centro_id`. No hay fuga cross-tenant. Sin cambios necesarios.
- [x] **P0 deploy resuelto:** EF `chat` redesplegada el 2026-06-03 con 7 herramientas. Deploy vía `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy chat --project-ref rflfsbrdmgaidhvbuvwb`
- [x] **P1 versionar EFs:** `invite-user` y `notify-role` extraídos del bundle ESZIP de producción y añadidos al repo (`c232c38`); `notify-sustitucion` deployada a producción (`2026-06-12`). Nota: `rapid-processor` y `cas-analyzer` están en prod sin versionar.
- [x] `sql/alertas-predictivas.sql` — tabla `alertas_predictivas` (Analytics CMI) **ya en producción** (verificado 2026-06-12: tabla + RLS `centro_isolation` + índice `idx_alertas_centro_activas` presentes; el SQL coincide con el esquema vivo). No requiere acción.
- [x] Importación masiva de alumnos/familias via CSV (`scripts/importar_alumnos.mjs`, 2026-06-12): cabeceras flexibles (nombre/curso/grupo_horario/familia_email/relacion), dedupe por nombre normalizado, vínculos `familia_alumno` por email de perfil, `--dry-run`. **Seguridad:** los 3 importadores (`importar_alumnos.mjs`, `importar_horarios_profes.mjs`/`.py`, `importar_cargas_eso.mjs`) ya NO hardcodean la `service_role` key — la leen de `SUPABASE_SERVICE_ROLE_KEY` (0 JWTs literales en el repo)
- [x] Estadísticas cross-centro para superadmin (`js/analytics.js`, 2026-06-12): vista multicentro ampliada en el Dashboard de Análisis (solo superadmin, `#cmi-mc-wrap`): tabla comparativa por centro (alumnos, sustituciones pendientes hoy, incidencias abiertas, comensales hoy, usuarios, alertas) con semáforo y fila de TOTALES. Fix: sustituciones sin cubrir ahora incluye `cubierta IS NULL`
- [x] Limpiar `repomix-output.xml` y `edubot-supabase (1).html` del repo (añadidos a `.gitignore`; `edubot-supabase (1).html` quitado del index con `git rm --cached`) ✅ 2026-06-12
- [x] Sustituir `TODO:VAPID_PUBLIC_KEY` en `config.js` con el valor real ✅ (par regenerado 2026-06-11, secrets actualizados vía Management API, EF `send-push` redesplegada)
- [x] Bug menor `send-push` (cerrado 2026-06-12): el delete por 410/404 ahora borra **solo la fila fallida** (`.eq("id", row.id)`, con `id` añadido al select), no todas las del `user_id` — un usuario con varios dispositivos conserva sus suscripciones válidas. EF redesplegada.

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

## Registro de cambios recientes

- `2026-06-13` — feat(asistencia): **módulo control de asistencia de aula** (`js/asistencia.js` nuevo + mejoras.js + analytics.js + app.html). Tabla `asistencia_clase` ejecutada vía Management API. Botón 📋 en clase activa AHORA en Mi horario de hoy. Modal fullscreen: alumnos del grupo con toggle Presente/Retraso/Ausente + observación; UPSERT inmediato; push a familias al marcar ausente (inmediato) o retraso (al confirmar). CMI: 4ª métrica Ausencias de aula hoy en Dimensión 1 Operativa.
- `2026-06-12 23:22` · `3fac06d` — docs(CLAUDE.md): sesión 2026-06-12 — sistema alergias/dietas documentado
- `2026-06-12 22:47` · `8aa7436` — feat(comedor): sistema unificado alergias/dieta — perfil permanente + nota diaria + pre-relleno salidas
- `2026-06-12 21:13` · `115a95b` — fix: resolver conflicto CLAUDE.md + deploy notify-sustitucion documentado
- `2026-06-12` — fix(seguridad RGPD): **auditoría RLS — fuga sistémica a familias**. El patrón `centro_id = mi_centro` en políticas de SELECT/ALL dejaba a las cuentas `familia` (que tienen `centro_id`) leer por API datos sensibles de TODOS los alumnos. **Fase 1 aplicada** (`rls_familia_lockdown_fase1.sql`): 7 tablas sin lectura de familia → staff-only (orientación clínica: informes/medidas/cuestionarios/alertas; alertas_predictivas; calidad: NC/CAPA). **Fase 2 aplicada** (`rls_familia_lockdown_fase2.sql`): expedientes/tramites_orientacion + incidencias → staff-only con RPCs `SECURITY DEFINER` (`familia_tramites_visibles`/`familia_incidencias_hijos`) para que las familias vean solo lo suyo (la RLS no filtra columnas → el RPC evita exponer `notas_internas`/`informe_borrador`); `feedback_familias` → propio. JS acoplado desplegado (`oriRenderTramitesFamilia` y bloque incidencias de `renderHomeFamilia` ahora llaman al RPC).
- `2026-06-12` — fix(seguridad)+feat(calificaciones): **calificaciones para familias (solo lectura) + cierre de fuga RGPD**. Hallazgo: la política `cal_read` permitía a cualquier usuario del centro (incl. `familia`) leer TODAS las calificaciones por API. Migración `supabase/migrations/calificaciones_familia_rls.sql` (✅ **aplicada y verificada en producción 2026-06-12**): staff lee su centro; familia solo `alumno_id ∈ familia_alumno(profile_id=auth.uid())`; superadmin todo. Vista familia en `js/calificaciones.js` (`_calRenderFamilia`: tabla pivote asignatura×evaluación, selector de hijo si >1, solo lectura). Tab Calificaciones visible para `familia` en `auth.js`.
- `2026-06-12` — fix(alumnos): familias vinculadas leídas en dos pasos (sin embed FK `familia_alumno→profiles`).
- `2026-06-12` — feat(alumnos): **módulo Alumnos nuevo** (`js/alumnos.js`). Directorio del centro: `initAlumnos()` (lista + buscador por nombre + chips de filtro por grupo, contador, **export Excel** `_alExportar` de la lista filtrada con SheetJS). Ficha individual `alumnosAbrirFicha(id)` con 5 bloques async fire-and-forget: familias vinculadas (`familia_alumno→profiles`), horario semanal por día (`horarios_grupo` por grupo+curso), comedor últimos 14 días lectivos, incidencias (`ilike alumno_nombre`), calificaciones (`calificaciones` por `alumno_id`). XSS: `_alEsc`; argumentos onclick seguros: `_alArg` (evita romper el atributo con UUIDs/grupos). **Integración ⌘K**: el command palette (`js/palette.js`) al elegir un alumno abre su ficha vía `window.alumnosVerFicha(id)` para staff (familia mantiene fallback al chatbot); `alumnosAbrirFicha` hace fetch del alumno por id si la lista no estaba cargada (apertura directa). **Acción "Registrar incidencia"** desde la ficha (`alumnosRegistrarIncidencia`, solo admin/admin_institucional/superadmin = visibilidad real del tab Incidencias): navega a Incidencias y prerrellena `inc-alumno`/`inc-grupo` (reintenta hasta que la vista admin renderice). **Export PDF de la ficha** (`alumnosExportarFichaPDF`, botón "⬇ PDF" para cualquier rol que ve la ficha): reutiliza los helpers globales de `informes.js` (`_infEnsureLibs`/`_infCentroInfo`/`_infImgToDataURL`/`_infHexToRgb`) → jsPDF + autotable con cabecera logo+color del centro; 5 secciones (familias, horario semanal, comedor 30d, incidencias, calificaciones), una fila "Sin registros" por sección vacía. Cableado en `app.html` (`tab-alumnos`/`nav-alumnos` grupo Docencia/`panel-alumnos`/TAB_MAP/MAS_CFG/TITLES/patch showTab/script) + `auth.js` (visibilidad: profesional/admin/admin_institucional/superadmin/director/jefatura/orientador, **no familia**). También: `syncGroupLabels()` oculta encabezados de grupo del sidebar sin items visibles.
- `2026-06-12` — feat(familia): **home consolidado como portal** (`renderHomeFamilia` en `js/mejoras.js`). Bloque "Avisos" (aviso del centro + cambios de clase hoy, antes huérfano en `panel-avisos`) + comedor accionable ("avisar que no come mañana", `window._fhAvisoManana`).
- `2026-06-12` — feat: **módulos siempre disponibles para todos los centros (excepto IB)** (`config.js` `_conModulosBase`, `auth.js`, `users.js`, `app.html`). Eliminados los toggles de módulos del panel Usuarios. Limpieza: `.gitignore` ignora `repomix-output.xml` y `edubot-supabase (1).html` (este último sacado del index).
- `2026-06-12 07:40` · `938602f` — docs(CLAUDE.md): P1 EFs versionadas — marcar completado + nota rapid-processor/cas-analyzer
- `2026-06-12` — fix: deploy `notify-sustitucion` a producción (estaba versionada pero no deployada)
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
- `2026-06-11` — feat(orientación): **notificaciones push + UX responsive** (`js/orientacion.js`). Push vía EF `send-push` (helper `_oriPush`, silencioso/no bloqueante) en 4 momentos: cuestionario completado→orientador; nueva alerta (manual y detección IA)→orientador/jefatura/director/admin; informe validado→director/admin; trámite `visible_familia`→familias (`familia_alumno.profile_id`). Responsive (CSS inyectado una vez, sin tocar `styles.css`): tabla→tarjetas en <768px, pestañas→`<select>`, modales 95%+×, FAB "Nuevo expediente", ellipsis en celdas.
- `2026-06-11` — feat(orientación): **exportación RGPD + estadísticas** (`js/orientacion.js`). "📥 Exportar expediente completo" (role-gated admin/director/jefatura/superadmin) → PDF único (jsPDF+autotable) con portada (logo+color, nota legal Art. 15 RGPD/LOPDGDD), medidas, informes (texto completo), observaciones docentes, trámites, alertas + pie/nº página + nota de cierre. "📈 Estadísticas": 6 bloques (4 tarjetas, barras por medida, línea alertas 6m por nivel, donut estado informes, top-10 cuestionarios pendientes, trámites por estado) con Chart.js + export PDF (tablas) y Excel (6 hojas).
- `2026-06-11` — feat(orientación): **IA + panel de riesgo + portal familias** (`js/orientacion.js`). Informes: "✨ Generar borrador con IA" (LOMLOE, vuelca sin guardar). Adaptaciones: "✨ Sintetizar observaciones docentes" (≥2 cuestionarios). Panel de riesgo: alertas activas ordenadas, alerta manual y "✨ Detectar riesgos automáticamente" (asistencia_comedor+sustituciones 30d→Gemini JSON→checkboxes→INSERT confirmados). Portal familias: sección autocontenida en la home (rol familia) con trámites `visible_familia=true`. IA vía EF `chat` con `role:"familia"` (texto puro); ninguna IA persiste sin acción manual.
- `2026-06-11` — feat(orientación): **expediente individual con 4 pestañas** (`oriAbrirExpediente`). Resumen (ficha + medidas activas + alertas + trámites), Informes (Ver/Editar con guardia firmado=solo lectura, Nuevo, Exportar PDF), Adaptaciones (medidas detalladas + cuestionarios docentes Rellenar/Ver/Enviar), Trámites (filtro + editar + badge visible familia).
- `2026-06-11` — feat(orientación): **módulo nuevo + tablas** (`js/orientacion.js`, `supabase/migrations/orientacion_base.sql` ejecutado vía Management API). 6 tablas + RLS por centro. Lista de expedientes (JOIN alumno+orientador, medida más grave activa, nivel de riesgo, filtros, contador, export XLSX, modal nuevo expediente). Nav item "🧭 Orientación" (grupo Centro, visible orientador/jefatura/director/admin/superadmin).
- `2026-06-10` — feat(login): **logo y color del centro en la pantalla de login** (antes de autenticar). `themeLoginScreen()` (en `js/auth.js`, llamada desde el boot de `js/config.js` tras crear el cliente) detecta el centro por la URL —`?centro=<uuid>` (por `id`) o `?centro=`/`?c=`/`?codigo=` con un código de acceso (cruza `codigo_familia`/`codigo_profesional`/`codigo_acceso`)— y aplica `applyTheme(color_primario, logo_url)`. Fallback: sin pista en URL → última marca usada en este navegador (`localStorage didactia_brand`, persistida por `_cacheBrand` tras login); sin nada → marca DidactIA por defecto.
- `2026-06-10` — feat(analisis): **fusión Analytics CMI + Informes en un módulo único "📊 Análisis"** (`app.html` + `js/auth.js`; `analytics.js`/`informes.js` intactos). Un único nav item (grupo Administración, visible admin/director/jefatura/superadmin) y `#panel-analisis` con dos pills internas: **Dashboard** (contenedor `#analytics-container`) e **Informes PDF** (`#inf-container`). `analisisTab()`/`initAnalisis()` conmutan visibilidad y hacen lazy init del sub-módulo activo. Eliminados nav/tab/panel separados de Analytics e Informes.
- `2026-06-09` · **Multi-curso horarios_grupo** — `curso_escolar TEXT NOT NULL DEFAULT '2025-26'` + `info_centro.curso_activo`; global `cursoActivo` en `config.js`; auth.js carga `curso_activo` tras login (fire-and-forget); 7 queries `chat.js` + 4 `admin.js` filtran por `curso_escolar`; Planner Publicar: selector 2025-26/2026-27, aviso si es el curso activo, DELETE filtra por `centro_id+curso_escolar+grupo_horario`. Migración `horarios_curso_escolar.sql` ✅ aplicada y verificada en producción (2026-06-12).
- `2026-06-09` · **Planner: HC-MATERIA-DIA en H-MRV-SA** — `TimetableSolver` añade `subjectDayOccupancy` y `maxPerDay=ceil(h/5)` en constructor; `getValidSlots` las comprueba; `assignBlock`/`removeBlock` las mantienen sincronizadas.
- `2026-06-09` · **Planner fix: slots sin profesor_id** — `plannerElegirVariante` construía slots sin `profesor_id`, `materia_id`, `codocente_prof_ids` → `_slotSinProfesor()` = true → "⚠ Sin asignar" en todas las celdas. Fix: extraer `tIds=item.teacherIds`, poblar los tres campos + `sin_asignar`.
- `2026-06-09` · **Agora tramos 26-27** — 10 tramos cargados vía Management API: 8 lectivos (08:50–17:00) + Recreo (11:20–11:50) + Comida (14:20–15:20). Anteriores 7 genéricos borrados.
- `2026-06-09` · **`scripts/importar_cargas_eso.mjs`** — importa `data/Cargas_ESO_limpia.xlsx` hoja "Cargas ESO" para 1ºESO A/B/C + 3ºESO A/B/C. Resultado: 75 filas, 0 nulls.
- `2026-06-09` · `a4684f1` — feat(informes): módulo **Informes de dirección** (`js/informes.js`). Selector de periodo → **PDF consolidado** con jsPDF + jspdf-autotable (CDN on-demand). 6 secciones (Resumen, Sustituciones, Ausencias RRHH, Guardias, Incidencias, Comedor). SW `v5→v6`.
- `2026-06-09` · `4cfcc31`/`b9bf71c` — feat(materiales): form de subida **multi-grupo** (`<select multiple>`) + **"solo mis clases"** (match nombre normalizado del profesor contra `profesores.nombre`).
- `2026-06-09` · `dc9f12c`/`0c225fd` — feat(materiales): módulo **hub de materiales** por grupo/asignatura (`js/materiales.js`, tabla `materiales` + bucket privado `materiales`, `supabase/migrations/materiales.sql` ejecutado). SW `v4→v5`.
- `2026-06-09` · `2d705b1` — feat(planner): la hoja **"Cargas"** del importador deja de ir a `planner_cargas` y se vuelca a `materias + profesores + necesidades_lectivas` (con `centro_id=ctrId`). (`_impCargasANecesidades`). Tabla extra `planner_grupos` para la hoja Grupos.
- `2026-06-09` · `21bf059` — feat(planner): modelo de datos de **entrada del generador** + importador. 7 tablas (`planner_profesores`, `planner_cargas`, `planner_tramos`, `planner_restricciones`, `planner_disponibilidad`, `planner_espacios`, `planner_reglas`). Nueva sub-pestaña **Importar** del Planner.
- `2026-06-09` · `e38176e` — feat(calificaciones): módulo gradebook nuevo (`js/calificaciones.js`). Tabla `calificaciones` + RLS (`supabase/migrations/calificaciones.sql`, ejecutado). Vista profesor: grupo/asignatura/evaluación → tabla editable. Vista dirección: filtros + tabla solo lectura + export CSV y PDF. SW `v3→v4`.
- `2026-06-05` · Asistente IA como **burbuja flotante** + **sidebar rediseñado**. El chat sale del rail fijo a un **overlay deslizante** (`#asistente-overlay`/`.asist-panel`, derecha); **burbuja FAB** (`#asistente-fab`, 56px, color `--ink` del centro) abajo-derecha + globo de invitación. Sidebar agrupado: Inicio + Asistente (sin cabecera) · grupos **DOCENCIA** y **CENTRO** · iconos 19px con color por familia (`--nav-color`), activo = `color-mix` tintado.
- `2026-06-05` · Home rediseñada (6 cambios) — cabecera compacta + buscador protagonista; topbar minimalista (logo+centro+lupa+avatar); bloque "Mi horario de hoy" (`renderMiHorarioHoy`); métricas accionables (`renderHomeMetrics`); eliminados grids "Módulos"/"Acceso rápido"; command palette global ⌘K (`js/palette.js`).
- `2026-06-05` · **Incidencias** — vistas diferenciadas por rol: admin ve pantalla completa; profesional ve formulario simple + historial readonly. `initIncidenciasPanel()` bifurca a `#inc-vista-admin` / `#inc-vista-profesor`.
- `2026-06-05` · **Flujo unificado ausencias** — formulario único en Sustituciones (vista profesional). `notificarAusenciaProfesor()` dual-write: INSERT `ausencias_profesor` (admin) + INSERT `sustituciones` por cada día lectivo (operativo) con `§RRHH§{ausencia_id}` en observaciones.
- `2026-06-05` · **Sustituciones notificaciones** — EF `notify-sustitucion`: email al ausente ("cubierta por X") + email al sustituto (grupo, tramo, instrucciones) al asignar. EF `notify-justificante`: recordatorio 48h sin justificante. Cron pg_cron `notify-justificante-daily` `0 8 * * *`.
- `2026-06-05` · **Migration** — `20260605002_sustituciones_sustituto_nullable.sql`: `profesor_sustituto DROP NOT NULL`. Aplicada vía Management API.
- `2026-06-05` · **Planner fallback** — `TRAMOS_DEFAULT` genérico + banner `#planner-tramos-warn`.
- `2026-06-05` · **Comedor contextual** — `_detectarContextoProfesor()` usa `tramos_centro` + `horarios_grupo` para detectar clase activa.
- `2026-06-04` · Exportaciones — SheetJS (xlsx 0.18.5) cargado en `app.html`. **Planner**: botones PDF y Excel. **Sustituciones/Comedor/Incidencias**: CSV → .xlsx. **RRHH**: nuevo botón Exportar → .xlsx. **Guardias**: nuevo botón Exportar → .xlsx.
- `2026-06-04` · Planner — horarios SIN profesor asignado: (1) `horario_generado.profesor_id` nullable; (2) modo CSP "sin profesores"; (3) Tablero: slots rayados "Sin asignar", modal selector + panel lateral de profesores arrastrables; (4) chat: `asignar_profesor` + `asignar_profesor_materia` (masivo).
- `2026-06-04` · Planner Tablero — drag & drop con validación de hard constraints al soltar (`_ejecutarDrop` simular-validar-revertir) + zona "Aparcados" persistida en localStorage.
- `2026-06-04` · EF `chat` — 4 herramientas Gemini para editar `horario_generado` del Planner sin regenerar: `mover_clase`, `eliminar_clase`, `añadir_clase`, `cambiar_profesor`. ✅ Desplegada a producción.
- `2026-06-04` · `9b0e81d` — feat(planner): hard constraints universales HC-VENTANA + HC-INICIO-FIN en `_esHardValido()` (V2); `scripts/verify-hard-constraints.js`
- `2026-06-03` · Supabase deploy — EF `chat` redesplegada a producción (7 herramientas, +tramos)
- `2026-06-03 20:27` · `dbea96e` — fix: banner bienvenida siempre muestra el centro activo
- `2026-06-03` · EF `chat` — herramientas `crear_tramos_centro` y `listar_tramos_centro` implementadas y desplegadas a producción
- `2026-06-03 00:03` · `528eeb2` — test: Playwright e2e — aislamiento multi-tenant RLS entre Agora y Buñol
- `2026-05-29 22:53` · `aedc22f` — fix: EF chat — try/catch con console.error en Path A confirm_tool
- `2026-05-29` · `a3ec38f` — fix: sustitucion busca horario profesor automaticamente
- `2026-05-29` · `ce6663a` — feat: chatbot — sustitucion activa esConsultaHorario + inyecta contexto horario a Gemini
- `2026-05-29` · `4c024f0` — feat: chatbot — detectar tramos ordinales en extractDiaHora (tercera hora → 10:40)
- `2026-05-29` · `383f2a9` — feat: chatbot — guardar contexto último profesor entre turnos (_ultimoProfesor)
- `2026-05-29` · `d3bbb4b` — fix: chatbot — búsqueda profesor tolerante a tildes, stopwords y diminutivos (Salva→Salvador)
- `2026-05-29` · `6ace69a` — fix: 5 edge cases — selector sustitutos usa fecha formulario, guard re-aprobación, tab IB para profesional, límite comunicados 500, superadmin sin centros muestra mensaje
- `2026-05-29` · `f1e1582` — fix: 4 issues de seguridad — contraseña en _regPass, SB_URL en notify-role, sanitizeReply Gemini, JSON.stringify en onclick alumnos
- `2026-05-29` · `70960c3` — fix: 8 bugs moderados — RRHH (privacidad motivo, null sustituto, ilike nombre), admin (badge sin cubrir, filtro al eliminar), incidencias (cache por ctrId), comunicados (grupo vacío), usuarios (eliminar solo pendientes)
- `2026-05-29` · `d7c654a` — fix: 5 bugs críticos — comedor (horaActual, toggleAsistencia fecha, filtro grupo, histórico limit), guardias (ilike wildcards)
- `2026-05-29 01:01` · `f87dcf8` — fix: chatbot agente ejecutor — systemInstruction + toolInstr sin confirmación
- `2026-05-29 00:51` · `5ce7a90` — feat: dashboard Classroom-style — module cards, metrics pills, sidebar tint
- `2026-05-29 00:11` · `5d7cf08` — feat: chatbot agente ejecutor — function calling con confirmación UI
- `2026-05-29` · Supabase deploy — EF `chat` desplegada con function calling (5 herramientas)
- `2026-05-28 14:47` · `bf2a3fc` — feat: CMI Analytics — Cuadro de Mando Integral con alertas predictivas
- `2026-05-28 14:22` · `48d624b` — feat: Planner — H-MRV-SA UI connection (progreso, variantes, diagnóstico)
- `2026-05-28 06:48` · `02420d1` — feat: motor H-MRV-SA — TimetableSolver + DidactIAPlanner (motor puro)
- `2026-05-28 01:06` · `a44a77a` — feat: Planner — tab Dictar con IA multimodal (voz/texto/audio) + EF parse-restricciones desplegada
- `2026-05-28 00:48` · `90bb22b` — feat: planner — tooltip LOMLOE + configuración de tramos horarios
- `2026-05-27 23:45` · `54827f4` — docs: CLAUDE.md actualización 2026-05-27 — módulo Planner completo
- `2026-05-26 06:55` · `255a1b2` — feat: DidactIA Planner — generador de horarios con CSP + drag & drop
- `2026-05-26 00:53` · `5afc6b3` — feat: inicio admin layout — stat2 tiles, AI rail, sidebar SVG brand, topbar v2
- `2026-05-25 20:27` · `e9e9652` — feat: design system v2 — warm editorial tokens + layout shell redesign
- `2026-05-25 16:57` · `182b449` — feat: migrar navegación a sidebar lateral con topbar y bottom nav móvil
- `2026-05-24 23:02` · `e755e36` — feat: módulo comunicados internos con envío por email y realtime
- `2026-05-24 22:52` · `68b7a46` — feat: flujo convivencia completo — informe editable + notificación jefatura
- `2026-05-24 21:43` · `e8089d4` — feat: tipificar-incidencia con normativas de todas las CCAA
- `2026-05-24 20:52` · `059f39a` — feat: mejoras módulo incidencias — buscador alumno, filtro grupo, CSV, contador tab
- `2026-05-23 17:44` · `bf718d3` — feat: SQL centro demo IES Demo con datos completos para ventas
- `2026-05-23 12:14` · `1484aab` — feat: n8n alertas plazos IB + tabla plazos_ib
- `2026-05-23 12:07` · `52ce5c3` — feat: n8n alerta absentismo comedor
- `2026-05-23 11:53` · `cd592dc` — feat: n8n informe semanal automático para dirección
- `2026-05-22` · `e56ccb2` — feat: `js/guardias.js` — bolsa de guardias con equidad por trimestre
- `2026-05-22` · `15ef7d8` — feat: `js/rrhh.js` — módulo RRHH completo (ausencias, aprobación, rechazo)
- `2026-05-22` · `049c9a1` — feat: `js/users.js` reescritura completa — panel admin+superadmin, modales invitar/editar, desactivar/reactivar, reenvío invitación
