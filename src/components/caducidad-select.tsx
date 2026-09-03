import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
      return "—";
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
  const [open, setOpen] = useState(false);
  const [customDias, setCustomDias] = useState<string>(String(value.dias ?? 30));
  const inputRef = useRef<HTMLInputElement>(null);

  function confirmCustom() {
    const n = Math.max(1, Number(customDias) || 1);
    onChange({ tipo: "dias", dias: n });
    setOpen(false);
  }

  return (
    <div className={`flex items-center ${className ?? ""}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="w-full">
            <Select
              value={caducidadKey(value)}
              onValueChange={(k) => {
                if (k === "dias") {
                  setCustomDias(String(value.dias ?? 30));
                  setTimeout(() => setOpen(true), 120);
                  return;
                }
                onChange(caducidadFromKey(k, value.dias));
              }}
            >
              <SelectTrigger className={triggerClassName ?? "h-8 w-[9.5rem]"}>
                <span className={value.tipo === null ? "text-muted-foreground" : undefined}>
                  {caducidadLabel(value)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Sin caducidad</SelectItem>
                <SelectItem value="meses:1">1 mes</SelectItem>
                <SelectItem value="meses:3">3 meses</SelectItem>
                <SelectItem value="meses:6">6 meses</SelectItem>
                <SelectItem value="meses:12">1 año</SelectItem>
                <SelectItem value="fin_mes">Mes natural</SelectItem>
                <SelectItem value="fin_ano">Año natural</SelectItem>
                <SelectItem value="dias">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-auto p-2"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
        >
          <div className="flex items-center gap-1.5">
            <Input
              ref={inputRef}
              type="number"
              min={1}
              className="h-8 w-16 no-spinner"
              value={customDias}
              onChange={(e) => setCustomDias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmCustom();
                }
              }}
            />
            <span className="text-sm text-muted-foreground">días</span>
            <Button size="sm" className="h-8" onClick={confirmCustom}>
              OK
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
