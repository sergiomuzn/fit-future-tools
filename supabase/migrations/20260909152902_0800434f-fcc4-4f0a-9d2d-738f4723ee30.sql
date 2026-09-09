
CREATE TABLE public.superadmin_emails (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.superadmin_emails TO service_role;
ALTER TABLE public.superadmin_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY superadmin_emails_select ON public.superadmin_emails FOR SELECT TO authenticated
  USING (public.is_superadmin());

INSERT INTO public.superadmin_emails (email) VALUES ('admin@tracli.app');

-- Otorga el rol superadmin a la cuenta autorizada la primera vez que entra
CREATE OR REPLACE FUNCTION public.claim_superadmin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.superadmin_emails WHERE lower(email) = v_email) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role, centro_id)
  VALUES (auth.uid(), 'superadmin', NULL)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_superadmin() TO authenticated;

-- Alta de un centro nuevo con la configuración actual como plantilla
CREATE OR REPLACE FUNCTION public.create_centro(p_nombre text, p_plan text DEFAULT 'basico')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede crear centros';
  END IF;

  INSERT INTO public.centros (nombre, plan) VALUES (btrim(p_nombre), COALESCE(p_plan,'basico'))
  RETURNING id INTO v_id;

  INSERT INTO public.center_config (id, centro_id, nombre, horario_base, precios, colores, avisos)
  SELECT true, v_id, btrim(p_nombre), horario_base, precios, colores, avisos
  FROM public.center_config
  ORDER BY centro_id
  LIMIT 1;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_centro(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_centro(text, text) TO authenticated;
