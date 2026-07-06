CREATE OR REPLACE FUNCTION public.remove_client_baja_on_reactivation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.activo = false AND NEW.activo = true THEN
    DELETE FROM public.client_events
    WHERE client_id = NEW.id AND tipo = 'baja';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_client_baja()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.activo = true AND NEW.activo = false THEN
    INSERT INTO public.client_events(client_id, tipo, fecha)
    VALUES (NEW.id, 'baja', CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_client_baja ON public.clients;
CREATE TRIGGER trg_log_client_baja
  AFTER UPDATE ON public.clients
  FOR EACH ROW
  WHEN (OLD.activo = true AND NEW.activo = false)
  EXECUTE FUNCTION public.log_client_baja();

DROP TRIGGER IF EXISTS trg_remove_client_baja ON public.clients;
CREATE TRIGGER trg_remove_client_baja
  AFTER UPDATE ON public.clients
  FOR EACH ROW
  WHEN (OLD.activo = false AND NEW.activo = true)
  EXECUTE FUNCTION public.remove_client_baja_on_reactivation();