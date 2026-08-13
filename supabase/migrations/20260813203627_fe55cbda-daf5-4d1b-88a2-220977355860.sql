DROP POLICY "Autenticados pueden crear servicios" ON public.servicios;
DROP POLICY "Autenticados pueden editar servicios" ON public.servicios;
DROP POLICY "Autenticados pueden borrar servicios" ON public.servicios;

CREATE POLICY "servicios insert admin" ON public.servicios FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "servicios update admin" ON public.servicios FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "servicios delete admin" ON public.servicios FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));