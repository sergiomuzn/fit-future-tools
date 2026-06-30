
-- Restore sesiones on session DELETE
CREATE OR REPLACE FUNCTION public.session_restore_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_bono uuid;
  was_counted boolean := false;
BEGIN
  was_counted := OLD.estado = 'realizada'
    OR (OLD.estado = 'cancelada' AND COALESCE(OLD.no_contabilizar, false) = false);
  IF was_counted AND OLD.client_id IS NOT NULL THEN
    SELECT id INTO v_bono FROM public.client_bonos
      WHERE client_id = OLD.client_id
      ORDER BY activo DESC, created_at DESC LIMIT 1;
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0)
      WHERE id = v_bono;
    END IF;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_session_restore_on_delete ON public.sessions;
CREATE TRIGGER trg_session_restore_on_delete
BEFORE DELETE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.session_restore_on_delete();

-- Revert bono on invoice DELETE
CREATE OR REPLACE FUNCTION public.revert_invoice_bono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_target uuid;
  v_prev uuid;
BEGIN
  SELECT id INTO v_target FROM public.client_bonos
    WHERE client_id = OLD.client_id
      AND bono_catalogo_id = OLD.bono_catalogo_id
      AND fecha_inicio = OLD.fecha
    ORDER BY created_at DESC LIMIT 1;

  IF v_target IS NOT NULL THEN
    DELETE FROM public.client_bonos WHERE id = v_target;
    SELECT id INTO v_prev FROM public.client_bonos
      WHERE client_id = OLD.client_id
      ORDER BY created_at DESC LIMIT 1;
    IF v_prev IS NOT NULL THEN
      UPDATE public.client_bonos SET activo = true WHERE id = v_prev;
    END IF;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_revert_invoice_bono ON public.invoices;
CREATE TRIGGER trg_revert_invoice_bono
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.revert_invoice_bono();
