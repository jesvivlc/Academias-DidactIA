/* AI Assistant rail — docked sidebar version of the chat */
const SYSTEM_PROMPT = `Eres DidactIA, un asistente de IA para un centro educativo español llamado Liceo Mediterráneo. Hablas siempre en español neutro y profesional, con calidez. Tu rol es ayudar a personal del centro (administración, jefatura de estudios y profesores) con: consulta de horarios, gestión de sustituciones, búsqueda de información de alumnos y profesores, menú del comedor, comunicados, incidencias del centro, y preguntas administrativas. Respondes con concisión: 1-4 frases máximo, en tono claro, sin emojis, sin listas largas. Cuando te pidan datos concretos (nombres, horarios, números), invéntalos coherentemente pero brevemente; no aclares que son ficticios. Si la pregunta no es propia del ámbito escolar, redirige con amabilidad.`;

function suggestionsFor(role, route) {
  if (route === "alumnos") return [
    { t: "Resumen de Lucía Marín",  q: "Dame un resumen rápido de Lucía Marín Aragón: notas, faltas y tutor." },
    { t: "Alumnos con más faltas",  q: "¿Qué alumnos de 3º ESO superan el 10% de faltas?" },
  ];
  if (route === "sustituciones") return [
    { t: "Cubrir guardias de hoy",  q: "¿Qué guardias siguen sin cubrir hoy y a quién puedo asignar?" },
    { t: "Disponibilidad de Diego", q: "¿Diego Pinto tiene hueco a 3ª hora para cubrir Matemáticas?" },
  ];
  if (route === "incidencias") return [
    { t: "Resumen incidencias",     q: "Dame un resumen de las incidencias abiertas y su prioridad." },
    { t: "Convivencia esta semana", q: "¿Cuántas incidencias de convivencia hay esta semana?" },
  ];
  return [
    { t: "Horario del profesor Sol", q: "Dime el horario completo del profesor Sol Bernal esta semana." },
    { t: "Menú del comedor de hoy",  q: "¿Cuál es el menú del comedor de hoy?" },
    { t: "Próxima reunión",          q: "¿Cuándo es la próxima reunión de claustro?" },
  ];
}

function useChat(initialMessages = []) {
  const [messages, setMessages] = React.useState(initialMessages);
  const [loading, setLoading] = React.useState(false);

  const send = React.useCallback(async (text) => {
    if (!text || !text.trim() || loading) return;
    const newMsgs = [...messages, { role: "user", content: text.trim() }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      const reply = await window.claude.complete({
        messages: [
          { role: "user", content: `${SYSTEM_PROMPT}\n\n--- Conversación ---\n${newMsgs.map(m => `${m.role === "user" ? "Usuario" : "DidactIA"}: ${m.content}`).join("\n")}\n\nDidactIA:` },
        ],
      });
      setMessages([...newMsgs, { role: "assistant", content: reply.trim() }]);
    } catch (e) {
      setMessages([...newMsgs, { role: "assistant", content: "Lo siento, no he podido responder en este momento. Inténtalo de nuevo en unos segundos." }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  return { messages, loading, send, setMessages };
}
window.useChat = useChat;

function AIRail({ role, route, onExpand }) {
  const [draft, setDraft] = React.useState("");
  const { messages, loading, send } = useChat([
    { role: "assistant", content: "Hola, soy DidactIA. ¿En qué puedo ayudarte hoy?" },
  ]);
  const bottomRef = React.useRef(null);
  React.useEffect(() => { bottomRef.current?.scrollTo({ top: 9e6, behavior: "smooth" }); }, [messages, loading]);

  const submit = () => { send(draft); setDraft(""); };
  const suggestions = suggestionsFor(role, route);

  return (
    <aside className="rail">
      <div className="rail__head">
        <div className="rail__head-mark">D</div>
        <div style={{ flex: 1 }}>
          <div className="rail__head-title">Asistente</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>En línea · contexto: {route}</div>
        </div>
        <button className="icon-btn" title="Abrir a pantalla completa" onClick={onExpand}><Icon.Open /></button>
      </div>

      <div className="rail__messages" ref={bottomRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role}`}>
            <div className="msg__bubble">{m.content}</div>
            <div className="msg__meta">{m.role === "user" ? "Tú" : "DidactIA"}</div>
          </div>
        ))}
        {loading && (
          <div className="msg msg--assistant">
            <div className="msg__bubble"><div className="typing"><span/><span/><span/></div></div>
          </div>
        )}
      </div>

      {messages.length <= 2 && (
        <div className="rail__suggestions">
          <div className="eyebrow" style={{ paddingBottom: 4 }}>Sugerencias</div>
          {suggestions.map((s, i) => (
            <button key={i} className="suggestion" onClick={() => send(s.q)}>
              <div className="suggestion__title">{s.t}</div>
            </button>
          ))}
        </div>
      )}

      <div className="rail__composer">
        <div className="composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Pregunta lo que necesites…"
            rows={1}
          />
          <div className="composer__row">
            <span className="composer__hint">⏎ enviar · ⇧⏎ línea nueva</span>
            <button className="icon-btn" style={{ width: 28, height: 28 }} title="Dictar"><Icon.Mic /></button>
            <button className="composer__send" disabled={!draft.trim() || loading} onClick={submit} title="Enviar">
              <Icon.Send />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
window.AIRail = AIRail;

/* Full-screen Chat — when navigating to chat route */
function ChatScreen({ role }) {
  const [activeId, setActiveId] = React.useState("new");
  const [draft, setDraft] = React.useState("");
  const { messages, loading, send, setMessages } = useChat([
    { role: "assistant", content: `Hola, soy DidactIA. Soy tu asistente para ${window.SCHOOL.name}. Puedo responder preguntas sobre horarios, alumnos, profesores, menús, reuniones, incidencias y mucho más. ¿Por dónde empezamos?` },
  ]);

  const startNew = () => {
    setActiveId("new");
    setMessages([{ role: "assistant", content: "Conversación nueva. ¿Qué necesitas?" }]);
  };

  const bottomRef = React.useRef(null);
  React.useEffect(() => { bottomRef.current?.scrollTo({ top: 9e6, behavior: "smooth" }); }, [messages, loading]);
  const submit = () => { send(draft); setDraft(""); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, height: "100%" }}>
      <div className="card card--sunk" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 14px 10px" }}>
          <button className="btn btn--primary" style={{ width: "100%", justifyContent: "center" }} onClick={startNew}>
            <Icon.Plus /> Conversación nueva
          </button>
        </div>
        <div style={{ padding: "0 12px 4px" }} className="eyebrow">Recientes</div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
          {window.CHAT_RECIENTES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 10px",
                borderRadius: 8, display: "block", marginBottom: 2,
                background: activeId === c.id ? "var(--surface)" : "transparent",
                border: "1px solid " + (activeId === c.id ? "var(--line)" : "transparent"),
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.titulo}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{c.cuando}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
          <div className="rail__head-mark">D</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>DidactIA</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Tu asistente para {window.SCHOOL.name}</div>
          </div>
          <span className="badge badge--success badge--dot">En línea</span>
        </div>

        <div ref={bottomRef} style={{ flex: 1, overflowY: "auto", padding: "24px 22px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            {messages.map((m, i) => (
              <div key={i} className={`msg msg--${m.role}`} style={{ maxWidth: "78%" }}>
                <div className="msg__bubble" style={{ fontSize: 14.5, padding: "11px 15px" }}>{m.content}</div>
                <div className="msg__meta">{m.role === "user" ? "Tú · ahora" : "DidactIA · ahora"}</div>
              </div>
            ))}
            {loading && (
              <div className="msg msg--assistant">
                <div className="msg__bubble"><div className="typing"><span/><span/><span/></div></div>
              </div>
            )}
            {messages.length <= 1 && (
              <div style={{ marginTop: 12 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Empezar con…</div>
                <div className="grid-2">
                  {suggestionsFor(role, "home").map((s, i) => (
                    <button key={i} className="suggestion" onClick={() => send(s.q)}>
                      <div className="suggestion__title">{s.t}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s.q}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "14px 22px 20px", borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div className="composer">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Pregunta a DidactIA…"
                rows={1}
                style={{ fontSize: 14 }}
              />
              <div className="composer__row">
                <span className="composer__hint">DidactIA puede equivocarse. Verifica datos críticos.</span>
                <button className="icon-btn" style={{ width: 30, height: 30 }} title="Dictar"><Icon.Mic /></button>
                <button className="composer__send" disabled={!draft.trim() || loading} onClick={submit} style={{ width: 32, height: 32 }}>
                  <Icon.Send />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.ChatScreen = ChatScreen;
