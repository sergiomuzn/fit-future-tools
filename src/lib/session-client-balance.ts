export const DEFAULT_SHOW_SESSION_CLIENT_BALANCE = false;

type BonoBalance = {
  client_id: string;
  activo: boolean;
  fecha_inicio: string | null;
  bono_catalogo_id: string | null;
  sesiones_disponibles: number;
};

/** Read the current bono balance without changing reservation/accounting rules. */
export function sessionClientBalance(
  enabled = DEFAULT_SHOW_SESSION_CLIENT_BALANCE,
  clientId: string | null,
  bonos: readonly BonoBalance[],
  catalogo: readonly { id: string; tipo: string }[],
): number | "Sin bono" | null {
  if (!enabled || !clientId) return null;
  const bono = bonos
    .filter((b) => b.client_id === clientId && b.activo)
    .sort((a, b) => (b.fecha_inicio ?? "").localeCompare(a.fecha_inicio ?? ""))[0];
  if (!bono) return "Sin bono";
  if (catalogo.find((c) => c.id === bono.bono_catalogo_id)?.tipo === "gympass") return null;
  return bono.sesiones_disponibles;
}