-- DidactIA Planner — tabla de entrada GRUPOS (hoja "3. Grupos" del xlsx)
-- Complementa supabase/migrations/planner_inputs.sql. Ejecutar en SQL Editor. Idempotente.

CREATE TABLE IF NOT EXISTS public.planner_grupos (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id   uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  grupo       text,
  curso       text,
  num_alumnos integer,
  tutor       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_grupos_centro ON public.planner_grupos(centro_id);

ALTER TABLE public.planner_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centro_isolation" ON public.planner_grupos FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
