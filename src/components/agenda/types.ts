export const HOUR_START = 6;
export const HOUR_END = 23;
export const SLOT_MIN = 15; // minutos por slot
export const SLOT_PX = 12;  // 12px = 15 min => 48px = 1 hora
export const TOTAL_MIN = (HOUR_END - HOUR_START) * 60;
export const TOTAL_PX = (TOTAL_MIN / SLOT_MIN) * SLOT_PX;

export function pxToMin(px: number) {
  return Math.round(px / SLOT_PX) * SLOT_MIN;
}
export function minToTime(min: number) {
  const total = HOUR_START * 60 + min;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}
export function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m - HOUR_START * 60;
}
export function formatHM(t: string) {
  return t.slice(0, 5);
}
export function formatDateISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}