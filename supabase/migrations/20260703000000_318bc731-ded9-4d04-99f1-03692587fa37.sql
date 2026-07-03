
-- Center config singleton
CREATE TABLE public.center_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  horario_base jsonb NOT NULL DEFAULT '{
    "1": {"open":"06:45","close":"22:00"},
    "2": {"open":"06:45","close":"22:00"},
    "3": {"open":"06:45","close":"22:00"},
    "4": {"open":"06:45","close":"22:00"},
    "5": {"open":"06:45","close":"22:00"},
    "6": {"open":"09:00","close":"14:00"},
    "0": null
  }'::jsonb,
  precios jsonb NOT NULL DEFAULT '{"individual":36,"pareja":49,"grupal":17}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.center_config TO anon, authenticated;
GRANT ALL ON public.center_config TO service_role;
ALTER TABLE public.center_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all center_config" ON public.center_config FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.center_config (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TRIGGER center_config_touch BEFORE UPDATE ON public.center_config
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Special days
CREATE TYPE public.special_day_tipo AS ENUM ('cerrado','horario_especial');

CREATE TABLE public.special_days (
  fecha date PRIMARY KEY,
  tipo public.special_day_tipo NOT NULL,
  hora_apertura time,
  hora_cierre time,
  etiqueta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.special_days TO anon, authenticated;
GRANT ALL ON public.special_days TO service_role;
ALTER TABLE public.special_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all special_days" ON public.special_days FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER special_days_touch BEFORE UPDATE ON public.special_days
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
