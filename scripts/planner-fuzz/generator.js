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

// 10 tramos, recreo (4) y comida (8) como descansos → 8 tramos de clase
const TRAMOS_8 = [1,2,3,4,5,6,7,8,9,10].map((numero, i) => ({
  numero,
  hora_inicio: String(8 + i).padStart(2, '0') + ':00',
  hora_fin: String(9 + i).padStart(2, '0') + ':00',
  nombre: numero === 4 ? 'Recreo' : numero === 8 ? 'Comida' : '',
  es_descanso: numero === 4 || numero === 8,
}));

const PROFILES = ['realistic', 'adversarial', 'scale', 'impossible'];

/* returns { grupos, necesidades, tramos, disponibilidad, profesores, meta } */
function generateScenario(seed, profile) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  profile = profile || pick(PROFILES);

  const tramos = TRAMOS_8;
  const nGrupos = profile === 'scale' ? ri(13, 20) : ri(1, 4);
  const grupos = Array.from({ length: nGrupos }, (_, i) => 'G' + i);
  const nProf = profile === 'adversarial' ? ri(3, 6) : ri(8, 20);
  const profesores = Array.from({ length: nProf }, (_, i) => ({ id: 'p' + i, nombre: 'Profe ' + i }));

  const necesidades = [];
  const subjects = ['Mat','Len','Ing','Bio','Geo','EF','Mus','Pla','Tec','Fis','Qui','His'];
  grupos.forEach(g => {
    const nMat = ri(5, Math.min(9, subjects.length));
    const used = new Set();
    for (let m = 0; m < nMat; m++) {
      let mid; do { mid = pick(subjects); } while (used.has(mid)); used.add(mid);
      const h = profile === 'impossible' ? ri(6, 8)
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

  const disponibilidad = {};
  if (profile !== 'impossible') {
    profesores.forEach(p => {
      const restrict = profile === 'adversarial' ? rnd() < 0.6 : rnd() < 0.2;
      if (!restrict) return;
      const set = new Set();
      const blocked = profile === 'adversarial' ? ri(10, 30) : ri(1, 8);
      const classT = tramos.filter(t => !t.es_descanso);
      for (let b = 0; b < blocked; b++) set.add(pick(DIAS) + '_' + pick(classT).numero);
      disponibilidad[p.id] = set;
    });
  }

  const expected = profile === 'impossible' ? 'impossible' : 'unknown';
  return { grupos, necesidades, tramos, disponibilidad, profesores, meta: { profile, seed, expected } };
}

module.exports = { generateScenario, mulberry32, PROFILES, DIAS };
