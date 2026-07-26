
-- 1) Convertir enum bono_tipo → text en columnas afectadas
ALTER TABLE public.bonos_catalogo ALTER COLUMN tipo TYPE text USING tipo::text;
ALTER TABLE public.sessions ALTER COLUMN tipo TYPE text USING tipo::text;

-- 2) Recrear funciones para que usen text en vez del enum
DROP FUNCTION IF EXISTS public.apply_invoice_row(uuid, uuid, date);
DROP FUNCTION IF EXISTS public.apply_invoice_row(uuid, uuid, date, integer);
DROP FUNCTION IF EXISTS public.revert_invoice_row(uuid, uuid, date);
DROP FUNCTION IF EXISTS public.log_client_alta() CASCADE;

CREATE OR REPLACE FUNCTION public.apply_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date, p_sesiones_override integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_sesiones int;
  v_nombre text;
  v_tipo text;
  v_existing_id uuid;
  v_carryover int := 0;
BEGIN
  SELECT sesiones_incluidas, nombre, tipo INTO v_sesiones, v_nombre, v_tipo
  FROM public.bonos_catalogo WHERE id = p_bono_cat;

  IF v_tipo = 'prueba' THEN RETURN; END IF;

  v_sesiones := COALESCE(p_sesiones_override, v_sesiones);

  SELECT id, sesiones_disponibles INTO v_existing_id, v_carryover
  FROM public.client_bonos
  WHERE client_id = p_client AND activo = true
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.client_bonos SET activo = false WHERE id = v_existing_id;
  ELSE
    v_carryover := 0;
  END IF;

  INSERT INTO public.client_bonos(
    client_id, bono_catalogo_id, fecha_inicio,
    sesiones_disponibles, sesiones_realizadas,
    activo, ultimo_bono_nombre, ultimo_bono_fecha
  ) VALUES (
    p_client, p_bono_cat, p_fecha,
    COALESCE(v_sesiones, 0) + COALESCE(v_carryover, 0), 0,
    true, v_nombre, p_fecha
  );
END $$;

CREATE OR REPLACE FUNCTION public.revert_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_target uuid;
  v_prev uuid;
  v_tipo text;
BEGIN
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = p_bono_cat;
  IF v_tipo = 'prueba' THEN RETURN; END IF;

  SELECT id INTO v_target FROM public.client_bonos
    WHERE client_id = p_client
      AND bono_catalogo_id = p_bono_cat
      AND fecha_inicio = p_fecha
    ORDER BY created_at DESC LIMIT 1;
  IF v_target IS NOT NULL THEN
    DELETE FROM public.client_bonos WHERE id = v_target;
    SELECT id INTO v_prev FROM public.client_bonos
      WHERE client_id = p_client ORDER BY created_at DESC LIMIT 1;
    IF v_prev IS NOT NULL THEN
      UPDATE public.client_bonos SET activo = true WHERE id = v_prev;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_client_alta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tipo text;
  v_name text;
  v_has_prev_bono boolean;
BEGIN
  IF NEW.bono_catalogo_id IS NULL THEN RETURN NEW; END IF;
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  IF v_tipo IS NULL OR v_tipo = 'prueba' THEN RETURN NEW; END IF;
  IF v_tipo NOT IN ('individual','pareja','grupal') THEN RETURN NEW; END IF;

  SELECT nombre INTO v_name FROM public.clients WHERE id = NEW.client_id;
  IF public.is_generic_pass_client(COALESCE(v_name,'')) THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.client_bonos
    WHERE client_id = NEW.client_id AND id <> NEW.id
  ) INTO v_has_prev_bono;
  IF v_has_prev_bono THEN RETURN NEW; END IF;

  INSERT INTO public.client_events(client_id, tipo, fecha)
  VALUES (NEW.client_id, 'alta', NEW.fecha_inicio);
  RETURN NEW;
END $$;

-- Recrear trigger de alta (fue eliminado con CASCADE)
DROP TRIGGER IF EXISTS log_client_alta_trg ON public.client_bonos;
CREATE TRIGGER log_client_alta_trg
AFTER INSERT ON public.client_bonos
FOR EACH ROW EXECUTE FUNCTION public.log_client_alta();

-- 3) Insertar el bono Prueba en catálogo si no existe
INSERT INTO public.bonos_catalogo (nombre, tipo, sesiones_incluidas, precio, orden)
SELECT 'Prueba', 'prueba', 1, 10, COALESCE((SELECT MAX(orden) FROM public.bonos_catalogo), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM public.bonos_catalogo WHERE tipo = 'prueba');

-- 4) Nueva función: asignar bono de prueba al primer registro
CREATE OR REPLACE FUNCTION public.ensure_prueba_bono(p_client uuid, p_fecha date)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_cat uuid;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM public.client_bonos WHERE client_id = p_client) THEN
    RETURN;
  END IF;
  SELECT id INTO v_cat FROM public.bonos_catalogo WHERE tipo = 'prueba' ORDER BY orden LIMIT 1;
  IF v_cat IS NULL THEN RETURN; END IF;
  INSERT INTO public.client_bonos(
    client_id, bono_catalogo_id, fecha_inicio,
    sesiones_disponibles, sesiones_realizadas,
    activo, ultimo_bono_nombre, ultimo_bono_fecha
  ) VALUES (
    p_client, v_cat, p_fecha, 1, 0, true, 'Prueba', p_fecha
  );
END $$;

-- 5) Auto-inactivar clientes cuyo único bono activo es prueba y tiene > 30 días
CREATE OR REPLACE FUNCTION public.auto_deactivate_prueba_clients()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  WITH candidates AS (
    SELECT c.id FROM public.clients c
    WHERE c.activo = true
      AND EXISTS(
        SELECT 1 FROM public.client_bonos cb
        JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
        WHERE cb.client_id = c.id AND bc.tipo = 'prueba' AND cb.activo = true
          AND cb.fecha_inicio < CURRENT_DATE - INTERVAL '30 days'
      )
      AND NOT EXISTS(
        SELECT 1 FROM public.client_bonos cb
        JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
        WHERE cb.client_id = c.id AND bc.tipo <> 'prueba'
      )
  )
  UPDATE public.clients SET activo = false
  WHERE id IN (SELECT id FROM candidates);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Grants para las nuevas funciones
GRANT EXECUTE ON FUNCTION public.ensure_prueba_bono(uuid, date) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.auto_deactivate_prueba_clients() TO authenticated, anon, service_role;
