CREATE TABLE public.worker_availability (
  worker_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('東京','横浜','名古屋','大阪','京都','神戸','札幌','仙台','広島','福岡')),
  is_available boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.worker_availability TO authenticated;
GRANT ALL ON public.worker_availability TO service_role;
ALTER TABLE public.worker_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY availability_owner_read ON public.worker_availability FOR SELECT TO authenticated USING (worker_id = auth.uid());
CREATE INDEX worker_availability_active_area ON public.worker_availability(area, expires_at) WHERE is_available;

CREATE FUNCTION public.set_worker_availability(p_area text, p_available boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.worker_availability;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ログインしてください'; END IF;
  IF p_area IS NULL OR p_area NOT IN ('東京','横浜','名古屋','大阪','京都','神戸','札幌','仙台','広島','福岡') OR p_available IS NULL THEN RAISE EXCEPTION '受付エリアを選択してください'; END IF;
  IF NOT public.has_role(v_uid, 'worker') OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND suspended_at IS NULL) THEN RAISE EXCEPTION '受付を変更する権限がありません'; END IF;
  IF p_available AND (NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND stripe_account_ready IS TRUE) OR EXISTS (SELECT 1 FROM public.matches WHERE worker_id = v_uid AND status IN ('approved','arrived','in_progress'))) THEN RAISE EXCEPTION '受取口座の登録を完了し、対応中の案件を終了してから受付を開始してください'; END IF;
  INSERT INTO public.worker_availability(worker_id, area, is_available, updated_at, expires_at)
  VALUES (v_uid, p_area, p_available, now(), now() + interval '5 minutes')
  ON CONFLICT (worker_id) DO UPDATE SET area = EXCLUDED.area, is_available = EXCLUDED.is_available, updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('area', v_row.area, 'is_available', v_row.is_available, 'expires_at', v_row.expires_at);
END; $$;
REVOKE ALL ON FUNCTION public.set_worker_availability(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_worker_availability(text, boolean) TO authenticated;

CREATE FUNCTION public.get_worker_availability()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ログインしてください'; END IF;
  RETURN (SELECT jsonb_build_object('area', a.area, 'is_available', a.is_available AND a.expires_at > now() AND p.suspended_at IS NULL AND p.stripe_account_ready IS TRUE AND public.has_role(v_uid, 'worker') AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.worker_id = v_uid AND m.status IN ('approved','arrived','in_progress')), 'expires_at', a.expires_at) FROM public.worker_availability a JOIN public.profiles p ON p.id = a.worker_id WHERE a.worker_id = v_uid);
END; $$;
REVOKE ALL ON FUNCTION public.get_worker_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_availability() TO authenticated;

CREATE FUNCTION public.get_worker_availability_counts()
RETURNS TABLE(area text, available_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND suspended_at IS NULL) THEN RAISE EXCEPTION 'ログインしてください'; END IF;
  RETURN QUERY SELECT a.area, count(*) FROM public.worker_availability a JOIN public.profiles p ON p.id = a.worker_id
  WHERE a.is_available AND a.expires_at > now() AND p.suspended_at IS NULL AND p.stripe_account_ready IS TRUE AND public.has_role(a.worker_id, 'worker')
  AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.worker_id = a.worker_id AND m.status IN ('approved','arrived','in_progress'))
  AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = v_uid AND b.blocked_id = a.worker_id) OR (b.blocked_id = v_uid AND b.blocker_id = a.worker_id))
  GROUP BY a.area;
END; $$;
REVOKE ALL ON FUNCTION public.get_worker_availability_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_availability_counts() TO authenticated;

CREATE FUNCTION public.stop_availability_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('approved','arrived','in_progress') THEN
    UPDATE public.worker_availability SET is_available = false, updated_at = now(), expires_at = now() WHERE worker_id = NEW.worker_id AND is_available;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER matches_stop_availability AFTER INSERT OR UPDATE OF status ON public.matches FOR EACH ROW EXECUTE FUNCTION public.stop_availability_on_approval();