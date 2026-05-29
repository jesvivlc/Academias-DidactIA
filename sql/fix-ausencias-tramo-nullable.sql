-- ausencias_profesor.tramo: columna del diseño original por-tramo.
-- El módulo se rediseñó a rangos de fechas (fecha/fecha_fin); tramo nunca se escribe
-- en ausencias_profesor. _crearSustituciones obtiene tramos de horarios_grupo al aprobar.
-- DROP NOT NULL permite insertar sin tramo; la columna se conserva por compatibilidad.
ALTER TABLE public.ausencias_profesor ALTER COLUMN tramo DROP NOT NULL;
NOTIFY pgrst, 'reload schema';
