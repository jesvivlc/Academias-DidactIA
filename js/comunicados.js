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
  var nuevo = !l.includes(id);
  if (nuevo) {
    l.push(id);
    try { localStorage.setItem(_comKey(), JSON.stringify(l)); } catch (e) {}
  }
  _comUpdateTabBadge();
  // Registro de lectura en BD (idempotente por UNIQUE comunicado_id+user_id), fire-and-forget
  if (nuevo && currentUser && currentUser.id) {
    try {
      sb.from('comunicado_lecturas')
        .upsert({ centro_id: ctrId, comunicado_id: id, user_id: currentUser.id },
                { onConflict: 'comunicado_id,user_id', ignoreDuplicates: true })
        .then(function () {}, function () {});
    } catch (e) {}
  }
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
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<button class="btn-ia" onclick="event.stopPropagation();window.agenteComunicacion&&agenteComunicacion()" style="white-space:nowrap;"><i class="ti ti-robot"></i> Agente: redactar</button>'
      + '<span id="com-form-toggle" style="font-size:22px;line-height:1;color:var(--txt3);padding:0 4px;">＋</span>'
      + '</div>'
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
    .order('created_at', { ascending: false }).limit(500);

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
  return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  var idiomas = [['es','Español'],['en','English'],['fr','Français'],['ar','العربية'],['ro','Română'],['uk','Українська'],['zh','中文'],['de','Deutsch'],['pt','Português']];
  var idiomaPref = (typeof window.userIdioma !== 'undefined' ? window.userIdioma : 'es') || 'es';
  var langSel = '<select id="com-ver-lang" onchange="window._comTraducir(\'' + com.id + '\', this.value)" '
    + 'style="font-size:12px;padding:4px 8px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;color:#555;cursor:pointer;">'
    + idiomas.map(function(l){ return '<option value="' + l[0] + '"' + (l[0] === idiomaPref ? ' selected' : '') + '>🌐 ' + l[1] + '</option>'; }).join('') + '</select>';

  modal.innerHTML = ''
    + '<div style="background:#fff;border-radius:12px;max-width:min(580px,calc(100vw - 24px));width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.18);">'
    + '<div style="padding:20px 24px 16px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
    + '<div style="min-width:0;">'
    + '<div id="com-ver-title" style="font-size:16px;font-weight:600;color:#222;">' + _escCom(com.titulo || '') + '</div>'
    + '<div style="font-size:12px;color:var(--txt3);margin-top:4px;">📅 ' + _escCom(com.fecha || '') + ' · ' + _comDestLabel(com.destinatarios) + '</div>'
    + '</div>'
    + '<button onclick="document.getElementById(\'com-ver-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;padding:0;flex-shrink:0;">✕</button>'
    + '</div>'
    + '<div style="padding:12px 24px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' + langSel
    + '<span id="com-ver-note" style="display:none;font-size:11px;color:var(--txt3);"></span></div>'
    + '<div id="com-ver-body" style="padding:16px 24px 24px;font-size:14px;color:#333;line-height:1.8;">' + cuerpoHtml + '</div>'
    + '<div style="padding:14px 24px;border-top:1px solid #e0e0e0;display:flex;justify-content:flex-end;">'
    + '<button onclick="document.getElementById(\'com-ver-modal\').remove()" style="padding:8px 18px;border:1px solid #e0e0e0;border-radius:8px;background:white;cursor:pointer;font-size:13px;color:#555;">Cerrar</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  // Auto-traducir al idioma preferido de la familia (si no es español)
  if (idiomaPref && idiomaPref !== 'es') window._comTraducir(com.id, idiomaPref);
}

// ── Traducción multi-idioma (Gemini vía EF chat, cacheada) ───────────
var _comTradCache = {};   // { comunicadoId: { lang: {titulo, cuerpo} } }

async function _comIA(systemPrompt, userMsg) {
  try {
    var r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY, 'apikey': ANON_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        system_prompt: systemPrompt,
        centro_id: (typeof ctrId !== 'undefined' ? ctrId : '') || '',
        role: 'familia',
        user_name: (typeof currentUserName !== 'undefined' ? currentUserName : ''),
        user_id: (typeof currentUser !== 'undefined' && currentUser ? currentUser.id : ''),
      }),
    });
    if (!r.ok) return null;
    var j = await r.json();
    return j.type === 'text' ? j.text : null;
  } catch (e) { return null; }
}

window._comTraducir = async function (id, lang) {
  var com = _comLastData.find(function (c) { return c.id === id; });
  if (!com) return;
  // Recordar el idioma preferido de la familia (persistente)
  if (typeof role !== 'undefined' && role === 'familia' && typeof currentUser !== 'undefined' && currentUser) {
    window.userIdioma = lang;
    sb.from('profiles').update({ idioma: lang }).eq('user_id', currentUser.id).then(function () {}, function () {});
  }
  var titleEl = document.getElementById('com-ver-title');
  var bodyEl  = document.getElementById('com-ver-body');
  var noteEl  = document.getElementById('com-ver-note');
  if (!titleEl || !bodyEl) return;

  var aplicar = function (o, traducido) {
    titleEl.textContent = (o.titulo || com.titulo || '');
    bodyEl.innerHTML = _escCom(o.cuerpo || '').replace(/\n/g, '<br>');
    bodyEl.dir = (lang === 'ar' || lang === 'he' || lang === 'ur') ? 'rtl' : 'ltr';
    if (noteEl) {
      noteEl.textContent = traducido ? '🌐 Traducido automáticamente — el original está en español.' : '';
      noteEl.style.display = traducido ? '' : 'none';
    }
  };

  if (lang === 'es') { aplicar({ titulo: com.titulo, cuerpo: com.cuerpo }, false); return; }

  _comTradCache[id] = _comTradCache[id] || {};
  if (_comTradCache[id][lang]) { aplicar(_comTradCache[id][lang], true); return; }

  bodyEl.innerHTML = '<span style="color:var(--txt3);">⟳ Traduciendo…</span>';
  if (noteEl) noteEl.style.display = 'none';

  var nombres = { en: 'inglés', fr: 'francés', ar: 'árabe', ro: 'rumano', uk: 'ucraniano', zh: 'chino', de: 'alemán', pt: 'portugués' };
  var sys = 'Eres un traductor profesional de comunicaciones escolares. Traduce el comunicado al idioma indicado manteniendo un tono formal y respetuoso. ' +
    'Devuelve EXCLUSIVAMENTE un objeto JSON {"titulo":"…","cuerpo":"…"} con la traducción; conserva los saltos de línea del cuerpo como \\n. Sin texto adicional ni markdown.';
  var usr = 'Idioma de destino: ' + (nombres[lang] || lang) + '.\n\nTÍTULO: ' + (com.titulo || '') + '\n\nCUERPO:\n' + (com.cuerpo || '');

  try {
    var txt = await _comIA(sys, usr);
    if (!txt) { aplicar({ titulo: com.titulo, cuerpo: com.cuerpo }, false); if (typeof showToast === 'function') showToast('No se pudo traducir. Inténtalo de nuevo.'); return; }
    var clean = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
    var obj = null;
    try { obj = JSON.parse(clean); } catch (e) {
      var m = clean.match(/\{[\s\S]*\}/);
      if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
    }
    if (!obj || (!obj.titulo && !obj.cuerpo)) { aplicar({ titulo: com.titulo, cuerpo: com.cuerpo }, false); if (typeof showToast === 'function') showToast('No se pudo interpretar la traducción.'); return; }
    _comTradCache[id][lang] = obj;
    aplicar(obj, true);
  } catch (e) {
    aplicar({ titulo: com.titulo, cuerpo: com.cuerpo }, false);
  }
};

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

// Push a las familias destinatarias de un comunicado (según `destinatarios`).
// 'solo_profesores' → no familias. 'grupo:XXXX' → familias de ese grupo.
// 'todos'/'solo_familias' → todas las familias del centro. Fire-and-forget.
async function _comPushFamilias(dest, titulo) {
  try {
    if (dest === 'solo_profesores') return;
    var fams = [];
    if (dest && dest.indexOf('grupo:') === 0) {
      var grupo = dest.slice(6);
      var ra = await sb.from('alumnos').select('id').eq('centro_id', ctrId).eq('grupo_horario', grupo);
      var ids = (ra.data || []).map(function (a) { return a.id; });
      if (!ids.length) return;
      var rf = await sb.from('familia_alumno').select('profile_id').in('alumno_id', ids);
      fams = (rf.data || []).map(function (x) { return x.profile_id; });
    } else {
      var rp = await sb.from('profiles').select('id').eq('centro_id', ctrId).eq('rol', 'familia');
      fams = (rp.data || []).map(function (p) { return p.id; });
    }
    fams = [...new Set(fams.filter(Boolean))];
    if (!fams.length) return;
    fetch(SB_URL + '/functions/v1/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY },
      body: JSON.stringify({
        user_ids: fams,
        title: '📢 Nuevo comunicado',
        body: titulo || 'El centro ha publicado un comunicado.',
        tag: 'comunicado',
        url: '/app.html'
      })
    }).catch(function () {});
  } catch (e) { /* silencioso */ }
}

async function enviarComunicado() {
  var titulo = ((document.getElementById('com-titulo') || {}).value || '').trim();
  var cuerpo = ((document.getElementById('com-cuerpo') || {}).value || '').trim();
  var destEl = document.getElementById('com-dest');
  var dest   = destEl ? destEl.value : 'todos';
  if (dest === 'grupo_especifico') {
    var gVal = ((document.getElementById('com-grupo-val') || {}).value || '').trim();
    if (!gVal) {
      if (msg) { msg.textContent = 'Indica el nombre del grupo.'; msg.style.color = 'var(--red)'; msg.style.display = 'block'; }
      return;
    }
    dest = 'grupo:' + gVal;
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

  // Push a las familias destinatarias (además del email), fire-and-forget
  _comPushFamilias(dest, titulo);

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

// Núcleo reutilizable de envío: inserta + email (send-comunicado) + push a familias.
async function _comEnviarNucleo(titulo, cuerpo, dest) {
  var r = await sb.from('comunicados').insert({
    centro_id: ctrId, titulo: titulo, cuerpo: cuerpo, destinatarios: dest,
    creado_por: currentUser.id, fecha: new Date().toISOString().split('T')[0], estado: 'enviado',
  }).select().single();
  if (r.error) return { ok: false, error: r.error.message };
  var enviados = 0;
  try {
    var er = await sb.functions.invoke('send-comunicado', { body: { comunicado_id: r.data.id } });
    if (!er.error && er.data && er.data.enviados != null) enviados = er.data.enviados;
  } catch (e) {}
  _comPushFamilias(dest, titulo);
  return { ok: true, enviados: enviados, id: r.data.id };
}

/* ════════ AGENTE DE COMUNICACIÓN A FAMILIAS (modo asistido) ════════ */
function _agcParse(txt) {
  if (!txt) return null;
  try {
    var c = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
    var a = c.indexOf('{'), b = c.lastIndexOf('}');
    if (a >= 0 && b > a) c = c.slice(a, b + 1);
    return JSON.parse(c);
  } catch (e) { return null; }
}

window.agenteComunicacion = function () {
  _agcEnsureStyles();
  var old = document.getElementById('agc-modal');
  if (old) old.remove();
  var w = document.createElement('div');
  w.id = 'agc-modal';
  w.className = 'agc-ov';
  w.innerHTML = '<div class="agc-modal">' +
    '<div class="agc-hd"><div style="display:flex;gap:11px;align-items:center;"><div class="agc-bot">🤖</div>' +
      '<div><div class="agc-eyebrow">AGENTE DE COMUNICACIÓN</div><h3 class="agc-ttl">Redactar comunicado a familias</h3></div></div>' +
      '<button class="agc-x" onclick="document.getElementById(\'agc-modal\').remove()">✕</button></div>' +
    '<div class="agc-bd">' +
      '<label class="agc-fl">Dime qué quieres comunicar (en pocas palabras)</label>' +
      '<textarea id="agc-brief" class="agc-in" rows="3" placeholder="Ej.: Convoca a las familias de 2ESOA a una reunión el martes 25 a las 17h en el aula B03. / Avisa de que mañana no hay clase por el día del docente."></textarea>' +
      '<button class="agc-btn agc-btn-ia" id="agc-go" onclick="window._agcRedactar()">✨ Redactar con IA</button>' +
      '<div id="agc-out"></div>' +
    '</div>' +
    '<div class="agc-ft"><div class="agc-disc">El agente redacta el borrador; tú lo revisas y editas antes de enviar. Cada familia lo recibe en su idioma al abrirlo.</div></div>' +
  '</div>';
  document.body.appendChild(w);
  w.addEventListener('click', function (e) { if (e.target === w) w.remove(); });
  setTimeout(function () { var t = document.getElementById('agc-brief'); if (t) t.focus(); }, 50);
};

window._agcRedactar = async function () {
  var brief = ((document.getElementById('agc-brief') || {}).value || '').trim();
  if (brief.length < 8) { if (typeof showToast === 'function') showToast('Describe qué quieres comunicar'); else alert('Describe qué quieres comunicar'); return; }
  var go = document.getElementById('agc-go');
  var out = document.getElementById('agc-out');
  if (go) { go.disabled = true; go.textContent = '✨ Redactando…'; }
  if (out) out.innerHTML = '<div class="agc-load">🤖 Redactando el comunicado…</div>';

  var sys = 'Eres el responsable de comunicación de un centro educativo español. A partir de una instrucción breve de dirección, redacta un comunicado para las familias: claro, cordial y profesional, listo para enviar. ' +
    'Deduce los destinatarios de la instrucción. Responde SOLO con JSON: {"titulo":"asunto breve","cuerpo":"texto del comunicado, 2-5 frases, con saludo y despedida del centro","destinatarios":"todos|solo_familias|solo_profesores|grupo:CODIGO","grupo":"código del grupo si aplica, p.ej. 2ESOA, o vacío"}. ' +
    'Usa "grupo:CODIGO" solo si la instrucción menciona un grupo concreto; si es para todas las familias usa "solo_familias"; si es para todo el centro usa "todos". No inventes datos que no estén en la instrucción.';
  var resp = await _comIA(sys, brief);
  var j = _agcParse(resp);
  if (go) { go.disabled = false; go.textContent = '✨ Volver a redactar'; }
  if (!j || !j.titulo) { if (out) out.innerHTML = '<div class="agc-err">No se pudo redactar. Inténtalo de nuevo.</div>'; return; }

  var dest = j.destinatarios || 'solo_familias';
  var grupo = j.grupo || (dest.indexOf('grupo:') === 0 ? dest.replace('grupo:', '') : '');
  var destBase = dest.indexOf('grupo:') === 0 ? 'grupo' : dest;
  var destOpts = [['solo_familias', 'Todas las familias'], ['todos', 'Todo el centro'], ['solo_profesores', 'Solo profesorado'], ['grupo', 'Familias de un grupo']];
  if (out) out.innerHTML =
    '<div class="agc-draft">' +
      '<label class="agc-fl">Asunto</label>' +
      '<input id="agc-titulo" class="agc-in" type="text" value="' + _escCom(j.titulo) + '">' +
      '<label class="agc-fl">Mensaje</label>' +
      '<textarea id="agc-cuerpo" class="agc-in" rows="7">' + _escCom(j.cuerpo || '') + '</textarea>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:160px;"><label class="agc-fl">Destinatarios</label>' +
          '<select id="agc-dest" class="agc-in" onchange="window._agcDestChange(this.value)">' +
            destOpts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === destBase ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select></div>' +
        '<div style="flex:1;min-width:120px;" id="agc-grupo-wrap"' + (destBase === 'grupo' ? '' : ' style="display:none;flex:1;min-width:120px;"') + '><label class="agc-fl">Grupo</label>' +
          '<input id="agc-grupo" class="agc-in" type="text" value="' + _escCom(grupo) + '" placeholder="Ej: 2ESOA"></div>' +
      '</div>' +
      '<button class="agc-btn agc-btn-primary" id="agc-send" onclick="window._agcEnviar()">✓ Revisar y enviar</button>' +
    '</div>';
};

window._agcDestChange = function (v) {
  var wrap = document.getElementById('agc-grupo-wrap');
  if (wrap) wrap.style.display = v === 'grupo' ? '' : 'none';
};

window._agcEnviar = async function () {
  var titulo = ((document.getElementById('agc-titulo') || {}).value || '').trim();
  var cuerpo = ((document.getElementById('agc-cuerpo') || {}).value || '').trim();
  var destBase = (document.getElementById('agc-dest') || {}).value || 'solo_familias';
  if (!titulo || !cuerpo) { alert('El asunto y el mensaje no pueden estar vacíos.'); return; }
  var dest = destBase;
  if (destBase === 'grupo') {
    var g = ((document.getElementById('agc-grupo') || {}).value || '').trim();
    if (!g) { alert('Indica el grupo.'); return; }
    dest = 'grupo:' + g;
  }
  if (!confirm('¿Enviar el comunicado ahora a "' + (destBase === 'grupo' ? dest.replace('grupo:', 'grupo ') : destBase === 'todos' ? 'todo el centro' : destBase === 'solo_profesores' ? 'el profesorado' : 'todas las familias') + '"?')) return;
  var send = document.getElementById('agc-send');
  if (send) { send.disabled = true; send.textContent = 'Enviando…'; }
  var res = await _comEnviarNucleo(titulo, cuerpo, dest);
  if (!res.ok) { if (send) { send.disabled = false; send.textContent = '✓ Revisar y enviar'; } alert('Error: ' + res.error); return; }
  var m = document.getElementById('agc-modal'); if (m) m.remove();
  if (typeof showToast === 'function') showToast('✅ Comunicado enviado' + (res.enviados ? ' · ✉ ' + res.enviados : ''));
  if (typeof loadComunicados === 'function') { try { loadComunicados(); } catch (e) {} }
};

function _agcEnsureStyles() {
  if (document.getElementById('agc-styles')) return;
  var s = document.createElement('style');
  s.id = 'agc-styles';
  s.textContent = [
    '.agc-ov{position:fixed;inset:0;background:rgba(20,20,30,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;}',
    '.agc-modal{background:var(--paper,#fff);border-radius:16px;max-width:560px;width:100%;border:1px solid var(--line,#e0e0e0);box-shadow:0 24px 70px rgba(0,0,0,.34);}',
    '.agc-hd{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--line,#e0e0e0);}',
    '.agc-bot{width:38px;height:38px;border-radius:11px;background:var(--accent-soft,#f3e1d5);display:flex;align-items:center;justify-content:center;font-size:20px;}',
    '.agc-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#888);margin-bottom:2px;}',
    '.agc-ttl{margin:0;font-size:18px;font-weight:700;color:var(--txt,#222);font-family:var(--font-display,inherit);}',
    '.agc-x{background:none;border:none;font-size:17px;color:var(--muted,#888);cursor:pointer;padding:4px 8px;border-radius:6px;}',
    '.agc-bd{padding:18px 22px;}',
    '.agc-fl{display:block;font-size:12px;font-weight:600;color:var(--txt2,#555);margin:10px 0 4px;}',
    '.agc-in{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line-2,#ccc);border-radius:8px;font-size:14px;font-family:inherit;background:var(--paper,#fff);color:var(--txt,#222);line-height:1.45;}',
    '.agc-btn{padding:9px 14px;border-radius:8px;border:1px solid var(--line-2,#ccc);background:var(--paper,#fff);color:var(--txt2,#555);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}',
    '.agc-btn-ia{width:100%;margin-top:12px;background:var(--accent-soft,#f3e1d5);color:var(--accent-ink,#7A3E1F);border-color:var(--accent-soft,#f3e1d5);}',
    '.agc-btn-primary{width:100%;margin-top:14px;background:var(--ink,#1a73e8);color:#fff;border-color:var(--ink,#1a73e8);}',
    '.agc-load,.agc-err{text-align:center;padding:18px;color:var(--muted,#888);font-size:13px;}',
    '.agc-err{color:#b83232;}',
    '.agc-draft{margin-top:14px;border-top:1px dashed var(--line-2,#ccc);padding-top:12px;}',
    '.agc-ft{padding:12px 22px;border-top:1px solid var(--line,#e0e0e0);}',
    '.agc-disc{font-size:11.5px;color:var(--muted,#888);line-height:1.5;}',
  ].join('');
  document.head.appendChild(s);
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
    .order('created_at', { ascending: false }).limit(500);
  if (!r.error && r.data) {
    _comLastData = r.data;
    _comUpdateTabBadge();
    _comInitRealtime();
  }
}
