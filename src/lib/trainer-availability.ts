export interface TrainerActivity {
  trainer_id: string;
  activo: boolean;
  effective_at: string;
}

export function activeTrainerOptions<T extends { activo?: boolean }>(trainers: T[]): T[] {
  // Some callers already fetch only active rows without selecting activo.
  return trainers.filter((trainer) => trainer.activo !== false);
}

function dayStart(fecha: string): number {
  return new Date(`${fecha}T00:00:00`).getTime();
}

export function trainerActiveOnDate(id: string, fecha: string, history: TrainerActivity[]): boolean {
  const end = dayStart(fecha) + 86400000;
  const records = history.filter((row) => row.trainer_id === id)
    .sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at));
  // Earlier activity is unknown: do not retroactively erase historical statistics.
  if (!records.length || Date.parse(records[0].effective_at) >= end) return true;
  let active = false;
  for (let i = 0; i < records.length; i++) {
    const start = Date.parse(records[i].effective_at);
    const next = records[i + 1];
    const until = next ? Date.parse(next.effective_at) : Infinity;
    if (records[i].activo && start < end && until > dayStart(fecha)) active = true;
  }
  return active;
}

export function trainerAvailableInMonth(
  trainer: { id: string; activo: boolean }, month: string, history: TrainerActivity[],
  sessions: { trainer_id: string | null; fecha: string }[],
): boolean {
  const [year, number] = month.split("-").map(Number);
  const start = new Date(year, number - 1, 1).getTime();
  const end = new Date(year, number, 1).getTime();
  const records = history.filter((row) => row.trainer_id === trainer.id)
    .sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at));
  if (!records.length || start < Date.parse(records[0].effective_at)) {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    if (month === currentMonth && trainer.activo) return true;
    if (sessions.some((row) => row.trainer_id === trainer.id && row.fecha.startsWith(month)
      && (!records.length || dayStart(row.fecha) < Date.parse(records[0].effective_at)))) return true;
  }
  return records.some((row, i) => row.activo && Date.parse(row.effective_at) < end
    && (records[i + 1] ? Date.parse(records[i + 1].effective_at) : Infinity) > start);
}