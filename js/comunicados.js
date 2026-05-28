// ── MÓDULO COMUNICADOS ──
var _comLastData = [];
var _comRealtime = null;

var COM_PLANTILLAS = {
  reunion: {
    titulo: 'Convocatoria reunión de inicio de curso - [Grupo]',
    cuerpo:  'Estimadas familias:\n\nLes convocamos a la reunión de inicio de curso el próximo [Fecha] a las [Hora] en [Lugar]. El tutor presentará las líneas generales del curso, criterios de evaluación y normas de convivencia.\n\nRogamos su asistencia.\n\nEl Equipo Directivo.'
  },
  horario: {
    titulo: 'Aviso: Modificación de horario para [Fecha] - Grupo [Grupo]',
    cuerpo:  'Estimadas familias:\n\nDebido a una ausencia en el profesorado, el grupo [Grupo] modificará su horario el día [Fecha]. [Indicar cambio]. El resto de la jornada se desarrollará con normalidad.\n\nJefatura de Estudios.'
  },
  plazo: {
    titulo: 'ÚLTIMO AVISO: Plazo de [Trámite]',
    cuerpo:  'Estimadas familias:\n\nEl plazo para [Trámite] finaliza el [Fecha]. Completen el proceso antes de dicha fecha. Pueden gestionar en secretaría o mediante el enlace facilitado.\n\nGracias.'
  }
};

// ── localStorage: leídos ────────────────────────────────────────

function _comKey() {
  return 'com_leidos_' + (currentUser ? currentUser.id : '') + '_' + ctrId;
}

function _comGetLeidos() {
  try { return JSON.parse(localStorage.getItem(_comKey()) || '[]'); }
  catch (e) { return []; }
}

function _comMarkLeido(id) {
  var l = _comGetLeidos();
  if (!l.includes(id)) {
    l.push(id);
    try { localStorage.setItem(_comKey(), JSON.stringify(l)); } catch (e) {}
  }
  _comUpdateTabBadge();
}

// ── Tab badge ────────────────────────────────────────────────────

function _comUpdateTabBadge() {
  var tab = document.getElementById('tab-comunicados');
  if (!tab) return;
  if (!_comLastData.length) { tab.textContent = '📢 Comunicados'; return; }
  var leidos = _comGetLeidos();
  var n = _comLastData.filter(function(c) { return !leidos.includes(c.id); }).length;
  tab.textContent = n > 0 ? '📢 Comunicados (' + n + ')' : '📢 Comunicados';
}

// ── Inicialización del panel ─────────────────────────────────────

function initComunicadosPanel() {
  var c = document.getElementById('com-contenido');
  if (!c) return;

  var isAdmin = role === 'admin' || role === 'superadmin';

  var formHtml = '';
  if (isAdmin) {
    formHtml = '<div class="card" style="margin-bottom:20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="_comToggleForm()">'
      + '<div class="card-hdr" style="margin:0;padding:0;"><div class="card-ico o">📢</div>'
      + '<div><div class="card-title">Nuevo comunicado</div></div></div>'
      + '<span id="com-form-toggle" style="font-size:22px;line-height:1;color:var(--txt3);padding:0 4px;">＋</span>'
      + '</div>'
      + '<div id="com-form-body" style="display:none;margin-top:16px;border-top:1px solid #f0f0f0;padding-top:16px;">'
      // ─ fila: plantilla + destinatarios
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:12px;">'
      + '<div><label class="lbl">Plantilla</label>'
      + '<select class="fi" id="com-plantilla" onchange="comOnPlantilla(this.value)">'
      + '<option value="">Sin plantilla</option>'
      + '<option value="reunion">Convocatoria reunión inicio de curso</option>'
      + '<option value="horario">Aviso modificación horario por ausencia</option>'
      + '<option value="plazo">Recordatorio plazo administrativo</option>'
      + '</select></div>'
      + '<div><label class="lbl">Destinatarios</label>'
      + '<select class="fi" id="com-dest" onchange="comOnDestChange(this.value)">'
      + '<option value="todos">👥 Todos</option>'
      + '<option value="solo_profesores">👨‍🏫 Solo profesores</option>'
      + '<option value="solo_familias">👨‍👩‍👧 Solo familias</option>'
      + '<option value="grupo_especifico">🎓 Grupo específico…</option>'
      + '</select></div>'
      + '</div>'
      // ─ fila: grupo (visible solo si grupo_especifico)
      + '<div id="com-grupo-row" style="display:none;margin-bottom:10px;">'
      + '<label class="lbl">Nombre del grupo</label>'
      + '<input class="fi" id="com-grupo-val" placeholder="Ej: 2ESOA" />'
      + '</div>'
      // ─ título
      + '<div style="margin-bottom:10px;">'
      + '<label class="lbl">Título *</label>'
      + '<input class="fi" id="com-titulo" placeholder="Asunto del comunicado…" />'
      + '</div>'
      // ─ cuerpo
      + '<div style="margin-bottom:12px;">'
      + '<label class="lbl">Cuerpo *</label>'
      + '<textarea class="fa" id="com-cuerpo" style="min-height:120px;" placeholder="Texto del comunicado…"></textarea>'
      + '</div>'
      // ─ acción
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<button class="btn btn-p" onclick="enviarComunicado()">📢 Enviar comunicado</button>'
      + '<div id="com-msg" style="display:none;font-size:13px;"></div>'
      + '</div>'
      + '</div>'  // end com-form-body
      + '</div>'; // end card
  }

  c.innerHTML = formHtml
    + '<div class="card">'
    + '<div id="com-lista"><div style="text-align:center;color:var(--txt3);font-size:13px;padding:24px;">'
    + '<span class="spin">⟳</span> Cargando…</div></div>'
    + '</div>';

  _loadComLista();
  _comInitRealtime();
}

// ── Carga ─────────────────────────────────────────────────────────

async function loadComunicados() {
  var lista = document.getElementById('com-lista');
  if (!lista) { initComunicadosPanel(); return; }
  lista.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;"><span class="spin">⟳</span> Cargando…</div>';
  await _loadComLista();
}

async function _loadComLista() {
  var r = await sb.from('comunicados').select('*')
    .eq('centro_id', ctrId)
    .order('created_at', { ascending: false }).limit(100);

  var lista = document.getElementById('com-lista');
  if (!lista) return;

  if (r.error) {
    lista.innerHTML = '<div style="color:var(--red);font-size:13px;padding:8px;">Error: ' + r.error.message + '</div>';
    return;
  }
  _comLastData = r.data || [];
  _comUpdateTabBadge();
  _comRenderLista(lista);
}

// ── Render lista ──────────────────────────────────────────────────

function _comRenderLista(lista) {
  var leidos = _comGetLeidos();

  if (!_comLastData.length) {
    lista.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:24px;">No hay comunicados registrados.</div>';
    return;
  }

  lista.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">'
    + _comLastData.map(function(com) {
        var leido = leidos.includes(com.id);
        var preview = (com.cuerpo || '').slice(0, 100).replace(/\n/g, ' ');
        if ((com.cuerpo || '').length > 100) preview += '…';
        return '<div onclick="_comVerComunicado(\'' + com.id + '\')" '
          + 'style="padding:14px 18px;border-radius:10px;cursor:pointer;background:#fff;'
          + 'border:1px solid ' + (leido ? '#e8e8e8' : 'var(--ink)') + ';'
          + (leido ? '' : 'border-left-width:4px;') + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:14px;font-weight:' + (leido ? '400' : '600') + ';color:#222;margin-bottom:3px;">'
          + (leido ? '' : '<span style="display:inline-block;width:7px;height:7px;background:var(--ink);border-radius:50%;vertical-align:middle;margin-right:6px;"></span>')
          + _escCom(com.titulo || '(Sin título)') + '</div>'
          + '<div style="font-size:12px;color:var(--txt3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px;">' + _escCom(preview) + '</div>'
          + '<div style="display:flex;gap:10px;">'
          + '<span style="font-size:11px;color:var(--txt3);">📅 ' + (com.fecha || '—') + '</span>'
          + '<span style="font-size:11px;color:var(--txt3);">' + _comDestLabel(com.destinatarios) + '</span>'
          + '</div>'
          + '</div>'
          + '<span style="font-size:11px;color:' + (leido ? 'var(--txt3)' : 'var(--ink)') + ';flex-shrink:0;margin-top:2px;">'
          + (leido ? '✓ Leído' : '● Nuevo') + '</span>'
          + '</div></div>';
      }).join('')
    + '</div>';
}

function _escCom(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _comDestLabel(d) {
  var map = { todos: '👥 Todos', solo_profesores: '👨‍🏫 Profesores', solo_familias: '👨‍👩‍👧 Familias' };
  if (map[d]) return map[d];
  if (d && d.startsWith('grupo:')) return '🎓 Grupo ' + d.replace('grupo:', '');
  return d || '—';
}

// ── Ver comunicado (modal) ───────────────────────────────────────

function _comVerComunicado(id) {
  var com = _comLastData.find(function(c) { return c.id === id; });
  if (!com) return;
  _comMarkLeido(id);

  // Actualiza el indicador de leído en la lista sin recargar de red
  var lista = document.getElementById('com-lista');
  if (lista) _comRenderLista(lista);

  var existing = document.getElementById('com-ver-modal');
  if (existing) existing.remove();

  var cuerpoHtml = _escCom(com.cuerpo || '').replace(/\n/g, '<br>');

  var modal = document.createElement('div');
  modal.id = 'com-ver-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = ''
    + '<div style="background:#fff;border-radius:12px;max-width:min(580px,calc(100vw - 24px));width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.18);">'
    + '<div style="padding:20px 24px 16px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
    + '<div>'
    + '<div style="font-size:16px;font-weight:600;color:#222;">' + _escCom(com.titulo || '') + '</div>'
    + '<div style="font-size:12px;color:var(--txt3);margin-top:4px;">📅 ' + _escCom(com.fecha || '') + ' · ' + _comDestLabel(com.destinatarios) + '</div>'
    + '</div>'
    + '<button onclick="document.getElementById(\'com-ver-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;padding:0;flex-shrink:0;">✕</button>'
    + '</div>'
    + '<div style="padding:24px;font-size:14px;color:#333;line-height:1.8;">' + cuerpoHtml + '</div>'
    + '<div style="padding:14px 24px;border-top:1px solid #e0e0e0;display:flex;justify-content:flex-end;">'
    + '<button onclick="document.getElementById(\'com-ver-modal\').remove()" style="padding:8px 18px;border:1px solid #e0e0e0;border-radius:8px;background:white;cursor:pointer;font-size:13px;color:#555;">Cerrar</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

// ── Formulario helpers ────────────────────────────────────────────

function _comToggleForm() {
  var body = document.getElementById('com-form-body');
  var ico  = document.getElementById('com-form-toggle');
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (ico) ico.textContent = open ? '＋' : '－';
}

function comOnPlantilla(val) {
  if (!val || !COM_PLANTILLAS[val]) return;
  var p = COM_PLANTILLAS[val];
  var t = document.getElementById('com-titulo');
  var b = document.getElementById('com-cuerpo');
  if (t) t.value = p.titulo;
  if (b) b.value = p.cuerpo;
}

function comOnDestChange(val) {
  var row = document.getElementById('com-grupo-row');
  if (row) row.style.display = (val === 'grupo_especifico') ? 'block' : 'none';
}

// ── Enviar comunicado ─────────────────────────────────────────────

async function enviarComunicado() {
  var titulo = ((document.getElementById('com-titulo') || {}).value || '').trim();
  var cuerpo = ((document.getElementById('com-cuerpo') || {}).value || '').trim();
  var destEl = document.getElementById('com-dest');
  var dest   = destEl ? destEl.value : 'todos';
  if (dest === 'grupo_especifico') {
    var gVal = ((document.getElementById('com-grupo-val') || {}).value || '').trim();
    dest = gVal ? 'grupo:' + gVal : 'todos';
  }
  var msg = document.getElementById('com-msg');

  if (!titulo) {
    if (msg) { msg.textContent = 'El título es obligatorio.'; msg.style.color = 'var(--red)'; msg.style.display = 'block'; }
    return;
  }
  if (!cuerpo) {
    if (msg) { msg.textContent = 'El cuerpo es obligatorio.'; msg.style.color = 'var(--red)'; msg.style.display = 'block'; }
    return;
  }

  if (msg) { msg.textContent = '⟳ Enviando…'; msg.style.color = 'var(--txt2)'; msg.style.display = 'block'; }

  var r = await sb.from('comunicados').insert({
    centro_id:     ctrId,
    titulo:        titulo,
    cuerpo:        cuerpo,
    destinatarios: dest,
    creado_por:    currentUser.id,
    fecha:         new Date().toISOString().split('T')[0],
    estado:        'enviado',
  }).select().single();

  if (r.error) {
    if (msg) { msg.textContent = 'Error: ' + r.error.message; msg.style.color = 'var(--red)'; }
    return;
  }

  // Enviar emails via Edge Function
  var enviados = 0;
  var er = await sb.functions.invoke('send-comunicado', { body: { comunicado_id: r.data.id } });
  if (!er.error && er.data && er.data.enviados != null) enviados = er.data.enviados;

  if (msg) {
    msg.textContent = '✅ Comunicado enviado' + (enviados > 0 ? ' · ✉ ' + enviados + ' emails' : '');
    msg.style.color = 'var(--ink)';
    setTimeout(function() { msg.style.display = 'none'; }, 4000);
  }

  // Limpiar formulario y cerrar
  var t = document.getElementById('com-titulo');
  var b = document.getElementById('com-cuerpo');
  var p = document.getElementById('com-plantilla');
  if (t) t.value = '';
  if (b) b.value = '';
  if (p) p.value = '';
  _comToggleForm();

  await loadComunicados();
}

// ── Realtime: nuevos comunicados en vivo ──────────────────────────

function _comInitRealtime() {
  if (_comRealtime) return;
  _comRealtime = sb.channel('com_rt_' + ctrId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'comunicados',
      filter: 'centro_id=eq.' + ctrId,
    }, function(payload) {
      var nuevo = payload.new;
      if (nuevo.creado_por === currentUser.id) return;
      if (!_comLastData.find(function(c) { return c.id === nuevo.id; })) {
        _comLastData.unshift(nuevo);
      }
      _comUpdateTabBadge();
      _comShowToast('📢 Nuevo comunicado: ' + nuevo.titulo);
      var lista = document.getElementById('com-lista');
      if (lista) _comRenderLista(lista);
    })
    .subscribe();
}

// ── Toast ─────────────────────────────────────────────────────────

function _comShowToast(text) {
  var t = document.getElementById('com-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'com-toast';
    t.style.cssText = 'position:fixed;bottom:calc(72px + env(safe-area-inset-bottom,0));right:16px;background:#222;color:#fff;'
      + 'padding:12px 20px;border-radius:10px;font-size:13px;z-index:9100;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:min(320px,calc(100vw - 32px));line-height:1.5;cursor:pointer;';
    t.addEventListener('click', function() { t.style.display = 'none'; });
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { if (t) t.style.display = 'none'; }, 5000);
}

// ── Arranque: badge + realtime sin abrir el panel ─────────────────

async function _comCheckAndBadge() {
  var r = await sb.from('comunicados').select('id')
    .eq('centro_id', ctrId)
    .order('created_at', { ascending: false }).limit(100);
  if (!r.error && r.data) {
    _comLastData = r.data;
    _comUpdateTabBadge();
    _comInitRealtime();
  }
}
