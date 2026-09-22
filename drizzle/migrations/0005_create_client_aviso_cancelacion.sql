CREATE TABLE public.client_aviso_cancelacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  servicio_slug text NOT NULL,
  cancelacion_min integer NOT NULL,
  centro_id uuid REFERENCES public.centros(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, servicio_slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_aviso_cancelacion TO authenticated;
GRANT ALL ON public.client_aviso_cancelacion TO service_role;

ALTER TABLE public.client_aviso_cancelacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cliente ve sus avisos"
ON public.client_aviso_cancelacion FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Cliente crea sus avisos"
ON public.client_aviso_cancelacion FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Cliente actualiza sus avisos"
ON public.client_aviso_cancelacion FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Cliente borra sus avisos"
ON public.client_aviso_cancelacion FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_client_aviso_cancelacion_touch
BEFORE UPDATE ON public.client_aviso_cancelacion
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();