-- ────────────────────────────────────────────────────────────────────────────
-- MÓDULO CALIDAD — DDL
-- Ejecutar en Supabase SQL Editor (rol postgres / service_role)
-- ────────────────────────────────────────────────────────────────────────────

-- ── NO CONFORMIDADES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.no_conformidades (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id        uuid        REFERENCES public.centros(id) ON DELETE CASCADE,
  reporter_id      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  proceso_categoria text       NOT NULL DEFAULT 'general'
                               CHECK (proceso_categoria IN (
                                 'docencia','mantenimiento','comedor','transporte',
                                 'convivencia','administracion','seguridad','general'
                               )),
  prioridad        text        NOT NULL DEFAULT 'media'
                               CHECK (prioridad IN ('baja','media','alta','critica')),
  descripcion_raw  text        NOT NULL,
  estado           text        NOT NULL DEFAULT 'abierta'
                               CHECK (estado IN (
                                 'abierta','en_analisis','capa_ejecutada','cerrada'
                               )),
  reported_at      date        NOT NULL DEFAULT CURRENT_DATE,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.no_conformidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_nc_read" ON public.no_conformidades FOR SELECT
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_nc_insert" ON public.no_conformidades FOR INSERT
  WITH CHECK (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_nc_update" ON public.no_conformidades FOR UPDATE
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_nc_delete" ON public.no_conformidades FOR DELETE
  USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid())
      IN ('admin','director','jefatura','superadmin')
    AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE INDEX IF NOT EXISTS idx_nc_centro_estado
  ON public.no_conformidades (centro_id, estado, prioridad);

-- ── ACCIONES CAPA ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acciones_capa (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id          uuid        REFERENCES public.centros(id) ON DELETE CASCADE,
  nc_id              uuid        REFERENCES public.no_conformidades(id) ON DELETE CASCADE NOT NULL,
  causa_raiz         text,
  plan_accion        text,
  responsable_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  fecha_objetivo     date,
  fecha_verificacion date,
  es_eficaz          boolean,    -- NULL = pendiente de verificar
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE public.acciones_capa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_capa_read" ON public.acciones_capa FOR SELECT
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_capa_insert" ON public.acciones_capa FOR INSERT
  WITH CHECK (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_capa_update" ON public.acciones_capa FOR UPDATE
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_capa_delete" ON public.acciones_capa FOR DELETE
  USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid())
      IN ('admin','director','jefatura','superadmin')
  );

CREATE INDEX IF NOT EXISTS idx_capa_nc
  ON public.acciones_capa (nc_id, es_eficaz);

CREATE INDEX IF NOT EXISTS idx_capa_centro_fecha
  ON public.acciones_capa (centro_id, fecha_objetivo);

-- ── FEEDBACK FAMILIAS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback_familias (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id        uuid         REFERENCES public.centros(id) ON DELETE CASCADE,
  familia_user_id  uuid         REFERENCES public.profiles(id) ON DELETE SET NULL,
  alumno_id        uuid         REFERENCES public.alumnos(id) ON DELETE SET NULL,
  canal            text         NOT NULL DEFAULT 'formulario'
                                CHECK (canal IN ('formulario','email','chat','presencial')),
  texto_raw        text         NOT NULL,
  -- campos rellenados de forma asíncrona por el análisis IA
  categoria_ia     text,
  sentimiento_ia   numeric(3,2),   -- -1.00 (muy negativo) … 1.00 (muy positivo)
  resumen_ia       text,
  requiere_accion  boolean      DEFAULT false,
  respuesta_borrador text,
  estado           text         NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente','en_gestion','resuelto')),
  created_at       timestamptz  DEFAULT now()
);

ALTER TABLE public.feedback_familias ENABLE ROW LEVEL SECURITY;

-- Familias pueden insertar y leer su propio feedback; dirección lee todo su centro
CREATE POLICY "cal_fb_read" ON public.feedback_familias FOR SELECT
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR familia_user_id = auth.uid()
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_fb_insert" ON public.feedback_familias FOR INSERT
  WITH CHECK (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_fb_update" ON public.feedback_familias FOR UPDATE
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "cal_fb_delete" ON public.feedback_familias FOR DELETE
  USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid())
      IN ('admin','director','jefatura','superadmin')
  );

CREATE INDEX IF NOT EXISTS idx_fb_centro_estado
  ON public.feedback_familias (centro_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_sentimiento
  ON public.feedback_familias (centro_id, sentimiento_ia);

-- ── DOCUMENTOS DE CALIDAD ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_calidad (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id  uuid        REFERENCES public.centros(id) ON DELETE CASCADE,
  titulo     text        NOT NULL,
  tipo       text        NOT NULL DEFAULT 'general',
  contenido  text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.documentos_calidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_docs_centro" ON public.documentos_calidad FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE INDEX IF NOT EXISTS idx_docs_cal_centro
  ON public.documentos_calidad (centro_id, created_at DESC);

-- ── PLANTILLAS DE CALIDAD ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plantillas_calidad (
  id                  uuid   DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id           uuid   REFERENCES public.centros(id) ON DELETE CASCADE,
  nombre              text   NOT NULL,
  tipo                text   NOT NULL,
  contenido_plantilla text   NOT NULL,
  campos_requeridos   jsonb  DEFAULT '[]'::jsonb,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.plantillas_calidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_plantillas_centro" ON public.plantillas_calidad FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- ── EVALUACIONES PLATINUM (estructura base) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evaluaciones_platinum (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id   uuid        REFERENCES public.centros(id) ON DELETE CASCADE,
  curso_escolar text      NOT NULL DEFAULT '2025-26',
  dimension   text        NOT NULL,   -- liderazgo, personas, procesos, resultados, ...
  criterio    text        NOT NULL,
  puntuacion  integer     CHECK (puntuacion BETWEEN 0 AND 100),
  evidencias  text,
  evaluado_por uuid       REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.evaluaciones_platinum ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_platinum_centro" ON public.evaluaciones_platinum FOR ALL
  USING (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE INDEX IF NOT EXISTS idx_platinum_centro
  ON public.evaluaciones_platinum (centro_id, curso_escolar);
