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

// GOOD: 1 grupo, M(2h)+L(1h) en 3 tramos, sin huecos, sin repetir materia/día
const goodScn = { grupos: ['G1'], tramos, disponibilidad: {}, necesidades: [baseNec('G1','M','p1',2), baseNec('G1','L','p2',1)], meta: {} };
const goodSched = { G1: { lunes: { 1: { materia_id:'M', profesor_ids:['p1'] }, 2: { materia_id:'L', profesor_ids:['p2'] } },
                          martes:{ 1: { materia_id:'M', profesor_ids:['p1'] } } } };
none('good', verify(goodScn, goodSched, 'csp'));

// materia-dia (csp): M dos veces el lunes
has('materia-dia', verify(goodScn, { G1:{ lunes:{ 1:{materia_id:'M',profesor_ids:['p1']}, 2:{materia_id:'M',profesor_ids:['p1']} } } }, 'csp'), 'materia-dia');

// teacher double-book: p1 mismo dia/tramo en G1 y G2
const tdScn = { grupos:['G1','G2'], tramos, disponibilidad:{}, necesidades:[baseNec('G1','M','p1',1), baseNec('G2','N','p1',1)], meta:{} };
has('teacher-clash', verify(tdScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}}}, G2:{lunes:{1:{materia_id:'N',profesor_ids:['p1']}}} }, 'csp'), 'teacher-double-book');

// hc-inicio-fin (csp): T1 y T3 ocupados, T2 libre → hueco
has('gap', verify(goodScn, { G1:{ lunes:{ 1:{materia_id:'M',profesor_ids:['p1']}, 3:{materia_id:'L',profesor_ids:['p2']} } } }, 'csp'), 'hc-inicio-fin');

// disponibilidad (sa): p1 colocado en lunes_1 estando no disponible
const dispScn = { grupos:['G1'], tramos, disponibilidad:{ p1:new Set(['lunes_1']) }, necesidades:[baseNec('G1','M','p1',1)], meta:{} };
has('disp', verify(dispScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}}} }, 'sa'), 'disponibilidad');
none('disp-csp-skips', verify(dispScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}}} }, 'csp'));

// coverage: falta 1 sesión de M (req 2, placed 1)
has('coverage', verify(goodScn, { G1:{lunes:{1:{materia_id:'M',profesor_ids:['p1']}, 2:{materia_id:'L',profesor_ids:['p2']}}} }, 'csp'), 'coverage');

// soundness
has('unsound', checkSoundness({ meta:{expected:'impossible'} }, { G1:{ lunes:{ 1:{ materia_id:'M', profesor_ids:[] } } } }), 'unsound-accept');
eq('feasible-null', checkSoundness({ meta:{expected:'feasible-known'} }, null).some(v=>v.type==='suspect-reject'), true);

if (fails) { console.error('\n❌ selftest: ' + fails + ' fallos'); process.exit(1); }
console.log('\n🎉 selftest OK — el verificador detecta todas las violaciones');
