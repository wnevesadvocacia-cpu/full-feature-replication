
INSERT INTO storage.buckets (id, name, public)
VALUES ('wnevesbox-backups', 'wnevesbox-backups', false)
ON CONFLICT (id) DO NOTHING;

-- service_role bypasses RLS, so no public policies needed.
-- Restrict any authenticated access: only admins can read backups via storage.objects
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admins can read wnevesbox-backups') THEN
    CREATE POLICY "Admins can read wnevesbox-backups"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'wnevesbox-backups' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;
