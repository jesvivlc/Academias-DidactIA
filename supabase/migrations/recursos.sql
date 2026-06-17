-- Préstamo de recursos: inventario de material prestable + registro de préstamos.

CREATE TABLE IF NOT EXISTS public.recursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  categoria text,                       -- portátil/tablet/libro/proyector/deporte/otro
  codigo text,                          -- código de inventario
  estado text NOT NULL DEFAULT 'disponible',  -- disponible | prestado | baja
  notas text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prestamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  recurso_id uuid NOT NULL REFERENCES public.recursos(id) ON DELETE CASCADE,
  persona text NOT NULL,                -- a quién se presta (texto libre)
  prestado_a_id uuid REFERENCES public.profiles(id),  -- opcional, si es un usuario
  fecha_prestamo date NOT NULL,
  fecha_prevista date,
  fecha_devolucion date,                -- null = préstamo activo
  notas text,
  registrado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recursos_centro ON public.recursos (centro_id, estado);
CREATE INDEX IF NOT EXISTS idx_prestamos_centro ON public.prestamos (centro_id, fecha_devolucion);
CREATE INDEX IF NOT EXISTS idx_prestamos_recurso ON public.prestamos (recurso_id);

ALTER TABLE public.recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestamos ENABLE ROW LEVEL SECURITY;

-- Gestión (lectura + escritura) por personal del centro (no familia).
CREATE POLICY "rec_all" ON public.recursos FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
);
CREATE POLICY "prest_all" ON public.prestamos FOR ALL USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
);
