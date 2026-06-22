'use strict';
const fs = require('fs');
const path = require('path');
const { generateScenario, PROFILES } = require('./generator');
const { runCsp, runSa } = require('./engines');
const { verify, checkSoundness } = require('./verify');

const ENV = process.env;
// Config: flags (--x=y) tienen prioridad sobre env (npm scripts en Windows/cmd no
// admiten el prefijo VAR=…; los flags sí funcionan en cualquier shell).
const flag = (name) => { const a = process.argv.find(x => x.startsWith('--' + name + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const SEED0 = parseInt(flag('seed') || ENV.SEED || '1', 10);
const ITERS = (flag('iters') || ENV.ITERS) ? parseInt(flag('iters') || ENV.ITERS, 10) : null;
const DURATION_MS = parseDuration(flag('duration') || ENV.DURATION);
const ENGINE = (flag('engine') || ENV.ENGINE || 'both').toLowerCase();
const PROFILE = flag('profile') || ENV.PROFILE || 'mix';
const BAIL = process.argv.includes('--bail');
const SLOW_MS = parseInt(flag('slow-ms') || ENV.SLOW_MS || '4000', 10);
const ONLY = flag('only');

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
const seen = new Set();
const startedAt = Date.now();
let stop = false;
process.on('SIGINT', () => { console.log('\n⏹  Parando (SIGINT)…'); stop = true; });

function engineList() { return ENGINE === 'both' ? ['csp', 'sa'] : [ENGINE]; }

function classify(scn, name) {
  let schedule, crashed = null;
  const t0 = Date.now();
  try { schedule = name === 'csp' ? runCsp(scn) : runSa(scn, 'A'); } catch (e) { crashed = e; }
  const ms = Date.now() - t0;
  if (crashed) return { kind: 'crash', name, ms, detail: crashed.message };
  const viol = verify(scn, schedule || {}, name).concat(checkSoundness(scn, schedule));
  if (viol.length) {
    const soundnessOnly = viol.every(v => v.type.startsWith('unsound') || v.type.startsWith('suspect'));
    return { kind: soundnessOnly ? 'fail-soundness' : 'fail-correctness', name, ms, viol, schedule };
  }
  if (ms > SLOW_MS) return { kind: 'slow', name, ms };
  return { kind: 'ok', name, ms };
}

function persist(scn, res) {
  const sig = res.name + '|' + res.kind + '|' + ((res.viol && res.viol[0] && res.viol[0].type) || res.detail || '') + '|' + scn.meta.profile;
  if (seen.has(sig)) return;
  seen.add(sig);
  const id = res.kind + '_' + scn.meta.profile + '_' + scn.meta.seed + '_' + res.name;
  const dir = path.join(FAILS, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify(scn, setReplacer, 2));
  if (res.schedule) fs.writeFileSync(path.join(dir, 'schedule.json'), JSON.stringify(res.schedule, null, 2));
  fs.writeFileSync(path.join(dir, 'violations.json'), JSON.stringify(res.viol || [{ type: res.kind, detail: res.detail }], null, 2));
  fs.writeFileSync(path.join(dir, 'repro.txt'),
    `SEED=${SEED0} ENGINE=${res.name} PROFILE=${scn.meta.profile} node scripts/planner-fuzz/run.js --only=${scn.meta.seed - SEED0}\n`);
}

function writeReport(i) {
  const report = { seed: SEED0, iters: i, engine: ENGINE, profile: PROFILE, elapsed_s: Math.round((Date.now() - startedAt) / 1000), counts, uniqueFails: seen.size };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'report.md'),
    `# planner-fuzz report\n\n- seed base: ${SEED0}\n- iteraciones: ${i}\n- motor: ${ENGINE}\n- perfil: ${PROFILE}\n- tiempo: ${report.elapsed_s}s\n\n## Resultados\n` +
    Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`).join('\n') +
    `\n\n- fallos únicos guardados: ${seen.size} (en scripts/planner-fuzz/_out/fails/)\n`);
  return report;
}

console.log(`▶ planner-fuzz · SEED=${SEED0} ENGINE=${ENGINE} PROFILE=${PROFILE} ${ITERS ? 'ITERS=' + ITERS : ''} ${ENV.DURATION || ''}`.trim());
let i = ONLY != null ? parseInt(ONLY, 10) : 0;
const startI = i;
while (!stop) {
  if (ITERS != null && (i - startI) >= ITERS) break;
  if (DURATION_MS != null && Date.now() - startedAt >= DURATION_MS) break;
  const profile = PROFILE === 'mix' ? PROFILES[i % PROFILES.length] : PROFILE;
  const scn = generateScenario(SEED0 + i, profile);
  for (const name of engineList()) {
    const res = classify(scn, name);
    counts[res.kind] = (counts[res.kind] || 0) + 1;
    if (res.kind === 'fail-correctness' || res.kind === 'fail-soundness' || res.kind === 'crash' || res.kind === 'slow') persist(scn, res);
    if ((res.kind === 'fail-correctness' || res.kind === 'crash') && BAIL) stop = true;
  }
  i++;
  if (i % 200 === 0) {
    const secs = (Date.now() - startedAt) / 1000;
    console.log(`  iter ${i} · ${(i / secs).toFixed(1)}/s · ` + JSON.stringify(counts));
    writeReport(i); // informe incremental para sesiones largas
  }
  if (ONLY != null) break;
}

const report = writeReport(i);
console.log('\n' + fs.readFileSync(path.join(OUT, 'report.md'), 'utf8'));
const hadReal = counts['fail-correctness'] > 0 || counts.crash > 0;
process.exit(hadReal && (BAIL || ENV.CI) ? 1 : 0);
