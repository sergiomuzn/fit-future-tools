import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { blockAllTrial, blockAnyTrial } from "./session-trial";

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

describe("blockAnyTrial", () => {
  test("one client in Sesión de Prueba is enough", () => {
    strictEqual(blockAnyTrial([{ client_id: "a", tipo: "prueba" }, { client_id: "b", tipo: null }]), true);
  });
  test("no client in Sesión de Prueba", () => {
    strictEqual(blockAnyTrial([{ client_id: "a", tipo: null }, { client_id: "b", tipo: null }]), false);
  });
  test("a cancelled client in Sesión de Prueba does not count", () => {
    strictEqual(blockAnyTrial([{ client_id: "a", tipo: "prueba", estado: "cancelada" }, { client_id: "b", tipo: null }]), false);
  });
  test("a typed-in name in Sesión de Prueba counts", () => {
    strictEqual(blockAnyTrial([{ client_id: null, titulo: "Ana López", tipo: "prueba" }]), true);
  });
});
