-- Personas autorizadas a recoger a un alumno (seguridad, infantil/primaria).
CREATE TABLE IF NOT EXISTS public.personas_autorizadas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id  uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id  uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  nombre     text NOT NULL,
  relacion   text,
  dni        text,
  telefono   text,
  creado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.personas_autorizadas ENABLE ROW LEVEL SECURITY;

-- Familia: gestiona las personas autorizadas de sus hijos
CREATE POLICY "pa_familia" ON public.personas_autorizadas FOR ALL
  USING (alumno_id IN (SELECT alumno_id FROM public.familia_alumno WHERE profile_id = auth.uid()))
  WITH CHECK (alumno_id IN (SELECT alumno_id FROM public.familia_alumno WHERE profile_id = auth.uid()));

-- Staff del centro: lectura y gestión
CREATE POLICY "pa_staff" ON public.personas_autorizadas FOR ALL
  USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
    OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
  );

CREATE INDEX IF NOT EXISTS idx_pa_alumno ON public.personas_autorizadas (centro_id, alumno_id);
