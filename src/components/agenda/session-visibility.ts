import type { Session } from "@/lib/db";

type SessionIdentity = Pick<Session, "id" | "estado" | "slot_instance_id">;

/** Manual sessions are independent; only an explicit slot links separate rows. */
export function visibleAgendaSessions<T extends SessionIdentity>(sessions: T[]): T[] {
  const activeSlots = new Set(
    sessions.flatMap((session) =>
      session.estado !== "cancelada" && session.slot_instance_id
        ? [session.slot_instance_id]
        : [],
    ),
  );
  return sessions.filter((session) =>
    session.estado !== "cancelada" ||
    !session.slot_instance_id ||
    !activeSlots.has(session.slot_instance_id),
  );
}