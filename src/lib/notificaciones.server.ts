/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { centroDb } from "./centro-scope.server";

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

/** "7 jul · 10:00" */
export function describeSesion(fecha: string, hora: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d!);
  const dia = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${dia} · ${hora.slice(0, 5)}`;
}
