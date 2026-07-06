
CREATE OR REPLACE FUNCTION public.log_client_alta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo public.bono_tipo;
  v_name text;
  v_has_prev_bono boolean;
BEGIN
  IF NEW.bono_catalogo_id IS NULL THEN RETURN NEW; END IF;
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  IF v_tipo IS NULL OR v_tipo = 'prueba' THEN RETURN NEW; END IF;
  IF v_tipo NOT IN ('individual','pareja','grupal') THEN RETURN NEW; END IF;

  SELECT nombre INTO v_name FROM public.clients WHERE id = NEW.client_id;
  IF public.is_generic_pass_client(COALESCE(v_name,'')) THEN RETURN NEW; END IF;

  -- Only log an alta if this is the client's FIRST bono in the registry.
  SELECT EXISTS(
    SELECT 1 FROM public.client_bonos
    WHERE client_id = NEW.client_id AND id <> NEW.id
  ) INTO v_has_prev_bono;
  IF v_has_prev_bono THEN RETURN NEW; END IF;

  INSERT INTO public.client_events(client_id, tipo, fecha)
  VALUES (NEW.client_id, 'alta', NEW.fecha_inicio);
  RETURN NEW;
END $function$;

-- Clean up altas that were logged for clients who already had bonos before that event.
DELETE FROM public.client_events ce
WHERE ce.tipo = 'alta'
  AND EXISTS (
    SELECT 1 FROM public.client_bonos cb
    WHERE cb.client_id = ce.client_id
      AND cb.fecha_inicio < ce.fecha
  );
