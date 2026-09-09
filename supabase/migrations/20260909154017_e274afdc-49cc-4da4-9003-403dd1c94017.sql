
CREATE TABLE IF NOT EXISTS public.superadmin_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.superadmin_context TO authenticated;
GRANT ALL ON public.superadmin_context TO service_role;
ALTER TABLE public.superadmin_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_context_select" ON public.superadmin_context;
CREATE POLICY "superadmin_context_select" ON public.superadmin_context
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_superadmin());

CREATE OR REPLACE FUNCTION public.get_my_centro_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v uuid;
BEGIN
  IF public.is_superadmin() THEN
    SELECT centro_id INTO v FROM public.superadmin_context WHERE user_id = auth.uid();
    RETURN v;
  END IF;

  SELECT ur.centro_id INTO v FROM public.user_roles ur
   WHERE ur.user_id = auth.uid() AND ur.centro_id IS NOT NULL
   ORDER BY ur.created_at ASC LIMIT 1;

  IF v IS NULL THEN
    SELECT cp.centro_id INTO v FROM public.client_profiles cp WHERE cp.id = auth.uid();
  END IF;

  IF v IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.centros c WHERE c.id = v AND c.estado <> 'activo'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.my_centro_estado()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT c.estado FROM public.centros c
    WHERE c.id = COALESCE(
      (SELECT ur.centro_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.centro_id IS NOT NULL
        ORDER BY ur.created_at ASC LIMIT 1),
      (SELECT cp.centro_id FROM public.client_profiles cp WHERE cp.id = auth.uid())
    )
  ), 'activo')
$function$;

CREATE OR REPLACE FUNCTION public.superadmin_centros_overview()
RETURNS TABLE(id uuid, nombre text, estado text, plan text, fecha_creacion timestamptz,
              usuarios integer, ultimo_acceso timestamptz, sesiones_mes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.nombre, c.estado, c.plan, c.fecha_creacion,
    (SELECT count(*)::int FROM public.user_roles ur WHERE ur.centro_id = c.id),
    (SELECT max(u.last_sign_in_at) FROM auth.users u
      WHERE u.id IN (SELECT ur.user_id FROM public.user_roles ur WHERE ur.centro_id = c.id)),
    (SELECT count(*)::int FROM public.sessions s
      WHERE s.centro_id = c.id AND s.fecha >= date_trunc('month', CURRENT_DATE)::date)
  FROM public.centros c
  WHERE public.is_superadmin()
  ORDER BY c.nombre
$function$;

CREATE OR REPLACE FUNCTION public.superadmin_centro_usuarios(p_centro uuid)
RETURNS TABLE(user_id uuid, email text, role app_role, ultimo_acceso timestamptz, alta timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT ur.user_id, u.email::text, ur.role, u.last_sign_in_at, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.centro_id = p_centro AND public.is_superadmin()
  ORDER BY ur.role, u.email
$function$;

CREATE OR REPLACE FUNCTION public.superadmin_global_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN NOT public.is_superadmin() THEN '{}'::jsonb ELSE jsonb_build_object(
    'centros_total', (SELECT count(*) FROM public.centros),
    'centros_activos', (SELECT count(*) FROM public.centros WHERE estado = 'activo'),
    'usuarios_total', (SELECT count(*) FROM public.user_roles WHERE centro_id IS NOT NULL),
    'sesiones_mes', (SELECT count(*) FROM public.sessions
                      WHERE fecha >= date_trunc('month', CURRENT_DATE)::date),
    'top_centros', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT c.nombre, count(s.id) AS sesiones
        FROM public.centros c
        LEFT JOIN public.sessions s ON s.centro_id = c.id
          AND s.fecha >= (CURRENT_DATE - INTERVAL '30 days')::date
        GROUP BY c.id, c.nombre
        ORDER BY count(s.id) DESC, c.nombre
        LIMIT 5
      ) t), '[]'::jsonb)
  ) END
$function$;

CREATE OR REPLACE FUNCTION public.superadmin_set_centro_estado(p_centro uuid, p_estado text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede cambiar el estado de un centro';
  END IF;
  IF p_estado NOT IN ('activo','inactivo') THEN
    RAISE EXCEPTION 'Estado no válido';
  END IF;
  UPDATE public.centros SET estado = p_estado WHERE id = p_centro;
END $function$;

CREATE OR REPLACE FUNCTION public.superadmin_set_soporte(p_centro uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede usar el modo soporte';
  END IF;
  IF p_centro IS NULL THEN
    DELETE FROM public.superadmin_context WHERE user_id = auth.uid();
  ELSE
    INSERT INTO public.superadmin_context (user_id, centro_id, updated_at)
    VALUES (auth.uid(), p_centro, now())
    ON CONFLICT (user_id) DO UPDATE SET centro_id = EXCLUDED.centro_id, updated_at = now();
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.create_centro(p_nombre text, p_plan text DEFAULT 'basico'::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_src uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede crear centros';
  END IF;

  INSERT INTO public.centros (nombre, plan) VALUES (btrim(p_nombre), COALESCE(p_plan,'basico'))
  RETURNING id INTO v_id;

  SELECT id INTO v_src FROM public.centros WHERE id <> v_id ORDER BY fecha_creacion ASC LIMIT 1;

  INSERT INTO public.center_config (id, centro_id, nombre, horario_base, precios, colores, avisos)
  SELECT true, v_id, btrim(p_nombre), horario_base, precios, colores, avisos
  FROM public.center_config WHERE centro_id = v_src LIMIT 1;

  IF v_src IS NOT NULL THEN
    INSERT INTO public.servicios (slug, nombre, orden, capacidad_default, descripcion, caducidad_tipo, caducidad_dias, abreviatura, centro_id)
    SELECT slug, nombre, orden, capacidad_default, descripcion, caducidad_tipo, caducidad_dias, abreviatura, v_id
    FROM public.servicios WHERE centro_id = v_src;

    INSERT INTO public.modalidades (servicio_slug, nombre, orden, centro_id)
    SELECT servicio_slug, nombre, orden, v_id
    FROM public.modalidades WHERE centro_id = v_src;

    INSERT INTO public.bonos_catalogo (tipo, nombre, sesiones_incluidas, duracion_min, precio, orden, servicio_slug, caducidad_tipo, caducidad_dias, modalidad, centro_id)
    SELECT tipo, nombre, sesiones_incluidas, duracion_min, precio, orden, servicio_slug, caducidad_tipo, caducidad_dias, modalidad, v_id
    FROM public.bonos_catalogo WHERE centro_id = v_src;
  END IF;

  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.superadmin_centros_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_centro_usuarios(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_global_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_set_centro_estado(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_set_soporte(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_centro_estado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_centros_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_centro_usuarios(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_global_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_set_centro_estado(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_set_soporte(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_centro_estado() TO authenticated, service_role;
