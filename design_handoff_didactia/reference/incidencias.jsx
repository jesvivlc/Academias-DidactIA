/* Incidencias — list + detail */
function IncidenciasScreen({ initialId, onClearInitial }) {
  const [items, setItems] = React.useState(window.INCIDENCIAS);
  const [selectedId, setSelectedId] = React.useState(initialId || items.find(i => i.estado !== "cerrada")?.id);
  const [filter, setFilter] = React.useState("abiertas");
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    if (initialId) { setSelectedId(initialId); onClearInitial && onClearInitial(); }
  }, [initialId]);

  const filtered = items.filter(i => {
    if (filter === "abiertas") return i.estado !== "cerrada";
    if (filter === "alta") return i.prioridad === "alta" && i.estado !== "cerrada";
    if (filter === "cerradas") return i.estado === "cerrada";
    return true;
  });

  const selected = items.find(i => i.id === selectedId) || filtered[0];

  const addComment = () => {
    if (!draft.trim() || !selected) return;
    setItems(items.map(i => i.id === selected.id ? {
      ...i, actividad: [...i.actividad, { quien: "Jesús Victoria", cuando: "Ahora", texto: draft.trim() }]
    } : i));
    setDraft("");
  };

  const close = () => {
    if (!selected) return;
    setItems(items.map(i => i.id === selected.id ? { ...i, estado: "cerrada", actividad: [...i.actividad, { quien: "Jesús Victoria", cuando: "Ahora", texto: "Incidencia cerrada." }] } : i));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 16, height: "100%", minHeight: 0 }}>
      <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Operación · incidencias</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em" }}>
                {items.filter(i => i.estado !== "cerrada").length} abiertas
              </div>
            </div>
            <button className="btn btn--primary"><Icon.Plus /> Abrir incidencia</button>
          </div>
          <div className="pills">
            <button className="pill" data-active={filter === "abiertas"} onClick={() => setFilter("abiertas")}>Abiertas</button>
            <button className="pill" data-active={filter === "alta"} onClick={() => setFilter("alta")}>Prioridad alta</button>
            <button className="pill" data-active={filter === "cerradas"} onClick={() => setFilter("cerradas")}>Cerradas</button>
            <button className="pill" data-active={filter === "todas"} onClick={() => setFilter("todas")}>Todas</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {filtered.map((i, idx, arr) => (
            <IncidenciaRow
              key={i.id}
              inc={i}
              selected={i.id === selectedId}
              last={idx === arr.length - 1}
              onClick={() => setSelectedId(i.id)}
            />
          ))}
          {filtered.length === 0 && <div className="empty">No hay incidencias que coincidan.</div>}
        </div>
      </div>

      {selected ? (
        <div className="drawer">
          <div className="drawer__head">
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge">{selected.categoria}</span>
                <span className={`badge badge--${selected.prioridad === "alta" ? "danger" : selected.prioridad === "media" ? "warning" : ""} badge--dot`}>
                  Prioridad {selected.prioridad}
                </span>
                <span className={`badge ${selected.estado === "cerrada" ? "badge--success" : selected.estado === "en_revision" ? "badge--info" : "badge--warning"} badge--dot`}>
                  {selected.estado === "en_revision" ? "En revisión" : selected.estado === "cerrada" ? "Cerrada" : "Abierta"}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>#{selected.id.toUpperCase()}</div>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, margin: "4px 0 6px", letterSpacing: "-0.015em" }}>
              {selected.titulo}
            </h2>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Abierta {selected.creada} · por {selected.reportadoPor}
            </div>
          </div>
          <div className="drawer__body">
            <div className="col" style={{ gap: 18 }}>
              <div>
                <div className="field-label">Descripción</div>
                <div className="field-value" style={{ lineHeight: 1.6 }}>{selected.descripcion}</div>
              </div>
              <div>
                <div className="field-label">Afectados</div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {selected.afectados.map((a, i) => <span key={i} className="badge">{a}</span>)}
                </div>
              </div>
              <div className="divider" />
              <div>
                <div className="field-label">Actividad</div>
                <div className="col" style={{ gap: 12, marginTop: 6 }}>
                  {selected.actividad.map((a, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 10 }}>
                      <div className="avatar" data-size="sm" data-tone={i % 4 === 0 ? "cool" : i % 4 === 1 ? "green" : i % 4 === 2 ? "sand" : "purple"} style={{ width: 26, height: 26, fontSize: 10 }}>
                        {a.quien.split(" ").map(s => s[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13 }}>
                          <span style={{ fontWeight: 500 }}>{a.quien}</span>
                          <span className="muted"> · {a.cuando}</span>
                        </div>
                        <div className="field-value" style={{ marginTop: 2 }}>{a.texto}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-soft)", borderRadius: 12, padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent)", color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon.Sparkle />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--accent-ink)", marginBottom: 3 }}>Sugerencia de DidactIA</div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    {selected.categoria === "Mantenimiento" ? "Asigna a Joan (mantenimiento) y crea una solicitud al proveedor. Tienes 1 proyector de reserva en almacén." :
                     selected.categoria === "Convivencia" ? "Convoca al equipo de orientación. Históricamente, mediación en 48h resuelve el 90% de estos casos." :
                     selected.categoria === "Salud" ? "Actualiza la ficha del alumno y notifica a cocina y enfermería antes de la próxima comida." :
                     "Revisa los antecedentes del último mes y considera contactar a la familia para más contexto."}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="drawer__foot" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <div className="composer" style={{ borderRadius: 10 }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Añade un comentario, asigna responsable, registra acción…"
                rows={1}
                style={{ fontSize: 13 }}
              />
              <div className="composer__row">
                <button className="icon-btn" style={{ width: 26, height: 26 }} title="Asignar"><Icon.Users /></button>
                <span className="spacer" />
                <button className="btn btn--sm" onClick={close} disabled={selected.estado === "cerrada"}>
                  {selected.estado === "cerrada" ? "Cerrada" : "Cerrar incidencia"}
                </button>
                <button className="btn btn--sm btn--primary" onClick={addComment} disabled={!draft.trim()}>
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="drawer"><div className="empty">Selecciona una incidencia.</div></div>
      )}
    </div>
  );
}

function IncidenciaRow({ inc, selected, last, onClick }) {
  const catIcon = inc.categoria === "Mantenimiento" ? Icon.Wrench :
                  inc.categoria === "Convivencia" ? Icon.Heart :
                  inc.categoria === "Salud" ? Icon.Heart :
                  inc.categoria === "Tecnología" ? Icon.Wifi :
                  inc.categoria === "Transporte" ? Icon.Bus :
                  inc.categoria === "Académica" ? Icon.Book :
                  Icon.Alert;
  const I = catIcon;
  const catTone = inc.categoria === "Mantenimiento" ? "warning" :
                  inc.categoria === "Convivencia" ? "danger" :
                  inc.categoria === "Salud" ? "danger" :
                  inc.categoria === "Tecnología" ? "info" :
                  inc.categoria === "Transporte" ? "info" : "";
  return (
    <div
      onClick={onClick}
      style={{
        padding: "13px 20px",
        borderBottom: last ? 0 : "1px solid var(--line)",
        background: selected ? "var(--surface-sunk)" : "transparent",
        borderLeft: selected ? "3px solid var(--ink)" : "3px solid transparent",
        cursor: "pointer",
        display: "flex", alignItems: "flex-start", gap: 12,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: catTone === "warning" ? "var(--warning-soft)" :
                    catTone === "danger" ? "var(--danger-soft)" :
                    catTone === "info" ? "var(--info-soft)" : "var(--surface-sunk)",
        color: catTone === "warning" ? "oklch(0.4 0.12 75)" :
               catTone === "danger" ? "oklch(0.4 0.14 27)" :
               catTone === "info" ? "oklch(0.4 0.1 240)" : "var(--ink-3)",
        display: "grid", placeItems: "center",
      }}>
        <I />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>{inc.titulo}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
          {inc.categoria} · {inc.creada} · {inc.reportadoPor}
        </div>
      </div>
      <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
        {inc.prioridad === "alta" && <span className="badge badge--danger">alta</span>}
        {inc.prioridad === "media" && <span className="badge badge--warning">media</span>}
        {inc.prioridad === "baja" && <span className="badge">baja</span>}
        {inc.estado === "cerrada" && <span className="badge badge--success">cerrada</span>}
      </div>
    </div>
  );
}
window.IncidenciasScreen = IncidenciasScreen;
