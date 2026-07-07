
CREATE SEQUENCE IF NOT EXISTS public.requests_number_seq MINVALUE 1 MAXVALUE 9999 CYCLE;
GRANT USAGE ON SEQUENCE public.requests_number_seq TO authenticated, service_role;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS request_number integer,
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS number_display_method text;

CREATE OR REPLACE FUNCTION public.assign_request_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := nextval('public.requests_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_request_number_trg ON public.requests;
CREATE TRIGGER assign_request_number_trg
BEFORE INSERT ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.assign_request_number();
