type ComparisonSession = { trainer_id?: string | null; fecha: string; hora_inicio: string };
type ComparisonTrainer = { id: string; nombre: string };
type ComparisonMonth = { month: string; label: string };

// Receives already-accounted sessions; presentation never changes eligibility.
export function trainerMonthComparison(
  sessions: ComparisonSession[], trainers: ComparisonTrainer[], months: ComparisonMonth[], breakdown: "turno" | "dow",
) {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const variants = breakdown === "turno" ? ["Mañana", "Tarde"] : months.map((m) => m.label);
  const owners = trainers.length ? trainers : [{ id: "", nombre: "Total" }];
  const series = owners.flatMap((trainer) => variants.map((variant, index) => ({
    key: `${trainer.nombre} · ${variant}`, trainerId: trainer.id, variant: index,
  })));
  const rows: Array<{ bucket: string; [key: string]: string | number }> = (breakdown === "turno" ? months.map((m) => m.label) : days)
    .map((bucket) => ({ bucket, ...Object.fromEntries(series.map((s) => [s.key, 0])) }));
  for (const session of sessions) {
    const monthIndex = months.findIndex((m) => m.month === session.fecha.slice(0, 7));
    if (monthIndex < 0) continue;
    const owner = owners.find((t) => !t.id || t.id === session.trainer_id);
    if (!owner) continue;
    const day = (new Date(`${session.fecha}T00:00:00`).getDay() + 6) % 7;
    const variant = breakdown === "turno" ? (Number(session.hora_inicio.slice(0, 2)) < 14 ? 0 : 1) : monthIndex;
    const row = rows[breakdown === "turno" ? monthIndex : day];
    const key = `${owner.nombre} · ${variants[variant]}`;
    row[key] = Number(row[key]) + 1;
  }
  return { rows, series };
}