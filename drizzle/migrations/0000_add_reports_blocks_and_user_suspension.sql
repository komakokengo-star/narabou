CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reported_user_id uuid NOT NULL,
  request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports insert own" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports select own or admin" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "reports update admin" ON public.reports FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks select own" ON public.blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "blocks insert own" ON public.blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks delete own" ON public.blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

ALTER TABLE public.profiles ADD COLUMN suspended_at timestamptz;
COMMENT ON COLUMN public.profiles.suspended_at IS 'Set by admin to suspend (ban) the user. NULL = active.';

CREATE OR REPLACE FUNCTION public.notify_admin_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (kind, severity, title, body, request_id, actor_id, details)
  VALUES (
    'user_report',
    'high',
    'ユーザー通報が届きました',
    '理由: ' || NEW.reason,
    NEW.request_id,
    NEW.reporter_id,
    jsonb_build_object('report_id', NEW.id, 'reported_user_id', NEW.reported_user_id, 'reason', NEW.reason)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_report_insert
  AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_on_report();