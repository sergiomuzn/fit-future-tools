import type { BonoCatalogo, ClientBono } from "@/lib/db";

/**
 * Sesiones que tenía contratadas un bono cerrado.
 *
 * Prioriza las sesiones del catálogo; si el bono no viene del catálogo,
 * suma las realizadas y las que aún quedaban (un saldo negativo no resta,
 * porque significa que el bono se sobrepasó).
 */
export function bonoSesionesContratadas(
  bono: Pick<ClientBono, "bono_catalogo_id" | "sesiones_realizadas" | "sesiones_disponibles">,
  catalogo: Map<string, BonoCatalogo>,
): number | null {
  const cat = bono.bono_catalogo_id ? catalogo.get(bono.bono_catalogo_id) : null;
  // Un catálogo con 0 sesiones (p. ej. Gympass) no informa: se usan las hechas y las que quedaban.
  if (cat && typeof cat.sesiones_incluidas === "number" && cat.sesiones_incluidas > 0) {
    return cat.sesiones_incluidas;
  }
  const total = (bono.sesiones_realizadas ?? 0) + Math.max(0, bono.sesiones_disponibles ?? 0);
  return total > 0 ? total : null;
}
