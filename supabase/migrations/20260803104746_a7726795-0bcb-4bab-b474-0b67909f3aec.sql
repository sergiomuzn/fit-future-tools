CREATE TABLE public.servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden ver servicios" ON public.servicios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados pueden crear servicios" ON public.servicios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados pueden editar servicios" ON public.servicios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados pueden borrar servicios" ON public.servicios FOR DELETE TO authenticated USING (true);

CREATE TRIGGER servicios_touch BEFORE UPDATE ON public.servicios
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.servicios (slug, nombre, orden) VALUES
  ('personal', 'Entrenamiento Personal', 1),
  ('grupos', 'Grupos Reducidos', 2);

ALTER TABLE public.bonos_catalogo ADD COLUMN servicio_slug text NOT NULL DEFAULT 'personal';

UPDATE public.bonos_catalogo SET servicio_slug = 'grupos' WHERE tipo = 'grupal';