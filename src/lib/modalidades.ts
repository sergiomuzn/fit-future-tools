import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Modalidad opcional de un bono dentro de un servicio (p.ej. Individual / Pareja). */
export interface Modalidad {
  id: string;
  servicio_slug: string;
  nombre: string;
  orden: number;
}

/** Modalidades de un servicio concreto (o de todos si no se indica slug). */
export function useModalidades(servicioSlug?: string) {
  return useQuery({
    queryKey: ["modalidades", servicioSlug ?? "all"],
    queryFn: async () => {
      let q = supabase.from("modalidades").select("id,servicio_slug,nombre,orden").order("orden");
      if (servicioSlug) q = q.eq("servicio_slug", servicioSlug);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Modalidad[];
    },
  });
}

/** Valor especial usado en los selectores para "sin modalidad". */
export const MODALIDAD_NONE = "__none__";
