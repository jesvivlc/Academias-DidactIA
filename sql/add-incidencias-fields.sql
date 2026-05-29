-- Añade campos de tipificación IA a la tabla incidencias
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS informe_borrador   text;
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS normativa_ref      text;
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS medidas_propuestas text[];
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS protocolo_previ    boolean DEFAULT false;
NOTIFY pgrst, 'reload schema';
