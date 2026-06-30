-- Remove legacy duplicate triggers that were causing session balances to be applied twice.
DROP TRIGGER IF EXISTS trg_session_apply_realizada ON public.sessions;
DROP TRIGGER IF EXISTS trg_session_restore_on_delete ON public.sessions;
DROP TRIGGER IF EXISTS trg_revert_invoice_bono ON public.invoices;

-- Ensure the canonical triggers exist exactly once.
DROP TRIGGER IF EXISTS trg_session_apply ON public.sessions;
CREATE TRIGGER trg_session_apply
AFTER INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.session_apply_realizada();

DROP TRIGGER IF EXISTS trg_session_restore ON public.sessions;
CREATE TRIGGER trg_session_restore
AFTER DELETE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.session_restore_on_delete();

DROP TRIGGER IF EXISTS trg_invoice_revert ON public.invoices;
CREATE TRIGGER trg_invoice_revert
AFTER DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.revert_invoice_bono();