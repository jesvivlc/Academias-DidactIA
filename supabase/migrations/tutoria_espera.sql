-- Lista de espera de tutorías: familia se apunta cuando todas las franjas de un día
-- están ocupadas; al liberarse un hueco (cancelación) se avisa por push a la 1ª en cola.

CREATE TABLE IF NOT EXISTS public.tutoria_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  tutor_id uuid,
  alumno_id uuid,
  alumno_nombre text,
  grupo_horario text,
  familia_id uuid NOT NULL,
  fecha date,
  notificado boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tut_espera ON public.tutoria_espera (centro_id, tutor_id, fecha);

ALTER TABLE public.tutoria_espera ENABLE ROW LEVEL SECURITY;

-- Staff del centro: acceso total (gestiona/avisa).
CREATE POLICY "tut_esp_staff" ON public.tutoria_espera FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
);
-- Familia: lee, inserta y borra solo las suyas.
CREATE POLICY "tut_esp_fam_read" ON public.tutoria_espera FOR SELECT USING (familia_id = auth.uid());
CREATE POLICY "tut_esp_fam_ins" ON public.tutoria_espera FOR INSERT WITH CHECK (
  familia_id = auth.uid() AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tut_esp_fam_del" ON public.tutoria_espera FOR DELETE USING (familia_id = auth.uid());
