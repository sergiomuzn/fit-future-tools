-- 1. Catálogo de modalidades por servicio
CREATE TABLE public.modalidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_slug text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (servicio_slug, nombre)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modalidades TO authenticated;
GRANT ALL ON public.modalidades TO service_role;

ALTER TABLE public.modalidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modalidades select auth" ON public.modalidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "modalidades insert admin" ON public.modalidades FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "modalidades update admin" ON public.modalidades FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "modalidades delete admin" ON public.modalidades FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER modalidades_touch BEFORE UPDATE ON public.modalidades
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Columnas de modalidad
ALTER TABLE public.bonos_catalogo ADD COLUMN modalidad text;
ALTER TABLE public.client_bonos ADD COLUMN modalidad text;
ALTER TABLE public.sessions ADD COLUMN modalidad text;

-- 3. Migración del servicio "Entrenamiento Personal Pareja"
INSERT INTO public.modalidades (servicio_slug, nombre, orden)
VALUES ('personal', 'Individual', 1), ('personal', 'Pareja', 2)
ON CONFLICT DO NOTHING;

UPDATE public.bonos_catalogo
SET servicio_slug = 'personal', modalidad = 'Pareja'
WHERE servicio_slug = 'entrenamiento_personal_pareja';

UPDATE public.client_bonos
SET servicio_slug = 'personal', modalidad = 'Pareja'
WHERE servicio_slug = 'entrenamiento_personal_pareja';

UPDATE public.sessions
SET servicio_slug = 'personal', modalidad = 'Pareja'
WHERE servicio_slug = 'entrenamiento_personal_pareja';

UPDATE public.service_slots SET servicio_slug = 'personal' WHERE servicio_slug = 'entrenamiento_personal_pareja';
UPDATE public.service_slot_instances SET servicio_slug = 'personal' WHERE servicio_slug = 'entrenamiento_personal_pareja';

DELETE FROM public.servicios WHERE slug = 'entrenamiento_personal_pareja';

-- 4. Copiar modalidad del catálogo al bono del cliente
CREATE OR REPLACE FUNCTION public.set_client_bono_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_slug text; v_tipo text; v_modalidad text;
BEGIN
  IF NEW.bono_catalogo_id IS NOT NULL THEN
    SELECT servicio_slug, tipo, modalidad INTO v_slug, v_tipo, v_modalidad
    FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
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
  NEW.modalidad := COALESCE(NULLIF(btrim(COALESCE(NEW.modalidad, '')), ''), v_modalidad);
  RETURN NEW;
END $function$;

-- 5. Modalidad automática en las sesiones a partir del bono activo
CREATE OR REPLACE FUNCTION public.set_session_modalidad()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_servicio text; v_modalidad text;
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.modalidad, '')), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_servicio := public.session_servicio_slug(NEW.group_id, NEW.ocupacion, NEW.servicio_slug);
  SELECT cb.modalidad INTO v_modalidad
  FROM public.client_bonos cb
  WHERE cb.client_id = NEW.client_id
    AND cb.activo
    AND cb.servicio_slug = v_servicio
    AND cb.modalidad IS NOT NULL
  ORDER BY cb.created_at DESC
  LIMIT 1;
  NEW.modalidad := v_modalidad;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_set_session_modalidad
BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.set_session_modalidad();