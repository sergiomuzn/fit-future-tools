import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ServerAppRole = "superadmin" | "admin" | "entrenador" | "cliente" | null;

/**
 * Devuelve el rol real del usuario autenticado, verificado en el servidor.
 * El navegador no puede manipular este valor.
 */
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ role: ServerAppRole }> => {
    let { data } = await context.supabase.rpc("current_app_role");
    if (!data) {
      // La cuenta autorizada como superadministrador recibe su rol al entrar
      const { data: claimed } = await context.supabase.rpc("claim_superadmin");
      if (claimed) {
        const { data: again } = await context.supabase.rpc("current_app_role");
        data = again;
      }
    }
    const role = (data as ServerAppRole) ?? null;
    return { role };
  });
