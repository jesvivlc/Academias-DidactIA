/* Sustituciones — manage today's substitutions */
function SustitucionesScreen() {
  const [items, setItems] = React.useState(window.SUSTITUCIONES);
  const [assigningId, setAssigningId] = React.useState(null);
  const [filter, setFilter] = React.useState("hoy");

  const pendientes = items.filter(s => s.estado === "pendiente").length;
  const asignadas = items.filter(s => s.estado === "asignada").length;

  const assign = (subId, profId) => {
    const prof = window.PROFESORES.find(p => p.id === profId);
    setItems(items.map(s => s.id === subId ? { ...s, sustituto: prof.nombre, estado: "asignada" } : s));
    setAssigningId(null);
  };
  const unassign = (subId) => {
    setItems(items.map(s => s.id === subId ? { ...s, sustituto: null, estado: "pendiente" } : s));
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row row--between">
        <div>
          <div className="eyebrow">Operación · sustituciones</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 400, letterSpacing: "-0.025em", margin: "6px 0 4px" }}>
            Guardias de hoy
          </h1>
          <div className="muted">Lunes, 25 de mayo · Sol Bernal de baja · {pendientes} sin cubrir · {asignadas} asignadas</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn"><Icon.Doc /> Exportar parte</button>
          <button className="btn btn--accent"><Icon.Sparkle /> Asignar con IA</button>
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="pills">
          <button className="pill" data-active={filter === "hoy"} onClick={() => setFilter("hoy")}>Hoy</button>
          <button className="pill" data-active={filter === "semana"} onClick={() => setFilter("semana")}>Esta semana</button>
          <button className="pill" data-active={filter === "pendientes"} onClick={() => setFilter("pendientes")}>Solo pendientes</button>
        </div>
        <div className="spacer" />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Última actualización · ahora mismo</div>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Hora</th>
              <th style={{ width: 80 }}>Franja</th>
              <th>Asignatura / Grupo</th>
              <th>Aula</th>
              <th>Profesor ausente</th>
              <th>Sustituto</th>
              <th>Estado</th>
              <th style={{ textAlign: "right" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {items.filter(s => filter !== "pendientes" || s.estado === "pendiente").map((s) => (
              <tr key={s.id}>
                <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{s.hora}</td>
                <td className="muted">{s.franja}</td>
                <td>
                  <div className="cell-stack">
                    <span className="cell-name">{s.asignatura}</span>
                    <span className="cell-sub">{s.grupo}</span>
                  </div>
                </td>
                <td className="muted">{s.aula}</td>
                <td>
                  <div className="cell-with-avatar">
                    <div className="avatar" data-size="sm" data-tone="sand">SB</div>
                    <span>{s.profesor}</span>
                  </div>
                </td>
                <td>
                  {s.sustituto ? (
                    <div className="cell-with-avatar">
                      <div className="avatar" data-size="sm" data-tone="cool">{s.sustituto.split(" ").map(x=>x[0]).join("")}</div>
                      <span>{s.sustituto}</span>
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {s.estado === "asignada" ?
                    <span className="badge badge--success badge--dot">Asignada</span> :
                    <span className="badge badge--warning badge--dot">Pendiente</span>}
                </td>
                <td style={{ textAlign: "right", position: "relative" }}>
                  {s.estado === "pendiente" ? (
                    <button className="btn btn--sm btn--primary" onClick={() => setAssigningId(assigningId === s.id ? null : s.id)}>
                      Asignar <Icon.ChevronDown />
                    </button>
                  ) : (
                    <button className="btn btn--sm" onClick={() => unassign(s.id)}>Reasignar</button>
                  )}
                  {assigningId === s.id && (
                    <div style={{
                      position: "absolute", right: 16, top: 38, zIndex: 10,
                      background: "var(--surface)", border: "1px solid var(--line-2)",
                      borderRadius: 12, boxShadow: "var(--shadow-lg)",
                      padding: 8, width: 260, textAlign: "left",
                    }}>
                      <div className="eyebrow" style={{ padding: "6px 10px 4px" }}>Sugerencias IA</div>
                      {window.PROFESORES.filter(p => !p.ausente).slice(0, 4).map((p, i) => (
                        <button
                          key={p.id}
                          onClick={() => assign(s.id, p.id)}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 10px", borderRadius: 8, textAlign: "left",
                            transition: "background 0.12s",
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <div className="avatar" data-size="sm" data-tone={p.tone}>{p.iniciales}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nombre}</div>
                            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{p.depto} · {i === 0 ? "encaja perfecto" : i === 1 ? "hueco libre" : "guardia disponible"}</div>
                          </div>
                          {i === 0 && <span className="badge badge--accent" style={{ fontSize: 10 }}>recomendado</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card--sunk" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ink)", color: "var(--paper)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: 18 }}>D</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>DidactIA puede asignar las {pendientes} guardias pendientes automáticamente.</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Cruza horarios, especialidades, guardias previas de la semana y huecos libres. Tú apruebas antes de aplicar.
          </div>
        </div>
        <button className="btn btn--accent"><Icon.Sparkle /> Generar propuesta</button>
      </div>
    </div>
  );
}
window.SustitucionesScreen = SustitucionesScreen;
