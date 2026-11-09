/** Presentation only: queue entries, cancellations and empty rows never occupy places. */
export function reservedSessionPlaces(rows: readonly { client_id: string | null; estado?: string; booking_tipo?: string | null; __cola?: boolean }[]) {
  return rows.filter((row) => row.client_id && row.estado !== "cancelada" && row.booking_tipo !== "cola" && !row.__cola).length;
}

export function sessionPlaces(capacity: number, reserved: number) {
  const total = Math.max(1, capacity);
  const available = Math.max(0, total - reserved);
  return { reserved, available, total, label: `${reserved}/${available}` };
}