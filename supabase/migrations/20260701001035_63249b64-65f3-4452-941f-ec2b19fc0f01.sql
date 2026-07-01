
ALTER TYPE public.bono_tipo ADD VALUE IF NOT EXISTS 'prueba';

CREATE OR REPLACE FUNCTION public.apply_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sesiones int;
  v_nombre text;
  v_tipo public.bono_tipo;
  v_existing_id uuid;
  v_carryover int := 0;
BEGIN
  SELECT sesiones_incluidas, nombre, tipo
    INTO v_sesiones, v_nombre, v_tipo
  FROM public.bonos_catalogo WHERE id = p_bono_cat;

  -- Trial bono: does not add sessions and does not touch the client's active bono.
  IF v_tipo = 'prueba' THEN
    RETURN;
  END IF;

  SELECT id, sesiones_disponibles INTO v_existing_id, v_carryover
  FROM public.client_bonos
  WHERE client_id = p_client AND activo = true
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.client_bonos SET activo = false WHERE id = v_existing_id;
  ELSE
    v_carryover := 0;
  END IF;

  INSERT INTO public.client_bonos(
    client_id, bono_catalogo_id, fecha_inicio,
    sesiones_disponibles, sesiones_realizadas,
    activo, ultimo_bono_nombre, ultimo_bono_fecha
  ) VALUES (
    p_client, p_bono_cat, p_fecha,
    COALESCE(v_sesiones, 0) + COALESCE(v_carryover, 0), 0,
    true, v_nombre, p_fecha
  );
END $function$;

CREATE OR REPLACE FUNCTION public.revert_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target uuid;
  v_prev uuid;
  v_tipo public.bono_tipo;
BEGIN
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = p_bono_cat;
  IF v_tipo = 'prueba' THEN
    RETURN;
  END IF;

  SELECT id INTO v_target FROM public.client_bonos
    WHERE client_id = p_client
      AND bono_catalogo_id = p_bono_cat
      AND fecha_inicio = p_fecha
    ORDER BY created_at DESC LIMIT 1;
  IF v_target IS NOT NULL THEN
    DELETE FROM public.client_bonos WHERE id = v_target;
    SELECT id INTO v_prev FROM public.client_bonos
      WHERE client_id = p_client ORDER BY created_at DESC LIMIT 1;
    IF v_prev IS NOT NULL THEN
      UPDATE public.client_bonos SET activo = true WHERE id = v_prev;
    END IF;
  END IF;
END $function$;
