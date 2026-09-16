import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** El cliente se apunta a la cola de una sesión completa. */
export const apuntarseCola = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clave: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { apuntarseEnCola } = await import("./cola-espera.server");
    return apuntarseEnCola(context.userId, data.clave);
  });

/** El cliente sale de la cola. */
export const salirCola = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clave: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { salirDeCola } = await import("./cola-espera.server");
    await salirDeCola(context.userId, data.clave);
    return { ok: true as const };
  });

/** El cliente confirma o rechaza la plaza ofrecida. */
export const responderCola = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ colaId: z.string().uuid(), accion: z.enum(["aceptar", "rechazar"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { responderOferta } = await import("./cola-espera.server");
    return responderOferta(context.userId, data.colaId, data.accion);
  });

/** Ofertas de plaza vivas del cliente (para el buzón). */
export const listMisOfertasCola = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { misOfertasCola } = await import("./cola-espera.server");
    return misOfertasCola(context.userId);
  });
