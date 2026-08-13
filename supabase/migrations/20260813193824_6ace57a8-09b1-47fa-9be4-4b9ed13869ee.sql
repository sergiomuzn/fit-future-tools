CREATE OR REPLACE FUNCTION public.archive_previous_bono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_servicio text;
  v_tipo text;
  v_carry int;
BEGIN
  IF NEW.bono_catalogo_id IS NULL OR NOT NEW.activo THEN
    RETURN NEW;
  END IF;

  SELECT servicio_slug, tipo INTO v_servicio, v_tipo
  FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;

  IF v_tipo IS NULL OR v_tipo = 'prueba' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(cb.sesiones_disponibles), 0) INTO v_carry
  FROM public.client_bonos cb
  JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
  WHERE cb.client_id = NEW.client_id
    AND cb.id IS DISTINCT FROM NEW.id
    AND cb.activo
    AND bc.servicio_slug = v_servicio
    AND bc.tipo = v_tipo;

  UPDATE public.client_bonos cb
  SET activo = false
  FROM public.bonos_catalogo bc
  WHERE bc.id = cb.bono_catalogo_id
    AND cb.client_id = NEW.client_id
    AND cb.id IS DISTINCT FROM NEW.id
    AND cb.activo
    AND bc.servicio_slug = v_servicio
    AND bc.tipo = v_tipo;

  NEW.sesiones_disponibles := NEW.sesiones_disponibles + COALESCE(v_carry, 0);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_archive_previous_bono ON public.client_bonos;
CREATE TRIGGER trg_archive_previous_bono
BEFORE INSERT ON public.client_bonos
FOR EACH ROW EXECUTE FUNCTION public.archive_previous_bono();

-- Limpieza de duplicados activos ya existentes
WITH ranked AS (
  SELECT cb.id, cb.client_id, bc.servicio_slug, bc.tipo,
         cb.sesiones_disponibles,
         ROW_NUMBER() OVER (
           PARTITION BY cb.client_id, bc.servicio_slug, bc.tipo
           ORDER BY cb.fecha_inicio DESC, cb.created_at DESC
         ) AS rn
  FROM public.client_bonos cb
  JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
  WHERE cb.activo AND bc.tipo <> 'prueba'
),
sums AS (
  SELECT client_id, servicio_slug, tipo,
         SUM(sesiones_disponibles) AS total,
         COUNT(*) AS n
  FROM ranked GROUP BY client_id, servicio_slug, tipo
),
keep AS (
  SELECT r.id, s.total
  FROM ranked r JOIN sums s
    ON s.client_id = r.client_id AND s.servicio_slug = r.servicio_slug AND s.tipo = r.tipo
  WHERE r.rn = 1 AND s.n > 1
),
drop_rows AS (
  SELECT r.id FROM ranked r JOIN sums s
    ON s.client_id = r.client_id AND s.servicio_slug = r.servicio_slug AND s.tipo = r.tipo
  WHERE r.rn > 1 AND s.n > 1
),
upd_keep AS (
  UPDATE public.client_bonos cb SET sesiones_disponibles = k.total
  FROM keep k WHERE cb.id = k.id
  RETURNING 1
)
UPDATE public.client_bonos cb SET activo = false
FROM drop_rows d WHERE cb.id = d.id;