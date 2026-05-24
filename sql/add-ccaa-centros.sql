-- Añade campo ccaa a la tabla centros para seleccionar normativa de convivencia
-- Valores soportados: 'valenciana' | NULL (usa normativa estatal como fallback)
ALTER TABLE public.centros ADD COLUMN IF NOT EXISTS ccaa text;

-- Centros de la Comunitat Valenciana
UPDATE public.centros
SET ccaa = 'valenciana'
WHERE id IN (
  'f91b7c02-f99f-4754-af9b-5b638164ad76',
  'ad0168e8-6c24-4597-8917-ee54cac8234b'
);
