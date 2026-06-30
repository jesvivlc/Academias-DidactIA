/* Dashboard — admin and teacher variants */

function Sparkline({ data, color = "var(--ink)" }) {
  const w = 100, h = 28;
  const max = Math.max(...data), min = Math.min(...data);
  const r = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / r) * h * 0.85 - h * 0.075}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity="0.08" stroke="none" />
    </svg>
  );
}

function StatTile({ num, label, tone, icon, spark, delta, onClick }) {
  const I = icon;
  return (
    <div className="stat" data-tone={tone} onClick={onClick}>
      <div className="stat__bar" />
      {I && <div className="stat__icon"><I /></div>}
      <div className="stat__num">{num}</div>
      <div className="stat__label">{label}</div>
      {delta && <div className="stat__delta">{delta}</div>}
      {spark && <Sparkline data={spark} color={
        tone === "warning" ? "var(--warning)" :
        tone === "success" ? "var(--success)" :
        tone === "info"    ? "var(--info)"    :
        tone === "danger"  ? "var(--danger)"  : "var(--ink)"
      } />}
    </div>
  );
}

function DashboardAdmin({ go }) {
  const greetingHour = new Date().getHours();
  const saludo = greetingHour < 12 ? "Buenos días" : greetingHour < 19 ? "Buenas tardes" : "Buenas noches";
  const pending = window.SUSTITUCIONES.filter(s => !s.sustituto).length;
  const incidOpen = window.INCIDENCIAS.filter(i => i.estado !== "cerrada").length;
  const incidHigh = window.INCIDENCIAS.filter(i => i.estado !== "cerrada" && i.prioridad === "alta").length;
  const ausente = window.PROFESORES.filter(p => p.ausente).length;

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="row row--between" style={{ alignItems: "flex-end" }}>
        <div>
          <h1 className="greeting">{saludo}, <em>Jesús</em></h1>
          <div className="greeting-sub">Hoy es lunes, 25 de mayo · {window.SCHOOL.year} · {window.SCHOOL.name}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => go("comunicados")}><Icon.Megaphone /> Nuevo comunicado</button>
          <button className="btn btn--primary" onClick={() => go("chat")}><Icon.Sparkle /> Preguntar a DidactIA</button>
        </div>
      </div>

      <div className="stats">
        <StatTile num={pending} label="Guardias sin cubrir" tone="warning" icon={Icon.Warning}
                  spark={[2,3,4,5,3,4,2,3,pending]} delta="↑ 1 vs. ayer" onClick={() => go("sustituciones")} />
        <StatTile num={ausente} label={ausente === 1 ? "Profesor ausente" : "Profesores ausentes"} tone="info" icon={Icon.Logout}
                  spark={[0,1,0,2,1,0,1,1,ausente]} delta="Sol Bernal · baja médica" onClick={() => go("rrhh")} />
        <StatTile num={incidOpen} label="Incidencias abiertas" tone="danger" icon={Icon.Alert}
                  spark={[3,4,3,5,4,3,4,5,incidOpen]} delta={`${incidHigh} de prioridad alta`} onClick={() => go("incidencias")} />
        <StatTile num={418} label="Alumnos presentes" tone="success" icon={Icon.Check}
                  spark={[400,402,410,415,418,422,420,419,418]} delta="96% de asistencia" onClick={() => go("alumnos")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Today timeline */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row row--between" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="eyebrow">Hoy en el centro</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>Línea del día</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => go("horario")}>Ver horario completo <Icon.Chevron /></button>
          </div>
          <div style={{ padding: "14px 20px 20px" }}>
            <TimelineToday />
          </div>
        </div>

        {/* Pinned actions */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row row--between" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="eyebrow">Atajos fijados</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>Acciones</div>
            </div>
            <button className="icon-btn" title="Editar"><Icon.Pin /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div className="actions">
              <button className="action" onClick={() => go("sustituciones")}>
                <div className="action__icon" style={{ background: "var(--warning-soft)", color: "oklch(0.4 0.12 75)" }}><Icon.Swap /></div>
                <div className="action__title">Gestionar guardias</div>
              </button>
              <button className="action" onClick={() => go("incidencias")}>
                <div className="action__icon" style={{ background: "var(--danger-soft)", color: "oklch(0.4 0.14 27)" }}><Icon.Alert /></div>
                <div className="action__title">Revisar incidencias</div>
              </button>
              <button className="action" onClick={() => go("alumnos")}>
                <div className="action__icon" style={{ background: "var(--success-soft)", color: "oklch(0.4 0.1 155)" }}><Icon.Students /></div>
                <div className="action__title">Buscar alumno</div>
              </button>
              <button className="action" onClick={() => go("comunicados")}>
                <div className="action__icon" style={{ background: "var(--info-soft)", color: "oklch(0.4 0.1 240)" }}><Icon.Megaphone /></div>
                <div className="action__title">Comunicados</div>
              </button>
              <button className="action" onClick={() => go("menu")}>
                <div className="action__icon"><Icon.Book /></div>
                <div className="action__title">Menú semanal</div>
              </button>
              <button className="action" onClick={() => go("espacios")}>
                <div className="action__icon"><Icon.Building /></div>
                <div className="action__title">Espacios</div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <UrgentBoard go={go} />
        <PreguntasFrecuentesAdmin go={go} />
      </div>
    </div>
  );
}

function TimelineToday() {
  const events = [
    { hora: "08:15", label: "Inicio de jornada", tipo: "info" },
    { hora: "08:30", label: "Guardia sin cubrir · 3º ESO B · Matemáticas", tipo: "warning", live: true },
    { hora: "09:15", label: "Sustitución asignada · D. Pinto cubre 1º Bach A", tipo: "success" },
    { hora: "10:15", label: "Guardia sin cubrir · 2º Bach A · Cálculo", tipo: "warning" },
    { hora: "11:15", label: "Recreo · vigilancia patio C", tipo: "muted" },
    { hora: "13:00", label: "Reunión equipo directivo · sala 1", tipo: "info" },
    { hora: "16:30", label: "Reunión claustro · auditorio", tipo: "info" },
  ];
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", left: 60, top: 0, bottom: 0, width: 1, background: "var(--line-2)" }} />
      {events.map((e, i) => {
        const dotColor = e.tipo === "warning" ? "var(--warning)" : e.tipo === "success" ? "var(--success)" : e.tipo === "info" ? "var(--info)" : "var(--muted-2)";
        const haloColor = e.tipo === "warning" ? "oklch(0.72 0.13 75 / 0.22)" : e.tipo === "success" ? "oklch(0.62 0.12 155 / 0.22)" : e.tipo === "info" ? "oklch(0.55 0.1 240 / 0.22)" : "oklch(0.72 0.012 255 / 0.22)";
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 16px 1fr", alignItems: "center", padding: "8px 0", position: "relative" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{e.hora}</div>
            <div style={{ display: "grid", placeItems: "center" }}>
              <div style={{ width: e.live ? 12 : 9, height: e.live ? 12 : 9, borderRadius: "50%", background: dotColor, border: "2px solid var(--surface)", boxShadow: e.live ? `0 0 0 4px ${haloColor}` : "none" }} />
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
              {e.label}
              {e.live && <span className="badge badge--warning">ahora</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UrgentBoard({ go }) {
  const urgentes = window.INCIDENCIAS.filter(i => i.estado !== "cerrada" && i.prioridad === "alta");
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row row--between" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="eyebrow">Atención preferente</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>Requiere tu decisión</div>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => go("incidencias")}>Ver todas <Icon.Chevron /></button>
      </div>
      <div>
        {urgentes.map((u, i) => (
          <div key={u.id} style={{ padding: "13px 20px", borderBottom: i === urgentes.length - 1 ? 0 : "1px solid var(--line)", display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }} onClick={() => go("incidencias", { id: u.id })}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--danger-soft)", color: "oklch(0.45 0.14 27)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              {u.categoria === "Convivencia" ? <Icon.Heart /> : u.categoria === "Salud" ? <Icon.Heart /> : <Icon.Alert />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{u.titulo}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{u.categoria} · {u.creada} · por {u.reportadoPor}</div>
            </div>
            <span className="badge badge--danger">prioridad alta</span>
          </div>
        ))}
        <div style={{ padding: "12px 20px", display: "flex", gap: 8, alignItems: "center", background: "var(--paper-2)" }}>
          <span className="badge badge--warning">3 guardias sin cubrir</span>
          <span className="badge">1 profesor ausente</span>
          <span className="badge badge--info">2 solicitudes de familia</span>
        </div>
      </div>
    </div>
  );
}

function PreguntasFrecuentesAdmin({ go }) {
  const items = [
    { t: "¿Cuántos alumnos hay hoy en el centro?", sub: "Asistencia en tiempo real" },
    { t: "Coberturas necesarias esta semana", sub: "Sustituciones pendientes" },
    { t: "Reuniones pendientes de confirmar", sub: "Agenda dirección" },
    { t: "Resumen incidencias últimas 24h", sub: "Convivencia y mantenimiento" },
  ];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="row row--between" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="eyebrow">Pregunta directa</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>Atajos para DidactIA</div>
        </div>
        <span className="badge badge--accent badge--dot">IA</span>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it, i) => (
          <button key={i} className="suggestion" onClick={() => go("chat")}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icon.Sparkle />
              </div>
              <div style={{ flex: 1 }}>
                <div className="suggestion__title">{it.t}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{it.sub}</div>
              </div>
              <Icon.Chevron style={{ width: 14, height: 14, color: "var(--muted)" }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Teacher dashboard */
function DashboardTeacher({ go }) {
  const greetingHour = new Date().getHours();
  const saludo = greetingHour < 12 ? "Buenos días" : greetingHour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="row row--between" style={{ alignItems: "flex-end" }}>
        <div>
          <h1 className="greeting">{saludo}, <em>Marc</em></h1>
          <div className="greeting-sub">Lengua Castellana · Tutor 3º ESO B · 24 alumnos</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn"><Icon.Alert /> Abrir incidencia</button>
          <button className="btn btn--primary" onClick={() => go("chat")}><Icon.Sparkle /> Preguntar a DidactIA</button>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatTile num="4" label="Clases hoy" tone="info" icon={Icon.Classes} delta="Próxima · 10:15 · 1º Bach A" />
        <StatTile num="24" label="Alumnos en tutoría" tone="success" icon={Icon.Students} delta="2 ausencias justificadas" />
        <StatTile num="1" label="Sustitución asignada" tone="warning" icon={Icon.Swap} delta="3ª hora · 4º ESO A" />
        <StatTile num="3" label="Comunicados sin leer" tone="info" icon={Icon.Megaphone} delta="1 de Dirección" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          <div className="row row--between" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="eyebrow">Tu horario</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>Hoy, lunes</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => go("horario")}>Semana completa <Icon.Chevron /></button>
          </div>
          <div style={{ padding: 16 }}>
            <div className="schedule">
              {window.HORARIO_HOY.map((h, i) => (
                <div key={i} className="schedule__slot" data-now={i === 2}>
                  <div className="schedule__time">{h.hora} · {h.franja}</div>
                  <div className="schedule__subject">{h.asignatura}</div>
                  <div className="schedule__room">{h.grupo} {h.aula !== "—" ? "· " + h.aula : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="row row--between" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="eyebrow">Mi tutoría · 3º ESO B</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>Atención esta semana</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => go("alumnos")}>Ver tutoría <Icon.Chevron /></button>
          </div>
          <div style={{ padding: "8px 0" }}>
            {window.ALUMNOS.filter(a => a.curso.startsWith("3º ESO")).slice(0, 5).map((a, i, arr) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: i === arr.length - 1 ? 0 : "1px solid var(--line)", cursor: "pointer" }} onClick={() => go("alumnos", { id: a.id })}>
                <div className="avatar" data-size="sm" data-tone={a.tone}>{a.nombre.split(" ").slice(0,2).map(s=>s[0]).join("")}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.nombre}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{a.curso} · media {a.avg}</div>
                </div>
                {a.falt >= 3 && <span className="badge badge--warning">{a.falt} faltas</span>}
                {a.incid > 0 && <span className="badge badge--danger">{a.incid} incid.</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="row row--between" style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="eyebrow">Comunicados</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>Para ti</div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => go("comunicados")}>Bandeja completa <Icon.Chevron /></button>
        </div>
        <div>
          {window.COMUNICADOS_RECIENTES.map((c, i, arr) => (
            <div key={c.id} style={{ padding: "12px 20px", borderBottom: i === arr.length - 1 ? 0 : "1px solid var(--line)", display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.leido ? "var(--line-2)" : "var(--accent)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: c.leido ? 400 : 500 }}>{c.titulo}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{c.autor} · {c.fecha}</div>
              </div>
              <button className="btn btn--ghost btn--sm">Abrir <Icon.Chevron /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.DashboardAdmin = DashboardAdmin;
window.DashboardTeacher = DashboardTeacher;
