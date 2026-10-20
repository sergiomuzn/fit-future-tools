import { describe, expect, test } from "bun:test";
import { visibleAgendaSessions } from "./session-visibility";

const cancelled = {
  id: "cancelled", estado: "cancelada" as const, slot_instance_id: null,
  fecha: "2026-10-20", hora_inicio: "10:00:00", servicio_slug: "ep", trainer_id: "trainer-a",
};
const active = { ...cancelled, id: "active", estado: "reservada" as const, trainer_id: "trainer-b" };

describe("cancelled agenda session visibility", () => {
  test("independent manual sessions at the same time remain visible", () => {
    expect(visibleAgendaSessions([cancelled, active]).map((s) => s.id)).toEqual(["cancelled", "active"]);
  });
  test("sharing a trainer does not merge independent manual sessions", () => {
    expect(visibleAgendaSessions([cancelled, { ...active, trainer_id: cancelled.trainer_id }])).toHaveLength(2);
  });
  test("a slot booking does not hide a manual cancellation", () => {
    expect(visibleAgendaSessions([cancelled, { ...active, slot_instance_id: "slot-a" }])).toHaveLength(2);
  });
  test("a manual booking does not hide a slot cancellation", () => {
    expect(visibleAgendaSessions([{ ...cancelled, slot_instance_id: "slot-a" }, active])).toHaveLength(2);
  });
  test("a replacement in the exact same slot hides only its cancelled block", () => {
    expect(visibleAgendaSessions([
      { ...cancelled, slot_instance_id: "slot-a" },
      { ...active, slot_instance_id: "slot-a" },
    ]).map((s) => s.id)).toEqual(["active"]);
  });
  test("different propagated slots at the same time stay independent", () => {
    expect(visibleAgendaSessions([
      { ...cancelled, slot_instance_id: "slot-a" },
      { ...active, slot_instance_id: "slot-b" },
    ])).toHaveLength(2);
  });
  test("a cancelled slot without a replacement remains visible", () => {
    expect(visibleAgendaSessions([{ ...cancelled, slot_instance_id: "slot-a" }])).toHaveLength(1);
  });
});