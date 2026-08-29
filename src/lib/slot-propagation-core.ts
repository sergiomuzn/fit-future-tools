import { slotVisibleForMode, type BookingMode } from "./booking-mode";

/**
 * Propagación de la "semana tipo" (service_slots) a fechas concretas
 * (service_slot_instances). La semana tipo es una plantilla independiente:
 * hasta que no se propaga, el cliente no puede reservar esos huecos.
 */

export interface SlotInstance {
  id: string;
  service_slot_id: string | null;
  servicio_slug: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  trainer_id: string | null;
  activo: boolean;
  origen: string;
}

export interface PlantillaSlot {
  id: string;
  servicio_slug: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  trainer_id: string | null;
}

export interface NuevaInstancia {
  service_slot_id: string;
  servicio_slug: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  trainer_id: string | null;
  origen: string;
}

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lunes de la semana de la fecha dada. */
export function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // lunes = 0
  out.setDate(out.getDate() - dow);
  return out;
}

/** Las 7 fechas (YYYY-MM-DD) de la semana que empieza en `monday`. */
export function weekDates(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return ymdLocal(d);
  });
}

export function instanceKey(slug: string, fecha: string, ini: string, fin: string): string {
  return `${slug}|${fecha}|${ini.slice(0, 5)}|${fin.slice(0, 5)}`;
}

export interface PropagationInput {
  plantilla: PlantillaSlot[];
  /** Fechas destino en formato YYYY-MM-DD. */
  fechas: string[];
  /** Sesiones reales de la agenda agrupadas por fecha. */
  sesionesPorFecha: Map<string, { inicio: string; fin: string }[]>;
  /** Claves de instancias ya existentes (instanceKey). */
  existentes: Set<string>;
  modo: BookingMode;
  origen?: string;
}

export interface PropagationPlan {
  rows: NuevaInstancia[];
  /** Nº de huecos nuevos por fecha. */
  porFecha: Record<string, number>;
  /** Huecos omitidos por conflicto con la agenda según el modo activo. */
  omitidosPorModo: number;
  /** Huecos que ya estaban propagados. */
  yaExistentes: number;
}

/** Calcula qué huecos se crearían, aplicando el modo de reservas activo. */
export function buildPropagationPlan(input: PropagationInput): PropagationPlan {
  const { plantilla, fechas, sesionesPorFecha, existentes, modo } = input;
  const rows: NuevaInstancia[] = [];
  const porFecha: Record<string, number> = {};
  let omitidosPorModo = 0;
  let yaExistentes = 0;

  const vistos = new Set(existentes);

  for (const fecha of fechas) {
    const dow = new Date(`${fecha}T00:00:00`).getDay();
    const sesionesDia = sesionesPorFecha.get(fecha) ?? [];
    for (const s of plantilla.filter((p) => p.dia_semana === dow)) {
      const key = instanceKey(s.servicio_slug, fecha, s.hora_inicio, s.hora_fin);
      if (vistos.has(key)) {
        yaExistentes++;
        continue;
      }
      vistos.add(key);
      const visible = slotVisibleForMode(
        { inicio: s.hora_inicio, fin: s.hora_fin },
        sesionesDia,
        modo,
      );
      if (!visible) {
        omitidosPorModo++;
        continue;
      }
      rows.push({
        service_slot_id: s.id,
        servicio_slug: s.servicio_slug,
        fecha,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        capacidad: Math.max(1, s.capacidad),
        trainer_id: s.trainer_id,
        origen: input.origen ?? "manual",
      });
      porFecha[fecha] = (porFecha[fecha] ?? 0) + 1;
    }
  }

  return { rows, porFecha, omitidosPorModo, yaExistentes };
}


/** Nº de semanas por delante de la propagación automática (1-12, por defecto 2). */
export function parsePropagacionSemanas(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(12, Math.round(n)) : 2;
}
