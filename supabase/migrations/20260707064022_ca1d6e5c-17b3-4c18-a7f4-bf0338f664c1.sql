ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS arrival_note text,
  ADD COLUMN IF NOT EXISTS start_note text,
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS worker_features text;