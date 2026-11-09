import { test } from "node:test";
import { strictEqual } from "node:assert";
import { DEFAULT_SHOW_SESSION_CLIENT_BALANCE, sessionClientBalance } from "./session-client-balance";

const bonos = [{ client_id: "client", activo: true, fecha_inicio: "2026-11-01", bono_catalogo_id: "pack", sesiones_disponibles: 7 }];
const catalogo = [{ id: "pack", tipo: "individual" }];

test("remaining sessions are disabled by default", () => {
  strictEqual(DEFAULT_SHOW_SESSION_CLIENT_BALANCE, false);
  strictEqual(sessionClientBalance(undefined, "client", bonos, catalogo), null);
});
test("an empty client input never shows remaining sessions", () => {
  strictEqual(sessionClientBalance(true, null, bonos, catalogo), null);
});
test("enabled selection shows the selected client's balance", () => {
  strictEqual(sessionClientBalance(true, "client", bonos, catalogo), 7);
  strictEqual(sessionClientBalance(false, "client", bonos, catalogo), null);
});
test("balance uses the latest active bono and preserves zero and negative values", () => {
  for (const balance of [0, -2]) {
    strictEqual(sessionClientBalance(true, "client", [...bonos,
      { ...bonos[0], fecha_inicio: "2026-11-09", sesiones_disponibles: balance },
      { ...bonos[0], activo: false, fecha_inicio: "2026-11-10", sesiones_disponibles: 99 },
    ], catalogo), balance);
  }
});
test("clients without a bono and non-session passes keep their existing treatment", () => {
  strictEqual(sessionClientBalance(true, "other", bonos, catalogo), "Sin bono");
  strictEqual(sessionClientBalance(true, "client", bonos, [{ id: "pack", tipo: "gympass" }]), null);
});