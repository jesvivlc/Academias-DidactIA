-- Módulo Materiales — DidactIA (hub de materiales por grupo/asignatura)
-- Ejecutar en Supabase → SQL Editor. Idempotente.

-- ── Tabla ──
CREATE TABLE IF NOT EXISTS public.materiales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  grupo           text NOT NULL,
  asignatura      text,
  titulo          text NOT NULL,
  tipo            text CHECK (tipo IN ('archivo', 'enlace')),
  url             text,
  storage_path    text,
  descripcion     text,
  profesor_id     uuid REFERENCES auth.users(id),
  profesor_nombre text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materiales_centro ON public.materiales(centro_id);
CREATE INDEX IF NOT EXISTS idx_materiales_grupo  ON public.materiales(centro_id, grupo);

-- ── RLS de la tabla ──
ALTER TABLE public.materiales ENABLE ROW LEVEL SECURITY;

-- Lectura: TODOS los roles del centro (incl. alumno/familia) o superadmin
CREATE POLICY "mat_read" ON public.materiales FOR SELECT USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
);

-- Insertar: superadmin o rol docente/dirección del mismo centro
CREATE POLICY "mat_insert" ON public.materiales FOR INSERT WITH CHECK (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid())
      IN ('profesional', 'admin', 'director', 'jefatura')
  )
);

-- Actualizar: mismo criterio que insertar
CREATE POLICY "mat_update" ON public.materiales FOR UPDATE USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid())
      IN ('profesional', 'admin', 'director', 'jefatura')
  )
);

-- Eliminar: quien lo subió (profesor_id = auth.uid()) o admin/superadmin del centro
CREATE POLICY "mat_delete" ON public.materiales FOR DELETE USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR profesor_id = auth.uid()
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
  )
);

-- ── Storage: bucket privado 'materiales' (archivos en carpeta {centro_id}/...) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('materiales', 'materiales', false)
ON CONFLICT (id) DO NOTHING;

-- RLS de Storage por centro (la primera carpeta de la ruta es el centro_id)
CREATE POLICY "materiales_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'materiales' AND (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (storage.foldername(name))[1] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "materiales_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'materiales' AND (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      (storage.foldername(name))[1] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid())
        IN ('profesional', 'admin', 'director', 'jefatura')
    )
  )
);

CREATE POLICY "materiales_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'materiales' AND (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR owner = auth.uid()
    OR (
      (storage.foldername(name))[1] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
    )
  )
);
