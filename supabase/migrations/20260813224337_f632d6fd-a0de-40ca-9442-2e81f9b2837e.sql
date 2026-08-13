ALTER TABLE public.client_bonos ADD COLUMN IF NOT EXISTS tipo text;

UPDATE public.client_bonos b
SET tipo = c.tipo
FROM public.bonos_catalogo c
WHERE b.bono_catalogo_id = c.id AND b.tipo IS NULL;

UPDATE public.client_bonos b
SET tipo = CASE WHEN public.is_generic_pass_client((SELECT nombre FROM public.clients WHERE id = b.client_id)) THEN 'gympass' ELSE 'individual' END
WHERE b.tipo IS NULL;

ALTER TABLE public.client_bonos ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE public.client_bonos ALTER COLUMN tipo SET DEFAULT 'individual';

CREATE OR REPLACE FUNCTION public.set_client_bono_servicio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_slug text; v_tipo text;
BEGIN
  IF NEW.bono_catalogo_id IS NOT NULL THEN
    SELECT servicio_slug, tipo INTO v_slug, v_tipo FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  END IF;
  IF v_slug IS NULL THEN
    v_slug := COALESCE(
      NULLIF(btrim(COALESCE(NEW.servicio_slug, '')), ''),
      (SELECT slug FROM public.servicios WHERE slug NOT ILIKE '%grupo%' ORDER BY orden LIMIT 1),
      'personal'
    );
  END IF;
  IF v_tipo IS NULL THEN
    v_tipo := NULLIF(btrim(COALESCE(NEW.tipo, '')), '');
  END IF;
  IF v_tipo IS NULL THEN
    v_tipo := CASE
      WHEN public.is_generic_pass_client((SELECT nombre FROM public.clients WHERE id = NEW.client_id)) THEN 'gympass'
      WHEN v_slug ILIKE '%grup%' THEN 'grupal'
      ELSE 'individual'
    END;
  END IF;
  NEW.servicio_slug := v_slug;
  NEW.tipo := v_tipo;
  RETURN NEW;
END $$;