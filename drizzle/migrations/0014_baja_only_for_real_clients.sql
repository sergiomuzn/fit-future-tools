CREATE OR REPLACE FUNCTION public.log_client_baja()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.activo = true AND NEW.activo = false
     AND EXISTS (SELECT 1 FROM public.client_events WHERE client_id = NEW.id AND tipo = 'alta') THEN
    INSERT INTO public.client_events(client_id, tipo, fecha, centro_id)
    VALUES (NEW.id, 'baja', CURRENT_DATE, NEW.centro_id);
  END IF;
  RETURN NEW;
END $$;