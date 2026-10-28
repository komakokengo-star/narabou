CREATE FUNCTION public.renew_worker_availability()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ログインしてください'; END IF;
  UPDATE public.worker_availability a SET updated_at = now(), expires_at = now() + interval '5 minutes'
  WHERE a.worker_id = v_uid AND a.is_available AND a.expires_at > now()
  AND public.has_role(v_uid, 'worker')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.suspended_at IS NULL AND p.stripe_account_ready IS TRUE)
  AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.worker_id = v_uid AND m.status IN ('approved','arrived','in_progress'));
END; $$;
REVOKE ALL ON FUNCTION public.renew_worker_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_worker_availability() TO authenticated;