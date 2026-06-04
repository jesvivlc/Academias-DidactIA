-- Activa pg_cron (planificador nativo de Supabase)
-- y pg_net (llamadas HTTP desde la DB).
-- Ambas extensiones están preinstaladas en Supabase;
-- CREATE EXTENSION IF NOT EXISTS es idempotente.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Eliminar job previo si existía (idempotente)
SELECT cron.unschedule('notify-justificante-daily')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'notify-justificante-daily'
  );

-- Programar la Edge Function todos los días a las 08:00 UTC
SELECT cron.schedule(
  'notify-justificante-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://rflfsbrdmgaidhvbuvwb.supabase.co/functions/v1/notify-justificante',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTAxNDgsImV4cCI6MjA4Nzc2NjE0OH0.tJuFxAZCSxdukUvL9BbhdxtCbudCmmv2HLZr6qp7LPs',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTAxNDgsImV4cCI6MjA4Nzc2NjE0OH0.tJuFxAZCSxdukUvL9BbhdxtCbudCmmv2HLZr6qp7LPs'
    ),
    body    := '{}'::jsonb
  );
  $$
);
