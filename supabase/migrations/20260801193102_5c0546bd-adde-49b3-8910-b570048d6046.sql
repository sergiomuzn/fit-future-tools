REVOKE EXECUTE ON FUNCTION public.get_center_nombre() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_center_nombre() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_center_nombre() TO authenticated, service_role;