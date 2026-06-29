# Handoff de diseño — DidactIA

> ⚠️ **LEE PRIMERO** `VISUAL_FIDELITY.md`. Contiene el manual de fidelidad visual
> con DO/DON'T explícitos y los errores típicos que debes evitar. Sin leer ese
> archivo, el output volverá a ser un dashboard SaaS genérico en vez de DidactIA.

> **Resumen para Claude Code:** los archivos `reference/` son una **maqueta de alta fidelidad en HTML/React (Babel in-browser)**. **No los copies tal cual al proyecto.** Tu trabajo es **reproducir esta apariencia y comportamiento** dentro del stack que ya tenga el proyecto (Next.js, Vue, etc.) usando sus convenciones, su sistema de routing, su gestión de estado y su librería de componentes si la hay. Los tokens, las decisiones tipográficas, la jerarquía visual y los flujos son los que deben permanecer pixel-perfect.

---

## 0. Cómo usar este paquete (lee esto primero)

1. Sitúa `design_handoff_didactia/` en la raíz de tu proyecto.
2. **Lee `VISUAL_FIDELITY.md` completo.** No es opcional.
3. Mira las 7 capturas en `screenshots/` (6 de la app + 4 de la landing). Tu output debe parecerse a ellas.
4. Abre `reference/DidactIA.html` (la app) y `reference/DidactIA Landing.html` (la landing) en el navegador para ver los prototipos funcionando.
5. Sigue el prompt de arranque al final del `VISUAL_FIDELITY.md`.

Si tu proyecto **aún no tiene stack**, usa **Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui**.

---

## 1. Fidelidad

**Alta fidelidad (hifi).** Colores, tipografía, espaciado, radios, sombras y comportamiento están finalizados. Reprodúcelos pixel-perfect.

---

## 2. Identidad y dirección artística

- **Producto:** DidactIA — asistente de gestión para centros educativos.
- **Centro de ejemplo:** Liceo Mediterráneo (Castellón). Sustituye por el centro real.
- **Idioma:** español neutro y profesional, sin emojis.
- **Tono editorial-educativo:** papel cálido, tinta navy, acento terracota. Generoso en respiración. Antitético al "SaaS denso".
- **Filosofía:**
  - La IA está **integrada pero no invasiva**: ocupa una columna lateral (rail) por defecto y se puede expandir a pantalla completa.
  - Cada pantalla tiene un encabezado tipográfico grande (serif) + métricas claras + acciones a la derecha.
  - Densidad cómoda por defecto; modo compacto opcional.

---

## 3. Tokens de diseño

Reprodúcelos en el sistema del proyecto (Tailwind config, CSS vars, theme provider, etc.).

### 3.1 Color (oklch + hex aproximado)

| Token              | oklch                          | hex aprox |
|--------------------|--------------------------------|-----------|
| `--paper`          | `oklch(0.985 0.005 85)`        | `#FAF9F6` |
| `--paper-2`        | `oklch(0.975 0.007 85)`        | `#F5F4F0` |
| `--surface`        | `oklch(1 0 0)`                 | `#FFFFFF` |
| `--surface-2`      | `oklch(0.97 0.006 85)`         | `#F2F1ED` |
| `--surface-sunk`   | `oklch(0.955 0.008 85)`        | `#ECEAE5` |
| `--ink`            | `oklch(0.22 0.035 255)`        | `#1F2638` |
| `--ink-2`          | `oklch(0.34 0.03 255)`         | `#3A4258` |
| `--ink-3`          | `oklch(0.48 0.022 255)`        | `#5C6379` |
| `--muted`          | `oklch(0.58 0.015 255)`        | `#787F93` |
| `--muted-2`        | `oklch(0.72 0.012 255)`        | `#A3A8B7` |
| `--line`           | `oklch(0.92 0.008 90)`         | `#E5E2DA` |
| `--line-2`         | `oklch(0.86 0.012 90)`         | `#D4CFC3` |
| `--line-strong`    | `oklch(0.78 0.018 90)`         | `#BAB2A1` |
| `--accent` (terracota) | `oklch(0.66 0.14 48)`      | `#C76B3D` |
| `--accent-soft`    | `oklch(0.94 0.04 48)`          | `#F3E1D5` |
| `--accent-ink`     | `oklch(0.42 0.13 48)`          | `#7A3E1F` |
| `--success`        | `oklch(0.62 0.12 155)`         | `#3F9367` |
| `--success-soft`   | `oklch(0.94 0.04 155)`         | `#DFEEDF` |
| `--warning`        | `oklch(0.72 0.13 75)`          | `#D69540` |
| `--warning-soft`   | `oklch(0.95 0.04 75)`          | `#F4E8D3` |
| `--danger`         | `oklch(0.6 0.18 27)`           | `#C24D2F` |
| `--danger-soft`    | `oklch(0.95 0.04 27)`          | `#F4DDD6` |
| `--info`           | `oklch(0.55 0.1 240)`          | `#4D6FA8` |
| `--info-soft`      | `oklch(0.94 0.03 240)`         | `#DFE5EF` |

> **Importante:** todos los chroma de estado comparten valores parecidos (0.12–0.18). Si tu sistema de color no soporta oklch nativo, usa los hex aproximados pero **mantén los pares -soft/-strong** para los fondos de badges, alerts y stat-tiles.

**Variantes de tema** (opcional, expuestas como tweak en la maqueta):
- `cool`: paper desplazado a 240º, accent azul `oklch(0.6 0.13 240)`.
- `mono`: accent desactivado, todo en grises.

### 3.2 Tipografía

| Rol              | Familia                    | Peso/uso |
|------------------|----------------------------|----------|
| Display          | **Newsreader** (serif)     | 400–500. Saludos, títulos de página, números de stats. |
| UI / cuerpo      | **Geist** (sans)           | 400 cuerpo, 500 énfasis, 600 ocasional. |
| Monoespaciada    | **Geist Mono**             | Atajos de teclado, datos tabulares finos. |

Tamaños usados:
- Greeting H1: `36px` (28px en modo compacto), `letter-spacing: -0.025em`, `line-height: 1.1`
- Section title (en cards): `18–22px`, weight 500, `letter-spacing: -0.015em`
- Stat number: `38px` (30px compacto), weight 400
- Eyebrow: `10.5px`, weight 600, `letter-spacing: 0.12em`, uppercase, color `--muted`
- Cuerpo: `13.5px`, line-height 1.5
- Small / meta: `11–12px`, color `--muted`
- Table thead: `11.5px` uppercase, weight 500, color `--muted`

### 3.3 Espaciado, radios, sombras

- Escala de padding: 4/8/12/16/20/24 px, escalada por `--density` (`compact` = 0.8×).
- Radios: `6 / 10 / 14 / 20 / 28` px. Cards usan **14**, badges **999**, botones **8**.
- Sombras:
  - `--shadow`: `0 1px 2px oklch(0.2 0.02 250 / 0.04), 0 4px 14px oklch(0.2 0.02 250 / 0.05)`
  - `--shadow-lg`: para popovers/menus desplegables y el FAB.
- Las cards **no llevan sombra por defecto**: solo `1px solid var(--line)`. La sombra aparece en hover ligero (`translateY(-1px)` + border más fuerte).

### 3.4 Layout shell

- Grid app: `sidebar | main | (rail opcional)` → `248px / 1fr / 360px`.
- Sidebar colapsada: `68px` (solo iconos).
- Topbar: `60px` de alto.
- Padding del contenido: `24px 36px` (cómodo) / `18px 24px` (compacto).

---

## 4. Pantallas (orden recomendado de implementación)

### 4.1 Layout shell (sidebar + topbar)

**Sidebar (`reference/layout.jsx`):**
- Brand mark cuadrado 32×32, fondo `--ink`, letra serif "D" en `--paper`.
- Wordmark "DidactIA" en Newsreader 19px + sub-línea con campus en eyebrow.
- Items de nav agrupados con label-group en eyebrow (`Operación`, `Centro`, etc.).
- Item activo: fondo `--ink`, texto `--paper`, sin border-radius gigante (solo 8px).
- Item con conteo: pill discreta a la derecha (`background: --surface-sunk`).
- Footer fijo con avatar + nombre + rol + botón salir.
- **Colapsable**: muestra solo iconos centrados.

**Topbar:**
- Botón hamburguesa para plegar la sidebar.
- Page title en Newsreader 19px + breadcrumb opcional en muted.
- Búsqueda global centrada (max 520px) con icono lupa y `⌘K` a la derecha.
- A la derecha: segmented control **Admin/Profesor** (no es una decoración, cambia la app), icono IA toggle, notificaciones con punto rojo, avatar.

### 4.2 Inicio — Admin (`reference/dashboard.jsx` → `DashboardAdmin`)

Estructura vertical (gap 22px):
1. **Saludo grande**: "Buenos días, *Jesús*" en Newsreader 36px (la palabra en cursiva usa color `--accent-ink`). Sub-línea con fecha y curso.
2. **Stat tiles** (4 columnas, gap 14px). Cada tile tiene:
   - Barra vertical izquierda de 3px en color del estado.
   - Número en serif grande arriba a la izquierda.
   - Label muted debajo.
   - Mini-icono en cuadrado soft a la derecha.
   - Sparkline al fondo + delta en línea fina.
   - Tonos: `warning`, `info`, `danger`, `success`.
3. **Línea del día** (2/3 ancho) — timeline vertical con eventos del centro (hora · punto · descripción). El evento "en curso" tiene punto más grande con halo de color del estado.
4. **Atajos** (1/3 ancho) — grid 3×N de tiles `action` con icono soft-tinted + título corto.
5. **Atención preferente** (1.4/1) — lista de incidencias de prioridad alta con icono de categoría.
6. **Atajos para DidactIA** (1/1.4) — botones-sugerencia que abren el chat con una pregunta pre-rellena.

### 4.3 Inicio — Profesor (`DashboardTeacher`)

Misma rejilla de stats pero personal: clases hoy, alumnos en tutoría, sustitución asignada, comunicados.
1. **Horario hoy** en strip horizontal: tarjetas mini con hora · franja · asignatura · grupo · aula. La franja actual lleva borde y fondo `--accent-soft`.
2. **Mi tutoría** — lista de alumnos con avatar, media y badges de "faltas" / "incidencias".
3. **Comunicados** — fila por comunicado con punto de leído/no-leído.

### 4.4 Alumnos (`reference/alumnos.jsx`)

Split 1.4 / 1:
- **Izquierda — directorio**: input de búsqueda + pills de filtro (`Todos`, `Atención`, `Mi tutoría` solo para profesor) + tabla. Columnas: alumno (avatar+nombre+email), curso, tutor, media (verde >=8, rojo <6), faltas (badge tonado), incidencias.
- **Derecha — perfil**: avatar XL (88px) + nombre serif 24px + chips meta. Mosaico 3-cols con Media/Faltas/Incidencias. Tabs: `Perfil`, `Horario` (grid semana × 6 franjas con celdas coloreadas), `Actividad reciente` (línea de tiempo). Footer con acciones: email, llamar, expediente, **"Preguntar a IA"** (botón acento).

### 4.5 Asistente IA — chat (`reference/ai.jsx`)

Dos modos:
1. **Rail lateral** (360px) embebido a la derecha del layout. Cabecera con mark, mensajes apilados (usuario derecha, ink invertido; asistente izquierda, surface). Sugerencias contextuales por pantalla actual. Composer abajo con textarea + send.
2. **Pantalla completa** (`ChatScreen`): split 260px / 1fr.
   - Izquierda: botón "Conversación nueva" + lista de recientes.
   - Derecha: cabecera con badge "En línea", mensajes en max-width 720px centrado, composer con disclaimer "DidactIA puede equivocarse".

**Integración con LLM:** usa Anthropic Claude (Haiku/Sonnet) con un system prompt en español que limite respuestas a 1–4 frases, sin emojis, contextualizado al centro. El prompt completo está en `reference/ai.jsx` constante `SYSTEM_PROMPT` — adáptalo si quieres más estricto sobre datos reales.

### 4.6 Sustituciones (`reference/sustituciones.jsx`)

Tabla densa de guardias del día:
- Columnas: hora · franja · asignatura/grupo · aula · profesor ausente · sustituto · estado · acción.
- Botón "Asignar" abre un **popover anclado a la fila** (no modal) con lista de profesores recomendados por IA. El primero lleva badge "recomendado" en color acento.
- Banner inferior tipo "DidactIA puede asignar las N guardias pendientes automáticamente" — CTA `--accent`.

### 4.7 Incidencias (`reference/incidencias.jsx`)

Split 1 / 1.1:
- **Izquierda — lista**: pills de filtro (`Abiertas / Prioridad alta / Cerradas / Todas`) + filas con icono de categoría (tono según categoría), título, meta, badges de prioridad/estado. Selección marcada con border-left ink y fondo `--surface-sunk`.
- **Derecha — detalle**: cabecera con chips de categoría/prioridad/estado + título serif. Sección "Descripción", "Afectados" (chips), divider, "Actividad" (timeline con avatar). **Caja IA destacada** en fondo `--accent-soft` con sugerencia contextual por categoría. Footer con composer de comentario + botón "Cerrar incidencia".

### 4.8 Horario, Comunicados, Menú (`reference/other-screens.jsx`)

- **Horario**: grid 5 días × 6 franjas. Celdas en tres colores según asignatura (acento para tutoría, info para asignatura clave, neutro). Navegación por semanas.
- **Comunicados**: lista tipo inbox con punto de leído + chip de etiqueta + meta autor/fecha.
- **Menú semanal**: 5 tarjetas (lunes–viernes) con eyebrow del día y campos Primero/Segundo/Postre.

---

## 5. Comportamiento e interacciones

- **Cambio de rol** (Admin ↔ Profesor): swap inmediato de sidebar, dashboard y filtros disponibles.
- **Navegación**: la sidebar dirige `route`; algunas filas/cards llaman a `go("ruta", {id})` para deep-link a un detalle (ej. card de incidencia urgente → detalle abierto en Incidencias).
- **Búsqueda Cmd+K**: la maqueta solo muestra el visual; en producción implementa un command palette (cmdk-style).
- **Tweaks panel**: en la maqueta es un overlay para diseñadores. **No lo incluyas en producción.** Sí mantén el tema cálido como default.
- **Hover states**: cards suben 1px y endurecen el borde. Filas de tabla se tiñen `--paper-2`.
- **Transiciones**: `120–150ms ease`. Sin animaciones espectaculares.
- **Persistencia**: en la maqueta el estado es en memoria. En producción: routing real + estado servidor + optimistic updates en `Asignar sustituto`, `Comentar incidencia`, `Cerrar incidencia`.
- **Loading**: en chat usa indicador "typing" (3 puntos animados). En tablas usa skeleton rows del mismo alto.

---

## 6. Componentes a crear en tu librería

Mapeo sugerido (ajusta a tu stack):

| Componente referencia    | Implementación sugerida (shadcn) |
|--------------------------|----------------------------------|
| `Sidebar / NavItem`      | Custom + `lucide-react` icons    |
| `Topbar`                 | Custom + `Input`, `Tabs`         |
| `StatTile`               | Custom; sparkline con `recharts` |
| `Card`, `Drawer`         | `Card` + custom drawer           |
| `Badge`                  | `Badge` con variantes warning/success/danger/info/accent |
| `Pill filter`            | `ToggleGroup`                    |
| `Tabs` (perfil alumno)   | `Tabs`                           |
| `Composer / Chat msg`    | Custom (textarea autosize)       |
| `Table` (alumnos/subs)   | `Table` + tu data layer          |
| `Avatar`                 | `Avatar` con gradient fallback   |
| `Popover` (asignar)      | `Popover`                        |
| `Tweaks panel`           | **No portar a producción**       |

Iconografía: usa **`lucide-react`** (los iconos de la maqueta están dibujados a mano en `icons.jsx` con stroke 1.8 — el equivalente directo es lucide con `strokeWidth={1.8}`).

---

## 7. Datos y backend

La maqueta usa mocks en `reference/data.js` (`PROFESORES`, `ALUMNOS`, `SUSTITUCIONES`, `INCIDENCIAS`, `HORARIO_HOY`, etc.). Úsalos como **contrato preliminar de tipos**. Conviértelos a tipos TypeScript reales y conéctalos a tu backend.

Endpoints mínimos sugeridos:
- `GET /me` (con rol)
- `GET /alumnos?q=&filter=`, `GET /alumnos/:id`
- `GET /sustituciones?fecha=`, `POST /sustituciones/:id/asignar { profesorId }`
- `GET /incidencias?filter=`, `POST /incidencias/:id/comentar`, `POST /incidencias/:id/cerrar`
- `POST /ai/chat { messages }` (proxy a Anthropic; nunca expongas la API key al cliente)

---

## 8. Accesibilidad

- Contraste mínimo `--muted` sobre `--paper` ≥ AA (verificado).
- Cualquier botón icon-only lleva `title` o `aria-label`.
- Tablas con `<th scope>` correcto.
- Las pills de filtro son `role="tab"` o `radiogroup` según contexto.
- El composer del chat soporta `Enter` (enviar) y `Shift+Enter` (línea nueva).
- Foco visible: usa `:focus-visible` en lugar de `:focus`.

---

## 9. Checklist de implementación

- [ ] Tokens de color en theme/CSS.
- [ ] Tipografías cargadas (Newsreader + Geist).
- [ ] Layout shell: sidebar colapsable + topbar + content + rail.
- [ ] Switch de rol funcional.
- [ ] Dashboard Admin con stats, timeline, atajos.
- [ ] Dashboard Profesor con horario strip y tutoría.
- [ ] Alumnos: tabla + perfil con tabs.
- [ ] Sustituciones: tabla + popover de asignación.
- [ ] Incidencias: lista + detalle con composer.
- [ ] Chat: rail + pantalla completa con proxy a Claude.
- [ ] Horario, Comunicados, Menú.
- [ ] Estados de carga, error y vacío en cada pantalla.
- [ ] Responsive (≥1280px ideal; en <1024px la rail debe colapsar a botón flotante).

---

## 10. Archivos de referencia

Carpeta `reference/`:
- `DidactIA.html` — entry point, ábrelo en el navegador.
- `styles.css` — tokens + clases base. Mírala primero.
- `app.jsx` — composición raíz y router de pantallas.
- `layout.jsx` — sidebar + topbar.
- `dashboard.jsx` — dashboards admin/profesor + sparkline + timeline.
- `alumnos.jsx`, `sustituciones.jsx`, `incidencias.jsx`, `ai.jsx` — pantallas.
- `other-screens.jsx` — Horario, Comunicados, Menú.
- `data.js` — mocks con la forma de los datos.
- `icons.jsx` — iconos personalizados (sustituibles por lucide).

---

## 11. Prompt sugerido para arrancar con Claude Code

> Estoy implementando una app de gestión escolar llamada **DidactIA**. En `design_handoff_didactia/` tienes la documentación completa y una maqueta interactiva en `reference/DidactIA.html`. Léela y luego:
>
> 1. Crea los design tokens en `src/styles/tokens.css` (o el Tailwind config si usamos Tailwind) tal como están listados en la sección 3 del README.
> 2. Monta el layout shell (sidebar + topbar + content + rail) en `src/app/layout.tsx`.
> 3. Crea las pantallas en este orden: Inicio (admin y profesor) → Alumnos → Asistente IA → Sustituciones → Incidencias. Para cada una sigue la descripción de la sección 4.
> 4. Usa mocks en `src/mocks/` derivados de `reference/data.js` mientras no haya backend.
> 5. **No copies el código de la maqueta literalmente**: adáptalo a las convenciones del proyecto. Reproduce **el aspecto y el comportamiento**, no el código.
>
> Cuando termines cada pantalla, muéstrame un screenshot y la comparo con la referencia.
