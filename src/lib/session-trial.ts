/**
 * Sesión de Prueba es una marca de cada cliente en su fila (tipo = "prueba").
 * El bloque se pinta como prueba solo si todos sus clientes activos la tienen.
 */
export type TrialRow = {
  estado?: string | null;
  tipo?: string | null;
  client_id?: string | null;
  titulo?: string | null;
};

const activosDe = (rows: TrialRow[]) =>
  rows.filter((r) => r.estado !== "cancelada" && (!!r.client_id || !!r.titulo));

export function blockAllTrial(rows: TrialRow[]): boolean {
  const activos = activosDe(rows);
  return activos.length > 0 && activos.every((r) => r.tipo === "prueba");
}

/**
 * Al menos un cliente activo de la sesión está en Sesión de Prueba.
 * Se usa para la franja verde: cuando TODOS lo están, el bloque entero ya se
 * pinta de color prueba y la franja no aportaría nada.
 */
export function blockAnyTrial(rows: TrialRow[]): boolean {
  return activosDe(rows).some((r) => r.tipo === "prueba");
}
