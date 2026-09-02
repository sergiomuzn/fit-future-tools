ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS caducidad_tipo text,
  ADD COLUMN IF NOT EXISTS caducidad_dias integer;

CREATE OR REPLACE FUNCTION public.set_client_bono_caducidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_dias int;
BEGIN
  IF NEW.bono_catalogo_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.bono_catalogo_id IS NOT DISTINCT FROM OLD.bono_catalogo_id
     AND NEW.fecha_inicio IS NOT DISTINCT FROM OLD.fecha_inicio THEN
    RETURN NEW;
  END IF;

  SELECT caducidad_tipo, caducidad_dias INTO v_tipo, v_dias
  FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;

  IF v_tipo = 'dias' AND COALESCE(v_dias, 0) > 0 THEN
    NEW.fecha_caducidad := (NEW.fecha_inicio + (v_dias || ' days')::interval)::date;
  ELSIF v_tipo = 'meses' AND COALESCE(v_dias, 0) > 0 THEN
    NEW.fecha_caducidad := (NEW.fecha_inicio + (v_dias || ' months')::interval)::date;
  ELSIF v_tipo = 'fin_mes' THEN
    NEW.fecha_caducidad := (date_trunc('month', NEW.fecha_inicio::timestamp) + interval '1 month - 1 day')::date;
  ELSIF v_tipo = 'fin_ano' THEN
    NEW.fecha_caducidad := (date_trunc('year', NEW.fecha_inicio::timestamp) + interval '1 year - 1 day')::date;
  ELSE
    NEW.fecha_caducidad := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.caducidad_avisada := false;
  END IF;

  RETURN NEW;
END $$;