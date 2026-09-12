ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS session_id uuid;
CREATE INDEX IF NOT EXISTS notificaciones_session_id_idx ON public.notificaciones (session_id);