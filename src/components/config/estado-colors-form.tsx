import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCenterConfig } from "@/lib/center-schedule";
import {
  ESTADO_COLOR_KEYS,
  ESTADO_COLOR_LABELS,
  DEFAULT_ESTADO_COLORES,
  estadoColorKey,
  estadoColorOf,
  type EstadoColorable,
} from "@/lib/colors";

export function EstadoColorsForm() {
  const { colores, invalidate, isLoading } = useCenterConfig();
  const [local, setLocal] = useState<Record<EstadoColorable, string>>(DEFAULT_ESTADO_COLORES);

  useEffect(() => {
    if (isLoading) return;
    setLocal({
      cancelada: estadoColorOf(colores, "cancelada"),
      prueba: estadoColorOf(colores, "prueba"),
      renovacion: estadoColorOf(colores, "renovacion"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, JSON.stringify(colores)]);

  const dirty = ESTADO_COLOR_KEYS.some((k) => local[k].toLowerCase() !== estadoColorOf(colores, k).toLowerCase());

  async function save() {
    const next = { ...colores };
    for (const k of ESTADO_COLOR_KEYS) next[estadoColorKey(k)] = local[k];
    const { error } = await supabase
      .from("center_config")
      .update({ colores: next as unknown as never })
      .eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Colores guardados");
    invalidate();
  }

  function reset() {
    setLocal({ ...DEFAULT_ESTADO_COLORES });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Colores de las sesiones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Color con el que se pintan en la Agenda las sesiones canceladas, de prueba o pendientes de
          renovación. El resto de sesiones usan el color de su servicio.
        </p>
        {ESTADO_COLOR_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-3">
            <Label className="w-32 shrink-0 text-sm font-normal">{ESTADO_COLOR_LABELS[k]}</Label>
            <input
              type="color"
              aria-label={`Color de sesiones ${ESTADO_COLOR_LABELS[k].toLowerCase()}`}
              className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
              value={local[k]}
              onChange={(e) => setLocal((p) => ({ ...p, [k]: e.target.value }))}
            />
            <Input
              className="max-w-[140px] font-mono uppercase"
              value={local[k]}
              onChange={(e) => setLocal((p) => ({ ...p, [k]: e.target.value }))}
            />
            <span
              className="rounded px-2 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: local[k] }}
            >
              Ejemplo
            </span>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <Button onClick={save} disabled={!dirty}>Guardar colores</Button>
          <Button variant="outline" onClick={reset}>Restaurar por defecto</Button>
        </div>
      </CardContent>
    </Card>
  );
}
