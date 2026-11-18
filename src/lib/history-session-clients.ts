/** Attendance names use the exact block; cancellation-only history retains its clients. */
export function historySessionClientIds(rows: { client_id: string | null; estado: string }[]) {
  const active = rows.filter((row) => row.estado !== "cancelada" && row.client_id);
  return [...new Set((active.length ? active : rows).map((row) => row.client_id).filter((id): id is string => !!id))];
}

/** Reserve room for +N before deciding which complete names fit. */
export function fittingHistoryClientCount(widths: number[], available: number, overflowWidth: number, gap = 8) {
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  if (total <= available) return widths.length;
  let used = 0;
  let count = 0;
  for (const width of widths) {
    if (used + width + gap + overflowWidth > available) break;
    used += width + gap;
    count += 1;
  }
  return count;
}