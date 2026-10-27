import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { expandVisibleAgendaBlocks, visibleAgendaSessions } from "./session-visibility";

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
describe("manual rebooking link", () => {
  test("a linked replacement hides its cancelled manual session", () => {
    deepStrictEqual(visibleAgendaSessions([cancelled, { ...active, reemplaza_session_id: "cancelled" }]).map((s) => s.id), ["active"]);
  });
  test("an unlinked same-time booking does not hide it", () => {
    strictEqual(visibleAgendaSessions([cancelled, { ...active, reemplaza_session_id: "other" }]).length, 2);
  });
});

describe("shared class block visibility", () => {
  const bookings = [1, 2, 3].map((n) => ({ ...active, id: `client-${n}`, slot_instance_id: "four-place-slot" }));
  test("three active bookings in a four-place class all remain visible", () => {
    deepStrictEqual(expandVisibleAgendaBlocks(bookings, [bookings]).map((s) => s.id), ["client-1", "client-2", "client-3"]);
  });
  test("expansion does not restore a cancellation in the same slot", () => {
    const old = { ...cancelled, slot_instance_id: "four-place-slot" };
    deepStrictEqual(expandVisibleAgendaBlocks([old, ...bookings], [[...bookings, old]]).map((s) => s.id), ["client-1", "client-2", "client-3"]);
  });
  test("legacy blocks keep the active representative first", () => {
    deepStrictEqual(expandVisibleAgendaBlocks([cancelled, active], [[active, cancelled]]).map((s) => s.id), ["active", "cancelled"]);
  });
  test("independent same-time slots retain every active booking", () => {
    const other = { ...active, id: "other-slot", slot_instance_id: "other-slot" };
    strictEqual(expandVisibleAgendaBlocks([...bookings, other], [bookings, [other]]).length, 4);
  });
  test("a block hidden by queue-aware cancellation filtering stays hidden", () => {
    deepStrictEqual(expandVisibleAgendaBlocks([cancelled], []), []);
  });
  test("an explicitly replaced manual cancellation is not restored", () => {
    const replacement = { ...active, reemplaza_session_id: cancelled.id };
    deepStrictEqual(expandVisibleAgendaBlocks([cancelled, replacement], [[replacement], [cancelled]]).map((s) => s.id), ["active"]);
  });
});
