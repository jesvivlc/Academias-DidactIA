-- Tabla: comentarios_competenciales
-- Persiste la evaluación por competencias clave LOMLOE por alumno/asignatura/evaluación.
-- Las columnas niveles (jsonb) almacenan { CCL: 1-4, STEM: 1-4, ... }
-- donde 1=Iniciado, 2=En proceso, 3=Adquirido, 4=Avanzado.

CREATE TABLE IF NOT EXISTS public.comentarios_competenciales (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id        uuid        NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id        uuid        REFERENCES public.alumnos(id) ON DELETE SET NULL,
  alumno_nombre    text        NOT NULL,
  grupo            text        NOT NULL,
  asignatura       text        NOT NULL,
  evaluacion       text        NOT NULL,
  niveles          jsonb       NOT NULL DEFAULT '{}',
  comentario       text,
  generado_por     uuid        REFERENCES auth.users(id),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(centro_id, alumno_nombre, asignatura, evaluacion)
);

ALTER TABLE public.comentarios_competenciales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_ley_centro" ON public.comentarios_competenciales
  FOR ALL USING (
    centro_id = (
      SELECT centro_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (
      SELECT rol FROM public.profiles WHERE id = auth.uid()
    ) = 'superadmin'
  );

CREATE INDEX IF NOT EXISTS idx_comp_ley
  ON public.comentarios_competenciales (centro_id, grupo, evaluacion);
