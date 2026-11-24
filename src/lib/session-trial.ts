/**
 * Sesión de Prueba es una marca de cada cliente en su fila (tipo = "prueba").
 * El bloque se pinta como prueba solo si todos sus clientes activos la tienen.
 */
export function blockAllTrial(rows: { estado?: string | null; tipo?: string | null; client_id?: string | null; titulo?: string | null }[]): boolean {
  const activos = rows.filter((r) => r.estado !== "cancelada" && (!!r.client_id || !!r.titulo));
  return activos.length > 0 && activos.every((r) => r.tipo === "prueba");
}
