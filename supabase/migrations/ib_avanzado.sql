-- Módulo IB avanzado — TOK, EE (borradores/feedback) y predicciones/resultados.
-- Ejecutar en Supabase SQL Editor. Idempotente (IF NOT EXISTS). RLS por centro.

-- ── 1. TOK (Theory of Knowledge): ensayo + exhibición por alumno IB ──
CREATE TABLE IF NOT EXISTS public.ib_tok (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  ensayo_titulo text,
  ensayo_estado text NOT NULL DEFAULT 'pendiente',      -- pendiente/borrador/entregado/evaluado
  ensayo_nota text,                                      -- A,B,C,D,E
  exhibicion_tema text,
  exhibicion_estado text NOT NULL DEFAULT 'pendiente',
  exhibicion_nota text,
  comentarios text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(centro_id, alumno_id)
);

-- ── 2. Borradores y feedback del Extended Essay ──
CREATE TABLE IF NOT EXISTS public.ee_borradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  extended_essay_id uuid NOT NULL REFERENCES public.extended_essay(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  palabras int,
  comentario_supervisor text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Predicciones y resultados por asignatura (IBIS-adjacent) ──
CREATE TABLE IF NOT EXISTS public.ib_resultados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  asignatura text NOT NULL,
  nivel text NOT NULL DEFAULT 'HL',                      -- HL/SL
  prediccion int,                                        -- 1-7
  nota_final int,                                        -- 1-7
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(centro_id, alumno_id, asignatura)
);

-- ── Índices ──
CREATE INDEX IF NOT EXISTS idx_ib_tok_centro      ON public.ib_tok(centro_id, alumno_id);
CREATE INDEX IF NOT EXISTS idx_ee_borr_ee         ON public.ee_borradores(centro_id, extended_essay_id);
CREATE INDEX IF NOT EXISTS idx_ib_res_centro      ON public.ib_resultados(centro_id, alumno_id);

-- ── RLS por centro (mismo patrón que el resto del proyecto) ──
ALTER TABLE public.ib_tok        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ee_borradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ib_resultados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ib_tok_centro" ON public.ib_tok FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );
CREATE POLICY "ee_borradores_centro" ON public.ee_borradores FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );
CREATE POLICY "ib_resultados_centro" ON public.ib_resultados FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- ── 4. Nota final del Extended Essay (A-E), para la matriz de puntos core ──
ALTER TABLE public.extended_essay ADD COLUMN IF NOT EXISTS nota text;
