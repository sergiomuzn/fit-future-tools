import type { Session } from "@/lib/db";

type SessionIdentity = Pick<Session, "id" | "estado" | "slot_instance_id"> & {
  reemplaza_session_id?: string | null;
};

/**
 * Manual sessions are independent; only an explicit link hides a cancellation:
 * the same propagated slot, or an active row that replaces it (reemplaza_session_id).
 */
export function visibleAgendaSessions<T extends SessionIdentity>(sessions: T[]): T[] {
  const activos = sessions.filter((s) => s.estado !== "cancelada");
  const activeSlots = new Set(activos.flatMap((s) => (s.slot_instance_id ? [s.slot_instance_id] : [])));
  const reemplazadas = new Set(activos.flatMap((s) => (s.reemplaza_session_id ? [s.reemplaza_session_id] : [])));
  return sessions.filter((session) =>
    session.estado !== "cancelada" ||
    (!reemplazadas.has(session.id) &&
      (!session.slot_instance_id || !activeSlots.has(session.slot_instance_id))),
  );
}

/** Expand visible blocks without restoring cancellations replaced by active rows. */
export function expandVisibleAgendaBlocks<T extends SessionIdentity>(sessions: T[], blocks: T[][]): T[] {
  const eligible = new Set(visibleAgendaSessions(sessions).map((session) => session.id));
  const seen = new Set<string>();
  return blocks.flat().filter((session) => {
    if (!eligible.has(session.id) || seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}
