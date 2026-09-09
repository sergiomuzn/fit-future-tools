
-- =====================================================================
-- FASE 1: tabla de centros
-- =====================================================================
CREATE TABLE public.centros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  logo_url text,
  plan text NOT NULL DEFAULT 'basico',
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  configuracion_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.centros TO authenticated;
GRANT ALL ON public.centros TO service_role;
ALTER TABLE public.centros ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER centros_touch BEFORE UPDATE ON public.centros
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Centro existente
INSERT INTO public.centros (id, nombre, plan, estado)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  COALESCE((SELECT NULLIF(btrim(nombre), '') FROM public.center_config WHERE id = true), 'Tracli'),
  'basico', 'activo'
);

-- =====================================================================
-- Columna centro_id en todas las tablas + backfill
-- =====================================================================
DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'bonos_catalogo','center_config','client_bonos','client_events','client_invitations',
    'client_profiles','clients','group_members','group_schedules','groups','invoices',
    'modalidades','notificaciones','service_slot_instances','service_slots','servicios',
    'sessions','slot_structures','special_days','trainers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN centro_id uuid', t);
    EXECUTE format('UPDATE public.%I SET centro_id = %L', t, '00000000-0000-4000-8000-000000000001');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN centro_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (centro_id) REFERENCES public.centros(id) ON DELETE CASCADE', t, t || '_centro_id_fkey');
    EXECUTE format('CREATE INDEX %I ON public.%I (centro_id)', 'idx_' || t || '_centro_id', t);
  END LOOP;
END $do$;

-- user_roles: el superadmin no pertenece a ningún centro
ALTER TABLE public.user_roles ADD COLUMN centro_id uuid REFERENCES public.centros(id) ON DELETE CASCADE;
UPDATE public.user_roles SET centro_id = '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_centro_required
  CHECK (centro_id IS NOT NULL OR role = 'superadmin');
CREATE INDEX idx_user_roles_centro_id ON public.user_roles (centro_id);

-- =====================================================================
-- Helpers de aislamiento
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'superadmin')
$$;

CREATE OR REPLACE FUNCTION public.get_my_centro_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT centro_id FROM public.user_roles
  WHERE user_id = auth.uid() AND centro_id IS NOT NULL
  ORDER BY created_at ASC LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_centro_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_centro_id() TO authenticated, service_role;

-- Relleno automático del centro en cada INSERT
CREATE OR REPLACE FUNCTION public.set_centro_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v uuid;
  fk_val uuid;
  n int;
BEGIN
  IF NEW.centro_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v := public.get_my_centro_id();

  IF v IS NULL AND TG_NARGS = 2 THEN
    EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) INTO fk_val USING NEW;
    IF fk_val IS NOT NULL THEN
      EXECUTE format('SELECT centro_id FROM public.%I WHERE id = $1', TG_ARGV[1])
        INTO v USING fk_val;
    END IF;
  END IF;

  IF v IS NULL THEN
    SELECT count(*) INTO n FROM public.centros;
    IF n = 1 THEN
      SELECT id INTO v FROM public.centros;
    END IF;
  END IF;

  IF v IS NULL THEN
    RAISE EXCEPTION 'No se puede determinar el centro para la tabla %', TG_TABLE_NAME;
  END IF;

  NEW.centro_id := v;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.set_centro_id() FROM PUBLIC, anon;

-- =====================================================================
-- Claves y unicidad por centro
-- =====================================================================
ALTER TABLE public.servicios DROP CONSTRAINT servicios_slug_key;
ALTER TABLE public.servicios ADD CONSTRAINT servicios_centro_slug_key UNIQUE (centro_id, slug);

ALTER TABLE public.modalidades DROP CONSTRAINT modalidades_servicio_slug_nombre_key;
ALTER TABLE public.modalidades ADD CONSTRAINT modalidades_centro_servicio_nombre_key UNIQUE (centro_id, servicio_slug, nombre);

ALTER TABLE public.special_days DROP CONSTRAINT special_days_pkey;
ALTER TABLE public.special_days ADD CONSTRAINT special_days_pkey PRIMARY KEY (centro_id, fecha);

ALTER TABLE public.center_config DROP CONSTRAINT center_config_pkey;
ALTER TABLE public.center_config ALTER COLUMN id SET DEFAULT true;
ALTER TABLE public.center_config ADD CONSTRAINT center_config_pkey PRIMARY KEY (centro_id);

-- =====================================================================
-- Triggers de relleno automático
-- =====================================================================
DO $do$
DECLARE
  r record;
  specs text[][] := ARRAY[
    ['bonos_catalogo',NULL,NULL],
    ['center_config',NULL,NULL],
    ['client_bonos','client_id','clients'],
    ['client_events','client_id','clients'],
    ['client_invitations','client_id','clients'],
    ['client_profiles','client_id','clients'],
    ['clients',NULL,NULL],
    ['group_members','group_id','groups'],
    ['group_schedules','group_id','groups'],
    ['groups',NULL,NULL],
    ['invoices','client_id','clients'],
    ['modalidades',NULL,NULL],
    ['notificaciones',NULL,NULL],
    ['service_slot_instances','service_slot_id','service_slots'],
    ['service_slots',NULL,NULL],
    ['servicios',NULL,NULL],
    ['sessions','client_id','clients'],
    ['slot_structures',NULL,NULL],
    ['special_days',NULL,NULL],
    ['trainers',NULL,NULL],
    ['user_roles',NULL,NULL]
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(specs,1) LOOP
    IF specs[i][2] IS NULL THEN
      EXECUTE format(
        'CREATE TRIGGER trg_set_centro_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_centro_id()',
        specs[i][1]);
    ELSE
      EXECUTE format(
        'CREATE TRIGGER trg_set_centro_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_centro_id(%L, %L)',
        specs[i][1], specs[i][2], specs[i][3]);
    END IF;
  END LOOP;
END $do$;

-- =====================================================================
-- FASE 2: RLS por centro en todas las tablas
-- =====================================================================
DO $do$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'bonos_catalogo','center_config','client_bonos','client_events','client_invitations',
    'clients','group_members','group_schedules','groups','invoices',
    'modalidades','service_slot_instances','service_slots','servicios',
    'sessions','slot_structures','special_days','trainers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (centro_id = public.get_my_centro_id() OR public.is_superadmin())$f$, t || '_select_centro', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (centro_id = public.get_my_centro_id())$f$, t || '_insert_centro', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (centro_id = public.get_my_centro_id())
      WITH CHECK (centro_id = public.get_my_centro_id())$f$, t || '_update_centro', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (centro_id = public.get_my_centro_id())$f$, t || '_delete_centro', t);
  END LOOP;
END $do$;

-- centros: lectura del propio centro; escritura solo superadmin
CREATE POLICY centros_select ON public.centros FOR SELECT TO authenticated
  USING (id = public.get_my_centro_id() OR public.is_superadmin());
CREATE POLICY centros_insert ON public.centros FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY centros_update ON public.centros FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY centros_delete ON public.centros FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- client_profiles
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='client_profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.client_profiles', p.policyname);
  END LOOP;
END $do$;

CREATE POLICY client_profiles_select ON public.client_profiles FOR SELECT TO authenticated
  USING (
    (auth.uid() = id AND centro_id IS NOT NULL)
    OR (centro_id = public.get_my_centro_id() AND public.has_role(auth.uid(), 'admin'))
    OR public.is_superadmin()
  );
CREATE POLICY client_profiles_insert ON public.client_profiles FOR INSERT TO authenticated
  WITH CHECK (centro_id = public.get_my_centro_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY client_profiles_update ON public.client_profiles FOR UPDATE TO authenticated
  USING (centro_id = public.get_my_centro_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (centro_id = public.get_my_centro_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY client_profiles_delete ON public.client_profiles FOR DELETE TO authenticated
  USING (centro_id = public.get_my_centro_id() AND public.has_role(auth.uid(), 'admin'));

-- notificaciones
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='notificaciones' LOOP
    EXECUTE format('DROP POLICY %I ON public.notificaciones', p.policyname);
  END LOOP;
END $do$;

CREATE POLICY notificaciones_select ON public.notificaciones FOR SELECT TO authenticated
  USING (
    (centro_id = public.get_my_centro_id()
      AND (user_id = auth.uid() OR (target_role IS NOT NULL AND public.has_role(auth.uid(), target_role))))
    OR public.is_superadmin()
  );
CREATE POLICY notificaciones_update ON public.notificaciones FOR UPDATE TO authenticated
  USING (centro_id = public.get_my_centro_id()
    AND (user_id = auth.uid() OR (target_role IS NOT NULL AND public.has_role(auth.uid(), target_role))))
  WITH CHECK (centro_id = public.get_my_centro_id()
    AND (user_id = auth.uid() OR (target_role IS NOT NULL AND public.has_role(auth.uid(), target_role))));

-- user_roles: lectura propia / del centro; escritura solo superadmin
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' LOOP
    EXECUTE format('DROP POLICY %I ON public.user_roles', p.policyname);
  END LOOP;
END $do$;

CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (centro_id IS NOT NULL AND centro_id = public.get_my_centro_id() AND public.has_role(auth.uid(), 'admin'))
    OR public.is_superadmin()
  );
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- =====================================================================
-- Funciones existentes: acotar al centro del usuario
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_center_nombre()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(c.nombre), ''), 'Tracli')
  FROM public.center_config c
  WHERE c.centro_id = public.get_my_centro_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_aviso_umbral()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((avisos->>'umbral_sesiones')::int, 1)
  FROM public.center_config
  WHERE centro_id = public.get_my_centro_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.session_servicio_slug(p_group_id uuid, p_ocupacion integer, p_servicio text, p_centro uuid DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(btrim(COALESCE(p_servicio, '')), ''),
    CASE WHEN p_group_id IS NOT NULL OR COALESCE(p_ocupacion, 1) = 2
      THEN COALESCE((SELECT slug FROM public.servicios
                     WHERE slug ILIKE '%grupo%' AND (p_centro IS NULL OR centro_id = p_centro)
                     ORDER BY orden LIMIT 1), 'grupos')
      ELSE COALESCE((SELECT slug FROM public.servicios
                     WHERE slug NOT ILIKE '%grupo%' AND (p_centro IS NULL OR centro_id = p_centro)
                     ORDER BY orden LIMIT 1), 'personal')
    END
  )
$$;

-- notify_client_bono_changes: leer la config del centro del bono
CREATE OR REPLACE FUNCTION public.notify_client_bono_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  v_umbral int;
  v_avisar_renov boolean;
  v_nombre text;
BEGIN
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_user FROM public.client_profiles
  WHERE client_id = NEW.client_id AND activo = true
  ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE((avisos->>'umbral_sesiones')::int, 1),
         COALESCE((avisos->>'avisar_renovacion')::boolean, true)
    INTO v_umbral, v_avisar_renov
  FROM public.center_config WHERE centro_id = NEW.centro_id;
  v_umbral := COALESCE(v_umbral, 1);

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(v_avisar_renov, true) AND NEW.sesiones_disponibles > 0 THEN
      SELECT nombre INTO v_nombre FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
      INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje, centro_id)
      VALUES (v_user, 'bono_renovado', 'Bono renovado',
        'Se han añadido ' || NEW.sesiones_disponibles || ' sesiones' || COALESCE(' · ' || v_nombre, ''),
        NEW.centro_id);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.sesiones_disponibles < OLD.sesiones_disponibles
     AND NEW.sesiones_disponibles <= v_umbral THEN
    INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje, centro_id)
    VALUES (v_user, 'bono_pocas_sesiones', 'Te quedan pocas sesiones',
      CASE
        WHEN NEW.sesiones_disponibles = 1 THEN 'Te queda 1 sesión disponible en tu bono'
        WHEN NEW.sesiones_disponibles <= 0 THEN 'No te quedan sesiones disponibles en tu bono'
        ELSE 'Te quedan ' || NEW.sesiones_disponibles || ' sesiones disponibles en tu bono'
      END, NEW.centro_id);
  ELSIF NEW.sesiones_disponibles > OLD.sesiones_disponibles + 1
        AND COALESCE(v_avisar_renov, true) THEN
    INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje, centro_id)
    VALUES (v_user, 'bono_renovado', 'Bono renovado',
      'Se han añadido ' || (NEW.sesiones_disponibles - OLD.sesiones_disponibles) || ' sesiones a tu bono',
      NEW.centro_id);
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_bonos_caducados()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  r record;
  v_user uuid;
BEGIN
  FOR r IN
    SELECT cb.id, cb.client_id, cb.centro_id, cb.fecha_caducidad,
           COALESCE(bc.nombre, cb.ultimo_bono_nombre) AS nombre
    FROM public.client_bonos cb
    LEFT JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
    WHERE cb.activo AND cb.fecha_caducidad IS NOT NULL
      AND cb.fecha_caducidad < CURRENT_DATE AND cb.caducidad_avisada = false
  LOOP
    UPDATE public.client_bonos SET caducidad_avisada = true WHERE id = r.id;
    v_count := v_count + 1;

    SELECT id INTO v_user FROM public.client_profiles
    WHERE client_id = r.client_id AND activo = true
    ORDER BY created_at DESC LIMIT 1;

    IF v_user IS NOT NULL THEN
      INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje, centro_id)
      VALUES (v_user, 'bono_caducado', 'Tu bono ha caducado',
        COALESCE(r.nombre, 'Tu bono') || ' caducó el ' || to_char(r.fecha_caducidad, 'DD/MM/YYYY') ||
        '. Renueva para seguir reservando sesiones.', r.centro_id);
    END IF;
  END LOOP;

  RETURN v_count;
END $$;

-- set_client_bono_servicio / set_session_modalidad: acotar por centro
CREATE OR REPLACE FUNCTION public.set_client_bono_servicio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_slug text; v_tipo text; v_modalidad text;
BEGIN
  IF NEW.bono_catalogo_id IS NOT NULL THEN
    SELECT servicio_slug, tipo, modalidad INTO v_slug, v_tipo, v_modalidad
    FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  END IF;
  IF v_slug IS NULL THEN
    v_slug := COALESCE(
      NULLIF(btrim(COALESCE(NEW.servicio_slug, '')), ''),
      (SELECT slug FROM public.servicios
        WHERE slug NOT ILIKE '%grupo%' AND centro_id = NEW.centro_id ORDER BY orden LIMIT 1),
      'personal'
    );
  END IF;
  IF v_tipo IS NULL THEN
    v_tipo := NULLIF(btrim(COALESCE(NEW.tipo, '')), '');
  END IF;
  IF v_tipo IS NULL THEN
    v_tipo := CASE
      WHEN public.is_generic_pass_client((SELECT nombre FROM public.clients WHERE id = NEW.client_id)) THEN 'gympass'
      WHEN v_slug ILIKE '%grup%' THEN 'grupal'
      ELSE 'individual'
    END;
  END IF;
  NEW.servicio_slug := v_slug;
  NEW.tipo := v_tipo;
  NEW.modalidad := COALESCE(NULLIF(btrim(COALESCE(NEW.modalidad, '')), ''), v_modalidad);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_session_modalidad()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_servicio text; v_modalidad text;
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.modalidad, '')), '') IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;
  v_servicio := public.session_servicio_slug(NEW.group_id, NEW.ocupacion, NEW.servicio_slug, NEW.centro_id);
  SELECT cb.modalidad INTO v_modalidad
  FROM public.client_bonos cb
  WHERE cb.client_id = NEW.client_id AND cb.activo
    AND cb.servicio_slug = v_servicio AND cb.modalidad IS NOT NULL
  ORDER BY cb.created_at DESC LIMIT 1;
  NEW.modalidad := v_modalidad;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_prueba_bono(p_client uuid, p_fecha date)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_cat uuid; v_centro uuid;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM public.client_bonos WHERE client_id = p_client) THEN RETURN; END IF;
  SELECT centro_id INTO v_centro FROM public.clients WHERE id = p_client;
  SELECT id INTO v_cat FROM public.bonos_catalogo
    WHERE tipo = 'prueba' AND centro_id = v_centro ORDER BY orden LIMIT 1;
  IF v_cat IS NULL THEN RETURN; END IF;
  INSERT INTO public.client_bonos(
    client_id, bono_catalogo_id, fecha_inicio, sesiones_disponibles, sesiones_realizadas,
    activo, ultimo_bono_nombre, ultimo_bono_fecha, centro_id
  ) VALUES (p_client, v_cat, p_fecha, 1, 0, true, 'Prueba', p_fecha, v_centro);
END $$;

-- Los triggers que insertan filas derivadas heredan el centro de la fila origen
CREATE OR REPLACE FUNCTION public.apply_invoice_row(p_client uuid, p_bono_cat uuid, p_fecha date, p_sesiones_override integer DEFAULT NULL::integer)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_sesiones int; v_nombre text; v_tipo text; v_centro uuid;
BEGIN
  SELECT sesiones_incluidas, nombre, tipo, centro_id INTO v_sesiones, v_nombre, v_tipo, v_centro
  FROM public.bonos_catalogo WHERE id = p_bono_cat;
  IF v_tipo = 'prueba' THEN RETURN; END IF;
  IF v_centro IS NULL THEN
    SELECT centro_id INTO v_centro FROM public.clients WHERE id = p_client;
  END IF;
  v_sesiones := COALESCE(p_sesiones_override, v_sesiones);
  INSERT INTO public.client_bonos(
    client_id, bono_catalogo_id, fecha_inicio, sesiones_disponibles, sesiones_realizadas,
    activo, ultimo_bono_nombre, ultimo_bono_fecha, centro_id
  ) VALUES (p_client, p_bono_cat, p_fecha, COALESCE(v_sesiones, 0), 0, true, v_nombre, p_fecha, v_centro);
END $$;

CREATE OR REPLACE FUNCTION public.log_client_alta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_tipo text; v_name text; v_has_prev_bono boolean;
BEGIN
  IF NEW.bono_catalogo_id IS NULL THEN RETURN NEW; END IF;
  SELECT tipo INTO v_tipo FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
  IF v_tipo IS NULL OR v_tipo = 'prueba' THEN RETURN NEW; END IF;
  IF v_tipo NOT IN ('individual','pareja','grupal') THEN RETURN NEW; END IF;
  SELECT nombre INTO v_name FROM public.clients WHERE id = NEW.client_id;
  IF public.is_generic_pass_client(COALESCE(v_name,'')) THEN RETURN NEW; END IF;
  SELECT EXISTS(SELECT 1 FROM public.client_bonos WHERE client_id = NEW.client_id AND id <> NEW.id)
    INTO v_has_prev_bono;
  IF v_has_prev_bono THEN RETURN NEW; END IF;
  INSERT INTO public.client_events(client_id, tipo, fecha, centro_id)
  VALUES (NEW.client_id, 'alta', NEW.fecha_inicio, NEW.centro_id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.log_client_baja()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.activo = true AND NEW.activo = false THEN
    INSERT INTO public.client_events(client_id, tipo, fecha, centro_id)
    VALUES (NEW.id, 'baja', CURRENT_DATE, NEW.centro_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.session_apply_realizada()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_bono uuid; v_servicio text; v_rest int;
  old_counted boolean := false; new_counted boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_counted := OLD.estado = 'realizada'
      OR (OLD.estado = 'cancelada' AND COALESCE(OLD.no_contabilizar, false) = false);
  END IF;
  new_counted := NEW.estado = 'realizada'
    OR (NEW.estado = 'cancelada' AND COALESCE(NEW.no_contabilizar, false) = false);

  v_servicio := public.session_servicio_slug(NEW.group_id, NEW.ocupacion, NEW.servicio_slug, NEW.centro_id);

  IF new_counted AND NOT old_counted AND NEW.client_id IS NOT NULL THEN
    v_bono := public.pick_bono_for_session(NEW.client_id, v_servicio, false);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles - 1,
          sesiones_realizadas = sesiones_realizadas + 1
      WHERE id = v_bono
      RETURNING sesiones_disponibles INTO v_rest;
    ELSE
      INSERT INTO public.client_bonos(
        client_id, bono_catalogo_id, fecha_inicio, sesiones_disponibles, sesiones_realizadas,
        activo, ultimo_bono_nombre, ultimo_bono_fecha, servicio_slug, centro_id
      ) VALUES (NEW.client_id, NULL, NEW.fecha, 0, 1, true, NULL, NEW.fecha, v_servicio, NEW.centro_id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND old_counted AND NOT new_counted AND OLD.client_id IS NOT NULL THEN
    v_bono := public.pick_bono_for_session(OLD.client_id, v_servicio, true);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0)
      WHERE id = v_bono;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.session_restore_on_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_bono uuid; v_servicio text; was_counted boolean := false;
BEGIN
  was_counted := OLD.estado = 'realizada'
    OR (OLD.estado = 'cancelada' AND COALESCE(OLD.no_contabilizar, false) = false);
  IF was_counted AND OLD.client_id IS NOT NULL THEN
    v_servicio := public.session_servicio_slug(OLD.group_id, OLD.ocupacion, OLD.servicio_slug, OLD.centro_id);
    v_bono := public.pick_bono_for_session(OLD.client_id, v_servicio, true);
    IF v_bono IS NOT NULL THEN
      UPDATE public.client_bonos
      SET sesiones_disponibles = sesiones_disponibles + 1,
          sesiones_realizadas = GREATEST(sesiones_realizadas - 1, 0),
          activo = CASE WHEN sesiones_disponibles + 1 > 0 THEN true ELSE activo END
      WHERE id = v_bono;
    END IF;
  END IF;
  RETURN OLD;
END $$;
