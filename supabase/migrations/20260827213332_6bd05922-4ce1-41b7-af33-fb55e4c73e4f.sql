DROP POLICY IF EXISTS docs_storage_select ON storage.objects;
CREATE POLICY docs_storage_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND public.is_office_member(auth.uid()));