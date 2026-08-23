import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Confirmación de reservas: cuando está activa, las reservas hechas desde el
 * rol de cliente quedan "pendientes" (por confirmar) hasta que el admin las
 * confirma o las cancela. Se puede limitar a servicios concretos.
 */
export interface ConfirmacionReservasConfig {
  activo: boolean;
  /** Slugs de servicio que requieren confirmación. Vacío = todos. */
  servicios: string[];
}

export const DEFAULT_CONFIRMACION_RESERVAS: ConfirmacionReservasConfig = {
  activo: false,
  servicios: [],
};

export function parseConfirmacionReservas(v: unknown): ConfirmacionReservasConfig {
  const o = (v ?? {}) as { activo?: unknown; servicios?: unknown };
  return {
    activo: o.activo === true,
    servicios: Array.isArray(o.servicios)
      ? o.servicios.filter((s): s is string => typeof s === "string")
      : [],
  };
}

/** ¿Una reserva de este servicio necesita confirmación del admin? */
export function requiereConfirmacion(
  cfg: ConfirmacionReservasConfig,
  servicioSlug: string | null | undefined,
): boolean {
  if (!cfg.activo) return false;
  if (cfg.servicios.length === 0) return true;
  return !!servicioSlug && cfg.servicios.includes(servicioSlug);
}

export function useConfirmacionReservas() {
  return useQuery({
    queryKey: ["confirmacion-reservas"],
    queryFn: async (): Promise<ConfirmacionReservasConfig> => {
      const { data } = await supabase
        .from("center_config")
        .select("avisos")
        .eq("id", true)
        .maybeSingle();
      const avisos = (data?.avisos ?? {}) as { confirmacion_reservas?: unknown };
      return parseConfirmacionReservas(avisos.confirmacion_reservas);
    },
    staleTime: 30_000,
  });
}
