import { test } from "node:test";
import { strictEqual } from "node:assert";
import { debeEnviarEmailCentro, parseEmailCentro } from "./email-centro";

test("center emails are off until the centre turns them on", () => {
  strictEqual(debeEnviarEmailCentro(parseEmailCentro({}), "reserva_creada"), false);
});
test("turned on, a new booking emails the centre by default", () => {
  strictEqual(debeEnviarEmailCentro(parseEmailCentro({ activo: true }), "reserva_creada"), true);
});
test("a type switched off is not emailed", () => {
  const cfg = parseEmailCentro({ activo: true, tipos: { reserva_cancelada_cliente: false } });
  strictEqual(debeEnviarEmailCentro(cfg, "reserva_cancelada_cliente"), false);
});
test("the centre's own decisions are never emailed", () => {
  strictEqual(debeEnviarEmailCentro(parseEmailCentro({ activo: true }), "reserva_confirmada_centro"), false);
});
