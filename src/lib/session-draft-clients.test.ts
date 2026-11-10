import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { cancelDraftClient, draftSessionMembers, sessionDraftChanges } from "./session-draft-clients";

test("cancelling an unsaved client moves only that client into cancellations", () => {
  const result = cancelDraftClient(["a", "b"], [], "a", false, false);
  deepStrictEqual(result.selected, [null, "b"]);
  strictEqual(result.cancelled[0]?.clientId, "a");
  strictEqual(result.cancelled[0]?.noContabilizar, false);
});
test("unsaved pending cancellation never counts", () => {
  strictEqual(cancelDraftClient(["a"], [], "a", true, false).cancelled[0]?.noContabilizar, true);
});
test("unsaved cancellation respects centre no-count default", () => {
  strictEqual(cancelDraftClient(["a"], [], "a", false, true).cancelled[0]?.noContabilizar, true);
});
test("saving only cancellations preserves the client without an active empty row", () => {
  const { selected, cancelled } = cancelDraftClient(["a"], [], "a", false, false);
  const rows = draftSessionMembers(selected, cancelled);
  strictEqual(rows.length, 1);
  strictEqual(rows[0]?.clientId, "a");
  strictEqual(rows[0]?.cancellation?.noContabilizar, false);
});
test("mixed draft keeps reserved clients and individual cancellation values", () => {
  const rows = draftSessionMembers(["b"], [{ id: "c", clientId: "a", noContabilizar: true }]);
  strictEqual(rows.length, 2);
  strictEqual(rows[0]?.cancellation, null);
  strictEqual(rows[1]?.cancellation?.noContabilizar, true);
});
test("truly empty draft preserves an empty session", () => {
  deepStrictEqual(draftSessionMembers([], []), [{ clientId: null, cancellation: null }]);
});
test("editing removal and cancellation does not modify persisted session rows", () => {
  const rows = [{ id: "a", client_id: "first", estado: "reservada" }, { id: "b", client_id: "second", estado: "reservada" }];
  const before = structuredClone(rows);
  const result = sessionDraftChanges(rows, ["b"], [{ id: "a", sessionId: "a", clientId: "first", noContabilizar: false }]);
  deepStrictEqual(rows, before);
  deepStrictEqual(result.active, []);
  deepStrictEqual(result.removed.map((r) => r.id), ["b"]);
  deepStrictEqual(result.cancelled.map((r) => r.id), ["a"]);
});
