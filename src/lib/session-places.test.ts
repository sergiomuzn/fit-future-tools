import { test } from "node:test";
import { strictEqual } from "node:assert";
import { reservedSessionPlaces, sessionPlaces } from "./session-places";

test("six service places with two clients show two reserved and four available", () => {
  strictEqual(sessionPlaces(6, 2).label, "2/4");
});
test("a full individual session shows one reserved and zero available", () => {
  strictEqual(sessionPlaces(1, 1).label, "1/0");
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
test("available places never go negative without hiding existing clients", () => {
  strictEqual(sessionPlaces(1, 2).label, "2/0");
});
test("empty six-place sessions retain the service's full capacity", () => {
  strictEqual(sessionPlaces(6, 0).label, "0/6");
});