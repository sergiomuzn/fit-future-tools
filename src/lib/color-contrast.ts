/**
 * Utilidades puras de color, sin dependencias de React ni de la base de datos,
 * para poder comprobarlas con pruebas automáticas.
 */

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const digits = m[1];
  const full = digits.length === 3 ? digits.split("").map((c) => c + c).join("") : digits;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Devuelve [r,g,b] para `#hex`, `rgb(...)` o `rgba(...)`; null si no se reconoce. */
export function parseColorRgb(color: string): [number, number, number] | null {
  const raw = color.trim();
  if (raw.startsWith("#")) return hexToRgb(raw);
  const m = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (!m) return null;
  const parts = m[1].split(/[,/\s]+/).filter(Boolean).slice(0, 3);
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return [clamp(nums[0]), clamp(nums[1]), clamp(nums[2])];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
      : max === gn ? ((bn - rn) / d + 2) * 60
        : ((rn - gn) / d + 4) * 60;
  return [(h + 360) % 360, s, l];
}

/**
 * ¿El fondo es tan cercano al rojo que el indicador rojo de cancelados se perdería?
 * `true` → hay que conservarle el contorno claro; `false` → puede ir sin contorno.
 * Un color que no se sabe interpretar se considera cercano, por seguridad.
 */
export function colorCercaDeRojo(color: string | null | undefined): boolean {
  if (!color?.trim()) return false;
  const rgb = parseColorRgb(color);
  if (!rgb) return true;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  if (s < 0.3 || l < 0.2 || l > 0.9) return false;
  return Math.min(h, 360 - h) <= 25;
}
