import { useCenterConfig, DEFAULT_TIPO_COLORES, type TipoColores } from "./center-schedule";

/** Prefijo con el que se guardan los colores de servicio dentro de `center_config.colores`. */
export const SERVICIO_PREFIX = "srv:";

export function servicioColorKey(slug: string): string {
  return `${SERVICIO_PREFIX}${slug}`;
}

/** Paleta de reserva para servicios sin color configurado (estable por slug). */
const FALLBACK_SERVICIO_PALETTE = [
  "#3CC0F3", "#7C6CF6", "#F59E0B", "#E959DE", "#14B8A6", "#F43F5E", "#22C55E", "#0EA5E9",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function defaultServicioColor(slug: string): string {
  return FALLBACK_SERVICIO_PALETTE[hashString(slug) % FALLBACK_SERVICIO_PALETTE.length];
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** amount < 0 oscurece, amount > 0 aclara (rango -1..1). */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const f = (c: number) => clamp(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function tipoColorOf(colores: TipoColores, tipo?: string | null): string | null {
  if (!tipo) return null;
  return colores[tipo] ?? DEFAULT_TIPO_COLORES[tipo] ?? "#888888";
}

export function servicioColorOf(colores: TipoColores, slug?: string | null): string | null {
  if (!slug) return null;
  return colores[servicioColorKey(slug)] ?? defaultServicioColor(slug);
}

/** Estilo de "chip" tenue para columnas de tipo de bono / servicio. */
export function chipStyle(color: string): React.CSSProperties {
  return { backgroundColor: `${color}26`, color };
}

/**
 * Color de relleno de una sesión de agenda a partir de su servicio.
 * Devuelve null cuando debe usarse el color de estado (prueba, cancelada, renovación)
 * o cuando la sesión no tiene servicio asignado.
 */
export function sessionFillColor(
  colores: TipoColores,
  session: { estado: string; tipo?: string | null; servicio_slug?: string | null },
  estadoOverride?: string,
): string | null {
  const estado = estadoOverride ?? session.estado;
  if (session.tipo === "prueba") return null;
  if (estado === "prueba" || estado === "cancelada" || estado === "renovacion") return null;
  const base = servicioColorOf(colores, session.servicio_slug ?? null);
  if (!base) return null;
  return estado === "realizada" ? shade(base, -0.22) : base;
}

export function useColores() {
  const { colores } = useCenterConfig();
  return {
    colores,
    tipoColor: (tipo?: string | null) => tipoColorOf(colores, tipo),
    servicioColor: (slug?: string | null) => servicioColorOf(colores, slug),
  };
}
