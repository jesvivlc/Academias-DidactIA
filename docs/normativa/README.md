# Normativa para el RAG (base de conocimiento)

Carpeta de documentos que se vectorizarán para el RAG normativo de DidactIA
(plan completo en `CLAUDE-ROADMAP.md` → "🧠 PRÓXIMO: RAG / Base de conocimiento normativo").

La IA cita estos documentos en el copiloto de RRHH, la tipificación de incidencias,
orientación y un futuro "Consulta normativa". **Solo fuentes oficiales** (BOE, DOGV, etc.).

## Estructura

```
docs/normativa/
  global/                  ← compartido por todos los centros (estatal + autonómico)
    manifest.json
    EBEP_RDL_5-2015.pdf
    decreto_convivencia_valenciana_2023.pdf
    ...
  centro/
    ies-bunol/             ← <slug del centro>
      manifest.json
      NOF_IES_Bunol.pdf
      ...
    agora-lledo/
      manifest.json
      ...
```

## Metadatos (`manifest.json`)

El nombre del archivo NO basta para saber el ámbito, la fecha o si sigue vigente.
Cada carpeta lleva un `manifest.json` que el ingestor (`scripts/ingestar_normativa.mjs`,
pendiente) leerá. Esquema en `manifest.example.json`. Campos:

| Campo | Qué es | Ejemplo |
|-------|--------|---------|
| `archivo` | nombre del PDF en esta carpeta | `"EBEP_RDL_5-2015.pdf"` |
| `titulo` | título legible que se citará | `"EBEP — Real Decreto Legislativo 5/2015"` |
| `tipo` | categoría | `ley` / `decreto` / `instruccion` / `convenio` / `nof` / `pec` / `otro` |
| `ambito` | a quién aplica (filtro de búsqueda) | `estatal` / `valenciana` / `andaluza` / … |
| `fecha_doc` | fecha de la norma | `"2015-10-30"` |
| `vigente` | ¿sigue en vigor? (no citar derogadas) | `true` |
| `source_url` | enlace oficial (se muestra en la cita) | `"https://www.boe.es/..."` |

> ⚠️ **Vigencia:** marcar `vigente: false` (o quitar del manifest) cualquier norma
> derogada o sustituida. Citar un artículo derogado es peor que no citar.

## Importante
- **CCAA de cada centro:** Agora Lledó y IES Buñol están en la **Comunitat Valenciana**
  → su `ambito` autonómico es `valenciana`. (Pendiente: añadir columna `centros.ccaa`.)
- Para el PoC (Fase 1) basta con 1–2 documentos: p. ej. `global/EBEP...pdf` +
  `centro/ies-bunol/NOF...pdf`.
