import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { canMarkSessionPending, isSelfBooking } from "./online-booking";

describe("marking a session pending confirmation", () => {
  test("online bookings cannot be marked pending, including after centre confirmation", () => {
    for (const por_confirmar of [true, false]) {
      const booking = { client_id: "client", booked_by_user_id: "user", booking_tipo: "individual", estado: "reservada", por_confirmar };
      strictEqual(canMarkSessionPending(booking.estado, isSelfBooking(booking)), false);
    }
  });
  test("centre-created reservations can still be marked pending", () => {
    const booking = { client_id: "client", booked_by_user_id: null, booking_tipo: "centro", estado: "reservada" };
    strictEqual(canMarkSessionPending(booking.estado, isSelfBooking(booking)), true);
  });
  test("performed and cancelled sessions cannot be marked pending", () => {
    strictEqual(canMarkSessionPending("realizada", false), false);
    strictEqual(canMarkSessionPending("cancelada", false), false);
  });
});