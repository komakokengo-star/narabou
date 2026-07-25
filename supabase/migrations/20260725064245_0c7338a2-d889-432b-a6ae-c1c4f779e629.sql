
DROP POLICY IF EXISTS "checkin-photos upload by worker" ON storage.objects;

CREATE POLICY "checkin-photos upload by assigned worker" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'checkin-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.worker_id = auth.uid()
        AND m.status IN ('approved','arrived','in_progress','awaiting_confirmation')
    )
  );
