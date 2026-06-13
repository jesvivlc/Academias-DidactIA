-- Módulo Control de Asistencia de Aula
-- Ejecutar en Supabase SQL Editor o Management API

CREATE TABLE IF NOT EXISTS public.asistencia_clase (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE CASCADE,
  profesor_id uuid REFERENCES public.profiles(id),
  grupo_horario text NOT NULL,
  fecha date NOT NULL,
  tramo integer NOT NULL,
  estado text NOT NULL CHECK (estado IN ('presente', 'ausente', 'retraso')),
  observacion text,
  notificado_familia boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(centro_id, alumno_id, fecha, tramo)
);

ALTER TABLE public.asistencia_clase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asistencia_clase_centro" ON public.asistencia_clase FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE INDEX IF NOT EXISTS idx_asistencia_clase_fecha
  ON public.asistencia_clase (centro_id, fecha, grupo_horario);
