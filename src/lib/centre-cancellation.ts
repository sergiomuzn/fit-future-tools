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

/** Quién cerró la reserva: el centro o el propio cliente. */
export type CancellationOrigin = "centro" | "cliente";

/** El cliente siempre recibe aviso; el texto depende de quién canceló. */
export function cancellationNotice(origin: CancellationOrigin | undefined, donde: string, cuando: string) {
  if (origin === "cliente") {
    return {
      titulo: "Cancelación gestionada por el centro",
      mensaje: `Has cancelado tu reserva de ${donde} (${cuando}). El centro ha gestionado la cancelación por ti.`,
    };
  }
  return { titulo: "Reserva cancelada por el centro", mensaje: `en ${donde} (${cuando})` };
}
