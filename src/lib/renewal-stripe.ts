import { sessionClientBalance } from "./session-client-balance";

type Bono = Parameters<typeof sessionClientBalance>[2][number];

/** True when the client's latest active bono for this service is exhausted or expired (time to renew). */
export function necesitaRenovar(
  clientId: string | null | undefined,
  bonos: readonly Bono[],
  catalogo: readonly { id: string; tipo: string }[],
  servicioSlug: string | null | undefined,
  hoyISO?: string,
): boolean {
  if (!clientId || !servicioSlug) return false;
  const b = sessionClientBalance(true, clientId, bonos, catalogo, servicioSlug, hoyISO);
  return b === "caducado" || (typeof b === "number" && b <= 0);
}
