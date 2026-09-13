CREATE OR REPLACE FUNCTION public.prevent_pending_session_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.por_confirmar, false) = true
     AND NEW.estado = 'cancelada' THEN
    DELETE FROM public.sessions WHERE id = OLD.id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_prevent_pending_session_cancellation'
      AND tgrelid = 'public.sessions'::regclass
  ) THEN
    CREATE TRIGGER trg_prevent_pending_session_cancellation
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_pending_session_cancellation();
  END IF;
END;
$$;