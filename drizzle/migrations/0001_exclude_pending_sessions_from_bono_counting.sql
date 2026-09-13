CREATE OR REPLACE FUNCTION public.session_apply_realizada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_bono uuid;
  v_servicio text;
  v_rest int;
  old_counted boolean := false;
  new_counted boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_counted := COALESCE(OLD.por_confirmar, false) = false
      AND (
        OLD.estado = 'realizada'
        OR (OLD.estado = 'cancelada' AND COALESCE(OLD.no_contabilizar, false) = false)
      );
  END IF;

  new_counted := COALESCE(NEW.por_confirmar, false) = false
    AND (
      NEW.estado = 'realizada'
      OR (NEW.estado = 'cancelada' AND COALESCE(NEW.no_contabilizar, false) = false)
    );

  v_servicio := public.session_servicio_slug(NEW.group_id, NEW.ocupacion, NEW.servicio_slug, NEW.centro_id);

  IF new_counted AND NOT old_counted AND NEW.client_id IS NOT NULL THEN
    v_bono := public.pick_bono_for_session(NEW.client_id, v_servicio, false);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles - 1,
          sesiones_realizadas = sesiones_realizadas + 1
      WHERE id = v_bono
      RETURNING sesiones_disponibles INTO v_rest;
    ELSE
      INSERT INTO public.client_bonos(
        client_id, bono_catalogo_id, fecha_inicio, sesiones_disponibles, sesiones_realizadas,
        activo, ultimo_bono_nombre, ultimo_bono_fecha, servicio_slug, centro_id
      ) VALUES (NEW.client_id, NULL, NEW.fecha, 0, 1, true, NULL, NEW.fecha, v_servicio, NEW.centro_id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND old_counted AND NOT new_counted AND OLD.client_id IS NOT NULL THEN
    v_bono := public.pick_bono_for_session(OLD.client_id, v_servicio, true);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0)
      WHERE id = v_bono;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.session_restore_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_bono uuid;
  v_servicio text;
  was_counted boolean := false;
BEGIN
  was_counted := COALESCE(OLD.por_confirmar, false) = false
    AND (
      OLD.estado = 'realizada'
      OR (OLD.estado = 'cancelada' AND COALESCE(OLD.no_contabilizar, false) = false)
    );

  IF was_counted AND OLD.client_id IS NOT NULL THEN
    v_servicio := public.session_servicio_slug(OLD.group_id, OLD.ocupacion, OLD.servicio_slug, OLD.centro_id);
    v_bono := public.pick_bono_for_session(OLD.client_id, v_servicio, true);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0),
          activo = CASE WHEN sesiones_disponibles + 1 > 0 THEN true ELSE activo END
      WHERE id = v_bono;
    END IF;
  END IF;

  RETURN OLD;
END
$$;