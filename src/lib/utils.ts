import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Lowercase + strip diacritics for accent-insensitive search. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const LOWERCASE_WORDS = new Set([
  "y", "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "con", "por", "para", "en", "a", "al", "que", "se", "sus", "tu", "su",
]);

export function formatNameTitle(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .split(" ")
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Muestra fechas visibles de forma uniforme como dd/mm/aa. */
export function formatDateShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1].slice(-2)}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()).slice(-2),
  ].join("/");
}

/** Distancia de Levenshtein simple. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Coincidencia aproximada: tolera erratas y letras faltantes.
 * Se usa como respaldo cuando no hay ninguna coincidencia exacta.
 */
export function fuzzyMatch(text: string | null | undefined, query: string): boolean {
  const q = normalizeText(query).trim();
  const t = normalizeText(text).trim();
  if (!q) return true;
  if (!t) return false;
  if (t.includes(q)) return true;

  const tolerance = q.length <= 3 ? 1 : q.length <= 6 ? 2 : 3;

  // Comparar contra cada palabra y contra el texto completo.
  const words = t.split(/\s+/);
  for (const w of [...words, t]) {
    if (levenshtein(w.slice(0, q.length + tolerance), q) <= tolerance) return true;
    if (Math.abs(w.length - q.length) <= tolerance && levenshtein(w, q) <= tolerance) return true;
  }

  // Subsecuencia: "jgomez" encuentra "javier gomez".
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

/**
 * Puntuación de parecido para ordenar resultados de búsqueda (menor = más parecido).
 * Prioriza lo escrito: coincidencia exacta > palabra que empieza por el texto >
 * texto al principio del nombre > palabra que lo contiene > aparición en cualquier
 * sitio > coincidencia aproximada. Las menciones entre paréntesis van detrás de
 * cualquier coincidencia equivalente fuera de ellas. Devuelve null si no hay
 * ninguna coincidencia.
 */
export function matchScore(text: string | null | undefined, query: string): number | null {
  const q = normalizeText(query).trim();
  const t = normalizeText(text ?? "").trim();
  if (!q || !t) return null;
  if (t === q) return 0;

  // Tramos entre paréntesis: las coincidencias dentro de ellos son menos relevantes.
  const parenSpans: [number, number][] = [];
  const stack: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") stack.push(i);
    else if (t[i] === ")" && stack.length > 0) parenSpans.push([stack.pop()!, i]);
  }
  const inParens = (pos: number) => parenSpans.some(([a, b]) => pos >= a && pos < b);

  const TIER_WEIGHT = 100000;
  const PAREN_PENALTY = 50000;
  const FUZZY_SCORE = 1000000;

  let best: number | null = null;
  const consider = (pos: number, tier: number) => {
    const score = tier * TIER_WEIGHT + pos + (inParens(pos) ? PAREN_PENALTY : 0);
    if (best === null || score < best) best = score;
  };

  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(t))) {
    const pos = m.index;
    if (m[0] === q) consider(pos, 0);
    else if (m[0].startsWith(q)) consider(pos, 1);
    else if (m[0].includes(q)) consider(pos, 2);
  }

  const containsPos = t.indexOf(q);
  if (containsPos !== -1) consider(containsPos, 3);

  if (best !== null) return best;
  return fuzzyMatch(t, q) ? FUZZY_SCORE : null;
}

/** Ordena una lista por parecido con el texto buscado (los más parecidos primero). */
export function rankByMatch<T>(
  items: T[],
  getText: (item: T) => string | null | undefined,
  query: string,
): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item) => ({ item, score: matchScore(getText(item), q) }))
    .filter((x): x is { item: T; score: number } => x.score !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        normalizeText(getText(a.item) ?? "").localeCompare(normalizeText(getText(b.item) ?? "")),
    )
    .map((x) => x.item);
}
