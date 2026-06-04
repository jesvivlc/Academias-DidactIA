-- Permite registrar ausencias sin sustituto asignado todavía
ALTER TABLE public.sustituciones
  ALTER COLUMN profesor_sustituto DROP NOT NULL;
