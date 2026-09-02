import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CaducidadTipo = "dias" | "meses" | "fin_mes" | "fin_ano" | null;

export interface CaducidadValue {
  tipo: CaducidadTipo;
  dias: number | null;
}

/** Clave del desplegable a partir del par (tipo, dias). */
export function caducidadKey(v: CaducidadValue): string {
  if (v.tipo === "meses") return `meses:${v.dias ?? 1}`;
  if (v.tipo === "fin_mes") return "fin_mes";
  if (v.tipo === "fin_ano") return "fin_ano";
  if (v.tipo === "dias") return "dias";
  return "ninguna";
}

/** Par (tipo, dias) a partir de la clave del desplegable. */
export function caducidadFromKey(key: string, diasActuales?: number | null): CaducidadValue {
  switch (key) {
    case "meses:1":
      return { tipo: "meses", dias: 1 };
    case "meses:3":
      return { tipo: "meses", dias: 3 };
    case "meses:6":
      return { tipo: "meses", dias: 6 };
    case "meses:12":
      return { tipo: "meses", dias: 12 };
    case "fin_mes":
      return { tipo: "fin_mes", dias: null };
    case "fin_ano":
      return { tipo: "fin_ano", dias: null };
    case "dias":
      return { tipo: "dias", dias: Math.max(1, diasActuales ?? 30) };
    default:
      return { tipo: null, dias: null };
  }
}

/** Texto legible de una caducidad. */
export function caducidadLabel(v: CaducidadValue): string {
  switch (v.tipo) {
    case "meses":
      return v.dias === 12 ? "1 año" : `${v.dias ?? 1} ${v.dias === 1 ? "mes" : "meses"}`;
    case "fin_mes":
      return "Mes natural";
    case "fin_ano":
      return "Año natural";
    case "dias":
      return `${v.dias ?? 0} días`;
    default:
      return "Sin caducidad";
  }
}

interface Props {
  value: CaducidadValue;
  onChange: (v: CaducidadValue) => void;
  className?: string;
  triggerClassName?: string;
}

/** Selector unificado de caducidad (servicios y bonos). */
export function CaducidadSelect({ value, onChange, className, triggerClassName }: Props) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Select
        value={caducidadKey(value)}
        onValueChange={(k) => onChange(caducidadFromKey(k, value.dias))}
      >
        <SelectTrigger className={triggerClassName ?? "h-8 w-[9.5rem]"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ninguna">Sin caducidad</SelectItem>
          <SelectItem value="meses:1">1 mes</SelectItem>
          <SelectItem value="meses:3">3 meses</SelectItem>
          <SelectItem value="meses:6">6 meses</SelectItem>
          <SelectItem value="meses:12">1 año</SelectItem>
          <SelectItem value="fin_mes">Mes natural</SelectItem>
          <SelectItem value="fin_ano">Año natural</SelectItem>
          <SelectItem value="dias">Personalizado (días)</SelectItem>
        </SelectContent>
      </Select>
      {value.tipo === "dias" && (
        <Input
          type="number"
          min={1}
          className="h-8 w-16"
          value={value.dias ?? 30}
          onChange={(e) =>
            onChange({ tipo: "dias", dias: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      )}
    </div>
  );
}
