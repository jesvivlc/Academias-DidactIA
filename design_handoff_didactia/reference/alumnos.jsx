/* Alumnos — search list + profile drawer */
function AlumnosScreen({ role, initialId, onClearInitial }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("todos");
  const [selectedId, setSelectedId] = React.useState(initialId || "a01");

  React.useEffect(() => {
    if (initialId) {
      setSelectedId(initialId);
      onClearInitial && onClearInitial();
    }
  }, [initialId]);

  const all = window.ALUMNOS;
  const filtered = all.filter(a => {
    if (query && !a.nombre.toLowerCase().includes(query.toLowerCase()) && !a.curso.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "atencion" && !(a.falt >= 5 || a.incid > 0)) return false;
    if (filter === "tutoria" && !a.curso.startsWith("3º ESO")) return false;
    return true;
  });

  const selected = all.find(a => a.id === selectedId) || all[0];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, height: "100%", minHeight: 0 }}>
      <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <div>
              <div className="eyebrow">{role === "admin" ? "Directorio" : "Mis alumnos"}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500 }}>{filtered.length} alumnos</div>
            </div>
            <div className="row">
              <button className="btn btn--sm"><Icon.Filter /> Filtros</button>
              <button className="btn btn--sm btn--primary"><Icon.Plus /> Nuevo</button>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Icon.Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "var(--muted)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, curso, tutor…"
                style={{ width: "100%", height: 34, borderRadius: 8, background: "var(--surface-sunk)", border: "1px solid transparent", padding: "0 12px 0 34px", fontSize: 13, outline: "none" }}
                onFocus={(e) => e.target.style.background = "var(--surface)"}
                onBlur={(e) => e.target.style.background = "var(--surface-sunk)"}
              />
            </div>
            <div className="pills">
              <button className="pill" data-active={filter === "todos"} onClick={() => setFilter("todos")}>Todos</button>
              <button className="pill" data-active={filter === "atencion"} onClick={() => setFilter("atencion")}>Atención</button>
              {role === "profesor" && <button className="pill" data-active={filter === "tutoria"} onClick={() => setFilter("tutoria")}>Mi tutoría</button>}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Curso</th>
                <th>Tutor</th>
                <th style={{ textAlign: "right" }}>Media</th>
                <th style={{ textAlign: "right" }}>Faltas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} data-selected={a.id === selectedId} data-clickable="true" onClick={() => setSelectedId(a.id)}>
                  <td>
                    <div className="cell-with-avatar">
                      <div className="avatar" data-size="sm" data-tone={a.tone}>{a.nombre.split(" ").slice(0,2).map(s=>s[0]).join("")}</div>
                      <div className="cell-stack">
                        <span className="cell-name">{a.nombre}</span>
                        <span className="cell-sub">{a.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>{a.curso}</td>
                  <td className="muted">{a.tutor}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500, color: a.avg >= 8 ? "oklch(0.4 0.1 155)" : a.avg < 6 ? "oklch(0.5 0.14 27)" : "var(--ink)" }}>{a.avg.toFixed(1)}</td>
                  <td style={{ textAlign: "right" }}>
                    {a.falt > 0 ? (
                      <span className={`badge ${a.falt >= 8 ? "badge--danger" : a.falt >= 4 ? "badge--warning" : ""}`}>{a.falt}</span>
                    ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    {a.incid > 0 && <span className="badge badge--danger">{a.incid}</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="6"><div className="empty">No hay alumnos que coincidan con tu búsqueda.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlumnoProfile alumno={selected} />
    </div>
  );
}

function AlumnoProfile({ alumno }) {
  if (!alumno) return null;
  const [tab, setTab] = React.useState("perfil");
  const horario = [
    { d: "Lun", slots: ["Lengua", "Mate", "Inglés", "EF", "Hist", "Tut"] },
    { d: "Mar", slots: ["Mate", "Bio", "Lengua", "Inglés", "Arte", "Hist"] },
    { d: "Mié", slots: ["Inglés", "Lengua", "Mate", "Tec", "Bio", "EF"] },
    { d: "Jue", slots: ["Hist", "Mate", "Lengua", "Bio", "Arte", "Inglés"] },
    { d: "Vie", slots: ["Lengua", "Inglés", "Mate", "Tec", "EF", "Tut"] },
  ];

  return (
    <div className="drawer">
      <div className="drawer__head">
        <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
          <div className="avatar" data-size="xl" data-tone={alumno.tone}>{alumno.nombre.split(" ").slice(0,2).map(s=>s[0]).join("")}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{alumno.curso} · Expediente {alumno.id.toUpperCase()}</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 500, margin: "4px 0 6px", letterSpacing: "-0.015em" }}>{alumno.nombre}</h2>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="badge"><Icon.Mail style={{ width: 11, height: 11, opacity: 0.7 }} /> {alumno.email}</span>
              <span className="badge"><Icon.Users style={{ width: 11, height: 11, opacity: 0.7 }} /> Tutor: {alumno.tutor}</span>
            </div>
          </div>
        </div>

        <div className="grid-3" style={{ marginTop: 18, gap: 10 }}>
          <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
            <div className="field-label">Media</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500 }}>{alumno.avg.toFixed(1)}</div>
          </div>
          <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
            <div className="field-label">Faltas</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500 }}>{alumno.falt}</div>
          </div>
          <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
            <div className="field-label">Incidencias</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500 }}>{alumno.incid}</div>
          </div>
        </div>

        <div className="tabs" style={{ marginTop: 18, marginBottom: 0 }}>
          {["perfil", "horario", "actividad"].map(t => (
            <div key={t} className="tab" data-active={tab === t} onClick={() => setTab(t)}>
              {t === "perfil" ? "Perfil" : t === "horario" ? "Horario" : "Actividad reciente"}
            </div>
          ))}
        </div>
      </div>

      <div className="drawer__body">
        {tab === "perfil" && (
          <div className="col" style={{ gap: 18 }}>
            <div className="grid-2">
              <div>
                <div className="field-label">Familia</div>
                <div className="field-value">Carmen Aragón · 654 ··· 882</div>
                <div className="field-value">Pedro Marín · 627 ··· 104</div>
              </div>
              <div>
                <div className="field-label">Domicilio</div>
                <div className="field-value">C/ Mar Egeo 14, 4º · 12005 Castellón</div>
              </div>
              <div>
                <div className="field-label">Ruta de transporte</div>
                <div className="field-value">Ruta 2 · parada Plaza Tetuán</div>
              </div>
              <div>
                <div className="field-label">Comedor</div>
                <div className="field-value">Sí · sin alergias declaradas</div>
              </div>
              <div>
                <div className="field-label">Actividades</div>
                <div className="field-value">Teatro · Baloncesto fed.</div>
              </div>
              <div>
                <div className="field-label">Idiomas</div>
                <div className="field-value">Inglés · Francés (optativa)</div>
              </div>
            </div>
            <div className="divider" />
            <div>
              <div className="field-label">Observaciones del tutor</div>
              <div className="field-value" style={{ lineHeight: 1.6 }}>
                Alumna implicada y comunicativa. Lidera trabajos en grupo y ha mejorado la
                puntualidad en el último trimestre. Familia muy presente en tutorías.
              </div>
            </div>
          </div>
        )}
        {tab === "horario" && (
          <div className="col" style={{ gap: 10 }}>
            <div className="eyebrow">Semana actual</div>
            <div style={{ display: "grid", gridTemplateColumns: "40px repeat(6, 1fr)", gap: 4 }}>
              <div></div>
              {["1ª","2ª","3ª","4ª","5ª","6ª"].map(s => <div key={s} className="eyebrow" style={{ textAlign: "center" }}>{s}</div>)}
              {horario.map((d, i) => (
                <React.Fragment key={i}>
                  <div className="eyebrow" style={{ display: "flex", alignItems: "center" }}>{d.d}</div>
                  {d.slots.map((s, j) => (
                    <div key={j} style={{
                      padding: "9px 6px", textAlign: "center", borderRadius: 6,
                      fontSize: 11.5, fontWeight: 500,
                      background: s === "Tut" ? "var(--accent-soft)" : s === "EF" ? "var(--success-soft)" : "var(--surface-2)",
                      color: s === "Tut" ? "var(--accent-ink)" : s === "EF" ? "oklch(0.4 0.1 155)" : "var(--ink-2)",
                      border: "1px solid var(--line)",
                    }}>{s}</div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        {tab === "actividad" && (
          <div className="col" style={{ gap: 14 }}>
            {[
              { d: "Hoy · 12:08", t: "Justificante de falta (médico)", who: "Familia" },
              { d: "Ayer · 09:30", t: "Comunicado entregado: jornada festiva", who: "Sistema" },
              { d: "Lun 18 · 16:00", t: "Tutoría con familia", who: alumno.tutor },
              { d: "Vie 15 · 11:10", t: "Examen Matemáticas: 8.7", who: "Sol Bernal" },
              { d: "Mié 13", t: "Cambio de actividad extraescolar", who: "Secretaría" },
            ].map((a, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 14 }}>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.d}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.t}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.who}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="drawer__foot">
        <button className="btn btn--sm"><Icon.Mail /> Email familia</button>
        <button className="btn btn--sm"><Icon.Phone /> Llamar</button>
        <button className="btn btn--sm btn--ghost"><Icon.Doc /> Expediente</button>
        <div className="spacer" />
        <button className="btn btn--sm btn--accent"><Icon.Sparkle /> Preguntar a IA</button>
      </div>
    </div>
  );
}
window.AlumnosScreen = AlumnosScreen;
