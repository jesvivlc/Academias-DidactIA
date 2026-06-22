# Diseño — Harness de fuzzing/estrés del Planner ("superagente")

> Fecha: 2026-06-23 · Estado: aprobado (diseño) · Autor: sesión Claude Code
> Ámbito: nueva utilidad de testing en `scripts/planner-fuzz/`. **No modifica** `js/planner.js` ni ningún código de producción.

## 1. Objetivo

Construir un harness automatizado en Node que ejercite los motores de generación de horarios del Planner de DidactIA al límite, durante horas, de forma desatendida y reproducible, y que detecte de forma fiable cuándo el solver:

1. **Corrección** — produce un horario que **viola una restricción dura**.
2. **Solidez/completitud** — devuelve `null` ante un caso satisfacible conocido, o devuelve horario ante un caso **demostrablemente imposible**.
3. **Robustez** — se cuelga, lanza excepción, entra en bucle infinito o dispara memoria/tiempo.
4. **Rendimiento** — tarda en exceso o explota el coste en tamaños realistas (centro completo).

## 2. No-objetivos (YAGNI)

- No es un agente LLM (sin coste de tokens; determinista y semillado).
- No refactoriza `planner.js` (eso queda para un esfuerzo futuro aparte).
- No prueba la UI/DOM del Planner (drag&drop, botones) — eso ya lo cubre `verify-tablero-dnd.js`.
- No optimiza el solver; solo lo verifica.

## 3. Contexto técnico

`js/planner.js` (~4001 líneas, envuelto en IIFE; intacto — el split reciente fue de `orientacion.js`, no del Planner) tiene **dos motores**:

- **CSP por grupo** — `_generarHorario(grupo)` (backtracking, MRV). Lo usa `plannerGenerarSinProf()` (modo "sin profesores", omite disponibilidad/HC-3). Ya es ejecutable en Node vía `scripts/verify-hard-constraints.js` (carga `planner.js` en un `vm` con globals de navegador stubbeados e inyecta el hook `globalThis.__PLANNER_TEST__` antes del marcador `window.DidactIAPlanner = DidactIAPlanner;`).
- **H-MRV-SA (producción)** — `plannerGenerar()` → `DidactIAPlanner.generateTimetable(config, callbacks)` → 3 Web Workers ejecutando el string `WORKER_LOGIC` (clase `TimetableSolver`, 3 variantes Pareto A/B/C). Es el motor que crea los horarios reales del centro (multi-grupo).

Restricciones duras conocidas: HC-MATERIA-DIA (materia ≤1/día), HC-VENTANA (≤ máx tramos de clase/día), HC-INICIO-FIN (sin huecos a media jornada), disponibilidad del profesor, ocupación de grupo y de profesor (incl. **entre grupos** en el motor SA), co-docencia LOMLOE (bloques interdisciplinares).

## 4. Arquitectura

Cinco componentes, cada uno con un propósito único e interfaz clara. Flujo de datos:

```
seed → generator → scenario → engine adapter (csp|sa) → schedule → verifier → outcome
                                                                         ↓ (si falla)
                                                              dedup + persistir caso
                                                                         ↓
                                                                  report.md / .json
```

### 4.1 `engines.js` — adaptadores de motor
Interfaz: `loadEngines()` → `{ runCsp(scenario), runSa(scenario, variantId), buildConfig(scenario) }`.

- **CSP:** reutiliza el patrón vm+hook de `verify-hard-constraints.js`. El hook se amplía para exponer también `_buildPlannerConfig` (o equivalente) y `DidactIAPlanner` (`VARIANTS`, `generateTimetable`). `runCsp` rellena `_s.{tramos,necesidades,disponibilidad,grupos,schedule}` desde el `scenario`, llama `_generarHorario(g)` por grupo y normaliza la salida a la estructura común de horario.
- **SA:** extrae el string `WORKER_LOGIC` del fuente (regex sobre `const WORKER_LOGIC = \`...\``), lo evalúa en un sandbox Node con `self` stubbeado (captura `self.postMessage` para progreso/errores/resultado). `runSa` construye el `config` **llamando al `_buildPlannerConfig` real** (vía hook) para garantizar la misma forma de entrada que produce la app, instancia/ejecuta `TimetableSolver` por variante y normaliza `generateReport()` a la estructura común.
- **Estructura común de horario** (contrato del verificador): por grupo, `{ [dia]: { [tramo]: { materia_id, materia_nombre, profesor_id, profesor_nombre, codocencia_id|null } } }`, más metadatos (variante, motor, ms).

Riesgo principal: si `_buildPlannerConfig` está muy acoplado a DOM/Supabase, `runSa` necesitará un adaptador fino. Se confirma al implementar; si cambia el alcance, se avisa.

### 4.2 `generator.js` — generador de escenarios semillado
Interfaz: `generateScenario(seed, opts)` → `scenario`.
- RNG determinista `mulberry32(seed)`; el runner usa `SEED + i` por iteración → cada caso 100% reproducible.
- `scenario = { grupos[], necesidades[], tramos[], disponibilidad{}, codocencia[], meta }`.
- Perfiles (`opts.profile`):
  - `realistic` — grupos ESO/BACH, cargas legales (≤5h/materia, total coherente con tramos/día), tramos típicos (con recreos/comida `es_descanso`), disponibilidad parcial de profes, algo de co-docencia.
  - `adversarial` — cargas saturadas, disponibilidad casi nula, conflictos de profe forzados (mismo profe en muchos grupos), co-docencia enrevesada, límites de HC al borde.
  - `scale` — 13–20 grupos con profesorado compartido (estresa conflictos cruzados y rendimiento).
  - `impossible` — insatisfacible demostrable (p. ej. materia con horas > nº de días por HC-MATERIA-DIA; profe requerido en dos grupos a la vez sin alternativa) → `meta.expected = 'impossible'`.
  - Por defecto el runner mezcla perfiles con pesos.
- `meta.expected ∈ { 'feasible-known' | 'impossible' | 'unknown' }`. Solo `impossible` y los `feasible-known` (construidos a partir de un horario válido sembrado) habilitan checks de solidez fuertes; el resto es `unknown` (no se penaliza un `null`).

### 4.3 `verify.js` — verificador independiente (el corazón)
Interfaz: función pura `verify(scenario, schedule, engine)` → `violation[]` (`{ type, dia?, tramo?, detail }`).
Calcula todo de forma **independiente del solver**. Comprueba:
1. Grupo sin doble-reserva (un grupo, un tramo → una clase).
2. **Profesor sin doble-reserva entre grupos** (mismo profe, mismo día/tramo, dos grupos).
3. HC-MATERIA-DIA — materia ≤1/día por grupo.
4. HC-VENTANA — nº de tramos de clase/día ≤ máximo (derivado de tramos no-descanso).
5. HC-INICIO-FIN — sin huecos libres entre la primera y la última clase del día.
6. Disponibilidad — ningún profe colocado fuera de su disponibilidad (motores con profe).
7. Co-docencia LOMLOE — los profes de un bloque interdisciplinar coinciden en el mismo slot donde corresponde.
8. Cobertura — nº de sesiones colocadas por (grupo, materia) == horas requeridas (ni faltan ni sobran).
Solidez: `meta.expected==='impossible'` y schedule≠null → violación `unsound-accept`; `meta.expected==='feasible-known'` y schedule===null → `suspect-reject` (confianza media, se reporta aparte).

### 4.4 `run.js` — el "superagente" (bucle + CLI)
- Env/flags: `SEED` (def 1), `DURATION` (p. ej. `2h`, `90m`, `30s`) y/o `ITERS`, `ENGINE` (`csp|sa|both`, def `both`), `PROFILE` (def `mix`), `--bail` (parar al primer fallo), `--isolate` (worker por escenario con kill-timeout).
- Bucle: `i=0..`; `seed_i = SEED + i`; generar → ejecutar motor(es) con guardia → verificar → clasificar (`ok | fail-correctness | fail-soundness | crash | timeout | slow`).
- Dedup de fallos por `(engine, violationType, firma)` (firma = hash de la forma del escenario + primera violación). Solo se persiste el primer caso de cada firma (con flag para guardar todos).
- Progreso en vivo: iters/s, conteos por clase, tiempo transcurrido, mejor/peor ms.
- `SIGINT` (Ctrl-C) → vuelca `report.md`/`report.json` y sale con código según haya fallos. Pensado para lanzarlo y pararlo tras horas conservando resultados.

### 4.5 `selftest.js` — auto-test del verificador
Alimenta `verify()` con horarios construidos a mano: uno válido (0 violaciones) y uno por cada tipo de violación (cada uno detectado), más un escenario `impossible` con schedule no-nulo (dispara `unsound-accept`). Garantiza que el verificador —la pieza en la que confiamos— es correcto. Se ejecuta en CI.

## 5. Robustez (detección de cuelgues/crashes)
- Modo por defecto (en proceso): se confía en los topes internos del solver (CSP: cap ~500k nodos; SA: presupuesto de iteraciones), `try/catch` por ejecución (crash → fallo catalogado, nunca aborta el harness) y medición de ms (marca `slow` por encima de un umbral configurable).
- `--isolate`: cada escenario se ejecuta en un `worker_threads.Worker` con *kill-timeout*; captura cuelgues reales/OOM sin tumbar el proceso principal. Más lento; para sesiones específicas de caza de cuelgues.

## 6. Salida / artefactos
- `planner-fuzz/fails/<id>/`: `scenario.json`, `schedule.json`, `violations.json`, `repro.txt` (comando exacto `SEED=… ENGINE=… node scripts/planner-fuzz/run.js --only=<i>`).
- `planner-fuzz/report.md` + `report.json`: resumen (iteraciones, distribución de resultados, top firmas de fallo, tiempos).
- `planner-fuzz/` (artefactos) en `.gitignore`. El código del harness sí se versiona.

## 7. CI
- `package.json`: `"fuzz:planner": "node scripts/planner-fuzz/run.js"`, `"verify:planner-fuzz": "node scripts/planner-fuzz/selftest.js && SEED=1 ITERS=2000 node scripts/planner-fuzz/run.js --bail"`.
- Añadir `verify:planner-fuzz` al job `static-checks` de `.github/workflows/weekly-check.yml` (corrida acotada y determinista; sin secretos).

## 8. Layout de ficheros
```
scripts/planner-fuzz/
  run.js          # entry / bucle / CLI (el "superagente")
  engines.js      # adaptadores CSP (vm+hook) y SA (eval WORKER_LOGIC)
  generator.js    # generador de escenarios semillado (perfiles)
  verify.js       # verificador independiente de restricciones
  selftest.js     # auto-test del verificador
  (planner-fuzz/  artefactos en runtime → .gitignore)
```

## 9. Criterios de éxito
- El `selftest` pasa (verificador correcto).
- Una corrida `ITERS=2000` con perfiles `realistic` termina sin fallos de corrección (o, si los hay, quedan catalogados con repro — y eso es justo el valor).
- Cada fallo es reproducible al 100% desde su `repro.txt`.
- El harness corre ≥1h sin abortar por un escenario aislado.
- CI ejecuta la corrida acotada en <90s.

## 10. Riesgos y mitigaciones
| Riesgo | Mitigación |
|--------|-----------|
| `_buildPlannerConfig` acoplado a DOM/Supabase | Llamarlo vía hook con globals stubbeados; si no, adaptador fino (se avisa) |
| El verificador tiene un bug → falsos positivos/negativos | `selftest.js` con casos buenos/malos conocidos |
| Cuelgues que tumban el proceso | Modo `--isolate` (worker + kill-timeout) |
| Cambios futuros en `WORKER_LOGIC` rompen la extracción | Extracción por marcador estable; fallo ruidoso si no encuentra el patrón |
| Falsos `suspect-reject` (no sabemos si era satisfacible) | Solo checks de solidez fuertes en `impossible`/`feasible-known`; el resto no penaliza |
