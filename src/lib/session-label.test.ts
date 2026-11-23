import { test } from "node:test";
import { strictEqual } from "node:assert";
import { sessionMainLabel } from "./session-label";

test("a session with no clients and no note still says Sin clientes", () => {
  strictEqual(sessionMainLabel(2, [], 100), "Sin clientes");
});

test("a session with no clients but a note shows the note instead of Sin clientes", () => {
  strictEqual(sessionMainLabel(2, [], 100, "Cerrado por feriado"), "Cerrado por feriado");
});

test("a blank note does not replace Sin clientes", () => {
  strictEqual(sessionMainLabel(2, [], 100, "   "), "Sin clientes");
});

test("clients keep the label even when the session has a note", () => {
  strictEqual(sessionMainLabel(2, ["Ana García"], 100, "Cerrado por feriado"), "Ana García");
});
