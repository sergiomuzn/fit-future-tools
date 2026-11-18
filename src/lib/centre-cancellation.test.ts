import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { notifiesClientOnCancellation, requiresDeletionReason, validCancellationReason, withCancellationReason } from "./centre-cancellation";

const online = { client_id: "client", booked_by_user_id: "user", booking_tipo: "app", estado: "reservada", por_confirmar: false };
describe("centre cancellation reasons", () => {
  it("requires a reason for a confirmed online reservation", () => strictEqual(requiresDeletionReason([online]), true));
  it("does not request reasons for manually assigned clients", () => strictEqual(requiresDeletionReason([{ ...online, booking_tipo: "centro" }]), false));
  it("does not request deletion reasons for pending online bookings", () => strictEqual(requiresDeletionReason([{ ...online, por_confirmar: true }]), false));
  it("detects a confirmed online client in a mixed block", () => strictEqual(requiresDeletionReason([{ ...online, booking_tipo: "centro" }, online]), true));
  it("ignores cancelled online reservations", () => strictEqual(requiresDeletionReason([{ ...online, estado: "cancelada" }]), false));
  it("rejects blank justifications", () => { strictEqual(validCancellationReason("   "), false); strictEqual(validCancellationReason("Entrenador enfermo"), true); });
  it("retains the reason in the client notice", () => strictEqual(withCancellationReason("Reserva cancelada", " Entrenador enfermo "), "Reserva cancelada\nMotivo: Entrenador enfermo"));
  it("notifies the client when the centre cancels", () => strictEqual(notifiesClientOnCancellation(undefined), true));
  it("notifies the client when the centre states it cancelled", () => strictEqual(notifiesClientOnCancellation("centro"), true));
  it("keeps silent when the centre marks the client as cancelling", () => strictEqual(notifiesClientOnCancellation("cliente"), false));
});