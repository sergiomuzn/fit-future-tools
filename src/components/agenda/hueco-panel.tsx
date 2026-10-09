import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClientPicker } from "@/components/clients/client-picker";
import { FueraHorarioAviso } from "@/components/fuera-horario-aviso";
import { useCenterConfig, isOutsideOpening } from "@/lib/center-schedule";
import { ESTADO_BG, ESTADO_LABEL, type SesionEstado } from "@/lib/db";
import { notificarSesionesAsignadas } from "@/lib/notificaciones.functions";
import { hhmm } from "@/lib/service-slots";
import type { SlotInstance } from "@/lib/slot-propagation";
import { cn, formatDateShort } from "@/lib/utils";

type Pestana = "reservados" | "cola" | "cancelados";

export interface PanelReserva {
  id: string;
  client_id: string | null;
  titulo: string | null;
  clients: { nombre: string } | null;
}

export interface HuecoPanelDraft {
  servicioSlug: string;
  horaInicio: string;
  horaFin: string;
  trainerId: string | null;
  estado: SesionEstado;
  esPrueba: boolean;
  porConfirmar: boolean;
  repeatWeeks: number;
  notas: string;
  clientIds: string[];
}

interface Props {
  inst: SlotInstance | null;
  servicioNombre: string;
  color: string;
  trainerNombre: string | null;
  trainers?: { id: string; nombre: string }[];
  servicios?: { slug: string; nombre: string; capacidad_default: number | null }[];
  isNew?: boolean;
  reservas: PanelReserva[];
  estadoInicial?: SesionEstado;
  esPruebaInicial?: boolean;
  porConfirmarInicial?: boolean;
  notasIniciales?: string | null;
  /** Id real del hueco propagado; null cuando la sesión es manual de Agenda. */
  slotInstanceId?: string | null;
  /** Fila de sesión vacía existente que se rellena con el primer cliente. */
  fillSessionId?: string | null;
  onClose: () => void;
  onSave?: (draft: HuecoPanelDraft) => Promise<boolean | void> | boolean | void;
  onDelete?: () => void;
  onCancelarReserva: (r: PanelReserva) => void;
}

const NONE = "__none";
const EDITABLE_STATES: SesionEstado[] = ["reservada", "realizada", "cancelada"];
const ESTADO_PILL: Record<SesionEstado, string> = {
  reservada: "border-state-reservada/50 bg-state-reservada/15 text-state-reservada",
  realizada: "border-state-realizada/50 bg-state-realizada/15 text-state-realizada",
  cancelada: "border-state-cancelada/50 bg-state-cancelada/15 text-state-cancelada",
  prueba: "border-state-prueba/50 bg-state-prueba/15 text-state-prueba",
  renovacion: "border-state-renovacion/50 bg-state-renovacion/15 text-state-renovacion",
};

export function HuecoPanel({
  inst,
  servicioNombre,
  color,
  trainerNombre,
  trainers = [],
  servicios = [],
  isNew = false,
  reservas,
  estadoInicial,
  esPruebaInicial = false,
  porConfirmarInicial = false,
  notasIniciales,
  slotInstanceId,
  fillSessionId,
  onClose,
  onSave,
  onDelete,
  onCancelarReserva,
}: Props) {
  const qc = useQueryClient();
  const { horario, specialsMap } = useCenterConfig();
  const [tab, setTab] = useState<Pestana>("reservados");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [estado, setEstado] = useState<SesionEstado>("reservada");
  const [esPrueba, setEsPrueba] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [notas, setNotas] = useState("");
  const [pickerValues, setPickerValues] = useState<(string | null)[]>([]);
  const [saving, setSaving] = useState(false);
  const [servicioSlug, setServicioSlug] = useState("");

  useEffect(() => {
    if (!inst) return;
    setTab("reservados");
    setHoraInicio(hhmm(inst.hora_inicio));
    setHoraFin(hhmm(inst.hora_fin));
    setTrainerId(inst.trainer_id);
    setEstado(estadoInicial ?? (new Date(`${inst.fecha}T${hhmm(inst.hora_fin)}:00`) < new Date() ? "realizada" : "reservada"));
    setEsPrueba(esPruebaInicial);
    setPorConfirmar(porConfirmarInicial);
    setRepeatWeeks(0);
    setNotas(notasIniciales ?? "");
    setServicioSlug(inst.servicio_slug);
    setPickerValues([]);
  }, [inst?.id, estadoInicial, esPruebaInicial, porConfirmarInicial, notasIniciales]);

  const { data: extra } = useQuery({
    queryKey: ["hueco-panel", inst?.id, inst?.fecha, inst?.hora_inicio],
    enabled: !!inst,
    queryFn: async () => {
      if (!inst) return { cola: [], cancelados: [] };
      const [cola, canc] = await Promise.all([
        (supabase as any).from("reserva_cola").select("id,client_id,hora_inicio,servicio_slug,estado,created_at").eq("fecha", inst.fecha).in("estado", ["en_cola", "ofrecida"]).order("created_at"),
        supabase.from("sessions").select("id,client_id,titulo,hora_inicio,servicio_slug,slot_instance_id,clients(nombre)").eq("fecha", inst.fecha).eq("estado", "cancelada"),
      ]);
      const colaRows = ((cola.data ?? []) as { id: string; client_id: string; hora_inicio: string; servicio_slug: string | null }[])
        .filter((c) => hhmm(c.hora_inicio) === hhmm(inst.hora_inicio) && (!c.servicio_slug || c.servicio_slug === inst.servicio_slug));
      const nombres = new Map<string, string>();
      if (colaRows.length) {
        const { data } = await supabase.from("clients").select("id,nombre").in("id", colaRows.map((c) => c.client_id));
        for (const c of data ?? []) nombres.set(c.id, c.nombre);
      }
      const cancelados = ((canc.data ?? []) as any[]).filter((s) =>
        s.slot_instance_id ? s.slot_instance_id === inst.id : hhmm(s.hora_inicio) === hhmm(inst.hora_inicio) && s.servicio_slug === inst.servicio_slug,
      );
      return {
        cola: colaRows.map((c) => ({ id: c.id, nombre: nombres.get(c.client_id) ?? "Cliente" })),
        cancelados: cancelados.map((s) => ({ id: s.id as string, nombre: (s.clients?.nombre ?? s.titulo ?? "Cliente") as string })),
      };
    },
  });

  const capacidad = Math.max(1, servicios.find((service) => service.slug === servicioSlug)?.capacidad_default ?? inst?.capacidad ?? 1);
  const selectedNewCount = isNew ? pickerValues.filter(Boolean).length : 0;
  const libres = Math.max(0, capacidad - reservas.length - selectedNewCount);
  useEffect(() => {
    setPickerValues((old) => Array.from({ length: Math.max(0, capacidad - reservas.length) }, (_, i) => old[i] ?? null));
  }, [capacidad, reservas.length, inst?.id]);

  const anadir = useMutation({
    mutationFn: async ({ clientId, row }: { clientId: string; row: number }) => {
      if (!inst || isNew) return;
      const valores = {
        fecha: inst.fecha,
        hora_inicio: `${horaInicio}:00`,
        hora_fin: `${horaFin}:00`,
        servicio_slug: inst.servicio_slug,
        trainer_id: trainerId,
        client_id: clientId,
        estado: esPrueba ? "prueba" : estado,
        tipo: esPrueba ? "prueba" : null,
        por_confirmar: estado === "reservada" && porConfirmar,
      };
      // Sesión manual de Agenda sin cliente: se rellena la fila existente en
      // vez de insertar una nueva (evita duplicados y la FK de slot_instance_id).
      const { data, error } = fillSessionId
        ? await supabase.from("sessions").update(valores as any).eq("id", fillSessionId).select("id").single()
        : await supabase.from("sessions").insert({
            ...valores,
            booking_tipo: "centro",
            slot_instance_id: slotInstanceId !== undefined ? slotInstanceId : inst.id,
          } as any).select("id").single();
      if (error) throw error;
      setPickerValues((old) => old.map((value, index) => index === row ? null : value));
      void notificarSesionesAsignadas({ data: { sesiones: [{ clientId, fecha: inst.fecha, hora: `${horaInicio}:00` }] } }).catch(() => {});
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions-range"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Reserva añadida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listas: Record<Pestana, { id: string; nombre: string; reserva?: PanelReserva }[]> = useMemo(() => ({
    reservados: reservas.map((r) => ({ id: r.id, nombre: r.clients?.nombre ?? r.titulo ?? "Cliente", reserva: r })),
    cola: extra?.cola ?? [],
    cancelados: extra?.cancelados ?? [],
  }), [reservas, extra]);

  async function guardar() {
    if (!inst || !onSave) return;
    if (!horaInicio || !horaFin || horaFin <= horaInicio) {
      toast.error("Revisa las horas de la sesión");
      return;
    }
    setSaving(true);
    try {
      const result = await onSave({ servicioSlug, horaInicio, horaFin, trainerId, estado, esPrueba, porConfirmar, repeatWeeks, notas, clientIds: pickerValues.filter((id): id is string => !!id) });
      if (result !== false) onClose();
    } finally {
      setSaving(false);
    }
  }

  const estadoVisual = esPrueba ? "prueba" : estado;
  const fechaDia = inst
    ? new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(new Date(`${inst.fecha}T12:00:00`))
    : "";
  const iniciales = (nombre: string) => nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");

  return (
    <Dialog open={!!inst} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        {inst && (
          <>
            <DialogDescription className="sr-only">Detalle y edición de la sesión</DialogDescription>
            <div className="relative shrink-0 bg-primary px-6 pb-5 pt-5 text-primary-foreground">
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3 pr-7">
                <DialogTitle className="flex min-w-0 flex-1 items-center gap-2.5 text-lg">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  {servicios.length > 0 ? (
                    <Select value={servicioSlug} onValueChange={setServicioSlug}>
                      <SelectTrigger className="h-8 min-w-0 max-w-72 border-0 bg-transparent px-0 text-lg font-semibold text-primary-foreground shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
                      <SelectContent>{servicios.map((service) => <SelectItem key={service.slug} value={service.slug}>{service.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span className="truncate">{servicioNombre}</span>}
                </DialogTitle>
                <span className="shrink-0 text-sm font-normal text-primary-foreground/65">
                  ({reservas.length + selectedNewCount}/{libres})
                </span>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span className="capitalize text-primary-foreground/85">{fechaDia}</span>
                  <span className="text-primary-foreground/40">·</span>
                  <span className="whitespace-nowrap text-primary-foreground/85">{formatDateShort(inst.fecha)}</span>
                  <span className="mx-0.5 text-primary-foreground/40">·</span>
                  <div className="flex items-center gap-1">
                    <Input
                      aria-label="Hora de inicio"
                      type="time"
                      value={horaInicio}
                      onChange={(e) => setHoraInicio(e.target.value)}
                      className="h-7 w-[4.9rem] border-0 bg-transparent px-1 text-center text-sm font-semibold text-primary-foreground shadow-none focus-visible:ring-1 focus-visible:ring-primary-foreground/40"
                    />
                    <span className="text-primary-foreground/45">—</span>
                    <Input
                      aria-label="Hora de fin"
                      type="time"
                      value={horaFin}
                      onChange={(e) => setHoraFin(e.target.value)}
                      className="h-7 w-[4.9rem] border-0 bg-transparent px-1 text-center text-sm font-semibold text-primary-foreground shadow-none focus-visible:ring-1 focus-visible:ring-primary-foreground/40"
                    />
                  </div>
                </div>
                <Select value={estado} onValueChange={(value) => setEstado(value as SesionEstado)}>
                  <SelectTrigger className={cn("h-8 w-auto min-w-28 rounded-full px-3 text-xs font-semibold shadow-none focus:ring-0", ESTADO_PILL[estadoVisual])}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>{EDITABLE_STATES.map((item) => <SelectItem key={item} value={item}>{ESTADO_LABEL[item]}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <FueraHorarioAviso show={isOutsideOpening(inst.fecha, horaInicio, horaFin, horario, specialsMap)} />

              <div className={cn("flex flex-wrap items-center gap-4", isOutsideOpening(inst.fecha, horaInicio, horaFin, horario, specialsMap) && "mt-3")}>
                <Select value={trainerId ?? NONE} onValueChange={(v) => setTrainerId(v === NONE ? null : v)}>
                  <SelectTrigger className="h-8 w-auto max-w-56 rounded-full border-primary-foreground/20 bg-primary-foreground/10 px-3 text-xs text-primary-foreground shadow-none focus:ring-0">
                    <SelectValue placeholder="Sin entrenador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin entrenador</SelectItem>
                    {trainers.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Checkbox id="panel-prueba" checked={esPrueba} onCheckedChange={(value) => setEsPrueba(!!value)} className="border-primary-foreground/70 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                <Label htmlFor="panel-prueba" className="cursor-pointer text-[11px] font-semibold uppercase text-primary-foreground/75">Sesión de prueba</Label>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <h3 className="text-[11px] font-bold uppercase text-muted-foreground">Clientes</h3>
              <div className="grid grid-cols-3 border-b">
                {(["reservados", "cola", "cancelados"] as Pestana[]).map((key) => {
                  const label = key === "reservados" ? "Reservados" : key === "cola" ? "En cola" : "Cancelados";
                  return (
                    <Button key={key} type="button" variant="ghost" onClick={() => setTab(key)} className={cn("h-9 rounded-none border-b-2 px-1 text-xs sm:px-3", tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
                      <span className="truncate">{label}</span>
                      <span className={cn("ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px]", tab === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{listas[key].length}</span>
                    </Button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {tab === "reservados" && pickerValues.map((value, row) => (
                  <div key={`free-${row}`} className="min-w-0">
                    <ClientPicker
                      value={value}
                      autoFocus={row === 0}
                      onChange={(clientId) => {
                        setPickerValues((old) => old.map((item, index) => index === row ? clientId : item));
                        if (clientId && !isNew) anadir.mutate({ clientId, row });
                      }}
                    />
                  </div>
                ))}
                {listas[tab].map((item) => (
                  <div key={item.id} className="flex h-11 items-center justify-between gap-3 rounded-lg border bg-muted/35 px-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{iniciales(item.nombre)}</span>
                      <span className="truncate text-sm font-medium">{item.nombre}</span>
                    </div>
                    {item.reserva && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Opciones de ${item.nombre}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive" onClick={() => onCancelarReserva(item.reserva as PanelReserva)}>Cancelar reserva</DropdownMenuItem></DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
                {listas[tab].length === 0 && (tab !== "reservados" || libres === 0) && <p className="py-3 text-center text-xs text-muted-foreground">Esta sesión no tiene clientes en esta categoría</p>}
              </div>

              <div className="space-y-3 pt-1">
                <Label htmlFor="panel-notas" className="text-[10px] font-bold uppercase text-muted-foreground">Notas internas</Label>
                <Textarea id="panel-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Añade recordatorios sobre esta sesión..." className="min-h-16 resize-none rounded-lg" />
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <Checkbox id="panel-confirmar" disabled={estado !== "reservada"} checked={estado === "reservada" && porConfirmar} onCheckedChange={(value) => setPorConfirmar(!!value)} />
                    <Label htmlFor="panel-confirmar" className="cursor-pointer text-sm">Por confirmar</Label>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5">
                    <Label htmlFor="panel-repeat" className="whitespace-nowrap text-[10px] font-bold uppercase text-muted-foreground">Repetir</Label>
                    <Input id="panel-repeat" type="number" min={0} max={52} value={repeatWeeks || ""} placeholder="0" onChange={(e) => setRepeatWeeks(Number(e.target.value) || 0)} className="h-6 w-10 border-0 bg-transparent px-1 text-center text-sm font-bold shadow-none focus-visible:ring-0" />
                    <span className="text-xs text-muted-foreground">sem.</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-4 sm:justify-between">
              {onDelete ? <Button variant="ghost" className="text-xs font-bold uppercase text-destructive hover:text-destructive" onClick={onDelete}>Eliminar sesión</Button> : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" className="text-muted-foreground" onClick={onClose}>Cerrar</Button>
                <Button disabled={!onSave || saving} onClick={guardar}>Guardar cambios</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}