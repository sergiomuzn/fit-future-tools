DROP INDEX IF EXISTS public.service_slot_instances_unique;
CREATE UNIQUE INDEX IF NOT EXISTS service_slot_instances_slot_fecha_unique
  ON public.service_slot_instances (service_slot_id, fecha);