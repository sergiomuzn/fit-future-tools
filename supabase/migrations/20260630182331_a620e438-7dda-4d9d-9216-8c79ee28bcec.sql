
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS no_contabilizar boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.session_apply_realizada()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_bono uuid;
  old_counted boolean := false;
  new_counted boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_counted := OLD.estado = 'realizada'
      OR (OLD.estado = 'cancelada' AND COALESCE(OLD.no_contabilizar, false) = false);
  END IF;
  new_counted := NEW.estado = 'realizada'
    OR (NEW.estado = 'cancelada' AND COALESCE(NEW.no_contabilizar, false) = false);

  IF new_counted AND NOT old_counted AND NEW.client_id IS NOT NULL THEN
    SELECT id INTO v_bono FROM public.client_bonos
      WHERE client_id = NEW.client_id AND activo = true
      ORDER BY created_at DESC LIMIT 1;
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles - 1,
          sesiones_realizadas = sesiones_realizadas + 1
      WHERE id = v_bono;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND old_counted AND NOT new_counted AND OLD.client_id IS NOT NULL THEN
    SELECT id INTO v_bono FROM public.client_bonos
      WHERE client_id = OLD.client_id AND activo = true
      ORDER BY created_at DESC LIMIT 1;
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0)
      WHERE id = v_bono;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_session_apply_realizada ON public.sessions;
CREATE TRIGGER trg_session_apply_realizada
AFTER INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.session_apply_realizada();
