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
  asistida: boolean;
  miSesionId: string | null;
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
}

export function accesoIncluyeGrupos(acceso?: string | null): boolean {
  if (acceso == null) return true;
  return acceso === "ambos" || acceso.split(",").map((s) => s.trim()).includes("grupos");
}

export function accesoIncluyePersonal(acceso?: string | null): boolean {
  if (!acceso) return false;
  return acceso === "ambos" || acceso.split(",").map((s) => s.trim()).includes("personal");
}