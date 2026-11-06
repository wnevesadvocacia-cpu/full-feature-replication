ALTER TABLE public.djen_source_health
  ADD COLUMN IF NOT EXISTS tjsp_last_ok_at timestamptz,
  ADD COLUMN IF NOT EXISTS tjsp_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS tjsp_block_streak integer NOT NULL DEFAULT 0;