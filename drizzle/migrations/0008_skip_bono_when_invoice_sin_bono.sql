CREATE OR REPLACE FUNCTION public.apply_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date, p_sesiones_override integer DEFAULT NULL::integer)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_sesiones int; v_nombre text; v_tipo text; v_centro uuid;
BEGIN
  IF p_bono_cat IS NULL THEN RETURN; END IF;
  SELECT sesiones_incluidas, nombre, tipo, centro_id INTO v_sesiones, v_nombre, v_tipo, v_centro
  FROM public.bonos_catalogo WHERE id = p_bono_cat;
  IF v_tipo = 'prueba' THEN RETURN; END IF;
  IF v_centro IS NULL THEN
    SELECT centro_id INTO v_centro FROM public.clients WHERE id = p_client;
  END IF;
  v_sesiones := COALESCE(p_sesiones_override, v_sesiones);
  INSERT INTO public.client_bonos(
    client_id, bono_catalogo_id, fecha_inicio, sesiones_disponibles, sesiones_realizadas,
    activo, ultimo_bono_nombre, ultimo_bono_fecha, centro_id
  ) VALUES (p_client, p_bono_cat, p_fecha, COALESCE(v_sesiones, 0), 0, true, v_nombre, p_fecha, v_centro);
END $function$;