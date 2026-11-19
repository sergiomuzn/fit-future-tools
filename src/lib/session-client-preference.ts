/**
 * Preferencia de clientes en el buscador de una sesión.
 *
 * La ordenación por parecido con lo escrito manda siempre; esta capa solo decide
 * qué clientes se muestran antes dentro del mismo nivel de parecido: los que
 * tienen contratado ahora mismo el servicio de la sesión.
 */

type BonoLike = {
  client_id: string;
  activo: boolean;
  bono_catalogo_id: string | null;
  sesiones_disponibles: number;
  servicio_slug: string;
  tipo: string;
  fecha_caducidad: string | null;
};

type CatalogoLike = {
  id: string;
  tipo?: string | null;
  servicio_slug?: string | null;
};

/**
 * Clientes que tienen contratado el servicio de la sesión: bono activo, sin caducar
 * y con sesiones restantes (o pase de gimnasio / bono sin entrada de catálogo).
 * Un bono agotado, caducado o inactivo no cuenta como contratado.
 */
export function clientsWithServiceBono(
  bonos: readonly BonoLike[],
  catalogo: readonly CatalogoLike[],
  servicioSlug: string | null | undefined,
  hoy: string = new Date().toISOString().slice(0, 10),
): Set<string> {
  const preferidos = new Set<string>();
  if (!servicioSlug) return preferidos;
  for (const b of bonos) {
    if (!b.activo) continue;
    if (b.fecha_caducidad && b.fecha_caducidad < hoy) continue;
    const cat = b.bono_catalogo_id
      ? catalogo.find((c) => c.id === b.bono_catalogo_id)
      : undefined;
    const slug = cat?.servicio_slug ?? b.servicio_slug;
    if (slug !== servicioSlug) continue;
    const tipo = cat?.tipo ?? b.tipo;
    const noBono = !b.bono_catalogo_id;
    if (tipo === "gympass" || noBono || (b.sesiones_disponibles ?? 0) > 0) {
      preferidos.add(b.client_id);
    }
  }
  return preferidos;
}

/**
 * Ordena una lista dejando primero los preferidos, sin tocar el resto del orden.
 * `Array.prototype.sort` es estable, así que el orden previo se conserva dentro
 * de cada grupo.
 */
export function partitionPreferred<T>(items: readonly T[], isPreferred: (item: T) => boolean): T[] {
  if (items.length === 0) return [];
  return [...items].sort((a, b) => Number(isPreferred(b)) - Number(isPreferred(a)));
}
