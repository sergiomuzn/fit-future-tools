import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { historySessionClientIds, fittingHistoryClientCount } from "./history-session-clients";

test("group history shows each attending client, not the group representative", () => {
  deepStrictEqual(historySessionClientIds([{ client_id: "Daniel", estado: "realizada" }, { client_id: "Maria", estado: "realizada" }, { client_id: "cancelled", estado: "cancelada" }]), ["Daniel", "Maria"]);
});
test("cancelled-only history retains clients; empty rows never invent a client", () => {
  deepStrictEqual(historySessionClientIds([{ client_id: "Daniel", estado: "cancelada" }, { client_id: null, estado: "realizada" }]), ["Daniel"]);
  deepStrictEqual(historySessionClientIds([{ client_id: null, estado: "realizada" }]), []);
});
test("six names that fit two visible clients yield +4", () => {
  const count = fittingHistoryClientCount([80, 80, 80, 80, 80, 80], 220, 32);
  strictEqual(count, 2);
  strictEqual(6 - count, 4);
});
test("all names remain visible when they fit, even without overflow room", () => {
  strictEqual(fittingHistoryClientCount([80, 80], 168, 32), 2);
});