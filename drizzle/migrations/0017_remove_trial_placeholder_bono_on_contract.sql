CREATE OR REPLACE FUNCTION public.remove_trial_placeholder_bonos()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_tipo text;
BEGIN
  IF NEW.bono_catalogo_id IS NULL OR NOT NEW.activo THEN RETURN NEW; END IF;
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  IF v_tipo IS NULL OR v_tipo = 'prueba' THEN RETURN NEW; END IF;
  -- Only when the client has a trial (trial invoice or trial session)
  IF NOT EXISTS (
       SELECT 1 FROM public.invoices i JOIN public.bonos_catalogo bc ON bc.id = i.bono_catalogo_id
       WHERE i.client_id = NEW.client_id AND bc.tipo = 'prueba')
     AND NOT EXISTS (SELECT 1 FROM public.sessions s WHERE s.client_id = NEW.client_id AND s.estado = 'prueba') THEN
    RETURN NEW;
  END IF;
  -- Only if this is the client's first real contracted bono
  IF EXISTS (
       SELECT 1 FROM public.client_bonos cb JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
       WHERE cb.client_id = NEW.client_id AND cb.id <> NEW.id AND bc.tipo <> 'prueba') THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.client_bonos
  WHERE client_id = NEW.client_id AND id <> NEW.id
    AND bono_catalogo_id IS NULL AND sesiones_disponibles <= 0;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_remove_trial_placeholder_bonos ON public.client_bonos;
CREATE TRIGGER trg_remove_trial_placeholder_bonos
AFTER INSERT ON public.client_bonos
FOR EACH ROW EXECUTE FUNCTION public.remove_trial_placeholder_bonos();

DELETE FROM public.client_bonos WHERE id = '79ea005c-aa92-41e1-a1cc-bb59064deb22' AND bono_catalogo_id IS NULL;