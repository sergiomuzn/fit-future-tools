GRANT SELECT, INSERT, UPDATE, DELETE ON public.center_config TO authenticated;
GRANT ALL ON public.center_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.special_days TO authenticated;
GRANT ALL ON public.special_days TO service_role;