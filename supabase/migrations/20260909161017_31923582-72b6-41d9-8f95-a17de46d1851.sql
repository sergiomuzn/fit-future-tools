CREATE OR REPLACE FUNCTION public.my_centro_estado()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_superadmin() THEN 'activo'
    ELSE (
      SELECT c.estado
      FROM public.centros c
      WHERE c.id = public.get_my_centro_id()
    )
  END
$$;