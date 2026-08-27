import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatTipoBono, type BonoCatalogo } from "@/lib/db";
import { toast } from "sonner";
import {
  useCenterConfig, DEFAULT_HORARIO, DEFAULT_PRECIOS,
  DEFAULT_TIPO_COLORES,
  type HorarioBase, type Precios, type TipoColores,
} from "@/lib/center-schedule";
import { useServicios } from "@/lib/servicios";
import { servicioColorKey, defaultServicioColor, servicioColorOf } from "@/lib/colors";

const DAY_LABELS: Record<string, string> = {
  "1": "Lunes", "2": "Martes", "3": "Miércoles", "4": "Jueves",
  "5": "Viernes", "6": "Sábado", "0": "Domingo",
};
const ORDER = ["1","2","3","4","5","6","0"];

export function HorarioForm() {
  const { horario, precios, invalidate, isLoading } = useCenterConfig();
  const [local, setLocal] = useState<HorarioBase>(horario);

  useEffect(() => {
    if (!isLoading) setLocal(horario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  async function save() {
    const { error } = await supabase.from("center_config").update({
      horario_base: local as unknown as never,
      precios: precios as unknown as never,
    }).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Horario guardado");
    invalidate();
  }

  const dirty = JSON.stringify(local) !== JSON.stringify(horario);

  return (
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setLocal(DEFAULT_HORARIO)}>Restablecer defaults</Button>
          <Button onClick={save} disabled={!dirty}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

const PRECIO_ROWS: { key: keyof Precios; label: string; hint?: string }[] = [
  { key: "gympass_ep", label: "Gympass EP" },
  { key: "gympass_gr", label: "Gympass GR" },
  { key: "classpass", label: "Classpass" },
];

export function PreciosForm() {
  const { horario, precios, invalidate, isLoading } = useCenterConfig();
  const [local, setLocal] = useState<Precios>(precios);

  useEffect(() => {
    if (!isLoading) setLocal(precios);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  async function save() {
    const { error } = await supabase.from("center_config").update({
      horario_base: horario as unknown as never,
      precios: local as unknown as never,
    }).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Precios guardados");
    invalidate();
  }

  const dirty = JSON.stringify(local) !== JSON.stringify(precios);

  return (
    <Card>
      <CardHeader><CardTitle>Precios medios</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Solo para pases externos (Gympass / Classpass). El resto de tipos calcula la facturación
          estimada dividiendo el precio de cada bono entre sus sesiones. Se usa únicamente para el
          cálculo de Estadísticas.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {PRECIO_ROWS.map((row) => (
            <div key={row.key}>
              <Label>{row.label}{row.hint ? <span className="text-muted-foreground text-xs"> ({row.hint})</span> : null}</Label>
              <Input
                type="number"
                min={0}
                value={local[row.key]}
                onChange={(e) => setLocal({ ...local, [row.key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setLocal(DEFAULT_PRECIOS)}>Restablecer defaults</Button>
          <Button onClick={save} disabled={!dirty}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ColoresServiciosForm() {
  const { horario, precios, colores, invalidate, isLoading } = useCenterConfig();
  const { data: servicios = [] } = useServicios();
  const [localColores, setLocalColores] = useState<TipoColores>(colores);

  useEffect(() => {
    if (!isLoading) setLocalColores(colores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const colorOf = (slug: string) => localColores[servicioColorKey(slug)] ?? defaultServicioColor(slug);

  async function save() {
    const { error } = await supabase.from("center_config").update({
      horario_base: horario as unknown as never,
      precios: precios as unknown as never,
      colores: localColores as unknown as never,
    }).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Colores de servicios guardados");
    invalidate();
  }

  const dirty = JSON.stringify(localColores) !== JSON.stringify(colores);

  return (
    <Card>
      <CardHeader><CardTitle>Colores por servicio</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Cada servicio define el color de sus sesiones en la Agenda y el color de la columna
          "Servicio". Las sesiones ya realizadas se muestran en un tono algo más oscuro del
          mismo color.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {servicios.map((s) => (
            <div key={s.id}>
              <Label>{s.nombre}</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  className="h-9 w-12 rounded border border-input bg-background cursor-pointer"
                  value={colorOf(s.slug)}
                  onChange={(e) => setLocalColores({ ...localColores, [servicioColorKey(s.slug)]: e.target.value })}
                />
                <Input
                  className="font-mono uppercase"
                  value={colorOf(s.slug)}
                  onChange={(e) => setLocalColores({ ...localColores, [servicioColorKey(s.slug)]: e.target.value })}
                />
              </div>
            </div>
          ))}
          {servicios.length === 0 && (
            <p className="text-xs text-muted-foreground">Crea primero un servicio.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              const next = { ...localColores };
              for (const s of servicios) delete next[servicioColorKey(s.slug)];
              setLocalColores(next);
            }}
          >
            Restablecer defaults
          </Button>
          <Button onClick={save} disabled={!dirty}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
