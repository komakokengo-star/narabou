CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_request_worker(_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches
    WHERE request_id = _request_id
      AND worker_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION private.is_request_customer(_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requests
    WHERE id = _request_id
      AND customer_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION private.is_match_worker(_match_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches
    WHERE id = _match_id
      AND worker_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION private.can_access_checkin_match(_match_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.requests r ON r.id = m.request_id
    WHERE m.id = _match_id
      AND (m.worker_id = _user_id OR r.customer_id = _user_id)
  )
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_request_worker(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_request_customer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_match_worker(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_checkin_match(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "requests select" ON public.requests;
CREATE POLICY "requests select"
ON public.requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = customer_id
  OR public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'worker') AND status = 'open')
  OR (public.has_role(auth.uid(), 'worker') AND private.is_request_worker(id, auth.uid()))
);

DROP POLICY IF EXISTS "requests update" ON public.requests;
CREATE POLICY "requests update"
ON public.requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = customer_id
  OR public.has_role(auth.uid(), 'admin')
  OR private.is_request_worker(id, auth.uid())
)
WITH CHECK (
  auth.uid() = customer_id
  OR public.has_role(auth.uid(), 'admin')
  OR private.is_request_worker(id, auth.uid())
);

DROP POLICY IF EXISTS "matches select" ON public.matches;
CREATE POLICY "matches select"
ON public.matches
FOR SELECT
TO authenticated
USING (
  auth.uid() = worker_id
  OR public.has_role(auth.uid(), 'admin')
  OR private.is_request_customer(request_id, auth.uid())
);

DROP POLICY IF EXISTS "matches update" ON public.matches;
CREATE POLICY "matches update"
ON public.matches
FOR UPDATE
TO authenticated
USING (
  auth.uid() = worker_id
  OR public.has_role(auth.uid(), 'admin')
  OR private.is_request_customer(request_id, auth.uid())
)
WITH CHECK (
  auth.uid() = worker_id
  OR public.has_role(auth.uid(), 'admin')
  OR private.is_request_customer(request_id, auth.uid())
);

DROP POLICY IF EXISTS "checkins select" ON public.checkins;
CREATE POLICY "checkins select"
ON public.checkins
FOR SELECT
TO authenticated
USING (
  private.can_access_checkin_match(match_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "checkins insert" ON public.checkins;
CREATE POLICY "checkins insert"
ON public.checkins
FOR INSERT
TO authenticated
WITH CHECK (private.is_match_worker(match_id, auth.uid()));

DROP FUNCTION IF EXISTS public.is_request_worker(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_request_customer(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_match_worker(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_access_checkin_match(uuid, uuid);