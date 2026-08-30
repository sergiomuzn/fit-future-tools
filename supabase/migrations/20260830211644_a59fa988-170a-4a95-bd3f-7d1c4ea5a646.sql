UPDATE public.sessions s
SET group_id = NULL,
    titulo = (SELECT sv.nombre FROM public.servicios sv WHERE sv.slug = s.servicio_slug)
WHERE s.ocupacion = 2;

DELETE FROM public.group_members;
DELETE FROM public.group_schedules;
DELETE FROM public.groups;