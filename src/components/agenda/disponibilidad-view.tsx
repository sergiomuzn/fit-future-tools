import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MousePointerSquareDashed, Save, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServicios } from "@/lib/servicios";
import {
  DIAS_ORDEN,
  DIA_NOMBRE,
  hhmm,
  useServiceSlots,
  useSlotStructures,
  type ServiceSlot,
  type SlotTemplate,
} from "@/lib/service-slots";
import { SlotsWeekGrid, type GridMode } from "./slots-week-grid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NONE = "__none";

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function toTime(min: number) {
  const c = Math.max(0, Math.min(min, 23 * 60 + 45));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}:00`;
}

interface Props {
  /** Slug del servicio activo, o "" para "Todos los servicios". */
  servicioSlug: string;
  view?: "dia" | "semana";
  date?: Date;
  /** Servicio activo en "modo pintar" cuando se ven todos los servicios. */
  paintServicioSlug?: string | null;
}

/** Vista de agenda para definir los huecos semanales disponibles por servicio. */
export function DisponibilidadView({ servicioSlug, view = "semana", date, paintServicioSlug }: Props) {
  const qc = useQueryClient();
  const { data: servicios = [] } = useServicios();
  const { data: slots = [] } = useServiceSlots();
  const { data: structures = [] } = useSlotStructures();
  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("id,nombre").eq("activo", true).order("nombre");
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  const [mode, setMode] = useState<GridMode>("crear");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedDay, setCopiedDay] = useState<SlotTemplate[] | null>(null);
  const [editing, setEditing] = useState<(ServiceSlot & { dur: number }) | null>(null);
  const [pending, setPending] = useState<{ dia: number; inicio: string; fin: string; slug: string } | null>(null);
  const [quick, setQuick] = useState<{
    dia: number;
    inicio: string;
    fin: string;
    dur: number;
    plazas: number;
    slug: string;
    trainerId: string;
  } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [structName, setStructName] = useState("");

  const nombreServicio = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;
  const visibles = servicioSlug ? slots.filter((s) => s.servicio_slug === servicioSlug) : slots;
  const dias = view === "dia" && date ? [date.getDay()] : undefined;
  const diasActivos = dias ?? DIAS_ORDEN;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["service_slots"] });
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  useEffect(() => {
    if (mode !== "seleccion") setSelectedIds([]);
  }, [mode]);

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

  const createMany = useMutation({
    mutationFn: async (rows: SlotTemplate[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from("service_slots").insert(rows);
      if (error) throw error;
    },
    onSuccess: (_d, rows) => { invalidate(); toast.success(`${rows.length} huecos creados`); },
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

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("service_slots").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => { invalidate(); setSelectedIds([]); toast.success(`${ids.length} huecos eliminados`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMany = useMutation({
    mutationFn: async (updates: { id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[]) => {
      for (const u of updates) {
        const { error } = await supabase
          .from("service_slots")
          .update({ dia_semana: u.dia_semana, hora_inicio: u.hora_inicio, hora_fin: u.hora_fin })
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveStructure = useMutation({
    mutationFn: async (nombre: string) => {
      const rows: SlotTemplate[] = slots.map((s) => ({
        servicio_slug: s.servicio_slug,
        dia_semana: s.dia_semana,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        capacidad: s.capacidad,
        trainer_id: s.trainer_id,
      }));
      const { error } = await supabase.from("slot_structures").insert([{ nombre, slots: rows as unknown as never }]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slot_structures"] });
      setSaveOpen(false);
      setStructName("");
      toast.success("Estructura guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importStructure = useMutation({
    mutationFn: async (rows: SlotTemplate[]) => {
      const { error: delErr } = await supabase.from("service_slots").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (delErr) throw delErr;
      if (rows.length) {
        const { error } = await supabase.from("service_slots").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Estructura aplicada a la semana"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Creación rápida ----
  function openQuick(dia: number, inicio: string, fin: string) {
    setQuick({
      dia,
      inicio: hhmm(inicio),
      fin: hhmm(fin),
      dur: 60,
      plazas: 1,
      slug: servicioSlug || paintServicioSlug || servicios[0]?.slug || "",
      trainerId: NONE,
    });
  }

  // La hora de inicio manda: el final se ajusta al múltiplo de la duración,
  // añadiendo siempre una sesión de más si no cuadra exactamente.
  const quickCalc = useMemo(() => {
    if (!quick) return null;
    const ini = toMin(quick.inicio);
    const finReq = toMin(quick.fin);
    const dur = Math.max(5, quick.dur);
    const bruto = Math.max(dur, finReq - ini);
    const n = Math.ceil(bruto / dur);
    const finAjustado = ini + n * dur;
    return { ini, dur, n, finAjustado, finTexto: hhmm(toTime(finAjustado)) };
  }, [quick]);

  function confirmQuick() {
    if (!quick || !quickCalc || !quick.slug) return;
    const rows: SlotTemplate[] = Array.from({ length: quickCalc.n }, (_, i) => ({
      servicio_slug: quick.slug,
      dia_semana: quick.dia,
      hora_inicio: toTime(quickCalc.ini + i * quickCalc.dur),
      hora_fin: toTime(quickCalc.ini + (i + 1) * quickCalc.dur),
      capacidad: Math.max(1, quick.plazas),
      trainer_id: quick.trainerId === NONE ? null : quick.trainerId,
    }));
    createMany.mutate(rows, { onSuccess: () => setQuick(null) });
  }

  // ---- Copiar / pegar días ----
  function copyDay(dia: number) {
    const rows = slots.filter((s) => s.dia_semana === dia);
    if (!rows.length) return toast.error("Ese día no tiene huecos");
    setCopiedDay(
      rows.map((s) => ({
        servicio_slug: s.servicio_slug,
        dia_semana: s.dia_semana,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        capacidad: s.capacidad,
        trainer_id: s.trainer_id,
      })),
    );
    toast.success(`${DIA_NOMBRE[dia]} copiado (${rows.length} huecos)`);
  }

  function pasteDay(dia: number) {
    if (!copiedDay?.length) return;
    createMany.mutate(copiedDay.map((r) => ({ ...r, dia_semana: dia })));
  }

  function clearDay(dia: number) {
    const ids = slots.filter((s) => s.dia_semana === dia).map((s) => s.id);
    if (ids.length) removeMany.mutate(ids);
  }

  // ---- Selección múltiple ----
  function moveSelection(deltaDias: number, deltaMin: number) {
    const orden = [...diasActivos];
    const updates = selectedIds
      .map((id) => slotById.get(id))
      .filter((s): s is ServiceSlot => !!s)
      .map((s) => {
        const idx = orden.indexOf(s.dia_semana);
        const nextIdx = Math.max(0, Math.min(orden.length - 1, idx + deltaDias));
        return {
          id: s.id,
          dia_semana: orden[nextIdx] ?? s.dia_semana,
          hora_inicio: toTime(toMin(s.hora_inicio) + deltaMin),
          hora_fin: toTime(toMin(s.hora_fin) + deltaMin),
        };
      });
    if (updates.length) moveMany.mutate(updates);
  }

  function duplicateSelectionTo(dia: number) {
    const rows: SlotTemplate[] = selectedIds
      .map((id) => slotById.get(id))
      .filter((s): s is ServiceSlot => !!s)
      .map((s) => ({
        servicio_slug: s.servicio_slug,
        dia_semana: dia,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        capacidad: s.capacidad,
        trainer_id: s.trainer_id,
      }));
    if (rows.length) createMany.mutate(rows);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 text-xs">
        <Button
          size="sm"
          variant={mode === "rapida" ? "default" : "outline"}
          className="h-8 gap-1.5"
          onClick={() => setMode(mode === "rapida" ? "crear" : "rapida")}
        >
          <Wand2 className="h-3.5 w-3.5" /> Creación rápida
        </Button>
        <Button
          size="sm"
          variant={mode === "seleccion" ? "default" : "outline"}
          className="h-8 gap-1.5"
          onClick={() => setMode(mode === "seleccion" ? "crear" : "seleccion")}
        >
          <MousePointerSquareDashed className="h-3.5 w-3.5" /> Seleccionar
        </Button>

        {mode === "seleccion" && (
          <>
            <span className="text-muted-foreground">{selectedIds.length} seleccionados</span>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5"
              disabled={!selectedIds.length}
              onClick={() => removeMany.mutate(selectedIds)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!selectedIds.length}>
                  <Copy className="h-3.5 w-3.5" /> Duplicar en…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {DIAS_ORDEN.map((d) => (
                  <DropdownMenuItem key={d} onSelect={() => duplicateSelectionTo(d)}>
                    {DIA_NOMBRE[d]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {copiedDay && <span className="text-muted-foreground">Día copiado ({copiedDay.length})</span>}
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setSaveOpen(true)}>
            <Save className="h-3.5 w-3.5" /> Guardar estructura
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">Importar estructura</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Estructuras guardadas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {structures.length === 0 && (
                <DropdownMenuItem disabled>No hay ninguna guardada</DropdownMenuItem>
              )}
              {structures.map((st) => (
                <DropdownMenuItem key={st.id} onSelect={() => importStructure.mutate(st.slots ?? [])}>
                  {st.nombre} · {(st.slots ?? []).length} huecos
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {mode !== "crear" && (
        <div className={cn("border-b px-4 py-1.5 text-xs font-medium", "bg-primary/90 text-primary-foreground")}>
          {mode === "rapida"
            ? "Creación rápida · arrastra sobre un día para definir la franja y generar varias sesiones."
            : "Selección · arrastra para dibujar un rectángulo, Ctrl/Cmd + clic para añadir o quitar, arrastra los huecos para moverlos en bloque."}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <SlotsWeekGrid
          slots={visibles}
          dias={dias}
          nombreServicio={nombreServicio}
          editable
          mode={mode}
          selectedIds={selectedIds}
          onSelectedChange={setSelectedIds}
          onMoveSelection={moveSelection}
          onCopyDay={copyDay}
          onPasteDay={pasteDay}
          onClearDay={clearDay}
          canPaste={!!copiedDay?.length}
          onCreate={(dia, inicio, fin) => {
            if (mode === "rapida") return openQuick(dia, inicio, fin);
            const slug = servicioSlug || paintServicioSlug || "";
            if (slug) create.mutate({ dia, inicio, fin, slug });
            else setPending({ dia, inicio, fin, slug: servicios[0]?.slug ?? "" });
          }}
          onSelect={(s) => setEditing({ ...s, dur: toMin(s.hora_fin) - toMin(s.hora_inicio) })}
        />
      </div>

      {/* Creación rápida */}
      <Dialog open={!!quick} onOpenChange={(o) => !o && setQuick(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Creación rápida · {quick ? DIA_NOMBRE[quick.dia] : ""}</DialogTitle>
          </DialogHeader>
          {quick && quickCalc && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Inicio de la franja</Label>
                  <Input type="time" value={quick.inicio} onChange={(e) => setQuick({ ...quick, inicio: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fin de la franja</Label>
                  <Input type="time" value={quick.fin} onChange={(e) => setQuick({ ...quick, fin: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Duración por sesión (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={quick.dur}
                    onChange={(e) => setQuick({ ...quick, dur: Math.max(5, Number(e.target.value) || 5) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Plazas por sesión</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quick.plazas}
                    onChange={(e) => setQuick({ ...quick, plazas: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de sesión</Label>
                <Select value={quick.slug} onValueChange={(v) => setQuick({ ...quick, slug: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un servicio" /></SelectTrigger>
                  <SelectContent>
                    {servicios.map((s) => (
                      <SelectItem key={s.id} value={s.slug}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Entrenador (opcional)</Label>
                <Select value={quick.trainerId} onValueChange={(v) => setQuick({ ...quick, trainerId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin asignar</SelectItem>
                    {trainers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                Se crearán <span className="font-semibold text-foreground">{quickCalc.n} sesiones</span> de{" "}
                {quickCalc.dur} min · franja {quick.inicio}–{quickCalc.finTexto}
                {quickCalc.finTexto !== quick.fin && " (fin ajustado a la duración)"}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQuick(null)}>Cancelar</Button>
            <Button disabled={!quick?.slug} onClick={confirmQuick}>Crear sesiones</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guardar estructura */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardar estructura</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={structName}
              onChange={(e) => setStructName(e.target.value)}
              placeholder="Ej. Horario de temporada"
            />
            <p className="text-xs text-muted-foreground">
              Se guardarán los {slots.length} huecos de la semana actual para poder importarlos después.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button disabled={!structName.trim()} onClick={() => saveStructure.mutate(structName.trim())}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nuevo hueco simple */}
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

      {/* Detalle de hueco individual */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hueco disponible · {editing ? DIA_NOMBRE[editing.dia_semana] : ""}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Tipo de sesión</Label>
                <Select
                  value={editing.servicio_slug}
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
                    value={editing.dur}
                    onChange={(e) => setEditing({ ...editing, dur: Math.max(5, Number(e.target.value) || 5) })}
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
              <div className="space-y-1.5">
                <Label>Entrenador (opcional)</Label>
                <Select
                  value={editing.trainer_id ?? NONE}
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
                      servicio_slug: editing.servicio_slug,
                      hora_inicio: toTime(toMin(editing.hora_inicio)),
                      hora_fin: toTime(toMin(editing.hora_inicio) + editing.dur),
                      capacidad: editing.capacidad,
                      trainer_id: editing.trainer_id,
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
    </div>
  );
}
