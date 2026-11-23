CREATE OR REPLACE FUNCTION public.bono_fecha_caducidad(p_inicio date, p_tipo text, p_dias int)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_tipo = 'dias' AND COALESCE(p_dias,0) > 0 THEN (p_inicio + (p_dias || ' days')::interval)::date
    WHEN p_tipo = 'meses' AND COALESCE(p_dias,0) > 0 THEN (p_inicio + (p_dias || ' months')::interval)::date
    WHEN p_tipo = 'fin_mes' THEN (date_trunc('month', p_inicio::timestamp) + interval '1 month - 1 day')::date
    WHEN p_tipo = 'fin_ano' THEN (date_trunc('year', p_inicio::timestamp) + interval '1 year - 1 day')::date
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.recalc_bonos_caducidad_on_catalog()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.caducidad_tipo IS DISTINCT FROM OLD.caducidad_tipo OR NEW.caducidad_dias IS DISTINCT FROM OLD.caducidad_dias THEN
    UPDATE public.client_bonos
       SET fecha_caducidad = public.bono_fecha_caducidad(fecha_inicio, NEW.caducidad_tipo, NEW.caducidad_dias),
           caducidad_avisada = false
     WHERE bono_catalogo_id = NEW.id AND activo;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recalc_bonos_caducidad ON public.bonos_catalogo;
CREATE TRIGGER trg_recalc_bonos_caducidad AFTER UPDATE ON public.bonos_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.recalc_bonos_caducidad_on_catalog();

UPDATE public.client_bonos cb
   SET fecha_caducidad = public.bono_fecha_caducidad(cb.fecha_inicio, bc.caducidad_tipo, bc.caducidad_dias)
  FROM public.bonos_catalogo bc
 WHERE bc.id = cb.bono_catalogo_id AND cb.activo
   AND cb.fecha_caducidad IS DISTINCT FROM public.bono_fecha_caducidad(cb.fecha_inicio, bc.caducidad_tipo, bc.caducidad_dias);