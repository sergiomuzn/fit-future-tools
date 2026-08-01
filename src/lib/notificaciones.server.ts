import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface NuevaNotificacion {
  userId?: string | null;
  targetRole?: "admin" | "cliente" | null;
  tipo: string;
  titulo: string;
  mensaje: string;
}

export async function crearNotificaciones(items: NuevaNotificacion[]): Promise<void> {
  const rows = items
    .filter((i) => i.userId || i.targetRole)
    .map((i) => ({
      user_id: i.userId ?? null,
      target_role: (i.targetRole ?? null) as never,
      tipo: i.tipo,
      titulo: i.titulo,
      mensaje: i.mensaje,
    }));
  if (!rows.length) return;
  await supabaseAdmin.from("notificaciones").insert(rows);
}

/** "7 jul · 10:00" */
export function describeSesion(fecha: string, hora: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d!);
  const dia = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${dia} · ${hora.slice(0, 5)}`;
}
