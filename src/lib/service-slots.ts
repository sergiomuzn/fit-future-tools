import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServiceSlot {
  id: string;
  servicio_slug: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  activo: boolean;
  nota: string | null;
}

/** Orden de días para vista semanal (lunes → domingo). */
export const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0] as const;

export function hhmm(t: string): string {
  return t.slice(0, 5);
}

export function useServiceSlots(servicioSlugs?: string[]) {
  return useQuery({
    queryKey: ["service_slots", servicioSlugs?.slice().sort().join(",") ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("service_slots")
        .select("id,servicio_slug,dia_semana,hora_inicio,hora_fin,capacidad,activo,nota")
        .order("dia_semana")
        .order("hora_inicio");
      if (servicioSlugs && servicioSlugs.length > 0) q = q.in("servicio_slug", servicioSlugs);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ServiceSlot[];
    },
    enabled: servicioSlugs === undefined || servicioSlugs.length > 0,
  });
}