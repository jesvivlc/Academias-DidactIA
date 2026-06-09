-- Módulo Calificaciones — DidactIA
CREATE TABLE IF NOT EXISTS calificaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id      UUID NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  alumno_id      UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  alumno_nombre  TEXT,                          -- desnormalizado para rendimiento
  grupo          TEXT NOT NULL,
  asignatura     TEXT NOT NULL,
  evaluacion     TEXT NOT NULL
                   CHECK (evaluacion IN (
                     '1ª Evaluación',
                     '2ª Evaluación',
                     '3ª Evaluación',
                     'Final'
                   )),
  nota           NUMERIC(4,2)
                   CHECK (nota IS NULL OR (nota >= 0 AND nota <= 10)),
  observaciones  TEXT,
  profesor_id    UUID REFERENCES auth.users(id),
  profesor_nombre TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (centro_id, alumno_id, asignatura, evaluacion)
);

CREATE INDEX IF NOT EXISTS idx_cal_centro
  ON calificaciones(centro_id);
CREATE INDEX IF NOT EXISTS idx_cal_alumno
  ON calificaciones(alumno_id);
CREATE INDEX IF NOT EXISTS idx_cal_grupo
  ON calificaciones(centro_id, grupo);
CREATE INDEX IF NOT EXISTS idx_cal_profesor
  ON calificaciones(profesor_id);

-- RLS
ALTER TABLE calificaciones ENABLE ROW LEVEL SECURITY;

-- Lectura: mismo centro o superadmin
CREATE POLICY "cal_read" ON calificaciones
  FOR SELECT USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (
      SELECT centro_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Insertar: profesor de su centro o jefatura/admin/director
CREATE POLICY "cal_insert" ON calificaciones
  FOR INSERT WITH CHECK (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (
        (SELECT rol FROM profiles WHERE id = auth.uid())
          IN ('jefatura','admin','director')
        OR profesor_id = auth.uid()
      )
    )
  );

-- Actualizar: mismo criterio
CREATE POLICY "cal_update" ON calificaciones
  FOR UPDATE USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (
        (SELECT rol FROM profiles WHERE id = auth.uid())
          IN ('jefatura','admin','director')
        OR profesor_id = auth.uid()
      )
    )
  );

-- Eliminar: solo jefatura/admin/director/superadmin
CREATE POLICY "cal_delete" ON calificaciones
  FOR DELETE USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid())
        IN ('jefatura','admin','director')
    )
  );
