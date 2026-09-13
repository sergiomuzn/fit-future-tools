import { AlertTriangle } from "lucide-react";

/** Aviso de que la sesión o el hueco queda fuera del horario de apertura del centro. */
export function FueraHorarioAviso({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Esta franja está fuera del horario de apertura del centro. Puedes guardarla igualmente,
        pero los clientes no la verán en sus reservas.
      </span>
    </p>
  );
}
