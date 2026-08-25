import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export * from "./slot-propagation-core";
import { parsePropagacionSemanas, type SlotInstance } from "./slot-propagation-core";

/* ------------------------------------------------------------------ */
/* Configuración de propagación automática                             */
/* ------------------------------------------------------------------ */

export function parsePropagacionAuto(v: unknown): boolean {
  return v === true;
}

export function usePropagacionAuto() {
  return useQuery({
    queryKey: ["propagacion-auto"],
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from("center_config")
        .select("avisos")
        .eq("id", true)
        .maybeSingle();
      const avisos = (data?.avisos ?? {}) as { propagacion_auto?: unknown };
      return parsePropagacionAuto(avisos.propagacion_auto);
    },
    staleTime: 30_000,
  });
}

/** Nº de semanas por delante que genera la propagación automática. */
export function usePropagacionSemanas() {
  return useQuery({
    queryKey: ["propagacion-semanas"],
    queryFn: async (): Promise<number> => {
      const { data } = await supabase
        .from("center_config")
        .select("avisos")
        .eq("id", true)
        .maybeSingle();
      const avisos = (data?.avisos ?? {}) as { propagacion_semanas?: unknown };
      return parsePropagacionSemanas(avisos.propagacion_semanas);
    },
    staleTime: 30_000,
  });
}

/** Instancias propagadas en un rango de fechas (vista de administrador). */
export function useSlotInstances(from: string, to: string) {
  return useQuery({
    queryKey: ["service_slot_instances", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_slot_instances")
        .select("id,service_slot_id,servicio_slug,fecha,hora_inicio,hora_fin,capacidad,trainer_id,activo,origen")
        .gte("fecha", from)
        .lte("fecha", to)
        .order("fecha")
        .order("hora_inicio");
      if (error) throw error;
      return (data ?? []) as SlotInstance[];
    },
  });
}
