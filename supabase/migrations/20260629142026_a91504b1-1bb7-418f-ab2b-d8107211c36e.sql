
-- ===== ENUMS =====
CREATE TYPE public.bono_tipo AS ENUM ('individual','pareja','grupal');
CREATE TYPE public.sesion_estado AS ENUM ('reservada','realizada','cancelada','prueba','renovacion');

-- ===== TRAINERS =====
CREATE TABLE public.trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  iniciales text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainers TO anon, authenticated;
GRANT ALL ON public.trainers TO service_role;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all trainers" ON public.trainers FOR ALL USING (true) WITH CHECK (true);

-- ===== CLIENTS =====
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  telefono text,
  fecha_inicio date DEFAULT CURRENT_DATE,
  cumpleanos date,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO anon, authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);

-- ===== BONOS CATALOGO =====
CREATE TABLE public.bonos_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.bono_tipo NOT NULL,
  nombre text NOT NULL,
  sesiones_incluidas int NOT NULL,
  duracion_min int,
  precio numeric(10,2) NOT NULL,
  orden int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonos_catalogo TO anon, authenticated;
GRANT ALL ON public.bonos_catalogo TO service_role;
ALTER TABLE public.bonos_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all catalogo" ON public.bonos_catalogo FOR ALL USING (true) WITH CHECK (true);

-- ===== CLIENT BONOS =====
CREATE TABLE public.client_bonos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bono_catalogo_id uuid REFERENCES public.bonos_catalogo(id),
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  sesiones_disponibles int NOT NULL DEFAULT 0,
  sesiones_realizadas int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  ultimo_bono_nombre text,
  ultimo_bono_fecha date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.client_bonos(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_bonos TO anon, authenticated;
GRANT ALL ON public.client_bonos TO service_role;
ALTER TABLE public.client_bonos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all client_bonos" ON public.client_bonos FOR ALL USING (true) WITH CHECK (true);

-- ===== SESSIONS =====
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  estado public.sesion_estado NOT NULL DEFAULT 'reservada',
  ocupacion int NOT NULL DEFAULT 1,
  tipo public.bono_tipo,
  incidencia text,
  recurrencia_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sessions(fecha);
CREATE INDEX ON public.sessions(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO anon, authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all sessions" ON public.sessions FOR ALL USING (true) WITH CHECK (true);

-- ===== INVOICES =====
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  cobrador_trainer_id uuid REFERENCES public.trainers(id),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bono_catalogo_id uuid NOT NULL REFERENCES public.bonos_catalogo(id),
  precio_cobrado numeric(10,2) NOT NULL,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.invoices(fecha);
CREATE INDEX ON public.invoices(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO anon, authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all invoices" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

-- ===== FUNCTIONS / TRIGGERS =====

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_client_bonos_touch BEFORE UPDATE ON public.client_bonos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_sessions_touch BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Al insertar factura -> aplicar bono al cliente
CREATE OR REPLACE FUNCTION public.apply_invoice_to_bono()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_sesiones int;
  v_nombre text;
  v_existing uuid;
BEGIN
  SELECT sesiones_incluidas, nombre INTO v_sesiones, v_nombre
  FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;

  SELECT id INTO v_existing
  FROM public.client_bonos
  WHERE client_id = NEW.client_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.client_bonos(client_id, bono_catalogo_id, fecha_inicio, sesiones_disponibles, sesiones_realizadas, activo, ultimo_bono_nombre, ultimo_bono_fecha)
    VALUES (NEW.client_id, NEW.bono_catalogo_id, NEW.fecha, COALESCE(v_sesiones,0), 0, true, v_nombre, NEW.fecha);
  ELSE
    UPDATE public.client_bonos
    SET sesiones_disponibles = sesiones_disponibles + COALESCE(v_sesiones,0),
        bono_catalogo_id = NEW.bono_catalogo_id,
        ultimo_bono_nombre = v_nombre,
        ultimo_bono_fecha = NEW.fecha,
        activo = true
    WHERE id = v_existing;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_invoice_apply AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_to_bono();

-- Sesión: al cambiar a 'realizada' descuenta del bono activo
CREATE OR REPLACE FUNCTION public.session_apply_realizada()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_bono uuid;
BEGIN
  -- aplica cuando pasa a realizada (insert o update)
  IF NEW.estado = 'realizada' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'realizada') AND NEW.client_id IS NOT NULL THEN
    SELECT id INTO v_bono FROM public.client_bonos
      WHERE client_id = NEW.client_id AND activo = true
      ORDER BY created_at DESC LIMIT 1;
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles - 1,
          sesiones_realizadas = sesiones_realizadas + 1
      WHERE id = v_bono;
    END IF;
  END IF;
  -- revertir si pasa de realizada a otro estado
  IF TG_OP = 'UPDATE' AND OLD.estado = 'realizada' AND NEW.estado <> 'realizada' AND OLD.client_id IS NOT NULL THEN
    SELECT id INTO v_bono FROM public.client_bonos
      WHERE client_id = OLD.client_id AND activo = true
      ORDER BY created_at DESC LIMIT 1;
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0)
      WHERE id = v_bono;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_session_realizada AFTER INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.session_apply_realizada();
