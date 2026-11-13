import { test } from "node:test";
import { strictEqual } from "node:assert";
import { countsInSessionTotal } from "./stats-sessions";
const base = { fecha: "2026-11-02", hora_fin: "10:00:00", estado: "realizada", no_contabilizar: false, por_confirmar: false };
test("session with no client is not performed", () => strictEqual(countsInSessionTotal({ ...base, client_id: null, group_id: null }), false));
test("session with one client is performed", () => strictEqual(countsInSessionTotal({ ...base, client_id: "c" }), true));
