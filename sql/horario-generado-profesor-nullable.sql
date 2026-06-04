-- DidactIA Planner — permitir horarios sin profesor asignado
-- Hace profesor_id nullable en horario_generado para poder generar el horario
-- (colocar materias en slots) y asignar el docente después.
-- Ejecutar en Supabase SQL Editor con rol service_role. Idempotente.

ALTER TABLE public.horario_generado ALTER COLUMN profesor_id DROP NOT NULL;

-- Nota: la restricción UNIQUE(profesor_id, dia_semana, tramo_horario) sigue siendo
-- válida — PostgreSQL trata los NULL como distintos, por lo que varios slots
-- "sin asignar" pueden coexistir en el mismo día/tramo de distintos grupos.
-- La UNIQUE(grupo_horario, dia_semana, tramo_horario) garantiza una clase por
-- grupo y slot, asignada o no.
