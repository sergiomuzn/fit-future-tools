import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Servicio {
  id: string;
  slug: string;
  nombre: string;
  orden: number;
  /** Plazas por sesión que se ofertan por defecto en agenda y reservas. */
  capacidad_default: number;
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
        .select("id,slug,nombre,orden,capacidad_default")
        .order("orden");
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        capacidad_default: Math.max(1, (s as { capacidad_default?: number }).capacidad_default ?? 1),
      })) as Servicio[];
    },
  });
}

/** Capacidad por defecto configurada para un servicio (1 si no se conoce). */
export function capacidadDeServicio(servicios: Servicio[], slug?: string | null): number {
  if (!slug) return 1;
  const s = servicios.find((x) => x.slug === slug);
  return Math.max(1, s?.capacidad_default ?? 1);
}
