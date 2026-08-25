ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS capacidad_default integer NOT NULL DEFAULT 1;

ALTER TABLE public.servicios
  ADD CONSTRAINT servicios_capacidad_default_pos CHECK (capacidad_default >= 1);