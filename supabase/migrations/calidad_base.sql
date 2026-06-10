-- Módulo Calidad — DidactIA
-- Idempotente (IF NOT EXISTS + DO-EXCEPTION para políticas).

-- 1. No Conformidades
CREATE TABLE IF NOT EXISTS no_conformidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  reporter_id uuid REFERENCES profiles(id),
  proceso_categoria text NOT NULL DEFAULT 'general'
    CHECK (proceso_categoria IN (
      'docencia','mantenimiento','comedor','transporte',
      'convivencia','administracion','seguridad','general'
    )),
  descripcion_raw text NOT NULL,
  descripcion_anonimizada text,
  estado text NOT NULL DEFAULT 'abierta'
    CHECK (estado IN ('abierta','en_analisis','capa_ejecutada','cerrada')),
  prioridad text NOT NULL DEFAULT 'media'
    CHECK (prioridad IN ('baja','media','alta','critica')),
  reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Acciones CAPA
CREATE TABLE IF NOT EXISTS acciones_capa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  nc_id uuid NOT NULL REFERENCES no_conformidades(id) ON DELETE CASCADE,
  causa_raiz text,
  plan_accion text,
  responsable_id uuid REFERENCES profiles(id),
  fecha_objetivo date,
  fecha_verificacion date,
  es_eficaz bool,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Feedback de familias
CREATE TABLE IF NOT EXISTS feedback_familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  alumno_id uuid REFERENCES alumnos(id),
  familia_user_id uuid REFERENCES profiles(id),
  canal text NOT NULL DEFAULT 'formulario'
    CHECK (canal IN ('formulario','email','chat','presencial')),
  texto_raw text NOT NULL,
  categoria_ia text,
  sentimiento_ia numeric(3,2),
  resumen_ia text,
  requiere_accion bool NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','en_gestion','resuelto')),
  respuesta_borrador text,
  retention_expiry timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Documentos automatizados
CREATE TABLE IF NOT EXISTS documentos_calidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  tipo_documento text NOT NULL,
  titulo text NOT NULL,
  audio_url text,
  transcripcion text,
  contenido_generado text,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','revisado','enviado')),
  creado_por uuid REFERENCES profiles(id),
  alumno_id uuid REFERENCES alumnos(id),
  destinatarios jsonb DEFAULT '[]',
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Plantillas de documentos
CREATE TABLE IF NOT EXISTS plantillas_calidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  nombre text NOT NULL,
  tipo text NOT NULL,
  contenido_plantilla text NOT NULL,
  campos_requeridos jsonb DEFAULT '[]',
  activa bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Evaluaciones Platinum
CREATE TABLE IF NOT EXISTS evaluaciones_platinum (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES centros(id),
  curso_escolar text NOT NULL DEFAULT '2025-26',
  ambito text NOT NULL
    CHECK (ambito IN ('liderazgo','aprendizaje','mision')),
  indicador text NOT NULL,
  valoracion integer NOT NULL CHECK (valoracion BETWEEN 1 AND 4),
  evidencia text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_nc_centro ON no_conformidades(centro_id, estado);
CREATE INDEX IF NOT EXISTS idx_nc_prioridad ON no_conformidades(centro_id, prioridad, estado);
CREATE INDEX IF NOT EXISTS idx_capa_nc ON acciones_capa(nc_id);
CREATE INDEX IF NOT EXISTS idx_capa_centro ON acciones_capa(centro_id, fecha_objetivo);
CREATE INDEX IF NOT EXISTS idx_feedback_centro ON feedback_familias(centro_id, estado);
CREATE INDEX IF NOT EXISTS idx_feedback_familia ON feedback_familias(familia_user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_retention ON feedback_familias(retention_expiry);
CREATE INDEX IF NOT EXISTS idx_docs_centro ON documentos_calidad(centro_id, estado);
CREATE INDEX IF NOT EXISTS idx_plantillas_centro ON plantillas_calidad(centro_id, activa);
CREATE INDEX IF NOT EXISTS idx_platinum_centro ON evaluaciones_platinum(centro_id, curso_escolar);

-- 8. RLS
ALTER TABLE no_conformidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE acciones_capa ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_familias ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_calidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_calidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluaciones_platinum ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "nc_centro" ON no_conformidades FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "capa_centro" ON acciones_capa FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Staff ve todo; familia solo su propio feedback
  CREATE POLICY "feedback_centro" ON feedback_familias FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (
        (SELECT rol FROM profiles WHERE id = auth.uid())
          IN ('admin','admin_institucional','superadmin','director','jefatura','orientador','profesional')
        OR familia_user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "docs_centro" ON documentos_calidad FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "plantillas_centro" ON plantillas_calidad FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "platinum_centro" ON evaluaciones_platinum FOR ALL USING (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
