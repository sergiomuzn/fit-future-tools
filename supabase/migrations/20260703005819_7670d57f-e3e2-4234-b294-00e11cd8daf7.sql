
-- Historical alta/baja events for clients
CREATE TYPE public.client_event_tipo AS ENUM ('alta', 'baja');

CREATE TABLE public.client_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo public.client_event_tipo NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_events_client_idx ON public.client_events(client_id);
CREATE INDEX client_events_fecha_idx ON public.client_events(fecha);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_events TO authenticated, anon;
GRANT ALL ON public.client_events TO service_role;

ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all client_events" ON public.client_events USING (true) WITH CHECK (true);

-- Helper: determine if a client name is a "generic" gympass/classpass account
CREATE OR REPLACE FUNCTION public.is_generic_pass_client(_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _name ILIKE '%gympass%' OR _name ILIKE '%classpass%' OR _name ILIKE '%claspas%';
$$;

-- Trigger: register a "baja" when a client goes from active to inactive
CREATE OR REPLACE FUNCTION public.log_client_baja()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.activo = true AND NEW.activo = false THEN
    INSERT INTO public.client_events(client_id, tipo, fecha)
    VALUES (NEW.id, 'baja', CURRENT_DATE);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_client_baja
AFTER UPDATE OF activo ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.log_client_baja();

-- Trigger: register the first "alta" when a client activates their first
-- individual / pareja / grupal bono (excluding trial and generic pass clients)
CREATE OR REPLACE FUNCTION public.log_client_alta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tipo public.bono_tipo;
  v_name text;
  v_has_alta boolean;
BEGIN
  IF NEW.bono_catalogo_id IS NULL THEN RETURN NEW; END IF;
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  IF v_tipo IS NULL OR v_tipo = 'prueba' THEN RETURN NEW; END IF;
  IF v_tipo NOT IN ('individual','pareja','grupal') THEN RETURN NEW; END IF;

  SELECT nombre INTO v_name FROM public.clients WHERE id = NEW.client_id;
  IF public.is_generic_pass_client(COALESCE(v_name,'')) THEN RETURN NEW; END IF;

  SELECT EXISTS(SELECT 1 FROM public.client_events WHERE client_id = NEW.client_id AND tipo = 'alta')
    INTO v_has_alta;
  IF v_has_alta THEN RETURN NEW; END IF;

  INSERT INTO public.client_events(client_id, tipo, fecha)
  VALUES (NEW.client_id, 'alta', NEW.fecha_inicio);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_client_alta
AFTER INSERT ON public.client_bonos
FOR EACH ROW EXECUTE FUNCTION public.log_client_alta();

-- Backfill altas from historical client_bonos
INSERT INTO public.client_events (client_id, tipo, fecha)
SELECT sub.client_id, 'alta'::public.client_event_tipo, sub.fecha_inicio
FROM (
  SELECT DISTINCT ON (cb.client_id) cb.client_id, cb.fecha_inicio
  FROM public.client_bonos cb
  JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
  JOIN public.clients c ON c.id = cb.client_id
  WHERE bc.tipo IN ('individual','pareja','grupal')
    AND NOT public.is_generic_pass_client(c.nombre)
  ORDER BY cb.client_id, cb.fecha_inicio ASC, cb.created_at ASC
) sub;
