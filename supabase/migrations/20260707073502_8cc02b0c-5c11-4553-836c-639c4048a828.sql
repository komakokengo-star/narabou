ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS confirm_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_confirmed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_matches_await_deadline
  ON public.matches (confirm_deadline_at)
  WHERE status = 'awaiting_confirmation';