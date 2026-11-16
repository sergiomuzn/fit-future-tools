import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { cancellationIncidence, cancelDraftClient, draftSessionMembers, sessionDraftChanges, sessionIncidenceEdits } from "./session-draft-clients";

test("a cancellation incidence is not copied to future sessions", () => {
  const edits = sessionIncidenceEdits("Cliente enfermo", true);
  strictEqual(edits.current.incidencia, "Cliente enfermo");
  const future = { incidencia: "Nota de la próxima sesión", ...edits.future };
  strictEqual(future.incidencia, "Nota de la próxima sesión");
});
test("editing and clearing a cancelled session's note uses the editor value", () => {
  strictEqual(sessionIncidenceEdits("Nota corregida", true).current.incidencia, "Nota corregida");
  strictEqual(sessionIncidenceEdits(null, true).current.incidencia, null);
});
test("cancelling after editing notes retains both the edit and the cancellation note", () => {
  const note = cancellationIncidence("Nota editada", "Cliente enfermo");
  strictEqual(sessionIncidenceEdits(note, true).current.incidencia, "Nota editada\nCliente enfermo");
});
test("shared notes on non-cancelled sessions still follow the selected future scope", () => {
  strictEqual(sessionIncidenceEdits("Nota compartida", false).future.incidencia, "Nota compartida");
  strictEqual(sessionIncidenceEdits(null, false).future.incidencia, null);
});

test("cancellation note stays on the affected client through draft serialization", () => {
  const draft = cancelDraftClient(["a", "b"], [], "a", false, true, "Avisó por enfermedad");
  const rows = draftSessionMembers(draft.selected, draft.cancelled);
  strictEqual(rows[0]?.clientId, "b");
  strictEqual(rows[0]?.cancellation, null);
  strictEqual(rows[1]?.cancellation?.incidencia, "Avisó por enfermedad");
  strictEqual(rows[1]?.cancellation?.noContabilizar, true);
});
test("cancellation incidence preserves previous notes without requiring a new note", () => {
  strictEqual(cancellationIncidence("Nota previa", " Enfermedad "), "Nota previa\nEnfermedad");
  strictEqual(cancellationIncidence("Nota previa", " "), "Nota previa");
  strictEqual(cancellationIncidence(null, " "), null);
});
test("an empty incidence never prevents cancelling the selected client", () => {
  const draft = cancelDraftClient(["a"], [], "a", false, false, "");
  const rows = draftSessionMembers(draft.selected, draft.cancelled);
  strictEqual(rows.length, 1);
  strictEqual(rows[0]?.clientId, "a");
  strictEqual(rows[0]?.cancellation?.incidencia, "");
  strictEqual(cancellationIncidence(null, rows[0]?.cancellation?.incidencia), null);
});

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
