-- Idioma preferido del usuario (familias): auto-traducción de comunicados.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS idioma text NOT NULL DEFAULT 'es';
