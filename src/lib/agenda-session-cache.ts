import type { QueryClient, QueryKey } from "@tanstack/react-query";

type AgendaRow = { id: string; fecha: string };

export function agendaCacheIncludesDate(key: QueryKey, fecha: string): boolean {
  if (key[0] === "sessions" && key.length === 2 && typeof key[1] === "string") return key[1] === fecha;
  return key[0] === "sessions-range" && typeof key[1] === "string" && typeof key[2] === "string" && fecha >= key[1] && fecha <= key[2];
}

/** Apply returned, persisted rows without waiting for a second network read. */
export function commitAgendaRows<T extends AgendaRow>(qc: QueryClient, rows: T[]): void {
  for (const query of qc.getQueryCache().getAll()) {
    const included = rows.filter((row) => agendaCacheIncludesDate(query.queryKey, row.fecha));
    if (!included.length) continue;
    qc.setQueryData<T[]>(query.queryKey, (old) => {
      if (!old) return old;
      const byId = new Map(included.map((row) => [row.id, row]));
      const existing = new Set(old.map((row) => row.id));
      return [...old.map((row) => byId.has(row.id) ? { ...row, ...byId.get(row.id) } : row), ...included.filter((row) => !existing.has(row.id))];
    });
  }
}

export function removeAgendaRows(qc: QueryClient, ids: string[]): void {
  const removed = new Set(ids);
  for (const query of qc.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (key[0] !== "sessions-range" && !(key[0] === "sessions" && key.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(String(key[1])))) continue;
    qc.setQueryData<AgendaRow[]>(key, (old) => old?.filter((row) => !removed.has(row.id)));
  }
}

export function refreshAgenda(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["sessions"] });
  void qc.invalidateQueries({ queryKey: ["sessions-range"] });
}