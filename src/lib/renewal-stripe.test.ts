import { describe, test } from "vitest";
import { strictEqual } from "node:assert";
import { necesitaRenovar } from "./renewal-stripe";

const cat = [{ id: "c", tipo: "individual" }, { id: "g", tipo: "gympass" }];
const bono = (o: Record<string, unknown>) => ({ client_id: "a", activo: true, fecha_inicio: "2026-01-01", bono_catalogo_id: "c", sesiones_disponibles: 3, servicio_slug: "ep", fecha_caducidad: null, ...o });

describe("renewal stripe", () => {
  test("no sessions left needs renewal", () => strictEqual(necesitaRenovar("a", [bono({ sesiones_disponibles: 0 })], cat, "ep", "2026-11-26"), true));
  test("expired bono needs renewal", () => strictEqual(necesitaRenovar("a", [bono({ fecha_caducidad: "2026-11-01" })], cat, "ep", "2026-11-26"), true));
  test("sessions left does not", () => strictEqual(necesitaRenovar("a", [bono({})], cat, "ep", "2026-11-26"), false));
  test("no bono does not", () => strictEqual(necesitaRenovar("a", [], cat, "ep", "2026-11-26"), false));
  test("gympass does not", () => strictEqual(necesitaRenovar("a", [bono({ bono_catalogo_id: "g", sesiones_disponibles: 0 })], cat, "ep", "2026-11-26"), false));
});
