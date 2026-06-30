-- Attach triggers for invoices and sessions to keep client_bonos in sync.
DROP TRIGGER IF EXISTS trg_invoice_apply ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_reapply ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_revert ON public.invoices;
DROP TRIGGER IF EXISTS trg_session_apply ON public.sessions;
DROP TRIGGER IF EXISTS trg_session_restore ON public.sessions;
DROP TRIGGER IF EXISTS trg_invoices_touch ON public.invoices;
DROP TRIGGER IF EXISTS trg_sessions_touch ON public.sessions;
DROP TRIGGER IF EXISTS trg_client_bonos_touch ON public.client_bonos;

CREATE TRIGGER trg_invoice_apply
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_to_bono();

CREATE TRIGGER trg_invoice_reapply
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.reapply_invoice_on_update();

CREATE TRIGGER trg_invoice_revert
  AFTER DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.revert_invoice_bono();

CREATE TRIGGER trg_session_apply
  AFTER INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.session_apply_realizada();

CREATE TRIGGER trg_session_restore
  AFTER DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.session_restore_on_delete();

CREATE TRIGGER trg_invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_sessions_touch BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_client_bonos_touch BEFORE UPDATE ON public.client_bonos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();