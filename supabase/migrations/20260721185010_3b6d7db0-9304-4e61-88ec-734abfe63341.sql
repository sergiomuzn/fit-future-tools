
ALTER TABLE public.invoices ALTER COLUMN client_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_invoice_to_bono()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
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
    IF OLD.client_id IS NOT NULL THEN
      PERFORM public.revert_invoice_row(OLD.client_id, OLD.bono_catalogo_id, OLD.fecha);
      PERFORM public.sync_client_fecha_inicio(OLD.client_id);
    END IF;
    IF NEW.client_id IS NOT NULL THEN
      PERFORM public.apply_invoice_row(NEW.client_id, NEW.bono_catalogo_id, NEW.fecha, NEW.sesiones_override);
      IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
        PERFORM public.sync_client_fecha_inicio(NEW.client_id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
