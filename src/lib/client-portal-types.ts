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
}