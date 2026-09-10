CREATE OR REPLACE FUNCTION public.revert_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_target public.client_bonos%ROWTYPE;
  v_tipo text;
  v_added int;
  v_prev uuid;
  v_leftover int;
  v_servicio text;
BEGIN
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = p_bono_cat;
  IF v_tipo = 'prueba' THEN RETURN; END IF;

  SELECT * INTO v_target FROM public.client_bonos
    WHERE client_id = p_client
      AND bono_catalogo_id IS NOT DISTINCT FROM p_bono_cat
      AND fecha_inicio = p_fecha
    ORDER BY created_at DESC LIMIT 1;

  IF v_target.id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(sesiones_incluidas, 0) INTO v_added
    FROM public.bonos_catalogo WHERE id = p_bono_cat;
  v_added := COALESCE(v_added, 0);

  v_leftover := GREATEST(v_target.sesiones_disponibles - v_added, 0);
  v_servicio := v_target.servicio_slug;

  IF COALESCE(v_target.sesiones_realizadas, 0) > 0 THEN
    -- El cliente ya ha usado este bono: solo restamos las sesiones que aportó la factura.
    UPDATE public.client_bonos
    SET sesiones_disponibles = sesiones_disponibles - v_added
    WHERE id = v_target.id;
    RETURN;
  END IF;

  -- Sin sesiones realizadas: eliminamos el bono y devolvemos el sobrante al bono anterior.
  DELETE FROM public.client_bonos WHERE id = v_target.id;

  SELECT id INTO v_prev
  FROM public.client_bonos
  WHERE client_id = p_client
    AND activo = false
    AND servicio_slug IS NOT DISTINCT FROM v_servicio
    AND COALESCE(tipo, '') <> 'prueba'
    AND created_at <= v_target.created_at
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_prev IS NOT NULL THEN
    UPDATE public.client_bonos
    SET activo = true,
        sesiones_disponibles = v_leftover
    WHERE id = v_prev;
  END IF;
END $function$;