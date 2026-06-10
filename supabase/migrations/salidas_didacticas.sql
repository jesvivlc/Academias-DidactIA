-- 1. Salidas didácticas
CREATE TABLE IF NOT EXISTS salidas_didacticas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  titulo text NOT NULL,
  descripcion text,
  fecha_salida date NOT NULL,
  hora_salida time,
  hora_regreso time,
  curso_grupos jsonb NOT NULL DEFAULT '[]',
  coste decimal(8,2) NOT NULL DEFAULT 0,
  responsable_id uuid REFERENCES profiles(id),
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','publicada','cerrada','cancelada')),
  datos_autobus jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Participantes por salida
CREATE TABLE IF NOT EXISTS participantes_salida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  salida_id uuid NOT NULL REFERENCES salidas_didacticas(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES alumnos(id),
  autorizado bool NOT NULL DEFAULT false,
  pagado bool NOT NULL DEFAULT false,
  necesita_picnic bool NOT NULL DEFAULT false,
  alergias_confirmadas text,
  fecha_autorizacion timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(salida_id, alumno_id)
);

-- 3. Notificaciones programadas
CREATE TABLE IF NOT EXISTS notificaciones_salida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  salida_id uuid NOT NULL REFERENCES salidas_didacticas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('recordatorio','cierre','llegada','cocina')),
  enviada bool NOT NULL DEFAULT false,
  fecha_envio timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_salidas_centro ON salidas_didacticas(centro_id, estado);
CREATE INDEX IF NOT EXISTS idx_participantes_salida ON participantes_salida(salida_id);
CREATE INDEX IF NOT EXISTS idx_participantes_alumno ON participantes_salida(alumno_id);

-- 5. RLS
ALTER TABLE salidas_didacticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE participantes_salida ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones_salida ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salidas_centro" ON salidas_didacticas
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "participantes_centro" ON participantes_salida
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "notif_salidas_centro" ON notificaciones_salida
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
