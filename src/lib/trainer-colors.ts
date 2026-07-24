// Paleta fija de colores para entrenadores. Se asigna de forma determinista a
// partir del id del entrenador, de forma que un mismo entrenador siempre tiene
// el mismo color en toda la app.
const PALETTE = [
  "#3b82f6", // azul
  "#ef4444", // rojo
  "#22c55e", // verde
  "#a855f7", // púrpura
  "#f97316", // naranja
  "#06b6d4", // cian
  "#eab308", // amarillo
  "#ec4899", // rosa
  "#14b8a6", // verde azulado
  "#8b5cf6", // violeta
];

export function trainerColor(id: string | null | undefined): string {
  if (!id) return "#94a3b8";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
