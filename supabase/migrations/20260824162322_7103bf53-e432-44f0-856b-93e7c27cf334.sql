CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('propagar-huecos-semanal')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'propagar-huecos-semanal');

SELECT cron.schedule(
  'propagar-huecos-semanal',
  '0 3 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://project--218b6b09-cd3b-4aa5-87ca-9babb5369fb1.lovable.app/api/public/hooks/propagar-huecos',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveXB2a2h2aXpzbmV4Z2R6dXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzYxMDYsImV4cCI6MjA5ODMxMjEwNn0.-UcSWQj8YfeyDT8sRJ-IojKnQ7GaWqlnfnYXMAiMpkY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);