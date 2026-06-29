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

  // index required sessions per (grupo, materia) — bloque interdisciplinar cuenta como min(horas)
  const required = {};   // `${g}|${mid}` -> count
  const totalByGS = {};  // for SA maxPerDay
  necs.forEach(n => {
    if (n.bloque_interdisciplinar_id) return; // los bloques no suman a cobertura individual aquí
    const k = n.grupo_horario + '|' + n.materia_id;
    required[k] = (required[k] || 0) + n.horas_semanales;
    totalByGS[k] = required[k];
  });

  const teacherSlot = {}; // `${dia}|${tramo}|${profId}` -> grupo (choque de profe entre grupos)
  const placedByGS = {};  // `${g}|${mid}` -> count placed

  Object.keys(schedule || {}).forEach(grupo => {
    const dispOf = (pid) => scenario.disponibilidad[pid]; // Set<"dia_tramo"> | undefined
    DIAS.forEach(dia => {
      const row = (schedule[grupo] && schedule[grupo][dia]) || {};
      const subjPerDay = {};
      const occupiedIdx = [];
      classTramos.forEach((tnum, idx) => {
        const cell = row[tnum] || row[String(tnum)];
        if (!cell) return;
        occupiedIdx.push(idx);
        const gk = grupo + '|' + cell.materia_id;
        placedByGS[gk] = (placedByGS[gk] || 0) + 1;
        subjPerDay[cell.materia_id] = (subjPerDay[cell.materia_id] || 0) + 1;
        (cell.profesor_ids || []).filter(Boolean).forEach(pid => {
          const tk = dia + '|' + tnum + '|' + pid;
          if (teacherSlot[tk]) add('teacher-double-book', `profe ${pid} en ${teacherSlot[tk]} y ${grupo} (${dia} T${tnum})`, { grupo, dia, tramo: tnum });
          else teacherSlot[tk] = grupo;
          if (engine === 'sa' && dispOf(pid) && dispOf(pid).has(dia + '_' + tnum))
            add('disponibilidad', `profe ${pid} fuera de disponibilidad (${dia} T${tnum})`, { grupo, dia, tramo: tnum });
        });
      });
      Object.keys(subjPerDay).forEach(mid => {
        const limit = engine === 'sa' ? Math.ceil((totalByGS[grupo + '|' + mid] || 1) / 5) : 1;
        if (subjPerDay[mid] > limit) add('materia-dia', `materia ${mid} ${subjPerDay[mid]}x el ${dia} (límite ${limit}) en ${grupo}`, { grupo, dia });
      });
      if (engine === 'csp' && occupiedIdx.length) {
        if (occupiedIdx.length > classTramos.length) add('hc-ventana', `${occupiedIdx.length} clases el ${dia} en ${grupo}`, { grupo, dia });
        const min = Math.min(...occupiedIdx), max = Math.max(...occupiedIdx);
        if (max - min + 1 !== occupiedIdx.length) add('hc-inicio-fin', `hueco a media jornada el ${dia} en ${grupo}`, { grupo, dia });
      }
    });
  });

  // Cobertura SOLO cuando sabemos que el escenario es plenamente satisfacible
  // (feasible-known). En escenarios de capacidad/azar, un horario incompleto no es bug.
  const checkCoverage = schedule && scenario.meta && scenario.meta.expected === 'feasible-known';
  if (checkCoverage) Object.keys(required).forEach(k => {
    if (required[k] !== (placedByGS[k] || 0)) add('coverage', `${k}: colocadas ${placedByGS[k] || 0} de ${required[k]}`);
  });

  return V;
}

/* soundness: solo el caso fiable — un escenario satisfacible conocido NO debe dar null.
   (No afirmamos "imposible→aceptó" porque los dos motores tienen reglas materia/día
   distintas y un horario que viola una restricción ya lo caza verify() como corrección.) */
function checkSoundness(scenario, schedule) {
  const V = [];
  const solved = schedule && Object.keys(schedule).length > 0;
  const exp = scenario.meta && scenario.meta.expected;
  if (exp === 'feasible-known' && !solved) V.push({ type: 'suspect-reject', detail: 'devolvió null para un caso satisfacible conocido' });
  return V;
}

module.exports = { verify, checkSoundness, DIAS };
