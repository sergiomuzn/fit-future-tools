CREATE TABLE public.reserva_cola (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id uuid NOT NULL REFERENCES public.centros(id),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  clave text NOT NULL,
  servicio_slug text,
  group_id uuid,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  estado text NOT NULL DEFAULT 'en_cola',
  ofrecida_at timestamptz,
  expira_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reserva_cola_slot ON public.reserva_cola (centro_id, clave, estado, created_at);
CREATE INDEX idx_reserva_cola_user ON public.reserva_cola (user_id, estado);
CREATE UNIQUE INDEX uq_reserva_cola_activa ON public.reserva_cola (clave, user_id)
  WHERE estado IN ('en_cola', 'ofrecida');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reserva_cola TO authenticated;
GRANT ALL ON public.reserva_cola TO service_role;

ALTER TABLE public.reserva_cola ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cola_select_propia_o_centro" ON public.reserva_cola
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (centro_id = public.get_my_centro_id()
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'entrenador')))
    OR public.is_superadmin()
  );

CREATE POLICY "cola_insert_propia" ON public.reserva_cola
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND centro_id = public.get_my_centro_id());

CREATE POLICY "cola_update_propia_o_centro" ON public.reserva_cola
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (centro_id = public.get_my_centro_id()
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'entrenador')))
  );

CREATE POLICY "cola_delete_propia_o_centro" ON public.reserva_cola
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR (centro_id = public.get_my_centro_id()
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'entrenador')))
  );