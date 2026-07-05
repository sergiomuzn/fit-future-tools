
-- Groups table
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  capacidad integer NOT NULL DEFAULT 6 CHECK (capacidad > 0),
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups select authenticated" ON public.groups FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "groups insert authenticated" ON public.groups FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "groups update authenticated" ON public.groups FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "groups delete authenticated" ON public.groups FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE TRIGGER groups_touch BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Group weekly schedules (day 0=Sun..6=Sat, hora_inicio/hora_fin)
CREATE TABLE public.group_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, dia_semana, hora_inicio)
);
CREATE INDEX group_schedules_group_idx ON public.group_schedules(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_schedules TO authenticated;
GRANT ALL ON public.group_schedules TO service_role;
ALTER TABLE public.group_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_schedules select authenticated" ON public.group_schedules FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "group_schedules insert authenticated" ON public.group_schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "group_schedules update authenticated" ON public.group_schedules FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "group_schedules delete authenticated" ON public.group_schedules FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Group members (many-to-many with clients)
CREATE TABLE public.group_members (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, client_id)
);
CREATE INDEX group_members_client_idx ON public.group_members(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_members select authenticated" ON public.group_members FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "group_members insert authenticated" ON public.group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "group_members update authenticated" ON public.group_members FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "group_members delete authenticated" ON public.group_members FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Link sessions to a registered group (nullable)
ALTER TABLE public.sessions ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;
CREATE INDEX sessions_group_id_idx ON public.sessions(group_id);
