# DidactIA — Auditoría arquitectural y de documentación

> Generado el **2026-06-21**. Auditoría en dos dimensiones: (1) documentación/contexto y (2) arquitectura técnica.
> Proyecto Supabase: `rflfsbrdmgaidhvbuvwb` · Producción: didactia.eu · Centros: IES Buñol (pruebas) + Agora Lledó (producción).
> Alcance: `js/*.js` (38 archivos, 27.182 líneas), `supabase/functions/*` (16 EFs), `supabase/migrations/*` + `sql/*`, `css/styles.css`, `app.html`, `CLAUDE*.md`.

---

## 1. Resumen ejecutivo

1. **🔴 CRÍTICO — Edge Functions con `service_role` + `centro_id`/`role` tomados del body sin validar.** 15 de 16 EFs usan la service_role key (RLS bypaseada). `chat` lee `centro_id` **y** `role` del body y deja que ese rol auto-declarado autorice las herramientas de escritura → un usuario puede crear/editar/borrar sustituciones, incidencias, horarios, comedor de **cualquier centro** declarándose `admin`. `alerta-psicosocial` permite leer/insertar alertas de riesgo psicosocial de menores cross-tenant. Es el riesgo de mayor impacto del proyecto (datos de menores, RGPD).

2. **🔴 CRÍTICO — XSS almacenado en contexto de administración (`users.js`).** El `full_name` es auto-asignable en el registro y se renderizaba **sin escapar** en la tabla de usuarios que ven admin/superadmin → escalada de privilegios. **✅ CORREGIDO en esta auditoría** (ver §6). Quedan focos XSS ALTO en `chat.js`, `comedor.js` (export PDF), `incidencias.js`, `ib.js`, `auth.js` (datos de BD/familia sin escapar en ramas no-IA).

3. **🟠 ALTO — Deuda de duplicación masiva.** ~30 copias del escaper HTML (una por módulo, con nombres distintos y variantes incompletas), 14 wrappers de push, el cargador de jsPDF reescrito 7 veces, "hoy ISO" inline en 50+ sitios. La fragmentación del escaper es además la **causa raíz** de los focos XSS (módulos que olvidan aplicarlo). Centralizar en `js/utils.js` + `js/pdf-utils.js`.

4. **🟠 ALTO — Archivos JS gigantes.** `planner.js` (4.001 líneas) y `orientacion.js` (2.630) superan con creces cualquier umbral razonable; 12 archivos superan 800 líneas. Funciones god de ~470 líneas (`chat.js sendMsg`), ~320 (`auth.js loadUserProfile`, `mejoras.js renderHomeFamilia`).

5. **🟢 Documentación optimizada (Dimensión 1, IMPLEMENTADA).** Los 5 `CLAUDE*.md` sumaban ~162k chars cargados en **cada** sesión; 3 superaban 35k. Tras esta auditoría: todos ≤32k, total cargado **112k** (−31%), con `CLAUDE-ARCHIVE.md` (52k) que **ya no se carga**. Sistema de rotación y límites documentado en CLAUDE.md.

> **Nota de alcance:** por instrucción, solo se han **implementado** los cambios de Dimensión 1 (documentación) y las **correcciones críticas de seguridad** (XSS de `users.js`). El resto de Dimensión 2 queda **propuesto** en este informe, no aplicado.

---

## 2. Dimensión 1 — Documentación (auditoría + cambios aplicados)

### 2.1 Estado ANTES

| Archivo | Chars (antes) | ¿>35k? | Diagnóstico |
|---------|--------------:|:--:|-------------|
| `CLAUDE.md` | 39.796 | ⚠️ Sí | Útil, pero ~13k eran histórico de migraciones ya aplicadas |
| `CLAUDE-CHANGELOG.md` | 39.928 | ⚠️ Sí | 68 entradas planas; crecimiento sin tope → insostenible |
| `CLAUDE-ROADMAP.md` | 40.582 | ⚠️ Sí | "Completado ✅" y "Backlog" (decenas de [x] cerrados) = histórico |
| `CLAUDE-TABLAS.md` | 26.111 | No | Sano (referencia de esquema, alto valor) |
| `CLAUDE-MODULOS.md` | 15.731 | No | Sano (1 bloque por módulo, alto valor) |
| **TOTAL cargado/sesión** | **~162.148** | | Todo se inyecta vía `@imports` en cada arranque |

**Problema de fondo:** `CLAUDE.md` importa los otros 4 con `@`, así que Claude Code carga **todo** en cada sesión (~40k tokens) — incluyendo changelog de hace semanas y migraciones cerradas. Mucho de ese contenido es histórico (valioso para trazar decisiones, inútil como contexto operativo).

### 2.2 Estrategia aplicada

- **Nuevo `CLAUDE-ARCHIVE.md`** que **NO** se referencia con `@` → Claude Code no lo carga. Contiene: (1) changelog anterior a 2026-06-19, (2) migraciones ya ejecutadas, (3) roadmap "Completado"/"Backlog".
- **Límite duro de 35k chars** por archivo cargado (20k para el changelog).
- **Sistema de rotación** documentado en CLAUDE.md → sección "Mantenimiento de la documentación": qué va en cada archivo, reglas para mover histórico al archivo, comando de verificación de tamaños.

### 2.3 Estado DESPUÉS

| Archivo | Chars (después) | Δ | Cargado |
|---------|----------------:|:--:|:--:|
| `CLAUDE.md` | 31.846 | −20% | ✅ |
| `CLAUDE-CHANGELOG.md` | 9.698 | −76% | ✅ |
| `CLAUDE-ROADMAP.md` | 28.703 | −29% | ✅ |
| `CLAUDE-TABLAS.md` | 26.111 | = | ✅ |
| `CLAUDE-MODULOS.md` | 15.731 | = | ✅ |
| **TOTAL cargado** | **112.089** | **−31%** | |
| `CLAUDE-ARCHIVE.md` | 52.617 | (nuevo) | ❌ |

Ningún archivo cargado supera 35k, y con la rotación documentada tampoco lo hará con el crecimiento normal (las entradas nuevas desplazan a las viejas al archivo).

---

## 3. Dimensión 2 — Tabla de archivos JS

Umbral SPLIT: >800 líneas. Umbral REFACTOR: 500–800 líneas o función >100 líneas. (Solo propuesta; no implementado.)

| Archivo | Líneas | Estado | Motivo |
|---------|------:|:------:|--------|
| `planner.js` | 4001 | 🔴 SPLIT | Motor CSP + 6 sub-paneles + solver SA en un string. Partir: `planner-core` / `planner-ui` / `planner-import` / `planner-solver` |
| `orientacion.js` | 2630 | 🔴 SPLIT | Expedientes + riesgo + IA + export + portal familia + agente. Partir por subsistema |
| `salidas.js` | 1386 | 🟠 SPLIT | 4 tabs de detalle; separar export y vista familia |
| `calificaciones.js` | 1322 | 🟠 SPLIT | Gradebook + competencial LOMLOE + boletín PDF (3 tablas pivote casi idénticas) |
| `mejoras.js` | 1140 | 🟠 SPLIT | Dashboard + home familia (`renderHomeFamilia` ~312 líneas) |
| `admin.js` | 1137 | 🟠 SPLIT | Sustituciones + tramos + notificación ausencia |
| `ib.js` | 1057 | 🟠 SPLIT | 6 sub-paneles IB |
| `rrhh.js` | 966 | 🟠 REFACTOR | Copiloto legal + agente; extraer prompts |
| `chat.js` | 921 | 🔴 REFACTOR | `sendMsg` ~469 líneas (god-function) |
| `calidad.js` | 898 | 🟠 REFACTOR | Dashboard ~121 líneas |
| `tutoria.js` | 854 | 🟠 REFACTOR | Plantillas HTML inline grandes |
| `auth.js` | 844 | 🟠 REFACTOR | `loadUserProfile` ~321 líneas, 4 ramas de rol |
| `incidencias.js` | 771 | 🟡 OK/limpiar | Define el escaper 5 veces en el mismo archivo |
| `analytics.js` | 714 | 🟡 OK | |
| `users.js` | 705 | 🟡 OK | XSS corregido en esta auditoría |
| `asistencia.js` | 677 | 🟡 OK | |
| `alumnos.js` | 665 | 🟡 OK | |
| `comunicados.js` | 651 | 🟡 OK | |
| `comedor.js` | 602 | 🟡 OK | Foco XSS en export PDF (ver §5) |
| `agenda.js` | 539 | 🟡 OK | |
| `encuestas.js` · `familias.js` · `mensajes.js` · `materiales.js` | 388–479 | 🟢 OK | |
| `actas.js` · `recursos.js` · `informes.js` · `plancobertura.js` · `agente.js` · `documentos.js` | 231–314 | 🟢 OK | |
| `participacion.js` · `guardias.js` · `menu.js` · `prevision.js` · `palette.js` · `espacios.js` · `agentes.js` · `config.js` | 66–214 | 🟢 OK | |

**SPLIT (>800 líneas): 12 archivos.** Prioridad real solo `planner.js` y `orientacion.js` (el resto es manejable). El tamaño total (27k líneas sin bundler, cargado como 38 `<script>`) es la deuda estructural de fondo.

---

## 4. Globals y dependencias

- **322 globals `window.X`** distintos. Desglose: ~258 son handlers de `onclick` (necesarios sin bundler — **legítimos**), ~13 estado compartido en `config.js` (núcleo de acoplamiento), ~20 funciones/helpers cross-module, ~10-13 cachés que **deberían ser locales**.
- **Dependencias circulares reales: 0.** No hay ciclos de inicialización.
- **Acoplamiento:** ALTO en grado, MODERADO en riesgo. 37/38 módulos dependen de `sb`/`ctrId`/`role` como globales mutables. El orden de los 38 `<script>` en `app.html` es un **contrato implícito no verificado**: añadir una llamada cross-module en código top-level (parse-time) rompería en silencio. Mitigado hoy con guardas `typeof X === "function"` y porque casi todo corre post-login.
- **Inconsistencia:** mezcla de `role` y `window.role` entre módulos.

**Globals que deberían ser locales (BAJO, higiene):** `_sustData` (admin.js:226), `_regData` (auth.js:214), `_lastSystemPrompt` (chat.js:769), `_docData` (documentos.js:40), `_encFamData`, `_oriTramitesCache`, `_agoriList`, `_recPrestamosCache`, `_tutCitasCache`, `_agSelFecha`. Colisión de nombres: `_sustData` existe como global en `admin.js` y como local en `chat.js:342` (entidades distintas, mismo nombre).

---

## 5. Issues por severidad

### 🔴 CRÍTICO

| # | Issue | Ubicación | Estado |
|---|-------|-----------|--------|
| C1 | `chat`: `centro_id` **y** `role` del body; service_role; el rol auto-declarado autoriza las tools de escritura → escritura cross-tenant + escalada de privilegios | `supabase/functions/chat/index.ts:903-904, 925-928, 962-963` | Propuesto |
| C2 | `alerta-psicosocial`: service_role + `centro_id` del body sin validar → lectura/inserción de alertas de riesgo de menores cross-tenant | `supabase/functions/alerta-psicosocial/index.ts:73, 76-79, 200, 214-227` | Propuesto |
| C3 | XSS almacenado: `full_name`/`email` (auto-registrables) renderizados sin escapar en tabla admin/superadmin. `_esc` de `users.js` era un escaper de string JS, no de HTML | `js/users.js` (tabla, alumnos, perfil alimentario) | **✅ Corregido** |
| C4 | XSS: respuestas/ramas de resolución directa con nombres de profesor/alumno/actividad sin escapar (las respuestas de Gemini sí pasan por `_sanitizeReply`, estas no) | `js/chat.js:220,492-538,606-634` | Propuesto |
| C5 | XSS: export PDF de comedor con `alergias`/`dieta_especial` (texto libre editable por familia) sin escapar | `js/comedor.js:372` | Propuesto |

### 🟠 ALTO

| # | Issue | Ubicación |
|---|-------|-----------|
| A1 | IDOR en EFs `notify-incidencia`/`notify-jefatura`/`notify-sustitucion`/`send-comunicado`: derivan centro del objeto pero no validan que el llamante pertenezca a ese centro → disparan emails con datos sensibles de otro centro | respectivos `index.ts` |
| A2 | `send-push`: acepta `user_ids[]` arbitrarios, service_role, sin auth ni filtro de centro → push de phishing a cualquier usuario | `supabase/functions/send-push/index.ts:16,38-47` |
| A3 | EFs cron (`agente-cobertura-diaria`, `notify-justificante`) sin secreto de servicio | respectivos `index.ts` |
| A4 | XSS: `incidencias.js` (`descripcion` y nombre+grupo de alumno crudos; el escaper existe pero se omite), `ib.js` (texto libre del alumno IB), `auth.js:206,342,418` (nombres en login/perfil), `admin.js:1038` (`motivo_rechazo`) | varios |
| A5 | Duplicación: ~30 escapers HTML, 14 wrappers push, cargador jsPDF ×7, `hexToRgb` ×4, cabecera PDF ×10, "hoy ISO" inline ×50+ | global |
| A6 | `horarios_grupo` sin filtro `curso_escolar` en EFs (mezcla cursos si el centro tiene 2 cargados) | `chat/index.ts:450,464`, `agent-sustituciones/index.ts:222` |
| A7 | Patrón N+1 en chat: query a `horarios_grupo`/`alumnos` por palabra del mensaje, en **cada** mensaje | `chat.js:450,563,572` |
| A8 | Sin caché de IA en todo el sistema: `cas-analyzer` (temp 0.1) y `tipificar-incidencia` (temp 0.2) son deterministas, caros y recurrentes; sin timeout ni reintento en ninguna llamada Gemini | `cas-analyzer/index.ts:52`, `tipificar-incidencia/index.ts:341` |
| A9 | `planner.js` (4001) y `orientacion.js` (2630): tamaño inmanejable | — |

### 🟡 MEDIO

| # | Issue | Ubicación |
|---|-------|-----------|
| M1 | `invite-user`: confía en `caller_user_id` del body en vez del JWT (`notify-role` lo hace bien con `auth.getUser()`) | `invite-user/index.ts` |
| M2 | Funciones god: `chat.js sendMsg` ~469, `auth.js loadUserProfile` ~321, `mejoras.js renderHomeFamilia` ~312 | — |
| M3 | Duplicación interna: tabla pivote asignatura×evaluación ×3 en `calificaciones.js:67,199,1111`; cálculo de riesgo ×2 en `orientacion.js:1665,1898` | — |
| M4 | N+1 hoistable: lookup de `profiles` dentro del bucle de alertas (misma query cada vuelta) | `orientacion.js:1882,2035` |
| M5 | Selects sin `.limit()`: `analytics.js:124`, `comedor.js:560`, `orientacion.js:1362,1594` | — |
| M6 | Traducción de comunicados (Gemini) cacheada solo en memoria volátil pese a existir `profiles.idioma` | `comunicados.js:276` |
| M7 | Tablas de Calidad duplicadas en `migrations/calidad_base.sql` y `sql/calidad-tables.sql` (nombres de policy distintos) | — |
| M8 | Funciones huérfanas/muertas: `auth.js:611 onCtrChange`, `auth.js:649 toggleRole`, rama `tab-avisos`, `admin.js:344 buscarProfesorLibreAgente`, `admin.js:97 visOpts`; ruta "Mínimo Cambio" inerte (`planner.js:3314`) | — |

### 🟢 BAJO

- Globals que deberían ser locales (§4); colisión de nombre `_sustData`.
- UUID de superadmin hardcodeado en policies (`...= '52e2d821-...'`) — preferible subselect por `rol='superadmin'`.
- Inconsistencias de nomenclatura es/en (`loadExpedientes` vs `guardarNuevoExpediente`), prefijos `ori`/`agori`, camelCase+snake_case en el mismo ámbito. No hay pares redundantes duplicados.
- `disponibilidad_profesor` sin columna `centro_id` (aislamiento por FK + cliente; ya aceptado en roadmap).

### ✅ Verificado SIN problema
- **Credenciales:** el repo versionado está limpio. `js/config.js` solo tiene la anon key (correcta en frontend) y la VAPID pública. La `service_role` está en `.env` (gitignored, confirmado). Los importadores leen de `process.env`. Los n8n JSON solo tienen placeholders.
- **RLS:** las 48 tablas con `CREATE TABLE` en el repo tienen `ENABLE RLS` + policy. Las familias ya no pueden leer datos de otros alumnos (lockdown fase 1-3 aplicado). **Pendiente de verificar en la BD viva** (creadas fuera del repo): `familia_alumno`, `incidencias`, `comunicados`, `sustituciones`, `alumnos`, `profiles`, `asistencia_comedor` — ejecutar `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;`.

---

## 6. Correcciones de seguridad aplicadas en esta auditoría

**`js/users.js` — XSS almacenado (C3), corregido:**
- Añadido `_escH()` — escaper HTML real (`& < > " '`). Se mantiene `_esc()` (escaper de string JS) para el contexto de `onclick`; los argumentos que van dentro de `onclick="f('…')"` ahora usan `_escH(_esc(valor))` (escape JS + escape de atributo HTML, el anidamiento correcto).
- Escapados todos los datos dinámicos: `full_name`, `email`, `centro_nombre` en la tabla de usuarios; `nombre`/`curso` de alumno en los selectores de invitar/editar; `alergias`/`dieta_especial` (texto libre de familia) en los `value=""` del perfil alimentario; `nombre` de centro en los `<option>` y en la lista de centros.
- Verificado con `node --check js/users.js` (sintaxis OK).

> **No** se ha tocado ningún otro archivo JS ni las Edge Functions: C1, C2, C4, C5 y los ALTO requieren despliegue de EFs y/o pruebas funcionales en los dos centros, fuera del alcance seguro de esta auditoría. Quedan documentados arriba con ubicación exacta para una sesión de seguridad dedicada.

---

## 7. Plan de acción priorizado

Esfuerzo: S = <2h · M = ~media jornada · L = ≥1 jornada.

### Fase 0 — Seguridad crítica (hacer ya)
| Acción | Esfuerzo | Issue |
|--------|:--:|--------|
| En EFs con service_role: derivar identidad y centro del **JWT** (`auth.getUser()`), no del body; comparar con el `centro_id`/objeto solicitado | L | C1,C2,A1 |
| `chat`: ignorar `role` y `centro_id` del body; derivarlos del perfil autenticado | M | C1 |
| `send-push`: validar que cada `user_id` comparte centro con el llamante (o secreto server-to-server) | M | A2 |
| Proteger EFs cron con secreto de servicio; `invite-user` → `auth.getUser()` | S | A3,M1 |
| Escapar focos XSS restantes con el helper del módulo: `chat.js`, `comedor.js` export, `incidencias.js`, `ib.js`, `auth.js`, `admin.js:1038` | M | C4,C5,A4 |
| Verificar RLS en BD viva de tablas sensibles creadas fuera del repo | S | §5 |

### Fase 1 — Quick wins de rendimiento/correctness
| Acción | Esfuerzo | Issue |
|--------|:--:|--------|
| Añadir `curso_escolar` a las 3 reads de `horarios_grupo` en EFs | S | A6 |
| Hoist del lookup `profiles` fuera del bucle (orientacion) | S | M4 |
| `.limit()` en `analytics.js:124` y `comedor.js:560` | S | M5 |
| Persistir resultado de `cas-analyzer`/`tipificar-incidencia` por hash(input); tabla `comunicado_traducciones` | M | A8,M6 |
| Reducir N+1 del chat (cachear horario/alumnos por mensaje) | M | A7 |

### Fase 2 — Deuda técnica (centralización)
| Acción | Esfuerzo | Issue |
|--------|:--:|--------|
| Crear `js/utils.js` (`esc`/`escAttr`/`hoyISO`/`fmtFecha`/`toast`/`pushNotify`) cargado antes de `auth.js`; migrar los ~30 escapers y 14 wrappers push | L | A5 |
| Crear `js/pdf-utils.js` (`ensureJsPDF`/`imgToDataURL`/`centroInfo`/`pdfHeader`); migrar las copias | M | A5 |
| Eliminar funciones muertas; consolidar tablas de Calidad duplicadas | S | M7,M8 |

### Fase 3 — Refactor estructural (planificado)
| Acción | Esfuerzo | Issue |
|--------|:--:|--------|
| Partir `planner.js` y `orientacion.js` en sub-módulos | L | A9 |
| Descomponer `sendMsg`/`loadUserProfile`/`renderHomeFamilia` | L | M2 |
| Mover cachés de un solo módulo de `window.*` a scope local | S | §4 |

---

## 8. Recomendaciones de arquitectura — próximos 6 meses

1. **Adoptar un bundler ligero (Vite/esbuild) y módulos ES.** Es la palanca de mayor retorno: elimina de un golpe ~258 globals `window.fnX`, hace el grafo de dependencias **explícito y verificable** (fin del contrato implícito del orden de `<script>`), y habilita el split de `planner.js`/`orientacion.js` sin fricción. Puede ser incremental (empezar por los archivos nuevos). Mantiene el deploy en Vercel.

2. **Capa de acceso a datos / "repos".** Hoy 37 módulos llaman `sb.from(...)` directamente con el filtro `centro_id` repetido a mano (y olvidado en EFs). Una fina capa `db.horarios.delCurso()` / `db.alumnos.delCentro()` centraliza el filtro multi-tenant, los `.limit()` y el `curso_escolar`, y reduce la clase de bug "query sin filtro".

3. **Endurecer las Edge Functions como frontera de confianza.** Regla única: **toda EF deriva identidad/rol/centro del JWT, nunca del body.** Helper compartido `getAuthContext(req)` reutilizado por las 16. Esto convierte el patrón crítico actual en imposible por construcción.

4. **Caché de IA + resiliencia.** Tabla `ia_cache(hash, input, output, created_at)` para llamadas deterministas (clasificación, traducción) y un wrapper Gemini común con `AbortController` (timeout) + 1 reintento. Reduce coste y latencia y elimina la duplicación de wrappers por módulo.

5. **CSP y pruebas de XSS en CI.** Con los escapers ya centralizados (rec. 1-2), añadir una CSP `script-src 'self'` como defensa en profundidad y un test que falle si aparece `innerHTML` con interpolación de campos de BD sin pasar por `esc`. Cierra la clase de bug XSS de forma estructural, no caso a caso.

6. **Sostenibilidad de la documentación (ya iniciado).** Mantener el sistema de rotación de §2: ningún `CLAUDE*.md` cargado >35k, histórico al archivo. Revisar tamaños cada ~10 entradas de changelog.

---

## 9. Metodología

Auditoría asistida por agentes en paralelo (seguridad, globals/dependencias, deuda técnica/rendimiento) sobre lectura directa del código + verificación adversarial de los hallazgos críticos (`chat`, `send-push`). Los hallazgos citan `archivo:línea`. No se ejecutó la app (sin entorno de pruebas en esta sesión); las correcciones aplicadas se limitaron a la dimensión de documentación y al XSS crítico de `users.js`, verificado por sintaxis.
