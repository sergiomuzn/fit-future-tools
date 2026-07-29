CREATE OR REPLACE FUNCTION public.auto_deactivate_prueba_clients(p_dias integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  WITH candidates AS (
    SELECT c.id FROM public.clients c
    WHERE c.activo = true
      AND EXISTS(
        SELECT 1 FROM public.client_bonos cb
        JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
        WHERE cb.client_id = c.id AND bc.tipo = 'prueba' AND cb.activo = true
          AND cb.fecha_inicio < CURRENT_DATE - (GREATEST(p_dias, 0) || ' days')::interval
      )
      AND NOT EXISTS(
        SELECT 1 FROM public.client_bonos cb
        JOIN public.bonos_catalogo bc ON bc.id = cb.bono_catalogo_id
        WHERE cb.client_id = c.id AND bc.tipo <> 'prueba'
      )
  )
  UPDATE public.clients SET activo = false
  WHERE id IN (SELECT id FROM candidates);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.auto_deactivate_prueba_clients(integer) TO authenticated, service_role;