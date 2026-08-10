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

/** Formatea un nombre con la primera letra de cada palabra en mayúscula. */
export function toTitleCase(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part ? part.charAt(0).toLocaleUpperCase("es") + part.slice(1).toLocaleLowerCase("es") : part
        )
        .join("-")
    )
    .join(" ");
}
