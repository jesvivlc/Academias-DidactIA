/* Sidebar — navigation + branding */
function Sidebar({ collapsed, route, setRoute, role, counts }) {
  const items = role === "admin" ? [
    { group: null,             items: [
      { id: "home",         label: "Inicio",         icon: Icon.Home },
      { id: "alumnos",      label: "Alumnos",        icon: Icon.Students },
      { id: "chat",         label: "Asistente IA",   icon: Icon.Sparkle,    badge: "NEW" },
    ]},
    { group: "Operación",      items: [
      { id: "sustituciones",label: "Sustituciones",  icon: Icon.Swap,       count: counts.subsPending },
      { id: "incidencias",  label: "Incidencias",    icon: Icon.Alert,      count: counts.incidOpen },
      { id: "horario",      label: "Horario centro", icon: Icon.Calendar },
      { id: "comunicados",  label: "Comunicados",    icon: Icon.Megaphone, count: counts.commsUnread },
    ]},
    { group: "Centro",         items: [
      { id: "usuarios",     label: "Usuarios",       icon: Icon.Users },
      { id: "rrhh",         label: "RRHH",           icon: Icon.HR },
      { id: "espacios",     label: "Espacios",       icon: Icon.Space },
      { id: "menu",         label: "Menú semanal",   icon: Icon.Book },
    ]},
  ] : [
    { group: null,             items: [
      { id: "home",         label: "Inicio",         icon: Icon.Home },
      { id: "alumnos",      label: "Mis alumnos",    icon: Icon.Students },
      { id: "chat",         label: "Asistente IA",   icon: Icon.Sparkle,    badge: "NEW" },
    ]},
    { group: "Mis clases",     items: [
      { id: "horario",      label: "Mi horario",     icon: Icon.Calendar },
      { id: "incidencias",  label: "Incidencias",    icon: Icon.Alert,      count: counts.incidOpen },
      { id: "sustituciones",label: "Sustituciones",  icon: Icon.Swap,       count: counts.subsPending },
    ]},
    { group: "Centro",         items: [
      { id: "comunicados",  label: "Comunicados",    icon: Icon.Megaphone, count: counts.commsUnread },
      { id: "menu",         label: "Menú semanal",   icon: Icon.Book },
    ]},
  ];

  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar__brand">
        <div className="sidebar__brand-mark">D</div>
        <div className="sidebar__brand-name-block">
          <div className="sidebar__brand-name">DidactIA</div>
          <div className="sidebar__brand-school">{window.SCHOOL.campus}</div>
        </div>
      </div>
      <nav className="sidebar__nav">
        {items.map((group, gi) => (
          <React.Fragment key={gi}>
            {group.group && <div className="sidebar__group-label">{group.group}</div>}
            {group.items.map((it) => {
              const I = it.icon;
              return (
                <div
                  key={it.id}
                  className="nav-item"
                  data-active={route === it.id}
                  onClick={() => setRoute(it.id)}
                  title={collapsed ? it.label : undefined}
                >
                  <I />
                  <span className="nav-item__label">{it.label}</span>
                  {it.count != null && it.count > 0 && (
                    <span className="nav-item__count">{it.count}</span>
                  )}
                  {it.badge && !it.count && (
                    <span className="nav-item__count" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{it.badge}</span>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </nav>
      <div className="sidebar__footer">
        <div className="avatar" data-size="sm" data-tone={role === "admin" ? "cool" : "green"}>
          {role === "admin" ? "JV" : "MT"}
        </div>
        <div className="sidebar__footer-meta" style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {role === "admin" ? "Jesús Victoria" : "Marc Torralba"}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {role === "admin" ? "Administración" : "Lengua · Tutor 3º B"}
          </div>
        </div>
        <button className="icon-btn" title="Salir" style={{ width: 28, height: 28 }}><Icon.Logout /></button>
      </div>
    </aside>
  );
}
window.Sidebar = Sidebar;

/* Topbar — page title, search, role switch, profile */
function Topbar({ pageTitle, pageCrumb, role, setRole, onToggleSidebar, onToggleAI, aiOpen, onOpenCmdK }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onToggleSidebar} title="Plegar barra lateral">
        <Icon.Sidebar />
      </button>
      <div className="topbar__page">
        <div className="topbar__page-title">{pageTitle}</div>
        {pageCrumb && <div className="topbar__page-crumb">· {pageCrumb}</div>}
      </div>

      <div className="topbar__search" onClick={onOpenCmdK}>
        <Icon.Search className="topbar__search-icon" />
        <input placeholder="Buscar alumnos, profesores, aulas, comunicados…" readOnly />
        <span className="topbar__search-kbd">⌘K</span>
      </div>

      <div className="topbar__right">
        <div className="role-switch">
          <button className="role-switch__btn" data-active={role === "admin"} onClick={() => setRole("admin")}>Admin</button>
          <button className="role-switch__btn" data-active={role === "profesor"} onClick={() => setRole("profesor")}>Profesor</button>
        </div>
        <button className="icon-btn" title="Asistente IA" onClick={onToggleAI} style={ aiOpen ? { background: "var(--surface-sunk)", color: "var(--ink)" } : null}>
          <Icon.Sparkle />
        </button>
        <button className="icon-btn" title="Notificaciones">
          <Icon.Bell />
          <span className="icon-btn__dot" />
        </button>
        <div style={{ width: 1, height: 24, background: "var(--line)", margin: "0 4px" }} />
        <div className="row" style={{ gap: 8, paddingRight: 4 }}>
          <div className="avatar" data-size="sm" data-tone={role === "admin" ? "cool" : "green"}>
            {role === "admin" ? "JV" : "MT"}
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>
              {role === "admin" ? "Jesús V." : "Marc T."}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              {role === "admin" ? "Admin" : "Profesor"}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
window.Topbar = Topbar;
