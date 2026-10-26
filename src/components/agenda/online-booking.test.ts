import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { hasOnlineBookingDistinction, hideCancelledSelfBooking, normalizeQueueKey, sessionQueueKey } from "./online-booking";
import { DEFAULT_BEHAVIOR_CONFIG, parseBehaviorConfig } from "@/lib/behavior-config";

const online = { client_id: "client", booked_by_user_id: "user", booking_tipo: "individual", estado: "reservada" };
const centre = { ...online, booking_tipo: "centro" };
const cancelled = { ...online, estado: "cancelada" };

describe("self-booking distinction", () => {
  test("disabled by default, including existing centre settings", () => {
    strictEqual(DEFAULT_BEHAVIOR_CONFIG.distinguirReservasOnline, false);
    strictEqual(parseBehaviorConfig({}).distinguirReservasOnline, false);
    strictEqual(hasOnlineBookingDistinction(false, [online]), false);
  });
  test("one active self-booking distinguishes a mixed session", () => {
    strictEqual(hasOnlineBookingDistinction(true, [centre, online]), true);
  });
  test("centre bookings alone never distinguish a session", () => {
    strictEqual(hasOnlineBookingDistinction(true, [centre]), false);
  });
  test("cancelling the last self-booking removes the distinction", () => {
    strictEqual(hasOnlineBookingDistinction(true, [centre, cancelled]), false);
  });
  test("another active self-booking keeps the distinction", () => {
    strictEqual(hasOnlineBookingDistinction(true, [cancelled, online]), true);
  });
});

describe("single-place cancellation visibility", () => {
  test("cancelled self-booking of one place without queue disappears", () => {
    strictEqual(hideCancelledSelfBooking(cancelled, 1, false), true);
  });
  test("waiting client keeps the cancelled session visible", () => {
    strictEqual(hideCancelledSelfBooking(cancelled, 1, true), false);
  });
  test("multi-place cancellation remains visible", () => {
    strictEqual(hideCancelledSelfBooking(cancelled, 2, false), false);
  });
  test("centre reservation cancellations remain visible", () => {
    strictEqual(hideCancelledSelfBooking({ ...centre, estado: "cancelada" }, 1, false), false);
  });
  test("active one-place self-booking stays visible", () => {
    strictEqual(hideCancelledSelfBooking(online, 1, false), false);
  });
  test("same-time independent slots never share a queue", () => {
    const session = { fecha: "2026-10-26", hora_inicio: "16:00:00" };
    strictEqual(sessionQueueKey({ ...session, slot_instance_id: "a" }), "hueco|a");
    strictEqual(sessionQueueKey({ ...session, slot_instance_id: "b" }), "hueco|b");
  });
  test("group queue matches times with and without seconds", () => {
    const session = { group_id: "group", fecha: "2026-10-26", hora_inicio: "16:00:00" };
    strictEqual(sessionQueueKey(session), normalizeQueueKey("group|2026-10-26|16:00"));
    strictEqual(sessionQueueKey(session), normalizeQueueKey("group|2026-10-26|16:00:00"));
  });
});