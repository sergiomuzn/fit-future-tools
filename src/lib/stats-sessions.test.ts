import { describe, test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { countsInSessionTotal, sessionsInMonthTotal, fetchAllSessionPages } from "./stats-sessions";

const now = new Date("2026-10-28T15:30:00");
const session = { fecha: "2026-10-16", hora_fin: "17:00:00", estado: "realizada", no_contabilizar: false, por_confirmar: false };

describe("monthly session accounting", () => {
  test("performed sessions count", () => strictEqual(countsInSessionTotal(session, now), true));
  test("accounted cancellations count", () => strictEqual(countsInSessionTotal({ ...session, estado: "cancelada" }, now), true));
  test("unaccounted cancellations do not count", () => strictEqual(countsInSessionTotal({ ...session, estado: "cancelada", no_contabilizar: true }, now), false));
  test("unaccounted performed sessions do not count", () => strictEqual(countsInSessionTotal({ ...session, no_contabilizar: true }, now), false));
  test("pending confirmation never counts in any state", () => {
    for (const estado of ["realizada", "cancelada", "prueba", "renovacion", "reservada"]) {
      strictEqual(countsInSessionTotal({ ...session, estado, por_confirmar: true }, now), false);
    }
  });
  test("empty performed sessions from every service count", () => {
    const rows = ["individual", "grupal", "pilates"].map((servicio_slug) => ({ ...session, servicio_slug, client_id: null, group_id: null }));
    strictEqual(sessionsInMonthTotal(rows, "2026-10", now).length, 3);
  });
  test("performed trial sessions count", () => strictEqual(countsInSessionTotal({ ...session, estado: "prueba" }, now), true));
  test("performed renewal sessions count", () => strictEqual(countsInSessionTotal({ ...session, estado: "renovacion" }, now), true));
  test("future trials and renewals do not count as performed", () => {
    for (const estado of ["prueba", "renovacion"]) strictEqual(countsInSessionTotal({ ...session, estado, fecha: "2026-10-29" }, now), false);
  });
  test("unfinished trials do not count", () => strictEqual(countsInSessionTotal({ ...session, estado: "prueba", fecha: "2026-10-28" }, now), false));
  test("reserved sessions do not count", () => strictEqual(countsInSessionTotal({ ...session, estado: "reservada" }, now), false));
  test("only the selected month contributes", () => {
    const rows = ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"].map((fecha) => ({ ...session, fecha }));
    deepStrictEqual(sessionsInMonthTotal(rows, "2026-10", now).map((s) => s.fecha), ["2026-10-01", "2026-10-31"]);
  });
  test("independent rows and accounted cancellations remain in the sum", () => {
    strictEqual(sessionsInMonthTotal([session, session, { ...session, estado: "cancelada" }], "2026-10", now).length, 3);
  });
  test("all 3031 historical rows load beyond the first 1000", async () => {
    const rows = Array.from({ length: 3031 }, (_, id) => id);
    const loaded = await fetchAllSessionPages(async (from, to) => rows.slice(from, to + 1));
    deepStrictEqual(loaded, rows);
  });
  test("paging failures are not returned as a partial total", async () => {
    const { rejects } = await import("node:assert");
    await rejects(fetchAllSessionPages(async (from) => {
      if (from > 0) throw new Error("Read failed");
      return Array.from({ length: 1000 }, (_, id) => id);
    }), /Read failed/);
  });
});