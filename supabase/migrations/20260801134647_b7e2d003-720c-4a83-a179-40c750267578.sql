CREATE TABLE public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role public.app_role,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensaje text NOT NULL,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_target_chk CHECK (user_id IS NOT NULL OR target_role IS NOT NULL)
);

GRANT SELECT, UPDATE ON public.notificaciones TO authenticated;
GRANT ALL ON public.notificaciones TO service_role;

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver mis notificaciones" ON public.notificaciones
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR (target_role IS NOT NULL AND public.has_role(auth.uid(), target_role)));

CREATE POLICY "Marcar mis notificaciones" ON public.notificaciones
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR (target_role IS NOT NULL AND public.has_role(auth.uid(), target_role)))
WITH CHECK (user_id = auth.uid() OR (target_role IS NOT NULL AND public.has_role(auth.uid(), target_role)));

CREATE INDEX notificaciones_user_idx ON public.notificaciones (user_id, created_at DESC);
CREATE INDEX notificaciones_role_idx ON public.notificaciones (target_role, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;