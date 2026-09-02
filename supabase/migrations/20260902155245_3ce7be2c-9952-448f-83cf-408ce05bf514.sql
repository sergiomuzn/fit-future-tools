ALTER TABLE public.bonos_catalogo
  ADD COLUMN IF NOT EXISTS caducidad_tipo text,
  ADD COLUMN IF NOT EXISTS caducidad_dias integer;

ALTER TABLE public.bonos_catalogo
  ADD CONSTRAINT bonos_catalogo_caducidad_tipo_chk
  CHECK (caducidad_tipo IS NULL OR caducidad_tipo IN ('dias','fin_mes'));

ALTER TABLE public.client_bonos
  ADD COLUMN IF NOT EXISTS fecha_caducidad date,
  ADD COLUMN IF NOT EXISTS caducidad_avisada boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_client_bono_caducidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
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
    NEW.fecha_caducidad := NEW.fecha_inicio + (v_dias || ' days')::interval;
  ELSIF v_tipo = 'fin_mes' THEN
    NEW.fecha_caducidad := (date_trunc('month', NEW.fecha_inicio::timestamp) + interval '1 month - 1 day')::date;
  ELSE
    NEW.fecha_caducidad := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.caducidad_avisada := false;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_client_bono_caducidad ON public.client_bonos;
CREATE TRIGGER trg_set_client_bono_caducidad
  BEFORE INSERT OR UPDATE ON public.client_bonos
  FOR EACH ROW EXECUTE FUNCTION public.set_client_bono_caducidad();

CREATE OR REPLACE FUNCTION public.notify_bonos_caducados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
  r record;
  v_user uuid;
BEGIN
  FOR r IN
    SELECT cb.id, cb.client_id, cb.fecha_caducidad,
           COALESCE(bc.nombre, cb.ultimo_bono_nombre) AS nombre
    FROM public.client_bonos cb
    LEFT JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
    WHERE cb.activo
      AND cb.fecha_caducidad IS NOT NULL
      AND cb.fecha_caducidad < CURRENT_DATE
      AND cb.caducidad_avisada = false
  LOOP
    UPDATE public.client_bonos SET caducidad_avisada = true WHERE id = r.id;
    v_count := v_count + 1;

    SELECT id INTO v_user FROM public.client_profiles
    WHERE client_id = r.client_id AND activo = true
    ORDER BY created_at DESC LIMIT 1;

    IF v_user IS NOT NULL THEN
      INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje)
      VALUES (
        v_user, 'bono_caducado', 'Tu bono ha caducado',
        COALESCE(r.nombre, 'Tu bono') || ' caducó el ' || to_char(r.fecha_caducidad, 'DD/MM/YYYY') ||
        '. Renueva para seguir reservando sesiones.'
      );
    END IF;
  END LOOP;

  RETURN v_count;
END $$;