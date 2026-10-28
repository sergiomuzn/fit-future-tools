import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { activeTrainerOptions, trainerActiveOnDate, trainerAvailableInMonth } from "./trainer-availability";

const trainer = { id: "trainer", activo: true };
const history = [
  { trainer_id: trainer.id, activo: true, effective_at: "2026-01-01T00:00:00" },
  { trainer_id: trainer.id, activo: false, effective_at: "2026-02-01T00:00:00" },
  { trainer_id: trainer.id, activo: true, effective_at: "2026-03-01T00:00:00" },
];
describe("trainer availability", () => {
  test("inactive trainers cannot be selected for sessions or invoices", () => {
    deepStrictEqual(activeTrainerOptions([trainer, { id: "inactive", activo: false }]), [trainer]);
  });
  test("February entirely inactive is not selectable", () => {
    strictEqual(trainerAvailableInMonth(trainer, "2026-02", history, []), false);
  });
  test("active January remains available after deactivation", () => {
    strictEqual(trainerAvailableInMonth({ ...trainer, activo: false }, "2026-01", history, []), true);
  });
  test("reactivation makes March selectable", () => {
    strictEqual(trainerAvailableInMonth(trainer, "2026-03", history, []), true);
  });
  test("sessions in inactive February do not enter trainer statistics", () => {
    strictEqual(trainerActiveOnDate(trainer.id, "2026-02-16", history), false);
    strictEqual(trainerActiveOnDate(trainer.id, "2026-03-01", history), true);
  });
  test("unknown past activity requires session evidence for selection", () => {
    const baseline = [{ trainer_id: trainer.id, activo: false, effective_at: "2026-10-28T15:44:00" }];
    strictEqual(trainerAvailableInMonth(trainer, "2026-02", baseline, []), false);
    strictEqual(trainerAvailableInMonth(trainer, "2026-02", baseline, [{ trainer_id: trainer.id, fecha: "2026-02-10" }]), true);
  });
});