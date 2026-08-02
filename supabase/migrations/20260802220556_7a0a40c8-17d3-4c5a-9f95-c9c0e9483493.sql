ALTER TABLE public.client_invitations ADD COLUMN IF NOT EXISTS acceso text NOT NULL DEFAULT 'grupos';
ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS acceso text NOT NULL DEFAULT 'grupos';
ALTER TABLE public.client_invitations ADD CONSTRAINT client_invitations_acceso_chk CHECK (acceso IN ('personal','grupos','ambos'));
ALTER TABLE public.client_profiles ADD CONSTRAINT client_profiles_acceso_chk CHECK (acceso IN ('personal','grupos','ambos'));