type Booking = {
  client_id?: string | null;
  booked_by_user_id?: string | null;
  booking_tipo?: string | null;
  estado: string;
};

export function isSelfBooking(session: Booking): boolean {
  return !!session.client_id && !!session.booked_by_user_id && session.booking_tipo !== "centro";
}

/** Online reservations may be confirmed, but never marked pending again. */
export function canMarkSessionPending(estado: string, hasOnlineBooking: boolean): boolean {
  return estado === "reservada" && !hasOnlineBooking;
}

export function hasOnlineBookingDistinction(enabled: boolean, bookings: Booking[]): boolean {
  return enabled && bookings.some((session) => session.estado !== "cancelada" && isSelfBooking(session));
}

export function hideCancelledSelfBooking(session: Booking, capacity: number, hasQueue: boolean): boolean {
  // Client cancellations remain accessible, even if they were the last place.
  return false;
}

export function sessionQueueKey(session: {
  slot_instance_id?: string | null;
  group_id?: string | null;
  fecha: string;
  hora_inicio: string;
}): string | null {
  if (session.slot_instance_id) return `hueco|${session.slot_instance_id}`;
  return session.group_id ? `${session.group_id}|${session.fecha}|${session.hora_inicio.slice(0, 5)}:00` : null;
}

export function normalizeQueueKey(key: string): string {
  const parts = key.split("|");
  return parts.length === 3 ? `${parts[0]}|${parts[1]}|${parts[2].slice(0, 5)}:00` : key;
}