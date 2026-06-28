
-- checkin-photos: workers upload to their own folder (worker_id/...); related parties can read
CREATE POLICY "checkin-photos upload by worker" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checkin-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "checkin-photos read authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'checkin-photos');

-- verifications: each worker uploads to own folder, only owner+admin reads
CREATE POLICY "verifications upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verifications' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "verifications read own or admin" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verifications' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));
