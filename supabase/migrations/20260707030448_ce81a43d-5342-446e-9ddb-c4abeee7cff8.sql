
REVOKE ALL ON FUNCTION public.notify_admin(text,text,text,text,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_requests_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_matches_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_payments_change() FROM PUBLIC, anon, authenticated;
