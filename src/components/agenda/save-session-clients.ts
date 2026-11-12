import { supabase, type Session } from "@/lib/db";
import { commitAgendaRows, removeAgendaRows } from "@/lib/agenda-session-cache";
import { sessionDraftChanges } from "@/lib/session-draft-clients";
import { clientRemovalAction, EMPTY_SESSION_CLIENT } from "./remove-session-client";
import { notificarReservasCanceladas, notificarSesionesAsignadas, ofrecerPlazasLiberadas } from "@/lib/notificaciones.functions";
import { sessionQueueKey } from "./online-booking";
import type { HuecoPanelDraft } from "./hueco-panel";
import type { QueryClient } from "@tanstack/react-query";

/** Called only by Save: edit-time actions never write rows or emit notices. */
export async function saveSessionClients(qc: QueryClient, rows: Session[], draft: HuecoPanelDraft, base: Session) {
  const changes = sessionDraftChanges(rows, draft.removedSessionIds, draft.cancelledClients);
  let next = [...rows];
  const notices: string[] = [];
  const queueKeys = new Set<string>();
  const accept = (row: Session) => { next = [...next.filter((r) => r.id !== row.id), row]; commitAgendaRows(qc, [row]); };
  for (const c of draft.cancelledClients.filter((c) => c.sessionId)) {
    const original = rows.find((r) => r.id === c.sessionId);
    if (!original) throw new Error("La reserva ya no está disponible. Vuelve a abrir la sesión.");
    if (original.por_confirmar) {
      const { error } = await supabase.from("sessions").update({ por_confirmar: false }).eq("id", original.id);
      if (error) throw error;
    }
    const { data, error } = await supabase.from("sessions").update({ estado: "cancelada", por_confirmar: false, no_contabilizar: c.noContabilizar }).eq("id", original.id).select("*").single();
    if (error) throw error;
    accept(data as Session); notices.push(original.id);
    const key = sessionQueueKey(original); if (key) queueKeys.add(key);
  }
  const newCancellations = draft.cancelledClients.filter((c) => !c.sessionId);
  for (const original of changes.removed) {
    const others = next.filter((r) => r.id !== original.id && r.client_id && r.estado !== "cancelada" && !draft.removedSessionIds.includes(r.id));
    const keepsCancellation = next.some((r) => r.estado === "cancelada") || newCancellations.length > 0;
    const action = clientRemovalAction(!!base.slot_instance_id, others.length, keepsCancellation);
    if (original.booked_by_user_id) {
      await notificarReservasCanceladas({ data: { sessionIds: [original.id] } }).catch(() => {});
    }
    const key = sessionQueueKey(original); if (key) queueKeys.add(key);
    if (action === "clear") {
      const { data, error } = await supabase.from("sessions").update(EMPTY_SESSION_CLIENT).eq("id", original.id).select("*").single();
      if (error) throw error; accept(data as Session);
    } else {
      const { error } = await supabase.from("sessions").delete().eq("id", original.id);
      if (error) throw error;
      next = next.filter((r) => r.id !== original.id); removeAgendaRows(qc, [original.id]);
    }
  }
  const additions = draft.clientIds.map((clientId) => ({ clientId, cancellation: null as typeof newCancellations[number] | null }));
  const members = [...additions, ...newCancellations.map((cancellation) => ({ clientId: cancellation.clientId, cancellation }))];
  let rec = base.recurrencia_id;
  // Cancelled rows never turn a single-place session into a group.
  const grouped = !base.slot_instance_id && (next.filter((r) => r.estado !== "cancelada" && !!r.client_id).length + additions.length > 1 || (draft.plazas ?? 1) > 1);
  if (grouped) {
    rec = rec ?? crypto.randomUUID();
    if (next.length) {
      const { data, error } = await supabase.from("sessions").update({ recurrencia_id: rec, ocupacion: 2 }).in("id", next.map((r) => r.id)).select("*");
      if (error) throw error; for (const row of data ?? []) accept(row as Session);
    }
  }
  for (const { clientId, cancellation } of members) {
    const empty = cancellation ? undefined : next.find((r) => !r.client_id && r.estado !== "cancelada");
    const payload = {
      fecha: base.fecha, hora_inicio: `${draft.horaInicio}:00`, hora_fin: `${draft.horaFin}:00`,
      servicio_slug: draft.servicioSlug, trainer_id: draft.trainerId, client_id: clientId,
      estado: cancellation ? "cancelada" : draft.estado, por_confirmar: cancellation ? false : draft.porConfirmar,
      no_contabilizar: cancellation?.noContabilizar ?? false, tipo: draft.esPrueba ? "prueba" : null,
      incidencia: draft.notas || null, plazas: draft.plazas, booking_tipo: "centro",
      slot_instance_id: base.slot_instance_id ?? null, recurrencia_id: rec, ocupacion: grouped ? 2 : base.ocupacion,
      reemplaza_session_id: !base.slot_instance_id ? next.find((r) => r.estado === "cancelada")?.id ?? null : null,
    };
    const { data, error } = empty
      ? await supabase.from("sessions").update(payload as any).eq("id", empty.id).select("*").single()
      : await supabase.from("sessions").insert(payload as any).select("*").single();
    if (error) throw error; accept(data as Session);
    if (!cancellation) void notificarSesionesAsignadas({ data: { sesiones: [{ clientId, fecha: base.fecha, hora: payload.hora_inicio }] } }).catch(() => {});
  }
  for (const [id, value] of Object.entries(draft.noContabilizar)) {
    const { data, error } = await supabase.from("sessions").update({ no_contabilizar: value }).eq("id", id).select("*").single();
    if (error) throw error; accept(data as Session);
  }
  if (notices.length) void notificarReservasCanceladas({ data: { sessionIds: notices } }).catch(() => {});
  if (queueKeys.size) void ofrecerPlazasLiberadas({ data: { claves: [...queueKeys] } }).catch(() => {});
  return next;
}