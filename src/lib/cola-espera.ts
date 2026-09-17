/**
 * Cola de espera para sesiones completas.
 *
 * Cuando una sesión está llena, el cliente puede apuntarse a la cola. Si una
 * plaza queda libre se ofrece por orden de llegada. La oferta sólo caduca si
 * el centro lo activa y además hay alguien más esperando por detrás.
 */

export const COLA_OPCIONES: { value: number; label: string }[] = [
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
  { value: 360, label: "6 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "24 horas" },
];

export const DEFAULT_COLA_MIN = 120;

export interface ColaConfig {
  /** La cola de espera está disponible para los clientes. */
  activa: boolean;
  /** La confirmación de la plaza ofrecida caduca. */
  caducidadActiva: boolean;
  general: number;
  porServicio: Record<string, number>;
}

export const DEFAULT_COLA_CONFIG: ColaConfig = {
  activa: false,
  caducidadActiva: false,
  general: DEFAULT_COLA_MIN,
  porServicio: {},
};

export function parseColaMin(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_COLA_MIN;
  return Math.round(n);
}

/** 0 = ese servicio no caduca nunca. */
export function parseColaPorServicio(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [slug, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) out[slug] = Math.round(n);
  }
  return out;
}

/** Lee la configuración de cola desde `center_config.avisos`. */
export function parseColaConfig(avisos: unknown): ColaConfig {
  const a = (avisos ?? {}) as Record<string, unknown>;
  return {
    activa: a["cola_activa"] === true,
    caducidadActiva: a["cola_caducidad_activa"] === true,
    general: parseColaMin(a["cola_confirmacion_min"]),
    porServicio: parseColaPorServicio(a["cola_confirmacion_por_servicio"]),
  };
}

export function colaTiempoParaServicio(cfg: ColaConfig, servicioSlug?: string | null): number {
  if (servicioSlug && cfg.porServicio[servicioSlug] !== undefined) {
    return cfg.porServicio[servicioSlug]!;
  }
  return cfg.general;
}

export function colaTiempoLabel(min: number): string {
  if (!min || min <= 0) return "Sin caducidad";
  const preset = COLA_OPCIONES.find((o) => o.value === min);
  if (preset) return preset.label;
  if (min < 60) return `${min} minutos`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} horas`;
}

/** Texto del tiempo que queda para confirmar una plaza ofrecida. */
export function tiempoRestanteLabel(expiraAt?: string | null): string | null {
  if (!expiraAt) return null;
  const diff = new Date(expiraAt).getTime() - Date.now();
  if (diff <= 0) return "caducada";
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
