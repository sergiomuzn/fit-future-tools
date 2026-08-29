import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ServerAppRole = "admin" | "entrenador" | "cliente" | null;

/**
 * Devuelve el rol real del usuario autenticado, verificado en el servidor.
 * El navegador no puede manipular este valor.
 */
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ role: ServerAppRole }> => {
    const { data } = await context.supabase.rpc("current_app_role");
    const role = (data as ServerAppRole) ?? null;
    return { role };
  });
