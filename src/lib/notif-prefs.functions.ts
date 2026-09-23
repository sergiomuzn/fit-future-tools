import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { NOTIF_PREFS_DEFAULT, TIPOS_AVISO_SLUGS, type NotifPrefs } from "./notificaciones-tipos";

/** Preferencias de avisos por correo del cliente autenticado. */
export const getMisNotifPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotifPrefs> => {
    const { getNotifPrefsFor } = await import("./notificaciones-email.server");
    try {
      return await getNotifPrefsFor(context.userId);
    } catch {
      return NOTIF_PREFS_DEFAULT;
    }
  });

/** Guarda las preferencias de avisos por correo del cliente autenticado. */
export const saveMisNotifPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        emailActivo: z.boolean(),
        tipos: z.record(z.string(), z.boolean()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tipos: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(data.tipos)) {
      if (TIPOS_AVISO_SLUGS.includes(k)) tipos[k] = v;
    }
    const { saveNotifPrefsFor } = await import("./notificaciones-email.server");
    const { getCentroIdForUser } = await import("./centro-scope.server");
    let centroId: string | null = null;
    try {
      centroId = await getCentroIdForUser(context.userId);
    } catch {
      centroId = null;
    }
    await saveNotifPrefsFor(context.userId, centroId, {
      emailActivo: data.emailActivo,
      tipos,
    });
    return { ok: true as const };
  });

/** Envía por correo los avisos pendientes del cliente autenticado. */
export const flushMisAvisosEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { enviarEmailsPendientes } = await import("./notificaciones-email.server");
    return enviarEmailsPendientes({ userId: context.userId, limite: 20 });
  });
