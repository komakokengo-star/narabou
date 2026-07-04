
-- 1. Profiles: restrict SELECT to owner, admins, and matched counterparts
DROP POLICY IF EXISTS "profiles select all auth" ON public.profiles;

CREATE POLICY "profiles select own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles select admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles select match counterpart" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.requests r ON r.id = m.request_id
      WHERE (r.customer_id = auth.uid() AND m.worker_id = public.profiles.id)
         OR (m.worker_id = auth.uid() AND r.customer_id = public.profiles.id)
    )
  );

-- 2. user_roles: explicit deny-writes policies (admin-only writes)
CREATE POLICY "user_roles admin insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles admin update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles admin delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Storage: scope checkin-photos SELECT to match participants + admin
DROP POLICY IF EXISTS "checkin-photos read authenticated" ON storage.objects;

CREATE POLICY "checkin-photos read participants" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.matches m
        JOIN public.requests r ON r.id = m.request_id
        WHERE m.worker_id::text = (storage.foldername(name))[1]
          AND r.customer_id = auth.uid()
      )
    )
  );

-- 4. Lock down SECURITY DEFINER functions: revoke public/anon/authenticated EXECUTE
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- 5. Fix mutable search_path on remaining functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = '';
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = '';
