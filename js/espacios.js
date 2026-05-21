// ── MÓDULO ESPACIOS / SALAS ──
async function loadEspacios() {
  var c = document.getElementById('espacios-container');
  if (!c) return;
  c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:20px;"><span class="spin">⟳</span> Cargando…</div>';

  var hoy = new Date().toISOString().split('T')[0];

  var results = await Promise.all([
    sb.from('espacios').select('*').eq('centro_id', ctrId).order('nombre'),
    sb.from('reservas_espacios').select('*,profiles(full_name)').eq('centro_id', ctrId).eq('fecha', hoy)
  ]);
  var espacios = results[0].data;
  var eErr     = results[0].error;
  var reservas = results[1].data || [];

  if (eErr) { c.innerHTML = '<div style="color:var(--red);font-size:13px;">Error al cargar espacios: ' + eErr.message + '</div>'; return; }
  if (!espacios || !espacios.length) {
    var canAdd = (role === 'admin' || role === 'superadmin');
    c.innerHTML = '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:16px;">No hay espacios registrados.'
      + (canAdd ? '<br><br><button class="btn btn-p" onclick="mostrarFormNuevoEspacio()">+ Añadir primer espacio</button>' : '')
      + '</div>';
    return;
  }

  var tramoLabels = {
    1:'T1 · 08:50–09:45', 2:'T2 · 09:45–10:40', 3:'T3 · 10:40–11:35',
    4:'T4 · 12:00–12:55', 5:'T5 · 12:55–13:50', 6:'T6 · 13:50–14:45',
    7:'T7 · 15:10–16:05', 8:'T8 · 16:05–17:00'
  };
  var tramos = [1, 2, 3, 4, 5, 6, 7, 8];

  var reservaMap = {};
  reservas.forEach(function(r) {
    if (!reservaMap[r.espacio_id]) reservaMap[r.espacio_id] = {};
    reservaMap[r.espacio_id][r.tramo] = r;
  });

  var canAdd = (role === 'admin' || role === 'superadmin');
  var html = '<div style="overflow-x:auto;">'
    + '<table class="tbl"><thead><tr>'
    + '<th style="min-width:130px;">Espacio</th>'
    + tramos.map(function(t) { return '<th style="min-width:80px;font-size:11px;">' + tramoLabels[t] + '</th>'; }).join('')
    + (canAdd ? '<th></th>' : '')
    + '</tr></thead><tbody>'
    + espacios.map(function(e) {
      var celdas = tramos.map(function(t) {
        var res = reservaMap[e.id] && reservaMap[e.id][t];
        if (res) {
          var nombre = (res.profiles && res.profiles.full_name) ? res.profiles.full_name.split(' ')[0] : '—';
          var canDelete = res.reservado_por === currentUser.id || role === 'admin' || role === 'superadmin';
          return '<td style="background:#fce8e6;text-align:center;padding:6px;">'
            + '<div style="font-size:11px;color:#a50e0e;font-weight:500;">Ocupado</div>'
            + '<div style="font-size:10px;color:var(--txt3);">' + nombre + '</div>'
            + (canDelete ? '<button onclick="cancelarReserva(\'' + res.id + '\')" style="background:none;border:none;cursor:pointer;color:#a50e0e;font-size:11px;padding:2px 4px;" title="Cancelar reserva">✕</button>' : '')
            + '</td>';
        }
        return '<td style="text-align:center;padding:6px;">'
          + '<button onclick="reservarEspacio(\'' + e.id + '\',\'' + e.nombre.replace(/'/g,"\\'") + '\',' + t + ')" style="background:var(--ink-ll);border:1px solid var(--ink-l);color:var(--ink);border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer;">Reservar</button>'
          + '</td>';
      }).join('');
      var meta = e.capacidad ? '<br><span style="font-size:11px;color:var(--txt3);">' + e.capacidad + ' p.</span>' : '';
      var deleteBtn = canAdd ? '<td><button onclick="eliminarEspacio(\'' + e.id + '\')" style="background:none;border:none;cursor:pointer;color:#a50e0e;font-size:12px;padding:4px;" title="Eliminar espacio">✕</button></td>' : '';
      return '<tr><td><strong>' + e.nombre + '</strong>' + meta + '</td>' + celdas + deleteBtn + '</tr>';
    }).join('')
    + '</tbody></table></div>';

  if (canAdd) {
    html += '<div style="margin-top:12px;">'
      + '<button class="btn btn-s" onclick="mostrarFormNuevoEspacio()">+ Añadir espacio</button>'
      + '</div>'
      + '<div id="form-nuevo-espacio" style="display:none;margin-top:12px;display:none;">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:400px;">'
      + '<div><label class="lbl">Nombre del espacio</label><input class="fi" id="nuevo-espacio-nombre" placeholder="Ej: Sala de usos múltiples" /></div>'
      + '<div><label class="lbl">Capacidad (opcional)</label><input class="fi" type="number" id="nuevo-espacio-cap" placeholder="30" /></div>'
      + '</div>'
      + '<div style="margin-top:8px;display:flex;gap:8px;">'
      + '<button class="btn btn-p" onclick="crearEspacio()">Guardar</button>'
      + '<div id="espacio-msg" style="display:none;font-size:13px;align-self:center;"></div>'
      + '</div></div>';
  }

  c.innerHTML = html;
}

async function reservarEspacio(espacioId, espacioNombre, tramo) {
  var motivo = prompt('Reservar "' + espacioNombre + '" (tramo ' + tramo + ')\nMotivo (opcional):');
  if (motivo === null) return;

  var hoy = new Date().toISOString().split('T')[0];
  var tramoHoras = {
    1:{hi:'08:50',hf:'09:45'}, 2:{hi:'09:45',hf:'10:40'}, 3:{hi:'10:40',hf:'11:35'},
    4:{hi:'12:00',hf:'12:55'}, 5:{hi:'12:55',hf:'13:50'}, 6:{hi:'13:50',hf:'14:45'},
    7:{hi:'15:10',hf:'16:05'}, 8:{hi:'16:05',hf:'17:00'}
  };
  var t = tramoHoras[tramo];

  var r = await sb.from('reservas_espacios').insert({
    centro_id: ctrId,
    espacio_id: espacioId,
    fecha: hoy,
    tramo: tramo,
    hora_inicio: t.hi,
    hora_fin: t.hf,
    reservado_por: currentUser.id,
    motivo: motivo || null
  });

  if (r.error) alert('Error al reservar: ' + r.error.message);
  else await loadEspacios();
}

async function cancelarReserva(id) {
  if (!confirm('¿Cancelar esta reserva?')) return;
  var r = await sb.from('reservas_espacios').delete().eq('id', id);
  if (r.error) alert('Error: ' + r.error.message);
  else await loadEspacios();
}

function mostrarFormNuevoEspacio() {
  var f = document.getElementById('form-nuevo-espacio');
  if (f) { f.style.display = f.style.display === 'none' ? 'block' : 'none'; }
}

async function crearEspacio() {
  var nombre = (document.getElementById('nuevo-espacio-nombre') || {}).value && document.getElementById('nuevo-espacio-nombre').value.trim();
  var cap    = document.getElementById('nuevo-espacio-cap') ? parseInt(document.getElementById('nuevo-espacio-cap').value) || null : null;
  var msg    = document.getElementById('espacio-msg');

  if (!nombre) { if (msg) { msg.textContent = 'El nombre es obligatorio.'; msg.style.color = 'var(--red)'; msg.style.display = 'block'; } return; }

  var r = await sb.from('espacios').insert({ centro_id: ctrId, nombre: nombre, capacidad: cap });
  if (r.error) {
    if (msg) { msg.textContent = 'Error: ' + r.error.message; msg.style.color = 'var(--red)'; msg.style.display = 'block'; }
  } else {
    await loadEspacios();
  }
}

async function eliminarEspacio(id) {
  if (!confirm('¿Eliminar este espacio? Se eliminarán también sus reservas.')) return;
  var r = await sb.from('espacios').delete().eq('id', id);
  if (r.error) alert('Error: ' + r.error.message);
  else await loadEspacios();
}
