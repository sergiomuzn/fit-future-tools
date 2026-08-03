import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Servicio {
  id: string;
  slug: string;
  nombre: string;
  orden: number;
}

export function slugifyServicio(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function useServicios() {
  return useQuery({
    queryKey: ["servicios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicios")
        .select("id,slug,nombre,orden")
        .order("orden");
      if (error) throw error;
      return (data ?? []) as Servicio[];
    },
  });
}
