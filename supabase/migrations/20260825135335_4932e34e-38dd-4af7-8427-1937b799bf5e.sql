CREATE OR REPLACE FUNCTION public.get_aviso_umbral()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((avisos->>'umbral_sesiones')::int, 1) FROM public.center_config WHERE id = true
$function$;

CREATE OR REPLACE FUNCTION public.notify_client_bono_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  FROM public.center_config WHERE id = true;
  v_umbral := COALESCE(v_umbral, 1);

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(v_avisar_renov, true) AND NEW.sesiones_disponibles > 0 THEN
      SELECT nombre INTO v_nombre FROM public.bonos_catalogo WHERE id = NEW.bono_catalogo_id;
      INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje)
      VALUES (
        v_user, 'bono_renovado', 'Bono renovado',
        'Se han añadido ' || NEW.sesiones_disponibles || ' sesiones' ||
        COALESCE(' · ' || v_nombre, '')
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.sesiones_disponibles < OLD.sesiones_disponibles
     AND NEW.sesiones_disponibles <= v_umbral THEN
    INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje)
    VALUES (
      v_user, 'bono_pocas_sesiones', 'Te quedan pocas sesiones',
      CASE
        WHEN NEW.sesiones_disponibles = 1 THEN 'Te queda 1 sesión disponible en tu bono'
        WHEN NEW.sesiones_disponibles <= 0 THEN 'No te quedan sesiones disponibles en tu bono'
        ELSE 'Te quedan ' || NEW.sesiones_disponibles || ' sesiones disponibles en tu bono'
      END
    );
  ELSIF NEW.sesiones_disponibles > OLD.sesiones_disponibles + 1
        AND COALESCE(v_avisar_renov, true) THEN
    INSERT INTO public.notificaciones(user_id, tipo, titulo, mensaje)
    VALUES (
      v_user, 'bono_renovado', 'Bono renovado',
      'Se han añadido ' || (NEW.sesiones_disponibles - OLD.sesiones_disponibles) || ' sesiones a tu bono'
    );
  END IF;

  RETURN NEW;
END $function$;