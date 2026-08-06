CREATE TABLE public.service_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_slug text NOT NULL,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  capacidad integer NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_slots TO authenticated;
GRANT ALL ON public.service_slots TO service_role;

ALTER TABLE public.service_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read slots"
  ON public.service_slots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage slots insert"
  ON public.service_slots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage slots update"
  ON public.service_slots FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage slots delete"
  ON public.service_slots FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX service_slots_servicio_idx ON public.service_slots (servicio_slug, dia_semana);

CREATE TRIGGER service_slots_touch BEFORE UPDATE ON public.service_slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();