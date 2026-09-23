CREATE TABLE public.client_notif_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  centro_id uuid REFERENCES public.centros(id),
  email_activo boolean NOT NULL DEFAULT true,
  tipos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notif_prefs TO authenticated;
GRANT ALL ON public.client_notif_prefs TO service_role;

ALTER TABLE public.client_notif_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prefs select" ON public.client_notif_prefs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.client_notif_prefs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.client_notif_prefs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs delete" ON public.client_notif_prefs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER client_notif_prefs_touch
  BEFORE UPDATE ON public.client_notif_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.notificaciones
  ADD COLUMN email_enviado boolean NOT NULL DEFAULT false;

CREATE INDEX idx_notificaciones_email_pendiente
  ON public.notificaciones (created_at)
  WHERE email_enviado = false AND user_id IS NOT NULL;