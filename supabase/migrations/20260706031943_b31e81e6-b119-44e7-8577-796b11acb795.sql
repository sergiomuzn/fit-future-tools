-- Remove 'alta' event when the triggering bono is deleted (e.g. invoice deleted)
CREATE OR REPLACE FUNCTION public.remove_client_alta_on_bono_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_has_other boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.client_bonos
    WHERE client_id = OLD.client_id AND id <> OLD.id
  ) INTO v_has_other;

  IF NOT v_has_other THEN
    DELETE FROM public.client_events
    WHERE client_id = OLD.client_id AND tipo = 'alta';
  END IF;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_remove_alta_on_bono_delete ON public.client_bonos;
CREATE TRIGGER trg_remove_alta_on_bono_delete
BEFORE DELETE ON public.client_bonos
FOR EACH ROW EXECUTE FUNCTION public.remove_client_alta_on_bono_delete();

-- Reset this month's altas to 0
DELETE FROM public.client_events
WHERE tipo = 'alta'
  AND fecha >= date_trunc('month', CURRENT_DATE)::date
  AND fecha < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date;
