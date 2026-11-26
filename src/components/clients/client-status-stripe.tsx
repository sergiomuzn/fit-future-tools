import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type ClientBono } from "@/lib/db";
import { necesitaRenovar } from "@/lib/renewal-stripe";
import { cn } from "@/lib/utils";

/** Returns a checker for "time to renew" (exhausted or expired bono) per client and service. */
export function useNeedsRenewal() {
  const { data: bonos } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => ((await supabase.from("client_bonos").select("*")).data ?? []) as ClientBono[],
  });
  const { data: catalogo } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data ?? [],
  });
  return useCallback(
    (clientId: string | null | undefined, servicioSlug: string | null | undefined) =>
      !!bonos && !!catalogo && necesitaRenovar(clientId, bonos, catalogo, servicioSlug),
    [bonos, catalogo],
  );
}

/** Stripe glued to the left edge of a client box: green for trial, renewal colour when the bono must be renewed. */
export function ClientStatusStripe({ prueba, renovar, full = false }: { prueba?: boolean; renovar?: boolean; full?: boolean }) {
  if (!prueba && !renovar) return null;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute left-0 top-0 w-1 rounded-l-md", full ? "h-full" : "h-9", prueba ? "bg-state-prueba" : "bg-state-renovacion")}
    />
  );
}
