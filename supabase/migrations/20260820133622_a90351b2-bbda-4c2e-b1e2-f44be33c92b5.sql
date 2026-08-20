ALTER TABLE public.service_slots ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.slot_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slot_structures TO authenticated;
GRANT ALL ON public.slot_structures TO service_role;

ALTER TABLE public.slot_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read structures"
  ON public.slot_structures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert structures"
  ON public.slot_structures FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update structures"
  ON public.slot_structures FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete structures"
  ON public.slot_structures FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER slot_structures_touch BEFORE UPDATE ON public.slot_structures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();