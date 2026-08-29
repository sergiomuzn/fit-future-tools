import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const accesoSchema = z.string().trim().min(1).max(200);

/** Crea una invitación de registro y, opcionalmente, la envía por email. */
export const crearInvitacionCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        acceso: accesoSchema,
        email: z.string().trim().email().max(255).optional(),
        enviarEmail: z.boolean().default(false),
        origin: z.string().trim().url().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo un administrador puede crear invitaciones");

    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const { error } = await context.supabase.from("client_invitations").insert([
      {
        code,
        nombre: null,
        email: data.enviarEmail ? (data.email ?? null) : null,
        expires_at: expires.toISOString(),
        acceso: data.acceso,
        role: "cliente",
      },
    ]);
    if (error) throw new Error(error.message);

    const url = `${data.origin.replace(/\/$/, "")}/invitacion/${code}`;
    let enviado = false;
    let motivo: string | null = null;

    if (data.enviarEmail && data.email) {
      try {
        const { sendTemplateEmail } = await import("./email-templates/send-email");
        const { data: centro } = await context.supabase.rpc("get_center_nombre");
        const res = await sendTemplateEmail("invitacion-cliente", data.email, {
          templateData: { centro: centro ?? "Tracli", url, servicios: data.acceso },
          idempotencyKey: `invitacion-cliente-${code}`,
        });
        enviado = res.sent;
        if (!res.sent) motivo = "El destinatario no admite correos.";
      } catch (e) {
        motivo = e instanceof Error ? e.message : "No se pudo enviar el correo";
      }
    }

    return { code, url, enviado, motivo };
  });

/** Cambia los servicios a los que un cliente con acceso puede reservar. */
export const actualizarAccesoCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ profileId: z.string().uuid(), acceso: accesoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo un administrador puede modificar accesos");
    const { error } = await context.supabase
      .from("client_profiles")
      .update({ acceso: data.acceso })
      .eq("id", data.profileId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
