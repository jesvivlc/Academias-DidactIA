# Manual de fidelidad visual — DidactIA

> **PRIMER MANDATO:** los archivos `reference/` y las capturas de `screenshots/` no son
> "una inspiración". Son **el resultado esperado**. Si tu output difiere
> visualmente, está mal. Compara cada pantalla con su screenshot antes de
> decirme que algo está terminado.

Este documento existe porque la primera iteración de Claude Code reprodujo
**la funcionalidad** pero no **el aspecto**. Lee este archivo entero antes
de tocar una sola línea de código de UI.

---

## 1. Errores de la primera iteración (no los repitas)

| Error cometido                                       | Lo correcto                                                              |
|------------------------------------------------------|--------------------------------------------------------------------------|
| Stat tiles planos: número grande + label, nada más   | Tiles con **barra vertical lateral de 3px en color de estado**, sparkline de fondo, icono soft-tinted arriba a la derecha, línea de delta debajo |
| Tipografía sans-serif en todo                        | **Newsreader (serif)** para saludo, títulos de página y números de stats. Geist (sans) solo para UI |
| Paleta cool/gris institucional                       | **Papel cálido** `--paper: oklch(0.985 0.005 85)` + **ink-navy** `--ink: oklch(0.22 0.04 255)` + acentos brand (azul + ámbar) |
| Logo: cuadrado vacío con "D"                         | Logo brand completo: navy rounded square + "D" blanca + **chispa ámbar** arriba-derecha. Wordmark "Didact**IA**" con "IA" en azul brand |
| "Hola, soy DidactIA" como única cosa en el dashboard | El dashboard de **Inicio admin** es un layout con greeting + stats + timeline + atajos + atención preferente. El chat es **otra pantalla** distinta |
| Sugerencias del chat como pills con flechas →        | Tarjetas `.suggestion` con título en bold + subtítulo (sin flecha) |
| Banner amarillo de aviso atravesando toda la pantalla| El diseño **no tiene** banner global. Los avisos urgentes van dentro del bloque "Atención preferente" del dashboard |
| Sidebar: items pequeños con iconos descoloridos      | Items con icono + texto + contador a la derecha; el activo es **fondo navy sólido con texto blanco** |
| Saludos con texto plano en gris                      | "Buenos días, *Jesús*" — el nombre va en *cursiva con color brand-blue-ink*, fuente Newsreader, tamaño 36px |

---

## 2. Anatomía exacta del stat tile

Mira `screenshots/01-inicio-admin.png` — el primer tile dice "3 / Guardias sin
cubrir / ↑ 1 vs. ayer" con una línea ámbar abajo.

Estructura DOM:
```
.stat[data-tone="warning"]                 ← contenedor con padding 18px
├── .stat__bar                              ← 3px de ancho, lateral izquierdo, color del estado
├── .stat__icon (top-right, 30×30)          ← icono en fondo soft-tinted con color del estado
├── .stat__num                              ← Newsreader 38px, color ink
├── .stat__label                            ← Geist 12.5px, color muted
├── .stat__delta                            ← Geist 11px, ink-3, con una pequeña flecha o texto
└── <Sparkline /> SVG 28px alto             ← polyline + área tonada al 8%
```

CSS clave:
```css
.stat {
  position: relative; padding: 18px 18px 16px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
  transition: border-color .15s, transform .15s; cursor: pointer;
}
.stat:hover { border-color: var(--line-strong); transform: translateY(-1px); }
.stat__bar {
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--ink); /* override per tone */
}
.stat[data-tone="warning"] .stat__bar { background: var(--warning); }
```

Tonos: `warning` (ámbar), `success` (verde), `info` (azul claro), `danger` (rojo).

**El sparkline NO es decorativo**. Usa los datos reales del KPI. En la maqueta
es SVG inline (mira `reference/dashboard.jsx` → componente `Sparkline`).

---

## 3. Tipografía — checklist rápido

| Elemento                          | Familia       | Tamaño               | Peso  | Otros                       |
|-----------------------------------|---------------|----------------------|-------|-----------------------------|
| Saludo H1 (dashboard)             | Newsreader    | 36px                 | 400   | letter-spacing -0.025em, italic en nombre |
| Título de página (topbar)         | Newsreader    | 19px                 | 500   | letter-spacing -0.015em     |
| Título de card                    | Newsreader    | 18–22px              | 500   |                             |
| Número de stat                    | Newsreader    | 38px                 | 400   | letter-spacing -0.03em      |
| Eyebrow                           | Geist         | 10.5px               | 600   | uppercase, letter-spacing 0.12em, color muted |
| Cuerpo                            | Geist         | 13.5px               | 400   | line-height 1.5             |
| Tabla thead                       | Geist         | 11.5px               | 500   | uppercase, color muted      |
| Botón                             | Geist         | 13px                 | 500   |                             |

> **Si Newsreader no aparece en ninguna parte de la UI, no la has implementado.**
> No la sustituyas por Playfair, Lora, Merriweather o cualquier otra serif.
> Newsreader tiene una italic muy concreta que define la marca.

---

## 4. Color — checklist rápido

Defínelos como **CSS custom properties en el root** (o en el theme de tu framework).
No los conviertas a Tailwind-clásico (`bg-gray-50`, etc.) porque pierdes la
calidez del color. Si usas Tailwind, configúralos en `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      paper: 'oklch(0.985 0.005 85)',
      surface: 'oklch(1 0 0)',
      ink: { DEFAULT: 'oklch(0.22 0.04 255)', 2: 'oklch(0.34 0.03 255)', 3: 'oklch(0.48 0.022 255)' },
      muted: 'oklch(0.58 0.015 255)',
      line: { DEFAULT: 'oklch(0.92 0.008 90)', strong: 'oklch(0.78 0.018 90)' },
      brand: {
        navy: 'oklch(0.24 0.05 260)',
        blue: 'oklch(0.5 0.18 260)',
        spark: 'oklch(0.78 0.15 70)',
      },
      success: { DEFAULT: 'oklch(0.62 0.12 155)', soft: 'oklch(0.94 0.04 155)' },
      warning: { DEFAULT: 'oklch(0.72 0.13 75)', soft: 'oklch(0.95 0.04 75)' },
      danger:  { DEFAULT: 'oklch(0.6 0.18 27)',   soft: 'oklch(0.95 0.04 27)' },
      info:    { DEFAULT: 'oklch(0.55 0.1 240)',  soft: 'oklch(0.94 0.03 240)' },
    },
  },
}
```

**Test rápido:** abre la home admin y compárala con `screenshots/01-inicio-admin.png`.
- ¿El fondo es **crema cálido**, no blanco puro ni gris frío?
- ¿El header de "Buenas noches" tiene **serif**, no sans?
- ¿Los stat tiles tienen **una barra de color a la izquierda**?
- ¿La sidebar activa es **navy oscuro con texto blanco**, no azul tipo Bootstrap?

Si fallas en cualquiera de estos, vuelve a empezar la pantalla.

---

## 5. Logo brand — usar SIEMPRE este SVG

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="22" fill="#1F2C4F"/>
  <text x="50" y="58" text-anchor="middle" font-family="Geist, sans-serif"
        font-weight="700" font-size="62" fill="white" letter-spacing="-3">D</text>
  <path d="M80 16 L83.6 28 L96 32 L83.6 36 L80 48 L76.4 36 L64 32 L76.4 28 Z" fill="#F4A847"/>
</svg>
```

Acompañado del wordmark "Didact**IA**" donde "Didact" va en navy, "IA" en azul
brand (`#2D5BDE`), y un pequeño sparkle ámbar al lado. **No reemplaces "D" por
un icono Lucide ni por las iniciales del usuario** — eso es un avatar, no la marca.

---

## 6. Layout shell — diferencias clave con un dashboard SaaS genérico

| Componente              | NO hagas                                          | SÍ haz                                                                 |
|-------------------------|---------------------------------------------------|------------------------------------------------------------------------|
| Sidebar                 | Items con ratio extraño, iconos grandes           | 248px de ancho, items 32px de alto, agrupados con eyebrow labels       |
| Topbar                  | Logo grande arriba a la izquierda del topbar      | Logo va **dentro de la sidebar**; el topbar tiene burger, título de página, búsqueda centrada, role switch, iconos |
| Búsqueda                | Input lleno de ancho                              | Input centrado (max 520px) con icono lupa y kbd "⌘K" a la derecha      |
| Avatar/perfil del topbar| Solo avatar                                       | Avatar + 2 líneas (nombre · rol)                                       |
| Rail IA                 | Pop-up modal o widget tipo Intercom flotante      | **Columna a la derecha** de 360px, parte del grid principal del layout |
| Banners globales        | Banner amarillo arriba que ocupa todo             | No existen banners globales. Lo urgente va en el bloque "Atención preferente" |

---

## 7. La pantalla "Inicio" admin NO ES el chat

Esta es la confusión más grave de la primera iteración. Mira
`screenshots/01-inicio-admin.png`:

```
[Saludo Newsreader 36px]                                    [Botón comunicado] [Botón Preguntar IA]
[Sub-línea de fecha y curso, muted]

[Stat 1] [Stat 2] [Stat 3] [Stat 4]    ← grid 4 columnas, gap 14px

[ Línea del día (2/3 ancho) ]    [ Atajos (1/3 ancho) ]
[ Timeline con 7 eventos    ]    [ Grid 3×2 de actions ]

[ Atención preferente (1.4) ]    [ Atajos IA (1) ]
[ Lista de incidencias      ]    [ Suggestion cards ]
```

El **chat** es una pantalla aparte (`#chat`), accesible desde la sidebar.
Cuando estás en Inicio, la IA aparece **solo como rail lateral opcional**,
no ocupa el contenido principal.

---

## 8. Pantallas a implementar y sus screenshots de referencia

| Ruta              | Screenshot                                  | Estructura                                                          |
|-------------------|---------------------------------------------|---------------------------------------------------------------------|
| `/` (admin)       | `01-inicio-admin.png`                       | Dashboard con stats + timeline + atajos + atención preferente       |
| `/` (profesor)    | `07-inicio-profesor.png`                    | Dashboard con stats + horario del día + tutoría + comunicados       |
| `/alumnos`        | `02-alumnos.png`                            | Split 1.4/1: tabla con búsqueda + perfil drawer con tabs            |
| `/asistente`      | `06-chat.png`                               | Split 260/1: lista de conversaciones + chat full                    |
| `/sustituciones`  | `04-sustituciones.png`                      | Tabla densa con popover de asignación + banner IA al final          |
| `/incidencias`    | `05-incidencias.png`                        | Split 1/1.1: lista filtrable + detalle con timeline y caja IA       |

Cada una se debe ver indistinguible a primera vista de su screenshot.

---

## 9. Checklist de "antes de decir que está hecho"

Por cada pantalla:

- [ ] La fuente serif (Newsreader) aparece en todos los títulos
- [ ] El fondo es crema cálido, no blanco ni gris frío
- [ ] Los stat tiles tienen barra lateral de color, icono soft-tinted, sparkline y delta line
- [ ] El logo brand correcto está en la sidebar (navy box + D blanca + chispa ámbar)
- [ ] El item activo de la sidebar es navy con texto blanco
- [ ] La pantalla Inicio (admin) NO es el chat — es un dashboard completo
- [ ] Los bordes son finos (1px), gris cálido, no azules ni grises fríos
- [ ] Las cards no tienen sombra fuerte: solo `1px solid var(--line)` y un leve translateY en hover
- [ ] No hay emojis ni gradients en componentes (solo en avatares fallback)
- [ ] Los iconos son Lucide con `strokeWidth=1.8`, no Material Icons ni Font Awesome
- [ ] El rail IA es una columna del grid, no un popup ni un widget flotante
- [ ] Has comparado la pantalla con su screenshot abriendo ambos lado a lado

Si alguna casilla falla, **no está hecha**. Vuelve a iterar.

---

## 10. Prompt para arrancar la siguiente iteración con Claude Code

> Voy a darte una segunda oportunidad para implementar DidactIA correctamente.
> La primera iteración tenía la funcionalidad pero **no** el aspecto. Antes
> de escribir código:
>
> 1. Abre `design_handoff_didactia/VISUAL_FIDELITY.md` y léelo completo.
> 2. Abre las 6 capturas en `design_handoff_didactia/screenshots/` y mira
>    cada una. Tu output debe parecerse a estas, no a un dashboard SaaS genérico.
> 3. Abre el HTML de referencia en `design_handoff_didactia/reference/DidactIA.html`
>    en el navegador. Esto es el resultado esperado, navégalo entero.
>
> Después:
>
> 4. Implementa primero los **design tokens** del README sección 3 en el theme/CSS.
>    No empieces ningún componente hasta que los tokens existan.
> 5. Implementa el **layout shell** (sidebar + topbar + content + rail) y compáralo
>    con `screenshots/01-inicio-admin.png` antes de seguir.
> 6. Implementa el **logo brand** (SVG completo de la sección 5 del VISUAL_FIDELITY)
>    en la sidebar. No uses un avatar ni un icono Lucide.
> 7. Implementa la pantalla **Inicio admin** entera y compárala con el screenshot.
>    Pasa por el checklist de la sección 9 antes de continuar.
> 8. Una vez la home esté indistinguible del screenshot, sigue con Alumnos →
>    Asistente IA → Sustituciones → Incidencias, una pantalla cada vez.
>
> No declares "hecho" hasta que cada pantalla pase el checklist visual.
