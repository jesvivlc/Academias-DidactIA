-- ═══════════════════════════════════════════════════════════════
--  MÓDULO RRHH — ausencias_profesor · profesores · guardias_realizadas
-- ═══════════════════════════════════════════════════════════════

-- ── 1. ausencias_profesor ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ausencias_profesor (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id     uuid        NOT NULL REFERENCES centros(id)  ON DELETE CASCADE,
  profile_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fecha         date        NOT NULL,
  tramo         int         NOT NULL,
  trimestre     int         NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  curso_escolar text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ausencias_centro_fecha_idx ON ausencias_profesor(centro_id, fecha);
CREATE INDEX IF NOT EXISTS ausencias_profile_idx      ON ausencias_profesor(profile_id);
CREATE INDEX IF NOT EXISTS ausencias_curso_tramo_idx  ON ausencias_profesor(curso_escolar, tramo);

ALTER TABLE ausencias_profesor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ausencias_select" ON ausencias_profesor FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin'       AND p.centro_id = ausencias_profesor.centro_id)
      OR  p.id                              = ausencias_profesor.profile_id)
  ));

CREATE POLICY "ausencias_insert" ON ausencias_profesor FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin'       AND p.centro_id = ausencias_profesor.centro_id)
      OR (p.rol = 'profesional' AND p.id = ausencias_profesor.profile_id
                                AND p.centro_id = ausencias_profesor.centro_id))
  ));

CREATE POLICY "ausencias_update" ON ausencias_profesor FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin'       AND p.centro_id = ausencias_profesor.centro_id)
      OR (p.rol = 'profesional' AND p.id = ausencias_profesor.profile_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin'       AND p.centro_id = ausencias_profesor.centro_id)
      OR (p.rol = 'profesional' AND p.id = ausencias_profesor.profile_id
                                AND p.centro_id = ausencias_profesor.centro_id))
  ));

CREATE POLICY "ausencias_delete" ON ausencias_profesor FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = ausencias_profesor.centro_id))
  ));

-- ── 2. profesores ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profesores (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid        NOT NULL REFERENCES centros(id)  ON DELETE CASCADE,
  profile_id      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  nombre          text        NOT NULL,
  especialidad    text,
  departamento    text,
  horas_semanales int,
  tipo_jornada    text        CHECK (tipo_jornada IN ('completa','parcial','sustituto')),
  activo          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profesores_centro_idx  ON profesores(centro_id);
CREATE INDEX IF NOT EXISTS profesores_profile_idx ON profesores(profile_id);
CREATE INDEX IF NOT EXISTS profesores_activo_idx  ON profesores(centro_id, activo);

ALTER TABLE profesores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profesores_select" ON profesores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol IN ('admin','profesional') AND p.centro_id = profesores.centro_id))
  ));

CREATE POLICY "profesores_insert" ON profesores FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = profesores.centro_id))
  ));

CREATE POLICY "profesores_update" ON profesores FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = profesores.centro_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = profesores.centro_id))
  ));

CREATE POLICY "profesores_delete" ON profesores FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = profesores.centro_id))
  ));

-- ── 3. guardias_realizadas ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardias_realizadas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid        NOT NULL REFERENCES centros(id)             ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES profiles(id)            ON DELETE CASCADE,
  ausencia_id     uuid        REFERENCES ausencias_profesor(id) ON DELETE SET NULL,
  fecha           date        NOT NULL,
  tramo           int         NOT NULL,
  grupo_horario   text,
  aula            text,
  observaciones   text,
  trimestre       int         NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  curso_escolar   text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guardias_centro_fecha_idx ON guardias_realizadas(centro_id, fecha);
CREATE INDEX IF NOT EXISTS guardias_profile_idx      ON guardias_realizadas(profile_id);
CREATE INDEX IF NOT EXISTS guardias_ausencia_idx     ON guardias_realizadas(ausencia_id);

ALTER TABLE guardias_realizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guardias_select" ON guardias_realizadas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin'       AND p.centro_id = guardias_realizadas.centro_id)
      OR  p.id                              = guardias_realizadas.profile_id)
  ));

CREATE POLICY "guardias_insert" ON guardias_realizadas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin'       AND p.centro_id = guardias_realizadas.centro_id)
      OR (p.rol = 'profesional' AND p.id = guardias_realizadas.profile_id
                                AND p.centro_id = guardias_realizadas.centro_id))
  ));

CREATE POLICY "guardias_update" ON guardias_realizadas FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = guardias_realizadas.centro_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = guardias_realizadas.centro_id))
  ));

CREATE POLICY "guardias_delete" ON guardias_realizadas FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND (p.activo IS NOT FALSE)
    AND (p.rol = 'superadmin'
      OR (p.rol = 'admin' AND p.centro_id = guardias_realizadas.centro_id))
  ));
