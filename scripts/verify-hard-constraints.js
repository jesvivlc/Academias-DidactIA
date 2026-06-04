/* Verificación de hard constraints del motor CSP del Planner.
   Carga el planner.js REAL en un VM con globals de navegador stubbeados,
   inyecta un hook para exponer las funciones internas, y genera un horario
   de prueba estilo IES Demo para comprobar HC-MATERIA-DIA, HC-VENTANA y
   HC-INICIO-FIN. No modifica el archivo en disco. */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'planner.js'), 'utf8');

/* Inyectar export de internals justo antes del cierre del IIFE */
const HOOK = '\n  globalThis.__PLANNER_TEST__ = { _generarHorario, _esHardValido, _buildSessions, _tramoNums, _s, DIAS };\n';
const marker = '  window.DidactIAPlanner = DidactIAPlanner;';
if (!SRC.includes(marker)) { console.error('No se encontró el marcador de cierre'); process.exit(1); }
const patched = SRC.replace(marker, HOOK + marker);

/* Sandbox con stubs de navegador (ninguna función DOM se invoca en este test) */
const sandbox = {
  console,
  window: {},
  document: { getElementById: () => null, querySelector: () => null, createElement: () => ({ style:{}, appendChild(){}, classList:{add(){},remove(){}} }), body: { appendChild(){} } },
  navigator: {},
  sb: {},
  ctrId: 'a0eedbc0-0001-4d52-8f00-000000000001',
  Blob: function(){}, URL: { createObjectURL: () => '', revokeObjectURL(){} }, Worker: function(){},
  setTimeout, clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(patched, sandbox, { filename: 'planner.js' });

const T = sandbox.__PLANNER_TEST__;
if (!T) { console.error('No se expusieron los internals'); process.exit(1); }

/* ── Datos de prueba estilo IES Demo ── */
/* Tramos por defecto (8 tramos de clase/día: 1,2,3,5,6,7,9,10) */
T._s.tramos = [
  { numero:1,  hora_inicio:'08:50', hora_fin:'09:45', nombre:'',       es_descanso:false },
  { numero:2,  hora_inicio:'09:45', hora_fin:'10:40', nombre:'',       es_descanso:false },
  { numero:3,  hora_inicio:'10:40', hora_fin:'11:35', nombre:'',       es_descanso:false },
  { numero:4,  hora_inicio:'11:35', hora_fin:'12:00', nombre:'Recreo', es_descanso:true  },
  { numero:5,  hora_inicio:'12:00', hora_fin:'12:55', nombre:'',       es_descanso:false },
  { numero:6,  hora_inicio:'12:55', hora_fin:'13:50', nombre:'',       es_descanso:false },
  { numero:7,  hora_inicio:'13:50', hora_fin:'14:45', nombre:'',       es_descanso:false },
  { numero:8,  hora_inicio:'14:45', hora_fin:'15:10', nombre:'Comida', es_descanso:true  },
  { numero:9,  hora_inicio:'15:10', hora_fin:'16:05', nombre:'',       es_descanso:false },
  { numero:10, hora_inicio:'16:05', hora_fin:'17:00', nombre:'',       es_descanso:false },
];
T._s.disponibilidad = {};
T._s.schedule = {};

/* Necesidades lectivas de un grupo (1ESOA): carga semanal legal (≤5h por materia,
   total ≤ 40 tramos). Mezcla de cargas para ejercitar también los soft constraints. */
function nec(grupo, mid, mnom, pid, pnom, horas, carga, din) {
  return {
    grupo_horario: grupo, materia_id: mid, materia_nombre: mnom,
    materia_color: '#888', profesor_id: pid, profesor_nombre: pnom,
    horas_semanales: horas, carga_cognitiva: carga, tipo_dinamica: din,
    bloque_interdisciplinar_id: null
  };
}

const GRUPO = '1ESOA';
T._s.necesidades = [
  nec(GRUPO, 'm1', 'Matemáticas',     'p1', 'Ana López',     4, 'alta',  'estatica'),
  nec(GRUPO, 'm2', 'Lengua',          'p2', 'Beatriz Ruiz',  4, 'alta',  'estatica'),
  nec(GRUPO, 'm3', 'Inglés',          'p3', 'Carlos Gil',    3, 'media', 'estatica'),
  nec(GRUPO, 'm4', 'Biología',        'p4', 'Diana Sanz',    3, 'media', 'estatica'),
  nec(GRUPO, 'm5', 'Geografía',       'p5', 'Eva Mora',      3, 'media', 'estatica'),
  nec(GRUPO, 'm6', 'Educación Física','p6', 'Félix Ros',     2, 'baja',  'motriz'),
  nec(GRUPO, 'm7', 'Música',          'p7', 'Gema Vela',     2, 'baja',  'estatica'),
  nec(GRUPO, 'm8', 'Plástica',        'p8', 'Hugo Pena',     2, 'baja',  'motriz'),
  nec(GRUPO, 'm9', 'Tecnología',      'p9', 'Iván Toro',     2, 'media', 'estatica'),
];
const totalHoras = T._s.necesidades.reduce((a,n)=>a+n.horas_semanales,0);

/* ── Generar ── */
const sched = T._generarHorario(GRUPO);

function fail(msg){ console.error('❌ ' + msg); process.exitCode = 1; }
function ok(msg){ console.log('✅ ' + msg); }

console.log('\n=== Verificación hard constraints — grupo ' + GRUPO + ' (' + totalHoras + 'h/sem) ===\n');

if (!sched) { fail('El motor no encontró solución (esperábamos una; carga legal).'); process.exit(1); }

const TNUMS = T._tramoNums();
const DIAS  = T.DIAS;

/* Imprimir tablero */
console.log('Tablero generado:');
DIAS.forEach(d => {
  const fila = TNUMS.map(t => {
    const s = sched[d] && sched[d][String(t)];
    return 'T'+t+':' + (s ? s.materia_nombre.slice(0,8).padEnd(8) : '·       ');
  }).join(' | ');
  console.log('  ' + d.padEnd(10) + ' ' + fila);
});
console.log('');

/* HC-MATERIA-DIA: ninguna materia dos veces el mismo día */
let dup = 0;
DIAS.forEach(d => {
  const vistas = {};
  TNUMS.forEach(t => {
    const s = sched[d] && sched[d][String(t)];
    if (!s) return;
    if (vistas[s.materia_id]) { dup++; fail('HC-MATERIA-DIA: "'+s.materia_nombre+'" repetida el '+d); }
    vistas[s.materia_id] = true;
  });
});
if (!dup) ok('HC-MATERIA-DIA: ninguna materia se repite el mismo día');

/* HC-VENTANA: máximo 8 tramos de clase por día */
let overload = 0;
DIAS.forEach(d => {
  const n = TNUMS.filter(t => sched[d] && sched[d][String(t)]).length;
  if (n > 8) { overload++; fail('HC-VENTANA: '+d+' tiene '+n+' tramos (>8)'); }
});
if (!overload) ok('HC-VENTANA: ningún día supera 8 tramos de clase');

/* HC-INICIO-FIN: clases consecutivas (sin huecos) dentro de los tramos de clase */
let gaps = 0;
DIAS.forEach(d => {
  const idxs = [];
  TNUMS.forEach((t, i) => { if (sched[d] && sched[d][String(t)]) idxs.push(i); });
  if (idxs.length === 0) return;
  const min = Math.min(...idxs), max = Math.max(...idxs);
  if (max - min + 1 !== idxs.length) { gaps++; fail('HC-INICIO-FIN: hueco libre en mitad de la jornada el '+d); }
});
if (!gaps) ok('HC-INICIO-FIN: ningún día tiene huecos libres en mitad de la jornada');

/* ── Caso adverso: una materia con 6h (>5 días) DEBE forzar fallo, no un horario ilegal ── */
console.log('\n=== Caso adverso: materia con 6h/sem (imposible sin repetir día) ===\n');
/* Reducimos a 2 tramos de clase/día para que el backtracking exhaustivo termine
   rápido; la imposibilidad se mantiene (6 sesiones > 5 días por HC-MATERIA-DIA). */
T._s.tramos = [
  { numero:1, hora_inicio:'08:50', hora_fin:'09:45', nombre:'', es_descanso:false },
  { numero:2, hora_inicio:'09:45', hora_fin:'10:40', nombre:'', es_descanso:false },
];
T._s.schedule = {};
T._s.necesidades = [ nec(GRUPO, 'x1', 'SuperMate', 'p1', 'Ana', 6, 'alta', 'estatica') ];
const schedBad = T._generarHorario(GRUPO);
if (schedBad === null) {
  ok('Rechazado correctamente (null) — el motor NO produce un horario que viole HC-MATERIA-DIA');
} else {
  fail('El motor devolvió un horario para una carga que obliga a repetir materia en un día');
}

if (process.exitCode) { console.log('\n⚠️  Hay fallos.'); } else { console.log('\n🎉 Todos los hard constraints se cumplen.'); }
