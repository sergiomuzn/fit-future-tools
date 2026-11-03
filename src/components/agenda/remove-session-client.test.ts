import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { clientRemovalAction, EMPTY_SESSION_CLIENT } from "./remove-session-client";

describe("removing a client is not cancelling a session", () => {
  test("last manual client leaves an empty session", () => {
    strictEqual(clientRemovalAction(false, 0), "clear");
  });
  test("manual group removes only the selected client row", () => {
    strictEqual(clientRemovalAction(false, 1), "delete");
  });
  test("propagated slot removes its booking without cancelling the slot", () => {
    strictEqual(clientRemovalAction(true, 0), "delete");
  });
  test("clearing a client preserves session state including performed and trial sessions", () => {
    for (const estado of ["reservada", "realizada", "prueba", "renovacion"]) {
      const result = { estado, client_id: "client", ...EMPTY_SESSION_CLIENT };
      strictEqual(result.estado, estado);
      strictEqual(result.client_id, null);
      strictEqual(result.booked_by_user_id, null);
    }
    deepStrictEqual(Object.keys(EMPTY_SESSION_CLIENT).sort(), ["booked_by_user_id", "booking_tipo", "client_id", "por_confirmar"]);
  });
});