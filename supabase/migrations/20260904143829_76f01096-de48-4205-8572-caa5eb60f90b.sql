-- Reactivar cliente al registrar una sesión de prueba
CREATE OR REPLACE FUNCTION public.activate_client_on_prueba_session()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND (NEW.tipo = 'prueba' OR NEW.estado = 'prueba') THEN
    UPDATE public.clients
    SET activo = true
    WHERE id = NEW.client_id AND activo = false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_activate_client_on_prueba ON public.sessions;
CREATE TRIGGER trg_activate_client_on_prueba
AFTER INSERT ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.activate_client_on_prueba_session();

-- Inactivar automáticamente clientes de prueba sin bono contratado
CREATE OR REPLACE FUNCTION public.auto_deactivate_prueba_clients(p_dias integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_count int;
BEGIN
  WITH candidates AS (
    SELECT c.id
    FROM public.clients c
    WHERE c.activo = true
      AND EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.client_id = c.id
          AND (s.tipo = 'prueba' OR s.estado = 'prueba')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.client_id = c.id
          AND (s.tipo = 'prueba' OR s.estado = 'prueba')
          AND s.fecha >= CURRENT_DATE - (GREATEST(p_dias, 0) || ' days')::interval
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.client_bonos cb
        WHERE cb.client_id = c.id
          AND cb.bono_catalogo_id IS NOT NULL
      )
  )
  UPDATE public.clients SET activo = false
  WHERE id IN (SELECT id FROM candidates);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.auto_deactivate_prueba_clients()
RETURNS integer
LANGUAGE sql
SET search_path TO 'public'
AS $$
  SELECT public.auto_deactivate_prueba_clients(30);
$$;