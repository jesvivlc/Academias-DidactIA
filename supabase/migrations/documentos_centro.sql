-- Biblioteca de documentos del centro: circulares, normativa, PGA, formularios…
-- Dirección sube; familias/staff descargan según visible_para.

CREATE TABLE IF NOT EXISTS public.documentos_centro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  categoria text NOT NULL DEFAULT 'otro',   -- circular/normativa/pga/calendario/formulario/otro
  descripcion text,
  tipo text NOT NULL DEFAULT 'archivo',      -- 'archivo' | 'enlace'
  url text,                                  -- para enlaces externos
  storage_path text,                         -- para archivos en bucket documentos-centro
  visible_para text NOT NULL DEFAULT 'todos', -- 'todos' | 'staff' | 'familias'
  subido_por uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_centro ON public.documentos_centro (centro_id, categoria, created_at DESC);

ALTER TABLE public.documentos_centro ENABLE ROW LEVEL SECURITY;

-- Lectura: staff todo el centro; familia solo 'todos'/'familias'.
CREATE POLICY "docs_read" ON public.documentos_centro FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND ((SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
           OR visible_para IN ('todos','familias')))
);

-- Gestión: dirección/admin/jefatura del centro.
CREATE POLICY "docs_manage" ON public.documentos_centro FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura'))
);

-- Bucket privado + políticas de Storage (path: {centro_id}/{archivo}).
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos-centro','documentos-centro', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "docc_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'documentos-centro'
  AND (storage.foldername(name))[1] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "docc_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'documentos-centro'
  AND (storage.foldername(name))[1] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
  AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura','superadmin')
);
CREATE POLICY "docc_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'documentos-centro'
  AND (storage.foldername(name))[1] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
  AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura','superadmin')
);
CREATE POLICY "docc_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'documentos-centro'
  AND (storage.foldername(name))[1] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
  AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura','superadmin')
);
