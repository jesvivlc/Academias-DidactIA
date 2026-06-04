/* Verificación del drag & drop con hard constraints + zona de aparcamiento.
   Carga el planner.js REAL en un VM con globals de navegador stubbeados,
   expone las funciones internas e invoca _ejecutarDrop / aparcados sobre un
   horario en memoria. No modifica el archivo en disco ni toca el DOM real. */

const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'planner.js'), 'utf8');
const HOOK = '\n  globalThis.__T = { _ejecutarDrop, _validarDiaGrupo, _s, _tramoNums, DIAS, _loadAparcados, _saveAparcados };\n';
const marker = '  window.DidactIAPlanner = DidactIAPlanner;';
const patched = SRC.replace(marker, HOOK + marker);

/* localStorage en memoria */
const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const noopEl = { style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, dataset: {} };
const sandbox = {
  console, localStorage,
  window: {}, navigator: {}, sb: {}, ctrId: 'demo-centro',
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => noopEl, body: noopEl },
  setTimeout, clearTimeout, Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} }, Worker: function () {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(patched, sandbox, { filename: 'planner.js' });

const T = sandbox.__T;
const { _s } = T;

/* ── Setup: tramos por defecto (clase = 1,2,3,5,6,7,9,10) y un grupo ── */
_s.tramos = [
  { numero: 1, hora_inicio: '08:50', hora_fin: '09:45', es_descanso: false },
  { numero: 2, hora_inicio: '09:45', hora_fin: '10:40', es_descanso: false },
  { numero: 3, hora_inicio: '10:40', hora_fin: '11:35', es_descanso: false },
  { numero: 4, hora_inicio: '11:35', hora_fin: '12:00', nombre: 'Recreo', es_descanso: true },
  { numero: 5, hora_inicio: '12:00', hora_fin: '12:55', es_descanso: false },
  { numero: 6, hora_inicio: '12:55', hora_fin: '13:50', es_descanso: false },
  { numero: 7, hora_inicio: '13:50', hora_fin: '14:45', es_descanso: false },
  { numero: 8, hora_inicio: '14:45', hora_fin: '15:10', nombre: 'Comida', es_descanso: true },
  { numero: 9, hora_inicio: '15:10', hora_fin: '16:05', es_descanso: false },
  { numero: 10, hora_inicio: '16:05', hora_fin: '17:00', es_descanso: false },
];
_s.disponibilidad = {};
_s.currentGrupo = '1ESOA';

function slot(mid, nombre, pid) {
  return { materia_id: mid, materia_nombre: nombre, materia_color: '#888', profesor_id: pid, profesor_nombre: 'Prof ' + pid, codocente_prof_ids: [pid], es_codoce: false };
}
function freshSched() {
  _s.schedule = { '1ESOA': { lunes: {}, martes: {}, 'miércoles': {}, jueves: {}, viernes: {} } };
  _s.schedule['1ESOA'].lunes['1'] = slot('m1', 'Matemáticas', 'p1');
  _s.schedule['1ESOA'].lunes['2'] = slot('m2', 'Lengua', 'p2');
  _s.schedule['1ESOA'].lunes['3'] = slot('m3', 'Inglés', 'p3');
  _s.aparcados = [];
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + label); }
  else { fail++; console.log('❌ ' + label + (extra ? ' — ' + extra : '')); }
}
function lunesTramos() { return Object.keys(_s.schedule['1ESOA'].lunes).filter((k) => _s.schedule['1ESOA'].lunes[k]).sort(); }

console.log('\n=== Drag & drop del Tablero — hard constraints + aparcados ===\n');

/* A) Mover crea hueco → rechazado */
freshSched();
_s.dragData = { from: 'tablero', dia: 'lunes', tramo: '3', grupo: '1ESOA' };
let r = T._ejecutarDrop('1ESOA', 'lunes', '5', false);
check('A. Mover lunes T3→T5 (dejaría hueco) se RECHAZA', !r.ok && /hueco/i.test(r.motivo || ''), JSON.stringify(r));
check('A. El horario no cambió tras el rechazo', JSON.stringify(lunesTramos()) === JSON.stringify(['1', '2', '3']));

/* B) Mover válido (mantiene contigüidad) → commit */
freshSched();
_s.dragData = { from: 'tablero', dia: 'lunes', tramo: '1', grupo: '1ESOA' };
r = T._ejecutarDrop('1ESOA', 'lunes', '5', false);
check('B. Mover lunes T1→T5 (queda {T2,T3,T5} contiguo) se ACEPTA', r.ok && r.committed, JSON.stringify(r));
check('B. Origen T1 vacío y destino T5 ocupado', !_s.schedule['1ESOA'].lunes['1'] && !!_s.schedule['1ESOA'].lunes['5']);

/* C) Mover válido a otro día libre */
freshSched();
_s.dragData = { from: 'tablero', dia: 'lunes', tramo: '3', grupo: '1ESOA' };
r = T._ejecutarDrop('1ESOA', 'martes', '1', false);
check('C. Mover lunes T3→martes T1 se ACEPTA', r.ok && r.committed);
check('C. lunes queda {T1,T2} contiguo y martes {T1}', JSON.stringify(lunesTramos()) === JSON.stringify(['1', '2']) && !!_s.schedule['1ESOA'].martes['1']);

/* D) Materia duplicada el mismo día → rechazado */
freshSched();
_s.schedule['1ESOA'].martes['1'] = slot('m1', 'Matemáticas', 'p1'); // m1 también el martes (otro día: legal)
_s.dragData = { from: 'tablero', dia: 'martes', tramo: '1', grupo: '1ESOA' };
r = T._ejecutarDrop('1ESOA', 'lunes', '5', false); // lunes ya tiene m1 en T1
check('D. Mover m1 a un día donde ya existe se RECHAZA (HC-MATERIA-DIA)', !r.ok && /dos veces/i.test(r.motivo || ''), JSON.stringify(r));

/* E) dryRun no muta el estado */
freshSched();
const snapshot = JSON.stringify(_s.schedule);
_s.dragData = { from: 'tablero', dia: 'lunes', tramo: '1', grupo: '1ESOA' };
r = T._ejecutarDrop('1ESOA', 'martes', '1', true);
check('E. dryRun de un movimiento válido NO muta el horario', JSON.stringify(_s.schedule) === snapshot && r.ok);

/* F) Aparcar (vía simulación de plannerDropPool) y recolocar */
freshSched();
// aparcar lunes T2 manualmente como hace plannerDropPool
const parked = _s.schedule['1ESOA'].lunes['2'];
delete _s.schedule['1ESOA'].lunes['2'];
_s.aparcados.push({ grupo: '1ESOA', slot: parked });
T._saveAparcados();
check('F. Tras aparcar, lunes queda {T1,T3} y hay 1 aparcado', JSON.stringify(lunesTramos()) === JSON.stringify(['1', '3']) && _s.aparcados.length === 1);
check('F. Persistido en localStorage', !!store['planner_aparcados_demo-centro']);

// recolocar el aparcado en su hueco (lunes T2) → válido
_s.dragData = { from: 'aparcado', idx: 0 };
r = T._ejecutarDrop('1ESOA', 'lunes', '2', false);
check('F. Recolocar aparcado en lunes T2 se ACEPTA y vacía aparcados', r.ok && r.committed && _s.aparcados.length === 0);
check('F. lunes vuelve a {T1,T2,T3}', JSON.stringify(lunesTramos()) === JSON.stringify(['1', '2', '3']));

/* G) Aparcado a hueco ocupado → rechazado */
freshSched();
_s.aparcados = [{ grupo: '1ESOA', slot: slot('m9', 'Música', 'p9') }];
_s.dragData = { from: 'aparcado', idx: 0 };
r = T._ejecutarDrop('1ESOA', 'lunes', '1', false); // T1 ocupado
check('G. Soltar aparcado en hueco ocupado se RECHAZA', !r.ok && /ocupado/i.test(r.motivo || ''), JSON.stringify(r));

/* H) Persistencia: _loadAparcados recupera lo guardado */
store['planner_aparcados_demo-centro'] = JSON.stringify([{ grupo: '1ESOA', slot: slot('mX', 'Plástica', 'pX') }]);
_s.aparcados = [];
T._loadAparcados();
check('H. _loadAparcados restaura aparcados desde localStorage (aviso en recarga)', _s.aparcados.length === 1 && _s.aparcados[0].slot.materia_nombre === 'Plástica');

console.log('\n' + (fail ? '⚠️  ' + fail + ' fallo(s), ' + pass + ' ok' : '🎉 Todos los checks pasan (' + pass + ')'));
process.exit(fail ? 1 : 0);
