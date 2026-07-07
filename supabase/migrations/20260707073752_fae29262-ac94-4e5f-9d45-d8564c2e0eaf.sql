CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('auto-confirm-completion') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-confirm-completion');

SELECT cron.schedule(
  'auto-confirm-completion',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--bc84fda8-23a4-4dfd-8a53-fea4e73274e7.lovable.app/api/public/hooks/auto-confirm-completion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2Y3FzZWpkc2R6aGNvbnRsdGxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODA1NzYsImV4cCI6MjA5ODE1NjU3Nn0.6W_Vsq4h8_UCxlqVOSzwUcxzgjzlHQmKMklq6NN5Tx0'
    ),
    body := '{}'::jsonb
  );
  $$
);