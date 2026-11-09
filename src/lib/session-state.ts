import type { Session, SesionEstado } from "./db";

/** Existing end-time grace and pending rules; cancellation belongs to a row. */
export function automaticSessionState(fecha: string, horaFin: string, graceMin: number, pending = false, now = Date.now()): "reservada" | "realizada" {
  return !pending && new Date(`${fecha}T${horaFin}`).getTime() + Math.max(0, graceMin) * 60000 < now ? "realizada" : "reservada";
}

export function clientCancellationFields(pending: boolean, defaultNoCount: boolean) {
  return { estado: "cancelada" as const, por_confirmar: false, no_contabilizar: pending || defaultNoCount };
}

export function sessionBlockSummary<T extends Pick<Session, "estado" | "client_id" | "fecha" | "hora_fin" | "por_confirmar">>(rows: T[], graceMin: number, now = Date.now()) {
  const active = rows.filter((r) => r.estado !== "cancelada" && !!r.client_id);
  const cancelled = rows.filter((r) => r.estado === "cancelada" && !!r.client_id);
  const representative = active.find((r) => !r.por_confirmar) ?? active[0] ?? cancelled[0] ?? rows[0];
  const estado: SesionEstado = !active.length && cancelled.length ? "cancelada" : representative ? automaticSessionState(representative.fecha, representative.hora_fin, graceMin, !!representative.por_confirmar, now) : "reservada";
  return { active, cancelled, representative, estado };
}

/** Only explicit identities group clients; coincident manual sessions stay independent. */
export function sessionBlockKey(row: Pick<Session, "id" | "slot_instance_id" | "recurrencia_id" | "ocupacion" | "fecha" | "hora_inicio" | "hora_fin">): string {
  return row.slot_instance_id ? `slot|${row.slot_instance_id}` : row.ocupacion === 2 && row.recurrencia_id ? `manual|${row.recurrencia_id}|${row.fecha}|${row.hora_inicio}|${row.hora_fin}` : `row|${row.id}`;
}