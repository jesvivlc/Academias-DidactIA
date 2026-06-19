-- Agente de cobertura diaria (modo "preparar + avisar"): programa la Edge Function
-- agente-cobertura-diaria para que cada día lectivo, a primera hora, calcule el plan
-- de cobertura del día y lo envíe por email + push a la dirección (NO asigna nada).
--
-- Horario: 06:00 UTC de lunes a viernes ≈ 08:00 (verano) / 07:00 (invierno) en España.
-- La EF ya salta fines de semana internamente; el `1-5` lo refuerza.
--
-- Ámbito: por ahora SOLO IES Buñol (centro de pruebas). Para activarlo en todos los
-- centros, cambiar el body a '{}'::jsonb (la EF solo envía si hay tramos sin cubrir).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('agente-cobertura-diaria')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agente-cobertura-diaria');

SELECT cron.schedule(
  'agente-cobertura-diaria',
  '0 6 * * 1-5',
  $cron$
  SELECT net.http_post(
    url     := 'https://rflfsbrdmgaidhvbuvwb.supabase.co/functions/v1/agente-cobertura-diaria',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'apikey',        '<ANON_KEY>'
    ),
    body    := '{"centro_id":"f91b7c02-f99f-4754-af9b-5b638164ad76"}'::jsonb
  );
  $cron$
);
