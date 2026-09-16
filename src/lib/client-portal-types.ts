/** Tipos compartidos (cliente + servidor) del portal de clientes. */
export type BonoTipoCliente = "grupal_directo" | "wellhub" | "claspass";

export const BONO_TIPO_CLIENTE: { value: BonoTipoCliente; label: string }[] = [
  { value: "grupal_directo", label: "Bono Grupal Directo" },
  { value: "wellhub", label: "Wellhub" },
  { value: "claspass", label: "Claspass" },
];

export function bonoTipoClienteLabel(tipo?: string | null): string {
  return BONO_TIPO_CLIENTE.find((b) => b.value === tipo)?.label ?? "—";
}

/** Tipo de acceso concedido a un cliente del portal. */
export type AccesoCliente = "personal" | "grupos" | "ambos";

export const ACCESO_CLIENTE: { value: AccesoCliente; label: string }[] = [
  { value: "personal", label: "Entrenamiento Personal" },
  { value: "grupos", label: "Grupos" },
  { value: "ambos", label: "Ambos" },
];

export function accesoClienteLabel(acceso?: string | null): string {
  if (!acceso) return "—";
  const known = ACCESO_CLIENTE.find((a) => a.value === acceso);
  if (known) return known.label;
  // Lista de servicios separada por comas
  const parts = acceso.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .map((p) => ACCESO_CLIENTE.find((a) => a.value === p)?.label ?? p)
    .join(" + ");
}

export interface ClaseGrupal {
  key: string;
  groupId: string;
  nombre: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  entrenador: string | null;
  capacidad: number;
  ocupadas: number;
  reservada: boolean;
  /** Reserva pendiente de que el admin la confirme. */
  porConfirmar: boolean;
  asistida: boolean;
  /** Todavía se puede reservar (no ha pasado ni supera el margen de antelación). */
  reservable: boolean;
  miSesionId: string | null;
  servicioSlug: string | null;
  /** Nombre del servicio al que pertenece la clase. */
  servicioNombre: string | null;
  /** Color base del servicio (configurable en Configuración > Colores por servicio). */
  color: string | null;
  /** Personas esperando en la cola de esta sesión. */
  colaTotal?: number;
  /** Mi posición en la cola (1 = el primero), null si no estoy. */
  colaPosicion?: number | null;
  /** Mi estado en la cola: esperando o con la plaza ofrecida. */
  colaEstado?: "en_cola" | "ofrecida" | null;
  /** Id de mi entrada en la cola. */
  colaId?: string | null;
  /** Fecha límite para confirmar la plaza ofrecida (null = sin límite). */
  colaExpiraAt?: string | null;
  /** Minutos que tendría para confirmar si alguien se apunta detrás. */
  colaAvisoMin?: number | null;
}

export interface PortalProfile {
  id: string;
  nombre: string;
  email: string;
  bonoTipo: BonoTipoCliente;
  activo: boolean;
  acceso: AccesoCliente;
}

export interface SesionPersonal {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  titulo: string | null;
  entrenador: string | null;
  estado: string;
  porConfirmar: boolean;
  servicioSlug: string | null;
  servicioNombre: string | null;
  color: string | null;
  /** La reservó el propio cliente, por lo que puede cancelarla desde el portal. */
  puedeCancelar: boolean;
}

export function accesoIncluyeGrupos(acceso?: string | null): boolean {
  if (acceso == null) return true;
  return acceso === "ambos" || acceso.split(",").map((s) => s.trim()).includes("grupos");
}

export function accesoIncluyePersonal(acceso?: string | null): boolean {
  if (!acceso) return false;
  return acceso === "ambos" || acceso.split(",").map((s) => s.trim()).includes("personal");
}

/** Slugs de servicio a los que el cliente tiene acceso. */
export function accesoServicios(acceso?: string | null): string[] {
  if (!acceso) return [];
  if (acceso === "ambos") return ["personal", "grupos"];
  return acceso.split(",").map((s) => s.trim()).filter(Boolean);
}

export interface ResumenCliente {
  nombre: string;
  email: string;
  telefono: string | null;
  bonoNombre: string | null;
  bonoTipo: string | null;
  ultimoPago: string | null;
  sesionesRestantes: number | null;
  sesionesRealizadas: number | null;
  proximaSesion: { fecha: string; horaInicio: string; nombre: string } | null;
  cancelaciones: number;
  /** Canceladas marcadas como "No contabilizar" */
  cancelacionesNC: number;
  bonos: BonoResumen[];
}

/** Un bono activo del cliente, con su servicio, tipo y color. */
export interface BonoResumen {
  id: string;
  servicio: string | null;
  tipo: string | null;
  nombre: string | null;
  color: string | null;
  fechaInicio: string | null;
  /** Fecha de caducidad del bono (null si no caduca). */
  fechaCaducidad: string | null;
  sesionesRestantes: number | null;
  sesionesRealizadas: number | null;
  cancelaciones: number;
  /** Canceladas marcadas como "No contabilizar" */
  cancelacionesNC: number;
}