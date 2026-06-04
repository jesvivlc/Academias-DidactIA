/* Verificación del modo "sin profesores" del Planner: generación CSP sin
   validar docentes (slots con profesor_id null) y asignación posterior con
   validación de conflictos. Carga el planner.js REAL en un VM. */

const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'planner.js'), 'utf8');
const HOOK = '\n  globalThis.__T = { _generarHorario, _slotSinProfesor, _asignarProfesorSlot, _calcGlobalScore, _s, DIAS, _tramoNums };\n';
const marker = '  window.DidactIAPlanner = DidactIAPlanner;';
const patched = SRC.replace(marker, HOOK + marker);

/* sb stub encadenable: from(...).update(...).eq()...then() y .insert/.delete */
function chain() {
  const p = {};
  ['select', 'update', 'insert', 'delete', 'eq', 'order', 'in', 'maybeSingle'].forEach((m) => { p[m] = () => p; });
  p.then = (cb) => { cb({ error: null, data: [] }); return p; };
  return p;
}
const sb = { from: () => chain() };

const noopEl = { style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, dataset: {} };
const sandbox = {
  console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  window: {}, navigator: {}, sb, ctrId: 'demo',
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => noopEl, body: noopEl },
  setTimeout, clearTimeout, Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} }, Worker: function () {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(patched, sandbox, { filename: 'planner.js' });

const T = sandbox.__T;
const { _s, DIAS } = T;

_s.tramos = [
  { numero: 1, hora_inicio: '08:50', hora_fin: '09:45', es_descanso: false },
  { numero: 2, hora_inicio: '09:45', hora_fin: '10:40', es_descanso: false },
  { numero: 3, hora_inicio: '10:40', hora_fin: '11:35', es_descanso: false },
  { numero: 4, hora_inicio: '11:35', hora_fin: '12:00', nombre: 'Recreo', es_descanso: true },
  { numero: 5, hora_inicio: '12:00', hora_fin: '12:55', es_descanso: false },
  { numero: 6, hora_inicio: '12:55', hora_fin: '13:50', es_descanso: false },
];
_s.disponibilidad = {};
_s.profesores = [
  { id: 'p1', nombre: 'Ana López' }, { id: 'p2', nombre: 'Beatriz Ruiz' },
  { id: 'p3', nombre: 'Carlos Gil' }, { id: 'p4', nombre: 'Diana Sanz' },
];

function nec(grupo, mid, nom, pid, horas) {
  return {
    grupo_horario: grupo, materia_id: mid, materia_nombre: nom, materia_color: '#888',
    carga_cognitiva: 'media', tipo_dinamica: 'estatica',
    profesor_id: pid, profesor_nombre: 'Prof ' + pid, horas_semanales: horas, bloque_interdisciplinar_id: null,
  };
}
_s.necesidades = [
  nec('1ESOA', 'm1', 'Matemáticas', 'p1', 4),
  nec('1ESOA', 'm2', 'Lengua', 'p2', 4),
  nec('1ESOA', 'm3', 'Inglés', 'p3', 3),
  nec('1ESOA', 'm4', 'Filosofía', 'p4', 3),
];
_s.grupos = ['1ESOA'];

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('✅ ' + l); } else { fail++; console.log('❌ ' + l + (x ? ' — ' + x : '')); } };

console.log('\n=== Modo "sin profesores": generación + asignación ===\n');

/* 1) Generar sin profesores */
_s.sinProf = true;
const sched = T._generarHorario('1ESOA');
_s.sinProf = false;
ok('1. El CSP genera un horario sin profesores', !!sched);

_s.schedule = { '1ESOA': sched };

/* 2) Todos los slots están sin asignar */
let total = 0, sinAsig = 0, conProf = 0, dupMateria = 0;
DIAS.forEach((d) => {
  const vistas = {};
  T._tramoNums().forEach((t) => {
    const slot = sched[d] && sched[d][String(t)];
    if (!slot) return;
    total++;
    if (T._slotSinProfesor(slot)) sinAsig++;
    if (slot.profesor_id) conProf++;
    if (vistas[slot.materia_id]) dupMateria++;
    vistas[slot.materia_id] = true;
  });
});
ok('2. Se colocaron 14 sesiones (4+4+3+3)', total === 14, 'total=' + total);
ok('2. TODOS los slots son "sin asignar" (profesor_id null)', sinAsig === total && conProf === 0, `sinAsig=${sinAsig} conProf=${conProf}`);
ok('2. Ninguna materia se repite el mismo día (HC-MATERIA-DIA respetado)', dupMateria === 0);

/* 3) Asignar un profesor a un slot concreto */
let target = null;
DIAS.some((d) => T._tramoNums().some((t) => {
  const slot = sched[d] && sched[d][String(t)];
  if (slot && slot.materia_id === 'm1') { target = { dia: d, tramo: t }; return true; }
  return false;
}));
let r = T._asignarProfesorSlot('1ESOA', target.dia, target.tramo, 'p1', 'Ana López');
const asigSlot = sched[target.dia][String(target.tramo)];
ok('3. Asignar Ana López a un slot de Matemáticas se ACEPTA', r.ok && asigSlot.profesor_id === 'p1' && !T._slotSinProfesor(asigSlot));

/* 4) Conflicto: mismo profesor, mismo día/tramo en otro grupo → rechazado */
_s.schedule['2ESOA'] = {}; DIAS.forEach((d) => { _s.schedule['2ESOA'][d] = {}; });
_s.schedule['2ESOA'][target.dia][String(target.tramo)] = { materia_id: 'mX', materia_nombre: 'Historia', profesor_id: 'p2', profesor_nombre: 'Beatriz Ruiz', codocente_prof_ids: ['p2'] };
// intentar poner a Beatriz (p2) en el mismo día/tramo del 1ESOA en otro slot sin asignar
let slotLibre = null;
DIAS.forEach((d) => T._tramoNums().forEach((t) => {
  const slot = sched[d] && sched[d][String(t)];
  if (slot && T._slotSinProfesor(slot) && d === target.dia && t === target.tramo) slotLibre = { dia: d, tramo: t };
}));
// el slot de m1 ya está asignado; busquemos otro slot del 1ESOA en ese mismo día/tramo no existe (uno por grupo).
// Validamos el conflicto directamente: intentar asignar p2 a un slot de 1ESOA en (target.dia,target.tramo) — ya ocupado por m1/p1.
// En su lugar comprobamos el rechazo creando un slot sin asignar en 2ESOA y asignando p1 (que ya da clase en 1ESOA ese tramo).
_s.schedule['2ESOA'][target.dia][String(target.tramo)] = { materia_id: 'mX', materia_nombre: 'Historia', profesor_id: null, profesor_nombre: '', codocente_prof_ids: [], sin_asignar: true };
r = T._asignarProfesorSlot('2ESOA', target.dia, target.tramo, 'p1', 'Ana López');
ok('4. Asignar a un profesor ya ocupado ese día/tramo en otro grupo se RECHAZA', !r.ok && /ya tiene clase/i.test(r.motivo || ''), JSON.stringify(r));

/* 5) Disponibilidad declarada bloquea la asignación */
_s.disponibilidad = { p3: new Set([target.dia + '_' + target.tramo]) };
_s.schedule['2ESOA'][target.dia][String(target.tramo)] = { materia_id: 'mY', materia_nombre: 'Música', profesor_id: null, profesor_nombre: '', codocente_prof_ids: [], sin_asignar: true };
r = T._asignarProfesorSlot('2ESOA', target.dia, target.tramo, 'p3', 'Carlos Gil');
ok('5. Asignar a un profesor no disponible ese día/tramo se RECHAZA', !r.ok && /no está disponible/i.test(r.motivo || ''), JSON.stringify(r));

console.log('\n' + (fail ? '⚠️  ' + fail + ' fallo(s), ' + pass + ' ok' : '🎉 Todos los checks pasan (' + pass + ')'));
process.exit(fail ? 1 : 0);
