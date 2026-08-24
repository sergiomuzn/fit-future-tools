CREATE TABLE public.service_slot_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_slot_id uuid REFERENCES public.service_slots(id) ON DELETE SET NULL,
  servicio_slug text NOT NULL,
  fecha date NOT NULL,
  hora_inicio time without time zone NOT NULL,
  hora_fin time without time zone NOT NULL,
  capacidad integer NOT NULL DEFAULT 1,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  origen text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX service_slot_instances_unique
  ON public.service_slot_instances (servicio_slug, fecha, hora_inicio, hora_fin);
CREATE INDEX service_slot_instances_fecha_idx ON public.service_slot_instances (fecha);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_slot_instances TO authenticated;
GRANT ALL ON public.service_slot_instances TO service_role;

ALTER TABLE public.service_slot_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read slot instances"
  ON public.service_slot_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert slot instances"
  ON public.service_slot_instances FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update slot instances"
  ON public.service_slot_instances FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete slot instances"
  ON public.service_slot_instances FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER service_slot_instances_touch
  BEFORE UPDATE ON public.service_slot_instances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();