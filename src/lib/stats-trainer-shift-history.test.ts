import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { trainerShiftHistory } from "./stats-trainer-shift-history";

const trainers = [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Bruno" }, { id: "c", nombre: "Celia" }];
const months = [{ month: "2026-09", label: "Sep 2026" }, { month: "2026-10", label: "Oct 2026" }];
const sessions = [
  { trainer_id: "a", fecha: "2026-09-01", hora_inicio: "13:59" },
  { trainer_id: "b", fecha: "2026-09-01", hora_inicio: "14:00" },
  { trainer_id: "b", fecha: "2026-10-01", hora_inicio: "09:00" },
  { trainer_id: "b", fecha: "2026-10-02", hora_inicio: "18:00" },
  { trainer_id: "c", fecha: "2026-08-01", hora_inicio: "09:00" },
];
test("history orders trainers by descending total across both shifts and months", () => {
  const result = trainerShiftHistory(sessions, trainers, months);
  deepStrictEqual(result.groups.map((g) => [g.name, g.total]), [["Bruno", 3], ["Ana", 1]]);
});
test("each trainer keeps independent morning and afternoon counts and totals", () => {
  const result = trainerShiftHistory(sessions, trainers, months);
  deepStrictEqual(result.values, [[0, 1, 1], [1, 1, 2], [1, 0, 1], [0, 0, 0]]);
});
test("selecting trainers filters their paired rows without changing counts or months", () => {
  const result = trainerShiftHistory(sessions, trainers, months, ["a", "c"]);
  deepStrictEqual(result.groups.map((g) => g.name), ["Ana"]);
  deepStrictEqual(result.colLabels, ["Sep 2026", "Oct 2026", "Total"]);
  deepStrictEqual(result.values, [[1, 0, 1], [0, 0, 0]]);
});