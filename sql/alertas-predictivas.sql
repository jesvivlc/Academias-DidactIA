-- Tabla alertas_predictivas: detección temprana de riesgo psicosocial
-- Ejecutar en Supabase SQL Editor (proyecto rflfsbrdmgaidhvbuvwb)

CREATE TABLE IF NOT EXISTS public.alertas_predictivas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'riesgo_abandono',
  nivel text NOT NULL DEFAULT 'medio',
  descripcion text,
  condicion_a boolean DEFAULT false,
  condicion_b boolean DEFAULT false,
  condicion_c boolean DEFAULT false,
  resuelta boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.alertas_predictivas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centro_isolation" ON public.alertas_predictivas FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE INDEX IF NOT EXISTS idx_alertas_centro_activas
  ON public.alertas_predictivas (centro_id, resuelta, created_at DESC);
