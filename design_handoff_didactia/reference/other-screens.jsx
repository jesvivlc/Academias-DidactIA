/* Placeholder screens for lesser-used routes — kept simple but designed */
function PlaceholderScreen({ title, eyebrow, body, icon }) {
  const I = icon || Icon.Doc;
  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 400, letterSpacing: "-0.025em", margin: "6px 0 4px" }}>
          {title}
        </h1>
        <div className="muted">{body}</div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 40, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--surface-sunk)", color: "var(--ink-3)", display: "grid", placeItems: "center" }}>
            <I style={{ width: 26, height: 26 }} />
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500 }}>Esta pantalla está en construcción</div>
            <div className="muted" style={{ marginTop: 4 }}>El prototipo se ha centrado en Inicio, Alumnos, Asistente IA, Sustituciones e Incidencias.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.PlaceholderScreen = PlaceholderScreen;

/* Horario — a clean weekly grid for either role */
function HorarioScreen({ role }) {
  const horas = ["08:15", "09:15", "10:15", "11:45", "12:45", "13:45"];
  const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const subjects = [
    ["Mat 3B", "Mat 1BA", "—", "Geom 4A", "Libre", "Mat 2BA"],
    ["Mat 3B", "Tut 3B", "Mat 1BA", "—", "Mat 4C", "—"],
    ["Mat 1BA", "Mat 3B", "Mat 2BA", "Mat 4A", "—", "Geom 4A"],
    ["Tut 3B", "Mat 2BA", "Mat 1BA", "Mat 3B", "Mat 4A", "—"],
    ["Mat 3B", "Mat 4C", "Mat 1BA", "Libre", "Mat 2BA", "—"],
  ];
  const colors = (s) => {
    if (s === "—" || s === "Libre") return { bg: "var(--paper-2)", border: "var(--line)", color: "var(--muted-2)" };
    if (s.startsWith("Tut")) return { bg: "var(--accent-soft)", border: "var(--accent-soft)", color: "var(--accent-ink)" };
    if (s.startsWith("Geom")) return { bg: "var(--info-soft)", border: "var(--info-soft)", color: "oklch(0.36 0.1 240)" };
    return { bg: "var(--surface)", border: "var(--line)", color: "var(--ink)" };
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row row--between">
        <div>
          <div className="eyebrow">Tu agenda</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 400, letterSpacing: "-0.025em", margin: "6px 0 4px" }}>
            {role === "admin" ? "Horario del centro" : "Mi horario"}
          </h1>
          <div className="muted">Semana 25 — 29 de mayo · Curso 2025–26</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--sm">← Anterior</button>
          <button className="btn btn--sm">Esta semana</button>
          <button className="btn btn--sm">Siguiente →</button>
        </div>
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "70px repeat(5, 1fr)", gap: 6 }}>
          <div />
          {dias.map(d => <div key={d} className="eyebrow" style={{ textAlign: "center", padding: "6px 0" }}>{d}</div>)}
          {horas.map((h, hi) => (
            <React.Fragment key={hi}>
              <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", fontVariantNumeric: "tabular-nums" }}>{h}</div>
              {dias.map((d, di) => {
                const s = subjects[di][hi];
                const c = colors(s);
                return (
                  <div key={d+hi} style={{
                    padding: "14px 10px", borderRadius: 8, minHeight: 64,
                    background: c.bg, border: `1px solid ${c.border}`, color: c.color,
                    fontSize: 13, fontWeight: 500,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {s}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
window.HorarioScreen = HorarioScreen;

/* Comunicados — inbox style */
function ComunicadosScreen() {
  const items = [
    { id: 1, titulo: "Cierre por jornada festiva — 4 de junio", autor: "Dirección", fecha: "Hoy · 09:15", leido: false, etiqueta: "Aviso" },
    { id: 2, titulo: "Reunión de claustro · jueves 18:00 · auditorio", autor: "Jefatura de Estudios", fecha: "Ayer", leido: true, etiqueta: "Convocatoria" },
    { id: 3, titulo: "Resultados pruebas diagnósticas 4º ESO", autor: "Departamento Pedagógico", fecha: "Lun 18", leido: true, etiqueta: "Académico" },
    { id: 4, titulo: "Cambio en el menú del jueves por proveedor", autor: "Cocina", fecha: "Lun 18", leido: false, etiqueta: "Comedor" },
    { id: 5, titulo: "Excursión 2º ESO al Penyagolosa — autorizaciones", autor: "Tutorías 2º ESO", fecha: "Vie 15", leido: true, etiqueta: "Salidas" },
    { id: 6, titulo: "Recordatorio: cierre de notas 3er trimestre", autor: "Jefatura de Estudios", fecha: "Jue 14", leido: true, etiqueta: "Académico" },
  ];
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row row--between">
        <div>
          <div className="eyebrow">Centro · comunicación</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 400, letterSpacing: "-0.025em", margin: "6px 0 4px" }}>Comunicados</h1>
          <div className="muted">2 sin leer · {items.length} totales esta semana</div>
        </div>
        <button className="btn btn--primary"><Icon.Plus /> Nuevo comunicado</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {items.map((c, i, arr) => (
          <div key={c.id} style={{
            padding: "14px 20px", borderBottom: i === arr.length - 1 ? 0 : "1px solid var(--line)",
            display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 14, alignItems: "center",
            background: c.leido ? "transparent" : "var(--paper-2)",
            cursor: "pointer",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.leido ? "var(--line-2)" : "var(--accent)" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: c.leido ? 400 : 500 }}>{c.titulo}</div>
              <div className="row" style={{ gap: 8, marginTop: 3 }}>
                <span className="badge">{c.etiqueta}</span>
                <span className="muted" style={{ fontSize: 12 }}>{c.autor} · {c.fecha}</span>
              </div>
            </div>
            <button className="btn btn--sm btn--ghost">Abrir <Icon.Chevron /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
window.ComunicadosScreen = ComunicadosScreen;

/* Menu semanal */
function MenuScreen() {
  const week = [
    { d: "Lunes",     p: "Crema de calabacín",      s: "Merluza al horno con patatas",       post: "Fruta de temporada" },
    { d: "Martes",    p: "Lentejas estofadas",      s: "Tortilla francesa con ensalada",     post: "Yogur natural" },
    { d: "Miércoles", p: "Arroz tres delicias",     s: "Pollo asado con verduras",           post: "Fruta de temporada" },
    { d: "Jueves",    p: "Sopa de fideos",          s: "Albóndigas en salsa con puré",       post: "Natillas" },
    { d: "Viernes",   p: "Ensalada mediterránea",   s: "Pizza casera y crudités",            post: "Fruta de temporada" },
  ];
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row row--between">
        <div>
          <div className="eyebrow">Centro · comedor</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 400, letterSpacing: "-0.025em", margin: "6px 0 4px" }}>Menú semanal</h1>
          <div className="muted">Semana del 25 al 29 de mayo · 412 comensales</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn">Alérgenos</button>
          <button className="btn btn--primary"><Icon.Doc /> Publicar PDF</button>
        </div>
      </div>
      <div className="grid-3" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {week.map((d, i) => (
          <div key={i} className="card" style={{ padding: 18 }}>
            <div className="eyebrow">{d.d}</div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <div className="field-label">Primero</div>
              <div className="field-value" style={{ marginBottom: 12 }}>{d.p}</div>
              <div className="field-label">Segundo</div>
              <div className="field-value" style={{ marginBottom: 12 }}>{d.s}</div>
              <div className="field-label">Postre</div>
              <div className="field-value">{d.post}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.MenuScreen = MenuScreen;
