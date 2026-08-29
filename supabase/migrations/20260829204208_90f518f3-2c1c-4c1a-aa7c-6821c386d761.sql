ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'cliente';

ALTER TABLE public.client_invitations
  DROP CONSTRAINT IF EXISTS client_invitations_role_chk;
ALTER TABLE public.client_invitations
  ADD CONSTRAINT client_invitations_role_chk CHECK (role IN ('cliente','entrenador'));

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'entrenador' THEN 2
    ELSE 3
  END
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;