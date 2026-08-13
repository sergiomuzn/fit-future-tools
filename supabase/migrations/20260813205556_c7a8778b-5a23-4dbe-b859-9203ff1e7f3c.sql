ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_invitations_client_id ON public.client_invitations(client_id);