import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Comprueba si un correo está registrado en la app (clientes o centros).
 * Función pública: no devuelve datos del usuario, solo existencia.
 */
export const isEmailRegistered = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ email: z.string().trim().email().max(255) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    // Busca en todos los usuarios registrados (cubre admins, entrenadores y clientes).
    const perPage = 1000;
    let page = 1;
    for (;;) {
      const { data: pageData, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const users = pageData?.users ?? [];
      if (users.some((u) => u.email?.toLowerCase() === email)) return { registered: true };
      if (users.length < perPage) break;
      page += 1;
    }
    return { registered: false };
  });
