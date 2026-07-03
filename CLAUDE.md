# DidactIA Academias — Contexto del proyecto

> Plataforma SaaS multi-tenant para **academias privadas** (repaso/refuerzo/preparación de exámenes).
> Derivada del core de "DidactIA Centros", limpiada y reorientada a academias.
> **La bitácora viva y detallada de todo lo construido está en `docs/ROADMAP-PROGRESO.md`** (léela primero).

## Producción y accesos
- **App en producción:** https://didactia-academias.vercel.app · Landing en `/`, app en `/app.html`.
- **Login demo (admin):** `jesvivlc@gmail.com` / `Academias2026!`
- **Backend Supabase:** proyecto `izdqpsenrjcqtuhjhqxo` (URL + anon key en `js/config.js`; la anon key es pública por diseño).
- **Academia demo:** "EducaMentes" (códigos registro: `EDUCA-FAM` / `EDUCA-PRO` / `EDUCA-2026`).

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
`alumnos.js` (matrícula/ficha/altas-bajas/NEE/RGPD) · `grupos.js` (grupos+sesiones semanales+profesores+asignar alumnos) · `horario.js` (parrilla semanal + solapes) · `asistencia.js` (pasar lista + informe %) · `incidencias.js` (`initIncidencias2`, tab `incidencias2`) · `calificaciones.js` (`initNotas`, tab `notas`: notas + tareas/exámenes) · `portalprof.js` (`initDocencia`, tab `docencia`) · `calendario.js` (eventos + resumen semanal) · `portalfam.js` (`initPortalFam`, tab `famportal`, solo rol familia) · `comunicaciones.js` (cola, sin envío real) · `cobros.js` (pagos/impagos/económico/factura PDF) · `riesgo.js` (detección temprana determinista) · `marketing.js` (posts RRSS por plantillas).

## Tablas (Supabase). Migraciones en `sql/`
Núcleo: `centros`, `profiles`, `alumnos` (ampliada: apellidos, nivel, NEE, estado, RGPD…), `familia_alumno`, `info_centro`, `horarios_grupo`, `horarios`, `tramos_centro`.
Academia: `profesores`, `grupos`, `grupo_sesiones`, `matriculas`, `matricula_grupo`, `asistencia`, `incidencias`, `calificaciones`, `tareas`, `eventos`, `comunicaciones`, `pagos`.
Ficheros SQL (idempotentes): `schema-fase0.sql` (base+RLS+RPC `get_users_with_auth`), `sql/fase1-datos-maestros.sql`, `sql/fase2-asistencia.sql`, `sql/fase2-incidencias.sql`, `sql/fase2-calificaciones.sql`, `sql/fase2-eventos.sql`, `sql/fase3-rls-familia.sql`, `sql/fase3-comunicaciones.sql`, `sql/fase4-cobros.sql`.

## Cómo añadir un módulo (patrón establecido)
1. SQL (si hace falta) en `sql/`, RLS por centro con `_caller_rol()`/`_caller_centro()` (staff read + dirección write). Aplicar en Supabase → SQL Editor (o Management API).
2. `js/<modulo>.js`: módulo vanilla con `initX()`, estilos inyectados una vez (idempotente), `escH`/`escArg` de utils.js, `showToastGlobal`, filtrar por `ctrId`. **Usa ids/tab keys nuevos que no choquen con restos del código de Centros** (grep primero; p.ej. sufijo 2 como `incidencias2`).
3. Cablear en `app.html`: `<script src>` tras el último módulo; `nav-item` dentro del grupo "Gestión" (`id sb-grp-gestion`); `<div class="panel" id="panel-X">`; hook en el patch inline `if (t==='X' && typeof initX==='function') initX();`; entrada en el mapa `TITLES`.
4. Visibilidad del nav en `auth.js` (junto a los `nav-*` de Gestión, variable `_staffAlm`).
5. `node --check js/<modulo>.js` + prueba de datos bajo RLS + commit (archivos concretos, **nunca `git add .`**) + deploy + smoke test HTTP 200.

## Edge Functions
- **`invite-user`** ✅ desplegada (Management API). Usa `generateLink` (NO envía email → sin rate limit): crea el usuario y **devuelve el enlace** que la app muestra para copiar/compartir. `verify_jwt:false`, usa `SUPABASE_SERVICE_ROLE_KEY` autoinyectada.
- El resto de EFs heredadas viven en `supabase/functions/` pero **NO están desplegadas** ni aplican del todo a academias.

## Convenciones críticas
- Nunca hardcodear `centro_id` → usar `ctrId`. Nunca la URL de Supabase → usar `SB_URL`.
- Escapar SIEMPRE datos de BD/usuario antes de `innerHTML`: `escH` (texto/atributos), `escArg` (args en `onclick`). Definidos en `utils.js`.
- Toda tabla nueva con RLS por academia. Toda EF nueva deriva identidad del JWT (no del body).
- Textos de UI: "academia" (no "centro"). Producto: "DidactIA Academias".

## Pendiente (requiere claves que hoy no tenemos → construido como HOOK)
- **`GEMINI_API_KEY`** (+ desplegar EF `chat`) → Chat IA 24h, tutor del alumno, planes/recursos IA (botones ✨ en Riesgo), marketing IA.
- **`RESEND_API_KEY`** (SMTP en Supabase Auth) → email real de invitaciones y comunicaciones a familias.
- **VAPID** → push. **WhatsApp Business API / Meta** → asistente WhatsApp + IG/FB. **Stripe** (opcional) → pasarela de pago.

## Cómo aplicar SQL / desplegar EFs sin CLI (lo usado en este proyecto)
- **DDL:** Management API → `POST https://api.supabase.com/v1/projects/izdqpsenrjcqtuhjhqxo/database/query` con `{"query":"..."}` y `Authorization: Bearer <PAT sbp_...>`. (O pegar el `.sql` en Supabase → SQL Editor.)
- **Deploy EF:** `POST .../v1/projects/<ref>/functions/deploy?slug=<slug>` multipart (`metadata` + `file` index.ts).
- ⚠️ **Seguridad:** el PAT `sbp_…`, la service_role y la secret key se usaron en sesión y se compartieron en chat → **rotarlas**. Cambiar también la contraseña demo.

---
_Instrucciones de Task Master (genéricas):_ @./.taskmaster/CLAUDE.md
