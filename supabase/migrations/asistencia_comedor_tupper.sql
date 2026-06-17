-- Comedor: estado "se queda con tupper" (trae su propia comida, sin menú).
-- Un alumno con se_queda=true + tupper=true se queda pero con su tupper.
ALTER TABLE public.asistencia_comedor
  ADD COLUMN IF NOT EXISTS tupper boolean NOT NULL DEFAULT false;
