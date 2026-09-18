import { getModoSoporte } from "@/lib/superadmin.functions";

type Soporte = { centroId: string | null; nombre: string | null };

let cache: { at: number; value: Promise<Soporte> } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Olvida el modo soporte cacheado (al entrar/salir de soporte o cambiar de sesión). */
export function clearModoSoporteCache() {
  cache = null;
}

/**
 * Modo soporte con caché en memoria: la comprobación no debe repetirse en cada
 * cambio de apartado, para que la navegación sea inmediata.
 */
export function getModoSoporteCached(): Promise<Soporte> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  const value = getModoSoporte().catch((e) => {
    cache = null;
    throw e;
  });
  cache = { at: now, value };
  return value;
}
