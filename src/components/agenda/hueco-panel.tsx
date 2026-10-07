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
  onClose: () => void;
  onSave?: (draft: HuecoPanelDraft) => Promise<boolean | void> | boolean | void;
  onDelete?: () => void;
  onCancelarReserva: (r: PanelReserva) => void;
}

const NONE = "__none";
const EDITABLE_STATES: SesionEstado[] = ["reservada", "realizada", "cancelada"];

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
      const { data, error } = await supabase.from("sessions").insert({
        fecha: inst.fecha,
        hora_inicio: `${horaInicio}:00`,
        hora_fin: `${horaFin}:00`,
        servicio_slug: inst.servicio_slug,
        trainer_id: trainerId,
        client_id: clientId,
        estado: esPrueba ? "prueba" : estado,
        tipo: esPrueba ? "prueba" : null,
        por_confirmar: estado === "reservada" && porConfirmar,
        booking_tipo: "centro",
        slot_instance_id: inst.id,
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

  return (
    <Dialog open={!!inst} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        {inst && (
          <>
            <DialogDescription className="sr-only">Detalle y edición de la sesión</DialogDescription>
            <div className="relative space-y-3 bg-primary px-5 pb-4 pt-5 text-primary-foreground">
              <div className="flex items-start justify-between gap-4 pr-8">
                <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  {servicios.length > 0 ? (
                    <Select value={servicioSlug} onValueChange={setServicioSlug}>
                      <SelectTrigger className="h-8 min-w-0 border-0 bg-transparent px-0 text-base font-semibold text-primary-foreground shadow-none"><SelectValue /></SelectTrigger>
                      <SelectContent>{servicios.map((service) => <SelectItem key={service.slug} value={service.slug}>{service.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span className="truncate">{servicioNombre}</span>}
                </DialogTitle>
                <div className="shrink-0 text-right text-xs font-medium opacity-90">
                  <div>{reservas.length + selectedNewCount} ocupadas</div>
                  <div>{libres} disponibles</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-[11px] opacity-70">Fecha</div>
                  <div className="text-sm font-medium">{formatDateShort(inst.fecha)}</div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label htmlFor="panel-inicio" className="text-[11px] text-primary-foreground/70">Inicio</Label>
                    <Input id="panel-inicio" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="mt-1 h-8 border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground" />
                  </div>
                  <div>
                    <Label htmlFor="panel-fin" className="text-[11px] text-primary-foreground/70">Fin</Label>
                    <Input id="panel-fin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="mt-1 h-8 border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground" />
                  </div>
                </div>
              </div>

              <FueraHorarioAviso show={isOutsideOpening(inst.fecha, horaInicio, horaFin, horario, specialsMap)} />

              <div className="grid grid-cols-2 gap-2">
                <Select value={trainerId ?? NONE} onValueChange={(v) => setTrainerId(v === NONE ? null : v)}>
                  <SelectTrigger className="h-9 border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-[11px] font-semibold">{(trainers.find((t) => t.id === trainerId)?.nombre ?? trainerNombre ?? "?").charAt(0).toUpperCase()}</span>
                      <span className="truncate">{trainers.find((t) => t.id === trainerId)?.nombre ?? trainerNombre ?? "Sin entrenador"}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin entrenador</SelectItem>
                    {trainers.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={estado} onValueChange={(value) => setEstado(value as SesionEstado)}>
                  <SelectTrigger className="h-9 border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground">
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", ESTADO_BG[estadoVisual].split(" ")[0])} />
                      <span>{ESTADO_LABEL[estadoVisual]}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>{EDITABLE_STATES.map((item) => <SelectItem key={item} value={item}>{ESTADO_LABEL[item]}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="panel-prueba" checked={esPrueba} onCheckedChange={(value) => setEsPrueba(!!value)} className="border-primary-foreground/70 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                <Label htmlFor="panel-prueba" className="cursor-pointer text-sm text-primary-foreground">Sesión de prueba</Label>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <h3 className="text-sm font-semibold">Clientes</h3>
              <div className="grid grid-cols-3 border-b">
                {(["reservados", "cola", "cancelados"] as Pestana[]).map((key) => {
                  const label = key === "reservados" ? "Reservados" : key === "cola" ? "En cola" : "Cancelados";
                  return (
                    <Button key={key} type="button" variant="ghost" onClick={() => setTab(key)} className={cn("h-9 rounded-none border-b-2 px-2 text-xs", tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground")}>
                      <span className="truncate">{label}</span>
                      <span className={cn("ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px]", tab === key ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{listas[key].length}</span>
                    </Button>
                  );
                })}
              </div>

              <div className="max-h-52 space-y-2 overflow-y-auto">
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
                  <div key={item.id} className="flex h-9 items-center justify-between gap-2 rounded-md border px-3">
                    <span className="truncate text-sm">{item.nombre}</span>
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

              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="panel-notas">Notas</Label>
                <Textarea id="panel-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="min-h-16 resize-none" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox id="panel-confirmar" disabled={estado !== "reservada"} checked={estado === "reservada" && porConfirmar} onCheckedChange={(value) => setPorConfirmar(!!value)} />
                    <Label htmlFor="panel-confirmar" className="cursor-pointer">Por confirmar</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="panel-repeat" className="whitespace-nowrap">Repetir semanas</Label>
                    <Input id="panel-repeat" type="number" min={0} max={52} value={repeatWeeks || ""} placeholder="0" onChange={(e) => setRepeatWeeks(Number(e.target.value) || 0)} className="h-8" />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t px-5 py-3 sm:justify-between">
              {onDelete ? <Button variant="destructive" onClick={onDelete}>Eliminar</Button> : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button disabled={!onSave || saving} onClick={guardar}>Guardar</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}