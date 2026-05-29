-- ausencias_profesor.tramo fue añadida en el diseño original (por-tramo).
-- El módulo se rediseñó a ausencias multi-día (fecha/fecha_fin). _crearSustituciones
-- obtiene los tramos de horarios_grupo al aprobar — nunca los lee de ausencias_profesor.
-- La columna no se escribe ni se lee: se elimina.
ALTER TABLE public.ausencias_profesor DROP COLUMN IF EXISTS tramo;
NOTIFY pgrst, 'reload schema';
