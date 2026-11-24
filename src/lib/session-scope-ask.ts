/**
 * Decide si el único cambio hecho en el editor de sesión es la cancelación de
 * uno o varios clientes. En ese caso no se pregunta si aplicar los cambios a
 * las sesiones futuras de la serie: la cancelación se guarda siempre solo en
 * la sesión presente.
 */

export interface OnlyClientCancellationArgs {
  /** La cancelación es el motivo de la comprobación; sin ella no aplica. */
  hasCancellation: boolean;
  session: {
    hora_inicio: string | null;
    hora_fin: string | null;
    trainer_id: string | null;
    /** Servicio ya resuelto con el mismo fallback que usa el formulario. */
    servicio_slug: string | null;
    esPrueba: boolean;
    por_confirmar: boolean;
    ocupacion: number | null;
    client_id: string | null;
    titulo: string | null;
  };
  /** Valores actuales del formulario (horas en "HH:MM"). */
  horaInicio: string;
  horaFin: string;
  trainerId: string | null;
  servicioSlug: string | null;
  esPrueba: boolean;
  porConfirmar: boolean;
  grupo: boolean;
  repeatWeeks: number;
  /** Incidencia actual del formulario. */
  incidencia: string | null;
  /** Incidencia que quedaría aplicando solo la cancelación (con su nota). */
  expectedIncidencia: string | null;
  clientId: string | null;
  nombreLibre: string;
  /** La fila de la propia sesión está entre las canceladas. */
  sessionCancelada: boolean;
  /** Clientes cancelados en este borrador (guardados o nuevos). */
  cancelledClientIds: string[];
  groupClientIds: (string | null)[];
  groupNameOnlyCount: number;
  /** Clientes activos que tenía el grupo al abrir el editor. */
  originalGroupClientIds: string[];
}

export function isOnlyClientCancellation(a: OnlyClientCancellationArgs): boolean {
  if (!a.hasCancellation) return false;
  const s = a.session;

  // Ningún campo compartido puede haber cambiado.
  if ((s.hora_inicio ?? null) !== `${a.horaInicio}:00`) return false;
  if ((s.hora_fin ?? null) !== `${a.horaFin}:00`) return false;
  if ((s.trainer_id ?? null) !== (a.trainerId ?? null)) return false;
  if ((s.servicio_slug ?? null) !== (a.servicioSlug ?? null)) return false;
  if (s.esPrueba !== a.esPrueba) return false;
  if (s.por_confirmar !== a.porConfirmar) return false;
  if ((s.ocupacion === 2) !== a.grupo) return false;
  if (a.repeatWeeks !== 0) return false;

  // La incidencia solo puede diferir por la nota de la propia cancelación.
  if ((a.incidencia ?? null) !== (a.expectedIncidencia ?? null)) return false;

  if (!a.grupo) {
    // El cliente solo puede haber desaparecido si es el que se ha cancelado.
    const cancelado = s.client_id ? a.cancelledClientIds.includes(s.client_id) : false;
    const esperado = cancelado ? null : (s.client_id ?? null);
    if ((a.clientId ?? null) !== esperado) return false;
    // El nombre escrito a mano solo puede estar vacío si esa fila se canceló.
    const nombreEsperado = a.sessionCancelada ? "" : (s.titulo ?? "");
    if (a.nombreLibre.trim() !== nombreEsperado) return false;
    return true;
  }

  // Grupo: los clientes actuales deben ser los originales menos los cancelados.
  const esperados = new Set(a.originalGroupClientIds.filter((id) => !a.cancelledClientIds.includes(id)));
  const actuales = new Set(a.groupClientIds.filter((id): id is string => !!id));
  if (esperados.size !== actuales.size) return false;
  for (const id of esperados) if (!actuales.has(id)) return false;
  if (a.groupNameOnlyCount > 0) return false;
  return true;
}

export interface PanelOnlyCancellationArgs {
  /** Hay al menos una cancelación de cliente en el borrador. */
  hasCancellation: boolean;
  /** Clientes quitados con "Quitar cliente": eso ya no es solo cancelar. */
  removedCount: number;
  repeatWeeks: number;
  /** Horas originales de la sesión ("HH:MM:SS" o "HH:MM"). */
  horaInicioOriginal: string;
  horaFinOriginal: string;
  horaInicio: string;
  horaFin: string;
  trainerOriginal: string | null;
  trainerId: string | null;
  servicioOriginal: string;
  servicioSlug: string;
  esPruebaOriginal: boolean;
  esPrueba: boolean;
  porConfirmarOriginal: boolean;
  porConfirmar: boolean;
  notasOriginal: string;
  notas: string;
  plazasOriginal: number | null;
  plazas: number | null;
  /** Marcas de "No contabilizar" cambiadas a mano en el panel. */
  noContabilizarCount: number;
  /** Clientes activos que tenía el bloque al abrir el panel. */
  clientesOriginales: string[];
  cancelledClientIds: string[];
  clientIds: string[];
  /** Nombres escritos a mano que deberían quedar (los no cancelados). */
  nombresEsperados: string[];
  nombresActuales: string[];
}

/**
 * La misma regla para el panel del día de la Agenda: si el único cambio es
 * la cancelación de uno o varios clientes, no se pregunta por las sesiones
 * futuras de la serie y se guarda solo la presente.
 */
export function isOnlyClientCancellationPanel(a: PanelOnlyCancellationArgs): boolean {
  if (!a.hasCancellation) return false;
  if (a.removedCount > 0 || a.repeatWeeks !== 0) return false;
  if (a.horaInicioOriginal.slice(0, 5) !== a.horaInicio) return false;
  if (a.horaFinOriginal.slice(0, 5) !== a.horaFin) return false;
  if ((a.trainerOriginal ?? null) !== (a.trainerId ?? null)) return false;
  if (a.servicioOriginal !== a.servicioSlug) return false;
  if (a.esPruebaOriginal !== a.esPrueba) return false;
  if (a.porConfirmarOriginal !== a.porConfirmar) return false;
  if (a.notasOriginal !== a.notas) return false;
  if ((a.plazasOriginal ?? null) !== (a.plazas ?? null)) return false;
  // "No contabilizar" solo existe en cancelaciones: es una edición de la
  // cancelación y nunca obliga a preguntar por las sesiones futuras.

  const esperados = new Set(a.clientesOriginales.filter((id) => !a.cancelledClientIds.includes(id)));
  const actuales = new Set(a.clientIds.filter(Boolean));
  if (esperados.size !== actuales.size) return false;
  for (const id of esperados) if (!actuales.has(id)) return false;

  if (a.nombresEsperados.length !== a.nombresActuales.length) return false;
  for (const nombre of a.nombresEsperados) if (!a.nombresActuales.includes(nombre)) return false;
  return true;
}
