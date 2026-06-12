-- Sistema unificado de alergias y dietas especiales
-- PARTE 1: Perfil permanente en alumnos
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS alergias text,
  ADD COLUMN IF NOT EXISTS dieta_especial text;

-- PARTE 2: Nota diaria en asistencia_comedor
ALTER TABLE public.asistencia_comedor
  ADD COLUMN IF NOT EXISTS nota_dia text;
