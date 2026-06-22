-- Caché de resultados de IA deterministas (A8). De momento la usa cas-analyzer
-- (clasificación de Learning Outcomes CAS: misma actividad → mismos LOs, sin fecha).
-- NO se cachea tipificar-incidencia: su informe_borrador incrusta la fecha del día.
--
-- Solo la service_role (Edge Functions) accede. RLS activada SIN políticas: ningún
-- rol de cliente puede leer/escribir; la service_role bypasea RLS. La EF es fail-open:
-- si esta tabla no existe, sigue llamando a Gemini con normalidad.

CREATE TABLE IF NOT EXISTS ia_cache (
  cache_key  TEXT PRIMARY KEY,
  fn         TEXT NOT NULL,
  output     JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ia_cache ENABLE ROW LEVEL SECURITY;
-- Sin CREATE POLICY a propósito: tabla de uso exclusivo de Edge Functions (service_role).
