/** Tipos de aviso que puede recibir un cliente en su buzón. */
export const TIPOS_AVISO_CLIENTE = [
  { tipo: "reserva_confirmada", label: "Reserva confirmada" },
  { tipo: "reserva_denegada", label: "Reserva no confirmada" },
  { tipo: "reserva_pendiente", label: "Reserva pendiente de confirmar" },
  { tipo: "reserva_cancelada", label: "Reserva cancelada por el centro" },
  { tipo: "sesion_asignada", label: "El centro te reserva una sesión" },
  { tipo: "cola_plaza_libre", label: "Queda una plaza libre para ti" },
  { tipo: "cola_caducada", label: "Plaza no confirmada a tiempo" },
  { tipo: "bono_pocas_sesiones", label: "Te quedan pocas sesiones" },
  { tipo: "bono_caducado", label: "Tu bono ha caducado" },
  { tipo: "bono_renovado", label: "Bono renovado" },
] as const;

export type TipoAvisoCliente = (typeof TIPOS_AVISO_CLIENTE)[number]["tipo"];

export const TIPOS_AVISO_SLUGS: string[] = TIPOS_AVISO_CLIENTE.map((t) => t.tipo);

export interface NotifPrefs {
  emailActivo: boolean;
  /** Por tipo; si falta, se considera activado. */
  tipos: Record<string, boolean>;
}

export const NOTIF_PREFS_DEFAULT: NotifPrefs = { emailActivo: true, tipos: {} };

/** ¿Debe enviarse por correo un aviso de este tipo? */
export function debeEnviarEmail(prefs: NotifPrefs, tipo: string): boolean {
  if (!prefs.emailActivo) return false;
  if (!TIPOS_AVISO_SLUGS.includes(tipo)) return false;
  return prefs.tipos[tipo] !== false;
}
