-- Tabla tramos_centro: tramos horarios configurables por centro
-- Incluye recreos/comidas (es_descanso=true) que aparecen en el tablero pero no se asignan clases

CREATE TABLE IF NOT EXISTS public.tramos_centro (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id    uuid    REFERENCES public.centros(id) ON DELETE CASCADE,
  numero       int     NOT NULL,
  hora_inicio  time    NOT NULL,
  hora_fin     time    NOT NULL,
  nombre       text,
  es_descanso  boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(centro_id, numero)
);

ALTER TABLE public.tramos_centro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centro_isolation" ON public.tramos_centro FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE INDEX IF NOT EXISTS idx_tramos_centro_numero ON public.tramos_centro (centro_id, numero);
