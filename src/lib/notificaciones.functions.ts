import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Avisa a los clientes cuyas reservas han sido canceladas por el administrador.
 * Solo ejecutable por administradores.
 */
export const notificarReservasCanceladas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { crearNotificaciones, describeSesion } = await import("./notificaciones.server");

    const { data: rows } = await supabaseAdmin
      .from("sessions")
      .select("id,fecha,hora_inicio,titulo,booked_by_user_id")
      .in("id", data.sessionIds);

    const items = (rows ?? [])
      .filter((r) => !!r.booked_by_user_id)
      .map((r) => ({
        userId: r.booked_by_user_id,
        tipo: "reserva_cancelada",
        titulo: "Reserva cancelada",
        mensaje: `El centro ha cancelado tu reserva de ${r.titulo ?? "clase grupal"} (${describeSesion(r.fecha, r.hora_inicio)}).`,
      }));

    await crearNotificaciones(items);
    return { notified: items.length };
  });
