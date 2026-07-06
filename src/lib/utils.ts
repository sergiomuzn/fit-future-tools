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
