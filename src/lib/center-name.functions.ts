import { createServerFn } from "@tanstack/react-start";

/** Nombre publico del centro (branding). No expone otros datos de configuracion. */
export const getCenterName = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("center_config")
    .select("nombre")
    .eq("id", true)
    .maybeSingle();
  return { nombre: (data?.nombre ?? "").trim() || "Tracli" };
});