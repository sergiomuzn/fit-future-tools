import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { visibleAgendaSessions } from "./session-visibility";

const cancelled = {
  id: "cancelled", estado: "cancelada" as const, slot_instance_id: null,
  fecha: "2026-10-20", hora_inicio: "10:00:00", servicio_slug: "ep", trainer_id: "trainer-a",
};
const active = { ...cancelled, id: "active", estado: "reservada" as const, trainer_id: "trainer-b" };

describe("cancelled agenda session visibility", () => {
  test("independent manual sessions at the same time remain visible", () => {
    deepStrictEqual(visibleAgendaSessions([cancelled, active]).map((s) => s.id), ["cancelled", "active"]);
  });
  test("sharing a trainer does not merge independent manual sessions", () => {
    strictEqual(visibleAgendaSessions([cancelled, { ...active, trainer_id: cancelled.trainer_id }]).length, 2);
  });
  test("a slot booking does not hide a manual cancellation", () => {
    strictEqual(visibleAgendaSessions([cancelled, { ...active, slot_instance_id: "slot-a" }]).length, 2);
  });
  test("a manual booking does not hide a slot cancellation", () => {
    strictEqual(visibleAgendaSessions([{ ...cancelled, slot_instance_id: "slot-a" }, active]).length, 2);
  });
  test("a replacement in the exact same slot hides only its cancelled block", () => {
    deepStrictEqual(visibleAgendaSessions([
      { ...cancelled, slot_instance_id: "slot-a" },
      { ...active, slot_instance_id: "slot-a" },
    ]).map((s) => s.id), ["active"]);
  });
  test("different propagated slots at the same time stay independent", () => {
    strictEqual(visibleAgendaSessions([
      { ...cancelled, slot_instance_id: "slot-a" },
      { ...active, slot_instance_id: "slot-b" },
    ]).length, 2);
  });
  test("a cancelled slot without a replacement remains visible", () => {
    strictEqual(visibleAgendaSessions([{ ...cancelled, slot_instance_id: "slot-a" }]).length, 1);
  });
});