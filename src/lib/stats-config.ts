import { useEffect, useState } from "react";

export type StatsMetric =
  | "ocupacion"
  | "sesiones"
  | "cancelaciones"
  | "porEntrenador"
  | "facturacion"
  | "altasBajas";

export type StatsDesglose = "franja" | "turno" | "dow" | "tipoSesion" | "total";

export type StatsKpiKey = "entrenamientos" | "ocupacion" | "altas" | "bajas";

export type StatsCompatMatrix = Record<StatsMetric, Record<StatsDesglose, boolean>>;

export type StatsConfig = {
  compat: StatsCompatMatrix;
  kpis: Record<StatsKpiKey, boolean>;
};

export const STATS_METRICS: StatsMetric[] = [
  "ocupacion",
  "sesiones",
  "cancelaciones",
  "porEntrenador",
  "facturacion",
  "altasBajas",
];

export const STATS_DESGLOSES: StatsDesglose[] = [
  "total",
  "turno",
  "dow",
  "franja",
  "tipoSesion",
];

export const STATS_METRIC_LABEL: Record<StatsMetric, string> = {
  ocupacion: "Ocupación del centro (%)",
  sesiones: "Nº sesiones",
  cancelaciones: "Cancelaciones (incl. NC)",
  porEntrenador: "Sesiones por entrenador",
  facturacion: "Facturación estimada (€)",
  altasBajas: "Altas y bajas por mes",
};

export const STATS_DESGLOSE_LABEL: Record<StatsDesglose, string> = {
  total: "Sin desglosar",
  turno: "Turno (mañana / tarde)",
  dow: "Día de la semana",
  franja: "Franja horaria",
  tipoSesion: "Tipo de sesión",
};

export const STATS_KPI_LABEL: Record<StatsKpiKey, string> = {
  entrenamientos: "Entrenamientos totales",
  ocupacion: "Ocupación media del centro",
  altas: "Altas del mes",
  bajas: "Bajas del mes",
};

/** Compatibilidad por defecto (recomendada) entre métrica y desglose. */
export const DEFAULT_COMPAT: StatsCompatMatrix = {
  ocupacion:     { total: true,  turno: true,  dow: true,  franja: false, tipoSesion: false },
  sesiones:      { total: true,  turno: true,  dow: true,  franja: true,  tipoSesion: true  },
  cancelaciones: { total: true,  turno: true,  dow: true,  franja: true,  tipoSesion: false },
  porEntrenador: { total: true,  turno: true,  dow: true,  franja: false, tipoSesion: false },
  facturacion:   { total: true,  turno: true,  dow: true,  franja: false, tipoSesion: false },
  altasBajas:    { total: true,  turno: false, dow: false, franja: false, tipoSesion: false },
};

export const DEFAULT_KPIS: Record<StatsKpiKey, boolean> = {
  entrenamientos: true,
  ocupacion: true,
  altas: true,
  bajas: true,
};

export const DEFAULT_STATS_CONFIG: StatsConfig = {
  compat: DEFAULT_COMPAT,
  kpis: DEFAULT_KPIS,
};

const STORAGE_KEY = "stats-config-v1";
const EVENT_NAME = "stats-config-changed";

function mergeCompat(saved: Partial<StatsCompatMatrix> | undefined): StatsCompatMatrix {
  const out = {} as StatsCompatMatrix;
  for (const m of STATS_METRICS) {
    const savedRow = (saved?.[m] ?? {}) as Partial<Record<StatsDesglose, boolean>>;
    const row = {} as Record<StatsDesglose, boolean>;
    for (const d of STATS_DESGLOSES) {
      const v = savedRow[d];
      row[d] = typeof v === "boolean" ? v : DEFAULT_COMPAT[m][d];
    }
    out[m] = row;
  }
  return out;
}

function mergeKpis(saved: Partial<Record<StatsKpiKey, boolean>> | undefined): Record<StatsKpiKey, boolean> {
  return {
    entrenamientos: saved?.entrenamientos ?? true,
    ocupacion: saved?.ocupacion ?? true,
    altas: saved?.altas ?? true,
    bajas: saved?.bajas ?? true,
  };
}

function readStorage(): StatsConfig {
  if (typeof window === "undefined") return DEFAULT_STATS_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATS_CONFIG;
    const parsed = JSON.parse(raw) as Partial<StatsConfig>;
    return {
      compat: mergeCompat(parsed.compat),
      kpis: mergeKpis(parsed.kpis),
    };
  } catch {
    return DEFAULT_STATS_CONFIG;
  }
}

export function writeStatsConfig(cfg: StatsConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function useStatsConfig(): StatsConfig {
  const [cfg, setCfg] = useState<StatsConfig>(DEFAULT_STATS_CONFIG);
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

/** ¿Es la combinación métrica × desglose la recomendada por defecto? */
export function isDefaultCompat(metric: StatsMetric, desglose: StatsDesglose): boolean {
  return DEFAULT_COMPAT[metric][desglose] === true;
}