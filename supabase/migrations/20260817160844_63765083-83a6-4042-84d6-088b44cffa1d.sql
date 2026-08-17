ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS sexo text;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_sexo_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_sexo_check CHECK (sexo IS NULL OR sexo IN ('hombre','mujer'));