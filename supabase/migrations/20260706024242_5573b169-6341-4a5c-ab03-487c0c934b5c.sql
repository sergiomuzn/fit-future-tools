
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sesiones_override integer;

CREATE OR REPLACE FUNCTION public.apply_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date, p_sesiones_override int DEFAULT NULL)
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

  IF v_tipo = 'prueba' THEN
    RETURN;
  END IF;

  v_sesiones := COALESCE(p_sesiones_override, v_sesiones);

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

CREATE OR REPLACE FUNCTION public.apply_invoice_to_bono()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.apply_invoice_row(NEW.client_id, NEW.bono_catalogo_id, NEW.fecha, NEW.sesiones_override);
  PERFORM public.sync_client_fecha_inicio(NEW.client_id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.reapply_invoice_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.bono_catalogo_id IS DISTINCT FROM OLD.bono_catalogo_id
     OR NEW.fecha IS DISTINCT FROM OLD.fecha
     OR NEW.sesiones_override IS DISTINCT FROM OLD.sesiones_override THEN
    PERFORM public.revert_invoice_row(OLD.client_id, OLD.bono_catalogo_id, OLD.fecha);
    PERFORM public.apply_invoice_row(NEW.client_id, NEW.bono_catalogo_id, NEW.fecha, NEW.sesiones_override);
    PERFORM public.sync_client_fecha_inicio(OLD.client_id);
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      PERFORM public.sync_client_fecha_inicio(NEW.client_id);
    END IF;
  END IF;
  RETURN NEW;
END $function$;
