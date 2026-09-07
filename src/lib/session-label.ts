/**
 * Reglas comunes de etiquetado de los bloques de sesión en la Agenda
 * (vistas de día, semana y mes).
 *
 *  - 1 plaza      → nombre del cliente
 *  - 2-3 plazas   → nombres separados por coma ("Ana, Carlos")
 *  - 4+ plazas    → número de asistentes ("6 personas")
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

/** Texto principal del bloque de sesión según el número de plazas. */
export function sessionMainLabel(plazas: number, nombres: string[]): string {
  const list = nombres.filter(Boolean);
  if (plazas >= 4) {
    if (list.length === 0) return "Sin clientes";
    return `${list.length} ${list.length === 1 ? "persona" : "personas"}`;
  }
  if (list.length === 0) return plazas > 1 ? "Sin clientes" : "";
  return list.join(", ");
}
