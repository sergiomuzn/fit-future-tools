import { useEffect, useState } from "react";

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
};

const STORAGE_KEY = "behavior-config-v1";
const EVENT_NAME = "behavior-config-changed";

let cache: BehaviorConfig | null = null;
let cacheBound = false;
function bindCacheInvalidation() {
  if (cacheBound || typeof window === "undefined") return;
  cacheBound = true;
  const clear = () => { cache = null; };
  window.addEventListener(EVENT_NAME, clear);
  window.addEventListener("storage", clear);
}

function readStorage(): BehaviorConfig {
  if (typeof window === "undefined") return DEFAULT_BEHAVIOR_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BEHAVIOR_CONFIG;
    const parsed = JSON.parse(raw) as Partial<BehaviorConfig>;
    return { ...DEFAULT_BEHAVIOR_CONFIG, ...parsed };
  } catch {
    return DEFAULT_BEHAVIOR_CONFIG;
  }
}

export function writeBehaviorConfig(cfg: BehaviorConfig): void {
  if (typeof window === "undefined") return;
  cache = cfg;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getBehaviorConfig(): BehaviorConfig {
  bindCacheInvalidation();
  if (!cache) cache = readStorage();
  return cache;
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

export function useBehaviorConfig(): BehaviorConfig {
  const [cfg, setCfg] = useState<BehaviorConfig>(DEFAULT_BEHAVIOR_CONFIG);
  useEffect(() => {
    setCfg(readStorage());
    const update = () => setCfg(readStorage());
    window.addEventListener(EVENT_NAME, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT_NAME, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return cfg;
}