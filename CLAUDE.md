# DidactIA Academias — Contexto del proyecto

> Plataforma SaaS multi-tenant para **academias privadas** (repaso/refuerzo/preparación de exámenes).
> Derivada del core de "DidactIA Centros", limpiada y reorientada a academias.
> **La bitácora viva y detallada de todo lo construido está en `docs/ROADMAP-PROGRESO.md`** (léela primero).

## Producción y accesos
- **App en producción:** https://didactia-academias.vercel.app · Landing en `/`, app en `/app.html`.
- **Login demo (admin):** `jesvivlc@gmail.com` / `Academias2026!`
- **Backend Supabase:** proyecto `izdqpsenrjcqtuhjhqxo` (URL + anon key en `js/config.js`; la anon key es pública por diseño).
- **Academia demo:** "Academia Demo DidactIA" (códigos registro: `DEMO-FAM` / `DEMO-PRO` / `DEMO-2026`).

## Stack
| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + **JS modular vanilla** (sin frameworks) |
| Backend | Supabase (PostgreSQL, Auth, RLS, Edge Functions) |
| Deploy | Vercel (estático). `vercel.json` = sin build. Deploy: `vercel deploy --prod --yes --scope brunos-projects-94a4248c` |
| PDF/Excel | jsPDF (`window.jspdf.jsPDF`) + SheetJS (`XLSX`), por CDN en `app.html` |

## Arquitectura
- **Multi-tenant:** cada academia es una fila en la tabla `centros` (nombre interno heredado; en UI se dice "academia"). Toda consulta filtra por la global **`ctrId`**.
- **Roles:** familia · profesional · orientador · admin · admin_institucional · director · jefatura · superadmin.
- **Auth:** Supabase Auth (JWT). **RLS activa** en todas las tablas.
  - Helpers RLS: `public._caller_rol()`, `public._caller_centro()` (SECURITY DEFINER, sin recursión).
  - Familia lee SOLO datos de sus hijos vía políticas `*_fam_read` + función `public._mis_alumnos()` (vía `familia_alumno`). Verificado con cuenta familia real.

## Estructura de archivos JS (todos en `js/`)
**Núcleo:** `config.js` (SB_URL/SB_KEY, globals, boot) · `utils.js` (**escH/escAttr/escArg**, hoyISO, showToastGlobal…) · `auth.js` (login/registro/recovery/invitación, `loadUserProfile`, `applyTheme` tematización por academia, `showTab`, visibilidad de nav por rol) · `users.js` (gestión usuarios/roles + invitar + crear academia) · `chat.js` (asistente base; resuelve horarios en cliente).

**Módulos de academia (Fases 1–6, todos construidos):**
`alumnos.js` (matrícula/ficha/altas-bajas/NEE/RGPD + **📄 Boletín PDF**) · `grupos.js` (grupos+sesiones semanales+profesores+asignar alumnos) · `horario.js` (parrilla semanal + solapes) · `asistencia.js` (pasar lista + informe % + aviso de ausencia por email) · `incidencias.js` (`initIncidencias2`, tab `incidencias2`) · `calificaciones.js` (`initNotas`, tab `notas`: notas + tareas/exámenes) · `portalprof.js` (`initDocencia`, tab `docencia`) · `calendario.js` (eventos + resumen semanal) · `portalfam.js` (`initPortalFam`, tab `famportal`, solo rol familia) · `comunicaciones.js` (**email real vía Resend**, EF `send-comunicacion`) · `cobros.js` (pagos/impagos/económico/factura PDF + recordatorio de impagos por email) · `riesgo.js` (**predicción de bajas/retención**: asistencia+notas+impagos+conducta+antigüedad + ✨ planes IA de refuerzo/retención) · `marketing.js` (posts RRSS por plantillas + ✨ IA) · `tutor.js` (`initTutor`, tab `tutor`: tutor IA multivuelta para alumno/familia) · `mensajes.js` (mensajería familia↔centro) · `planificador.js` (propuesta de grupos por nivel/NEE + huecos de parrilla, dirección).

**Comerciales / dirección (sesión 2026-07):**
- `panel.js` — **Panel del negocio** (home del dueño): sobrescribe `renderHomeMetrics`/`renderMiHorarioHoy`; para admin renderiza en `#negocio-root` (dentro de `#inicio-admin`) KPIs económicos (cobrado vs previsto, impagos), ocupación, alumnos activos, asistencia, alumnos en riesgo, health score, gráfico de ingresos 6 meses, próximos eventos e impagos con acción "recordar". + **Copiloto de dirección ⌘K** (`_cpOpen`): barra de comandos en lenguaje natural que responde (IA `iaChat` con snapshot de datos del centro) y actúa (recordar impagos, navegar). Atajo global Ctrl/⌘+K y clic en el buscador del home. Solo staff/dirección.
**Paridad competitiva (Fases 8–13, sesión 2026-07-21 · a raíz del benchmark contra Kydemy / AcademyGest / Acadesoft — ver `docs/BENCHMARK-COMPETENCIA.md`):**
- `facturacion.js` (`initFacturacion`, tab `facturacion`) — **Facturación electrónica Verifactu-ready** (RD 1007/2023): serie+número reservados de forma atómica por RPC, **huella SHA-256 encadenada** con la concatenación oficial, **QR de cotejo AEAT** en el PDF, rectificativas, libro de facturas a Excel · **Remesas SEPA `pain.008.001.02`** descargables para el banco, con mandatos validados por IBAN mod-97 y paso automático FRST→RCUR · **Pago online (Stripe)** configurable por academia. Solo dirección.
- `crm.js` (`initCaptacion`, tab `captacion`) — **Embudo comercial** kanban con arrastrar y soltar: nuevo → contactado → clase de prueba → matriculado/perdido. Convierte a alumno+matrícula por RPC `convertir_lead`. Tasa de conversión, valor del pipeline y ✨ mensaje de seguimiento con IA. Alimentado por `inscripcion.html`.
- `firmas.js` (`initFirmas`, tab `firmas`) — **Firma digital**: plantillas con `{{alumno}}/{{academia}}/{{fecha}}`, envío masivo con enlace de un solo uso que caduca, aviso por email reutilizando la cola de `comunicaciones`, y PDF firmado con trazo + huella. Página pública `firmar.html`.
- `checkin.js` (`initCheckin`, tab `checkin`) — **Carnet QR + modo mostrador** a pantalla completa: lee con la cámara (jsQR), alterna entrada/salida, marca la asistencia del grupo en curso y avisa de deuda. Carnets imprimibles (10 por A4).
- `campus.js` (`initCampus`, tab `campus`, prefijo **`_cmp`** — ojo: `_cp` es del copiloto de `panel.js`) — **Campus virtual** sobre el bucket privado `recursos`: arrastrar y soltar, enlaces, visibilidad por grupo y para familias, descarga con URL firmada de 60 s.
- `economia.js` (`initEconomia`, tab `economia`) — **Gastos, cuenta de resultados y control horario**: gastos por categoría, botón de repetir fijos del mes anterior, P&L de 12 meses (cobrado − gastos, margen, acumulado) y registro de jornada del profesorado exportable.
- `boletin.js` — **Boletín mensual PDF** por alumno (`window.generarBoletin(alumnoId, btn)`, botón en la ficha de Alumnos): cabecera con marca/color del centro, asistencia del mes, notas recientes, **comentario de evolución con IA** (fallback determinista) y pie. jsPDF.

**Datos demo:** `sql/demo-seed-academias.sql` (idempotente, scoped al centro Academia Demo DidactIA) siembra ~42 alumnos ESO, 7 profesores, 12 grupos, sesiones, ~1300 asistencias (10 semanas), ~200 notas, ~156 pagos con impagos del mes, incidencias, eventos y **3 familias demo** (login `familia1@demo.didactia.eu` … `Familia2026!`). Re-ejecutable para "resetear demo".

## Tablas (Supabase). Migraciones en `sql/`
Núcleo: `centros`, `profiles`, `alumnos` (ampliada: apellidos, nivel, NEE, estado, RGPD…), `familia_alumno`, `info_centro`, `horarios_grupo`, `horarios`, `tramos_centro`.
Academia: `profesores`, `grupos`, `grupo_sesiones`, `matriculas`, `matricula_grupo`, `asistencia`, `incidencias`, `calificaciones`, `tareas`, `eventos`, `comunicaciones`, `pagos`, `mensajes`.
Fases 8–13: `datos_fiscales`, `facturas` (inalterable por trigger), `mandatos_sepa`, `remesas_sepa`, `remesa_lineas`, `leads`, `documentos_plantilla`, `documentos_firma`, `checkins`, `pasarela_config` (⚠ RLS activa **sin políticas**: solo service_role), `recursos` (+ bucket `recursos`), `gastos`, `fichajes`. Columnas añadidas: `grupos.publicado/descripcion_web`, `alumnos.codigo_qr`, `pagos.remesa_id/factura_id/stripe_session_id/pagado_online`.
Páginas públicas (sin login, solo RPCs SECURITY DEFINER): `inscripcion.html?a=<slug>` (captación) y `firmar.html?t=<token>` (firma). Ambas repiten SB_URL/SB_KEY: **si cambias `js/config.js`, cámbialas también ahí**.
Seed demo: `sql/demo-seed-academias.sql` (no crea tablas; solo puebla Academia Demo DidactIA de forma idempotente). Para poner al día la asistencia demo sin re-ejecutar el seed: `DEMO_PASS='...' node scripts/refrescar-asistencia-demo.mjs`.
Ficheros SQL (idempotentes): `schema-fase0.sql` (base+RLS+RPC `get_users_with_auth`), `sql/fase1-datos-maestros.sql`, `sql/fase2-asistencia.sql`, `sql/fase2-incidencias.sql`, `sql/fase2-calificaciones.sql`, `sql/fase2-eventos.sql`, `sql/fase3-rls-familia.sql`, `sql/fase3-comunicaciones.sql`, `sql/fase4-cobros.sql`, `sql/fase7-mensajes.sql`, `sql/fase7-portalfam-rls.sql`, `sql/planner-tables.sql`, `sql/fix-rls-alumnos-registro.sql` (⚠ ver "Seguridad RLS" abajo), `sql/fase8-facturacion-sepa.sql`, `sql/fase9-captacion.sql`, `sql/fase10-firmas.sql`, `sql/fase11-checkin.sql`, `sql/fase12-pasarela.sql`, `sql/fase13-campus-economia.sql`.

## Cómo añadir un módulo (patrón establecido)
1. SQL (si hace falta) en `sql/`, RLS por centro con `_caller_rol()`/`_caller_centro()` (staff read + dirección write). Aplicar en Supabase → SQL Editor (o Management API).
2. `js/<modulo>.js`: módulo vanilla con `initX()`, estilos inyectados una vez (idempotente), `escH`/`escArg` de utils.js, `showToastGlobal`, filtrar por `ctrId`. **Usa ids/tab keys nuevos que no choquen con restos del código de Centros** (grep primero; p.ej. sufijo 2 como `incidencias2`).
3. Cablear en `app.html`: `<script src>` tras el último módulo; `nav-item` dentro del grupo "Gestión" (`id sb-grp-gestion`); `<div class="panel" id="panel-X">`; hook en el patch inline `if (t==='X' && typeof initX==='function') initX();`; entrada en el mapa `TITLES`.
4. Visibilidad del nav en `auth.js` (junto a los `nav-*` de Gestión, variable `_staffAlm`).
5. `node --check js/<modulo>.js` + prueba de datos bajo RLS + commit (archivos concretos, **nunca `git add .`**) + deploy + smoke test HTTP 200.

## Edge Functions (5 desplegadas y verificadas end-to-end)
- **`chat`** ✅ Proxy limpio a **Gemini 2.5 Flash** (secret `GEMINI_API_KEY`). Recibe `{contents, system_prompt}` → devuelve `{type:"text", text}`. La usan `js/chat.js` y el helper `window.iaChat(systemPrompt, userText)` de `utils.js` (todos los botones ✨). `verify_jwt:true`.
- **`invite-user`** ✅ Usa `generateLink` (NO envía email → sin rate limit): crea el usuario y **devuelve el enlace** que la app muestra para copiar/compartir. `verify_jwt:false`, usa `SUPABASE_SERVICE_ROLE_KEY` autoinyectada.
- **`send-comunicacion`** ✅ · **`notify-ausencia`** ✅ · **`recordar-impagos`** ✅ — email real a familias vía **Resend** (secrets `RESEND_API_KEY` + `MAIL_FROM="DidactIA Academias <no-reply@didactia.eu>"`, dominio `didactia.eu` verificado).
- **`crear-pago-stripe`** ⏳ escrita, **sin desplegar** (`verify_jwt:true`). Autoriza leyendo el pago con el JWT del llamante (deja decidir a RLS) y solo después usa service_role para leer la clave Stripe de la academia.
- **`stripe-webhook`** ⏳ escrita, **sin desplegar** (`verify_jwt:false`). Verifica la firma HMAC-SHA256 con el `whsec_` de esa academia, ventana de 5 min y comparación en tiempo constante.
- El resto de EFs heredadas viven en `supabase/functions/` pero **NO están desplegadas**.

## Convenciones críticas
- Nunca hardcodear `centro_id` → usar `ctrId`. Nunca la URL de Supabase → usar `SB_URL`.
- Escapar SIEMPRE datos de BD/usuario antes de `innerHTML`: `escH` (texto/atributos), `escArg` (args en `onclick`). Definidos en `utils.js`.
- Toda tabla nueva con RLS por academia. Toda EF nueva deriva identidad del JWT (no del body).
- Textos de UI: "academia" (no "centro"). Producto: "DidactIA Academias".

## Estado IA / claves
- **`GEMINI_API_KEY`** ✅ + EF `chat` → **toda la capa IA activa**: Asistente, copiloto ⌘K, tutor del alumno, planes de refuerzo (Riesgo), resumen semanal "secretaría", informe de evolución, boletín y marketing.
- **`RESEND_API_KEY` + `MAIL_FROM`** ✅ (dominio `didactia.eu` verificado) → **email real activo**: comunicaciones a familias, avisos de ausencia y recordatorios de impago.
- Pendiente: **VAPID** → push. **WhatsApp Business API / Meta** → asistente WhatsApp + IG/FB. **Stripe** (opcional) → pasarela de pago.

## Seguridad RLS (auditoría 2026-07-14)
- Detectado y corregido en `sql/fix-rls-alumnos-registro.sql`: `alumnos_read` era `using (true)` (placeholder de Fase 0) → cualquier autenticado leía TODAS las fichas; y `centros_read` exponía los códigos de registro a la anon key. El fix crea RPCs `verificar_codigo_registro` / `alumnos_para_registro` (SECURITY DEFINER) para el registro pre-login, endurece `alumnos` (staff por centro + familia vía `_mis_alumnos()`) y oculta los códigos con grants por columna. `js/auth.js` ya usa los RPCs con fallback. **⚠ Verificar que el SQL está aplicado** (como familia, `alumnos` debe devolver solo sus hijos).

## Cómo aplicar SQL / desplegar EFs sin CLI (lo usado en este proyecto)
- **DDL:** Management API → `POST https://api.supabase.com/v1/projects/izdqpsenrjcqtuhjhqxo/database/query` con `{"query":"..."}` y `Authorization: Bearer <PAT sbp_...>`. (O pegar el `.sql` en Supabase → SQL Editor.)
- **Deploy EF:** `POST .../v1/projects/<ref>/functions/deploy?slug=<slug>` multipart (`metadata` + `file` index.ts).
- ⚠️ **Seguridad:** el PAT `sbp_…`, la service_role y la secret key se usaron en sesión y se compartieron en chat → **rotarlas**. Cambiar también la contraseña demo.

---
_Instrucciones de Task Master (genéricas):_ @./.taskmaster/CLAUDE.md
