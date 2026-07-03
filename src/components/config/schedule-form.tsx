import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useCenterConfig, DEFAULT_HORARIO, DEFAULT_PRECIOS,
  type HorarioBase, type Precios,
} from "@/lib/center-schedule";

const DAY_LABELS: Record<string, string> = {
  "1": "Lunes", "2": "Martes", "3": "Miércoles", "4": "Jueves",
  "5": "Viernes", "6": "Sábado", "0": "Domingo",
};
const ORDER = ["1","2","3","4","5","6","0"];

export function ScheduleForm() {
  const { horario, precios, invalidate, isLoading } = useCenterConfig();
  const [local, setLocal] = useState<HorarioBase>(horario);
  const [localPrecios, setLocalPrecios] = useState<Precios>(precios);

  useEffect(() => {
    if (!isLoading) {
      setLocal(horario);
      setLocalPrecios(precios);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  async function save() {
    const { error } = await supabase.from("center_config").update({
      horario_base: local as unknown as never,
      precios: localPrecios as unknown as never,
    }).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Configuración guardada");
    invalidate();
  }

  function reset() {
    setLocal(DEFAULT_HORARIO);
    setLocalPrecios(DEFAULT_PRECIOS);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Horario base semanal</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {ORDER.map((k) => {
            const slot = local[k];
            const open = !!slot;
            return (
              <div key={k} className="flex items-center gap-3">
                <div className="w-24 text-sm">{DAY_LABELS[k]}</div>
                <Checkbox
                  checked={open}
                  onCheckedChange={(v) => {
                    setLocal((prev) => ({
                      ...prev,
                      [k]: v ? (slot ?? { open: "09:00", close: "20:00" }) : null,
                    }));
                  }}
                />
                <Input
                  type="time"
                  className="w-28"
                  disabled={!open}
                  value={slot?.open ?? ""}
                  onChange={(e) => setLocal((prev) => ({ ...prev, [k]: { open: e.target.value, close: slot?.close ?? "20:00" } }))}
                />
                <span className="text-muted-foreground text-xs">a</span>
                <Input
                  type="time"
                  className="w-28"
                  disabled={!open}
                  value={slot?.close ?? ""}
                  onChange={(e) => setLocal((prev) => ({ ...prev, [k]: { open: slot?.open ?? "09:00", close: e.target.value } }))}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Precios medios (€)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Se aplican a la facturación estimada de Estadísticas. Al cambiarlos se recalcula el histórico mostrado.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Individual</Label>
              <Input type="number" min={0} value={localPrecios.individual}
                onChange={(e) => setLocalPrecios({ ...localPrecios, individual: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Pareja</Label>
              <Input type="number" min={0} value={localPrecios.pareja}
                onChange={(e) => setLocalPrecios({ ...localPrecios, pareja: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Grupal (por persona)</Label>
              <Input type="number" min={0} value={localPrecios.grupal}
                onChange={(e) => setLocalPrecios({ ...localPrecios, grupal: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={reset}>Restablecer defaults</Button>
            <Button onClick={save}>Guardar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}