import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ymd, type SpecialDay } from "@/lib/center-schedule";

type Mode = "normal" | "cerrado" | "horario_especial";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  date: Date | null;
  existing: SpecialDay | null;
  onSaved: () => void;
}

export function DayEditorDialog({ open, onOpenChange, date, existing, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>("normal");
  const [apertura, setApertura] = useState("09:00");
  const [cierre, setCierre] = useState("14:00");
  const [etiqueta, setEtiqueta] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setMode(existing.tipo);
      setApertura(existing.hora_apertura?.slice(0, 5) ?? "09:00");
      setCierre(existing.hora_cierre?.slice(0, 5) ?? "14:00");
      setEtiqueta(existing.etiqueta ?? "");
    } else {
      setMode("normal");
      setApertura("09:00");
      setCierre("14:00");
      setEtiqueta("");
    }
  }, [open, existing]);

  async function save() {
    if (!date) return;
    const fecha = ymd(date);
    if (mode === "normal") {
      const { error } = await supabase.from("special_days").delete().eq("fecha", fecha);
      if (error) return toast.error(error.message);
    } else if (mode === "cerrado") {
      const { error } = await supabase.from("special_days").upsert({
        fecha,
        tipo: "cerrado",
        hora_apertura: null,
        hora_cierre: null,
        etiqueta: etiqueta || "Festivo",
      });
      if (error) return toast.error(error.message);
    } else {
      if (apertura >= cierre) return toast.error("La apertura debe ser antes del cierre");
      const { error } = await supabase.from("special_days").upsert({
        fecha,
        tipo: "horario_especial",
        hora_apertura: apertura,
        hora_cierre: cierre,
        etiqueta: etiqueta || null,
      });
      if (error) return toast.error(error.message);
    }
    toast.success("Guardado");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {date ? date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-2">
            <div className="flex items-center gap-2"><RadioGroupItem value="normal" id="m-n" /><Label htmlFor="m-n">Horario normal</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="cerrado" id="m-c" /><Label htmlFor="m-c">Cerrado (festivo)</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="horario_especial" id="m-h" /><Label htmlFor="m-h">Horario especial</Label></div>
          </RadioGroup>
          {mode === "horario_especial" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Apertura</Label><Input type="time" value={apertura} onChange={(e) => setApertura(e.target.value)} /></div>
              <div><Label>Cierre</Label><Input type="time" value={cierre} onChange={(e) => setCierre(e.target.value)} /></div>
            </div>
          )}
          {mode !== "normal" && (
            <div><Label>Etiqueta (opcional)</Label><Input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Festivo, Puente..." /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}