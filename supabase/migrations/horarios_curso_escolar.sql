-- Soporte multi-curso en horarios_grupo e info_centro
-- Ejecutar en Supabase SQL Editor ANTES de desplegar el código

-- 1. Añadir columna curso_escolar a horarios_grupo
ALTER TABLE horarios_grupo
  ADD COLUMN IF NOT EXISTS curso_escolar TEXT NOT NULL DEFAULT '2025-26';

-- 2. Marcar filas existentes como 2025-26 (el DEFAULT ya lo hace, pero explícito)
UPDATE horarios_grupo
  SET curso_escolar = '2025-26'
  WHERE curso_escolar IS NULL OR curso_escolar = '';

-- 3. Añadir columna curso_activo a info_centro (un valor por centro)
ALTER TABLE info_centro
  ADD COLUMN IF NOT EXISTS curso_activo TEXT NOT NULL DEFAULT '2025-26';

-- 4. Índice para que el filtro por curso sea rápido
CREATE INDEX IF NOT EXISTS idx_hg_curso
  ON horarios_grupo(centro_id, curso_escolar);
