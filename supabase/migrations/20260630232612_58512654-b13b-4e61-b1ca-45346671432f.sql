
-- Sincroniza clients.fecha_inicio con la primera factura del cliente
CREATE OR REPLACE FUNCTION public.sync_client_fecha_inicio(p_client uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_min date;
BEGIN
  SELECT MIN(fecha) INTO v_min FROM public.invoices WHERE client_id = p_client;
  IF v_min IS NOT NULL THEN
    UPDATE public.clients SET fecha_inicio = v_min WHERE id = p_client;
  END IF;
END $$;

-- Aplica una factura como bono (extraído de apply_invoice_to_bono para reuso)
CREATE OR REPLACE FUNCTION public.apply_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_sesiones int;
  v_nombre text;
  v_existing_id uuid;
  v_carryover int := 0;
BEGIN
  SELECT sesiones_incluidas, nombre INTO v_sesiones, v_nombre
  FROM public.bonos_catalogo WHERE id = p_bono_cat;

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
END $$;

-- Revierte el bono creado por una factura (extraído de revert_invoice_bono para reuso)
CREATE OR REPLACE FUNCTION public.revert_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_target uuid; v_prev uuid;
BEGIN
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
END $$;

-- Sustituye las funciones trigger para reutilizar los helpers
CREATE OR REPLACE FUNCTION public.apply_invoice_to_bono()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.apply_invoice_row(NEW.client_id, NEW.bono_catalogo_id, NEW.fecha);
  PERFORM public.sync_client_fecha_inicio(NEW.client_id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.revert_invoice_bono()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.revert_invoice_row(OLD.client_id, OLD.bono_catalogo_id, OLD.fecha);
  PERFORM public.sync_client_fecha_inicio(OLD.client_id);
  RETURN OLD;
END $$;

-- Nuevo: al editar una factura, revertir el bono antiguo y aplicar el nuevo
CREATE OR REPLACE FUNCTION public.reapply_invoice_on_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.bono_catalogo_id IS DISTINCT FROM OLD.bono_catalogo_id
     OR NEW.fecha IS DISTINCT FROM OLD.fecha THEN
    PERFORM public.revert_invoice_row(OLD.client_id, OLD.bono_catalogo_id, OLD.fecha);
    PERFORM public.apply_invoice_row(NEW.client_id, NEW.bono_catalogo_id, NEW.fecha);
    PERFORM public.sync_client_fecha_inicio(OLD.client_id);
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      PERFORM public.sync_client_fecha_inicio(NEW.client_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Asegura que los triggers están enganchados (idempotente)
DROP TRIGGER IF EXISTS trg_invoice_apply ON public.invoices;
CREATE TRIGGER trg_invoice_apply
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_to_bono();

DROP TRIGGER IF EXISTS trg_invoice_revert ON public.invoices;
CREATE TRIGGER trg_invoice_revert
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.revert_invoice_bono();

DROP TRIGGER IF EXISTS trg_invoice_reapply ON public.invoices;
CREATE TRIGGER trg_invoice_reapply
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.reapply_invoice_on_update();

-- Asegura también los triggers de sesiones (idempotente)
DROP TRIGGER IF EXISTS trg_session_apply ON public.sessions;
CREATE TRIGGER trg_session_apply
  AFTER INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.session_apply_realizada();

DROP TRIGGER IF EXISTS trg_session_restore ON public.sessions;
CREATE TRIGGER trg_session_restore
  BEFORE DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.session_restore_on_delete();
