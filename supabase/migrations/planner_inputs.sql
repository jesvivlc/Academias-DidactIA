-- DidactIA Planner — modelo de datos de ENTRADA del generador
-- Una tabla por hoja de DidactIA_Planner_datos_26-27.xlsx
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- RLS por centro: mismo patrón "centro_isolation" que el resto de tablas del proyecto.

-- ── Tablas ──
CREATE TABLE IF NOT EXISTS public.planner_profesores (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id         uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  nombre            text,
  horas_lectivas    numeric,
  asignaturas_texto text,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planner_cargas (        -- sesiones a colocar
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id   uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  profesor    text,
  grupo       text,
  asignatura  text,
  horas       numeric,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planner_tramos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id    uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  modelo       text,
  orden        integer,
  hora_inicio  text,
  hora_fin     text,
  tipo         text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planner_restricciones (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id   uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  detalle     text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planner_disponibilidad (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id   uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  profesor    text,
  dia         text,
  tramo       text,
  disponible  boolean,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planner_espacios (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id         uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  nombre            text,
  tipo              text,
  asignaturas_texto text,
  capacidad         integer,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planner_reglas (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id   uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  regla       text,
  aplicar     boolean,
  comentario  text,
  created_at  timestamptz DEFAULT now()
);

-- ── Índices por centro ──
CREATE INDEX IF NOT EXISTS idx_planner_profesores_centro     ON public.planner_profesores(centro_id);
CREATE INDEX IF NOT EXISTS idx_planner_cargas_centro         ON public.planner_cargas(centro_id);
CREATE INDEX IF NOT EXISTS idx_planner_tramos_centro         ON public.planner_tramos(centro_id);
CREATE INDEX IF NOT EXISTS idx_planner_restricciones_centro  ON public.planner_restricciones(centro_id);
CREATE INDEX IF NOT EXISTS idx_planner_disponibilidad_centro ON public.planner_disponibilidad(centro_id);
CREATE INDEX IF NOT EXISTS idx_planner_espacios_centro       ON public.planner_espacios(centro_id);
CREATE INDEX IF NOT EXISTS idx_planner_reglas_centro         ON public.planner_reglas(centro_id);

-- ── RLS: aislamiento por centro (o superadmin) ──
ALTER TABLE public.planner_profesores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_cargas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_tramos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_restricciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_disponibilidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_espacios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_reglas         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centro_isolation" ON public.planner_profesores FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.planner_cargas FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.planner_tramos FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.planner_restricciones FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.planner_disponibilidad FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.planner_espacios FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "centro_isolation" ON public.planner_reglas FOR ALL
  USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
