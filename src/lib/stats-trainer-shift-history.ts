type HistorySession = { trainer_id?: string | null; fecha: string; hora_inicio: string };
type HistoryTrainer = { id: string; nombre: string };
type HistoryMonth = { month: string; label: string };

// Receives already-accounted sessions; only presentation is aggregated here.
export function trainerShiftHistory(
  sessions: HistorySession[], trainers: HistoryTrainer[], months: HistoryMonth[], selectedIds: string[] = [],
) {
  const monthIndex = new Map(months.map((m, i) => [m.month, i]));
  const candidates = trainers.filter((t) => !selectedIds.length || selectedIds.includes(t.id));
  const counts = new Map(candidates.map((t) => [t.id, [months.map(() => 0), months.map(() => 0)]]));
  for (const session of sessions) {
    const index = monthIndex.get(session.fecha.slice(0, 7));
    const shifts = session.trainer_id ? counts.get(session.trainer_id) : undefined;
    if (index === undefined || !shifts) continue;
    shifts[Number(session.hora_inicio.split(":")[0]) < 14 ? 0 : 1][index] += 1;
  }
  const groups = candidates.map((t) => {
    const values = counts.get(t.id) ?? [[], []];
    const totals = values.map((shift) => shift.reduce((a, b) => a + b, 0));
    return { trainerId: t.id, name: t.nombre, values, totals, total: totals.reduce((a, b) => a + b, 0) };
  }).filter((g) => g.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const rowLabels = groups.flatMap(() => ["Mañana", "Tarde"]);
  const colLabels = [...months.map((m) => m.label), "Total"];
  const values = groups.flatMap((g) => g.values.map((shift, i) => [...shift, g.totals[i]]));
  const rows = groups.flatMap((g) => g.values.map((shift, i) => ({
    bucket: `${g.name} · ${rowLabels[i]}`,
    ...Object.fromEntries(months.map((m, j) => [m.label, shift[j]])),
    Total: g.totals[i],
  })));
  return { groups, rowLabels, colLabels, values, rows };
}