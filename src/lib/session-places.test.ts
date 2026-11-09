import { test } from "node:test";
import { strictEqual } from "node:assert";
import { reservedSessionPlaces, sessionPlaces } from "./session-places";

test("two reserved places out of six configured service places show 2/6", () => {
  strictEqual(sessionPlaces(6, 2).label, "2/6");
});
test("a full individual session shows 1/1, not 1/0", () => {
  strictEqual(sessionPlaces(1, 1).label, "1/1");
});
test("empty, cancelled and queued rows do not reserve places", () => {
  strictEqual(reservedSessionPlaces([
    { client_id: "a", estado: "reservada" },
    { client_id: "b", estado: "realizada" },
    { client_id: null, estado: "reservada" },
    { client_id: "c", estado: "cancelada" },
    { client_id: "d", booking_tipo: "cola" },
    { client_id: "e", __cola: true },
  ]), 2);
});
test("the configured service capacity remains fixed without hiding existing clients", () => {
  strictEqual(sessionPlaces(1, 2).label, "2/1");
});
test("a full six-place session keeps six as the denominator", () => {
  strictEqual(sessionPlaces(6, 6).label, "6/6");
});
test("empty six-place sessions retain the service's full capacity", () => {
  strictEqual(sessionPlaces(6, 0).label, "0/6");
});