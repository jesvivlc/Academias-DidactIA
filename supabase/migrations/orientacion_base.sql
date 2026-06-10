-- Módulo Orientación — DidactIA (estructura base)
-- Ejecutar manualmente en Supabase → SQL Editor. Solo CREA tablas nuevas (IF NOT EXISTS):
-- no altera ni borra ninguna tabla existente. Idempotente.

-- 1. Expedientes de orientación (uno por alumno)
CREATE TABLE IF NOT EXISTS expedientes_orientacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  alumno_id uuid NOT NULL REFERENCES alumnos(id),
  orientador_id uuid REFERENCES profiles(id),
  fecha_apertura date NOT NULL DEFAULT CURRENT_DATE,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','archivado')),
  notas_internas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(centro_id, alumno_id)
);

-- 2. Informes psicopedagógicos
CREATE TABLE IF NOT EXISTS informes_psicopedagogicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  expediente_id uuid NOT NULL REFERENCES expedientes_orientacion(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('evaluacion_inicial','revision','dictamen','otro')),
  borrador_texto text,
  texto_final text,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','validado','firmado')),
  creado_por uuid REFERENCES profiles(id),
  fecha_validacion timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Medidas de atención a la diversidad
CREATE TABLE IF NOT EXISTS medidas_atencion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  expediente_id uuid NOT NULL REFERENCES expedientes_orientacion(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ACNS','ACS','NEE','NEAE','PECAI','otro')),
  descripcion text,
  asignaturas_afectadas jsonb DEFAULT '[]',
  activa bool NOT NULL DEFAULT true,
  fecha_inicio date,
  fecha_fin date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Cuestionarios para docentes
CREATE TABLE IF NOT EXISTS cuestionarios_docentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  expediente_id uuid NOT NULL REFERENCES expedientes_orientacion(id) ON DELETE CASCADE,
  profesor_id uuid REFERENCES profiles(id),
  asignatura text,
  respuestas jsonb DEFAULT '{}',
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','completado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Trámites administrativos
CREATE TABLE IF NOT EXISTS tramites_orientacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  expediente_id uuid NOT NULL REFERENCES expedientes_orientacion(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('dictamen','escolarizacion','alta_capacidades','otro')),
  estado_tramite text NOT NULL DEFAULT 'iniciado',
  descripcion text,
  fecha_estimada date,
  visible_familia bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Alertas de riesgo
CREATE TABLE IF NOT EXISTS alertas_orientacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  alumno_id uuid NOT NULL REFERENCES alumnos(id),
  tipo text NOT NULL CHECK (tipo IN ('rendimiento','asistencia','conducta','combinada')),
  nivel_riesgo text NOT NULL CHECK (nivel_riesgo IN ('bajo','medio','alto')),
  descripcion_ia text,
  estado text NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva','en_seguimiento','resuelta')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_exp_centro ON expedientes_orientacion(centro_id);
CREATE INDEX IF NOT EXISTS idx_exp_alumno ON expedientes_orientacion(alumno_id);
CREATE INDEX IF NOT EXISTS idx_alertas_centro ON alertas_orientacion(centro_id, nivel_riesgo);

-- 8. RLS
ALTER TABLE expedientes_orientacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE informes_psicopedagogicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE medidas_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuestionarios_docentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tramites_orientacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_orientacion ENABLE ROW LEVEL SECURITY;

-- Política base: superadmin ve todo, resto filtrado por centro_id
-- (misma lógica que el resto de módulos del proyecto)
CREATE POLICY "orientacion_centro" ON expedientes_orientacion
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "informes_centro" ON informes_psicopedagogicos
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "medidas_centro" ON medidas_atencion
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "cuestionarios_centro" ON cuestionarios_docentes
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "tramites_centro" ON tramites_orientacion
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "alertas_centro" ON alertas_orientacion
  FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
