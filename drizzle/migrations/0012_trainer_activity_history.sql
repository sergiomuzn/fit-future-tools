CREATE TABLE public.trainer_activity_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
 centro_id uuid NOT NULL REFERENCES public.centros(id),
 activo boolean NOT NULL,
 effective_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trainer_activity_history TO authenticated;
GRANT ALL ON public.trainer_activity_history TO service_role;
ALTER TABLE public.trainer_activity_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY trainer_activity_history_select_centro ON public.trainer_activity_history FOR SELECT TO authenticated USING (centro_id = public.get_my_centro_id() OR public.is_superadmin());
CREATE INDEX trainer_activity_history_period_idx ON public.trainer_activity_history(trainer_id, effective_at);
INSERT INTO public.trainer_activity_history(trainer_id, centro_id, activo, effective_at) SELECT id, centro_id, activo, now() FROM public.trainers;
CREATE FUNCTION public.record_trainer_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  INSERT INTO public.trainer_activity_history(trainer_id, centro_id, activo) VALUES (NEW.id, NEW.centro_id, NEW.activo);
 ELSIF OLD.activo IS DISTINCT FROM NEW.activo THEN
  INSERT INTO public.trainer_activity_history(trainer_id, centro_id, activo) VALUES (NEW.id, NEW.centro_id, NEW.activo);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_trainer_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trainers_record_activity AFTER INSERT OR UPDATE OF activo ON public.trainers FOR EACH ROW EXECUTE FUNCTION public.record_trainer_activity();