DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'bonos_catalogo','center_config','client_bonos','client_events','client_invitations',
    'client_profiles','clients','group_members','group_schedules','groups','invoices',
    'modalidades','notificaciones','service_slot_instances','service_slots','servicios',
    'sessions','slot_structures','special_days','trainers','user_roles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN centro_id SET DEFAULT public.get_my_centro_id()', t);
  END LOOP;
END $do$;