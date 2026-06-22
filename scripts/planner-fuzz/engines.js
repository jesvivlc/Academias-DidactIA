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
      createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, remove() {} } }), body: { appendChild() {} } },
    navigator: {}, sb: {}, ctrId: 'fuzz', ctrName: 'Fuzz',
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} }, Worker: function () {},
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(patched, sandbox, { filename: 'planner.js' });
  if (!sandbox.__PLANNER_TEST__) throw new Error('El hook no expuso los internals');
  return sandbox.__PLANNER_TEST__;
}

/* ── CSP per-group engine ── */
function runCsp(scenario) {
  const T = loadCspContext();
  T._s.tramos = scenario.tramos;
  T._s.disponibilidad = scenario.disponibilidad;
  T._s.necesidades = scenario.necesidades;
  T._s.grupos = scenario.grupos;
  T._s.profesores = scenario.profesores;
  T._s.schedule = {};
  T._s.sinProf = true;
  const out = {};
  for (const g of scenario.grupos) {
    const sched = T._generarHorario(g);
    if (!sched) return null;
    T._s.schedule[g] = sched;
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

/* ── SA engine: extract WORKER_LOGIC and run TimetableSolver in Node ── */
function extractWorkerLogic() {
  const m = SRC.match(/const WORKER_LOGIC = `([\s\S]*?)`;/);
  if (!m) throw new Error('No se pudo extraer WORKER_LOGIC de planner.js');
  return m[1];
}

function runSa(scenario, variantId) {
  const T = loadCspContext();
  T._s.tramos = scenario.tramos;
  T._s.disponibilidad = scenario.disponibilidad;
  T._s.necesidades = scenario.necesidades;
  T._s.grupos = scenario.grupos;
  T._s.profesores = scenario.profesores;
  const config = T._buildPlannerConfig();
  const variant = T.DidactIAPlanner.VARIANTS.find(v => v.id === (variantId || 'A')) || T.DidactIAPlanner.VARIANTS[0];

  let result = null;
  const self = { postMessage: (msg) => { if (msg && msg.type === 'completed') result = msg.result; }, onmessage: null };
  const sandbox = { self, postMessage: self.postMessage, Date, Math, Object, Array, Set, Map, JSON, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(extractWorkerLogic(), sandbox, { filename: 'worker_logic.js' });
  if (typeof self.onmessage !== 'function') throw new Error('WORKER_LOGIC no definió self.onmessage');
  self.onmessage({ data: Object.assign({}, config, { variantId: variant.id, weights: variant.weights }) });
  if (!result || !Array.isArray(result.schedule) || result.schedule.length === 0) return null;
  return normalizeSa(result, scenario);
}

function normalizeSa(report, scenario) {
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
  const classNumeros = scenario.tramos.filter(t => !t.es_descanso).map(t => t.numero);
  const out = {};
  report.schedule.forEach(item => {
    const grupo = item.groupId, dia = DIAS[item.dayIdx], tnum = classNumeros[item.tramoIdx];
    if (!grupo || dia == null || tnum == null) return;
    out[grupo] = out[grupo] || {};
    out[grupo][dia] = out[grupo][dia] || {};
    out[grupo][dia][tnum] = {
      materia_id: item.subjectId,
      profesor_ids: (item.teacherIds || []).filter(Boolean),
      bloque_id: item.bloque_interdisciplinar_id || null,
    };
  });
  return out;
}

module.exports = { loadCspContext, runCsp, normalizeCsp, runSa, normalizeSa, extractWorkerLogic, SRC, MARKER };
