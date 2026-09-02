REVOKE ALL ON FUNCTION public.notify_bonos_caducados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_bonos_caducados() TO authenticated, service_role;