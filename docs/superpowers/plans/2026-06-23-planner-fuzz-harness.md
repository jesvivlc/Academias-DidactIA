# Planner Fuzz/Stress Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a seeded, headless Node harness that hammers both Planner engines (CSP `_generarHorario` and SA `WORKER_LOGIC`) for hours and reliably catches correctness, soundness, robustness and performance failures — without touching `js/planner.js`.

**Architecture:** Five focused modules under `scripts/planner-fuzz/`. A seeded generator produces centro-like scenarios; engine adapters run the REAL planner code in Node (CSP via `vm`+hook, like `scripts/verify-hard-constraints.js`; SA by evaluating the extracted `WORKER_LOGIC` string with a stubbed `self`); an **engine-aware** independent verifier checks the output; a CLI loop catalogs reproducible failures.

**Tech Stack:** Node ≥18 (CommonJS, like the other `scripts/*.js`), `vm` + `worker_threads` (built-in), no new deps. Windows + Git Bash environment.

---

## Key facts gathered from `js/planner.js` (cite, don't re-derive)

- Hook injection point (already used by `scripts/verify-hard-constraints.js`): the line `  window.DidactIAPlanner = DidactIAPlanner;` (planner.js:3997). Inject `globalThis.__PLANNER_TEST__ = {...}` right before it.
- `_s` state (planner.js:24): `{ materias, profesores, necesidades, grupos, tramos, disponibilidad, schedule, sinProf, auditLog, ... }`.
  - `_s.tramos`: `[{ numero, hora_inicio, hora_fin, nombre, es_descanso }]`. Class tramos = `es_descanso:false`.
  - `_s.necesidades`: `[{ grupo_horario, materia_id, materia_nombre, materia_color, profesor_id, profesor_nombre, horas_semanales, carga_cognitiva, tipo_dinamica, bloque_interdisciplinar_id, id? }]`.
  - `_s.profesores`: `[{ id, nombre }]`. `_s.grupos`: `[grupoString]`. `_s.disponibilidad`: `{ profId: Set<"dia_tramoNum"> }` (a Set; "dia" lowercase with accents e.g. `miércoles`).
- `_generarHorario(grupo)` (planner.js:864) → per-group `sched[dia][String(tramoNumero)] = slot` or `null`. `slot` carries `materia_id, materia_nombre, profesor_id, profesor_nombre, bloque_interdisciplinar_id, ...`. It reads other groups' already-placed classes from `_s.schedule` via `_buildTeacherBusy(grupo)` → to test cross-group teacher conflicts you MUST run groups sequentially, writing each result into `_s.schedule[grupo]` before the next.
- `_buildPlannerConfig()` (planner.js:2013) → `{ groups:[{id}], teachers:[{id,nombre,unavailableSlots:[slotIdx]}], blocks:[{id,groupId,subjectId,subjectName,teacherIds:[...],cognitiveLoad,dynamicType,isOptative,bloque_interdisciplinar_id,materia_color}], numTramos, timeout }`. Slot index = `dayIdx*numTramos + tramoIdx`, 0-based over **class** tramos only; `DIAS_IDX = {lunes:0,martes:1,miércoles:2,jueves:3,viernes:4}`.
- SA worker string `WORKER_LOGIC` (planner.js:3293–3582). Protocol: set `self.onmessage`; send `{...config, variantId, weights}`; it runs `new TimetableSolver(cfg); constructInitialSolution(); optimize();` then `self.postMessage({type:'completed', result: generateReport()})` **synchronously**.
- `generateReport()` (planner.js:3557) → `{ schedule:[{blockId, slot, groupId, subjectId, subjectName, teacherIds, dayIdx, tramoIdx, ...}], score, auditLog, finalCost }`.
- `DidactIAPlanner.VARIANTS` (planner.js:3586): `[{id:'A',weights:{...}},{id:'B',...},{id:'C',...}]`.

### Engine-aware HARD constraints (CRITICAL — applying the wrong set causes false positives)
| Constraint | CSP (`_generarHorario`, sinProf) | SA (`TimetableSolver`) |
|---|---|---|
| Group not double-booked | HARD | HARD |
| Teacher not double-booked (incl. cross-group) | HARD | HARD |
| Disponibilidad respected | NOT enforced (sinProf omits it) → skip | HARD (`unavailableSlots`) |
| Materia per day | ≤ **1**/day | ≤ **ceil(total_sessions_of_(group,subject)/5)**/day |
| HC-VENTANA (≤ #classTramos/day) | HARD | soft → skip as hard |
| HC-INICIO-FIN (no mid-day gaps) | HARD | soft → skip as hard |
| Coverage (placed == required) | HARD | HARD |

The verifier takes an `engine` arg (`'csp'` or `'sa'`) and applies the matching column.

---

## File Structure

```
scripts/planner-fuzz/
  verify.js       # engine-aware independent constraint checker (pure)  ← built & trusted first
  selftest.js     # known good/bad fixtures proving verify.js is correct
  generator.js    # seeded scenario generator (mulberry32 + 4 profiles)
  engines.js      # CSP (vm+hook) and SA (eval WORKER_LOGIC) adapters → normalized schedule
  run.js          # CLI loop: generate→run→verify→classify→dedup→report
  README.md       # usage
package.json      # + "fuzz:planner", "verify:planner-fuzz"
.gitignore        # + scripts/planner-fuzz/_out/
.github/workflows/weekly-check.yml  # + verify:planner-fuzz in static-checks job
```

**Normalized schedule** (the contract every adapter returns and `verify.js` consumes):
```js
// { grupo: { dia: { [tramoNumero]: { materia_id, profesor_ids:[...], bloque_id|null } } } }
// dia ∈ DIAS (['lunes','martes','miércoles','jueves','viernes']); tramoNumero = _s.tramos[].numero of a class tramo.
```
Adapters convert each engine's native output into this shape (SA: map `dayIdx`→DIAS[dayIdx], `tramoIdx`→Nth class tramo's `numero`; teacherIds→profesor_ids. CSP: dia/String(tramo) already; profesor_id→[profesor_id] (or [] if null)).

---

## Task 1: Verifier + self-test (the trust core)

**Files:**
- Create: `scripts/planner-fuzz/verify.js`
- Create: `scripts/planner-fuzz/selftest.js`

- [ ] **Step 1: Write `verify.js`**

```js
'use strict';
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

/* scenario: { grupos, necesidades, tramos, disponibilidad, meta }
   schedule: normalized { grupo:{ dia:{ [tramoNum]: { materia_id, profesor_ids:[], bloque_id } } } }
   engine: 'csp' | 'sa'
   returns: [{ type, grupo?, dia?, tramo?, detail }] */
function verify(scenario, schedule, engine) {
  const V = [];
  const classTramos = scenario.tramos.filter(t => !t.es_descanso).map(t => t.numero);
  const necs = scenario.necesidades;
  const add = (type, detail, extra) => V.push(Object.assign({ type, detail }, extra || {}));

  // index required sessions per (grupo, materia)
  const required = {}; // `${g}|${mid}` -> count
  const totalByGS = {}; // for SA maxPerDay
  necs.forEach(n => {
    const k = n.grupo_horario + '|' + n.materia_id;
    const h = n.bloque_interdisciplinar_id
      ? Math.min(...necs.filter(x => x.bloque_interdisciplinar_id === n.bloque_interdisciplinar_id).map(x => x.horas_semanales))
      : n.horas_semanales;
    required[k] = (required[k] || 0) + (n.bloque_interdisciplinar_id ? 0 : n.horas_semanales);
    totalByGS[k] = required[k];
  });

  const teacherSlot = {}; // `${dia}|${tramo}|${profId}` -> grupo  (cross-group teacher clash)
  const placedByGS = {};  // `${g}|${mid}` -> count placed

  Object.keys(schedule || {}).forEach(grupo => {
    const dispOf = (pid) => scenario.disponibilidad[pid]; // Set<"dia_tramo"> or undefined
    DIAS.forEach(dia => {
      const row = (schedule[grupo] && schedule[grupo][dia]) || {};
      const subjPerDay = {}; // mid -> count this day
      const occupiedIdx = [];
      classTramos.forEach((tnum, idx) => {
        const cell = row[tnum] || row[String(tnum)];
        if (!cell) return;
        occupiedIdx.push(idx);
        // coverage tally
        const gk = grupo + '|' + cell.materia_id;
        placedByGS[gk] = (placedByGS[gk] || 0) + 1;
        // materia/day
        subjPerDay[cell.materia_id] = (subjPerDay[cell.materia_id] || 0) + 1;
        // teacher double-book (cross group)
        (cell.profesor_ids || []).filter(Boolean).forEach(pid => {
          const tk = dia + '|' + tnum + '|' + pid;
          if (teacherSlot[tk]) add('teacher-double-book', `profe ${pid} en ${teacherSlot[tk]} y ${grupo} (${dia} T${tnum})`, { grupo, dia, tramo: tnum });
          else teacherSlot[tk] = grupo;
          // disponibilidad (SA only)
          if (engine === 'sa' && dispOf(pid) && dispOf(pid).has(dia + '_' + tnum))
            add('disponibilidad', `profe ${pid} colocado fuera de disponibilidad (${dia} T${tnum})`, { grupo, dia, tramo: tnum });
        });
      });
      // materia/day limit (engine-aware)
      Object.keys(subjPerDay).forEach(mid => {
        const limit = engine === 'sa' ? Math.ceil((totalByGS[grupo + '|' + mid] || 1) / 5) : 1;
        if (subjPerDay[mid] > limit) add('materia-dia', `materia ${mid} ${subjPerDay[mid]}x el ${dia} (límite ${limit}) en ${grupo}`, { grupo, dia });
      });
      // CSP-only: HC-VENTANA + HC-INICIO-FIN
      if (engine === 'csp' && occupiedIdx.length) {
        if (occupiedIdx.length > classTramos.length) add('hc-ventana', `${occupiedIdx.length} clases el ${dia} en ${grupo}`, { grupo, dia });
        const min = Math.min(...occupiedIdx), max = Math.max(...occupiedIdx);
        if (max - min + 1 !== occupiedIdx.length) add('hc-inicio-fin', `hueco a media jornada el ${dia} en ${grupo}`, { grupo, dia });
      }
    });
  });

  // coverage: every required (g,materia) fully placed (only when a schedule was returned)
  if (schedule) Object.keys(required).forEach(k => {
    if (required[k] !== (placedByGS[k] || 0)) add('coverage', `${k}: colocadas ${placedByGS[k] || 0} de ${required[k]}`);
  });

  return V;
}

/* soundness: compares expected solvability vs actual result */
function checkSoundness(scenario, schedule) {
  const V = [];
  const solved = schedule && Object.keys(schedule).length > 0;
  if (scenario.meta && scenario.meta.expected === 'impossible' && solved)
    V.push({ type: 'unsound-accept', detail: 'devolvió horario para un caso imposible' });
  if (scenario.meta && scenario.meta.expected === 'feasible-known' && !solved)
    V.push({ type: 'suspect-reject', detail: 'devolvió null para un caso satisfacible conocido' });
  return V;
}

module.exports = { verify, checkSoundness, DIAS };
```

- [ ] **Step 2: Write `selftest.js` (fixtures that MUST detect each violation)**

```js
'use strict';
const { verify, checkSoundness } = require('./verify');
let fails = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  console.log((ok ? '✅ ' : '❌ ') + name + (ok ? '' : ` (got ${got}, want ${want})`));
  if (!ok) fails++;
};
const has = (name, arr, type) => eq(name + ' → ' + type, arr.some(v => v.type === type), true);
const none = (name, arr) => eq(name + ' (sin violaciones)', arr.length, 0);

const tramos = [
  { numero: 1, es_descanso: false }, { numero: 2, es_descanso: false }, { numero: 3, es_descanso: false },
];
const baseNec = (g, mid, pid, h) => ({ grupo_horario: g, materia_id: mid, materia_nombre: mid, profesor_id: pid, horas_semanales: h, bloque_interdisciplinar_id: null });

// GOOD: 1 grupo, 2 materias (2h+1h) en 3 tramos, sin huecos, sin repetir materia/día
const goodScn = { grupos: ['G1'], tramos, disponibilidad: {}, necesidades: [baseNec('G1','M',  'p1',2), baseNec('G1','L','p2',1)], meta:{} };
const goodSched = { G1: { lunes: { 1: { materia_id:'M', profesor_ids:['p1'] }, 2: { materia_id:'L', profesor_ids:['p2'] } },
                          martes:{ 1: { materia_id:'M', profesor_ids:['p1'] } } } };
none('good', verify(goodScn, goodSched, 'csp'));

// materia-dia (csp): M dos veces el lunes
has('materia-dia', verify(goodScn, { G1:{ lunes:{ 1:{materia_id:'M',profesor_ids:['p1']}, 2:{materia_id:'M',profesor_ids:['p1']} } } }, 'csp'), 'materia-dia');

// teacher double-book: p1 mismo dia/tramo en G1 y G2
const tdScn = { grupos:['G1','G2'], tramos, disponibilidad:{}, necesidades:[baseNec('G1','M','p1',1), baseNec('G2','N','p1',1)], meta:{} };
has('teacher-clash', verify(tdScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}}}, G2:{lunes:{1:{materia_id:'N',profesor_ids:['p1']}}} }, 'csp'), 'teacher-double-book');

// hc-inicio-fin (csp): hueco T1 y T3 ocupados, T2 libre
has('gap', verify(goodScn, { G1:{ lunes:{ 1:{materia_id:'M',profesor_ids:['p1']}, 3:{materia_id:'L',profesor_ids:['p2']} } } }, 'csp'), 'hc-inicio-fin');

// disponibilidad (sa): p1 colocado en lunes_1 estando no disponible
const dispScn = { grupos:['G1'], tramos, disponibilidad:{ p1:new Set(['lunes_1']) }, necesidades:[baseNec('G1','M','p1',1)], meta:{} };
has('disp', verify(dispScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}}} }, 'sa'), 'disponibilidad');
none('disp-csp-skips', verify(dispScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}}} }, 'csp')); // csp no comprueba disp

// coverage: falta 1 sesión de M (req 2, placed 1)  [usar grupo aislado para no chocar con teacher-clash]
has('coverage', verify(goodScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}, 2:{materia_id:'L',profesor_ids:['p2']}}} }, 'csp'), 'coverage');

// soundness
has('unsound', checkSoundness({ meta:{expected:'impossible'} }, { G1:{} === undefined ? {} : { lunes:{1:{}} } }), 'unsound-accept');
eq('feasible-null', checkSoundness({ meta:{expected:'feasible-known'} }, null).some(v=>v.type==='suspect-reject'), true);

if (fails) { console.error('\n❌ selftest: ' + fails + ' fallos'); process.exit(1); }
console.log('\n🎉 selftest OK — el verificador detecta todas las violaciones');
```

- [ ] **Step 3: Run the self-test, expect PASS**

Run: `node scripts/planner-fuzz/selftest.js`
Expected: ends with `🎉 selftest OK` and exit 0. If any `❌`, fix `verify.js` until green. (Adjust the `unsound` fixture so the schedule object is non-empty, e.g. `{ G1:{ lunes:{ 1:{} } } }`.)

- [ ] **Step 4: Commit**

```bash
git add scripts/planner-fuzz/verify.js scripts/planner-fuzz/selftest.js
git commit -m "test(planner-fuzz): verificador independiente engine-aware + selftest"
```

---

## Task 2: Seeded scenario generator

**Files:**
- Create: `scripts/planner-fuzz/generator.js`

- [ ] **Step 1: Write `generator.js`**

```js
'use strict';
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRAMOS_8 = [1,2,3,4,5,6,7,8,9,10].map((numero, i) => ({
  numero, hora_inicio: '0' + (8 + i) + ':00', hora_fin: '0' + (9 + i) + ':00', nombre: '',
  es_descanso: numero === 4 || numero === 8, // recreo + comida
}));

const PROFILES = ['realistic', 'adversarial', 'scale', 'impossible'];

/* returns { grupos, necesidades, tramos, disponibilidad, profesores, meta } */
function generateScenario(seed, profile) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  profile = profile || pick(PROFILES);

  const tramos = TRAMOS_8;
  const classCount = tramos.filter(t => !t.es_descanso).length; // 8
  const nGrupos = profile === 'scale' ? ri(13, 20) : ri(1, 4);
  const grupos = Array.from({ length: nGrupos }, (_, i) => 'G' + i);
  // shared teacher pool — smaller pool ⇒ more cross-group contention
  const nProf = profile === 'adversarial' ? ri(3, 6) : ri(8, 20);
  const profesores = Array.from({ length: nProf }, (_, i) => ({ id: 'p' + i, nombre: 'Profe ' + i }));

  const necesidades = [];
  const subjects = ['Mat','Len','Ing','Bio','Geo','EF','Mus','Pla','Tec','Fis','Qui','His'];
  grupos.forEach(g => {
    const nMat = ri(5, Math.min(9, subjects.length));
    let used = new Set();
    for (let m = 0; m < nMat; m++) {
      let mid; do { mid = pick(subjects); } while (used.has(mid)); used.add(mid);
      // realistic ≤5h; adversarial may exceed class capacity; impossible forces >5h
      let h = profile === 'impossible' ? ri(6, 8)
            : profile === 'adversarial' ? ri(1, 6)
            : ri(1, 5);
      necesidades.push({
        grupo_horario: g, materia_id: g + '_' + mid, materia_nombre: mid, materia_color: '#888',
        profesor_id: profesores[ri(0, nProf - 1)].id, profesor_nombre: 'Profe',
        horas_semanales: h, carga_cognitiva: pick(['alta','media','baja']),
        tipo_dinamica: pick(['estatica','motriz']), bloque_interdisciplinar_id: null,
        id: g + '_' + mid,
      });
    }
  });

  // disponibilidad: adversarial removes most slots for some teachers
  const disponibilidad = {};
  if (profile !== 'impossible') {
    profesores.forEach(p => {
      if (profile === 'adversarial' ? rnd() < 0.6 : rnd() < 0.2) {
        const set = new Set();
        const blocked = profile === 'adversarial' ? ri(10, 30) : ri(1, 8);
        for (let b = 0; b < blocked; b++) set.add(pick(DIAS) + '_' + pick(tramos.filter(t=>!t.es_descanso)).numero);
        disponibilidad[p.id] = set;
      }
    });
  }

  let expected = 'unknown';
  if (profile === 'impossible') expected = 'impossible'; // some materia has >5h ⇒ violates ≤1/day (csp) / forces overflow

  return { grupos, necesidades, tramos, disponibilidad, profesores, meta: { profile, seed, expected } };
}

module.exports = { generateScenario, mulberry32, PROFILES, DIAS };
```

- [ ] **Step 2: Smoke-check the generator is deterministic**

Run: `node -e "const{generateScenario}=require('./scripts/planner-fuzz/generator');const a=JSON.stringify(generateScenario(42,'realistic'));const b=JSON.stringify(generateScenario(42,'realistic'),(k,v)=>v instanceof Set?[...v]:v);console.log('determinista:', a===JSON.stringify(generateScenario(42,'realistic')));console.log('grupos:',generateScenario(7,'scale').grupos.length)"`
Expected: `determinista: true` and a grupos count between 13–20 for `scale`. (Note: `disponibilidad` holds `Set`s — that's intended; the runner serializes them with a Set-aware replacer when saving failures.)

- [ ] **Step 3: Commit**

```bash
git add scripts/planner-fuzz/generator.js
git commit -m "feat(planner-fuzz): generador de escenarios semillado (4 perfiles)"
```

---

## Task 3: CSP engine adapter

**Files:**
- Create: `scripts/planner-fuzz/engines.js`

- [ ] **Step 1: Write `engines.js` with the CSP adapter (vm + hook)**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'planner.js'), 'utf8');
const MARKER = '  window.DidactIAPlanner = DidactIAPlanner;';
const HOOK = '\n  globalThis.__PLANNER_TEST__ = { _generarHorario, _buildPlannerConfig, _tramoNums, _s, DIAS, DidactIAPlanner };\n';

function loadCspContext() {
  if (!SRC.includes(MARKER)) throw new Error('No se encontró el marcador del hook en planner.js (¿cambió la línea 3997?)');
  const patched = SRC.replace(MARKER, HOOK + MARKER);
  const sandbox = {
    console, window: {},
    document: { getElementById: () => null, querySelector: () => null,
      createElement: () => ({ style:{}, appendChild(){}, classList:{add(){},remove(){}} }), body:{appendChild(){}} },
    navigator: {}, sb: {}, ctrId: 'fuzz', ctrName: 'Fuzz',
    Blob: function(){}, URL: { createObjectURL: () => '', revokeObjectURL(){} }, Worker: function(){},
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(patched, sandbox, { filename: 'planner.js' });
  if (!sandbox.__PLANNER_TEST__) throw new Error('El hook no expuso los internals');
  return sandbox.__PLANNER_TEST__;
}

/* Run the CSP per-group engine. Returns normalized schedule or null if any group is unsat. */
function runCsp(scenario) {
  const T = loadCspContext();
  T._s.tramos = scenario.tramos;
  T._s.disponibilidad = scenario.disponibilidad;
  T._s.necesidades = scenario.necesidades;
  T._s.grupos = scenario.grupos;
  T._s.schedule = {};
  T._s.sinProf = true;
  const out = {};
  for (const g of scenario.grupos) {
    const sched = T._generarHorario(g);
    if (!sched) return null; // unsat for this group
    T._s.schedule[g] = sched;            // so next group sees teacher occupancy
    out[g] = normalizeCsp(sched);
  }
  return out;
}

function normalizeCsp(sched) {
  const norm = {};
  Object.keys(sched).forEach(dia => {
    norm[dia] = {};
    Object.keys(sched[dia]).forEach(tramo => {
      const s = sched[dia][tramo];
      if (!s) return;
      norm[dia][Number(tramo)] = {
        materia_id: s.materia_id,
        profesor_ids: s.profesor_id ? [s.profesor_id] : [],
        bloque_id: s.bloque_interdisciplinar_id || null,
      };
    });
  });
  return norm;
}

module.exports = { loadCspContext, runCsp, normalizeCsp, SRC, MARKER };
```

- [ ] **Step 2: Test the CSP adapter against a known-solvable scenario**

Run: `node -e "const{runCsp}=require('./scripts/planner-fuzz/engines');const{generateScenario}=require('./scripts/planner-fuzz/generator');const{verify}=require('./scripts/planner-fuzz/verify');const s=generateScenario(1,'realistic');const sch=runCsp(s);console.log('schedule?',!!sch);if(sch)console.log('violaciones:',verify(s,sch,'csp').length)"`
Expected: prints `schedule? true` (or `false` if that seed is hard) and `violaciones: 0`. Try a few seeds (1,2,3) until one returns a schedule; **0 violaciones is the requirement**. If a real schedule shows violations, that's either a verifier bug (fix Task 1) or a genuine finding (document it).

- [ ] **Step 3: Commit**

```bash
git add scripts/planner-fuzz/engines.js
git commit -m "feat(planner-fuzz): adaptador CSP (vm+hook) con normalización"
```

---

## Task 4: SA engine adapter (production engine)

**Files:**
- Modify: `scripts/planner-fuzz/engines.js`

- [ ] **Step 1: Add the SA adapter to `engines.js`** (append before `module.exports`, then extend exports)

```js
/* Extract the WORKER_LOGIC string literal and run TimetableSolver in Node with `self` stubbed. */
function extractWorkerLogic() {
  const m = SRC.match(/const WORKER_LOGIC = `([\s\S]*?)`;/);
  if (!m) throw new Error('No se pudo extraer WORKER_LOGIC de planner.js');
  return m[1];
}

function runSa(scenario, variantId) {
  const T = loadCspContext();           // reuse hook to get _buildPlannerConfig + VARIANTS with our _s
  T._s.tramos = scenario.tramos;
  T._s.disponibilidad = scenario.disponibilidad;
  T._s.necesidades = scenario.necesidades;
  T._s.grupos = scenario.grupos;
  T._s.profesores = scenario.profesores;
  const config = T._buildPlannerConfig();
  const variant = T.DidactIAPlanner.VARIANTS.find(v => v.id === (variantId || 'A')) || T.DidactIAPlanner.VARIANTS[0];

  // sandbox that emulates a Web Worker global
  let result = null;
  const self = { postMessage: (msg) => { if (msg && msg.type === 'completed') result = msg.result; }, onmessage: null };
  const sandbox = { self, postMessage: self.postMessage, Date, Math, Object, Array, Set, Map, JSON, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(extractWorkerLogic(), sandbox, { filename: 'worker_logic.js' });
  if (typeof self.onmessage !== 'function') throw new Error('WORKER_LOGIC no definió self.onmessage');
  self.onmessage({ data: Object.assign({}, config, { variantId: variant.id, weights: variant.weights }) });
  if (!result || !Array.isArray(result.schedule) || result.schedule.length === 0) return null;
  return normalizeSa(result, config, scenario);
}

function normalizeSa(report, config, scenario) {
  const DIAS = ['lunes','martes','miércoles','jueves','viernes'];
  const classNumeros = scenario.tramos.filter(t => !t.es_descanso).map(t => t.numero);
  const out = {};
  report.schedule.forEach(item => {
    const grupo = item.groupId, dia = DIAS[item.dayIdx], tnum = classNumeros[item.tramoIdx];
    if (!grupo || dia == null || tnum == null) return;
    out[grupo] = out[grupo] || {};
    out[grupo][dia] = out[grupo][dia] || {};
    out[grupo][dia][tnum] = { materia_id: item.subjectId, profesor_ids: (item.teacherIds || []).filter(Boolean), bloque_id: item.bloque_interdisciplinar_id || null };
  });
  return out;
}

module.exports = { loadCspContext, runCsp, normalizeCsp, runSa, normalizeSa, extractWorkerLogic, SRC, MARKER };
```

- [ ] **Step 2: Test the SA adapter**

Run: `node -e "const{runSa}=require('./scripts/planner-fuzz/engines');const{generateScenario}=require('./scripts/planner-fuzz/generator');const{verify}=require('./scripts/planner-fuzz/verify');const s=generateScenario(1,'realistic');const sch=runSa(s,'A');console.log('schedule?',!!sch);if(sch)console.log('violaciones SA:',JSON.stringify(verify(s,sch,'sa')))"`
Expected: `schedule? true` and `violaciones SA: []`. If violations appear on a real SA output, confirm whether it's a verifier mismatch (engine-aware rules) or a genuine solver finding before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/planner-fuzz/engines.js
git commit -m "feat(planner-fuzz): adaptador SA (eval WORKER_LOGIC, self stub) + normalización"
```

---

## Task 5: Runner (the "superagente")

**Files:**
- Create: `scripts/planner-fuzz/run.js`

- [ ] **Step 1: Write `run.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { generateScenario, PROFILES } = require('./generator');
const { runCsp, runSa } = require('./engines');
const { verify, checkSoundness } = require('./verify');

const ENV = process.env;
const SEED0 = parseInt(ENV.SEED || '1', 10);
const ITERS = ENV.ITERS ? parseInt(ENV.ITERS, 10) : null;
const DURATION_MS = parseDuration(ENV.DURATION);
const ENGINE = (ENV.ENGINE || 'both').toLowerCase();      // csp | sa | both
const PROFILE = ENV.PROFILE || 'mix';
const BAIL = process.argv.includes('--bail');
const ISOLATE = process.argv.includes('--isolate');
const SLOW_MS = parseInt(ENV.SLOW_MS || '4000', 10);
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];

const OUT = path.join(__dirname, '_out');
const FAILS = path.join(OUT, 'fails');
fs.mkdirSync(FAILS, { recursive: true });

function parseDuration(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d+)(h|m|s)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1) * 1000;
}
const setReplacer = (k, v) => (v instanceof Set ? [...v] : v);

const counts = { ok: 0, 'fail-correctness': 0, 'fail-soundness': 0, crash: 0, slow: 0 };
const seen = new Set(); // dedup signatures
const startedAt = Date.now();
let i = ONLY != null ? parseInt(ONLY, 10) : 0;
let stop = false;
process.on('SIGINT', () => { console.log('\n⏹  Parando (SIGINT)…'); stop = true; });

function engineList() { return ENGINE === 'both' ? ['csp', 'sa'] : [ENGINE]; }
function runEngine(name, scn) {
  const fn = name === 'csp' ? runCsp : (s) => runSa(s, 'A');
  return fn(scn);
}

function classify(scn, name) {
  let schedule, ms, crashed = null;
  const t0 = Date.now();
  try { schedule = runEngine(name, scn); } catch (e) { crashed = e; }
  ms = Date.now() - t0;
  if (crashed) return { kind: 'crash', name, ms, detail: crashed.message };
  const viol = verify(scn, schedule || {}, name).concat(checkSoundness(scn, schedule));
  if (viol.length) return { kind: viol.some(v => v.type.startsWith('unsound') || v.type.startsWith('suspect')) ? 'fail-soundness' : 'fail-correctness', name, ms, viol, schedule };
  if (ms > SLOW_MS) return { kind: 'slow', name, ms };
  return { kind: 'ok', name, ms };
}

function persist(scn, res) {
  const sig = res.name + '|' + res.kind + '|' + ((res.viol && res.viol[0] && res.viol[0].type) || res.detail || '') + '|' + (scn.meta.profile);
  if (seen.has(sig)) return; seen.add(sig);
  const id = res.kind + '_' + scn.meta.profile + '_' + scn.meta.seed + '_' + res.name;
  const dir = path.join(FAILS, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify(scn, setReplacer, 2));
  if (res.schedule) fs.writeFileSync(path.join(dir, 'schedule.json'), JSON.stringify(res.schedule, null, 2));
  fs.writeFileSync(path.join(dir, 'violations.json'), JSON.stringify(res.viol || [{ type: res.kind, detail: res.detail }], null, 2));
  fs.writeFileSync(path.join(dir, 'repro.txt'),
    `SEED=${scn.meta.seed} ENGINE=${res.name} PROFILE=${scn.meta.profile} node scripts/planner-fuzz/run.js --only=${scn.meta.seed - SEED0}\n`);
}

console.log(`▶ planner-fuzz · SEED=${SEED0} ENGINE=${ENGINE} PROFILE=${PROFILE} ${ITERS ? 'ITERS=' + ITERS : ''} ${ENV.DURATION || ''}`.trim());
while (!stop) {
  if (ITERS != null && i >= ITERS) break;
  if (DURATION_MS != null && Date.now() - startedAt >= DURATION_MS) break;
  const profile = PROFILE === 'mix' ? PROFILES[i % PROFILES.length] : PROFILE;
  const scn = generateScenario(SEED0 + i, profile);
  for (const name of engineList()) {
    const res = classify(scn, name);
    counts[res.kind] = (counts[res.kind] || 0) + 1;
    if (res.kind !== 'ok' && res.kind !== 'slow') { persist(scn, res); if (BAIL) { stop = true; } }
    if (res.kind === 'slow') persist(scn, res);
  }
  i++;
  if (i % 200 === 0) {
    const secs = (Date.now() - startedAt) / 1000;
    console.log(`  iter ${i} · ${(i / secs).toFixed(1)}/s · ` + JSON.stringify(counts));
  }
  if (ONLY != null) break;
}

const report = { seed: SEED0, iters: i, engine: ENGINE, profile: PROFILE, elapsed_s: Math.round((Date.now() - startedAt) / 1000), counts, uniqueFails: seen.size };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, 'report.md'),
  `# planner-fuzz report\n\n- seed: ${SEED0}\n- iteraciones: ${i}\n- motor: ${ENGINE}\n- tiempo: ${report.elapsed_s}s\n\n## Resultados\n` +
  Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`).join('\n') + `\n\n- fallos únicos guardados: ${seen.size} (en scripts/planner-fuzz/_out/fails/)\n`);
console.log('\n' + fs.readFileSync(path.join(OUT, 'report.md'), 'utf8'));
const hadReal = counts['fail-correctness'] > 0 || counts.crash > 0;
process.exit(hadReal && (BAIL || ENV.CI) ? 1 : 0);
```

> **Note on `--isolate` (robustness/hangs):** the default in-process loop relies on each engine's internal caps (CSP ~500k nodes; SA `timeout`/iteration budget) plus the `try/catch` + `SLOW_MS` flag. True hang detection (an engine that never returns) needs process isolation. Implement `--isolate` as a follow-up refinement: when set, `classify` runs the single engine in a `child_process.fork` of `run.js` invoked with `--only=<i> ENGINE=<name>` and a wall-clock `timeout` that `kill()`s it, counting a kill as `{ kind:'crash', detail:'timeout/hang' }`. Ship Step 1 first (covers correctness/soundness/slow); add `--isolate` once the core loop is proven.

- [ ] **Step 2: Run a short bounded session**

Run: `SEED=1 ITERS=300 node scripts/planner-fuzz/run.js`
Expected: progress lines, a final report, exit 0 (unless real correctness failures found — then inspect `scripts/planner-fuzz/_out/fails/`). Confirm `_out/report.md` exists.

- [ ] **Step 3: Confirm reproducibility of any failure**

If any fail was saved, run its `repro.txt` command and confirm it reproduces the same violation deterministically.

- [ ] **Step 4: Commit**

```bash
git add scripts/planner-fuzz/run.js
git commit -m "feat(planner-fuzz): runner CLI (bucle, dedup, informe, SIGINT)"
```

---

## Task 6: Wiring — gitignore, npm scripts, README, CI

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `scripts/planner-fuzz/README.md`
- Modify: `.github/workflows/weekly-check.yml`

- [ ] **Step 1: Ignore runtime artifacts**

Append to `.gitignore`:
```
scripts/planner-fuzz/_out/
```

- [ ] **Step 2: Add npm scripts** (in `package.json` "scripts")

```json
"fuzz:planner": "node scripts/planner-fuzz/run.js",
"verify:planner-fuzz": "node scripts/planner-fuzz/selftest.js && SEED=1 ITERS=2000 node scripts/planner-fuzz/run.js"
```

- [ ] **Step 3: Write `scripts/planner-fuzz/README.md`**

```markdown
# planner-fuzz — superagente de pruebas del Planner

Ejercita los 2 motores del Planner (CSP `_generarHorario` y SA `WORKER_LOGIC`) sin navegador.

## Uso
- Sesión larga:   `SEED=1 DURATION=2h node scripts/planner-fuzz/run.js`
- Acotada:        `SEED=1 ITERS=5000 node scripts/planner-fuzz/run.js`
- Un motor:       `ENGINE=sa PROFILE=adversarial node scripts/planner-fuzz/run.js`
- Parar al 1º:    `node scripts/planner-fuzz/run.js --bail`
- Reproducir:     ver `repro.txt` dentro de cada caso en `_out/fails/`

Vars: SEED, ITERS, DURATION (`2h`/`90m`/`30s`), ENGINE (csp|sa|both), PROFILE (realistic|adversarial|scale|impossible|mix), SLOW_MS.
El verificador (`verify.js`) es engine-aware; su corrección la garantiza `selftest.js`.
NO modifica `js/planner.js` (lo carga en un `vm`).
```

- [ ] **Step 4: Add to CI** — in `.github/workflows/weekly-check.yml`, inside the `static-checks` job's steps, after the existing verify steps, add:

```yaml
      - name: Planner fuzz (acotado)
        run: npm run verify:planner-fuzz
```

- [ ] **Step 5: Verify the whole suite locally**

Run: `npm run verify:planner-fuzz`
Expected: selftest `🎉`, then a 2000-iter run ending with a report; exit 0 if no correctness/crash failures (in CI, `process.exit` returns 1 on real failures via the `ENV.CI` guard).

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json scripts/planner-fuzz/README.md .github/workflows/weekly-check.yml
git commit -m "chore(planner-fuzz): npm scripts, README, gitignore y CI acotado"
```

---

## Self-review notes (addressed)
- **Spec coverage:** corrección/solidez/robustez/rendimiento → verify.js (correctness+coverage), checkSoundness (soundness), run.js crash/`SLOW_MS` (robustness/perf), `--isolate` (true hangs, staged). Both engines → runCsp + runSa. 4 profiles → generator. Seeded repro → mulberry32 + repro.txt. Artifacts/report/CI → run.js + Task 6.
- **Engine-aware verifier** prevents false positives (SA materia/día = ceil(total/5); HC-VENTANA/INICIO-FIN CSP-only; disponibilidad SA-only). This is the subtlest correctness point — `selftest.js` locks it (`disp-csp-skips`).
- **Cross-group teacher conflicts** require sequential CSP runs writing `_s.schedule[g]` (done in `runCsp`).
- **No placeholders** except the explicitly-staged `--isolate` refinement (core robustness via try/catch + SLOW_MS ships in Task 5; the hang-killing variant is called out as a follow-up step, not a silent TODO).
- **Risk:** if `_buildPlannerConfig` throws under stubbed globals, Task 4 Step 2 surfaces it immediately; mitigation is to stub the missing global in `loadCspContext` sandbox.
