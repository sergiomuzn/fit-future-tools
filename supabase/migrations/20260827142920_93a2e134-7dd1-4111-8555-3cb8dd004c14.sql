CREATE OR REPLACE FUNCTION public.archive_previous_bono()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_servicio text;
  v_tipo text;
  v_carry int;
BEGIN
  IF NOT NEW.activo THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.activo = OLD.activo
     AND NEW.bono_catalogo_id IS NOT DISTINCT FROM OLD.bono_catalogo_id
     AND NEW.servicio_slug IS NOT DISTINCT FROM OLD.servicio_slug
     AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo THEN
    RETURN NEW;
  END IF;

  IF NEW.bono_catalogo_id IS NOT NULL THEN
    SELECT servicio_slug, tipo
      INTO v_servicio, v_tipo
    FROM public.bonos_catalogo
    WHERE id = NEW.bono_catalogo_id;
  ELSE
    v_servicio := NEW.servicio_slug;
    v_tipo := NEW.tipo;
  END IF;

  IF v_servicio IS NULL OR v_tipo = 'prueba' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(SUM(cb.sesiones_disponibles), 0)
      INTO v_carry
    FROM public.client_bonos cb
    LEFT JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
    WHERE cb.client_id = NEW.client_id
      AND cb.id IS DISTINCT FROM NEW.id
      AND cb.activo
      AND COALESCE(bc.servicio_slug, cb.servicio_slug) = v_servicio
      AND COALESCE(bc.tipo, cb.tipo) IS DISTINCT FROM 'prueba';

    NEW.sesiones_disponibles := NEW.sesiones_disponibles + COALESCE(v_carry, 0);
  END IF;

  UPDATE public.client_bonos cb
  SET activo = false
  FROM (
    SELECT existing.id
    FROM public.client_bonos existing
    LEFT JOIN public.bonos_catalogo bc ON bc.id = existing.bono_catalogo_id
    WHERE existing.client_id = NEW.client_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND existing.activo
      AND COALESCE(bc.servicio_slug, existing.servicio_slug) = v_servicio
      AND COALESCE(bc.tipo, existing.tipo) IS DISTINCT FROM 'prueba'
  ) matching
  WHERE cb.id = matching.id;

  RETURN NEW;
END $function$;