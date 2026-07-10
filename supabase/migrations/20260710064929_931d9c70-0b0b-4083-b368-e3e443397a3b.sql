
REVOKE EXECUTE ON FUNCTION public.dispatch_push(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_matches_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_requests_push() FROM PUBLIC, anon, authenticated;
