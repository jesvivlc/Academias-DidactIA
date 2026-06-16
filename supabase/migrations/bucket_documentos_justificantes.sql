-- Bucket privado 'documentos' para justificantes de ausencias
-- ───────────────────────────────────────────────────────────────────────────
-- BUG: js/admin.js sube/descarga justificantes a sb.storage.from("documentos"),
-- pero ese bucket NUNCA existió (solo había 'documents' y 'materiales'). Como el
-- upload tiene .catch(()=>{}), los justificantes se perdían en silencio.
--
-- FIX: crear el bucket PRIVADO 'documentos' (los justificantes son sensibles —
-- médicos — así que NO debe ser público; el código ya usa createSignedUrl).
-- Ruta de los objetos: justificantes/{centro_id}/rrhh_{ausencia_id}.{ext}
--   → el centro_id es el SEGUNDO segmento de carpeta: (storage.foldername(name))[2]
-- Acceso staff-only del centro (la familia no ve justificantes de nadie).

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Lectura: staff del centro (no familia). Superadmin global.
DROP POLICY IF EXISTS "documentos_read" ON storage.objects;
CREATE POLICY "documentos_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'documentos' AND (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      (storage.foldername(name))[2] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
    )
  )
);

-- Inserción: el profesor sube su justificante; dirección también.
DROP POLICY IF EXISTS "documentos_insert" ON storage.objects;
CREATE POLICY "documentos_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'documentos' AND (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      (storage.foldername(name))[2] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid())
        IN ('profesional', 'admin', 'admin_institucional', 'director', 'jefatura')
    )
  )
);

-- Actualización (el upload usa upsert:true → puede hacer UPDATE del objeto).
DROP POLICY IF EXISTS "documentos_update" ON storage.objects;
CREATE POLICY "documentos_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'documentos' AND (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      (storage.foldername(name))[2] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid())
        IN ('profesional', 'admin', 'admin_institucional', 'director', 'jefatura')
    )
  )
);

-- Borrado: dirección del centro + superadmin.
DROP POLICY IF EXISTS "documentos_delete" ON storage.objects;
CREATE POLICY "documentos_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'documentos' AND (
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (
      (storage.foldername(name))[2] = (SELECT centro_id::text FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid())
        IN ('admin', 'admin_institucional', 'director', 'jefatura', 'superadmin')
    )
  )
);
