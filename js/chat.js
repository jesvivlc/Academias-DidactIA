// ── HORARIOS POR GRUPO ──
// ── HELPERS HORARIO ──
function normalizeText(s = "") {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[¿?¡!]/g,"").trim();
}

function extractDiaHora(txt) {
  const q = normalizeText(txt);

  // Detectar "ahora", "en este momento", "actualmente"
  if (/\bahora\b|\ben este momento\b|\bactualmente\b/.test(q)) {
    const now = new Date();
    const diasNombre = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    const diaHoy = diasNombre[now.getDay()];
    const horaHoy = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
    return { dia: diaHoy, hora: horaHoy };
  }

  let dia = null;
  if (/\blunes\b/.test(q)) dia = "lunes";
  else if (/\bmartes\b/.test(q)) dia = "martes";
  else if (/\bmiercoles\b/.test(q)) dia = "miercoles";
  else if (/\bjueves\b/.test(q)) dia = "jueves";
  else if (/\bviernes\b/.test(q)) dia = "viernes";
  // Detectar "hoy"
  else if (/\bhoy\b/.test(q)) {
    const diasNombre = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    dia = diasNombre[new Date().getDay()];
  }

  let hora = null;
  let m = q.match(/\b(\d{1,2})\s*am\b/);
  if (m) { hora = String(parseInt(m[1],10)).padStart(2,"0") + ":00"; }
  if (!hora) { m = q.match(/\b(\d{1,2})\s*pm\b/); if (m) { let hh=parseInt(m[1],10); if(hh<12)hh+=12; hora=String(hh).padStart(2,"0")+":00"; } }
  if (!hora) { m = q.match(/\ba\s+las\s+(\d{1,2})[:.h]?(\d{2})?h?\b/); if (m) { hora=String(parseInt(m[1],10)).padStart(2,"0")+":"+(m[2]||"00"); } }
  if (!hora) { m = q.match(/\b(\d{1,2})[:.](\d{2})h?\b/); if (m) { hora=String(parseInt(m[1],10)).padStart(2,"0")+":"+m[2]; } }
  return { dia, hora };
}

function horaMatchesSlot(horaUsuario, horaInicio, horaFin) {
  if (!horaUsuario || !horaInicio) return false;
  const hu = String(horaUsuario).slice(0,5);
  const hi = String(horaInicio).slice(0,5);
  const hf = String(horaFin||"").slice(0,5);
  if (hu === hi) return true;
  if (hf) return hu >= hi && hu < hf;
  return false;
}

async function getHorarioGrupo(grupoHorario) {
  if (!sb || !ctrId) return null;
  const { data, error } = await sb.from("horarios_grupo")
    .select("dia,tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre,aula")
    .eq("centro_id", ctrId)
    .eq("grupo_horario", grupoHorario)
    .order("dia").order("tramo");
  if (error) return null;
  return data;
}

async function getClaseExactaGrupo(grupoHorario, dia, hora) {
  if (!sb || !ctrId || !grupoHorario || !dia || !hora) return null;
  const { data, error } = await sb.from("horarios_grupo")
    .select("dia,tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre,aula")
    .eq("centro_id", ctrId)
    .eq("grupo_horario", grupoHorario)
    .eq("dia", dia);
  if (error || !data || !data.length) return null;
  return data.find(f => horaMatchesSlot(hora, f.hora_inicio, f.hora_fin)) || null;
}

function formatHorarioGrupo(rows, solodia) {
  if (!rows || !rows.length) return "Sin datos de horario.";
  const diasOrden = ["lunes","martes","miercoles","jueves","viernes"];
  const porDia = {};
  for (const r of rows) {
    if (solodia && r.dia !== solodia) continue;
    if (!porDia[r.dia]) porDia[r.dia] = {};
    if (!porDia[r.dia][r.tramo]) porDia[r.dia][r.tramo] = [];
    porDia[r.dia][r.tramo].push(r);
  }
  let txt = "";
  const diasMostrar = solodia ? [solodia] : diasOrden;
  for (const dia of diasMostrar) {
    if (!porDia[dia]) continue;
    txt += `\n${dia.toUpperCase()}:\n`;
    for (const tramo of Object.keys(porDia[dia]).sort((a,b)=>Number(a)-Number(b))) {
      const fila = porDia[dia][tramo][0];
      const hi = String(fila.hora_inicio || "").slice(0,5);
      const hf = String(fila.hora_fin || "").slice(0,5);
      const horasStr = hi && hf ? `${hi}-${hf}` : `Tramo ${tramo}`;
      for (const c of porDia[dia][tramo]) {
        const aula = c.aula ? ` (${c.aula})` : "";
        const prof = c.profesor_nombre ? ` — ${c.profesor_nombre}` : "";
        txt += `  ${horasStr}: ${c.actividad_nombre}${prof}${aula}\n`;
      }
    }
  }
  return txt || "Sin datos.";
}

function _tokenMatch(nombre, palabras) {
  // Divide el nombre en tokens exactos y comprueba que cada palabra buscada coincide con algún token
  const tokens = nombre.toLowerCase().split(/[\s,]+/).filter(t => t.length > 0);
  return palabras.every(p => tokens.some(t => t === p.toLowerCase()));
}

async function buscarGrupoAlumno(nombreBuscado) {
  if (!sb || !ctrId) return null;
  const palabras = nombreBuscado.trim().split(/\s+/).filter(p => p.length >= 3);
  if (!palabras.length) return null;

  // Verificar que no es un profesor (evita confundir Elisa Tarín profesora con alumna)
  const { data: profCheck } = await sb.from("horarios")
    .select("profesor").eq("centro_id", ctrId)
    .ilike("profesor", `%${palabras[0]}%`).limit(5);
  if (profCheck && profCheck.length > 0) {
    const esProfesor = profCheck.some(p => _tokenMatch(p.profesor || "", palabras));
    if (esProfesor) return null;
  }

  // Traer candidatos con ilike para cada palabra (búsqueda amplia en BD)
  let query = sb.from("alumnos")
    .select("nombre,grupo_horario,curso")
    .eq("centro_id", ctrId);
  for (const p of palabras) {
    query = query.ilike("nombre", `%${p}%`);
  }
  const { data, error } = await query.limit(20);
  if (error || !data || !data.length) return null;

  // Filtrar en JS exigiendo coincidencia exacta de tokens (evita elisa→elisabet)
  const filtrados = data.filter(a => _tokenMatch(a.nombre, palabras));
  if (!filtrados.length) return null;
  return filtrados;
}

async function getProfesoresLibres(dia, hora) {
  if (!sb || !ctrId) return null;

  // Todos los profesores del centro
  const { data: todos } = await sb.from("horarios_grupo")
    .select("profesor_nombre")
    .eq("centro_id", ctrId)
    .not("profesor_nombre", "is", null);
  if (!todos?.length) return null;

  const todosProfes = [...new Set(todos.map(r => r.profesor_nombre).filter(Boolean))].sort();

  // Profesores con clase en este tramo
  const { data: conClase } = await sb.from("horarios_grupo")
    .select("profesor_nombre,actividad_nombre,grupo_horario,aula")
    .eq("centro_id", ctrId)
    .eq("dia", dia)
    .filter("hora_inicio", "lte", hora + ":00")
    .filter("hora_fin", "gt", hora + ":00");

  const ocupados = new Set((conClase || []).map(r => r.profesor_nombre).filter(Boolean));
  const libres = todosProfes.filter(p => !ocupados.has(p));
  const enClase = (conClase || []).filter(r => r.profesor_nombre);

  return { libres, enClase, total: todosProfes.length };
}

async function responderProfesoresLibres(txt) {
  const ahora = new Date();
  const diasNombre = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  const dia = diasNombre[ahora.getDay()];
  const hora = String(ahora.getHours()).padStart(2,"0") + ":" + String(ahora.getMinutes()).padStart(2,"0");

  if (dia === "sabado" || dia === "domingo") {
    return "<p>Hoy es fin de semana, no hay clases programadas.</p>";
  }

  const resultado = await getProfesoresLibres(dia, hora);
  if (!resultado) {
    return "<p>No se han podido obtener los datos de horarios en este momento.</p>";
  }

  const { libres, enClase } = resultado;

  let html = `<p><strong>Profesores disponibles ahora (${hora}):</strong></p>`;

  if (libres.length === 0) {
    html += "<p>Todos los profesores tienen clase en este momento.</p>";
  } else {
    html += "<ul>";
    libres.forEach(p => { html += `<li>${p}</li>`; });
    html += "</ul>";
  }

  if (enClase.length > 0) {
    html += `<p style="font-size:12px;color:var(--txt3);margin-top:8px;">Con clase ahora: ${enClase.map(c => c.profesor_nombre).join(", ")}</p>`;
  }

  return html;
}

async function buildContext() {
  if (!sb || !ctrId) return "Sin información disponible.";
  let ctx = `Centro: ${ctrName}\n\n`;

  // Personal user context
  ctx += `USUARIO ACTUAL:\n`;
  ctx += `- Nombre: ${currentUserName}\n`;
  ctx += `- Rol: ${role}\n`;
  if (role === "familia" && currentUserAlumnos.length > 0) {
    ctx += `- Hijos matriculados en este centro:\n`;
    currentUserAlumnos.forEach(a => { ctx += `  · ${a.nombre} (${a.curso || "sin curso"})\n`; });
  }
  ctx += "\n";

  try {
    const { data } = await sb.from("info_centro").select("nombre_config,datos,visible_para").eq("centro_id", ctrId);
    if (data?.length) {
      // Filter by role — show 'todos' to everyone, role-specific only to that role
      const filtered = data.filter(r => {
        const vp = r.visible_para || "todos";
        if (vp === "todos") return true;
        if (vp === role) return true;
        if (role === "admin" || role === "superadmin") return true;
        return false;
      });
      if (filtered.length) {
        ctx += "INFORMACIÓN DEL CENTRO:\n";
        filtered.forEach(r => { ctx += `- ${r.nombre_config.replace(/_/g," ")}: ${r.datos?.valor || JSON.stringify(r.datos)}\n`; });
        ctx += "\n";
      }
    }
  } catch(e) {}

  try {
    if (role === "profesional" && currentUserName) {
      const nameParts = currentUserName.split(" ").filter(p => p.length > 2);
      if (nameParts.length > 0) {
        const { data } = await sb.from("horarios")
          .select("dia,hora,profesor,actividad")
          .eq("centro_id", ctrId)
          .ilike("profesor", `%${nameParts[0]}%`)
          .order("dia").order("hora")
          .limit(50);
        if (data?.length) {
          ctx += "MI HORARIO DE CLASES:\n";
          data.forEach(h => { ctx += `- ${h.dia} a las ${h.hora}: ${h.actividad} (${h.profesor})\n`; });
          ctx += "\n";
        }
      }
    }
  } catch(e) {}
  return ctx;
}

function autoResize(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight,120)+"px"; }
function handleKey(e) { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }
function askQ(t) { document.getElementById("chat-inp").value = t; sendMsg(); }
function ts() { return new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}); }

function addMsg(r, html) {
  const w = document.getElementById("welcome"); if (w) w.style.display = "none";
  const msgs = document.getElementById("chat-msgs");
  const d = document.createElement("div"); d.className = "msg "+r;
  const av = r === "user" ? (role === "familia" ? "F" : "P") : "D";
  d.innerHTML = `<div class="msg-av">${av}</div><div class="msg-body"><div class="msg-bbl">${html}</div><div class="msg-time">${ts()}</div></div>`;
  msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
}

async function sendMsg() {
  if (busy) return;
  const inp = document.getElementById("chat-inp");
  const txt = inp.value.trim(); if (!txt) return;
  inp.value = ""; inp.style.height = "auto";
  busy = true; document.getElementById("send-btn").disabled = true;
  document.getElementById("load-bar").classList.add("show");
  addMsg("user", `<p>${txt.replace(/</g,"&lt;")}</p>`);
  history.push({ role:"user", content:txt });
  addToHistorial(txt);
  document.getElementById("typing").classList.add("show");
  document.getElementById("chat-msgs").scrollTop = 9999;

  // ── Detectar consulta de horario de alumno ──
  let horarioGrupoCtx = "";
  let respuestaHorarioDirecta = null;

  // Contexto conversacional: recordar último día/hora preguntado
  if (!window._ultimoDiaHora) window._ultimoDiaHora = { dia: null, hora: null };

  // Detectar consulta de horario: keywords explícitas O mensaje con día+hora
  const tieneDiaHora = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|ahora)\b/i.test(txt) && /\b(\d{1,2}[:.h]\d{2}|\d{1,2}\s*[ap]m|ahora)\b/i.test(txt);
  const esConsultaHorario = /horario|clase|asignatura|qu[eé] tiene|qu[eé] hay|profesor|qui[eé]n da|materia|qu[eé] le toca|cu[aá]ndo tiene|aula|d[oó]nde tiene/i.test(txt) || tieneDiaHora;

  // Detectar consulta de guardias/profesores libres
  const esConsultaGuardia = /libre|disponible|guardia|sin clase|no tiene clase|quién puede|quien puede|puede cubrir|puede sustituir/i.test(txt);
  if (esConsultaGuardia && (role === "admin" || role === "profesional" || role === "superadmin")) {
    const respGuardia = await responderProfesoresLibres(txt);
    document.getElementById("typing").classList.remove("show");
    history.push({ role:"assistant", content: respGuardia });
    addMsg("bot", respGuardia);
    busy = false;
    document.getElementById("send-btn").disabled = false;
    document.getElementById("load-bar").classList.remove("show");
    document.getElementById("chat-inp").focus();
    return;
  }

  if (esConsultaHorario) {
    let grupoTarget = null;
    let alumnoTarget = null;

    // 1. Prioridad: hijos vinculados si es familia
    if (role === "familia" && currentUserAlumnos.length > 0) {
      for (const alumno of currentUserAlumnos) {
        const partes = (alumno.nombre || "").split(/[\s,]+/).filter(p => p.length > 3);
        const menciona = partes.some(p => txt.toLowerCase().includes(p.toLowerCase()));
        if (menciona || currentUserAlumnos.length === 1) {
          if (alumno.grupo_horario) { grupoTarget = alumno.grupo_horario; alumnoTarget = alumno.nombre; break; }
        }
      }
    }

    // 1b. Detección directa de grupo en el texto (ej: "1ºESO A", "2ESOB", "1 BAC A")
    if (!grupoTarget) {
      const GRUPOS_VALIDOS_MAP = {
        "1esoa":["1ºeso a","1 eso a","1esoa","1º eso a","1°eso a","1° eso a"],
        "1esob":["1ºeso b","1 eso b","1esob","1º eso b","1°eso b"],
        "1esoc":["1ºeso c","1 eso c","1esoc","1º eso c","1°eso c"],
        "2esoa":["2ºeso a","2 eso a","2esoa","2º eso a","2°eso a"],
        "2esob":["2ºeso b","2 eso b","2esob","2º eso b","2°eso b"],
        "2esoc":["2ºeso c","2 eso c","2esoc","2º eso c","2°eso c"],
        "3esoa":["3ºeso a","3 eso a","3esoa","3º eso a","3°eso a"],
        "3esob":["3ºeso b","3 eso b","3esob","3º eso b","3°eso b"],
        "3esoc":["3ºeso c","3 eso c","3esoc","3º eso c","3°eso c"],
        "4esoa":["4ºeso a","4 eso a","4esoa","4º eso a","4°eso a"],
        "4esob":["4ºeso b","4 eso b","4esob","4º eso b","4°eso b"],
        "4esoc":["4ºeso c","4 eso c","4esoc","4º eso c","4°eso c"],
        "1baca":["1ºbac a","1 bac a","1baca","1º bac a","1°bac a","1bach a","1º bach a"],
        "1bacb":["1ºbac b","1 bac b","1bacb","1º bac b","1°bac b","1bach b"],
        "2baca":["2ºbac a","2 bac a","2baca","2º bac a","2°bac a","2bach a"],
        "2bacb":["2ºbac b","2 bac b","2bacb","2º bac b","2°bac b","2bach b"],
        "1ib":["1ºib","1 ib","1ib","1º ib","1°ib"],
        "2ib":["2ºib","2 ib","2ib","2º ib","2°ib"],
      };
      const txtNorm = normalizeText(txt);
      for (const [grupo, variantes] of Object.entries(GRUPOS_VALIDOS_MAP)) {
        if (variantes.some(v => txtNorm.includes(normalizeText(v)))) {
          grupoTarget = grupo.toUpperCase().replace("ESO","ESO").replace("BAC","BAC");
          // Normalizar: 1esoa → 1ESOA
          grupoTarget = grupo.replace(/([0-9]+)(eso|bac|ib)([abc]?)/i,
            (_, n, nivel, letra) => n + nivel.toUpperCase() + letra.toUpperCase());
          break;
        }
      }
    }

    // 1c. Búsqueda por nombre de profesor en horarios_grupo
    if (!grupoTarget) {
      const STOPWORDS_PROF = new Set(["que","tiene","hay","clase","horario","cual","cuando","donde","como","para","lunes","martes","miercoles","jueves","viernes","hoy","ahora","mañana","manana","dime","de","del","el","la","los","las"]);
      const palabrasProf = txt.replace(/[¿?¡!.,;:]/g,"").split(/\s+/).filter(p => p.length >= 3 && !STOPWORDS_PROF.has(p.toLowerCase()));
      for (const palabra of palabrasProf) {
        const { data: profRows } = await sb.from("horarios_grupo")
          .select("profesor_nombre,grupo_horario,dia,tramo,hora_inicio,hora_fin,actividad_nombre,aula")
          .eq("centro_id", ctrId)
          .ilike("profesor_nombre", `%${palabra}%`)
          .limit(50);
        if (!profRows?.length) continue;
        // Filtro JS: el nombre debe contener TODAS las palabras buscadas como tokens exactos
        const filasFiltradas = profRows.filter(r => _tokenMatch(r.profesor_nombre, palabrasProf));
        if (!filasFiltradas.length) continue;
        const profNombre = filasFiltradas[0].profesor_nombre;
        const { dia: diaProf } = extractDiaHora(txt);
        const diaFinal = diaProf || (window._ultimoDiaHora && window._ultimoDiaHora.dia) || null;
        if (diaFinal) {
          const clasesDia = filasFiltradas.filter(r => r.dia === diaFinal).sort((a,b) => a.tramo - b.tramo);
          if (clasesDia.length) {
            let html = `<p><strong>${profNombre}</strong> — horario del ${diaFinal}:</p><ul>`;
            for (const c of clasesDia) {
              const hi = String(c.hora_inicio || "").slice(0,5);
              const hf = String(c.hora_fin || "").slice(0,5);
              const aula = c.aula ? ` · aula ${c.aula}` : "";
              html += `<li><strong>${hi}–${hf}:</strong> ${c.actividad_nombre} (${c.grupo_horario})${aula}</li>`;
            }
            html += "</ul>";
            respuestaHorarioDirecta = html;
          } else {
            respuestaHorarioDirecta = `<p><strong>${profNombre}</strong> no tiene clases programadas el ${diaFinal}.</p>`;
          }
        } else {
          // Sin día → horario semanal del profesor
          const diasOrden = ["lunes","martes","miercoles","jueves","viernes"];
          let html = `<p><strong>${profNombre}</strong> — horario semanal:</p>`;
          for (const diaS of diasOrden) {
            const clasesDia = filasFiltradas.filter(r => r.dia === diaS).sort((a,b) => a.tramo - b.tramo);
            if (!clasesDia.length) continue;
            html += `<p><strong>${diaS.toUpperCase()}</strong></p><ul>`;
            for (const c of clasesDia) {
              const hi = String(c.hora_inicio || "").slice(0,5);
              const hf = String(c.hora_fin || "").slice(0,5);
              html += `<li>${hi}–${hf}: ${c.actividad_nombre} (${c.grupo_horario})</li>`;
            }
            html += "</ul>";
          }
          respuestaHorarioDirecta = html;
        }
        break;
      }
    }

    // 2. Búsqueda libre por nombre de alumno
    if (!grupoTarget && !respuestaHorarioDirecta) {
      const STOPWORDS = new Set([
        "que","tiene","hay","clase","horario","cual","cuando","donde","como","para",
        "lunes","martes","miercoles","jueves","viernes","manana","hoy","ahora","las","los",
        "del","este","esta","sus","el","la","de","a","en","am","pm","y","o",
        "8am","8","qué","cuál","cuándo","dónde","cómo","quien","quién"
      ]);
      const palabras = txt.replace(/[¿?¡!.,;:]/g,"").split(/\s+/)
        .filter(p => p.length >= 3 && !STOPWORDS.has(normalizeText(p)));

      // Paso 1: pares (normal e invertido)
      const pares = [];
      for (let i = 0; i < palabras.length - 1; i++) {
        pares.push(palabras[i] + " " + palabras[i+1]);
        pares.push(palabras[i+1] + " " + palabras[i]);
      }
      for (const cand of pares) {
        const resultados = await buscarGrupoAlumno(cand);
        if (resultados && resultados.length === 1 && resultados[0].grupo_horario) {
          grupoTarget = resultados[0].grupo_horario; alumnoTarget = resultados[0].nombre; break;
        }
      }

      // Paso 2: palabras sueltas únicas
      if (!grupoTarget) {
        for (const palabra of palabras) {
          const resultados = await buscarGrupoAlumno(palabra);
          if (resultados && resultados.length === 1 && resultados[0].grupo_horario) {
            grupoTarget = resultados[0].grupo_horario; alumnoTarget = resultados[0].nombre; break;
          }
        }
      }
    }

    // 3. Extraer día y hora — usar contexto conversacional si no hay en el mensaje
    let dia, hora;
    if (!respuestaHorarioDirecta) {
      ({ dia, hora } = extractDiaHora(txt));
      if (!dia && window._ultimoDiaHora.dia) dia = window._ultimoDiaHora.dia;
      if (!hora && window._ultimoDiaHora.hora) hora = window._ultimoDiaHora.hora;
      // Guardar para próxima pregunta
      if (dia) window._ultimoDiaHora.dia = dia;
      if (hora) window._ultimoDiaHora.hora = hora;
    }

    // 4. Resolver clase exacta (sin Gemini)
    if (grupoTarget && dia && hora) {
      const filasDia = await (async () => {
        const { data } = await sb.from("horarios_grupo")
          .select("dia,tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre,aula")
          .eq("centro_id", ctrId).eq("grupo_horario", grupoTarget).eq("dia", dia);
        return data || [];
      })();
      // Filtrar por hora y tomar solo la primera coincidencia (evitar optativas duplicadas)
      const claseExacta = filasDia.find(f => horaMatchesSlot(hora, f.hora_inicio, f.hora_fin)) || null;
      if (claseExacta) {
        respuestaHorarioDirecta =
          `<p><strong>${alumnoTarget || "El alumno"}</strong> (grupo ${grupoTarget}) el ${dia} a las ${hora} tiene:</p>` +
          `<p><strong>${claseExacta.actividad_nombre || "clase"}</strong>` +
          `${claseExacta.profesor_nombre ? ` con <strong>${claseExacta.profesor_nombre}</strong>` : ""}` +
          `${claseExacta.aula ? ` en el aula <strong>${claseExacta.aula}</strong>` : ""}.</p>`;
        horarioGrupoCtx =
          `\n\nCONSULTA RESUELTA:\n- Alumno: ${alumnoTarget}\n- Grupo: ${grupoTarget}\n` +
          `- ${dia} a las ${hora}: ${claseExacta.actividad_nombre}` +
          `${claseExacta.profesor_nombre ? ` (${claseExacta.profesor_nombre})` : ""}` +
          `${claseExacta.aula ? ` aula ${claseExacta.aula}` : ""}\n`;
      }
    }

    // 5. Fallback: si hay día concreto → respuesta directa sin Gemini; si no → contexto para Gemini
    if (!respuestaHorarioDirecta && grupoTarget) {
      const filas = await getHorarioGrupo(grupoTarget);
      if (filas && filas.length) {
        const diaFiltro = dia || null;
        if (diaFiltro) {
          // Respuesta directa con todas las clases del día
          const clasDia = filas.filter(f => f.dia === diaFiltro).sort((a,b) => a.tramo - b.tramo);
          if (clasDia.length) {
            const nombreAlumno = alumnoTarget || `Grupo ${grupoTarget}`;
            let html = `<p><strong>${nombreAlumno}</strong> — horario del ${diaFiltro}:</p><ul>`;
            for (const c of clasDia) {
              const hi = String(c.hora_inicio || "").slice(0,5);
              const hf = String(c.hora_fin || "").slice(0,5);
              const prof = c.profesor_nombre ? ` <em>(${c.profesor_nombre})</em>` : "";
              const aula = c.aula ? ` · aula ${c.aula}` : "";
              html += `<li><strong>${hi}–${hf}:</strong> ${c.actividad_nombre}${prof}${aula}</li>`;
            }
            html += "</ul>";
            respuestaHorarioDirecta = html;
          }
        } else {
          // Sin día → inyectar contexto para Gemini (horario semanal)
          horarioGrupoCtx =
            `\n\nHORARIO DEL GRUPO ${grupoTarget}${alumnoTarget ? " (alumno: " + alumnoTarget + ")" : ""}:\n`
            + formatHorarioGrupo(filas)
            + `\nMuestra TODAS las clases de la lista anterior. No omitas ninguna.`;
        }
      }
    }
  }

  if (esConsultaHorario && !respuestaHorarioDirecta && !horarioGrupoCtx) {
    document.getElementById("typing").classList.remove("show");
    const msgNoEncontrado = `<p>No he encontrado información de horario para esa consulta en la base de datos de ${ctrName}.</p><p>Puedes preguntar por el nombre completo del alumno, o por el grupo (por ejemplo: "1ESO A", "2BAC B").</p>`;
    history.push({ role:"assistant", content: msgNoEncontrado });
    addMsg("bot", msgNoEncontrado);
    busy = false;
    document.getElementById("send-btn").disabled = false;
    document.getElementById("load-bar").classList.remove("show");
    document.getElementById("chat-inp").focus();
    return;
  }

  // Respuesta directa sin Gemini si ya tenemos la clase exacta
  if (respuestaHorarioDirecta) {
    document.getElementById("typing").classList.remove("show");
    history.push({ role:"assistant", content: respuestaHorarioDirecta });
    addMsg("bot", respuestaHorarioDirecta);
    busy = false;
    document.getElementById("send-btn").disabled = false;
    document.getElementById("load-bar").classList.remove("show");
    document.getElementById("chat-inp").focus();
    return;
  }

  const ctx = await buildContext();
  // Current date info for the chatbot
  const now = new Date();
  const dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaHoy = `${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
  const diaManana = dias[(now.getDay() + 1) % 7];

  const rolDesc = {
    familia: `familiar de alumnos del centro. Sus hijos son: ${currentUserAlumnos.map(a=>a.nombre+" ("+a.curso+")").join(", ") || "no vinculados aún"}`,
    profesional: `profesional del centro educativo llamado ${currentUserName}`,
    admin: `administrador del centro`,
    superadmin: `superadministrador de la plataforma`
  };
  const instruccionHorario = horarioGrupoCtx
    ? `\nCUANDO HAY UN HORARIO EN EL CONTEXTO: Debes listar TODAS las clases que aparecen, una por línea, con su hora y asignatura. No resumas, no omitas ninguna, no digas "entre otras". Si el contexto tiene 4 clases, muestra las 4.`
    : "";

  const sys = `Eres DidactIA, el asistente virtual exclusivo de ${ctrName}.
Hoy es ${fechaHoy}. Mañana es ${diaManana}. Usa esta información para responder preguntas sobre fechas sin pedirle al usuario que las especifique.
Conoces perfectamente al usuario con el que hablas: se llama ${currentUserName} y es ${rolDesc[role] || role}.
NO le pidas que se identifique — ya sabes quién es. Dirígete a él por su nombre cuando sea natural.
Si pregunta por su horario, el de su hijo, o información personal, responde directamente con los datos que tienes.
Solo respondes con información de ESTE centro. Si no tienes algo, sugiere contactar con secretaría.
Responde en español, de forma amable. Usa HTML simple (<p>,<ul><li>,<strong>) cuando sea útil.${instruccionHorario}
No reveles información confidencial de otros alumnos o profesores a usuarios que no deban verla.

CONTEXTO EN TIEMPO REAL:
${ctx}${horarioGrupoCtx}`;

  try {
    // Formato Gemini: historial completo con system prompt en el primer mensaje
    const geminiContents = [];
    // Construir historial: todos los turnos anteriores excepto el último
    const prevMsgs = history.slice(0, -1).slice(-10); // Limitar a últimos 10 mensajes para evitar contextos gigantes
    const lastMsg = history[history.length - 1];
    // Primer mensaje lleva el system prompt pegado
    if (prevMsgs.length === 0) {
      // Primera pregunta: system + pregunta juntos
      geminiContents.push({ role:"user", parts:[{ text: sys + "\n\nPregunta: " + lastMsg.content }] });
    } else {
      // Historial previo
      for (let i = 0; i < prevMsgs.length; i++) {
        const msg = prevMsgs[i];
        const isFirst = i === 0;
        const txt = isFirst && msg.role === "user" ? sys + "\n\nPregunta: " + msg.content : msg.content;
        geminiContents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: txt }]
        });
      }
      // Último mensaje (la pregunta actual)
      geminiContents.push({ role:"user", parts:[{ text: lastMsg.content }] });
    }
    const res = await fetch(API, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
        "apikey": ANON_KEY
      },
      body: JSON.stringify({ contents: geminiContents })
    });
    const d = await res.json();
    const reply = d.candidates?.[0]?.content?.parts?.[0]?.text || d.text || "Lo siento, no pude procesar tu consulta.";
    history.push({ role:"assistant", content:reply });
    document.getElementById("typing").classList.remove("show");
    addMsg("bot", reply);
  } catch(e) {
    document.getElementById("typing").classList.remove("show");
    addMsg("bot","<p>Error de conexión. Por favor, inténtalo de nuevo.</p>");
  }
  busy = false; document.getElementById("send-btn").disabled = false;
  document.getElementById("load-bar").classList.remove("show");
  document.getElementById("chat-inp").focus();
}