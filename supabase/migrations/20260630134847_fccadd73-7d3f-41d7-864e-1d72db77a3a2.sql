CREATE OR REPLACE FUNCTION public.apply_invoice_to_bono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_sesiones int;
  v_nombre text;
  v_existing_id uuid;
  v_carryover int := 0;
BEGIN
  SELECT sesiones_incluidas, nombre INTO v_sesiones, v_nombre
  FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;

  -- Archivar el bono activo actual (si existe) y arrastrar las sesiones restantes (positivas o negativas)
  SELECT id, sesiones_disponibles INTO v_existing_id, v_carryover
  FROM public.client_bonos
  WHERE client_id = NEW.client_id AND activo = true
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
    NEW.client_id, NEW.bono_catalogo_id, NEW.fecha,
    COALESCE(v_sesiones, 0) + COALESCE(v_carryover, 0), 0,
    true, v_nombre, NEW.fecha
  );

  RETURN NEW;
END
$function$;