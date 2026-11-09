import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { QueryClient } from "@tanstack/react-query";
import { agendaCacheIncludesDate, commitAgendaRows, removeAgendaRows } from "./agenda-session-cache";

test("committed sessions appear immediately only in their day and containing ranges", () => {
  const qc = new QueryClient();
  const day = ["sessions", "2026-11-10"];
  const week = ["sessions-range", "2026-11-09", "2026-11-15"];
  const other = ["sessions", "2026-11-11"];
  const stats = ["sessions", "statistics-all"];
  for (const key of [day, week, other, stats]) qc.setQueryData(key, []);
  const row = { id: "new", fecha: "2026-11-10" };
  commitAgendaRows(qc, [row]);
  deepStrictEqual(qc.getQueryData(day), [row]);
  deepStrictEqual(qc.getQueryData(week), [row]);
  deepStrictEqual(qc.getQueryData(other), []);
  deepStrictEqual(qc.getQueryData(stats), []);
  strictEqual(agendaCacheIncludesDate(week, "2026-11-16"), false);
  qc.clear();
});

test("same-time independent rows stay separate, and deletion or rollback targets exact IDs", () => {
  const qc = new QueryClient();
  const key = ["sessions", "2026-11-10"];
  const a = { id: "a", fecha: "2026-11-10", hora_inicio: "10:00:00" };
  const b = { ...a, id: "b" };
  qc.setQueryData(key, [a, b]);
  commitAgendaRows(qc, [{ ...a, trainer_id: "trainer" }]);
  removeAgendaRows(qc, ["a"]);
  deepStrictEqual(qc.getQueryData(key), [b]);
  commitAgendaRows(qc, [a]);
  deepStrictEqual(qc.getQueryData(key), [b, a]);
  qc.clear();
});