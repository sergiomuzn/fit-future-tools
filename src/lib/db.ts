import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Trainer = Database["public"]["Tables"]["trainers"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type BonoCatalogo = Database["public"]["Tables"]["bonos_catalogo"]["Row"];
export type ClientBono = Database["public"]["Tables"]["client_bonos"]["Row"];
export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type SesionEstado = Database["public"]["Enums"]["sesion_estado"];
export type BonoTipo = Database["public"]["Enums"]["bono_tipo"];

export { supabase };

export const ESTADO_LABEL: Record<SesionEstado, string> = {
  reservada: "Reservada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  prueba: "Prueba",
  renovacion: "Renovación",
};

export const ESTADO_BG: Record<SesionEstado, string> = {
  reservada: "bg-state-reservada text-state-reservada-fg",
  realizada: "bg-state-realizada text-state-realizada-fg",
  cancelada: "bg-state-cancelada text-state-cancelada-fg",
  prueba: "bg-state-prueba text-state-prueba-fg",
  renovacion: "bg-state-renovacion text-state-renovacion-fg",
};

export function turnoFromHora(hora: string): "manana" | "tarde" {
  const [h] = hora.split(":").map(Number);
  return h < 14 ? "manana" : "tarde";
}

/** Quita el prefijo "Bono" del nombre para mostrar. */
export function prettyBonoNombre(nombre?: string | null): string {
  if (!nombre) return "—";
  return nombre
    .replace(/^\s*bono\s+/i, "")
    .replace(/^10\s+(45|60)'/, "10 ses $1'")
    .trim();
}

/** Ordena catálogo: por tipo (prueba, individual, pareja, grupal), luego duración (45 antes que 60), luego orden. */
export function sortCatalogo<T extends { tipo: BonoTipo; duracion_min: number | null; orden: number }>(items: T[]): T[] {
  const tipoRank = { prueba: 0, individual: 1, pareja: 2, grupal: 3, gympass: 4 } as Record<string, number>;
  return [...items].sort((a, b) => {
    if (a.tipo !== b.tipo) return (tipoRank[a.tipo] ?? 99) - (tipoRank[b.tipo] ?? 99);
    const da = a.duracion_min ?? 9999;
    const db = b.duracion_min ?? 9999;
    if (da !== db) return da - db;
    return a.orden - b.orden;
  });
}
