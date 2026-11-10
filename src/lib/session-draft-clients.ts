import { clientCancellationFields } from "./session-state";

export interface DraftCancellation {
  id: string;
  clientId: string;
  /** Existing reservation to cancel at Save; absent for a new draft client. */
  sessionId?: string;
  noContabilizar: boolean;
}

export function cancelDraftClient(selected: (string | null)[], cancelled: DraftCancellation[], clientId: string, pending: boolean, defaultNoCount: boolean) {
  return {
    selected: selected.map((id) => id === clientId ? null : id),
    cancelled: [...cancelled, { id: crypto.randomUUID(), clientId, noContabilizar: clientCancellationFields(pending, defaultNoCount).no_contabilizar }],
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
