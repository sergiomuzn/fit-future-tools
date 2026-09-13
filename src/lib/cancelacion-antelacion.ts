/**
 * Antelación mínima con la que un cliente puede cancelar una reserva sin que
 * la sesión se le contabilice (se descuente del bono).
 *
 * - Si cancela con antelación suficiente: la reserva desaparece de la agenda.
 * - Si cancela por debajo de esa antelación: la sesión permanece en la agenda
 *   marcada como cancelada y se contabiliza (descuenta sesión del bono), salvo
 *   que el centro marque a mano la casilla "No contabilizar".
 */
import { sessionMinutes, nowMinutesMadrid } from "./booking-antelacion";

export const CANCELACION_OPCIONES: { value: number; label: string }[] = [
  { value: 0, label: "Sin antelación" },
  { value: 120, label: "2 horas" },
  { value: 720, label: "12 horas" },
  { value: 1080, label: "18 horas" },
  { value: 1440, label: "24 horas" },
];

export const DEFAULT_CANCELACION_MIN = 0;

export function parseCancelacionMin(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CANCELACION_MIN;
  return Math.round(n);
}

export function parseCancelacionPorServicio(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [slug, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) out[slug] = Math.round(n);
  }
  return out;
}

export function cancelacionLabel(min: number): string {
  const preset = CANCELACION_OPCIONES.find((o) => o.value === min);
  if (preset) return preset.label;
  if (min < 60) return `${min} minutos`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} horas`;
}

export interface CancelacionConfig {
  general: number;
  porServicio: Record<string, number>;
}

export const DEFAULT_CANCELACION_CONFIG: CancelacionConfig = {
  general: DEFAULT_CANCELACION_MIN,
  porServicio: {},
};

/** Minutos de antelación aplicables a un servicio concreto. */
export function cancelacionParaServicio(
  cfg: CancelacionConfig,
  servicioSlug?: string | null,
): number {
  if (servicioSlug && cfg.porServicio[servicioSlug] !== undefined) {
    return cfg.porServicio[servicioSlug]!;
  }
  return cfg.general;
}

/** ¿La cancelación llega con antelación suficiente para no contabilizarse? */
export function cancelaSinContabilizar(
  fecha: string,
  horaInicio: string,
  antelacionMin: number,
): boolean {
  return sessionMinutes(fecha, horaInicio) - nowMinutesMadrid() >= antelacionMin;
}
