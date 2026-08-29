/**
 * Margen de antelación con el que un cliente puede reservar una sesión
 * antes de que ésta comience (en minutos). 0 = sin margen: se puede reservar
 * hasta el momento exacto de inicio.
 */
export const ANTELACION_OPCIONES: { value: number; label: string }[] = [
  { value: 0, label: "Sin margen" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 180, label: "3 horas" },
  { value: 360, label: "6 horas" },
  { value: 720, label: "12 horas" },
  { value: 1080, label: "18 horas" },
  { value: 1440, label: "24 horas" },
  { value: 10080, label: "1 semana" },
];

export const DEFAULT_ANTELACION_MIN = 0;

export function parseAntelacion(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ANTELACION_MIN;
  return ANTELACION_OPCIONES.some((o) => o.value === n) ? n : DEFAULT_ANTELACION_MIN;
}

export function antelacionLabel(min: number): string {
  return ANTELACION_OPCIONES.find((o) => o.value === min)?.label ?? "Sin margen";
}

/** Minutos absolutos (desde epoch) de una fecha ISO + hora "HH:MM". */
export function sessionMinutes(fecha: string, hora: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.slice(0, 5).split(":").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 60000 + (hh ?? 0) * 60 + (mm ?? 0);
}

/** "Ahora" en minutos absolutos según la zona horaria del centro (Europe/Madrid). */
export function nowMinutesMadrid(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return sessionMinutes(
    `${get("year")}-${get("month")}-${get("day")}`,
    `${get("hour")}:${get("minute")}`,
  );
}

/** ¿Puede reservarse todavía esta sesión? */
export function puedeReservarse(fecha: string, horaInicio: string, antelacionMin: number): boolean {
  return sessionMinutes(fecha, horaInicio) - nowMinutesMadrid() >= antelacionMin;
}

/** ¿Ya ha comenzado (o pasado) la sesión? */
export function yaComenzo(fecha: string, horaInicio: string): boolean {
  return sessionMinutes(fecha, horaInicio) <= nowMinutesMadrid();
}
