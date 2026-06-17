-- Encuestas a familias: dirección crea encuestas, familias responden, dirección ve resultados.

CREATE TABLE IF NOT EXISTS public.encuestas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  preguntas jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id,texto,tipo:'escala'|'opcion'|'si_no'|'texto',opciones?[]}]
  destinatarios text NOT NULL DEFAULT 'todos',   -- 'todos' | 'grupo:XXXX'
  estado text NOT NULL DEFAULT 'borrador',        -- borrador | abierta | cerrada
  anonima boolean NOT NULL DEFAULT false,
  fecha_cierre date,
  creado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.encuesta_respuestas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encuesta_id uuid NOT NULL REFERENCES public.encuestas(id) ON DELETE CASCADE,
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  familia_id uuid REFERENCES public.profiles(id),  -- null si anónima
  respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {pregunta_id: valor}
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_encuesta_familia
  ON public.encuesta_respuestas (encuesta_id, familia_id)
  WHERE familia_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_encuestas_centro ON public.encuestas (centro_id, estado);
CREATE INDEX IF NOT EXISTS idx_enc_resp_encuesta ON public.encuesta_respuestas (encuesta_id);

ALTER TABLE public.encuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encuesta_respuestas ENABLE ROW LEVEL SECURITY;

-- Lectura de encuestas: staff del centro siempre; familia solo las 'abierta'/'cerrada' del centro.
CREATE POLICY "enc_read" ON public.encuestas FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND ((SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia' OR estado <> 'borrador'))
);

-- Gestión de encuestas: dirección/admin/jefatura del centro.
CREATE POLICY "enc_manage" ON public.encuestas FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura'))
);

-- Respuestas: staff del centro lee todas (resultados); familia inserta/lee las suyas.
CREATE POLICY "enc_resp_read" ON public.encuesta_respuestas FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND ((SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia' OR familia_id = auth.uid()))
);

CREATE POLICY "enc_resp_insert" ON public.encuesta_respuestas FOR INSERT WITH CHECK (
  centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
  AND (familia_id = auth.uid() OR familia_id IS NULL)
);
