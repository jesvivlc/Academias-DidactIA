-- ============================================================
-- MIGRACIÓN: fix bugs producción 2026-05-29
-- Ejecutar en Supabase SQL Editor (proyecto rflfsbrdmgaidhvbuvwb)
-- ============================================================

-- BUG 1: ausencias_profesor.tramo era NOT NULL pero el módulo
-- rediseñado nunca lo escribe (solo usa fecha/fecha_fin).
-- _crearSustituciones obtiene tramos de horarios_grupo al aprobar.
ALTER TABLE public.ausencias_profesor ALTER COLUMN tramo DROP NOT NULL;

-- BUG 2: columnas de tipificación IA que el código escribe
-- pero que nunca se añadieron a la tabla en producción.
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS informe_borrador   text;
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS normativa_ref      text;
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS medidas_propuestas text[];
ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS protocolo_previ    boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
