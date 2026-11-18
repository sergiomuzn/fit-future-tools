import { test } from "node:test";
import { strictEqual } from "node:assert";
import { clientTabSearch } from "./client-tab-search";

test("Carmen remains searched when switching from Clientes to Bonos", () => {
  strictEqual(clientTabSearch("Carmen", "clientes", "bonos"), "Carmen");
});
test("the shared search also survives returning to Clientes", () => {
  strictEqual(clientTabSearch("Carmen", "bonos", "clientes"), "Carmen");
});
test("explicitly cleared search stays empty across tabs", () => {
  strictEqual(clientTabSearch("", "clientes", "bonos"), "");
});
test("Accesos keeps the existing independent search behavior", () => {
  strictEqual(clientTabSearch("Carmen", "clientes", "accesos"), "");
  strictEqual(clientTabSearch("Carmen", "accesos", "bonos"), "");
});