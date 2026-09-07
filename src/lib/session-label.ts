/**
 * Reglas comunes de etiquetado de los bloques de sesión en la Agenda
 * (vistas de día, semana y mes).
 *
 *  Los nombres mostrados dependen del ancho disponible del bloque:
 *  100% → hasta 6 nombres, 50% → 3, 33% → 2, menos → 1.
 *  El resto se resume como "+n".
 *
 * El nombre del servicio nunca es el texto principal: lo identifica el color.
 */

const PALABRAS_IGNORADAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "con", "por", "para", "a", "al", "un", "una",
]);

/** Dos letras significativas del nombre del servicio ("Grupos Reducidos" → "GR"). */
export function abreviaturaAutomatica(nombre: string | null | undefined): string {
  const limpio = (nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!limpio) return "";
  const palabras = limpio
    .split(/[\s/_-]+/)
    .filter((w) => w && !PALABRAS_IGNORADAS.has(w.toLowerCase()));
  if (palabras.length >= 2) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  const w = palabras[0] ?? limpio;
  return w.slice(0, 2).toUpperCase();
}

/** Abreviatura efectiva: la personalizada del servicio o la automática. */
export function abreviaturaServicio(
  nombre: string | null | undefined,
  personalizada?: string | null,
): string {
  const custom = (personalizada ?? "").trim();
  if (custom) return custom.slice(0, 3).toUpperCase();
  return abreviaturaAutomatica(nombre);
}

/**
 * Cuántos nombres caben según el ancho del bloque (en % de la columna).
 * 100% → 6 nombres (7+ → 6 nombres y "+n"); 50% → 3 (4+ → 2 y "+n");
 * 33% → 2 (3+ → 2 y "+n"); menos → 1 (2+ → 1 y "+n").
 */
function cupoNombres(widthPct: number): { limite: number; visibles: number } {
  if (widthPct >= 80) return { limite: 6, visibles: 6 };
  if (widthPct >= 45) return { limite: 3, visibles: 2 };
  if (widthPct >= 30) return { limite: 2, visibles: 2 };
  return { limite: 1, visibles: 1 };
}

/** Texto principal del bloque de sesión según los nombres y el ancho disponible. */
export function sessionMainLabel(
  plazas: number,
  nombres: string[],
  widthPct = 100,
): string {
  const list = nombres.filter(Boolean);
  if (list.length === 0) return plazas > 1 ? "Sin clientes" : "";
  const { limite, visibles } = cupoNombres(widthPct);
  if (list.length <= limite) return list.join(", ");
  const shown = list.slice(0, visibles);
  const rest = list.length - shown.length;
  return `${shown.join(", ")} +${rest}`;
}
