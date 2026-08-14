import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Trainer = Database["public"]["Tables"]["trainers"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type BonoCatalogo = Database["public"]["Tables"]["bonos_catalogo"]["Row"];
export type ClientBono = Database["public"]["Tables"]["client_bonos"]["Row"];
export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type Group = Database["public"]["Tables"]["groups"]["Row"];
export type GroupSchedule = Database["public"]["Tables"]["group_schedules"]["Row"];
export type GroupMember = Database["public"]["Tables"]["group_members"]["Row"];
export type SesionEstado = Database["public"]["Enums"]["sesion_estado"];
// `bono_tipo` era un enum; ahora es texto libre para permitir crear tipos nuevos
// desde Configuración. Mantenemos el alias por compatibilidad.
export type BonoTipo = string;

export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
export const DIAS_SEMANA_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

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

/** Devuelve el estado que debe usarse para pintar la sesión.
 * Una sesión de prueba siempre conserva el color de prueba aunque su estado administrativo sea realizado/cancelado. */
export function colorEstadoFor(session: { estado: SesionEstado; tipo?: string | null }): SesionEstado {
  return session.tipo === "prueba" ? "prueba" : session.estado;
}

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

/** Ordena catálogo por el `orden` configurado en Configuración del centro. */
export function sortCatalogo<T extends { orden: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.orden - b.orden);
}

/** Etiqueta legible para un tipo de bono (soporta tipos creados por el usuario). */
export function formatTipoBono(tipo?: string | null): string {
  if (!tipo) return "";
  const known: Record<string, string> = {
    individual: "Individual",
    pareja: "Pareja",
    grupal: "Grupal",
    gympass: "Gympass",
    prueba: "Prueba",
  };
  if (known[tipo]) return known[tipo];
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}
