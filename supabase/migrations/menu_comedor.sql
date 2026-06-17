-- Menú del comedor: dirección publica el menú diario; familias y personal lo consultan.

CREATE TABLE IF NOT EXISTS public.menu_comedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  primer text,
  segundo text,
  postre text,
  notas text,                      -- alérgenos / observaciones
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_centro_fecha ON public.menu_comedor (centro_id, fecha);

ALTER TABLE public.menu_comedor ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier miembro del centro (incl. familia).
CREATE POLICY "menu_read" ON public.menu_comedor FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
);

-- Gestión: dirección/admin/jefatura del centro.
CREATE POLICY "menu_manage" ON public.menu_comedor FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) IN ('admin','admin_institucional','director','jefatura'))
);
