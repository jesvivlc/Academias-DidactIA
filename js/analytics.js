/* js/analytics.js — DidactIA CMI: Cuadro de Mando Integral */
/* Solo para admin/superadmin. Usa globals: sb, ctrId, ctrName, role (config.js) */

(function () {
  'use strict';

  /* ── Estado ── */
  const _s = {
    charts: {},
    lastOp: null,
    lastCom: null,
    lastConv: null,
  };

  function _esc(s) { return escH(s); } // delegado a utils.js

  const _hoy = () => new Date().toISOString().slice(0, 10);

  function _hace(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().slice(0, 10);
  }

  function _semanaIni() {
    const d = new Date();
    const dow = d.getDay() || 7;
    d.setDate(d.getDate() - dow + 1);
    return d.toISOString().slice(0, 10);
  }

  function _mesIni() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }

  function _trimIni() {
    const m = new Date().getMonth() + 1;
    const y = new Date().getFullYear();
    if (m >= 9) return `${y}-09-01`;
    if (m <= 3) return `${y}-01-01`;
    return `${y}-04-01`;
  }

  function _semaforo(val, ok, warn) {
    return val >= ok ? 'ok' : val >= warn ? 'warn' : 'danger';
  }

  function _semaforoInv(val, warn, danger) {
    return val <= warn ? 'ok' : val <= danger ? 'warn' : 'danger';
  }

  function _destroyCharts() {
    Object.values(_s.charts).forEach(c => { try { c.destroy(); } catch (_) {} });
    _s.charts = {};
  }

  function _skeleton() {
    return `<div class="cmi-card cmi-card--skeleton">
      <div class="cmi-skel-title"></div>
      <div class="cmi-skel-metrics">
        <div class="cmi-skel-num"></div><div class="cmi-skel-num"></div><div class="cmi-skel-num"></div>
      </div>
      <div class="cmi-skel-chart"></div>
    </div>`;
  }

  /* ══════════════════════════════════════════
     FETCH FUNCTIONS
  ══════════════════════════════════════════ */

  async function _fetchOperativa() {
    const hoy = _hoy(), semIni = _semanaIni(), trimIni = _trimIni(), hace14 = _hace(14);

    const [r1, r2, r3, r4, r5] = await Promise.all([
      sb.from('sustituciones').select('cubierta').eq('centro_id', ctrId).gte('fecha', semIni).lte('fecha', hoy),
      sb.from('ausencias_profesor').select('id').eq('centro_id', ctrId).eq('estado', 'aprobada').lte('fecha', hoy).gte('fecha_fin', hoy),
      sb.from('sustituciones').select('profesor_sustituto').eq('centro_id', ctrId).gte('fecha', trimIni).not('profesor_sustituto', 'is', null),
      sb.from('sustituciones').select('fecha, cubierta').eq('centro_id', ctrId).gte('fecha', hace14).lte('fecha', hoy).order('fecha'),
      sb.from('asistencia_clase').select('alumno_id').eq('centro_id', ctrId).eq('fecha', hoy).eq('estado', 'ausente'),
    ]);

    const sust = r1.data || [];
    const cubiertas = sust.filter(s => s.cubierta).length;
    const pendientes = sust.length - cubiertas;
    const pct = sust.length > 0 ? Math.round(cubiertas / sust.length * 100) : 100;
    const ausentes = (r2.data || []).length;
    const ausenciasAula = [...new Set((r5.data || []).map(x => x.alumno_id))].length;

    const guardMap = {};
    (r3.data || []).forEach(g => {
      const n = g.profesor_sustituto || '—';
      guardMap[n] = (guardMap[n] || 0) + 1;
    });
    const top5 = Object.entries(guardMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    /* Etiquetas de días laborables últimas 2 semanas */
    const fechas = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (d.getDay() !== 0 && d.getDay() !== 6) fechas.push(d.toISOString().slice(0, 10));
    }
    const porDia = {};
    (r4.data || []).forEach(s => {
      porDia[s.fecha] = porDia[s.fecha] || { c: 0, p: 0 };
      s.cubierta ? porDia[s.fecha].c++ : porDia[s.fecha].p++;
    });

    return {
      pct, cubiertas, pendientes, total: sust.length, ausentes, ausenciasAula, top5,
      chartLabels: fechas.map(f => f.slice(5)),
      chartCubiertas: fechas.map(f => porDia[f]?.c || 0),
      chartPendientes: fechas.map(f => porDia[f]?.p || 0),
      semaforo: _semaforo(pct, 80, 60),
    };
  }

  async function _fetchComedor() {
    const hoy = _hoy(), hace28 = _hace(28);

    const [r1, r2] = await Promise.all([
      sb.from('asistencia_comedor').select('alumno_id, fecha, se_queda').eq('centro_id', ctrId).gte('fecha', hace28).lte('fecha', hoy).order('fecha').limit(50000),
      sb.from('alumnos').select('id, nombre').eq('centro_id', ctrId),
    ]);

    const asistencia = r1.data || [];
    const totalAlumnos = (r2.data || []).length;
    const alumnos = r2.data || [];

    if (!asistencia.length || !totalAlumnos) {
      return { mediaAsistencia: 0, media: 0, totalAlumnos, tendencia: 'estable', absentistas: [], chartLabels: [], chartData: [], semaforo: 'ok' };
    }

    const porDia = {};
    asistencia.forEach(a => {
      porDia[a.fecha] = porDia[a.fecha] || 0;
      if (a.se_queda) porDia[a.fecha]++;
    });
    const dias = Object.keys(porDia).sort();
    const counts = dias.map(d => porDia[d]);
    const media = counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
    const mediaAsistencia = totalAlumnos ? Math.round(media / totalAlumnos * 100) : 0;

    const mid = Math.floor(counts.length / 2);
    const p1 = counts.slice(0, mid).reduce((a, b) => a + b, 0) / (mid || 1);
    const p2 = counts.slice(mid).reduce((a, b) => a + b, 0) / ((counts.length - mid) || 1);
    const tendencia = p2 > p1 * 1.05 ? 'subiendo' : p2 < p1 * 0.95 ? 'bajando' : 'estable';

    /* Alumnos habituales con >5 días de ausencia */
    const alumnoMap = {};
    asistencia.forEach(a => {
      alumnoMap[a.alumno_id] = alumnoMap[a.alumno_id] || { viene: 0, ausente: 0 };
      a.se_queda ? alumnoMap[a.alumno_id].viene++ : alumnoMap[a.alumno_id].ausente++;
    });
    const absentistas = alumnos
      .filter(al => { const m = alumnoMap[al.id]; return m && m.viene >= 5 && m.ausente >= 5; })
      .map(al => ({ nombre: al.nombre, ausencias: alumnoMap[al.id].ausente }))
      .sort((a, b) => b.ausencias - a.ausencias);

    return {
      mediaAsistencia, media, totalAlumnos, tendencia, absentistas,
      chartLabels: dias.map(d => d.slice(5)),
      chartData: counts,
      semaforo: _semaforo(mediaAsistencia, 70, 50),
    };
  }

  async function _fetchConvivencia() {
    const { data: inc } = await sb.from('incidencias')
      .select('estado, gravedad, tipo, grupo_horario')
      .eq('centro_id', ctrId)
      .gte('fecha', _mesIni())
      .lte('fecha', _hoy());

    const todas = inc || [];
    const abiertas = todas.filter(i => i.estado === 'abierta').length;
    const cerradas = todas.filter(i => i.estado === 'cerrada').length;
    const leves = todas.filter(i => i.gravedad === 'leve').length;
    const graves = todas.filter(i => i.gravedad === 'grave').length;
    const muyGraves = todas.filter(i => i.gravedad === 'muy_grave').length;

    const tipoMap = {};
    todas.forEach(i => { tipoMap[i.tipo || 'otro'] = (tipoMap[i.tipo || 'otro'] || 0) + 1; });
    const tipoLabels = Object.keys(tipoMap);
    const tipoCounts = tipoLabels.map(t => tipoMap[t]);

    const grupoMap = {};
    todas.forEach(i => { if (i.grupo_horario) grupoMap[i.grupo_horario] = (grupoMap[i.grupo_horario] || 0) + 1; });
    const top3 = Object.entries(grupoMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
      abiertas, cerradas, total: todas.length, leves, graves, muyGraves, top3,
      tipoLabels, tipoCounts,
      semaforo: _semaforoInv(muyGraves + graves, 1, 5),
    };
  }

  async function _fetchAlertas() {
    const { data } = await sb.from('alertas_predictivas')
      .select('id, alumno_id, tipo, nivel, descripcion, condicion_a, condicion_b, condicion_c, created_at')
      .eq('centro_id', ctrId)
      .eq('resuelta', false)
      .order('created_at', { ascending: false });

    const alertas = data || [];
    const ids = [...new Set(alertas.map(a => a.alumno_id))];
    let alumnoMap = {};
    if (ids.length) {
      const { data: alumnos } = await sb.from('alumnos').select('id, nombre, grupo_horario').in('id', ids);
      (alumnos || []).forEach(a => { alumnoMap[a.id] = a; });
    }

    return alertas.map(a => ({
      ...a,
      alumno: alumnoMap[a.alumno_id] || { nombre: 'Alumno desconocido', grupo_horario: '—' },
      diasDesde: Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000),
    }));
  }

  async function _fetchMulticentro() {
    const hoy = _hoy();
    const [cRes, alRes, sRes, iRes, comRes, uRes, aRes] = await Promise.all([
      sb.from('centros').select('id, nombre'),
      sb.from('alumnos').select('centro_id'),
      // Sin cubrir = cubierta false O null (la versión anterior omitía los null)
      sb.from('sustituciones').select('centro_id').eq('fecha', hoy).or('cubierta.is.null,cubierta.eq.false'),
      sb.from('incidencias').select('centro_id').eq('estado', 'abierta'),
      sb.from('asistencia_comedor').select('centro_id').eq('fecha', hoy).eq('se_queda', true),
      sb.from('profiles').select('centro_id'),
      sb.from('alertas_predictivas').select('centro_id').eq('resuelta', false),
    ]);
    const tally = (rows) => { const m = {}; (rows || []).forEach(r => { if (r.centro_id) m[r.centro_id] = (m[r.centro_id] || 0) + 1; }); return m; };
    const alMap = tally(alRes.data), sMap = tally(sRes.data), iMap = tally(iRes.data),
          comMap = tally(comRes.data), uMap = tally(uRes.data), aMap = tally(aRes.data);
    return (cRes.data || []).map(c => {
      const s = sMap[c.id] || 0, i = iMap[c.id] || 0, a = aMap[c.id] || 0;
      return {
        id: c.id, nombre: c.nombre,
        alumnos: alMap[c.id] || 0, sust: s, inc: i,
        comensales: comMap[c.id] || 0, usuarios: uMap[c.id] || 0, alertas: a,
        semaforo: (s + a) > 5 ? 'danger' : (s + a) > 2 ? 'warn' : 'ok',
      };
    }).sort((x, y) => y.alumnos - x.alumnos);
  }

  /* ══════════════════════════════════════════
     RENDER FUNCTIONS
  ══════════════════════════════════════════ */

  function _renderOperativa(d) {
    const top5Rows = d.top5.length
      ? d.top5.map(([n, c]) => `<tr><td class="cmi-td">${_esc(n)}</td><td class="cmi-td cmi-td--r">${c}</td></tr>`).join('')
      : '<tr><td class="cmi-td cmi-td--empty" colspan="2">Sin datos este trimestre</td></tr>';

    return `<div class="cmi-card cmi-card--${d.semaforo}">
      <div class="cmi-card-hdr">
        <div class="cmi-ico cmi-ico--sust"><i class="ti ti-replace"></i></div>
        <div class="cmi-card-titles">
          <div class="cmi-dim-eyebrow">Dimensión 1</div>
          <div class="cmi-dim-name">Operativa</div>
        </div>
        <div class="cmi-sem cmi-sem--${d.semaforo}"></div>
      </div>
      <div class="cmi-metrics">
        <div class="cmi-metric">
          <div class="cmi-metric-num">${d.pct}%</div>
          <div class="cmi-metric-lbl">Sust. cubiertas</div>
        </div>
        <div class="cmi-metric">
          <div class="cmi-metric-num cmi-num--${d.pendientes > 3 ? 'danger' : d.pendientes > 0 ? 'warn' : 'ok'}">${d.pendientes}</div>
          <div class="cmi-metric-lbl">Pendientes semana</div>
        </div>
        <div class="cmi-metric">
          <div class="cmi-metric-num cmi-num--${d.ausentes > 3 ? 'danger' : d.ausentes > 0 ? 'warn' : 'ok'}">${d.ausentes}</div>
          <div class="cmi-metric-lbl">Ausentes hoy</div>
        </div>
        <div class="cmi-metric">
          <div class="cmi-metric-num cmi-num--${d.ausenciasAula > 5 ? 'danger' : d.ausenciasAula > 0 ? 'warn' : 'ok'}">${d.ausenciasAula || 0}</div>
          <div class="cmi-metric-lbl">Ausencias de aula hoy</div>
        </div>
      </div>
      <div class="cmi-subsec">
        <div class="cmi-subsec-lbl">Top guardianes — trimestre actual</div>
        <table class="cmi-table"><thead><tr>
          <th class="cmi-th">Profesor</th><th class="cmi-th cmi-th--r">Guardias</th>
        </tr></thead><tbody>${top5Rows}</tbody></table>
      </div>
      <div class="cmi-subsec">
        <div class="cmi-subsec-lbl">Sustituciones por día — últimas 2 semanas</div>
        <div class="cmi-chart-wrap"><canvas id="chart-op"></canvas></div>
      </div>
    </div>`;
  }

  function _renderComedor(d) {
    const icons = { subiendo: '↑', bajando: '↓', estable: '→' };
    const tCls  = { subiendo: 'cmi-num--ok', bajando: 'cmi-num--danger', estable: '' };
    const absList = d.absentistas.length
      ? d.absentistas.slice(0, 5).map(a => `
          <div class="cmi-row-pill">
            <span>${_esc(a.nombre)}</span>
            <span class="cmi-pill cmi-pill--warn">${a.ausencias}d</span>
          </div>`).join('')
      : '<div class="cmi-empty-msg">Sin absentismo recurrente detectado</div>';

    return `<div class="cmi-card cmi-card--${d.semaforo}">
      <div class="cmi-card-hdr">
        <div class="cmi-ico cmi-ico--com"><i class="ti ti-tools-kitchen-2"></i></div>
        <div class="cmi-card-titles">
          <div class="cmi-dim-eyebrow">Dimensión 2</div>
          <div class="cmi-dim-name">Comedor</div>
        </div>
        <div class="cmi-sem cmi-sem--${d.semaforo}"></div>
      </div>
      <div class="cmi-metrics">
        <div class="cmi-metric">
          <div class="cmi-metric-num">${d.mediaAsistencia}%</div>
          <div class="cmi-metric-lbl">Asistencia media 30d</div>
        </div>
        <div class="cmi-metric">
          <div class="cmi-metric-num ${tCls[d.tendencia]}">${icons[d.tendencia]} ${_esc(d.tendencia)}</div>
          <div class="cmi-metric-lbl">Tendencia</div>
        </div>
        <div class="cmi-metric">
          <div class="cmi-metric-num">${d.media}<span class="cmi-metric-sub">/${d.totalAlumnos}</span></div>
          <div class="cmi-metric-lbl">Media diaria / total</div>
        </div>
      </div>
      <div class="cmi-subsec">
        <div class="cmi-subsec-lbl">Asistencia diaria — últimas 4 semanas</div>
        <div class="cmi-chart-wrap"><canvas id="chart-com"></canvas></div>
      </div>
      <div class="cmi-subsec">
        <div class="cmi-subsec-lbl">Absentismo recurrente (habituales con >5 días ausentes)</div>
        ${absList}
      </div>
    </div>`;
  }

  function _renderConvivencia(d) {
    const top3 = d.top3.length
      ? d.top3.map(([g, n]) => `
          <div class="cmi-row-pill">
            <span>${_esc(g)}</span>
            <span class="cmi-pill cmi-pill--danger">${n}</span>
          </div>`).join('')
      : '<div class="cmi-empty-msg">Sin grupos conflictivos este mes</div>';

    return `<div class="cmi-card cmi-card--${d.semaforo}">
      <div class="cmi-card-hdr">
        <div class="cmi-ico cmi-ico--conv"><i class="ti ti-alert-triangle"></i></div>
        <div class="cmi-card-titles">
          <div class="cmi-dim-eyebrow">Dimensión 3</div>
          <div class="cmi-dim-name">Convivencia</div>
        </div>
        <div class="cmi-sem cmi-sem--${d.semaforo}"></div>
      </div>
      <div class="cmi-metrics">
        <div class="cmi-metric">
          <div class="cmi-metric-num cmi-num--${d.abiertas > 5 ? 'danger' : d.abiertas > 2 ? 'warn' : 'ok'}">${d.abiertas}</div>
          <div class="cmi-metric-lbl">Abiertas este mes</div>
        </div>
        <div class="cmi-metric">
          <div class="cmi-metric-num">${d.cerradas}</div>
          <div class="cmi-metric-lbl">Cerradas</div>
        </div>
        <div class="cmi-metric">
          <div class="cmi-metric-num cmi-num--${d.muyGraves > 0 ? 'danger' : 'ok'}">${d.muyGraves}</div>
          <div class="cmi-metric-lbl">Muy graves</div>
        </div>
      </div>
      <div class="cmi-subsec">
        <div class="cmi-subsec-lbl">Distribución por tipo</div>
        <div class="cmi-chart-wrap cmi-chart-wrap--sm"><canvas id="chart-conv"></canvas></div>
      </div>
      <div class="cmi-subsec">
        <div class="cmi-subsec-lbl">Grupos con más incidencias — top 3</div>
        ${top3}
      </div>
    </div>`;
  }

  function _renderAlertas(alertas) {
    const total = alertas.length;
    const sem = total > 3 ? 'danger' : total > 0 ? 'warn' : 'ok';

    const filas = alertas.map(a => {
      const conds = [
        a.condicion_a ? '<span class="cmi-cond">🍽️ Comedor</span>' : '',
        a.condicion_b ? '<span class="cmi-cond">🔄 Inestabilidad</span>' : '',
        a.condicion_c ? '<span class="cmi-cond">⚠️ Incidencias</span>' : '',
      ].filter(Boolean).join('');

      return `<div class="cmi-alerta cmi-alerta--${_esc(a.nivel)}">
        <div class="cmi-alerta-body">
          <div class="cmi-alerta-name">${_esc(a.alumno.nombre)}</div>
          <div class="cmi-alerta-meta">
            <span class="cmi-pill cmi-pill--muted">${_esc(a.alumno.grupo_horario)}</span>
            <span class="cmi-nivel cmi-nivel--${_esc(a.nivel)}">${a.nivel.toUpperCase()}</span>
            <span class="cmi-dias">${a.diasDesde}d</span>
          </div>
          <div class="cmi-conds-wrap">${conds}</div>
        </div>
        <div class="cmi-alerta-btns">
          <button class="btn btn-s" onclick="analyticsVerHistorial('${escArg(a.alumno.nombre)}')">Historial</button>
          <button class="btn btn-s cmi-btn-resolve" onclick="analyticsResolverAlerta('${escArg(a.id)}', this)">✓ Resolver</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="cmi-card cmi-card--full cmi-card--${sem}">
      <div class="cmi-card-hdr">
        <div class="cmi-ico cmi-ico--alert"><i class="ti ti-radar"></i></div>
        <div class="cmi-card-titles" style="flex:1">
          <div class="cmi-dim-eyebrow">Dimensión 4</div>
          <div class="cmi-dim-name">Alertas Tempranas
            ${total > 0 ? `<span class="cmi-badge-n cmi-badge-n--danger">${total}</span>` : ''}
          </div>
        </div>
        <div class="cmi-sem cmi-sem--${sem}"></div>
        <button class="btn btn-s" onclick="analyticsEjecutarAlertas(this)">
          <i class="ti ti-player-play"></i> Analizar ahora
        </button>
      </div>
      ${total === 0
        ? '<div class="cmi-empty-msg cmi-empty-msg--lg"><i class="ti ti-circle-check" style="color:var(--success)"></i> Sin alertas activas. El análisis detecta riesgo combinando asistencia al comedor, inestabilidad docente e incidencias.</div>'
        : `<div class="cmi-alertas-list">${filas}</div>`}
    </div>`;
  }

  function _renderMulticentro(datos) {
    if (!datos || !datos.length) return '';
    const semEmoji = { ok: '🟢', warn: '🟡', danger: '🔴' };
    const tot = datos.reduce((t, c) => ({
      alumnos: t.alumnos + c.alumnos, sust: t.sust + c.sust, inc: t.inc + c.inc,
      comensales: t.comensales + c.comensales, usuarios: t.usuarios + c.usuarios, alertas: t.alertas + c.alertas,
    }), { alumnos: 0, sust: 0, inc: 0, comensales: 0, usuarios: 0, alertas: 0 });

    const rows = datos.map(c => `<tr>
      <td class="cmi-td">${_esc(c.nombre)} ${semEmoji[c.semaforo]}</td>
      <td class="cmi-td cmi-td--r">${c.alumnos}</td>
      <td class="cmi-td cmi-td--r">${c.sust > 0 ? `<span class="cmi-badge-n cmi-badge-n--warn">${c.sust}</span>` : '0'}</td>
      <td class="cmi-td cmi-td--r">${c.inc}</td>
      <td class="cmi-td cmi-td--r">${c.comensales}</td>
      <td class="cmi-td cmi-td--r">${c.usuarios}</td>
      <td class="cmi-td cmi-td--r">${c.alertas > 0 ? `<span class="cmi-badge-n cmi-badge-n--danger">${c.alertas}</span>` : '0'}</td>
    </tr>`).join('');

    return `<div class="cmi-multicentro">
      <div class="cmi-subsec-lbl" style="margin-bottom:10px">Vista multicentro · ${datos.length} centros</div>
      <table class="cmi-table">
        <thead><tr>
          <th class="cmi-th">Centro</th>
          <th class="cmi-th cmi-th--r">Alumnos</th>
          <th class="cmi-th cmi-th--r">Sust. pend. hoy</th>
          <th class="cmi-th cmi-th--r">Incid. abiertas</th>
          <th class="cmi-th cmi-th--r">Comensales hoy</th>
          <th class="cmi-th cmi-th--r">Usuarios</th>
          <th class="cmi-th cmi-th--r">Alertas</th>
        </tr></thead>
        <tbody>${rows}
          <tr style="border-top:2px solid var(--bdr);">
            <td class="cmi-td"><strong>TOTAL (${datos.length})</strong></td>
            <td class="cmi-td cmi-td--r"><strong>${tot.alumnos}</strong></td>
            <td class="cmi-td cmi-td--r"><strong>${tot.sust}</strong></td>
            <td class="cmi-td cmi-td--r"><strong>${tot.inc}</strong></td>
            <td class="cmi-td cmi-td--r"><strong>${tot.comensales}</strong></td>
            <td class="cmi-td cmi-td--r"><strong>${tot.usuarios}</strong></td>
            <td class="cmi-td cmi-td--r"><strong>${tot.alertas}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  /* ══════════════════════════════════════════
     CHARTS
  ══════════════════════════════════════════ */

  function _initCharts(op, com, conv) {
    if (typeof Chart === 'undefined') return;

    const GRID_COLOR = '#E6E3DC';
    const TICK_FONT  = { size: 10, family: 'var(--font-ui, DM Sans)' };
    const TICK_COLOR = '#787F93';
    const baseOpts = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, boxWidth: 12, color: TICK_COLOR } } },
    };

    /* Chart 1 — Operativa: barras apiladas por día */
    const c1 = document.getElementById('chart-op');
    if (c1) {
      _s.charts.op = new Chart(c1, {
        type: 'bar',
        data: {
          labels: op.chartLabels,
          datasets: [
            { label: 'Cubiertas',  data: op.chartCubiertas,  backgroundColor: '#3F9367', borderRadius: 3 },
            { label: 'Pendientes', data: op.chartPendientes, backgroundColor: '#C24D2F', borderRadius: 3 },
          ],
        },
        options: Object.assign({}, baseOpts, {
          scales: {
            x: { stacked: true, ticks: { font: TICK_FONT, color: TICK_COLOR }, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: TICK_FONT, color: TICK_COLOR }, grid: { color: GRID_COLOR } },
          },
        }),
      });
    }

    /* Chart 2 — Comedor: línea */
    const c2 = document.getElementById('chart-com');
    if (c2) {
      _s.charts.com = new Chart(c2, {
        type: 'line',
        data: {
          labels: com.chartLabels,
          datasets: [{
            label: 'Alumnos en comedor', data: com.chartData,
            borderColor: '#4D6FA8', backgroundColor: 'rgba(77,111,168,0.1)',
            borderWidth: 2, pointRadius: 2, fill: true, tension: 0.35,
          }],
        },
        options: Object.assign({}, baseOpts, {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { font: TICK_FONT, color: TICK_COLOR }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { font: TICK_FONT, color: TICK_COLOR }, grid: { color: GRID_COLOR } },
          },
        }),
      });
    }

    /* Chart 3 — Convivencia: dona */
    const c3 = document.getElementById('chart-conv');
    if (c3 && conv.tipoLabels.length) {
      const COLORS = ['#4D6FA8', '#C76B3D', '#3F9367', '#D69540', '#C24D2F', '#787F93'];
      _s.charts.conv = new Chart(c3, {
        type: 'doughnut',
        data: {
          labels: conv.tipoLabels,
          datasets: [{ data: conv.tipoCounts, backgroundColor: COLORS.slice(0, conv.tipoLabels.length), borderWidth: 1 }],
        },
        options: Object.assign({}, baseOpts, {
          plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12, color: TICK_COLOR } } },
        }),
      });
    }
  }

  /* ══════════════════════════════════════════
     MAIN RENDER
  ══════════════════════════════════════════ */

  async function _render() {
    _destroyCharts();
    const container = document.getElementById('analytics-container');
    if (!container) return;

    const isSuper = (typeof role !== 'undefined' && role === 'superadmin');

    container.innerHTML = `
      <div class="cmi-hdr">
        <div>
          <div class="card-eyebrow" style="margin-bottom:4px">Análisis</div>
          <h2 class="cmi-title">Cuadro de Mando Integral</h2>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${isSuper ? '<button class="btn btn-s" onclick="analyticsExportPDF()"><i class="ti ti-file-type-pdf"></i> PDF</button>' : ''}
          <button class="btn btn-s" onclick="initAnalyticsPanel()"><i class="ti ti-refresh"></i> Actualizar</button>
        </div>
      </div>
      <div id="cmi-mc-wrap"></div>
      <div class="cmi-grid" id="cmi-grid">
        ${_skeleton()}${_skeleton()}${_skeleton()}${_skeleton()}
      </div>`;

    /* Fetch todo en paralelo */
    const [opData, comData, convData, alertData, mcData] = await Promise.all([
      _fetchOperativa().catch(() => ({ pct: 0, cubiertas: 0, pendientes: 0, total: 0, ausentes: 0, ausenciasAula: 0, top5: [], chartLabels: [], chartCubiertas: [], chartPendientes: [], semaforo: 'ok' })),
      _fetchComedor().catch(() => ({ mediaAsistencia: 0, media: 0, totalAlumnos: 0, tendencia: 'estable', absentistas: [], chartLabels: [], chartData: [], semaforo: 'ok' })),
      _fetchConvivencia().catch(() => ({ abiertas: 0, cerradas: 0, total: 0, leves: 0, graves: 0, muyGraves: 0, top3: [], tipoLabels: [], tipoCounts: [], semaforo: 'ok' })),
      _fetchAlertas().catch(() => []),
      isSuper ? _fetchMulticentro().catch(() => []) : Promise.resolve(null),
    ]);

    _s.lastOp = opData;
    _s.lastCom = comData;
    _s.lastConv = convData;

    if (mcData) {
      const mcWrap = document.getElementById('cmi-mc-wrap');
      if (mcWrap) mcWrap.innerHTML = _renderMulticentro(mcData);
    }

    const grid = document.getElementById('cmi-grid');
    if (!grid) return;
    grid.innerHTML = `
      ${_renderOperativa(opData)}
      ${_renderComedor(comData)}
      ${_renderConvivencia(convData)}
      ${_renderAlertas(alertData)}
    `;

    requestAnimationFrame(() => _initCharts(opData, comData, convData));
  }

  /* ══════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════ */

  window.initAnalyticsPanel = async function () {
    if (typeof sb === 'undefined' || !sb) return;
    const isSuper = (typeof role !== 'undefined' && role === 'superadmin');
    if (!isSuper && (typeof ctrId === 'undefined' || !ctrId)) return;
    try { await _render(); } catch (err) { console.error('[Analytics]', err); }
  };

  window.analyticsResolverAlerta = async function (id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const { error } = await sb.from('alertas_predictivas').update({ resuelta: true }).eq('id', id);
    if (!error) {
      const row = btn && btn.closest('.cmi-alerta');
      if (row) row.remove();
      const badge = document.querySelector('.cmi-dim-name .cmi-badge-n--danger');
      if (badge) {
        const n = parseInt(badge.textContent) - 1;
        n <= 0 ? badge.remove() : (badge.textContent = n);
      }
    } else if (btn) {
      btn.disabled = false; btn.textContent = '✓ Resolver';
    }
  };

  window.analyticsVerHistorial = function (nombre) {
    showTab('incidencias');
    setTimeout(() => {
      const inp = document.getElementById('inc-search-alumno') || document.getElementById('inc-busq');
      if (inp) { inp.value = nombre; inp.dispatchEvent(new Event('input')); }
    }, 400);
  };

  window.analyticsEjecutarAlertas = async function (btn) {
    if (typeof ctrId === 'undefined' || !ctrId) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Analizando…'; }
    try {
      const { data, error } = await sb.functions.invoke('alerta-psicosocial', { body: { centro_id: ctrId } });
      if (!error) {
        const n = data && data.alertas_creadas !== undefined ? data.alertas_creadas : '?';
        alert(`Análisis completado. ${n} nueva(s) alerta(s) detectada(s).`);
        initAnalyticsPanel();
      } else {
        alert('Error al ejecutar el análisis: ' + (error.message || JSON.stringify(error)));
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Analizar ahora'; }
    }
  };

  window.analyticsExportPDF = async function () {
    /* Cargar jsPDF bajo demanda */
    if (typeof window.jspdf === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const hoy = new Date().toLocaleDateString('es-ES');
    const centro = (typeof ctrName !== 'undefined' ? ctrName : '') || '—';

    doc.setFontSize(18); doc.setTextColor(31, 44, 79);
    doc.text('Cuadro de Mando Integral — DidactIA', 14, 20);
    doc.setFontSize(10); doc.setTextColor(120, 127, 147);
    doc.text(`Centro: ${centro}  ·  Generado: ${hoy}`, 14, 28);

    let y = 38;
    const section = (title, lines) => {
      doc.setFontSize(12); doc.setTextColor(31, 44, 79); doc.text(title, 14, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      lines.forEach(l => { doc.text(l, 20, y); y += 5; });
      y += 4;
    };

    if (_s.lastOp)  section('Dimensión 1 — Operativa', [`Sustituciones cubiertas: ${_s.lastOp.pct}%`, `Pendientes esta semana: ${_s.lastOp.pendientes}`, `Profesores ausentes hoy: ${_s.lastOp.ausentes}`]);
    if (_s.lastCom) section('Dimensión 2 — Comedor', [`Asistencia media 30d: ${_s.lastCom.mediaAsistencia}%`, `Tendencia: ${_s.lastCom.tendencia}`, `Media diaria: ${_s.lastCom.media} / ${_s.lastCom.totalAlumnos}`]);
    if (_s.lastConv) section('Dimensión 3 — Convivencia', [`Incidencias abiertas: ${_s.lastConv.abiertas}`, `Cerradas este mes: ${_s.lastConv.cerradas}`, `Muy graves: ${_s.lastConv.muyGraves}`]);

    /* Embed charts */
    [['op', 'Operativa'], ['com', 'Comedor'], ['conv', 'Convivencia']].forEach(([key, label]) => {
      const ch = _s.charts[key];
      if (!ch) return;
      try {
        if (y + 50 > 270) { doc.addPage(); y = 14; }
        doc.setFontSize(10); doc.setTextColor(120, 127, 147);
        doc.text(`Gráfica — ${label}`, 14, y); y += 4;
        doc.addImage(ch.toBase64Image(), 'PNG', 14, y, 120, 45);
        y += 50;
      } catch (_) {}
    });

    doc.save(`CMI-DidactIA-${_hoy()}.pdf`);
  };

})();
