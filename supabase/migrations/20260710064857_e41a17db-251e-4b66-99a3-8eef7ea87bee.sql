
-- Device tokens for Firebase Cloud Messaging (Web Push)
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON public.device_tokens(user_id) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own device tokens" ON public.device_tokens;
CREATE POLICY "Users manage their own device tokens"
  ON public.device_tokens FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Push dispatch helper: POST to public webhook that resolves user + sends FCM
CREATE OR REPLACE FUNCTION public.dispatch_push(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project--bc84fda8-23a4-4dfd-8a53-fea4e73274e7.lovable.app/api/public/hooks/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := payload
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_push failed: %', SQLERRM;
END;
$$;

-- Match events → push
CREATE OR REPLACE FUNCTION public.on_matches_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.dispatch_push(jsonb_build_object(
      'event','match_created','match_id',NEW.id
    ));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','match_approved','match_id',NEW.id));
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','match_rejected','match_id',NEW.id));
    ELSIF NEW.status = 'awaiting_confirmation' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','awaiting_confirmation','match_id',NEW.id));
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','completed','match_id',NEW.id));
    ELSIF NEW.status = 'force_completed' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','force_completed','match_id',NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_push ON public.matches;
CREATE TRIGGER trg_matches_push
AFTER INSERT OR UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.on_matches_push();

-- Request events → push (auto-cancel)
CREATE OR REPLACE FUNCTION public.on_requests_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'canceled' AND OLD.status = 'open' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','auto_canceled','request_id',NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requests_push ON public.requests;
CREATE TRIGGER trg_requests_push
AFTER UPDATE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.on_requests_push();
