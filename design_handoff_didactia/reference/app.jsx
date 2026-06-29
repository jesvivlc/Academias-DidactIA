/* DidactIA — main app */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "warm",
  "density": "comfortable",
  "sidebar": "expanded",
  "aiDock": "rail"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [role, setRole] = React.useState("admin");
  const [route, setRoute] = React.useState("home");
  const [routeArgs, setRouteArgs] = React.useState({});
  const [aiOpen, setAiOpen] = React.useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  // Sync tweaks → state
  React.useEffect(() => {
    setSidebarCollapsed(tweaks.sidebar === "collapsed");
  }, [tweaks.sidebar]);

  const go = (r, args = {}) => {
    setRoute(r);
    setRouteArgs(args);
  };

  const counts = {
    subsPending: window.SUSTITUCIONES.filter(s => s.estado === "pendiente").length,
    incidOpen: window.INCIDENCIAS.filter(i => i.estado !== "cerrada").length,
    commsUnread: 2,
  };

  const pageTitleMap = {
    home: { title: role === "admin" ? "Inicio" : "Inicio", crumb: "Panel principal" },
    alumnos: { title: role === "admin" ? "Alumnos" : "Mis alumnos", crumb: "Directorio" },
    chat: { title: "Asistente IA", crumb: "DidactIA" },
    sustituciones: { title: "Sustituciones", crumb: "Operación" },
    incidencias: { title: "Incidencias", crumb: "Operación" },
    horario: { title: role === "admin" ? "Horario del centro" : "Mi horario", crumb: "Agenda" },
    comunicados: { title: "Comunicados", crumb: "Comunicación" },
    menu: { title: "Menú semanal", crumb: "Comedor" },
    usuarios: { title: "Usuarios", crumb: "Centro" },
    rrhh: { title: "RRHH", crumb: "Centro" },
    espacios: { title: "Espacios", crumb: "Centro" },
  };
  const page = pageTitleMap[route] || pageTitleMap.home;

  // Decide whether to show AI rail next to main content
  const showRail = tweaks.aiDock === "rail" && aiOpen && route !== "chat";
  const showFab = tweaks.aiDock === "fab" && route !== "chat";

  const renderRoute = () => {
    switch (route) {
      case "home":
        return role === "admin" ? <DashboardAdmin go={go} /> : <DashboardTeacher go={go} />;
      case "alumnos":
        return <AlumnosScreen role={role} initialId={routeArgs.id} onClearInitial={() => setRouteArgs({})} />;
      case "chat":
        return <ChatScreen role={role} />;
      case "sustituciones":
        return <SustitucionesScreen />;
      case "incidencias":
        return <IncidenciasScreen initialId={routeArgs.id} onClearInitial={() => setRouteArgs({})} />;
      case "horario":
        return <HorarioScreen role={role} />;
      case "comunicados":
        return <ComunicadosScreen />;
      case "menu":
        return <MenuScreen />;
      case "usuarios":
        return <PlaceholderScreen eyebrow="Centro" title="Usuarios" body="Gestión de cuentas del personal y familias." icon={Icon.Users} />;
      case "rrhh":
        return <PlaceholderScreen eyebrow="Centro" title="RRHH" body="Plantilla, contratos y partes." icon={Icon.HR} />;
      case "espacios":
        return <PlaceholderScreen eyebrow="Centro" title="Espacios" body="Aulas, laboratorios y reservas." icon={Icon.Building} />;
      default:
        return null;
    }
  };

  return (
    <div
      className="app"
      data-collapsed={sidebarCollapsed}
      data-rail={tweaks.aiDock}
      data-rail-open={showRail}
      data-compact={tweaks.density === "compact"}
      data-theme={tweaks.theme}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        route={route}
        setRoute={(r) => go(r)}
        role={role}
        counts={counts}
      />
      <main className="main">
        <Topbar
          pageTitle={page.title}
          pageCrumb={page.crumb}
          role={role}
          setRole={setRole}
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          onToggleAI={() => setAiOpen(v => !v)}
          aiOpen={aiOpen && tweaks.aiDock === "rail"}
        />
        <div className="content" style={ route === "chat" ? { padding: 16, display: "flex" } : null }>
          <div style={ route === "chat" ? { flex: 1, minHeight: 0 } : null}>
            {renderRoute()}
          </div>
        </div>
      </main>
      {showRail && <AIRail role={role} route={route} onExpand={() => { go("chat"); }} />}

      {showFab && (
        <button className="fab" onClick={() => go("chat")}>
          <Icon.Sparkle />
          Preguntar a DidactIA
          <span className="fab__kbd">⌘K</span>
        </button>
      )}

      <DidactIATweaks tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
