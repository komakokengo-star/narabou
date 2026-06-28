CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.can_access_payment_request(_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = _request_id
      AND r.customer_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.request_id = _request_id
      AND m.worker_id = _user_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_payment_request(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "requests select" ON public.requests;
CREATE POLICY "requests select"
ON public.requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = customer_id
  OR private.has_role(auth.uid(), 'admin')
  OR (private.has_role(auth.uid(), 'worker') AND status = 'open')
  OR (private.has_role(auth.uid(), 'worker') AND private.is_request_worker(id, auth.uid()))
);

DROP POLICY IF EXISTS "requests update" ON public.requests;
CREATE POLICY "requests update"
ON public.requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = customer_id
  OR private.has_role(auth.uid(), 'admin')
  OR private.is_request_worker(id, auth.uid())
)
WITH CHECK (
  auth.uid() = customer_id
  OR private.has_role(auth.uid(), 'admin')
  OR private.is_request_worker(id, auth.uid())
);

DROP POLICY IF EXISTS "matches insert" ON public.matches;
CREATE POLICY "matches insert"
ON public.matches
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = worker_id AND private.has_role(auth.uid(), 'worker'));

DROP POLICY IF EXISTS "matches select" ON public.matches;
CREATE POLICY "matches select"
ON public.matches
FOR SELECT
TO authenticated
USING (
  auth.uid() = worker_id
  OR private.has_role(auth.uid(), 'admin')
  OR private.is_request_customer(request_id, auth.uid())
);

DROP POLICY IF EXISTS "matches update" ON public.matches;
CREATE POLICY "matches update"
ON public.matches
FOR UPDATE
TO authenticated
USING (
  auth.uid() = worker_id
  OR private.has_role(auth.uid(), 'admin')
  OR private.is_request_customer(request_id, auth.uid())
)
WITH CHECK (
  auth.uid() = worker_id
  OR private.has_role(auth.uid(), 'admin')
  OR private.is_request_customer(request_id, auth.uid())
);

DROP POLICY IF EXISTS "checkins select" ON public.checkins;
CREATE POLICY "checkins select"
ON public.checkins
FOR SELECT
TO authenticated
USING (
  private.can_access_checkin_match(match_id, auth.uid())
  OR private.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "payments select" ON public.payments;
CREATE POLICY "payments select"
ON public.payments
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.can_access_payment_request(request_id, auth.uid())
);

DROP POLICY IF EXISTS "audit_logs admin select" ON public.audit_logs;
CREATE POLICY "audit_logs admin select"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "verifications select" ON storage.objects;
CREATE POLICY "verifications select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verifications'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR private.has_role(auth.uid(), 'admin'))
);