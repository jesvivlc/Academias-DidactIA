-- Actas de reuniones: resumen IA de claustros y reuniones (dirección).

CREATE TABLE IF NOT EXISTS public.actas_reunion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  fecha date NOT NULL DEFAULT current_date,
  tipo text NOT NULL DEFAULT 'claustro',   -- claustro/ccp/departamento/evaluacion/tutores/otro
  notas_raw text,
  resumen text,
  acuerdos jsonb DEFAULT '[]'::jsonb,        -- ["acuerdo 1", ...]
  tareas jsonb DEFAULT '[]'::jsonb,          -- [{tarea, responsable, fecha}]
  creado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actas_centro ON public.actas_reunion (centro_id, fecha DESC);

ALTER TABLE public.actas_reunion ENABLE ROW LEVEL SECURITY;

-- Gestión y lectura: dirección/admin/jefatura del centro.
CREATE POLICY "actas_all" ON public.actas_reunion FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura'))
);
