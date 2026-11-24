import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { blockAllTrial } from "./session-trial";

describe("blockAllTrial", () => {
  test("is trial when every active client is in Sesión de Prueba", () => {
    strictEqual(blockAllTrial([{ client_id: "a", tipo: "prueba" }, { client_id: "b", tipo: "prueba" }]), true);
  });
  test("is not trial when one client is not in Sesión de Prueba", () => {
    strictEqual(blockAllTrial([{ client_id: "a", tipo: "prueba" }, { client_id: "b", tipo: null }]), false);
  });
  test("ignores cancelled clients", () => {
    strictEqual(blockAllTrial([{ client_id: "a", tipo: "prueba" }, { client_id: "b", tipo: null, estado: "cancelada" }]), true);
  });
});
