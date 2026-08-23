import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Modos de funcionamiento de la agenda de reservas. */
export type BookingMode = "independiente" | "adaptativa" | "compactacion";

export const DEFAULT_BOOKING_MODE: BookingMode = "independiente";

export const BOOKING_MODES: { value: BookingMode; label: string; description: string }[] = [
  {
    value: "independiente",
    label: "Estructura independiente",
    description:
      "Los huecos de reserva son independientes de la agenda manual. Tú controlas los conflictos manualmente.",
  },
  {
    value: "adaptativa",
    label: "Estructura adaptativa",
    description:
      "Los huecos se desactivan automáticamente cuando hay conflicto con una sesión manual.",
  },
  {
    value: "compactacion",
    label: "Compactación inteligente",
    description:
      "Solo se ofrecen huecos adyacentes a sesiones existentes para optimizar el horario del entrenador.",
  },
];

export function bookingModeInfo(modo: BookingMode | string | null | undefined) {
  return BOOKING_MODES.find((m) => m.value === modo) ?? BOOKING_MODES[0];
}

export function parseBookingMode(v: unknown): BookingMode {
  return BOOKING_MODES.some((m) => m.value === v) ? (v as BookingMode) : DEFAULT_BOOKING_MODE;
}

/** Modo activo leído de la configuración del centro (se refresca al guardar). */
export function useBookingMode() {
  return useQuery({
    queryKey: ["booking-mode"],
    queryFn: async (): Promise<BookingMode> => {
      const { data } = await supabase
        .from("center_config")
        .select("avisos")
        .eq("id", true)
        .maybeSingle();
      const avisos = (data?.avisos ?? {}) as { modo_reservas?: string };
      return parseBookingMode(avisos.modo_reservas);
    },
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/* Lógica pura (compartida cliente/servidor)                           */
/* ------------------------------------------------------------------ */

export interface TimeRange {
  inicio: string; // HH:MM[:SS]
  fin: string;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return toMinutes(a.inicio) < toMinutes(b.fin) && toMinutes(b.inicio) < toMinutes(a.fin);
}

/** Un hueco es adyacente si empieza justo al terminar una sesión o termina justo al empezar otra. */
export function isAdjacent(slot: TimeRange, sessions: TimeRange[]): boolean {
  return sessions.some(
    (s) => toMinutes(slot.inicio) === toMinutes(s.fin) || toMinutes(slot.fin) === toMinutes(s.inicio),
  );
}

/**
 * Aplica el modo de reservas a un hueco dado el conjunto de sesiones de ese día.
 * Devuelve true si el hueco debe mostrarse al cliente.
 */
export function slotVisibleForMode(
  slot: TimeRange,
  sesionesDelDia: TimeRange[],
  modo: BookingMode,
): boolean {
  if (modo === "independiente") return true;
  if (sesionesDelDia.some((s) => overlaps(slot, s))) return false; // Modo B y C
  if (modo === "adaptativa") return true;
  // Modo C: sin sesiones ese día se muestran todos; si las hay, sólo adyacentes.
  if (sesionesDelDia.length === 0) return true;
  return isAdjacent(slot, sesionesDelDia);
}
