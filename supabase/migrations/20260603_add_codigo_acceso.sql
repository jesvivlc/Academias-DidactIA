-- Add codigo_acceso column to centros (optional registration code → profesional role)
ALTER TABLE public.centros ADD COLUMN IF NOT EXISTS codigo_acceso text;
