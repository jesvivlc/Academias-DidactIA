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

### Recordatorio de tutorías (`n8n-recordatorio-tutorias.json`) ⏳ pendiente importar

**Trigger:** diario a las 18:00 (cron `0 18 * * *`).

**Nodos (5):** Diario 18:00 (scheduleTrigger) → Config y fecha (code: `SUPABASE_KEY` service_role + URL + `tomorrow`) → Get Citas Mañana (httpRequest GET `tutoria_citas?fecha=eq.{tomorrow}&estado=eq.confirmada`) → Build Push (code: un ítem por cita con `user_ids=[familia_id,tutor_id]`, título "📅 Recordatorio de tutoría", cuerpo con fecha+hora+alumno) → Send Push (httpRequest POST `{SUPABASE_URL}/functions/v1/send-push`, Bearer service_role).

**Notas:** envía **push** (no email) a familia y tutor la tarde anterior a cada cita **confirmada**; si una de las dos partes no tiene suscripción push, `send-push` simplemente la omite. Si no hay citas confirmadas mañana, el Build devuelve `[]` y no envía nada. **Pendiente:** importar en n8n y pegar la `service_role` key en "Config y fecha".

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
- [x] **Verificación funcional RLS con un usuario familia real**: test Playwright `tests/rls-familia.spec.js` (`npm run test:rls-familia`). Verifica: (a) incidencias/alertas_predictivas/no_conformidades/informes_psicopedagogicos/expedientes_orientacion → 0 filas (bloqueado por RLS); (b) calificaciones de IES Buñol → 0 filas (aislamiento cross-center); (c) RPCs `familia_incidencias_hijos()` y `familia_tramites_visibles()` responden 200 con array válido; (d) `/calificaciones` responde OK (solo sus hijos). **Setup automatizado** (2026-06-16): `scripts/setup-test-users.js` (`npm run setup:test-users`, con `SUPABASE_SERVICE_ROLE_KEY` en el entorno) crea ahora también la cuenta `test-familia-agora@didactia.eu` (rol familia, Agora) y la **vincula a un alumno** (preferentemente uno con calificaciones, para que el assert "ve sus notas" sea significativo); imprime las vars `TEST_FAMILIA_AGORA_*` para copiar al `.env`. Luego `npm run test:rls-familia`.
- [x] **Auditoría RLS completa (punto 3)** — `supabase/migrations/rls_familia_lockdown_fase3.sql` ✅ aplicado y verificado en producción (2026-06-16: las 10 políticas presentes — sust_staff/sust_familia_read, com_staff/com_familia_read, salidas_staff/salidas_familia_read, partic_staff/partic_familia_read/partic_familia_update, notif_salidas_staff; las permisivas antiguas eliminadas):
  - `ausencias_profesor` → ✅ SAFE (rrhh_migration.sql ya excluye familia)
  - `sustituciones` → FIXED: `FOR ALL centro_id` → `sust_staff` (ALL) + `sust_familia_read` (SELECT grupos de sus hijos)
  - `comunicados` → FIXED: `FOR ALL centro_id` → `com_staff` (ALL) + `com_familia_read` (SELECT enviados y `!= solo_profesores`)
  - `salidas_didacticas` → FIXED: `FOR ALL centro_id` → `salidas_staff` (ALL) + `salidas_familia_read` (SELECT solo `estado='publicada'`)
  - `participantes_salida` → FIXED: `FOR ALL centro_id` → `partic_staff` + `partic_familia_read/update` (solo sus hijos)
  - `notificaciones_salida` → FIXED: → staff-only
  - Test e2e ampliado (pasos 7–10): INSERT bloqueado en sustituciones/salidas; comunicados sin `solo_profesores`; salidas sin borradores.
- **Redesign visual**: completado — Alumnos, Asistente IA, Sustituciones, Incidencias, Planner y Análisis/CMI. `design_handoff_didactia/` existe en local (untracked). Todos los paneles tienen header Newsreader 30px + eyebrow + subtítulo.
- [x] **Planner Sprint 1** (`d791cf8`): persistencia drag&drop (tablero → `horario_generado`), límite CSP 500k nodos, progreso por grupo en `plannerGenerarSinProf`, confirmación antes de regenerar, HC-VENTANA usa `TNUMS.length` (no hardcoded 8), `IMPORT_CENTRO` usa `ctrId` (no UUID de Agora hardcodeado).
- [x] **Planner Sprint 2** (`cd739f4`): tab "👤 Profe" — vista cross-grupo por profesor (grid días×tramos con materia+grupo coloreados) + panel lateral "Carga semanal" con barras de progreso por docente. `_renderProfesorView`, `plannerCambiarProf`, `_s._profViewCurrent`.
- [x] **Planner Sprint 3** (`6b156e0`): validación de viabilidad pre-generación — `_validarViabilidad()` (horas vs capacidad, disponibilidad profesor, materias sin necesidades) + `plannerVerificar()` modal tabla grupos/profesores + `_diagnosticarFallo(grupo)` diagnóstico post-fallo CSP en toast. Botón "🔍 Verificar" en cabecera tablero.
- [x] **Planner Sprint 4** (`2038d33`): cobertura del horario — `_calcCobertura()` compara schedule vs necesidades; `plannerCobertura()` modal tabla por grupo; badges ✓/⚠/❌ en selector de grupo; botón "📊 Cobertura" en cabecera tablero; banner verde/ámbar en tab Publicar.
- [x] **Redesign Planner + Análisis/CMI** (`85bce6d`): header fijo Newsreader 30px + eyebrow + subtítulo en ambos paneles; tabs como `.tabs-in-hdr`; banner tramos-warn con tokens del design system; Analytics: CSS oculta título duplicado del JS-rendered `.cmi-hdr`, lo reduce a toolbar de botones (Actualizar/PDF). `planner-wrap` → `flex:1;min-height:0`.
- [x] **Incidencias — panel de detalle** (`e83a655`): clic en fila abre panel derecho con metadatos, informe borrador, normativa, medidas y acciones. `_incLastData`, `_incSelectedId`, `_incAbrirDetalle`, `_incDetalleAccion`, `_incCerrarDetalle`.
- [x] **Calificaciones — split layout admin** (`28b9753`): `.cal-list-panel` + `.cal-detail-panel`; `_calAbrirAlumno` con stat de media + tabla pivote asignatura×evaluación; notas coloreadas.
- [x] **Fix flex panels** (`f78f661`, `c29d6b0`): `flex-direction:column` en `#panel-comedor`, `#panel-materiales`, `#panel-orientacion`, `#panel-calidad` — corrección del patrón de media pantalla vacía.
- **App Familias**: el portal está consolidado; quedaría (opcional) una PWA/onboarding dedicado.

> 📦 Las listas históricas de **"Completado ✅"** y **"Backlog"** (decenas de ítems ya cerrados) se han movido a `CLAUDE-ARCHIVE.md` → sección 3. Aquí solo se mantiene el trabajo activo/en curso.

### En progreso — Redesign visual completo (design_handoff_didactia/)
- [x] Design tokens v2 + layout shell
- [x] Logo brand SVG + wordmark sidebar
- [x] Inicio admin (Classroom-style: banner ink, metrics pills, modules grid con colores)
- [x] Inicio profesor (`#inicio-staff`): "Mi horario de hoy" como hero (borde izq `--ink`) + franja "Acciones rápidas" del docente (Notificar ausencia/Registrar incidencia/Materiales/Calificaciones, navegación pura) + métricas bajo "Estado del centro hoy". Solo `app.html`+`styles.css` (`.home-quick`/`.home-quick-btn`/`.home-quick-label`), sin tocar JS ni IDs
- [x] Alumnos — split tabla/perfil drawer (`02-alumnos.png`): `.al-split` grid 1.35fr/1fr; lista con avatares iniciales+color determinístico, fila seleccionada tint `var(--ink)`; drawer con avatar grande + Newsreader + 3 tabs (Perfil/Horario/Actividad); async fire-and-forget (familias, horario mini-grid, comedor dots, incidencias, calificaciones pivote); footer PDF+incidencia; responsive stack ≤768px. Reescritura `js/alumnos.js` + 330 líneas CSS `.al-*` en `styles.css`
- [x] Asistente IA — pantalla full-screen split (`06-chat.png`): panel `#panel-asistente` con `.chat-history-col` (260px, historial) + `.chat-full-col` (flex:1, chat); FAB y overlay conservados como no-op; `openAsistente()` redirige a `showTab('asistente')`
- [x] Sustituciones — cabecera Newsreader + banner IA + formulario colapsable (`04-sustituciones.png`): `.sust-page-hdr`, `.sust-page-title` (30px Newsreader), `.sust-ia-banner`, `<details class="sust-form-details">`, `.btn-ia` terracota
- [x] Incidencias — split lista/detalle (`05-incidencias.png`): `.inc-split-view` (flex row), `.inc-list-panel` (350px, tabla→tarjetas CSS), `.inc-detail-panel` (flex:1, bg paper-2), formulario en `<details class="inc-form-details">`

> **Regla de implementación UI:** NO tocar archivos JS. Solo `app.html` e `css/styles.css`. Mantener TODOS los IDs existentes. Usar `var(--ink)` en lugar de colores navy fijos para respetar tematización.

### Próximo sprint — App Familias / Portal familias
- [~] **App Familias** — gran parte ya hecha: portal familia consolidado (home hub), onboarding wizard, push (comedor/asistencia/salidas/orientación), calificaciones/incidencias/trámites de sus hijos. **PWA instalable (2026-06-16):** manifest pulido (`start_url:/app.html`, scope, id, icono maskable), `apple-touch-icon`, SW v8 (precache completo + icono de notificación inline + `notificationclick` enfoca/abre la app), banner "📲 Instalar app" para familias (`initInstallBanner` en `familias.js`: prompt nativo en Android/Chrome vía `beforeinstallprompt` capturado en `app.html`; instrucción Compartir→Añadir a inicio en iOS; descartable). **Push de notas/incidencias (2026-06-16):** al guardar notas (`calGuardar`), las familias de los alumnos cuya nota **cambió** reciben push "📝 Nueva calificación" (solo aviso, no el valor; `data-nota-orig` diffea para no re-avisar); al pulsar "📧 Familia" en una incidencia (`notificarFamiliaIncidencia`), además del email se manda push genérico "⚠️ Comunicación del centro" (`_incPushFamilia`). Ambos vía EF `send-push`, fire-and-forget.
- [x] **Notificaciones push** — Web Push API; notificar familias cuando alumno falta al comedor (pendiente: sustituir TODO `VAPID_PUBLIC_KEY` en `config.js` con el valor real del secret de Supabase)
- [x] **Módulo IB en la app** (`js/ib.js`): 6 sub-paneles. Base: CAS (actividades por alumno, aprobar/rechazar, editar Learning Outcomes + sugerencia IA), Extended Essay, Plazos. Ampliación 2026-06-12: **TOK** (ensayo+exhibición, estado/nota A–E), **EE mejorado** (nota final + borradores/feedback del supervisor `ee_borradores`), **Predicciones/Resultados** (rejilla por asignatura HL/SL, 1–7), **Coordinador** (vista global: CAS/EE/TOK/Σpredicción/Σfinal/puntos core matriz TOK×EE/total /45). Cableado `#tab-ib`/`#nav-ib`/`#panel-ib` + `showTab('ib')→loadIbPanel()`. Cubierto por `demo-check` (módulo 15)
- [x] **Recuperación de contraseña** (2026-06-12): enlace "¿Olvidaste tu contraseña?" en login + form `#form-reset-request` → `doRequestReset()` llama `sb.auth.resetPasswordForEmail(email, {redirectTo: app.html})` con mensaje neutro anti-enumeración; `_hideAuthForms()` helper. El enlace del email vuelve a `app.html` (`type=recovery`) → `config.js` → `showRecovery()` → `doRecovery()`. Allowlist de Auth ampliada con `https://didactia.eu/**` y `https://www.didactia.eu/**` (Management API) para permitir el redirect a `/app.html`
- [x] **Onboarding de nuevo centro** (`js/users.js`, 2026-06-12): botón "+ Nuevo centro" en el panel de Usuarios (solo superadmin) → wizard modal (`nuevoCentroWizard`) con nombre, slug autogenerado/único, color, logo, módulos activos y **códigos de acceso autogenerados** (familia/profesional/general) → `INSERT centros` → modal de éxito que muestra los códigos y enlaza a "Invitar primer admin". Siguiente paso del onboarding (alumnos) ya cubierto por `scripts/importar_alumnos.mjs`
- [x] **Módulo Tutorías** (`js/tutoria.js`, 2026-06-16): reserva de citas tutor-familia. Tablas `tutoria_disponibilidad` + `tutoria_citas` (UNIQUE(disp_id,fecha,hora_inicio) anti-doble reserva). Vista profesional: Mis citas (confirmar/cancelar/realizada/notas) + Mi disponibilidad (CRUD). Vista familia: selector hijo → disponibilidad del tutor → date picker → sub-slots en cliente → solicitar + Mis citas. Vista admin: tabla read-only. Push bidireccional. **⚠️ Migración pendiente:** ejecutar `supabase/migrations/tutorias.sql` en SQL Editor.
- [x] **Agenda del Centro** (`js/agenda.js`, 2026-06-16): calendario mensual unificado — sustituciones, tutorías, salidas y ausencias en un solo lugar. Split-view (grilla mes 340px + panel del día). Visible para todos los roles; RLS filtra automáticamente. Sin tabla propia — vista agregada de datos existentes. Colores: danger/ok/tut/#7A5C9E/info/warning. Clic en evento navega al módulo origen.

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


- `2026-06-14` — feat(redesign): **redesign visual 3 paneles** (`app.html` + `css/styles.css`). Solo HTML+CSS, ningún archivo JS tocado, todos los IDs preservados. (1) **Asistente IA** — `#panel-asistente` nuevo panel split: `.chat-history-col` (260px historial, `#chat-hist-list`) + `.chat-full-col` (flex:1, `.chat-full-hdr` con badge "En línea", `.chat-suggestions` 2-col grid); `openAsistente()` redirige a `showTab('asistente')`; overlay vaciado (shell conservado). (2) **Sustituciones** — `#sust-vista-admin` restructurado: `.sust-page-hdr` con `.sust-page-title` (Newsreader 30px), eyebrow, subtitle; `.sust-filter-row`; `.sust-ia-banner` (logo + copy + `.btn-ia` terracota); formulario en `<details class="sust-form-details">` (colapsable nativo). (3) **Incidencias** — `#inc-vista-admin` split: `.inc-list-panel` (350px, tabla→tarjetas CSS via `#inc-lista .tbl td:nth-child()`) + `.inc-detail-panel` (bg paper-2, formulario en `<details class="inc-form-details">`); `#panel-incidencias { padding:0 !important; }` + `#inc-vista-profesor { padding:28px; }` para restaurar vista profesor. (4) Utilidades nuevas: `.pg-eyebrow`, `.btn-ia`, `.btn-ia-outline`, `.chat-online-badge`/`.chat-online-dot` (animación pulse), `.chat-suggestion` cards, `.sust-form-details`/`.inc-form-details` summary arrows. Responsive: history col oculta en <768px, split stack en <960px.

> Registro de cambios recientes (commits desde 2026-05-22): @CLAUDE-CHANGELOG.md
