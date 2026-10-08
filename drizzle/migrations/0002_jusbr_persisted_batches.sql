CREATE TABLE public.jusbr_batches (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 rows jsonb NOT NULL DEFAULT '[]'::jsonb,
 coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','starting','running','reconciled','incomplete')),
 djen_run_id text,
 inserted integer NOT NULL DEFAULT 0,
 pending integer NOT NULL DEFAULT 0,
 error text,
 notified boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jusbr_batches TO authenticated;
GRANT ALL ON public.jusbr_batches TO service_role;
ALTER TABLE public.jusbr_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY jusbr_batches_owner_read ON public.jusbr_batches FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY jusbr_batches_service ON public.jusbr_batches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX jusbr_batches_owner_created ON public.jusbr_batches(user_id, created_at DESC);