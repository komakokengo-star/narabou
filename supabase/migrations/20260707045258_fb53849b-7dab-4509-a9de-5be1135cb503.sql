ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS approval_comment text,
  ADD COLUMN IF NOT EXISTS auto_canceled_at timestamptz;