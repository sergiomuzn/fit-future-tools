CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'superadmin' THEN 0
    WHEN 'admin' THEN 1
    WHEN 'entrenador' THEN 2
    ELSE 3
  END
  LIMIT 1
$$;