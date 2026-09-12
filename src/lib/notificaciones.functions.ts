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

    const { centroDb, getCentroIdForUser } = await import("./centro-scope.server");
    const centroId = await getCentroIdForUser(context.userId);
    const supabaseAdmin = centroDb(centroId);
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
        titulo: "Reserva cancelada por el centro",
        mensaje: `en ${r.titulo ?? "Clase grupal"} (${describeSesion(r.fecha, r.hora_inicio)})`,
      }));

    await crearNotificaciones(items, centroId);
    return { notified: items.length };
  });

/**
 * Avisa a los clientes con acceso al portal de que el centro les ha reservado
 * manualmente una sesión desde la agenda.
 */
export const notificarSesionesAsignadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sesiones: z
          .array(
            z.object({
              clientId: z.string().uuid(),
              fecha: z.string(),
              hora: z.string(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isTrainer } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "entrenador",
    });
    if (!isAdmin && !isTrainer) throw new Error("Sin permiso");

    const { centroDb, getCentroIdForUser } = await import("./centro-scope.server");
    const centroId = await getCentroIdForUser(context.userId);
    const supabaseAdmin = centroDb(centroId);
    const { crearNotificaciones, describeSesion } = await import("./notificaciones.server");

    const clientIds = [...new Set(data.sesiones.map((s) => s.clientId))];
    const { data: perfiles } = await supabaseAdmin
      .from("client_profiles")
      .select("id,client_id,activo")
      .in("client_id", clientIds);
    const userByClient = new Map(
      (perfiles ?? [])
        .filter((p) => p.activo && p.client_id)
        .map((p) => [p.client_id as string, p.id]),
    );
    if (!userByClient.size) return { notified: 0 };

    const { data: cfg } = await supabaseAdmin
      .from("center_config")
      .select("nombre")
      .eq("id", true)
      .maybeSingle();
    const centro = (cfg as { nombre?: string } | null)?.nombre || "El centro";

    const items = data.sesiones
      .map((s) => ({ userId: userByClient.get(s.clientId), s }))
      .filter((x) => !!x.userId)
      .map(({ userId, s }) => ({
        userId,
        tipo: "sesion_asignada",
        titulo: "Nueva sesión reservada",
        mensaje: `${centro} te ha reservado una sesión el ${describeSesion(s.fecha, s.hora)}`,
      }));

    await crearNotificaciones(items, centroId);
    return { notified: items.length };
  });
