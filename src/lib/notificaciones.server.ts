/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { centroDb } from "./centro-scope.server";
import { formatDateShort } from "./utils";

export interface NuevaNotificacion {
  userId?: string | null;
  targetRole?: "admin" | "cliente" | null;
  tipo: string;
  titulo: string;
  mensaje: string;
  /** Sesión relacionada, para poder actuar desde el buzón. */
  sessionId?: string | null;
}

export async function crearNotificaciones(
  items: NuevaNotificacion[],
  centroId?: string,
): Promise<void> {
  const db = centroId ? centroDb(centroId) : supabaseAdmin;
  const rows = items
    .filter((i) => i.userId || i.targetRole)
    .map((i) => ({
      user_id: i.userId ?? null,
      target_role: (i.targetRole ?? null) as never,
      tipo: i.tipo,
      titulo: i.titulo,
      mensaje: i.mensaje,
      session_id: i.sessionId ?? null,
    }));
  if (!rows.length) return;
  const { data: inserted } = await (db as any)
    .from("notificaciones")
    .insert(rows)
    .select("id,user_id");

  // El aviso llega al buzón y, a la vez, al correo del cliente si lo tiene activado.
  const ids = ((inserted ?? []) as { id: string; user_id: string | null }[])
    .filter((r) => !!r.user_id)
    .map((r) => r.id);
  if (ids.length) {
    const { enviarEmailsPendientes } = await import("./notificaciones-email.server");
    await enviarEmailsPendientes({ ids });
  }
}

/** "07/07/26 · 10:00" */
export function describeSesion(fecha: string, hora: string): string {
  return `${formatDateShort(fecha)} · ${hora.slice(0, 5)}`;
}

/**
 * Convierte el aviso de "confirmar/denegar" del centro de una sesión en un
 * aviso informativo con la decisión tomada (sin crear uno nuevo).
 */
export async function resolverAvisoCentro(
  centroId: string,
  sessionId: string,
  decision: "confirmada" | "denegada" | "denegada_auto",
): Promise<void> {
  const db = centroDb(centroId) as any;
  const { data: s } = await db
    .from("sessions")
    .select("fecha,hora_inicio,titulo,servicio_slug,client_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return;
  const [{ data: srv }, { data: cli }] = await Promise.all([
    s.servicio_slug
      ? db.from("servicios").select("nombre").eq("slug", s.servicio_slug).maybeSingle()
      : Promise.resolve({ data: null }),
    s.client_id
      ? db.from("clients").select("nombre").eq("id", s.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const donde = srv?.nombre || s.titulo || "la sesión";
  const cliente = cli?.nombre || "el cliente";
  const cuando = describeSesion(s.fecha, s.hora_inicio).replace(" · ", " a las ");
  const txt =
    decision === "confirmada"
      ? { tipo: "reserva_confirmada_centro", titulo: `Reserva confirmada a ${cliente}`, mensaje: `Has confirmado la reserva de ${cliente} en ${donde} el ${cuando}` }
      : decision === "denegada"
        ? { tipo: "reserva_denegada_centro", titulo: `Reserva denegada a ${cliente}`, mensaje: `Has denegado la reserva de ${cliente} en ${donde} el ${cuando}` }
        : { tipo: "reserva_denegada_auto", titulo: `Reserva denegada automáticamente a ${cliente}`, mensaje: `La reserva de ${cliente} en ${donde} el ${cuando} se ha denegado al no confirmarse antes del inicio` };
  await db
    .from("notificaciones")
    .update({ ...txt, session_id: null, leida: false })
    .eq("session_id", sessionId)
    .is("user_id", null);
}
