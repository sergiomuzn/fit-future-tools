import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServicios } from "@/lib/servicios";
import { hhmm, useServiceSlots, type ServiceSlot } from "@/lib/service-slots";
import { SlotsWeekGrid } from "./slots-week-grid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  /** Slug del servicio activo, o "" para "Todos los servicios". */
  servicioSlug: string;
  view?: "dia" | "semana";
  date?: Date;
}

/** Vista de agenda para definir los huecos semanales disponibles por servicio. */
export function DisponibilidadView({ servicioSlug, view = "semana", date }: Props) {
  const qc = useQueryClient();
  const { data: servicios = [] } = useServicios();
  const { data: slots = [] } = useServiceSlots();
  const [editing, setEditing] = useState<ServiceSlot | null>(null);
  const [pending, setPending] = useState<{ dia: number; inicio: string; fin: string; slug: string } | null>(null);

  const nombreServicio = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;
  const visibles = servicioSlug ? slots.filter((s) => s.servicio_slug === servicioSlug) : slots;
  const dias = view === "dia" && date ? [date.getDay()] : undefined;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["service_slots"] });

  const create = useMutation({
    mutationFn: async (p: { dia: number; inicio: string; fin: string; slug: string }) => {
      const { error } = await supabase.from("service_slots").insert([
        { servicio_slug: p.slug, dia_semana: p.dia, hora_inicio: p.inicio, hora_fin: p.fin, capacidad: 1 },
      ]);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setPending(null); toast.success("Hueco añadido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ServiceSlot> }) => {
      const { error } = await supabase.from("service_slots").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Hueco eliminado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <SlotsWeekGrid
        slots={visibles}
        dias={dias}
        nombreServicio={nombreServicio}
        editable
        onCreate={(dia, inicio, fin) => {
          if (servicioSlug) create.mutate({ dia, inicio, fin, slug: servicioSlug });
          else setPending({ dia, inicio, fin, slug: servicios[0]?.slug ?? "" });
        }}
        onSelect={(s) => setEditing(s)}
      />

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo hueco</DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {hhmm(pending.inicio)}–{hhmm(pending.fin)}
              </p>
              <div className="space-y-1.5">
                <Label>Servicio</Label>
                <Select value={pending.slug} onValueChange={(v) => setPending({ ...pending, slug: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un servicio" /></SelectTrigger>
                  <SelectContent>
                    {servicios.map((s) => (
                      <SelectItem key={s.id} value={s.slug}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>Cancelar</Button>
            <Button disabled={!pending?.slug} onClick={() => pending && create.mutate(pending)}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hueco disponible</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Inicio</Label>
                  <Input
                    type="time"
                    value={hhmm(editing.hora_inicio)}
                    onChange={(e) => setEditing({ ...editing, hora_inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fin</Label>
                  <Input
                    type="time"
                    value={hhmm(editing.hora_fin)}
                    onChange={(e) => setEditing({ ...editing, hora_fin: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Plazas</Label>
                <Input
                  type="number"
                  min={1}
                  value={editing.capacidad}
                  onChange={(e) => setEditing({ ...editing, capacidad: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="destructive" onClick={() => editing && remove.mutate(editing.id)}>
              Eliminar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button
                onClick={() =>
                  editing &&
                  update.mutate({
                    id: editing.id,
                    patch: {
                      hora_inicio: editing.hora_inicio,
                      hora_fin: editing.hora_fin,
                      capacidad: editing.capacidad,
                    },
                  })
                }
              >
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
