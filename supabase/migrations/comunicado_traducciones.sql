-- Caché persistente de traducciones de comunicados (F1.4 / M6).
-- Evita re-llamar a Gemini cada vez que una familia abre un comunicado en su idioma.
-- La política, al ser FOR ALL con sólo USING (sin WITH CHECK), aplica el mismo
-- predicado a SELECT e INSERT/UPDATE: cualquier usuario del centro del comunicado
-- puede leer y poblar la caché.

CREATE TABLE IF NOT EXISTS comunicado_traducciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
  idioma TEXT NOT NULL,
  titulo_traducido TEXT,
  cuerpo_traducido TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comunicado_id, idioma)
);

ALTER TABLE comunicado_traducciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trad_read" ON comunicado_traducciones
  USING (EXISTS (
    SELECT 1 FROM comunicados c
    WHERE c.id = comunicado_id
      AND c.centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
  ));
