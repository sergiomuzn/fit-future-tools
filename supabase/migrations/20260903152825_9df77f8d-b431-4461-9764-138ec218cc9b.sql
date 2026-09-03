ALTER TABLE public.bonos_catalogo DROP CONSTRAINT IF EXISTS bonos_catalogo_caducidad_tipo_chk;
ALTER TABLE public.bonos_catalogo ADD CONSTRAINT bonos_catalogo_caducidad_tipo_chk
  CHECK (caducidad_tipo IS NULL OR caducidad_tipo = ANY (ARRAY['dias','meses','fin_mes','fin_ano']));