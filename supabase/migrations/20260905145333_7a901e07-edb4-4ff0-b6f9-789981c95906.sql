UPDATE public.client_bonos cb
SET modalidad = bc.modalidad
FROM public.bonos_catalogo bc
WHERE cb.bono_catalogo_id = bc.id
  AND cb.modalidad IS NULL
  AND bc.modalidad IS NOT NULL;

UPDATE public.sessions s
SET modalidad = (
  SELECT cb.modalidad
  FROM public.client_bonos cb
  WHERE cb.client_id = s.client_id
    AND cb.servicio_slug = public.session_servicio_slug(s.group_id, s.ocupacion, s.servicio_slug)
    AND cb.modalidad IS NOT NULL
  ORDER BY (cb.fecha_inicio <= s.fecha) DESC, cb.fecha_inicio DESC
  LIMIT 1
)
WHERE s.modalidad IS NULL
  AND s.client_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.modalidades m
    WHERE m.servicio_slug = public.session_servicio_slug(s.group_id, s.ocupacion, s.servicio_slug)
  );