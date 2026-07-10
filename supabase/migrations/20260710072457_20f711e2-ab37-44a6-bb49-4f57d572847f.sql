CREATE OR REPLACE FUNCTION public.on_matches_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.dispatch_push(jsonb_build_object(
      'event','match_created','match_id',NEW.id
    ));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','match_approved','match_id',NEW.id));
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','match_rejected','match_id',NEW.id));
    ELSIF NEW.status = 'awaiting_confirmation' THEN
      PERFORM public.dispatch_push(jsonb_build_object('event','awaiting_confirmation','match_id',NEW.id));
    ELSIF NEW.status = 'completed' THEN
      IF NEW.force_completed_at IS NOT NULL THEN
        PERFORM public.dispatch_push(jsonb_build_object('event','force_completed','match_id',NEW.id));
      ELSE
        PERFORM public.dispatch_push(jsonb_build_object('event','completed','match_id',NEW.id));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;