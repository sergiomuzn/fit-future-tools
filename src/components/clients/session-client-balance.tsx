import { useQuery } from "@tanstack/react-query";
import { supabase, type ClientBono } from "@/lib/db";
import { sessionClientBalance } from "@/lib/session-client-balance";

/** Mounted only for an opted-in session picker with a selected client. */
export function SessionClientBalance({ clientId, servicioSlug }: { clientId: string; servicioSlug: string }) {
  const { data: bonos, isError: bonosError } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_bonos").select("*");
      if (error) throw error;
      return (data ?? []) as ClientBono[];
    },
  });
  const { data: catalogo, isError: catalogoError } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bonos_catalogo").select("*").order("orden");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (bonosError || catalogoError || !bonos || !catalogo) return null;
  const balance = sessionClientBalance(true, clientId, bonos, catalogo, servicioSlug);
  if (balance === null) return null;
  return (
    <div className="text-[11px] text-muted-foreground" role="status">
      Sesiones restantes: <span className="font-semibold">{balance}</span>
    </div>
  );
}