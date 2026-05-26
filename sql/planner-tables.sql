-- DidactIA Planner — tablas de generación de horarios
-- Ejecutar en Supabase SQL Editor con rol service_role

CREATE TABLE IF NOT EXISTS public.materias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  color text DEFAULT '#1a56db',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aulas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text DEFAULT 'normal',
  capacidad int DEFAULT 30,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.disponibilidad_profesor (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profesor_id uuid REFERENCES public.profesores(id) ON DELETE CASCADE,
  dia_semana text NOT NULL,
  tramo_horario int NOT NULL,
  estado text DEFAULT 'no_disponible',
  UNIQUE(profesor_id, dia_semana, tramo_horario)
);

CREATE TABLE IF NOT EXISTS public.necesidades_lectivas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  grupo_horario text NOT NULL,
  materia_id uuid REFERENCES public.materias(id) ON DELETE CASCADE,
  profesor_id uuid REFERENCES public.profesores(id) ON DELETE SET NULL,
  horas_semanales int NOT NULL CHECK (horas_semanales > 0),
  tipo_aula_requerida text DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.horario_generado (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  grupo_horario text NOT NULL,
  materia_id uuid REFERENCES public.materias(id) ON DELETE CASCADE,
  profesor_id uuid REFERENCES public.profesores(id) ON DELETE CASCADE,
  aula_id uuid REFERENCES public.aulas(id) ON DELETE SET NULL,
  dia_semana text NOT NULL,
  tramo_horario int NOT NULL,
  es_fijo boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profesor_id, dia_semana, tramo_horario),
  UNIQUE(grupo_horario, dia_semana, tramo_horario)
);

ALTER TABLE public.materias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidad_profesor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.necesidades_lectivas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_generado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centro_isolation" ON public.materias FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.aulas FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.necesidades_lectivas FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.horario_generado FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.disponibilidad_profesor FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profesores p
    WHERE p.id = profesor_id
      AND (p.centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
           OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin')
  ));

CREATE INDEX IF NOT EXISTS idx_horario_centro
  ON public.horario_generado(centro_id);
CREATE INDEX IF NOT EXISTS idx_horario_profesor
  ON public.horario_generado(profesor_id, dia_semana, tramo_horario);
CREATE INDEX IF NOT EXISTS idx_necesidades_centro
  ON public.necesidades_lectivas(centro_id, grupo_horario);
CREATE INDEX IF NOT EXISTS idx_materias_centro
  ON public.materias(centro_id);
