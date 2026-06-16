-- Módulo Tutorías: disponibilidad del tutor + citas tutor-familia
-- Ejecutar en Supabase SQL Editor

-- Tabla: ventanas de disponibilidad definidas por el tutor
CREATE TABLE IF NOT EXISTS public.tutoria_disponibilidad (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id     uuid REFERENCES public.centros(id) ON DELETE CASCADE NOT NULL,
  tutor_id      uuid REFERENCES public.profiles(id) NOT NULL,
  grupo_horario text NOT NULL,
  dia_semana    smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 5), -- 1=lun … 5=vie
  hora_inicio   time NOT NULL,
  hora_fin      time NOT NULL,
  duracion_min  smallint NOT NULL DEFAULT 20,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.tutoria_disponibilidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tut_disp_staff" ON public.tutoria_disponibilidad FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
  );

-- Familias pueden leer disponibilidad para reservar citas
CREATE POLICY "tut_disp_familia_read" ON public.tutoria_disponibilidad FOR SELECT
  USING (
    activo = true
    AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_tut_disp_centro ON public.tutoria_disponibilidad (centro_id, grupo_horario, activo);
CREATE INDEX IF NOT EXISTS idx_tut_disp_tutor  ON public.tutoria_disponibilidad (tutor_id, activo);

-- Tabla: citas concretas (una por franja horaria solicitada)
CREATE TABLE IF NOT EXISTS public.tutoria_citas (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id     uuid REFERENCES public.centros(id) ON DELETE CASCADE NOT NULL,
  disp_id       uuid REFERENCES public.tutoria_disponibilidad(id) ON DELETE SET NULL,
  tutor_id      uuid REFERENCES public.profiles(id) NOT NULL,
  alumno_id     uuid REFERENCES public.alumnos(id) ON DELETE CASCADE NOT NULL,
  alumno_nombre text,          -- denormalizado para display rápido
  grupo_horario text,          -- denormalizado para display rápido
  familia_id    uuid REFERENCES public.profiles(id) NOT NULL,
  fecha         date NOT NULL,
  hora_inicio   time NOT NULL,
  hora_fin      time NOT NULL,
  motivo        text,
  notas_tutor   text,          -- solo visible por el tutor
  estado        text NOT NULL DEFAULT 'solicitada'
                CHECK (estado IN ('solicitada','confirmada','realizada','cancelada')),
  cancelada_por text CHECK (cancelada_por IN ('tutor','familia')),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (disp_id, fecha, hora_inicio)  -- impide doble reserva
);
ALTER TABLE public.tutoria_citas ENABLE ROW LEVEL SECURITY;

-- Staff (no familia): acceso completo a citas de su centro
CREATE POLICY "tut_citas_staff" ON public.tutoria_citas FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
  );

-- Familias: solo sus propias citas (por familia_id)
CREATE POLICY "tut_citas_familia_select" ON public.tutoria_citas FOR SELECT
  USING (familia_id = auth.uid());

CREATE POLICY "tut_citas_familia_insert" ON public.tutoria_citas FOR INSERT
  WITH CHECK (
    familia_id = auth.uid()
    AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "tut_citas_familia_update" ON public.tutoria_citas FOR UPDATE
  USING (familia_id = auth.uid())
  WITH CHECK (familia_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_tut_citas_centro ON public.tutoria_citas (centro_id, fecha, estado);
CREATE INDEX IF NOT EXISTS idx_tut_citas_tutor  ON public.tutoria_citas (tutor_id, fecha);
CREATE INDEX IF NOT EXISTS idx_tut_citas_familia ON public.tutoria_citas (familia_id);
CREATE INDEX IF NOT EXISTS idx_tut_citas_disp   ON public.tutoria_citas (disp_id, fecha);
