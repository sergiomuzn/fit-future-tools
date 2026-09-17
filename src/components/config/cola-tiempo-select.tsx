import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { COLA_OPCIONES, colaTiempoLabel } from "@/lib/cola-espera";

interface Props {
  /** Minutos. 0 = sin caducidad. */
  value: number;
  onChange: (min: number) => void;
  className?: string;
}

/**
 * Tiempo de confirmación de una plaza ofrecida en la cola de un servicio:
 * sin caducidad, un preset o un valor personalizado en horas.
 */
export function ColaTiempoSelect({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [horas, setHoras] = useState<string>(String(Math.max(1, Math.round((value || 120) / 60))));
  const inputRef = useRef<HTMLInputElement>(null);

  const esPreset = value > 0 && COLA_OPCIONES.some((o) => o.value === value);
  const selectValue = value <= 0 ? "ninguna" : esPreset ? String(value) : "custom";

  function confirmar() {
    const h = Math.max(1, Number(horas) || 1);
    onChange(h * 60);
    setOpen(false);
  }

  return (
    <div className={className}>
      <Select
        value={selectValue}
        onValueChange={(k) => {
          if (k === "custom") {
            setHoras(String(Math.max(1, Math.round((value || 120) / 60))));
            setTimeout(() => setOpen(true), 120);
            return;
          }
          onChange(k === "ninguna" ? 0 : Number(k));
        }}
      >
        <SelectTrigger className="w-[170px]">
          <span>{colaTiempoLabel(value)}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ninguna">Sin caducidad</SelectItem>
          {COLA_OPCIONES.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-sm"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
        >
          <DialogHeader>
            <DialogTitle>Tiempo personalizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Horas</Label>
            <Input
              ref={inputRef}
              type="number"
              min={1}
              className="no-spinner"
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmar();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
