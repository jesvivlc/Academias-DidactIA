-- Fix: ausencias_profesor.tramo pasó a ser opcional cuando el módulo se rediseñó
-- de registro por-tramo a ausencias multi-día con fecha_fin/tipo/estado.
-- La columna existe desde rrhh_migration.sql con NOT NULL sin DEFAULT.
ALTER TABLE public.ausencias_profesor
  ALTER COLUMN tramo DROP NOT NULL;

-- Verifica el resultado:
-- SELECT column_name, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'ausencias_profesor'
-- ORDER BY ordinal_position;
