import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session } from "@/lib/db";
import { expandVisibleAgendaBlocks, visibleAgendaSessions } from "./session-visibility";
import { hideCancelledSelfBooking, normalizeQueueKey, sessionQueueKey } from "./online-booking";

export function agendaBlockMembers(session: Session, sessions: Session[]): Session[] {
  if (session.slot_instance_id) return sessions.filter((row) => row.slot_instance_id === session.slot_instance_id);
  if (session.ocupacion === 2 && session.recurrencia_id) return sessions.filter((row) =>
    row.ocupacion === 2 && row.recurrencia_id === session.recurrencia_id && row.fecha === session.fecha &&
    row.hora_inicio === session.hora_inicio && row.hora_fin === session.hora_fin);
  return [session];
}

export function useOnlineAgendaVisibility(sessions: Session[], from: string, to: string, capacities: Map<string, number>) {
  const { data: details } = useQuery({
    queryKey: ["agenda-booking-details", from, to],
    queryFn: async () => {
      const [queue, slots, groups] = await Promise.all([
        supabase.from("reserva_cola").select("clave").gte("fecha", from).lte("fecha", to).in("estado", ["en_cola", "ofrecida"]),
        supabase.from("service_slot_instances").select("id,capacidad").gte("fecha", from).lte("fecha", to),
        supabase.from("groups").select("id,capacidad"),
      ]);
      if (queue.error) throw queue.error;
      if (slots.error) throw slots.error;
      if (groups.error) throw groups.error;
      return {
        queue: new Set((queue.data ?? []).map((row) => normalizeQueueKey(row.clave))),
        slots: new Map((slots.data ?? []).map((row) => [row.id, row.capacidad])),
        groups: new Map((groups.data ?? []).map((row) => [row.id, row.capacidad])),
      };
    },
    refetchInterval: 1000,
  });
  return useMemo(() => {
    const grouped: Session[] = [];
    const blocks = new Map<string, Session[]>();
    const seen = new Set<string>();
    for (const session of sessions) {
      if (seen.has(session.id)) continue;
      const members = agendaBlockMembers(session, sessions);
      for (const member of members) seen.add(member.id);
      const representative = members.find((row) => row.estado !== "cancelada") ?? session;
      grouped.push(representative);
      blocks.set(representative.id, [representative, ...members.filter((row) => row.id !== representative.id)]);
    }
    const visible = visibleAgendaSessions(grouped).filter((session) => {
      if (!details) return true;
      const capacity = (session.slot_instance_id ? details.slots.get(session.slot_instance_id) : undefined)
        ?? (session.group_id ? details.groups.get(session.group_id) : undefined)
        ?? capacities.get(session.servicio_slug ?? "") ?? (session.ocupacion === 2 ? 2 : 1);
      const key = sessionQueueKey(session);
      return !hideCancelledSelfBooking(session, capacity, key !== null && details.queue.has(key));
    });
    return expandVisibleAgendaBlocks(sessions, visible.map((session) => blocks.get(session.id) ?? [session]));
  }, [sessions, details, capacities]);
}