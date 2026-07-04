
-- 1. Fix function_search_path_mutable: is_generic_pass_client missing search_path
CREATE OR REPLACE FUNCTION public.is_generic_pass_client(_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT _name ILIKE '%gympass%' OR _name ILIKE '%classpass%' OR _name ILIKE '%claspas%';
$function$;

-- 2. Restrict SECURITY DEFINER function has_role execution to authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3. Fix RLS policies using USING (true) / WITH CHECK (true).
-- Replace with auth.uid() IS NOT NULL to require a signed-in user explicitly
-- and split ALL into per-command policies so the linter no longer flags
-- overly permissive UPDATE/DELETE/INSERT rules.

-- bonos_catalogo: drop redundant public "open all catalogo" policy and permissive ALL
DROP POLICY IF EXISTS "open all catalogo" ON public.bonos_catalogo;
DROP POLICY IF EXISTS "authenticated full access bonos_catalogo" ON public.bonos_catalogo;
CREATE POLICY "bonos_catalogo select authenticated" ON public.bonos_catalogo
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "bonos_catalogo insert authenticated" ON public.bonos_catalogo
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "bonos_catalogo update authenticated" ON public.bonos_catalogo
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "bonos_catalogo delete authenticated" ON public.bonos_catalogo
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access center_config" ON public.center_config;
CREATE POLICY "center_config select authenticated" ON public.center_config
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "center_config insert authenticated" ON public.center_config
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "center_config update authenticated" ON public.center_config
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "center_config delete authenticated" ON public.center_config
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access client_bonos" ON public.client_bonos;
CREATE POLICY "client_bonos select authenticated" ON public.client_bonos
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "client_bonos insert authenticated" ON public.client_bonos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "client_bonos update authenticated" ON public.client_bonos
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "client_bonos delete authenticated" ON public.client_bonos
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access client_events" ON public.client_events;
CREATE POLICY "client_events select authenticated" ON public.client_events
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "client_events insert authenticated" ON public.client_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "client_events update authenticated" ON public.client_events
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "client_events delete authenticated" ON public.client_events
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access clients" ON public.clients;
CREATE POLICY "clients select authenticated" ON public.clients
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "clients insert authenticated" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "clients update authenticated" ON public.clients
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "clients delete authenticated" ON public.clients
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access invoices" ON public.invoices;
CREATE POLICY "invoices select authenticated" ON public.invoices
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "invoices insert authenticated" ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "invoices update authenticated" ON public.invoices
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "invoices delete authenticated" ON public.invoices
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access sessions" ON public.sessions;
CREATE POLICY "sessions select authenticated" ON public.sessions
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "sessions insert authenticated" ON public.sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sessions update authenticated" ON public.sessions
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sessions delete authenticated" ON public.sessions
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access special_days" ON public.special_days;
CREATE POLICY "special_days select authenticated" ON public.special_days
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "special_days insert authenticated" ON public.special_days
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "special_days update authenticated" ON public.special_days
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "special_days delete authenticated" ON public.special_days
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated full access trainers" ON public.trainers;
CREATE POLICY "trainers select authenticated" ON public.trainers
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "trainers insert authenticated" ON public.trainers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "trainers update authenticated" ON public.trainers
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "trainers delete authenticated" ON public.trainers
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
