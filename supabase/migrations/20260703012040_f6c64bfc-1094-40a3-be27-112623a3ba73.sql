
CREATE TABLE public.stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stripe_events TO authenticated;
GRANT ALL ON public.stripe_events TO service_role;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read stripe_events" ON public.stripe_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
