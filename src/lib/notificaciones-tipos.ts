/** Tipos de aviso que puede recibir un cliente en su buzón. */
export const TIPOS_AVISO_CLIENTE = [
  // Agrupa reserva_confirmada y reserva_denegada bajo una sola opción.
  { tipo: "reserva_confirmada", label: "Confirmación de una reserva", porDefecto: true },
  { tipo: "reserva_pendiente", label: "Reserva pendiente de confirmar", porDefecto: false },
  { tipo: "reserva_cancelada", label: "Reserva cancelada por el centro", porDefecto: true },
  { tipo: "sesion_asignada", label: "El centro te reserva una sesión", porDefecto: false },
  { tipo: "cola_plaza_libre", label: "Queda una plaza libre para ti", porDefecto: true },
  { tipo: "cola_caducada", label: "Plaza no confirmada a tiempo", porDefecto: false },
  { tipo: "bono_pocas_sesiones", label: "Te quedan pocas sesiones", porDefecto: false },
  { tipo: "bono_caducado", label: "Tu bono ha caducado", porDefecto: true },
  { tipo: "bono_renovado", label: "Bono renovado", porDefecto: false },
] as const;

export type TipoAvisoCliente = (typeof TIPOS_AVISO_CLIENTE)[number]["tipo"];

export const TIPOS_AVISO_SLUGS: string[] = TIPOS_AVISO_CLIENTE.map((t) => t.tipo);

/** Estado predeterminado de cada tipo de aviso por correo. */
export const TIPOS_AVISO_DEFAULT: Record<string, boolean> = Object.fromEntries(
  TIPOS_AVISO_CLIENTE.map((t) => [t.tipo, t.porDefecto]),
);

export function tipoAvisoPorDefecto(tipo: string): boolean {
  return TIPOS_AVISO_DEFAULT[tipo] ?? true;
}

export interface NotifPrefs {
  emailActivo: boolean;
  /** Por tipo; si falta, se usa el valor predeterminado del tipo. */
  tipos: Record<string, boolean>;
}

export const NOTIF_PREFS_DEFAULT: NotifPrefs = { emailActivo: true, tipos: {} };

/** Tipos agrupados bajo otra opción (confirmada y denegada comparten interruptor). */
const TIPO_A_GRUPO: Record<string, string> = {
  reserva_denegada: "reserva_confirmada",
};

/** ¿Debe enviarse por correo un aviso de este tipo? */
export function debeEnviarEmail(prefs: NotifPrefs, tipo: string): boolean {
  if (!prefs.emailActivo) return false;
  const grupo = TIPO_A_GRUPO[tipo] ?? tipo;
  if (!TIPOS_AVISO_SLUGS.includes(grupo)) return false;
  return prefs.tipos[grupo] ?? tipoAvisoPorDefecto(grupo);
}
