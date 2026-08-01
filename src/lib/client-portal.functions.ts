import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BonoTipoCliente, ClaseGrupal, PortalProfile } from "./client-portal-types";

const bonoTipoSchema = z.enum(["grupal_directo", "wellhub", "claspass"]);

export const validateInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { checkInvitation } = await import("./invitations.server");
    return checkInvitation(data.code);
  });

export const registerFromInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().trim().min(4).max(64),
        nombre: z.string().trim().min(2).max(80),
        apellido: z.string().trim().min(2).max(80),
        telefono: z.string().trim().min(6).max(30),
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(128),
        bonoTipo: bonoTipoSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { acceptInvitation } = await import("./invitations.server");
    return acceptInvitation(
      data as {
        code: string;
        nombre: string;
        apellido: string;
        telefono: string;
        email: string;
        password: string;
        bonoTipo: BonoTipoCliente;
      },
    );
  });

export const getMyPortalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalProfile | null> => {
    const { getPortalProfile } = await import("./client-portal.server");
    return getPortalProfile(context.userId);
  });

export const listClases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClaseGrupal[]> => {
    const { getPortalProfile, listUpcomingClasses } = await import("./client-portal.server");
    const profile = await getPortalProfile(context.userId);
    if (!profile) throw new Error("Cuenta de cliente no activa");
    return listUpcomingClasses(context.userId);
  });

export const reservarClase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { bookClassForUser } = await import("./client-portal.server");
    await bookClassForUser(context.userId, data.key);
    return { ok: true as const };
  });

export const cancelarReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { cancelBookingForUser } = await import("./client-portal.server");
    await cancelBookingForUser(context.userId, data.sessionId);
    return { ok: true as const };
  });