-- 1. Nuevo rol
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cliente';

-- 2. Todos los usuarios existentes pasan a ser administradores
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Invitaciones
CREATE TABLE public.client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  nombre text,
  email text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invitations TO authenticated;
GRANT ALL ON public.client_invitations TO service_role;

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations select admin" ON public.client_invitations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "invitations insert admin" ON public.client_invitations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "invitations update admin" ON public.client_invitations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "invitations delete admin" ON public.client_invitations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_client_invitations_updated_at
BEFORE UPDATE ON public.client_invitations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Perfiles de cliente (cuentas de acceso)
CREATE TABLE public.client_profiles (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  email text NOT NULL,
  bono_tipo text NOT NULL CHECK (bono_tipo IN ('grupal_directo','wellhub','claspass')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  invitation_id uuid REFERENCES public.client_invitations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_profiles TO authenticated;
GRANT ALL ON public.client_profiles TO service_role;

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles select own" ON public.client_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles select admin" ON public.client_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles insert admin" ON public.client_profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles update admin" ON public.client_profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles delete admin" ON public.client_profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_client_profiles_updated_at
BEFORE UPDATE ON public.client_profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Marcado de reservas online en las sesiones
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS booked_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS booking_tipo text;

CREATE INDEX IF NOT EXISTS idx_sessions_booked_by ON public.sessions(booked_by_user_id);

-- 6. Endurecer las políticas de gestión: solo administradores
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','client_bonos','client_events','bonos_catalogo','center_config',
    'groups','group_members','group_schedules','invoices','sessions',
    'special_days','trainers'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t||' select admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''))', t||' insert admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t||' update admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t||' delete admin', t);
  END LOOP;
END $$;