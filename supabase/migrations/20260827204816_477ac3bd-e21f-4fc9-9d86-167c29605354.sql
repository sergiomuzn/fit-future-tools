ALTER TABLE public.client_bonos DROP CONSTRAINT IF EXISTS client_bonos_bono_catalogo_id_fkey;
ALTER TABLE public.client_bonos
  ADD CONSTRAINT client_bonos_bono_catalogo_id_fkey
  FOREIGN KEY (bono_catalogo_id) REFERENCES public.bonos_catalogo(id) ON DELETE SET NULL;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_bono_catalogo_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_bono_catalogo_id_fkey
  FOREIGN KEY (bono_catalogo_id) REFERENCES public.bonos_catalogo(id) ON DELETE SET NULL;