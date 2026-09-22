import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Marca como "realizada" toda sesión pasada que siguiera en "reservada"/"prueba",
 * sin depender de que alguien abra ese día en la agenda.
 * Las sesiones pendientes de confirmar nunca se tocan.
 */
export const barrerSesionesRealizadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        graciaMin: z.number().int().min(0).max(24 * 60),
        autoIndividuales: z.boolean(),
        autoGrupales: z.boolean(),
        grupalesSinAsistentesCuentan: z.boolean(),
        /** Días hacia atrás a revisar */
        dias: z.number().int().min(1).max(3650).default(400),
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
    if (!isAdmin && !isTrainer) return { actualizadas: 0 };

    const { centroDb, getCentroIdForUser } = await import("./centro-scope.server");
    const centroId = await getCentroIdForUser(context.userId);
    const db = centroDb(centroId);

    const now = new Date();
    const desde = new Date(now.getTime() - data.dias * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: rows, error } = await db
      .from("sessions")
      .select("id,fecha,hora_fin,estado,por_confirmar,group_id,ocupacion,client_id")
      .gte("fecha", iso(desde))
      .lte("fecha", iso(now))
      .in("estado", ["reservada", "prueba"])
      .limit(5000);
    if (error) throw error;

    const graceMs = data.graciaMin * 60 * 1000;
    const nowMs = now.getTime();
    const ids = (rows ?? [])
      .filter((s) => {
        if (s.por_confirmar) return false;
        const isGroup = !!s.group_id || s.ocupacion === 2;
        if (isGroup && !data.autoGrupales) return false;
        if (!isGroup && !data.autoIndividuales) return false;
        if (isGroup && !s.client_id && !data.grupalesSinAsistentesCuentan) return false;
        const end = new Date(`${s.fecha}T${s.hora_fin}`).getTime();
        return end + graceMs < nowMs;
      })
      .map((s) => s.id);

    if (ids.length === 0) return { actualizadas: 0 };

    // En lotes para no generar updates enormes.
    for (let i = 0; i < ids.length; i += 200) {
      const { error: upErr } = await db
        .from("sessions")
        .update({ estado: "realizada" })
        .in("id", ids.slice(i, i + 200));
      if (upErr) throw upErr;
    }
    return { actualizadas: ids.length };
  });
