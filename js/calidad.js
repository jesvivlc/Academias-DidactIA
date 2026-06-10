// ── MÓDULO CALIDAD ──
// Dashboard: métricas NC/CAPA/feedback, listas rápidas, navegación a secciones.
// Tablas: no_conformidades, acciones_capa, feedback_familias, documentos_calidad,
//         plantillas_calidad, evaluaciones_platinum (ver calidad_base.sql).
// Todo filtrado por ctrId (RLS + query explícita).

let _calSeccion = 'dashboard';

function _calEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _calToast(msg, color) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' +
    (color || 'var(--ink)') +
    ';color:#fff;padding:10px 18px;border-radius:var(--r-sm);font-size:13px;' +
    'z-index:9999;box-shadow:var(--sh-lg);max-width:320px;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function _calFmtFecha(d) {
  if (!d) return '—';
  try {
    return new Date(String(d).length <= 10 ? d + 'T12:00:00' : d)
      .toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch (e) { return String(d); }
}

const _CAL_PRIO = {
  critica: ['var(--danger)',  'var(--danger-soft)',  '🔴 Crítica'],
  alta:    ['var(--warning)', 'var(--warning-soft)', '🟠 Alta'],
  media:   ['var(--info)',    'var(--info-soft)',    '🔵 Media'],
  baja:    ['var(--success)', 'var(--success-soft)', '🟢 Baja']
};

const _CAL_EST_NC = {
  abierta:        ['var(--danger)',  'var(--danger-soft)',  'Abierta'],
  en_analisis:    ['var(--warning)', 'var(--warning-soft)', 'En análisis'],
  capa_ejecutada: ['var(--info)',    'var(--info-soft)',    'CAPA ejecutada'],
  cerrada:        ['var(--success)', 'var(--success-soft)', 'Cerrada']
};

function _calBadge(label, color, bg) {
  return '<span style="background:' + bg + ';color:' + color +
    ';border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600;">' +
    _calEsc(label) + '</span>';
}

function _calSemaforo(n, verde, naranja) {
  if (n <= verde)   return 'var(--success)';
  if (n <= naranja) return 'var(--warning)';
  return 'var(--danger)';
}

function _calFondo(color) {
  return color === 'var(--success)' ? 'var(--success-soft)' :
         color === 'var(--warning)' ? 'var(--warning-soft)' :
         color === 'var(--danger)'  ? 'var(--danger-soft)'  :
         color === 'var(--info)'    ? 'var(--info-soft)'    : 'var(--srf)';
}

// ── ENTRY POINT ──────────────────────────────────────────────────────────────

async function initCalidad() {
  const c = document.getElementById('cal-container');
  if (!c) return;
  _calSeccion = 'dashboard';
  await _calRenderDashboard(c);
}
window.initCalidad = initCalidad;

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

async function _calRenderDashboard(c) {
  c.innerHTML =
    '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;">' +
    '<span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> Cargando…</div>';

  try {

  const hoy       = new Date().toISOString().slice(0, 10);
  const primerMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                      .toISOString().slice(0, 10);
  const en7d      = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // ── 5 counts en paralelo ──────────────────────────────────────────────────
  const [rNcAb, rNcCr, rFbPend, rDocs, rCapaVenc] = await Promise.all([
    sb.from('no_conformidades').select('id', { count:'exact', head:true })
      .eq('centro_id', ctrId).in('estado', ['abierta','en_analisis']),
    sb.from('no_conformidades').select('id', { count:'exact', head:true })
      .eq('centro_id', ctrId).eq('prioridad','critica').neq('estado','cerrada'),
    sb.from('feedback_familias').select('id', { count:'exact', head:true })
      .eq('centro_id', ctrId).eq('estado','pendiente'),
    sb.from('documentos_calidad').select('id', { count:'exact', head:true })
      .eq('centro_id', ctrId).gte('created_at', primerMes),
    sb.from('acciones_capa').select('id', { count:'exact', head:true })
      .eq('centro_id', ctrId).lt('fecha_objetivo', hoy).is('es_eficaz', null)
  ]);

  // ── 3 listas en paralelo (segunda oleada, sin bloquear los counts) ─────────
  const [rUltNc, rFbSinResp, rCapaProx] = await Promise.all([
    sb.from('no_conformidades')
      .select('id,proceso_categoria,descripcion_raw,estado,prioridad,reported_at')
      .eq('centro_id', ctrId).order('created_at', { ascending:false }).limit(5),
    sb.from('feedback_familias')
      .select('id,canal,texto_raw,requiere_accion,created_at')
      .eq('centro_id', ctrId).eq('estado','pendiente')
      .order('created_at', { ascending:true }).limit(5),
    sb.from('acciones_capa')
      .select('id,plan_accion,fecha_objetivo')
      .eq('centro_id', ctrId).is('es_eficaz', null)
      .gte('fecha_objetivo', hoy).lte('fecha_objetivo', en7d)
      .order('fecha_objetivo', { ascending:true }).limit(5)
  ]);

  const ncAb      = rNcAb.count    || 0;
  const ncCr      = rNcCr.count    || 0;
  const fbPend    = rFbPend.count  || 0;
  const docs      = rDocs.count    || 0;
  const capaVenc  = rCapaVenc.count || 0;
  const ultNc     = rUltNc.data    || [];
  const fbSinResp = rFbSinResp.data || [];
  const capaProx  = rCapaProx.data  || [];

  // ── Helpers de render ────────────────────────────────────────────────────

  const metrica = (icon, label, val, color) =>
    '<div style="background:' + _calFondo(color) + ';border-radius:var(--r);padding:18px 20px;' +
    'display:flex;align-items:center;gap:14px;">' +
      '<div style="font-size:26px;flex-shrink:0;">' + icon + '</div>' +
      '<div>' +
        '<div style="font-size:28px;font-weight:700;color:' + color + ';line-height:1.1;">' + val + '</div>' +
        '<div style="font-size:12px;color:var(--txt2);margin-top:2px;">' + _calEsc(label) + '</div>' +
      '</div>' +
    '</div>';

  const seccBtn = (tab, icon, label, color) =>
    '<button onclick="window._calIrSeccion(\'' + tab + '\')" ' +
    'style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px 18px;' +
    'cursor:pointer;font-size:13px;font-weight:600;color:' + color + ';text-align:left;' +
    'display:flex;align-items:center;gap:10px;">' +
      icon + ' ' + _calEsc(label) +
    '</button>';

  const listaTitle = (t) =>
    '<div style="font-size:13px;font-weight:600;color:var(--txt);margin-bottom:10px;">' + t + '</div>';

  const fila = (celdas) =>
    '<tr style="border-bottom:1px solid var(--bdr);">' +
    celdas.map(h => '<td style="padding:8px 10px;font-size:12px;vertical-align:middle;">' + h + '</td>').join('') +
    '</tr>';

  const truncar = (s, n) => {
    const str = s || '';
    return _calEsc(str.slice(0, n) + (str.length > n ? '…' : ''));
  };

  // ── Tabla NCs ──────────────────────────────────────────────────────────────

  const listaNC = ultNc.length === 0
    ? '<div style="text-align:center;color:var(--txt3);padding:20px;font-size:13px;">🎉 Sin no conformidades recientes</div>'
    : '<table style="width:100%;border-collapse:collapse;">' +
        ultNc.map(nc => {
          const ep = _CAL_EST_NC[nc.estado] || ['var(--txt2)','var(--srf2)', nc.estado];
          const pp = _CAL_PRIO[nc.prioridad] || ['var(--txt2)','var(--srf2)', nc.prioridad || '—'];
          return fila([
            _calBadge(pp[2], pp[0], pp[1]),
            '<span style="color:var(--txt);">' + truncar(nc.descripcion_raw, 60) + '</span>',
            _calEsc(nc.proceso_categoria || '—'),
            _calBadge(ep[2], ep[0], ep[1]),
            '<span style="color:var(--txt3);">' + _calFmtFecha(nc.reported_at) + '</span>'
          ]);
        }).join('') +
      '</table>';

  // ── Tabla Feedback ─────────────────────────────────────────────────────────

  const listaFb = fbSinResp.length === 0
    ? '<div style="text-align:center;color:var(--txt3);padding:20px;font-size:13px;">✅ Sin quejas pendientes</div>'
    : '<table style="width:100%;border-collapse:collapse;">' +
        fbSinResp.map(fb =>
          fila([
            fb.requiere_accion
              ? '<span style="color:var(--danger);font-size:11px;font-weight:600;">⚡ Urgente</span>'
              : '<span style="color:var(--txt3);">' + _calEsc(fb.canal || '') + '</span>',
            '<span style="color:var(--txt);">' + truncar(fb.texto_raw, 70) + '</span>',
            '<span style="color:var(--txt3);">' + _calFmtFecha(fb.created_at) + '</span>'
          ])
        ).join('') +
      '</table>';

  // ── Tabla CAPA ─────────────────────────────────────────────────────────────

  const listaCapa = capaProx.length === 0
    ? '<div style="text-align:center;color:var(--txt3);padding:20px;font-size:13px;">✅ Sin acciones CAPA por vencer esta semana</div>'
    : '<table style="width:100%;border-collapse:collapse;">' +
        capaProx.map(a => {
          const dias = Math.ceil((new Date(a.fecha_objetivo) - new Date(hoy)) / 86400000);
          const dc = dias <= 2 ? 'var(--danger)' : 'var(--warning)';
          return fila([
            '<span style="color:' + dc + ';font-weight:700;">' + dias + 'd</span>',
            '<span style="color:var(--txt);">' + truncar(a.plan_accion || 'Sin descripción', 70) + '</span>',
            '<span style="color:var(--txt3);">' + _calFmtFecha(a.fecha_objetivo) + '</span>'
          ]);
        }).join('') +
      '</table>';

  // ── Render final ──────────────────────────────────────────────────────────

  c.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:10px;">' +
      '<div>' +
        '<div style="font-size:20px;font-weight:700;color:var(--txt);">⭐ Calidad</div>' +
        '<div style="font-size:12px;color:var(--txt3);">No conformidades, feedback y mejora continua</div>' +
      '</div>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:24px;">' +
      metrica('📋', 'NCs abiertas',        ncAb,     _calSemaforo(ncAb, 0, 3))   +
      metrica('🔴', 'NCs críticas',        ncCr,     ncCr > 0 ? 'var(--danger)' : 'var(--success)') +
      metrica('💬', 'Quejas pendientes',   fbPend,   _calSemaforo(fbPend, 0, 5)) +
      metrica('📄', 'Documentos este mes', docs,     'var(--info)')               +
      metrica('⏰', 'CAPA vencidas',       capaVenc, capaVenc > 0 ? 'var(--danger)' : 'var(--success)') +
    '</div>' +

    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:28px;">' +
      seccBtn('nc',       '📋', 'No Conformidades',  'var(--danger)')  +
      seccBtn('feedback', '💬', 'Feedback Familias', 'var(--info)')    +
      seccBtn('docs',     '🎙️', 'Documentos',       'var(--accent)')  +
      seccBtn('platinum', '⭐', 'Platinum Standard', 'var(--warning)') +
    '</div>' +

    '<div style="display:grid;grid-template-columns:1fr;gap:18px;">' +

      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px;">' +
        listaTitle('📋 Últimas no conformidades') + listaNC +
      '</div>' +

      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px;">' +
        listaTitle('💬 Quejas sin responder (más antiguas)') + listaFb +
      '</div>' +

      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px;">' +
        listaTitle('⏰ CAPA próximas a vencer (7 días)') + listaCapa +
      '</div>' +

    '</div>';

  } catch (err) {
    console.error('[Calidad] error en _calRenderDashboard:', err);
    c.innerHTML =
      '<div style="background:var(--danger-soft);border:1px solid var(--danger);border-radius:var(--r);' +
      'padding:20px;color:var(--danger);font-size:13px;">' +
      '<strong>Error al cargar el módulo Calidad</strong><br>' +
      '<code style="font-size:11px;word-break:break-all;">' + _calEsc(String(err)) + '</code><br>' +
      '<button onclick="initCalidad()" style="margin-top:12px;padding:6px 14px;background:var(--danger);' +
      'color:#fff;border:none;border-radius:var(--r-sm);cursor:pointer;font-size:12px;">Reintentar</button>' +
      '</div>';
  }
}

// ── SECCIONES (placeholder — se implementan en sprints siguientes) ─────────────

window._calIrSeccion = function (seccion) {
  const c = document.getElementById('cal-container');
  if (!c) return;
  _calSeccion = seccion;

  const LABELS = {
    nc:       ['📋', 'No Conformidades'],
    feedback: ['💬', 'Feedback Familias'],
    docs:     ['🎙️', 'Documentos'],
    platinum: ['⭐', 'Platinum Standard']
  };
  const meta = LABELS[seccion] || ['📄', seccion];

  c.innerHTML =
    '<div style="margin-bottom:20px;">' +
      '<button onclick="initCalidad()" style="background:none;border:none;cursor:pointer;' +
        'color:var(--ink);font-size:13px;font-weight:500;padding:0;display:flex;align-items:center;gap:6px;">' +
        '← Volver al dashboard' +
      '</button>' +
    '</div>' +
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);' +
      'padding:40px;text-align:center;">' +
      '<div style="font-size:36px;margin-bottom:12px;">' + meta[0] + '</div>' +
      '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:8px;">' +
        _calEsc(meta[1]) +
      '</div>' +
      '<div style="font-size:13px;color:var(--txt3);">Esta sección se implementará en el próximo sprint.</div>' +
    '</div>';
};
