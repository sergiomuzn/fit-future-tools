import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { capacidadDeServicio, useServicios } from "@/lib/servicios";
import { DIA_NOMBRE, hhmm, type ServiceSlot } from "@/lib/service-slots";
import { mondayOf, weekDates, ymdLocal, useSlotInstances, type SlotInstance } from "@/lib/slot-propagation";
import { SlotsWeekGrid } from "./slots-week-grid";
import { enterToSave } from "@/lib/enter-to-save";

const NONE = "__none";

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function toTime(min: number) {
  const c = Math.max(0, Math.min(min, 23 * 60 + 45));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}:00`;
}
function dowOf(fecha: string) {
  return new Date(`${fecha}T00:00:00`).getDay();
}

interface Props {
  servicioSlug: string;
  view?: "dia" | "semana";
  date?: Date;
  paintServicioSlug?: string | null;
}

/**
 * Modo vista: muestra los huecos ya propagados a fechas concretas
 * (`service_slot_instances`). Se pueden crear, mover o eliminar sin tocar la
 * plantilla semanal; los huecos con reserva quedan bloqueados.
 */
export function InstanciasView({ servicioSlug, view = "semana", date, paintServicioSlug }: Props) {
  const qc = useQueryClient();
  const { data: servicios = [] } = useServicios();
  const base = date ?? new Date();

  const fechas = useMemo(
    () => (view === "dia" ? [ymdLocal(base)] : weekDates(mondayOf(base))),
    [view, base.getTime()],
  );
  const from = fechas[0]!;
  const to = fechas[fechas.length - 1]!;
  const fechaPorDia = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of fechas) m.set(dowOf(f), f);
    return m;
  }, [fechas]);
  const dias = view === "dia" ? [dowOf(from)] : undefined;

  const { data: instancias = [] } = useSlotInstances(from, to);
  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("id,nombre").eq("activo", true).order("nombre");
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  /** Sesiones reales del rango: sirven para detectar huecos con reserva. */
  const { data: sesiones = [] } = useQuery({
    queryKey: ["sessions-range", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("fecha,hora_inicio,servicio_slug,client_id,estado")
        .gte("fecha", from)
        .lte("fecha", to);
      return (data ?? []) as {
        fecha: string;
        hora_inicio: string;
        servicio_slug: string | null;
        client_id: string | null;
        estado: string;
      }[];
    },
  });

  const reservadas = useMemo(() => {
    const s = new Set<string>();
    for (const r of sesiones) {
      if (!r.client_id || r.estado === "cancelada") continue;
      s.add(`${r.servicio_slug ?? ""}|${r.fecha}|${r.hora_inicio.slice(0, 5)}`);
    }
    return s;
  }, [sesiones]);

  const visibles = useMemo(
    () => instancias.filter((i) => (servicioSlug ? i.servicio_slug === servicioSlug : true)),
    [instancias, servicioSlug],
  );

  const asSlots = useMemo<ServiceSlot[]>(
    () =>
      visibles.map((i) => ({
        id: i.id,
        servicio_slug: i.servicio_slug,
        dia_semana: dowOf(i.fecha),
        hora_inicio: i.hora_inicio,
        hora_fin: i.hora_fin,
        capacidad: i.capacidad,
        activo: i.activo,
        nota: null,
        trainer_id: i.trainer_id,
      })),
    [visibles],
  );
  const instById = useMemo(() => new Map(visibles.map((i) => [i.id, i])), [visibles]);
  const lockedIds = useMemo(
    () =>
      visibles
        .filter((i) => reservadas.has(`${i.servicio_slug}|${i.fecha}|${i.hora_inicio.slice(0, 5)}`))
        .map((i) => i.id),
    [visibles, reservadas],
  );
  const lockedSet = useMemo(() => new Set(lockedIds), [lockedIds]);

  const [editing, setEditing] = useState<(SlotInstance & { dur: string; cap: string }) | null>(null);
  const [pending, setPending] = useState<{ fecha: string; inicio: string; fin: string; slug: string } | null>(null);

  const nombreServicio = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["service_slot_instances"] });

  const create = useMutation({
    mutationFn: async (p: { fecha: string; inicio: string; fin: string; slug: string }) => {
      const { error } = await supabase.from("service_slot_instances").insert([
        {
          service_slot_id: null,
          servicio_slug: p.slug,
          fecha: p.fecha,
          hora_inicio: p.inicio,
          hora_fin: p.fin,
          capacidad: capacidadDeServicio(servicios, p.slug),
          origen: "vista",
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setPending(null); toast.success("Hueco añadido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SlotInstance> }) => {
      const { error } = await supabase.from("service_slot_instances").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_slot_instances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Hueco eliminado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMany = useMutation({
    onMutate: (updates: { id: string; fecha: string; hora_inicio: string; hora_fin: string }[]) => {
      const byId = new Map(updates.map((u) => [u.id, u]));
      qc.setQueriesData<SlotInstance[]>({ queryKey: ["service_slot_instances"] }, (old) =>
        old?.map((s) => {
          const u = byId.get(s.id);
          return u ? { ...s, fecha: u.fecha, hora_inicio: u.hora_inicio, hora_fin: u.hora_fin } : s;
        }),
      );
    },
    mutationFn: async (updates: { id: string; fecha: string; hora_inicio: string; hora_fin: string }[]) => {
      for (const u of updates) {
        const { error } = await supabase
          .from("service_slot_instances")
          .update({ fecha: u.fecha, hora_inicio: u.hora_inicio, hora_fin: u.hora_fin })
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => { invalidate(); toast.error(e.message); },
  });

  const ordenDias = useMemo(() => [...fechaPorDia.keys()], [fechaPorDia]);

  function moveSelection(deltaDias: number, deltaMin: number, ids: string[]) {
    const orden = view === "dia" ? ordenDias : [1, 2, 3, 4, 5, 6, 0];
    const updates = ids
      .filter((id) => !lockedSet.has(id))
      .map((id) => instById.get(id))
      .filter((i): i is SlotInstance => !!i)
      .map((i) => {
        const idx = orden.indexOf(dowOf(i.fecha));
        const nextIdx = Math.max(0, Math.min(orden.length - 1, idx + deltaDias));
        const fecha = fechaPorDia.get(orden[nextIdx] ?? dowOf(i.fecha)) ?? i.fecha;
        return {
          id: i.id,
          fecha,
          hora_inicio: toTime(toMin(i.hora_inicio) + deltaMin),
          hora_fin: toTime(toMin(i.hora_fin) + deltaMin),
        };
      });
    if (updates.length) moveMany.mutate(updates);
  }

  function saveEditing() {
    if (!editing) return;
    update.mutate({
      id: editing.id,
      patch: {
        servicio_slug: editing.servicio_slug,
        hora_inicio: toTime(toMin(editing.hora_inicio)),
        hora_fin: toTime(toMin(editing.hora_inicio) + Math.max(5, Number(editing.dur) || 60)),
        capacidad: Math.max(1, Number(editing.cap) || 1),
        trainer_id: editing.trainer_id,
      },
    });
  }

  const editingLocked = !!editing && lockedSet.has(editing.id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <SlotsWeekGrid
          slots={asSlots}
          dias={dias}
          nombreServicio={nombreServicio}
          editable
          lockedIds={lockedIds}
          onMoveSelection={moveSelection}
          onCreate={(dia, inicio, fin) => {
            const fecha = fechaPorDia.get(dia);
            if (!fecha) return;
            const slug = servicioSlug || paintServicioSlug || "";
            if (slug) create.mutate({ fecha, inicio, fin, slug });
            else setPending({ fecha, inicio, fin, slug: servicios[0]?.slug ?? "" });
          }}
          onSelect={(s) => {
            const inst = instById.get(s.id);
            if (!inst) return;
            setEditing({
              ...inst,
              dur: String(toMin(inst.hora_fin) - toMin(inst.hora_inicio)),
              cap: String(inst.capacidad),
            });
          }}
        />
      </div>

      {/* Nuevo hueco */}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent
          className="sm:max-w-sm"
          onKeyDown={enterToSave(() => pending?.slug && create.mutate(pending))}
        >
          <DialogHeader>
            <DialogTitle>Nuevo hueco</DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {pending.fecha} · {hhmm(pending.inicio)}–{hhmm(pending.fin)}
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

      {/* Detalle del hueco propagado */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm" onKeyDown={enterToSave(() => !editingLocked && saveEditing())}>
          <DialogHeader>
            <DialogTitle>
              Hueco propagado · {editing ? `${DIA_NOMBRE[dowOf(editing.fecha)]} ${editing.fecha}` : ""}
            </DialogTitle>
          </DialogHeader>
          {editing && editingLocked && (
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Este hueco tiene una reserva. Para modificarlo o eliminarlo hay que cancelar antes la
              reserva del cliente.
            </p>
          )}
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Tipo de sesión</Label>
                <Select
                  value={editing.servicio_slug}
                  disabled={editingLocked}
                  onValueChange={(v) => setEditing({ ...editing, servicio_slug: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {servicios.map((s) => (
                      <SelectItem key={s.id} value={s.slug}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Hora de inicio</Label>
                  <Input
                    type="time"
                    disabled={editingLocked}
                    value={hhmm(editing.hora_inicio)}
                    onChange={(e) => setEditing({ ...editing, hora_inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Duración (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    disabled={editingLocked}
                    value={editing.dur}
                    onChange={(e) => setEditing({ ...editing, dur: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Plazas</Label>
                <Input
                  type="number"
                  min={1}
                  disabled={editingLocked}
                  value={editing.cap}
                  onChange={(e) => setEditing({ ...editing, cap: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Entrenador (opcional)</Label>
                <Select
                  value={editing.trainer_id ?? NONE}
                  disabled={editingLocked}
                  onValueChange={(v) => setEditing({ ...editing, trainer_id: v === NONE ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin asignar</SelectItem>
                    {trainers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              disabled={editingLocked}
              onClick={() => editing && remove.mutate(editing.id)}
            >
              Eliminar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cerrar</Button>
              <Button disabled={editingLocked} onClick={saveEditing}>Guardar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
