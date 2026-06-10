-- Rol admin_institucional: admin de empresa/institución con múltiples centros
-- Puede ver y gestionar todos los centros de su institución; nunca los de otras.

-- 1. Tabla instituciones
CREATE TABLE IF NOT EXISTS public.instituciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instituciones ENABLE ROW LEVEL SECURITY;
-- Solo el superadmin puede crear/ver/editar instituciones
DO $$ BEGIN
  CREATE POLICY "inst_superadmin" ON public.instituciones
    FOR ALL USING (auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Vincular centros a institución
ALTER TABLE public.centros
  ADD COLUMN IF NOT EXISTS institucion_id uuid REFERENCES public.instituciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_centros_institucion ON public.centros(institucion_id);

-- 3. Vincular profiles a institución (para admin_institucional)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institucion_id uuid REFERENCES public.instituciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_institucion ON public.profiles(institucion_id);
