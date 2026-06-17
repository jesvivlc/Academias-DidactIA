-- Registro de lectura de comunicados (para medir participación familiar de forma central).
-- Se inserta cuando un usuario abre un comunicado en la app (js/comunicados.js → _comMarkLeido).

CREATE TABLE IF NOT EXISTS public.comunicado_lecturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  comunicado_id uuid NOT NULL REFERENCES public.comunicados(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_com_lectura ON public.comunicado_lecturas (comunicado_id, user_id);
CREATE INDEX IF NOT EXISTS idx_com_lect_centro ON public.comunicado_lecturas (centro_id, comunicado_id);

ALTER TABLE public.comunicado_lecturas ENABLE ROW LEVEL SECURITY;

-- Cada usuario inserta/lee sus propias lecturas.
CREATE POLICY "comlec_own_rw" ON public.comunicado_lecturas FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid()));

-- Staff del centro lee todas (dashboard de participación).
CREATE POLICY "comlec_staff_read" ON public.comunicado_lecturas FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
);
