import { isSelfBooking } from "@/components/agenda/online-booking";

type Reservation = Parameters<typeof isSelfBooking>[0] & { por_confirmar?: boolean | null };

export function requiresDeletionReason(rows: Reservation[]): boolean {
  return rows.some((row) => isSelfBooking(row) && !row.por_confirmar && row.estado === "reservada");
}

export function validCancellationReason(reason: string): boolean {
  return reason.trim().length > 0;
}

export function withCancellationReason(message: string, reason?: string): string {
  return reason?.trim() ? `${message}\nMotivo: ${reason.trim()}` : message;
}

/** Título del cuadro «Cliente cancela»: «Sofía Ortega Gympass cancela su reserva». */
export function clientCancellationTitle(nombre?: string | null): string {
  return `${nombre?.trim() || "Cliente"} cancela su reserva`;
}