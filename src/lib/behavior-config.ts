import { useEffect, useState } from "react";

export type BehaviorConfig = {
  autoCompletarIndividuales: boolean;
  autoCompletarGrupales: boolean;
  graciaAutoRealizadaMin: number;
  cancelacionDefaultNoContabilizar: boolean;
  grupalesSinAsistentesCuentan: boolean;
};

export const DEFAULT_BEHAVIOR_CONFIG: BehaviorConfig = {
  autoCompletarIndividuales: true,
  autoCompletarGrupales: true,
  graciaAutoRealizadaMin: 15,
  cancelacionDefaultNoContabilizar: false,
  grupalesSinAsistentesCuentan: true,
};

const STORAGE_KEY = "behavior-config-v1";
const EVENT_NAME = "behavior-config-changed";

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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getBehaviorConfig(): BehaviorConfig {
  return readStorage();
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