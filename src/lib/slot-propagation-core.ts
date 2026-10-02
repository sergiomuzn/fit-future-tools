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

/** Clave de una instancia generada desde un hueco concreto de la semana tipo. */
export function slotFechaKey(serviceSlotId: string, fecha: string): string {
  return `slot:${serviceSlotId}|${fecha}`;
}

/**
 * Claves de instancias existentes: las que vienen de la semana tipo se
 * identifican por (hueco plantilla, fecha), de modo que dos huecos distintos a
 * la misma hora se mantienen separados; las creadas a mano por servicio+horario.
 */
export function existingInstanceKeys(
  filas: {
    service_slot_id: string | null;
    servicio_slug: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
  }[],
): Set<string> {
  const out = new Set<string>();
  for (const i of filas) {
    if (i.service_slot_id) out.add(slotFechaKey(i.service_slot_id, i.fecha));
    else out.add(instanceKey(i.servicio_slug, i.fecha, i.hora_inicio, i.hora_fin));
  }
  return out;
}

export interface PropagationInput {
  plantilla: PlantillaSlot[];
  /** Fechas destino en formato YYYY-MM-DD. */
  fechas: string[];
  /** Sesiones reales de la agenda agrupadas por fecha. */
  sesionesPorFecha: Map<string, { inicio: string; fin: string }[]>;
  /** Claves de instancias ya existentes (existingInstanceKeys). */
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

/**
 * Calcula qué huecos se crearían, aplicando el modo de reservas activo.
 * Cada hueco de la semana tipo genera su propia instancia: dos huecos a la
 * misma hora (p. ej. con entrenadores distintos) siguen siendo dos sesiones.
 */
export function buildPropagationPlan(input: PropagationInput): PropagationPlan {
  const { plantilla, fechas, sesionesPorFecha, existentes, modo } = input;
  const rows: NuevaInstancia[] = [];
  const porFecha: Record<string, number> = {};
  let omitidosPorModo = 0;
  let yaExistentes = 0;

  for (const fecha of fechas) {
    const dow = new Date(`${fecha}T00:00:00`).getDay();
    const sesionesDia = sesionesPorFecha.get(fecha) ?? [];
    for (const s of plantilla.filter((p) => p.dia_semana === dow)) {
      if (
        existentes.has(slotFechaKey(s.id, fecha)) ||
        existentes.has(instanceKey(s.servicio_slug, fecha, s.hora_inicio, s.hora_fin))
      ) {
        yaExistentes++;
        continue;
      }
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

/**
 * Reparte las reservas entre huecos propagados. Varios huecos pueden coincidir
 * en servicio y hora (p. ej. uno por entrenador): cada reserva va al hueco de su
 * entrenador con plaza libre; si no, al primero con plaza libre.
 */
export function asignarReservasAHuecos<
  H extends { id: string; servicio_slug: string; fecha: string; hora_inicio: string; capacidad: number; trainer_id: string | null },
  S extends { servicio_slug: string | null; fecha: string; hora_inicio: string; trainer_id?: string | null },
>(huecos: H[], sesiones: S[]): Map<string, S[]> {
  const out = new Map<string, S[]>();
  const grupos = new Map<string, H[]>();
  for (const h of huecos) {
    out.set(h.id, []);
    const k = `${h.servicio_slug}|${h.fecha}|${h.hora_inicio.slice(0, 5)}`;
    const arr = grupos.get(k) ?? [];
    arr.push(h);
    grupos.set(k, arr);
  }
  for (const arr of grupos.values()) arr.sort((a, b) => a.id.localeCompare(b.id));
  const libre = (h: H) => out.get(h.id)!.length < Math.max(1, h.capacidad ?? 1);
  // Primero las que tienen entrenador, para que ocupen su hueco antes que las genéricas.
  const orden = [...sesiones].sort((a, b) => Number(!a.trainer_id) - Number(!b.trainer_id));
  for (const s of orden) {
    const grupo = grupos.get(`${s.servicio_slug ?? ""}|${s.fecha}|${s.hora_inicio.slice(0, 5)}`);
    if (!grupo?.length) continue;
    const destino =
      grupo.find((h) => s.trainer_id && h.trainer_id === s.trainer_id && libre(h)) ??
      grupo.find(libre) ??
      grupo.find((h) => s.trainer_id && h.trainer_id === s.trainer_id) ??
      grupo[0]!;
    out.get(destino.id)!.push(s);
  }
  return out;
}



/** Nº de semanas por delante de la propagación automática (1-12, por defecto 2). */
export function parsePropagacionSemanas(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(12, Math.round(n)) : 2;
}
