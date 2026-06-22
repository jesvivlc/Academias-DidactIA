# planner-fuzz — superagente de pruebas del Planner

Ejercita los **dos motores** del Planner (CSP `_generarHorario` y SA `WORKER_LOGIC`)
en Node, **sin navegador**, generando miles de escenarios semillados y verificando
que el horario cumple todas las restricciones duras (o que rechaza lo imposible).
**No modifica `js/planner.js`** — lo carga en un `vm` con los globals del navegador stubbeados.

## Uso

```bash
# Sesión larga desatendida (recomendado para "llevarlo al límite")
node scripts/planner-fuzz/run.js --duration=3h

# Acotada por iteraciones
node scripts/planner-fuzz/run.js --iters=5000

# Un motor / un perfil concreto
node scripts/planner-fuzz/run.js --engine=sa --profile=adversarial --iters=2000

# Parar en el primer fallo de corrección/crash
node scripts/planner-fuzz/run.js --bail

# Reproducir un fallo: ver repro.txt dentro de cada caso en _out/fails/
```

Equivalentes vía npm: `npm run fuzz:planner -- --duration=2h` · `npm run verify:planner-fuzz` (selftest + corrida acotada, lo que corre CI).

## Opciones (flag `--x=y` o variable de entorno)
| flag | env | def | qué |
|------|-----|-----|-----|
| `--seed=N` | `SEED` | 1 | semilla base; el escenario i usa `SEED+i` (reproducible) |
| `--iters=N` | `ITERS` | — | nº de iteraciones |
| `--duration=2h` | `DURATION` | — | tiempo (`Xh`/`Xm`/`Xs`) |
| `--engine=` | `ENGINE` | both | `csp` \| `sa` \| `both` |
| `--profile=` | `PROFILE` | mix | `realistic` \| `adversarial` \| `scale` \| `feasible-known` \| `mix` |
| `--slow-ms=N` | `SLOW_MS` | 4000 | umbral para marcar una corrida como `slow` |
| `--bail` | — | off | parar al primer `fail-correctness`/`crash` |
| `--only=i` | — | — | ejecuta solo la iteración i (para reproducir) |

## Qué detecta
- **Corrección:** horario que viola una restricción dura (doble reserva de grupo o de profesor entre grupos, materia/día por encima del límite del motor, fuera de disponibilidad, ventana/huecos en CSP).
- **Solidez:** `feasible-known` que devuelve `null` (sospecha de incompletitud).
- **Robustez:** crash/excepción (catalogado, nunca aborta el harness).
- **Rendimiento:** corridas por encima de `--slow-ms`.

## Cómo funciona
- `generator.js` — escenarios semillados (`mulberry32`), 4 perfiles. `feasible-known` es trivialmente satisfacible (profe único por materia, ≤4h, sin restricciones) y sirve de oráculo de cobertura/solidez.
- `engines.js` — adaptador CSP (vm + hook `__PLANNER_TEST__`) y SA (evalúa el string `WORKER_LOGIC` con `self` stubbeado, `config` real vía `_buildPlannerConfig`).
- `verify.js` — verificador independiente **consciente del motor** (el SA permite `ceil(total/5)`/día y no impone ventana/huecos como duras; la disponibilidad solo aplica al SA). Su corrección la fija `selftest.js`.
- `run.js` — bucle + dedup de fallos + informe (`_out/report.md`) + Ctrl-C limpio.

Artefactos en `scripts/planner-fuzz/_out/` (gitignored): `report.md`/`.json` y un directorio por fallo único con `scenario.json`, `schedule.json`, `violations.json` y `repro.txt`.
