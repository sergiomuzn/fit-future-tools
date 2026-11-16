import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { trainerMonthComparison } from "./stats-trainer-comparison";

const months = [{ month: "2026-10", label: "Oct 2026" }, { month: "2026-11", label: "Nov 2026" }];
const trainers = [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Bruno" }];
const sessions = [
  { trainer_id: "a", fecha: "2026-10-05", hora_inicio: "09:00" },
  { trainer_id: "a", fecha: "2026-10-05", hora_inicio: "15:00" },
  { trainer_id: "b", fecha: "2026-10-05", hora_inicio: "10:00" },
  { trainer_id: "b", fecha: "2026-11-03", hora_inicio: "17:00" },
  { trainer_id: "a", fecha: "2026-09-01", hora_inicio: "09:00" },
];
test("shift comparison retains each trainer and month instead of summing trainers together", () => {
  const { rows } = trainerMonthComparison(sessions, trainers, months, "turno");
  deepStrictEqual(rows, [
    { bucket: "Oct 2026", "Ana · Mañana": 1, "Ana · Tarde": 1, "Bruno · Mañana": 1, "Bruno · Tarde": 0 },
    { bucket: "Nov 2026", "Ana · Mañana": 0, "Ana · Tarde": 0, "Bruno · Mañana": 0, "Bruno · Tarde": 1 },
  ]);
});
test("weekday comparison retains separate months and excludes unselected trainers", () => {
  const { rows, series } = trainerMonthComparison(sessions, [trainers[1]], months, "dow");
  strictEqual(rows[0]["Bruno · Oct 2026"], 1);
  strictEqual(rows[1]["Bruno · Nov 2026"], 1);
  strictEqual(rows[0]["Bruno · Nov 2026"], 0);
  strictEqual(series.length, 2);
  strictEqual(rows.length, 7);
});
test("without selection global totals remain separated by month", () => {
  const { rows } = trainerMonthComparison(sessions, [], months, "dow");
  strictEqual(rows[0]["Total · Oct 2026"], 3);
  strictEqual(rows[1]["Total · Nov 2026"], 1);
});