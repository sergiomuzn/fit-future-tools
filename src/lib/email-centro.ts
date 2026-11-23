/** Avisos por correo que recibe el centro (center_config.email_centro). */
export const TIPOS_AVISO_CENTRO = [
  { tipo: "reserva_creada", label: "Nueva reserva de un cliente", porDefecto: true },
  { tipo: "reserva_pendiente", label: "Reserva pendiente de confirmar", porDefecto: true },
  { tipo: "reserva_cancelada_cliente", label: "Un cliente cancela su reserva", porDefecto: true },
  { tipo: "reserva_denegada_auto", label: "Reserva denegada automáticamente por no confirmarse", porDefecto: false },
] as const;

export interface EmailCentroConfig {
  activo: boolean;
  /** Correo de destino; vacío = correo de las cuentas de administración del centro. */
  destino: string;
  tipos: Record<string, boolean>;
}

export const EMAIL_CENTRO_DEFAULT: EmailCentroConfig = { activo: false, destino: "", tipos: {} };

export function parseEmailCentro(raw: unknown): EmailCentroConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tipos = (o.tipos && typeof o.tipos === "object" ? o.tipos : {}) as Record<string, boolean>;
  return {
    activo: o.activo === true,
    destino: typeof o.destino === "string" ? o.destino.trim() : "",
    tipos,
  };
}

export function tipoCentroActivo(cfg: EmailCentroConfig, tipo: string): boolean {
  const def = TIPOS_AVISO_CENTRO.find((t) => t.tipo === tipo);
  if (!def) return false;
  return cfg.tipos[tipo] ?? def.porDefecto;
}

export function debeEnviarEmailCentro(cfg: EmailCentroConfig, tipo: string): boolean {
  return cfg.activo && tipoCentroActivo(cfg, tipo);
}
