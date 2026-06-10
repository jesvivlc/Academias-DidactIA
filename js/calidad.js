// ── MÓDULO CALIDAD ──
// Tablas: no_conformidades, acciones_capa, feedback_familias, documentos_calidad,
//         plantillas_calidad, evaluaciones_platinum (ver calidad_base.sql).
// Todo filtrado por ctrId (RLS + query explícita).

let _calSeccion = 'dashboard';
let _calNcFiltros = { estado:'', prioridad:'', categoria:'' };
let _calFbFiltros = { estado:'', sentimiento:'' };
let _calSR = null;

// ── UTILIDADES ────────────────────────────────────────────────────────────────

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

const _CAL_EST_FB = {
  pendiente:  ['var(--danger)',  'var(--danger-soft)',  'Pendiente'],
  en_gestion: ['var(--warning)', 'var(--warning-soft)', 'En gestión'],
  resuelto:   ['var(--success)', 'var(--success-soft)', 'Resuelto']
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

function _calSentiEmoji(s) {
  if (s == null) return '—';
  const n = parseFloat(s);
  if (n > 0.3)  return '😊';
  if (n < -0.3) return '😤';
  return '😐';
}

function _calParseJson(txt) {
  if (!txt) return null;
  try {
    const clean = txt.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    return JSON.parse(clean);
  } catch (e) { return null; }
}

function _calSpinner() {
  return '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:40px;">' +
    '<span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> Cargando…</div>';
}

// ── BOTONES VOLVER ────────────────────────────────────────────────────────────

function _calBtnVolver() {
  return '<div style="margin-bottom:20px;"><button onclick="initCalidad()" style="background:none;border:none;cursor:pointer;color:var(--ink);font-size:13px;font-weight:500;padding:0;display:flex;align-items:center;gap:6px;">← Volver al dashboard</button></div>';
}
function _calBtnVolverNC() {
  return '<div style="margin-bottom:20px;"><button onclick="window._calIrSeccion(\'nc\')" style="background:none;border:none;cursor:pointer;color:var(--ink);font-size:13px;font-weight:500;padding:0;display:flex;align-items:center;gap:6px;">← Volver a No Conformidades</button></div>';
}
function _calBtnVolverFB() {
  return '<div style="margin-bottom:20px;"><button onclick="window._calIrSeccion(\'feedback\')" style="background:none;border:none;cursor:pointer;color:var(--ink);font-size:13px;font-weight:500;padding:0;display:flex;align-items:center;gap:6px;">← Volver a Feedback Familias</button></div>';
}

// ── IA HELPER ─────────────────────────────────────────────────────────────────

async function _calGemini(systemPrompt, userMsg) {
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+ANON_KEY, 'apikey':ANON_KEY },
      body: JSON.stringify({
        contents: [{ role:'user', parts:[{ text: userMsg }] }],
        system_prompt: systemPrompt,
        centro_id: ctrId || '',
        role: (typeof role !== 'undefined' ? role : 'admin'),
        user_name: (typeof currentUserName !== 'undefined' ? currentUserName : ''),
        user_id: (currentUser ? currentUser.id : '')
      })
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.type === 'text' ? j.text : null;
  } catch (e) { return null; }
}

// ── VOZ ───────────────────────────────────────────────────────────────────────

window._calIniciarVoz = function(taId, btnId, onStop) {
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { _calToast('Reconocimiento de voz no disponible en este navegador', 'var(--warning)'); return; }
    const btn = document.getElementById(btnId);
    const ta  = document.getElementById(taId);
    if (_calSR) { _calSR.stop(); return; }
    _calSR = new SR();
    _calSR.lang = 'es-ES';
    _calSR.continuous = true;
    _calSR.interimResults = false;
    _calSR.onresult = function(e) {
      let txt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) txt += e.results[i][0].transcript + ' ';
      }
      if (ta) ta.value += txt;
    };
    _calSR.onerror = function() { _calSR = null; if (btn) btn.textContent = '🎙️ Dictar por voz'; };
    _calSR.onend   = function() {
      _calSR = null;
      if (btn) btn.textContent = '🎙️ Dictar por voz';
      if (typeof onStop === 'function') onStop();
    };
    _calSR.start();
    if (btn) btn.textContent = '⏹️ Detener';
  } catch (e) { _calToast('Error al iniciar el micrófono: ' + e.message, 'var(--danger)'); }
};

// ── MODALES — HELPER ──────────────────────────────────────────────────────────

window._calModalCerrar = function(id) {
  const m = document.getElementById(id);
  if (m) m.remove();
};

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

async function initCalidad() {
  const c = document.getElementById('calidad-cont');
  if (!c) return;
  _calSeccion = 'dashboard';
  _calNcFiltros = { estado:'', prioridad:'', categoria:'' };
  _calFbFiltros = { estado:'', sentimiento:'' };
  await _calRenderDashboard(c);
}
window.initCalidad = initCalidad;

// ── ROUTER ────────────────────────────────────────────────────────────────────

window._calIrSeccion = async function(seccion) {
  const c = document.getElementById('calidad-cont');
  if (!c) return;
  _calSeccion = seccion;
  if (seccion === 'nc')       { await _calRenderNC(c); return; }
  if (seccion === 'feedback') { await _calRenderFeedback(c); return; }
  const LABELS = { docs:['🎙️','Documentos'], platinum:['⭐','Platinum Standard'] };
  const meta = LABELS[seccion] || ['📄', seccion];
  c.innerHTML = _calBtnVolver() +
    '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:40px;text-align:center;">' +
      '<div style="font-size:36px;margin-bottom:12px;">' + meta[0] + '</div>' +
      '<div style="font-size:16px;font-weight:600;color:var(--txt);margin-bottom:8px;">' + _calEsc(meta[1]) + '</div>' +
      '<div style="font-size:13px;color:var(--txt3);">Esta sección se implementará próximamente.</div>' +
    '</div>';
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

async function _calRenderDashboard(c) {
  c.innerHTML = _calSpinner();

  let centroId = ctrId;
  if (!centroId) {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: prof } = await sb.from('profiles').select('centro_id').eq('id', user.id).single();
        centroId = prof && prof.centro_id;
      }
    } catch (e) { /* silencioso */ }
  }

  if (!centroId) {
    c.innerHTML = '<div style="background:var(--warning-soft);border:1px solid var(--warning);border-radius:var(--r);padding:20px;color:var(--warning);font-size:13px;">⚠️ No se pudo obtener el centro. Recarga la página.</div>';
    return;
  }

  try {
    const hoy       = new Date().toISOString().split('T')[0];
    const primerMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const en7d      = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const [nc, ncCrit, quejas, docs, capa] = await Promise.all([
      sb.from('no_conformidades').select('*',{count:'exact',head:true}).eq('centro_id',centroId).in('estado',['abierta','en_analisis']),
      sb.from('no_conformidades').select('*',{count:'exact',head:true}).eq('centro_id',centroId).eq('prioridad','critica').neq('estado','cerrada'),
      sb.from('feedback_familias').select('*',{count:'exact',head:true}).eq('centro_id',centroId).eq('estado','pendiente'),
      sb.from('documentos_calidad').select('*',{count:'exact',head:true}).eq('centro_id',centroId).gte('created_at',primerMes),
      sb.from('acciones_capa').select('*',{count:'exact',head:true}).eq('centro_id',centroId).lt('fecha_objetivo',hoy).is('es_eficaz',null)
    ]);

    const [rUltNc, rFbSinResp, rCapaProx] = await Promise.all([
      sb.from('no_conformidades').select('id,proceso_categoria,descripcion_raw,estado,prioridad,reported_at').eq('centro_id',centroId).order('created_at',{ascending:false}).limit(5),
      sb.from('feedback_familias').select('id,canal,texto_raw,requiere_accion,created_at').eq('centro_id',centroId).eq('estado','pendiente').order('created_at',{ascending:true}).limit(5),
      sb.from('acciones_capa').select('id,plan_accion,fecha_objetivo').eq('centro_id',centroId).is('es_eficaz',null).gte('fecha_objetivo',hoy).lte('fecha_objetivo',en7d).order('fecha_objetivo',{ascending:true}).limit(5)
    ]);

    const ncAb     = nc.count     || 0;
    const ncCr     = ncCrit.count || 0;
    const fbPend   = quejas.count || 0;
    const docsN    = docs.count   || 0;
    const capaVenc = capa.count   || 0;
    const ultNc    = rUltNc.data  || [];
    const fbList   = rFbSinResp.data || [];
    const capaProx = rCapaProx.data  || [];

    const metrica = (icon, label, val, color) =>
      '<div style="background:' + _calFondo(color) + ';border-radius:var(--r);padding:18px 20px;display:flex;align-items:center;gap:14px;">' +
        '<div style="font-size:26px;flex-shrink:0;">' + icon + '</div>' +
        '<div><div style="font-size:28px;font-weight:700;color:' + color + ';line-height:1.1;">' + val + '</div>' +
        '<div style="font-size:12px;color:var(--txt2);margin-top:2px;">' + _calEsc(label) + '</div></div></div>';

    const seccBtn = (tab, icon, label, color) =>
      '<button onclick="window._calIrSeccion(\'' + tab + '\')" style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:14px 18px;cursor:pointer;font-size:13px;font-weight:600;color:' + color + ';text-align:left;display:flex;align-items:center;gap:10px;">' + icon + ' ' + _calEsc(label) + '</button>';

    const listaTitle = (t) => '<div style="font-size:13px;font-weight:600;color:var(--txt);margin-bottom:10px;">' + t + '</div>';

    const fila = (celdas) => '<tr style="border-bottom:1px solid var(--bdr);">' +
      celdas.map(h => '<td style="padding:8px 10px;font-size:12px;vertical-align:middle;">' + h + '</td>').join('') + '</tr>';

    const truncar = (s, n) => { const str = s||''; return _calEsc(str.slice(0,n) + (str.length > n ? '…' : '')); };

    const listaNC = ultNc.length === 0
      ? '<div style="text-align:center;color:var(--txt3);padding:20px;font-size:13px;">🎉 Sin no conformidades recientes</div>'
      : '<table style="width:100%;border-collapse:collapse;">' +
          ultNc.map(row => {
            const ep = _CAL_EST_NC[row.estado] || ['var(--txt2)','var(--srf2)',row.estado];
            const pp = _CAL_PRIO[row.prioridad] || ['var(--txt2)','var(--srf2)',row.prioridad||'—'];
            return fila([_calBadge(pp[2],pp[0],pp[1]), '<span style="color:var(--txt);">' + truncar(row.descripcion_raw,60) + '</span>', _calEsc(row.proceso_categoria||'—'), _calBadge(ep[2],ep[0],ep[1]), '<span style="color:var(--txt3);">' + _calFmtFecha(row.reported_at) + '</span>']);
          }).join('') + '</table>';

    const listaFb = fbList.length === 0
      ? '<div style="text-align:center;color:var(--txt3);padding:20px;font-size:13px;">✅ Sin quejas pendientes</div>'
      : '<table style="width:100%;border-collapse:collapse;">' +
          fbList.map(fb => fila([
            fb.requiere_accion ? '<span style="color:var(--danger);font-size:11px;font-weight:600;">⚡ Urgente</span>' : '<span style="color:var(--txt3);">' + _calEsc(fb.canal||'') + '</span>',
            '<span style="color:var(--txt);">' + truncar(fb.texto_raw,70) + '</span>',
            '<span style="color:var(--txt3);">' + _calFmtFecha(fb.created_at) + '</span>'
          ])).join('') + '</table>';

    const listaCapa = capaProx.length === 0
      ? '<div style="text-align:center;color:var(--txt3);padding:20px;font-size:13px;">✅ Sin acciones CAPA por vencer esta semana</div>'
      : '<table style="width:100%;border-collapse:collapse;">' +
          capaProx.map(a => {
            const dias = Math.ceil((new Date(a.fecha_objetivo) - new Date(hoy)) / 86400000);
            const dc = dias <= 2 ? 'var(--danger)' : 'var(--warning)';
            return fila(['<span style="color:' + dc + ';font-weight:700;">' + dias + 'd</span>', '<span style="color:var(--txt);">' + truncar(a.plan_accion||'Sin descripción',70) + '</span>', '<span style="color:var(--txt3);">' + _calFmtFecha(a.fecha_objetivo) + '</span>']);
          }).join('') + '</table>';

    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:10px;">' +
        '<div><div style="font-size:20px;font-weight:700;color:var(--txt);">⭐ Calidad</div>' +
        '<div style="font-size:12px;color:var(--txt3);">No conformidades, feedback y mejora continua</div></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:24px;">' +
        metrica('📋','NCs abiertas',ncAb,_calSemaforo(ncAb,0,3)) +
        metrica('🔴','NCs críticas',ncCr,ncCr > 0 ? 'var(--danger)' : 'var(--success)') +
        metrica('💬','Quejas pendientes',fbPend,_calSemaforo(fbPend,0,5)) +
        metrica('📄','Documentos este mes',docsN,'var(--info)') +
        metrica('⏰','CAPA vencidas',capaVenc,capaVenc > 0 ? 'var(--danger)' : 'var(--success)') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:28px;">' +
        seccBtn('nc','📋','No Conformidades','var(--danger)') +
        seccBtn('feedback','💬','Feedback Familias','var(--info)') +
        seccBtn('docs','🎙️','Documentos','var(--accent)') +
        seccBtn('platinum','⭐','Platinum Standard','var(--warning)') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr;gap:18px;">' +
        '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px;">' + listaTitle('📋 Últimas no conformidades') + listaNC + '</div>' +
        '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px;">' + listaTitle('💬 Quejas sin responder (más antiguas)') + listaFb + '</div>' +
        '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:18px;">' + listaTitle('⏰ CAPA próximas a vencer (7 días)') + listaCapa + '</div>' +
      '</div>';

  } catch (err) {
    console.error('[Calidad] error en dashboard:', err);
    c.innerHTML =
      '<div style="background:var(--danger-soft);border:1px solid var(--danger);border-radius:var(--r);padding:20px;color:var(--danger);font-size:13px;">' +
      '<strong>Error al cargar el módulo Calidad</strong><br><code style="font-size:11px;word-break:break-all;">' + _calEsc(String(err)) + '</code><br>' +
      '<button onclick="initCalidad()" style="margin-top:12px;padding:6px 14px;background:var(--danger);color:#fff;border:none;border-radius:var(--r-sm);cursor:pointer;font-size:12px;">Reintentar</button></div>';
  }
}

// ── NO CONFORMIDADES — LISTA ──────────────────────────────────────────────────

async function _calRenderNC(c) {
  c.innerHTML = _calSpinner();
  try {
    let q = sb.from('no_conformidades')
      .select('id,proceso_categoria,descripcion_raw,estado,prioridad,reporter_id,created_at,reported_at')
      .eq('centro_id', ctrId).order('created_at',{ascending:false}).limit(200);
    if (_calNcFiltros.estado)    q = q.eq('estado', _calNcFiltros.estado);
    if (_calNcFiltros.prioridad) q = q.eq('prioridad', _calNcFiltros.prioridad);
    if (_calNcFiltros.categoria) q = q.eq('proceso_categoria', _calNcFiltros.categoria);

    const [rNcs, rAb, rCr] = await Promise.all([
      q,
      sb.from('no_conformidades').select('*',{count:'exact',head:true}).eq('centro_id',ctrId).in('estado',['abierta','en_analisis']),
      sb.from('no_conformidades').select('*',{count:'exact',head:true}).eq('centro_id',ctrId).eq('prioridad','critica').neq('estado','cerrada')
    ]);

    const PO = { critica:4, alta:3, media:2, baja:1 };
    const ncs = (rNcs.data||[]).sort((a,b) => {
      const pd = (PO[b.prioridad]||0) - (PO[a.prioridad]||0);
      return pd !== 0 ? pd : new Date(b.created_at) - new Date(a.created_at);
    });

    const ncAb = rAb.count || 0;
    const ncCr = rCr.count || 0;
    const ncIdStr = (row) => 'NC-' + new Date(row.created_at).getFullYear() + '-' + row.id.slice(0,6).toUpperCase();

    const filaNC = (row) => {
      const ep = _CAL_EST_NC[row.estado] || ['var(--txt2)','var(--srf2)',row.estado];
      const pp = _CAL_PRIO[row.prioridad] || ['var(--txt2)','var(--srf2)',row.prioridad||'—'];
      const desc = _calEsc((row.descripcion_raw||'').slice(0,80) + ((row.descripcion_raw||'').length > 80 ? '…' : ''));
      return '<tr style="border-bottom:1px solid var(--bdr);">' +
        '<td style="padding:8px 10px;font-size:11px;color:var(--txt3);white-space:nowrap;">' + _calEsc(ncIdStr(row)) + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;">' + _calFmtFecha(row.reported_at) + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;">' + _calEsc(row.proceso_categoria||'—') + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;max-width:260px;">' + desc + '</td>' +
        '<td style="padding:8px 10px;">' + _calBadge(pp[2],pp[0],pp[1]) + '</td>' +
        '<td style="padding:8px 10px;">' + _calBadge(ep[2],ep[0],ep[1]) + '</td>' +
        '<td style="padding:8px 10px;"><button onclick="window._calNcDetalle(\'' + row.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:4px 10px;font-size:12px;cursor:pointer;">Ver</button></td>' +
      '</tr>';
    };

    const tabla = ncs.length === 0
      ? '<div style="text-align:center;color:var(--txt3);padding:40px;font-size:13px;">🎉 Sin no conformidades con los filtros actuales</div>'
      : '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--srf2);">' +
          ['ID','Fecha','Categoría','Descripción','Prioridad','Estado','Acciones'].map(h => '<th style="padding:8px 10px;font-size:11px;text-align:left;color:var(--txt2);">' + h + '</th>').join('') +
          '</tr></thead><tbody>' + ncs.map(filaNC).join('') + '</tbody></table></div>';

    const selOpts = (vals, cur, ph) =>
      '<option value="">' + ph + '</option>' +
      vals.map(v => '<option value="' + v[0] + '"' + (cur===v[0]?' selected':'') + '>' + v[1] + '</option>').join('');

    c.innerHTML =
      _calBtnVolver() +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">' +
        '<div><div style="font-size:18px;font-weight:700;color:var(--txt);">📋 No Conformidades</div>' +
        '<div style="font-size:12px;color:var(--txt3);margin-top:3px;">' + ncAb + ' abiertas · ' + ncCr + ' críticas sin cerrar</div></div>' +
        '<button onclick="window._calNcNueva()" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600;">➕ Nueva NC</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">' +
        '<select onchange="window._calNcFiltrar(\'estado\',this.value)" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--srf);">' + selOpts([['abierta','Abierta'],['en_analisis','En análisis'],['capa_ejecutada','CAPA ejecutada'],['cerrada','Cerrada']],_calNcFiltros.estado,'Todos los estados') + '</select>' +
        '<select onchange="window._calNcFiltrar(\'prioridad\',this.value)" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--srf);">' + selOpts([['critica','🔴 Crítica'],['alta','🟠 Alta'],['media','🔵 Media'],['baja','🟢 Baja']],_calNcFiltros.prioridad,'Todas las prioridades') + '</select>' +
        '<select onchange="window._calNcFiltrar(\'categoria\',this.value)" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--srf);">' + selOpts([['docencia','Docencia'],['mantenimiento','Mantenimiento'],['comedor','Comedor'],['transporte','Transporte'],['convivencia','Convivencia'],['administracion','Administración'],['seguridad','Seguridad'],['general','General']],_calNcFiltros.categoria,'Todas las categorías') + '</select>' +
      '</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;">' + tabla + '</div>';

  } catch (err) {
    c.innerHTML = _calBtnVolver() + '<div style="background:var(--danger-soft);border:1px solid var(--danger);border-radius:var(--r);padding:20px;color:var(--danger);font-size:13px;"><strong>Error</strong><br><code>' + _calEsc(String(err)) + '</code></div>';
  }
}

window._calNcFiltrar = function(tipo, val) {
  _calNcFiltros[tipo] = val;
  const c = document.getElementById('calidad-cont');
  if (c) _calRenderNC(c);
};

// ── NO CONFORMIDADES — NUEVA NC ───────────────────────────────────────────────

window._calNcNueva = function() {
  window._calModalCerrar('cal-modal-nc');
  const m = document.createElement('div');
  m.id = 'cal-modal-nc';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';
  m.innerHTML =
    '<div style="background:var(--srf);border-radius:var(--r);width:100%;max-width:540px;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:var(--sh-lg);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<div style="font-size:16px;font-weight:700;color:var(--txt);">➕ Nueva No Conformidad</div>' +
        '<button onclick="window._calModalCerrar(\'cal-modal-nc\')" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--txt3);">✕</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:14px;">' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Categoría</label>' +
        '<select id="ncm-cat" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);">' +
          '<option value="general">General</option><option value="docencia">Docencia</option><option value="mantenimiento">Mantenimiento</option><option value="comedor">Comedor</option><option value="transporte">Transporte</option><option value="convivencia">Convivencia</option><option value="administracion">Administración</option><option value="seguridad">Seguridad</option>' +
        '</select></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Prioridad</label>' +
        '<select id="ncm-prio" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);">' +
          '<option value="media">🔵 Media</option><option value="baja">🟢 Baja</option><option value="alta">🟠 Alta</option><option value="critica">🔴 Crítica</option>' +
        '</select></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Descripción *</label>' +
        '<textarea id="ncm-desc" rows="5" placeholder="Describe la no conformidad con detalle (mín. 20 caracteres)..." onblur="window._calNcAnalizarIA()" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);resize:vertical;box-sizing:border-box;"></textarea>' +
        '<button id="ncm-voz-btn" onclick="window._calIniciarVoz(\'ncm-desc\',\'ncm-voz-btn\',window._calNcAnalizarIA)" style="margin-top:6px;background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:5px 12px;font-size:12px;cursor:pointer;">🎙️ Dictar por voz</button></div>' +
        '<div id="ncm-ia-note" style="display:none;background:var(--info-soft);border:1px solid var(--info);border-radius:var(--r-sm);padding:10px;font-size:12px;color:var(--info);">💡 Sugerido por IA — puedes cambiarlo.</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">' +
        '<button onclick="window._calModalCerrar(\'cal-modal-nc\')" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;">Cancelar</button>' +
        '<button id="ncm-guardar-btn" onclick="window._calNcGuardar()" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600;">💾 Guardar NC</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener('click', function(e) { if (e.target === m) window._calModalCerrar('cal-modal-nc'); });
};

window._calNcAnalizarIA = async function() {
  const ta = document.getElementById('ncm-desc');
  if (!ta || ta.value.trim().length < 20) return;
  const note = document.getElementById('ncm-ia-note');
  if (note) { note.style.display='block'; note.textContent='⏳ Analizando con IA…'; note.style.background='var(--warning-soft)'; note.style.borderColor='var(--warning)'; note.style.color='var(--warning)'; }
  try {
    const sys = 'Eres un coordinador de calidad escolar experto en ISO 9001. Analiza la descripción de una incidencia y devuelve SOLO un JSON con este formato exacto, sin explicaciones:\n{"categoria": string, "prioridad": string, "resumen": string}\nValores válidos para categoria: docencia, mantenimiento, comedor, transporte, convivencia, administracion, seguridad, general.\nValores válidos para prioridad: baja, media, alta, critica.\nresumen: máximo 15 palabras describiendo la incidencia.';
    const txt = await _calGemini(sys, 'Analiza esta incidencia: ' + ta.value.trim());
    const p = _calParseJson(txt);
    if (p) {
      const sc = document.getElementById('ncm-cat');
      const sp = document.getElementById('ncm-prio');
      if (sc && p.categoria) sc.value = p.categoria;
      if (sp && p.prioridad) sp.value = p.prioridad;
      if (note) { note.style.display='block'; note.textContent='💡 Sugerido por IA: "' + (p.resumen||'') + '" — puedes cambiarlo.'; note.style.background='var(--info-soft)'; note.style.borderColor='var(--info)'; note.style.color='var(--info)'; }
    } else if (note) { note.style.display='none'; }
  } catch (e) { if (note) note.style.display='none'; }
};

window._calNcGuardar = async function() {
  const ta   = document.getElementById('ncm-desc');
  const cat  = document.getElementById('ncm-cat');
  const prio = document.getElementById('ncm-prio');
  const btn  = document.getElementById('ncm-guardar-btn');
  if (!ta || !cat || !prio) return;
  const desc = ta.value.trim();
  if (desc.length < 20) { _calToast('La descripción debe tener al menos 20 caracteres', 'var(--warning)'); return; }
  if (btn) { btn.disabled=true; btn.textContent='⏳ Guardando…'; }
  try {
    const { error } = await sb.from('no_conformidades').insert({ centro_id:ctrId, reporter_id:currentUser?currentUser.id:null, proceso_categoria:cat.value, prioridad:prio.value, descripcion_raw:desc, estado:'abierta' });
    if (error) throw error;
    window._calModalCerrar('cal-modal-nc');
    _calToast('✅ No conformidad registrada', 'var(--success)');
    const c = document.getElementById('calidad-cont');
    if (c) await _calRenderNC(c);
  } catch (err) {
    _calToast('Error al guardar: ' + err.message, 'var(--danger)');
    if (btn) { btn.disabled=false; btn.textContent='💾 Guardar NC'; }
  }
};

// ── NO CONFORMIDADES — DETALLE ────────────────────────────────────────────────

window._calNcDetalle = async function(id) {
  const c = document.getElementById('calidad-cont');
  if (!c) return;
  c.innerHTML = _calSpinner();
  try {
    const [rNc, rCapa] = await Promise.all([
      sb.from('no_conformidades').select('*').eq('id',id).single(),
      sb.from('acciones_capa').select('*').eq('nc_id',id).order('created_at',{ascending:true})
    ]);
    if (rNc.error) throw rNc.error;
    const nc = rNc.data;
    const capas = rCapa.data || [];

    const ep = _CAL_EST_NC[nc.estado] || ['var(--txt2)','var(--srf2)',nc.estado];
    const pp = _CAL_PRIO[nc.prioridad] || ['var(--txt2)','var(--srf2)',nc.prioridad||'—'];
    const ncIdStr = 'NC-' + new Date(nc.created_at).getFullYear() + '-' + nc.id.slice(0,6).toUpperCase();
    const todasEficaces = capas.length > 0 && capas.every(a => a.es_eficaz === true);

    const renderCapas = () => {
      if (capas.length === 0) return '<div style="color:var(--txt3);font-size:13px;padding:12px 0;">Sin acciones CAPA registradas.</div>';
      return capas.map(a => {
        const eb = a.es_eficaz === true ? _calBadge('✓ Eficaz','var(--success)','var(--success-soft)') :
                   a.es_eficaz === false ? _calBadge('✗ No eficaz','var(--danger)','var(--danger-soft)') :
                   _calBadge('⏳ Pendiente','var(--warning)','var(--warning-soft)');
        return '<div style="background:var(--srf2);border-radius:var(--r-sm);padding:14px;margin-bottom:10px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">' +
            '<div style="flex:1;">' +
              '<div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:3px;">Causa raíz</div>' +
              '<div style="font-size:13px;color:var(--txt);margin-bottom:10px;">' + _calEsc(a.causa_raiz||'—') + '</div>' +
              '<div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:3px;">Plan de acción</div>' +
              '<div style="font-size:13px;color:var(--txt);">' + _calEsc(a.plan_accion||'—') + '</div>' +
              (a.fecha_objetivo ? '<div style="font-size:11px;color:var(--txt3);margin-top:6px;">📅 Objetivo: ' + _calFmtFecha(a.fecha_objetivo) + (a.fecha_verificacion ? ' · Verificación: ' + _calFmtFecha(a.fecha_verificacion) : '') + '</div>' : '') +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">' + eb +
              (a.es_eficaz === null ? '<button onclick="window._calCapaEficacia(\'' + a.id + '\',true,\'' + id + '\')" style="background:var(--success);color:#fff;border:none;border-radius:var(--r-sm);padding:4px 10px;font-size:11px;cursor:pointer;">✓ Eficaz</button>' : '') +
              (a.es_eficaz === null ? '<button onclick="window._calCapaEficacia(\'' + a.id + '\',false,\'' + id + '\')" style="background:var(--danger);color:#fff;border:none;border-radius:var(--r-sm);padding:4px 10px;font-size:11px;cursor:pointer;">✗ No eficaz</button>' : '') +
            '</div>' +
          '</div></div>';
      }).join('');
    };

    const cambiosEstado = ['abierta','en_analisis','capa_ejecutada','cerrada'].filter(e => e !== nc.estado).map(e => {
      const ep2 = _CAL_EST_NC[e] || ['var(--txt2)','var(--srf2)',e];
      return '<button onclick="window._calNcCambiarEstado(\'' + nc.id + '\',\'' + e + '\')" style="background:' + ep2[1] + ';color:' + ep2[0] + ';border:1px solid ' + ep2[0] + ';border-radius:var(--r-sm);padding:4px 10px;font-size:11px;cursor:pointer;">' + ep2[2] + '</button>';
    }).join('');

    c.innerHTML =
      _calBtnVolverNC() +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:22px;margin-bottom:18px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">' +
          '<div><div style="font-size:11px;color:var(--txt3);margin-bottom:4px;">' + _calEsc(ncIdStr) + ' · ' + _calFmtFecha(nc.reported_at) + '</div>' +
          '<div style="font-size:16px;font-weight:700;color:var(--txt);">' + _calEsc(nc.proceso_categoria||'—') + '</div></div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' + _calBadge(pp[2],pp[0],pp[1]) + _calBadge(ep[2],ep[0],ep[1]) + cambiosEstado + '</div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--txt);line-height:1.6;white-space:pre-wrap;margin-bottom:16px;">' + _calEsc(nc.descripcion_raw||'') + '</div>' +
        '<button onclick="window._calNcAnalisisIA(\'' + nc.id + '\',this)" style="background:var(--accent-soft);color:var(--accent-ink);border:1px solid var(--accent);border-radius:var(--r-sm);padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600;">✨ Analizar con IA</button>' +
        '<div id="nc-ia-result-' + nc.id + '" style="display:none;margin-top:14px;"></div>' +
      '</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:22px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
          '<div style="font-size:14px;font-weight:700;color:var(--txt);">🔧 Acciones CAPA</div>' +
          '<button onclick="window._calCapaNueva(\'' + nc.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">➕ Añadir acción</button>' +
        '</div>' +
        '<div id="nc-capa-list">' + renderCapas() + '</div>' +
        (todasEficaces && nc.estado !== 'cerrada' ?
          '<div style="margin-top:14px;padding:12px;background:var(--success-soft);border:1px solid var(--success);border-radius:var(--r-sm);">' +
          '<span style="font-size:13px;color:var(--success);">✅ Todas las acciones CAPA son eficaces. </span>' +
          '<button onclick="window._calNcCambiarEstado(\'' + nc.id + '\',\'cerrada\')" style="background:var(--success);color:#fff;border:none;border-radius:var(--r-sm);padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">🔒 Cerrar NC</button></div>' : '') +
      '</div>';

  } catch (err) {
    c.innerHTML = _calBtnVolverNC() + '<div style="background:var(--danger-soft);border:1px solid var(--danger);border-radius:var(--r);padding:20px;color:var(--danger);font-size:13px;">Error al cargar: ' + _calEsc(String(err)) + '</div>';
  }
};

window._calNcAnalisisIA = async function(id, btn) {
  const resDiv = document.getElementById('nc-ia-result-' + id);
  if (!resDiv) return;
  if (btn) { btn.disabled=true; btn.textContent='⏳ Analizando…'; }
  try {
    const { data: nc } = await sb.from('no_conformidades').select('descripcion_raw').eq('id',id).single();
    const sys = 'Eres un consultor experto en gestión de calidad ISO 9001 para centros educativos. Cuando recibes la descripción de una no conformidad, propones: 1) Las 3 causas raíz más probables usando la metodología de los 5 Porqués, 2) El plan de acción correctiva más adecuado, 3) Una acción preventiva para evitar recurrencias. Responde en español, de forma concisa y práctica.';
    const txt = await _calGemini(sys, 'No conformidad en un centro educativo: ' + (nc?.descripcion_raw||''));
    resDiv.style.display='block';
    resDiv.innerHTML = '<div style="background:var(--warning-soft);border:1px solid var(--warning);border-radius:var(--r-sm);padding:14px;">' +
      '<div style="font-size:11px;font-weight:600;color:var(--warning);margin-bottom:8px;">⚠️ Análisis generado por IA. Revisa antes de usar.</div>' +
      '<div style="font-size:13px;color:var(--txt);line-height:1.6;">' + (txt ? _calEsc(txt).replace(/\n/g,'<br>') : 'No se pudo obtener el análisis.') + '</div></div>';
  } catch (e) {
    if (resDiv) { resDiv.style.display='block'; resDiv.innerHTML='<div style="color:var(--danger);font-size:12px;">Error en el análisis IA.</div>'; }
  }
  if (btn) { btn.disabled=false; btn.textContent='✨ Analizar con IA'; }
};

window._calNcCambiarEstado = async function(id, estado) {
  try {
    const { error } = await sb.from('no_conformidades').update({ estado }).eq('id',id);
    if (error) throw error;
    _calToast('Estado actualizado: ' + estado, 'var(--success)');
    await window._calNcDetalle(id);
  } catch (err) { _calToast('Error: ' + err.message, 'var(--danger)'); }
};

window._calCapaEficacia = async function(id, eficaz, ncId) {
  try {
    const { error } = await sb.from('acciones_capa').update({ es_eficaz: eficaz }).eq('id',id);
    if (error) throw error;
    _calToast(eficaz ? '✓ Marcada como eficaz' : '✗ Marcada como no eficaz', eficaz ? 'var(--success)' : 'var(--danger)');
    await window._calNcDetalle(ncId);
  } catch (err) { _calToast('Error: ' + err.message, 'var(--danger)'); }
};

// ── NO CONFORMIDADES — NUEVA CAPA ─────────────────────────────────────────────

window._calCapaNueva = async function(ncId) {
  window._calModalCerrar('cal-modal-capa');
  let perfiles = [];
  try {
    const { data } = await sb.from('profiles').select('id,full_name').eq('centro_id',ctrId)
      .in('rol',['profesional','admin','superadmin','director','jefatura']).order('full_name');
    perfiles = data || [];
  } catch (e) { /* sin responsables */ }

  const respOpts = '<option value="">Sin asignar</option>' +
    perfiles.map(p => '<option value="' + p.id + '">' + _calEsc(p.full_name||'') + '</option>').join('');

  const m = document.createElement('div');
  m.id = 'cal-modal-capa';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';
  m.innerHTML =
    '<div style="background:var(--srf);border-radius:var(--r);width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:var(--sh-lg);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<div style="font-size:16px;font-weight:700;color:var(--txt);">🔧 Nueva acción CAPA</div>' +
        '<button onclick="window._calModalCerrar(\'cal-modal-capa\')" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--txt3);">✕</button>' +
      '</div>' +
      '<input type="hidden" id="capm-nc-id" value="' + _calEsc(ncId) + '">' +
      '<div style="display:flex;flex-direction:column;gap:14px;">' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Causa raíz</label><textarea id="capm-causa" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);resize:vertical;box-sizing:border-box;" placeholder="Describe la causa raíz..."></textarea></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Plan de acción</label><textarea id="capm-plan" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);resize:vertical;box-sizing:border-box;" placeholder="Describe el plan de acción correctiva..."></textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Responsable</label><select id="capm-resp" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);">' + respOpts + '</select></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Fecha objetivo</label><input type="date" id="capm-fecha-obj" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);box-sizing:border-box;"></div>' +
        '</div>' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Fecha verificación</label><input type="date" id="capm-fecha-ver" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);box-sizing:border-box;"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">' +
        '<button onclick="window._calModalCerrar(\'cal-modal-capa\')" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;">Cancelar</button>' +
        '<button id="capm-btn" onclick="window._calCapaGuardar()" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600;">💾 Guardar acción</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener('click', function(e) { if (e.target === m) window._calModalCerrar('cal-modal-capa'); });
};

window._calCapaGuardar = async function() {
  const ncId  = document.getElementById('capm-nc-id')?.value;
  const causa = document.getElementById('capm-causa')?.value.trim();
  const plan  = document.getElementById('capm-plan')?.value.trim();
  const resp  = document.getElementById('capm-resp')?.value || null;
  const fObj  = document.getElementById('capm-fecha-obj')?.value || null;
  const fVer  = document.getElementById('capm-fecha-ver')?.value || null;
  const btn   = document.getElementById('capm-btn');
  if (!causa && !plan) { _calToast('Indica al menos la causa raíz o el plan de acción', 'var(--warning)'); return; }
  if (btn) { btn.disabled=true; btn.textContent='⏳ Guardando…'; }
  try {
    const { error } = await sb.from('acciones_capa').insert({ centro_id:ctrId, nc_id:ncId, causa_raiz:causa||null, plan_accion:plan||null, responsable_id:resp||null, fecha_objetivo:fObj||null, fecha_verificacion:fVer||null });
    if (error) throw error;
    window._calModalCerrar('cal-modal-capa');
    _calToast('✅ Acción CAPA registrada', 'var(--success)');
    await window._calNcDetalle(ncId);
  } catch (err) {
    _calToast('Error: ' + err.message, 'var(--danger)');
    if (btn) { btn.disabled=false; btn.textContent='💾 Guardar acción'; }
  }
};

// ── FEEDBACK FAMILIAS — LISTA ─────────────────────────────────────────────────

async function _calRenderFeedback(c) {
  c.innerHTML = _calSpinner();
  try {
    let q = sb.from('feedback_familias')
      .select('id,canal,texto_raw,categoria_ia,sentimiento_ia,resumen_ia,requiere_accion,estado,created_at')
      .eq('centro_id',ctrId).order('created_at',{ascending:false}).limit(200);
    if (_calFbFiltros.estado) q = q.eq('estado', _calFbFiltros.estado);
    if (_calFbFiltros.sentimiento === 'positivo') q = q.gt('sentimiento_ia', 0.3);
    if (_calFbFiltros.sentimiento === 'negativo') q = q.lt('sentimiento_ia', -0.3);
    if (_calFbFiltros.sentimiento === 'neutro')   q = q.gte('sentimiento_ia', -0.3).lte('sentimiento_ia', 0.3);

    const [rFb, rPend] = await Promise.all([
      q,
      sb.from('feedback_familias').select('*',{count:'exact',head:true}).eq('centro_id',ctrId).eq('estado','pendiente')
    ]);

    const fb   = rFb.data || [];
    const pend = rPend.count || 0;

    const filaFb = (f) => {
      const ep = _CAL_EST_FB[f.estado] || ['var(--txt2)','var(--srf2)',f.estado];
      const senti = _calSentiEmoji(f.sentimiento_ia);
      const sentiVal = f.sentimiento_ia != null ? ' ' + parseFloat(f.sentimiento_ia).toFixed(2) : '';
      const resumen = f.resumen_ia ? _calEsc(f.resumen_ia) : '<span style="color:var(--txt3);">' + _calEsc((f.texto_raw||'').slice(0,50)) + '…</span>';
      return '<tr style="border-bottom:1px solid var(--bdr);">' +
        '<td style="padding:8px 10px;font-size:12px;">' + _calFmtFecha(f.created_at) + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;">' + _calEsc(f.canal||'—') + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;max-width:200px;">' + resumen + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;">' + _calEsc(f.categoria_ia||'—') + '</td>' +
        '<td style="padding:8px 10px;font-size:13px;white-space:nowrap;">' + senti + '<span style="font-size:11px;color:var(--txt3);">' + sentiVal + '</span></td>' +
        '<td style="padding:8px 10px;">' + _calBadge(ep[2],ep[0],ep[1]) + '</td>' +
        '<td style="padding:8px 10px;"><button onclick="window._calFbDetalle(\'' + f.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:4px 10px;font-size:12px;cursor:pointer;">Ver</button></td>' +
      '</tr>';
    };

    const tabla = fb.length === 0
      ? '<div style="text-align:center;color:var(--txt3);padding:40px;font-size:13px;">✅ Sin feedback con los filtros actuales</div>'
      : '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--srf2);">' +
          ['Fecha','Canal','Resumen IA','Categoría IA','Sentimiento','Estado','Acciones'].map(h => '<th style="padding:8px 10px;font-size:11px;text-align:left;color:var(--txt2);">' + h + '</th>').join('') +
          '</tr></thead><tbody>' + fb.map(filaFb).join('') + '</tbody></table></div>';

    const selOpts = (vals, cur, ph) =>
      '<option value="">' + ph + '</option>' +
      vals.map(v => '<option value="' + v[0] + '"' + (cur===v[0]?' selected':'') + '>' + v[1] + '</option>').join('');

    c.innerHTML =
      _calBtnVolver() +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">' +
        '<div><div style="font-size:18px;font-weight:700;color:var(--txt);">💬 Feedback Familias</div>' +
        '<div style="font-size:12px;color:var(--txt3);margin-top:3px;">' + pend + ' pendientes de respuesta</div></div>' +
        '<button onclick="window._calFbNuevo()" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600;">➕ Nuevo feedback</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">' +
        '<select onchange="window._calFbFiltrar(\'estado\',this.value)" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--srf);">' + selOpts([['pendiente','Pendiente'],['en_gestion','En gestión'],['resuelto','Resuelto']],_calFbFiltros.estado,'Todos los estados') + '</select>' +
        '<select onchange="window._calFbFiltrar(\'sentimiento\',this.value)" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--srf);">' + selOpts([['positivo','😊 Positivo'],['neutro','😐 Neutro'],['negativo','😤 Negativo']],_calFbFiltros.sentimiento,'Cualquier sentimiento') + '</select>' +
      '</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;">' + tabla + '</div>';

  } catch (err) {
    c.innerHTML = _calBtnVolver() + '<div style="background:var(--danger-soft);border:1px solid var(--danger);border-radius:var(--r);padding:20px;color:var(--danger);font-size:13px;"><strong>Error</strong><br><code>' + _calEsc(String(err)) + '</code></div>';
  }
}

window._calFbFiltrar = function(tipo, val) {
  _calFbFiltros[tipo] = val;
  const c = document.getElementById('calidad-cont');
  if (c) _calRenderFeedback(c);
};

// ── FEEDBACK — NUEVO (MODAL) ──────────────────────────────────────────────────

window._calFbNuevo = async function() {
  window._calModalCerrar('cal-modal-fb');
  let alumnos = [];
  try {
    const { data } = await sb.from('alumnos').select('id,nombre,curso').eq('centro_id',ctrId).order('nombre').limit(500);
    alumnos = data || [];
  } catch (e) { /* sin alumnos */ }

  const alumOpts = '<option value="">— Sin alumno asociado —</option>' +
    alumnos.map(a => '<option value="' + a.id + '">' + _calEsc(a.nombre + ' (' + (a.curso||'') + ')') + '</option>').join('');

  const m = document.createElement('div');
  m.id = 'cal-modal-fb';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';
  m.innerHTML =
    '<div style="background:var(--srf);border-radius:var(--r);width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:var(--sh-lg);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<div style="font-size:16px;font-weight:700;color:var(--txt);">➕ Nuevo Feedback de Familia</div>' +
        '<button onclick="window._calModalCerrar(\'cal-modal-fb\')" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--txt3);">✕</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:14px;">' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Canal</label>' +
        '<select id="fbm-canal" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);">' +
          '<option value="formulario">Formulario</option><option value="email">Email</option><option value="chat">Chat</option><option value="presencial">Presencial</option>' +
        '</select></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Alumno (opcional)</label>' +
        '<select id="fbm-alumno" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);">' + alumOpts + '</select></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:var(--txt2);display:block;margin-bottom:4px;">Texto del feedback *</label>' +
        '<textarea id="fbm-texto" rows="5" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);resize:vertical;box-sizing:border-box;" placeholder="Escribe el feedback de la familia..."></textarea></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">' +
        '<button onclick="window._calModalCerrar(\'cal-modal-fb\')" style="background:var(--srf2);border:1px solid var(--bdr);border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;">Cancelar</button>' +
        '<button id="fbm-btn" onclick="window._calFbGuardar()" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600;">💾 Guardar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener('click', function(e) { if (e.target === m) window._calModalCerrar('cal-modal-fb'); });
};

window._calFbGuardar = async function() {
  const canal  = document.getElementById('fbm-canal')?.value;
  const alumno = document.getElementById('fbm-alumno')?.value || null;
  const texto  = document.getElementById('fbm-texto')?.value.trim();
  const btn    = document.getElementById('fbm-btn');
  if (!texto) { _calToast('El texto del feedback es obligatorio', 'var(--warning)'); return; }
  if (btn) { btn.disabled=true; btn.textContent='⏳ Guardando…'; }
  try {
    const { data: ins, error } = await sb.from('feedback_familias').insert({
      centro_id: ctrId,
      familia_user_id: currentUser ? currentUser.id : null,
      alumno_id: alumno || null,
      canal, texto_raw: texto, estado: 'pendiente'
    }).select('id').single();
    if (error) throw error;
    window._calModalCerrar('cal-modal-fb');
    _calToast('✅ Feedback registrado. Analizando con IA…', 'var(--success)');
    // Análisis IA en segundo plano — no bloquea el guardado
    (async () => {
      try {
        const sys = 'Eres un coordinador de calidad escolar. Analiza el feedback de una familia y devuelve SOLO un JSON sin explicaciones:\n{"categoria": string, "sentimiento": number, "resumen": string, "requiere_accion": boolean}\ncategoria: una de (Docencia, Comedor, Convivencia, Transporte, Administración, Infraestructura, General)\nsentimiento: número entre -1.0 (muy negativo) y 1.0 (muy positivo)\nresumen: máximo 20 palabras\nrequiere_accion: true si es urgente o muy negativo';
        const txt = await _calGemini(sys, 'Feedback de familia: ' + texto);
        const p = _calParseJson(txt);
        if (p && ins?.id) {
          await sb.from('feedback_familias').update({
            categoria_ia: p.categoria || null,
            sentimiento_ia: typeof p.sentimiento === 'number' ? p.sentimiento : null,
            resumen_ia: p.resumen || null,
            requiere_accion: !!p.requiere_accion
          }).eq('id', ins.id);
        }
      } catch (e) { /* silencioso */ }
    })();
    const c = document.getElementById('calidad-cont');
    if (c) await _calRenderFeedback(c);
  } catch (err) {
    _calToast('Error al guardar: ' + err.message, 'var(--danger)');
    if (btn) { btn.disabled=false; btn.textContent='💾 Guardar'; }
  }
};

// ── FEEDBACK — DETALLE ────────────────────────────────────────────────────────

window._calFbDetalle = async function(id) {
  const c = document.getElementById('calidad-cont');
  if (!c) return;
  c.innerHTML = _calSpinner();
  try {
    const { data: f, error } = await sb.from('feedback_familias').select('*').eq('id',id).single();
    if (error) throw error;

    const ep = _CAL_EST_FB[f.estado] || ['var(--txt2)','var(--srf2)',f.estado];
    const sentiLabel = f.sentimiento_ia != null ? _calSentiEmoji(f.sentimiento_ia) + ' ' + parseFloat(f.sentimiento_ia).toFixed(2) : '—';

    c.innerHTML =
      _calBtnVolverFB() +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:22px;margin-bottom:18px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">' +
          '<div><div style="font-size:11px;color:var(--txt3);margin-bottom:4px;">' + _calFmtFecha(f.created_at) + ' · ' + _calEsc(f.canal||'—') + '</div>' +
          '<div style="font-size:15px;font-weight:700;color:var(--txt);">Feedback de familia</div></div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            _calBadge(ep[2],ep[0],ep[1]) +
            (f.requiere_accion ? _calBadge('⚡ Urgente','var(--danger)','var(--danger-soft)') : '') +
          '</div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--txt);line-height:1.6;white-space:pre-wrap;margin-bottom:16px;">' + _calEsc(f.texto_raw||'') + '</div>' +
        '<div style="background:var(--srf2);border-radius:var(--r-sm);padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">' +
          '<div><div style="font-size:11px;color:var(--txt3);">Categoría IA</div><div style="font-size:13px;font-weight:600;color:var(--txt);">' + _calEsc(f.categoria_ia||'—') + '</div></div>' +
          '<div><div style="font-size:11px;color:var(--txt3);">Sentimiento</div><div style="font-size:13px;">' + sentiLabel + '</div></div>' +
          '<div><div style="font-size:11px;color:var(--txt3);">Resumen IA</div><div style="font-size:13px;color:var(--txt);">' + _calEsc(f.resumen_ia||'—') + '</div></div>' +
        '</div>' +
        (f.familia_user_id ? '<div id="fb-email-info-' + id + '" style="margin-top:10px;"></div>' : '') +
      '</div>' +
      '<div style="background:var(--srf);border:1px solid var(--bdr);border-radius:var(--r);padding:22px;">' +
        '<div style="font-size:14px;font-weight:700;color:var(--txt);margin-bottom:14px;">📧 Respuesta institucional</div>' +
        '<textarea id="fb-resp-ta" rows="6" style="width:100%;padding:10px;border:1px solid var(--bdr);border-radius:var(--r-sm);font-size:13px;background:var(--bg);resize:vertical;box-sizing:border-box;" placeholder="Escribe o genera la respuesta con IA...">' + _calEsc(f.respuesta_borrador||'') + '</textarea>' +
        '<div style="font-size:11px;color:var(--txt3);margin:6px 0 12px;">⚠️ Revisa el texto antes de guardar.</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          '<button onclick="window._calFbGenerarRespuesta(\'' + f.id + '\')" style="background:var(--accent-soft);color:var(--accent-ink);border:1px solid var(--accent);border-radius:var(--r-sm);padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600;">✨ Generar respuesta</button>' +
          '<button onclick="window._calFbGuardarRespuesta(\'' + f.id + '\')" style="background:var(--ink);color:#fff;border:none;border-radius:var(--r-sm);padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600;">💾 Guardar y marcar resuelta</button>' +
        '</div>' +
      '</div>';

    // Cargar email de la familia en segundo plano
    if (f.familia_user_id) {
      (async () => {
        try {
          const { data: prof } = await sb.from('profiles').select('email').eq('id',f.familia_user_id).single();
          const el = document.getElementById('fb-email-info-' + id);
          if (el && prof?.email) {
            el.innerHTML = '<div style="background:var(--info-soft);border:1px solid var(--info);border-radius:var(--r-sm);padding:10px;font-size:12px;color:var(--info);">📧 Email de contacto: <strong>' + _calEsc(prof.email) + '</strong></div>';
          }
        } catch (e) { /* silencioso */ }
      })();
    }

  } catch (err) {
    c.innerHTML = _calBtnVolverFB() + '<div style="background:var(--danger-soft);border:1px solid var(--danger);border-radius:var(--r);padding:20px;color:var(--danger);font-size:13px;">Error al cargar: ' + _calEsc(String(err)) + '</div>';
  }
};

window._calFbGenerarRespuesta = async function(id) {
  const ta = document.getElementById('fb-resp-ta');
  if (!ta) return;
  const prev = ta.value;
  ta.value = '⏳ Generando respuesta…';
  ta.disabled = true;
  try {
    const { data: f } = await sb.from('feedback_familias').select('texto_raw,categoria_ia').eq('id',id).single();
    const sys = 'Eres el secretario académico de un colegio. Redactas respuestas institucionales a feedback de familias: empáticas, profesionales y alineadas con los valores del centro. La respuesta debe agradecer el feedback, confirmar que se ha tomado nota y, si procede, indicar las acciones que se tomarán. Máximo 150 palabras. Responde SOLO con el texto de la respuesta.';
    const txt = await _calGemini(sys, 'Feedback recibido: ' + (f?.texto_raw||'') + '. Categoría: ' + (f?.categoria_ia||'General') + '.');
    ta.value = txt || 'No se pudo generar la respuesta. Escríbela manualmente.';
  } catch (e) {
    ta.value = prev || 'Error al generar. Escríbela manualmente.';
  }
  ta.disabled = false;
};

window._calFbGuardarRespuesta = async function(id) {
  const ta = document.getElementById('fb-resp-ta');
  const texto = ta ? ta.value.trim() : '';
  try {
    const { error } = await sb.from('feedback_familias').update({ respuesta_borrador: texto, estado: 'resuelto' }).eq('id',id);
    if (error) throw error;
    _calToast('✅ Respuesta guardada y feedback marcado como resuelto', 'var(--success)');
    const c = document.getElementById('calidad-cont');
    if (c) await _calRenderFeedback(c);
  } catch (err) { _calToast('Error: ' + err.message, 'var(--danger)'); }
};
