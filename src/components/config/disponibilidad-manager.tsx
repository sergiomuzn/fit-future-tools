import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DIAS_SEMANA_LONG } from "@/lib/db";
import { useServicios } from "@/lib/servicios";
import { DIAS_ORDEN, hhmm, useServiceSlots, type ServiceSlot } from "@/lib/service-slots";

export function DisponibilidadManager() {
  const qc = useQueryClient();
  const { data: servicios = [] } = useServicios();
  const [servicio, setServicio] = useState<string>("");
  const activeSlug = servicio || servicios[0]?.slug || "";
  const { data: slots = [], isLoading } = useServiceSlots();

  const delSlots = slots.filter((s) => s.servicio_slug === activeSlug);
  const porDia = useMemo(() => {
    const map = new Map<number, ServiceSlot[]>();
    for (const d of DIAS_ORDEN) map.set(d, []);
    for (const s of delSlots) map.get(s.dia_semana)?.push(s);
    for (const arr of map.values()) arr.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    return map;
  }, [delSlots]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["service_slots"] });

  const addSlot = useMutation({
    mutationFn: async (payload: { dia: number; inicio: string; fin: string; capacidad: number }) => {
      const { error } = await supabase.from("service_slots").insert([
        {
          servicio_slug: activeSlug,
          dia_semana: payload.dia,
          hora_inicio: payload.inicio,
          hora_fin: payload.fin,
          capacidad: payload.capacidad,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Hueco añadido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSlot = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ServiceSlot> }) => {
      const { error } = await supabase.from("service_slots").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Hueco eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Horario disponible por servicio</CardTitle>
        <CardDescription>
          Define los huecos semanales que verán los clientes con acceso a cada servicio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label>Servicio</Label>
            <Select value={activeSlug} onValueChange={setServicio}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecciona un servicio" />
              </SelectTrigger>
              <SelectContent>
                {servicios.map((s) => (
                  <SelectItem key={s.id} value={s.slug}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando horario…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {DIAS_ORDEN.map((dia) => (
              <DiaColumna
                key={dia}
                dia={dia}
                slots={porDia.get(dia) ?? []}
                disabled={!activeSlug}
                onAdd={(inicio, fin, capacidad) => addSlot.mutate({ dia, inicio, fin, capacidad })}
                onUpdate={(id, patch) => updateSlot.mutate({ id, patch })}
                onRemove={(id) => removeSlot.mutate(id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiaColumna({
  dia,
  slots,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
}: {
  dia: number;
  slots: ServiceSlot[];
  disabled: boolean;
  onAdd: (inicio: string, fin: string, capacidad: number) => void;
  onUpdate: (id: string, patch: Partial<ServiceSlot>) => void;
  onRemove: (id: string) => void;
}) {
  const [inicio, setInicio] = useState("09:00");
  const [fin, setFin] = useState("10:00");

  return (
    <div className="rounded-lg border p-2">
      <p className="mb-2 text-sm font-medium">{DIAS_SEMANA_LONG[dia]}</p>
      <div className="space-y-1.5">
        {slots.length === 0 && <p className="text-xs text-muted-foreground">Sin huecos</p>}
        {slots.map((s) => (
          <div key={s.id} className="flex items-center gap-1 rounded-md bg-muted/50 p-1">
            <Input
              type="time"
              value={hhmm(s.hora_inicio)}
              onChange={(e) => onUpdate(s.id, { hora_inicio: e.target.value })}
              className="h-7 w-[70px] px-1 text-xs"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="time"
              value={hhmm(s.hora_fin)}
              onChange={(e) => onUpdate(s.id, { hora_fin: e.target.value })}
              className="h-7 w-[70px] px-1 text-xs"
            />
            <Input
              type="number"
              min={1}
              value={s.capacidad}
              onChange={(e) => onUpdate(s.id, { capacidad: Math.max(1, Number(e.target.value) || 1) })}
              className="h-7 w-11 px-1 text-xs"
              aria-label="Plazas"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => onRemove(s.id)}
              aria-label="Eliminar hueco"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <Input
          type="time"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="h-7 w-[70px] px-1 text-xs"
        />
        <Input
          type="time"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          className="h-7 w-[70px] px-1 text-xs"
        />
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={disabled || inicio >= fin}
          onClick={() => onAdd(inicio, fin, 1)}
          aria-label="Añadir hueco"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}