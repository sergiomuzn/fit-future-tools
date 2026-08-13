-- 1. Limpieza previa: dejar solo el bono activo más reciente por (cliente, bono de catálogo)
WITH dups AS (
  SELECT id, row_number() OVER (
      PARTITION BY client_id, bono_catalogo_id
      ORDER BY created_at DESC
    ) AS rn
  FROM public.client_bonos
  WHERE activo AND bono_catalogo_id IS NOT NULL
)
UPDATE public.client_bonos cb
SET activo = false
FROM dups
WHERE dups.id = cb.id AND dups.rn > 1;

-- 2. Trigger de archivado: ahora también en UPDATE y con soporte de bonos manuales
CREATE OR REPLACE FUNCTION public.archive_previous_bono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_servicio text;
  v_tipo text;
  v_carry int;
BEGIN
  IF NOT NEW.activo THEN
    RETURN NEW;
  END IF;

  -- En UPDATE solo actuamos si el bono se (re)activa o cambia de tipo de bono
  IF TG_OP = 'UPDATE' AND NEW.activo = OLD.activo
     AND NEW.bono_catalogo_id IS NOT DISTINCT FROM OLD.bono_catalogo_id THEN
    RETURN NEW;
  END IF;

  IF NEW.bono_catalogo_id IS NULL THEN
    -- Bono manual: se considera idéntico si coincide el nombre
    UPDATE public.client_bonos cb
    SET activo = false
    WHERE cb.client_id = NEW.client_id
      AND cb.id IS DISTINCT FROM NEW.id
      AND cb.activo
      AND cb.bono_catalogo_id IS NULL
      AND cb.ultimo_bono_nombre IS NOT DISTINCT FROM NEW.ultimo_bono_nombre;
    RETURN NEW;
  END IF;

  SELECT servicio_slug, tipo INTO v_servicio, v_tipo
  FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;

  IF v_tipo IS NULL OR v_tipo = 'prueba' THEN
    RETURN NEW;
  END IF;

  -- Sesiones que se arrastran del bono anterior (solo al crear un bono nuevo)
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(SUM(cb.sesiones_disponibles), 0) INTO v_carry
    FROM public.client_bonos cb
    JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
    WHERE cb.client_id = NEW.client_id
      AND cb.id IS DISTINCT FROM NEW.id
      AND cb.activo
      AND bc.servicio_slug = v_servicio
      AND bc.tipo = v_tipo;
    NEW.sesiones_disponibles := NEW.sesiones_disponibles + COALESCE(v_carry, 0);
  END IF;

  UPDATE public.client_bonos cb
  SET activo = false
  FROM public.bonos_catalogo bc
  WHERE bc.id = cb.bono_catalogo_id
    AND cb.client_id = NEW.client_id
    AND cb.id IS DISTINCT FROM NEW.id
    AND cb.activo
    AND bc.servicio_slug = v_servicio
    AND bc.tipo = v_tipo;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_archive_previous_bono ON public.client_bonos;
CREATE TRIGGER trg_archive_previous_bono
BEFORE INSERT OR UPDATE ON public.client_bonos
FOR EACH ROW EXECUTE FUNCTION public.archive_previous_bono();

-- 3. Garantía a nivel de base de datos: nunca dos bonos activos idénticos
CREATE UNIQUE INDEX IF NOT EXISTS client_bonos_unico_activo
ON public.client_bonos (client_id, bono_catalogo_id)
WHERE activo AND bono_catalogo_id IS NOT NULL;