import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cómo cuentan las sesiones canceladas como entrenamiento realizado
 * (estadísticas y sesiones por entrenador):
 *  - "segunNC": cuentan salvo las marcadas como "No contabilizar" (comportamiento clásico)
 *  - "siempre": todas las canceladas cuentan
 *  - "nunca": ninguna cancelada cuenta
 */
export type CanceladasModo = "segunNC" | "siempre" | "nunca";

export type BehaviorConfig = {
  autoCompletarIndividuales: boolean;
  autoCompletarGrupales: boolean;
  graciaAutoRealizadaMin: number;
  cancelacionDefaultNoContabilizar: boolean;
  canceladasCuentanModo: CanceladasModo;
  grupalesSinAsistentesCuentan: boolean;
  pruebaAutoInactivar: boolean;
  pruebaDiasInactivar: number;
  /** El cliente ve en su portal las sesiones canceladas */
  clienteVeCanceladas: boolean;
  /** Las canceladas marcadas "No contabilizar" suman al total de cancelaciones del cliente */
  canceladasNCSumanTotal: boolean;
  /** Ocultar en la tabla de Bonos los bonos sin sesiones restantes de clientes inactivos */
  ocultarBonosInactivosAgotados: boolean;
  /** Mostrar la abreviatura del servicio delante del nombre en los bloques de la agenda */
  mostrarAbreviaturaServicio: boolean;
};

export const DEFAULT_BEHAVIOR_CONFIG: BehaviorConfig = {
  autoCompletarIndividuales: true,
  autoCompletarGrupales: true,
  graciaAutoRealizadaMin: 15,
  cancelacionDefaultNoContabilizar: false,
  canceladasCuentanModo: "segunNC",
  grupalesSinAsistentesCuentan: true,
  pruebaAutoInactivar: true,
  pruebaDiasInactivar: 30,
  clienteVeCanceladas: false,
  canceladasNCSumanTotal: false,
  ocultarBonosInactivosAgotados: true,
  mostrarAbreviaturaServicio: false,
};

/**
 * La configuración de funcionamiento es DEL CENTRO: se guarda en
 * center_config.avisos.behavior y se aplica igual en cualquier dispositivo.
 */
export function parseBehaviorConfig(value: unknown): BehaviorConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_BEHAVIOR_CONFIG;
  }
  const o = value as Partial<BehaviorConfig>;
  const modo =
    o.canceladasCuentanModo === "siempre" || o.canceladasCuentanModo === "nunca"
      ? o.canceladasCuentanModo
      : "segunNC";
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : d;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const d = DEFAULT_BEHAVIOR_CONFIG;
  return {
    autoCompletarIndividuales: bool(o.autoCompletarIndividuales, d.autoCompletarIndividuales),
    autoCompletarGrupales: bool(o.autoCompletarGrupales, d.autoCompletarGrupales),
    graciaAutoRealizadaMin: num(o.graciaAutoRealizadaMin, d.graciaAutoRealizadaMin),
    cancelacionDefaultNoContabilizar: bool(
      o.cancelacionDefaultNoContabilizar,
      d.cancelacionDefaultNoContabilizar,
    ),
    canceladasCuentanModo: modo,
    grupalesSinAsistentesCuentan: bool(
      o.grupalesSinAsistentesCuentan,
      d.grupalesSinAsistentesCuentan,
    ),
    pruebaAutoInactivar: bool(o.pruebaAutoInactivar, d.pruebaAutoInactivar),
    pruebaDiasInactivar: num(o.pruebaDiasInactivar, d.pruebaDiasInactivar),
    clienteVeCanceladas: bool(o.clienteVeCanceladas, d.clienteVeCanceladas),
    canceladasNCSumanTotal: bool(o.canceladasNCSumanTotal, d.canceladasNCSumanTotal),
    ocultarBonosInactivosAgotados: bool(
      o.ocultarBonosInactivosAgotados,
      d.ocultarBonosInactivosAgotados,
    ),
    mostrarAbreviaturaServicio: bool(o.mostrarAbreviaturaServicio, d.mostrarAbreviaturaServicio),
  };
}

export const BEHAVIOR_QUERY_KEY = ["behavior-config"] as const;

/* Caché síncrona para los puntos que no pueden esperar una promesa. */
let cache: BehaviorConfig | null = null;

export async function fetchBehaviorConfig(): Promise<BehaviorConfig> {
  const { data } = await supabase
    .from("center_config")
    .select("avisos")
    .eq("id", true)
    .maybeSingle();
  const avisos = (data?.avisos ?? {}) as { behavior?: unknown };
  cache = parseBehaviorConfig(avisos.behavior);
  return cache;
}

/** Lectura síncrona: devuelve la última config cargada del centro (o valores por defecto). */
export function getBehaviorConfig(): BehaviorConfig {
  return cache ?? DEFAULT_BEHAVIOR_CONFIG;
}

/** Configuración de funcionamiento del centro (se refresca al guardar). */
export function useBehaviorConfig(): BehaviorConfig {
  const q = useQuery({
    queryKey: BEHAVIOR_QUERY_KEY,
    queryFn: fetchBehaviorConfig,
    staleTime: 30_000,
  });
  const cfg = q.data ?? DEFAULT_BEHAVIOR_CONFIG;
  useEffect(() => {
    cache = cfg;
  }, [cfg]);
  return cfg;
}

/* ------------------------------------------------------------------ */
/* Migración puntual: antes se guardaba en el navegador (localStorage) */
/* ------------------------------------------------------------------ */

const LEGACY_STORAGE_KEY = "behavior-config-v1";

/** Devuelve la config guardada antiguamente en este navegador, si existe. */
export function readLegacyLocalBehaviorConfig(): BehaviorConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return parseBehaviorConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Borra la copia local antigua (tras migrarla a la configuración del centro). */
export function clearLegacyLocalBehaviorConfig(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* silencioso */
  }
}

/**
 * ¿Cuenta esta sesión como entrenamiento realizado?
 * Se aplica igual en estadísticas y en el conteo por entrenador.
 */
export function sessionCountsAsTraining(
  estado: string,
  noContabilizar: boolean | null | undefined,
  modo: CanceladasModo = DEFAULT_BEHAVIOR_CONFIG.canceladasCuentanModo,
): boolean {
  if (estado === "realizada") return true;
  if (estado === "cancelada") {
    if (modo === "siempre") return true;
    if (modo === "nunca") return false;
    return !noContabilizar;
  }
  return false;
}
