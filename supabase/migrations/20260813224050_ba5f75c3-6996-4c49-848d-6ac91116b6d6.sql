ALTER TABLE public.client_bonos ADD COLUMN IF NOT EXISTS servicio_slug text;

-- Backfill desde el catálogo
UPDATE public.client_bonos cb
SET servicio_slug = bc.servicio_slug
FROM public.bonos_catalogo bc
WHERE bc.id = cb.bono_catalogo_id AND cb.servicio_slug IS DISTINCT FROM bc.servicio_slug;

-- Bonos sin catálogo: servicio por defecto del centro
UPDATE public.client_bonos
SET servicio_slug = COALESCE(
  (SELECT slug FROM public.servicios WHERE slug NOT ILIKE '%grupo%' ORDER BY orden LIMIT 1),
  'personal'
)
WHERE servicio_slug IS NULL;

ALTER TABLE public.client_bonos ALTER COLUMN servicio_slug SET NOT NULL;

-- Mantener el servicio siempre sincronizado
CREATE OR REPLACE FUNCTION public.set_client_bono_servicio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_slug text;
BEGIN
  IF NEW.bono_catalogo_id IS NOT NULL THEN
    SELECT servicio_slug INTO v_slug FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  END IF;
  IF v_slug IS NULL THEN
    v_slug := COALESCE(
      NULLIF(btrim(COALESCE(NEW.servicio_slug, '')), ''),
      (SELECT slug FROM public.servicios WHERE slug NOT ILIKE '%grupo%' ORDER BY orden LIMIT 1),
      'personal'
    );
  END IF;
  NEW.servicio_slug := v_slug;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_set_client_bono_servicio ON public.client_bonos;
CREATE TRIGGER trg_set_client_bono_servicio
BEFORE INSERT OR UPDATE ON public.client_bonos
FOR EACH ROW EXECUTE FUNCTION public.set_client_bono_servicio();

-- Los bonos automáticos creados al realizar una sesión guardan el servicio de la sesión
CREATE OR REPLACE FUNCTION public.session_apply_realizada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_bono uuid;
  v_servicio text;
  v_tipo text;
  v_rest int;
  old_counted boolean := false;
  new_counted boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_counted := OLD.estado = 'realizada'
      OR (OLD.estado = 'cancelada' AND COALESCE(OLD.no_contabilizar, false) = false);
  END IF;
  new_counted := NEW.estado = 'realizada'
    OR (NEW.estado = 'cancelada' AND COALESCE(NEW.no_contabilizar, false) = false);

  v_servicio := public.session_servicio_slug(NEW.group_id, NEW.ocupacion, NEW.servicio_slug);

  IF new_counted AND NOT old_counted AND NEW.client_id IS NOT NULL THEN
    v_bono := public.pick_bono_for_session(NEW.client_id, v_servicio, false);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles - 1,
          sesiones_realizadas = sesiones_realizadas + 1
      WHERE id = v_bono
      RETURNING sesiones_disponibles INTO v_rest;

      SELECT bc.tipo INTO v_tipo
      FROM public.client_bonos cb
      LEFT JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
      WHERE cb.id = v_bono;

      IF v_rest <= 0 AND v_tipo IS NOT NULL AND v_tipo NOT IN ('gympass', 'grupal') THEN
        UPDATE public.client_bonos SET activo = false WHERE id = v_bono;
      END IF;
    ELSE
      INSERT INTO public.client_bonos(
        client_id, bono_catalogo_id, fecha_inicio,
        sesiones_disponibles, sesiones_realizadas,
        activo, ultimo_bono_nombre, ultimo_bono_fecha, servicio_slug
      ) VALUES (
        NEW.client_id, NULL, NEW.fecha,
        0, 1,
        true, NULL, NEW.fecha, v_servicio
      );
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND old_counted AND NOT new_counted AND OLD.client_id IS NOT NULL THEN
    v_bono := public.pick_bono_for_session(OLD.client_id, v_servicio, true);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0),
          activo = CASE WHEN sesiones_disponibles + 1 > 0 THEN true ELSE activo END
      WHERE id = v_bono;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- La elección de bono por servicio ahora usa el servicio guardado en el bono
CREATE OR REPLACE FUNCTION public.pick_bono_for_session(p_client uuid, p_servicio text, p_for_restore boolean DEFAULT false)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT cb.id
  FROM public.client_bonos cb
  LEFT JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
  WHERE cb.client_id = p_client
    AND (p_for_restore OR cb.activo)
    AND (p_servicio IS NULL OR COALESCE(bc.servicio_slug, cb.servicio_slug) = p_servicio)
  ORDER BY
    (bc.id IS NULL),
    CASE WHEN p_for_restore THEN 0 ELSE (CASE WHEN cb.sesiones_disponibles > 0 THEN 0 ELSE 1 END) END,
    CASE WHEN p_for_restore THEN (CASE WHEN cb.activo THEN 0 ELSE 1 END) ELSE 0 END,
    CASE WHEN p_for_restore THEN 0 ELSE cb.sesiones_disponibles END,
    CASE WHEN p_for_restore THEN cb.created_at END DESC,
    cb.created_at ASC
  LIMIT 1
$function$;