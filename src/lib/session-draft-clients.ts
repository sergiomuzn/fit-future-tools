import { clientCancellationFields } from "./session-state";

export interface DraftCancellation {
  id: string;
  clientId: string;
  /** Existing reservation to cancel at Save; absent for a new draft client. */
  sessionId?: string;
  noContabilizar: boolean;
  incidencia?: string;
}

/** Live cache rows only initialize an editor; refreshes cannot alter its draft. */
export function retainSessionEditorRows<T>(snapshot: { key: string | null; rows: T[] }, key: string | null, rows: T[]) {
  return snapshot.key === key ? snapshot : { key, rows: key === null ? [] : [...rows] };
}

/** Resize free rows without moving a selected client into an earlier empty row. */
export function resizeClientPickerRows(selected: (string | null)[], count: number) {
  const next = [...selected];
  const size = Math.max(0, count);
  while (next.length > size) {
    const empty = next.lastIndexOf(null);
    if (empty < 0) return next.slice(0, size);
    next.splice(empty, 1);
  }
  return [...next, ...Array.from({ length: size - next.length }, () => null)];
}

/** Keep existing notes; a cancellation note belongs only to its client's row. */
export function cancellationIncidence(existing: string | null | undefined, note: string | null | undefined) {
  return [existing?.trim(), note?.trim()].filter(Boolean).join("\n") || null;
}

/** A cancelled session's edited incidence is local, never a recurring-series note. */
export function sessionIncidenceEdits(edited: string | null, cancelled: boolean) {
  return {
    current: { incidencia: edited },
    future: cancelled ? {} : { incidencia: edited },
  };
}

export function cancelDraftClient(selected: (string | null)[], cancelled: DraftCancellation[], clientId: string, pending: boolean, defaultNoCount: boolean, incidencia?: string) {
  return {
    selected: selected.map((id) => id === clientId ? null : id),
    cancelled: [...cancelled, { id: crypto.randomUUID(), clientId, incidencia, noContabilizar: clientCancellationFields(pending, defaultNoCount).no_contabilizar }],
  };
}

/** Empty sessions get a placeholder only when there is no cancellation row. */
export function draftSessionMembers(selected: (string | null)[], cancelled: DraftCancellation[]) {
  const active = selected.filter((id): id is string => !!id).map((clientId) => ({ clientId, cancellation: null as DraftCancellation | null }));
  const rows = [...active, ...cancelled.map((cancellation) => ({ clientId: cancellation.clientId, cancellation }))];
  return rows.length ? rows : [{ clientId: null, cancellation: null }];
}
/** Derive saved membership without mutating persisted rows while editing. */
export function sessionDraftChanges<T extends { id: string; estado: string; client_id: string | null }>(rows: T[], removedIds: string[], cancellations: DraftCancellation[]) {
  const removed = new Set(removedIds);
  const cancelled = new Set(cancellations.map((c) => c.sessionId).filter(Boolean));
  return {
    active: rows.filter((r) => r.estado !== "cancelada" && !removed.has(r.id) && !cancelled.has(r.id)),
    removed: rows.filter((r) => removed.has(r.id) && !cancelled.has(r.id)),
    cancelled: rows.filter((r) => r.estado === "cancelada" || cancelled.has(r.id)),
  };
}
