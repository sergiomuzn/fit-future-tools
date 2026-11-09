import { clientCancellationFields } from "./session-state";

export interface DraftCancellation {
  id: string;
  clientId: string;
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