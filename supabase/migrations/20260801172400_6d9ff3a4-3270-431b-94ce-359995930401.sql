CREATE OR REPLACE FUNCTION public.get_center_nombre()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(btrim(nombre), ''), 'Fitness 360') FROM public.center_config WHERE id = true
$$;
REVOKE ALL ON FUNCTION public.get_center_nombre() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_center_nombre() TO anon, authenticated, service_role;