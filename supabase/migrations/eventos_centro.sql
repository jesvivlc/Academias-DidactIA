-- Eventos generales del centro (claustros, reuniones, festivos, evaluaciones,
-- plazos…) para la Agenda. Creados por dirección; visibilidad por rol.
CREATE TABLE IF NOT EXISTS public.eventos_centro (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id    uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  titulo       text NOT NULL,
  fecha        date NOT NULL,
  hora         time,                         -- opcional (null = todo el día)
  tipo         text NOT NULL DEFAULT 'evento', -- evento/reunion/festivo/evaluacion/plazo/otro
  descripcion  text,
  visible_para text NOT NULL DEFAULT 'todos', -- 'todos' | 'staff'
  creado_por   uuid REFERENCES public.profiles(id),
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.eventos_centro ENABLE ROW LEVEL SECURITY;

-- Lectura: staff del centro ve todo; familia solo los 'todos'
CREATE POLICY "ev_read" ON public.eventos_centro FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND ((SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia' OR visible_para = 'todos'))
);

-- Gestión: dirección del centro + superadmin
CREATE POLICY "ev_manage" ON public.eventos_centro FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura'))
);

CREATE INDEX IF NOT EXISTS idx_eventos_centro ON public.eventos_centro (centro_id, fecha);
