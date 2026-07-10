
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS force_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS force_completion_reason text;

-- 5分毎: 放置案件の強制完了（希望日時+2h超過で未完了のマッチを検知）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-force-complete-abandoned') THEN
    PERFORM cron.unschedule('auto-force-complete-abandoned');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-force-complete-abandoned',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://narabou.lovable.app/api/public/hooks/auto-force-complete-abandoned',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_PUBLISHABLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);
