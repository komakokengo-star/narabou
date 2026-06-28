REVOKE ALL ON FUNCTION public.is_request_worker(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_request_customer(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_match_worker(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_checkin_match(uuid, uuid) FROM PUBLIC, anon, authenticated;