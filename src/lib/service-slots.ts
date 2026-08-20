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
  /** Entrenador asignado (opcional, puede quedar vacío). */
  trainer_id: string | null;
}

/** Plantilla de hueco usada al copiar días o guardar estructuras. */
export interface SlotTemplate {
  servicio_slug: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  trainer_id: string | null;
}

export interface SlotStructure {
  id: string;
  nombre: string;
  slots: SlotTemplate[];
  created_at: string;
}

/** Orden de días para vista semanal (lunes → domingo). */
export const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0] as const;

export const DIA_NOMBRE: Record<number, string> = {
  1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 0: "Domingo",
};

export function hhmm(t: string): string {
  return t.slice(0, 5);
}

const SLOT_COLS = "id,servicio_slug,dia_semana,hora_inicio,hora_fin,capacidad,activo,nota,trainer_id";

export function useServiceSlots(servicioSlugs?: string[]) {
  return useQuery({
    queryKey: ["service_slots", servicioSlugs?.slice().sort().join(",") ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("service_slots")
        .select(SLOT_COLS)
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

export function useSlotStructures() {
  return useQuery({
    queryKey: ["slot_structures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_structures")
        .select("id,nombre,slots,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SlotStructure[];
    },
  });
}
