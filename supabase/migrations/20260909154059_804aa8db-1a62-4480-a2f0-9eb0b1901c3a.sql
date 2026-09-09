
DO $$
DECLARE r record; sql text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd <> 'SELECT'
      AND (COALESCE(qual,'') ILIKE '%get_my_centro_id%' OR COALESCE(with_check,'') ILIKE '%get_my_centro_id%')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    sql := format('CREATE POLICY %I ON public.%I FOR %s TO %s',
      r.policyname, r.tablename, r.cmd, array_to_string(r.roles, ','));
    IF r.qual IS NOT NULL THEN
      sql := sql || format(' USING ((%s) AND NOT public.is_superadmin())', r.qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      sql := sql || format(' WITH CHECK ((%s) AND NOT public.is_superadmin())', r.with_check);
    END IF;
    EXECUTE sql;
  END LOOP;
END $$;
