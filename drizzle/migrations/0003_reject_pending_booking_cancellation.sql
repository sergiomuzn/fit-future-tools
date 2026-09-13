CREATE OR REPLACE FUNCTION public.prevent_pending_session_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.por_confirmar, false) = true
     AND NEW.estado = 'cancelada' THEN
    RAISE EXCEPTION 'Una reserva pendiente debe eliminarse, no marcarse como cancelada';
  END IF;

  RETURN NEW;
END;
$$;