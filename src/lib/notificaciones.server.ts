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
  await db.from("notificaciones").insert(rows);
}

/** "7 jul · 10:00" */
export function describeSesion(fecha: string, hora: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d!);
  const dia = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${dia} · ${hora.slice(0, 5)}`;
}
