-- ============================================================================
-- RAG normativo — Fase 1 (base de conocimiento vectorial)
-- ----------------------------------------------------------------------------
-- Tabla kb_chunks: fragmentos de normativa vectorizados (pgvector). Dos scopes:
--   - 'global'  → compartido por todos los centros (estatal + por CCAA). centro_id = NULL.
--   - 'centro'  → normativa interna de UN centro (NOF, PEC…). centro_id = el del centro.
-- En consulta, un centro recupera: global de su ámbito (estatal + su CCAA) + lo suyo.
--
-- Embeddings: Gemini gemini-embedding-001 (Matryoshka, outputDimensionality=768) → 768 dims.
-- Búsqueda: similitud coseno vía RPC match_kb (SECURITY DEFINER, filtra por scope+ámbito+vigencia).
--
-- Aplicar en Supabase SQL Editor (o vía scripts/aplicar-migraciones-pendientes.mjs).
-- ============================================================================

-- pgvector viene preinstalado en Supabase.
CREATE EXTENSION IF NOT EXISTS vector;

-- ── centros.ccaa ────────────────────────────────────────────────────────────
-- Ámbito autonómico del centro: filtra qué normativa global (además de la estatal)
-- es aplicable. La EF tipificar-incidencia ya la leía (caía a fallback estatal).
ALTER TABLE public.centros ADD COLUMN IF NOT EXISTS ccaa text;
-- Centros actuales (Agora Lledó, IES Buñol) están en la Comunitat Valenciana.
UPDATE public.centros SET ccaa = 'valenciana' WHERE ccaa IS NULL;

-- ── kb_chunks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('global','centro')),
  centro_id   uuid REFERENCES public.centros(id) ON DELETE CASCADE,  -- NULL si scope='global'
  ambito      text NOT NULL DEFAULT 'estatal',                       -- 'estatal' | 'valenciana' | …
  doc_titulo  text NOT NULL,
  doc_tipo    text NOT NULL DEFAULT 'otro',                          -- ley | decreto | instruccion | convenio | nof | pec | otro
  fecha_doc   date,
  vigente     boolean NOT NULL DEFAULT true,
  chunk_index int  NOT NULL DEFAULT 0,                               -- orden del fragmento dentro del documento
  chunk_text  text NOT NULL,
  embedding   vector(768),
  source_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Coherencia scope ↔ centro_id: global sin centro; centro con centro.
  CONSTRAINT kb_scope_centro_chk CHECK (
    (scope = 'global' AND centro_id IS NULL) OR
    (scope = 'centro' AND centro_id IS NOT NULL)
  )
);

-- Índice vectorial HNSW (coseno). HNSW no necesita entrenamiento previo (a diferencia
-- de ivfflat), por lo que rinde bien con corpus pequeños desde el primer documento.
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON public.kb_chunks USING hnsw (embedding vector_cosine_ops);

-- Índices de apoyo para los filtros del RPC.
CREATE INDEX IF NOT EXISTS idx_kb_chunks_scope_ambito
  ON public.kb_chunks (scope, ambito) WHERE vigente;
CREATE INDEX IF NOT EXISTS idx_kb_chunks_centro
  ON public.kb_chunks (centro_id) WHERE scope = 'centro';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- La ingesta y la búsqueda van por service_role (script) / SECURITY DEFINER (RPC),
-- que bypasean RLS. Las políticas siguientes son defensa en profundidad para
-- accesos directos a la tabla desde el cliente (anon/authenticated).
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;

-- El corpus global lo puede leer cualquier usuario autenticado.
DROP POLICY IF EXISTS kb_global_read ON public.kb_chunks;
CREATE POLICY kb_global_read ON public.kb_chunks
  FOR SELECT TO authenticated
  USING (scope = 'global');

-- La normativa de centro sólo la lee personal de ese centro (o superadmin).
DROP POLICY IF EXISTS kb_centro_read ON public.kb_chunks;
CREATE POLICY kb_centro_read ON public.kb_chunks
  FOR SELECT TO authenticated
  USING (
    scope = 'centro' AND (
      centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
    )
  );
-- Sin políticas de INSERT/UPDATE/DELETE: sólo service_role escribe (la ingesta).

-- ── RPC match_kb ────────────────────────────────────────────────────────────
-- Devuelve los fragmentos más similares a query_embedding, filtrando por:
--   · vigente = true (nunca citar normas derogadas)
--   · scope global del ámbito del centro (estatal + su CCAA)  +  scope centro propio
-- SECURITY DEFINER: la EF la invoca con la identidad ya resuelta del JWT y pasa
-- p_centro_id / p_ambito derivados del perfil del usuario (no del body).
CREATE OR REPLACE FUNCTION public.match_kb(
  query_embedding vector(768),
  p_centro_id     uuid,
  p_ambito        text DEFAULT 'estatal',
  match_count     int  DEFAULT 6
)
RETURNS TABLE (
  id         uuid,
  scope      text,
  ambito     text,
  doc_titulo text,
  doc_tipo   text,
  fecha_doc  date,
  chunk_text text,
  source_url text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    k.id, k.scope, k.ambito, k.doc_titulo, k.doc_tipo, k.fecha_doc,
    k.chunk_text, k.source_url,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.kb_chunks k
  WHERE k.vigente
    AND k.embedding IS NOT NULL
    AND (
      (k.scope = 'global' AND k.ambito IN ('estatal', p_ambito))
      OR (k.scope = 'centro' AND p_centro_id IS NOT NULL AND k.centro_id = p_centro_id)
    )
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;
