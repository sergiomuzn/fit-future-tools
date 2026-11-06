import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientPicker } from "@/components/clients/client-picker";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { FueraHorarioAviso } from "@/components/fuera-horario-aviso";
import { useCenterConfig, isOutsideOpening } from "@/lib/center-schedule";
import { estadoColorOf, servicioColorOf } from "@/lib/colors";
import { useBehaviorConfig } from "@/lib/behavior-config";
import { ESTADO_BG, ESTADO_LABEL, type Client, type SesionEstado } from "@/lib/db";
import { notificarSesionesAsignadas } from "@/lib/notificaciones.functions";
import { hhmm } from "@/lib/service-slots";
import type { SlotInstance } from "@/lib/slot-propagation";
import { cn, formatDateShort } from "@/lib/utils";
import { activeTrainerOptions } from "@/lib/trainer-availability";
import { canMarkSessionPending } from "./online-booking";
import { enterToSave } from "@/lib/enter-to-save";

type Pestana = "reservados" | "cola" | "cancelados";

export interface PanelReserva {
  id: string;
  client_id: string | null;
  titulo: string | null;
  clients: { nombre: string } | null;
  /** La reserva la hizo el propio cliente desde su portal. */
  online?: boolean;
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
  /** Valores de "No contabilizar" marcados antes de guardar (id de sesión → valor). */
  noContabilizar: Record<string, boolean>;
}

interface Props {
  inst: SlotInstance | null;
  servicioNombre: string;
  color: string;
  trainerNombre: string | null;
  trainers?: { id: string; nombre: string; activo?: boolean }[];
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
  /** Sesión manual de varias plazas: ids del bloque y su recurrencia_id/ocupación actuales. */
  grupoManual?: { recurrenciaId: string | null; ocupacion: number; ids: string[] };
  /** Sesiones manuales canceladas que pertenecen a este bloque (enlace explícito). */
  canceladasIds?: string[];
  onClose: () => void;
  onSave?: (draft: HuecoPanelDraft) => Promise<boolean | void> | boolean | void;
  onDelete?: () => void;
  onCancelarReserva: (r: PanelReserva, onRemoving: () => void) => Promise<boolean | void>;
}

const NONE = "__none";
const EDITABLE_STATES: SesionEstado[] = ["reservada", "realizada", "cancelada"];
const ESTADO_PILL: Record<SesionEstado, string> = {
  reservada: "border-state-reservada bg-state-reservada text-primary-foreground",
  realizada: "border-state-realizada bg-state-realizada text-primary-foreground",
  cancelada: "border-state-cancelada bg-state-cancelada text-primary-foreground",
  prueba: "border-state-prueba bg-state-prueba text-primary-foreground",
  renovacion: "border-state-renovacion bg-state-renovacion text-primary-foreground",
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
  grupoManual,
  canceladasIds,
  onClose,
  onSave,
  onDelete,
  onCancelarReserva,
}: Props) {
  const qc = useQueryClient();
  const { horario, specialsMap, colores } = useCenterConfig();
  const behavior = useBehaviorConfig();
  const graceMs = Math.max(0, behavior.graciaAutoRealizadaMin) * 60 * 1000;
  const fechaInst = inst?.fecha;
  const finInst = inst ? hhmm(inst.hora_fin) : "";
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
  const [noContLocal, setNoContLocal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [servicioSlug, setServicioSlug] = useState("");
  const [perfilCliente, setPerfilCliente] = useState<Client | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [pendientes, setPendientes] = useState<PanelReserva[]>([]);
  const reservasAll = useMemo(() => [...reservas, ...pendientes.filter((p) => !reservas.some((r) => r.id === p.id))], [reservas, pendientes]);
  const reservasVisibles = reservasAll.filter((r) => !removedIds.includes(r.id));
  const puedeMarcarPorConfirmar = canMarkSessionPending(estado, reservasVisibles.some((r) => r.online === true));
  async function quitarCliente(reserva: PanelReserva) {
    const restore = () => setRemovedIds((old) => old.filter((id) => id !== reserva.id));
    try {
      const result = await onCancelarReserva(reserva, () => {
        setRemovedIds((old) => [...old, reserva.id]);
      });
      if (result === false) restore();
      // Sesión manual sin más clientes: la fila queda vacía y la siguiente alta la rellena.
      else if (slotInstanceId === null && !reservasVisibles.some((r) => r.id !== reserva.id)) grupoRef.current.fillTarget = reserva.id;
    } catch {
      restore();
    }
  }
  const { data: allClients = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*")).data as Client[] ?? [] });
  const abrirPerfil = (clientId: string | null | undefined) => {
    const c = allClients.find((x) => x.id === clientId);
    if (c) setPerfilCliente(c);
  };

  useEffect(() => {
    if (!inst) return;
    setTab("reservados");
    setHoraInicio(hhmm(inst.hora_inicio));
    setHoraFin(hhmm(inst.hora_fin));
    setTrainerId(inst.trainer_id);
    {
      const pasada = new Date(`${inst.fecha}T${hhmm(inst.hora_fin)}:00`).getTime() + graceMs < Date.now();
      const base = estadoInicial ?? (pasada ? "realizada" : "reservada");
      // Solo se ofrece reservada (futura) o realizada (pasado el margen).
      setEstado(base === "realizada" && !pasada ? "reservada" : base === "reservada" && pasada ? "realizada" : base);
    }
    setEsPrueba(esPruebaInicial);
    setPorConfirmar(porConfirmarInicial);
    setRepeatWeeks(0);
    setNotas(notasIniciales ?? "");
    setServicioSlug(inst.servicio_slug);
    setPickerValues([]);
    setNoContLocal({});
    setRemovedIds([]);
    setPendientes([]);
  }, [inst?.id, estadoInicial, esPruebaInicial, porConfirmarInicial, notasIniciales]);

  const { data: extra } = useQuery({
    queryKey: ["hueco-panel", inst?.id, inst?.fecha, inst?.hora_inicio, canceladasIds?.join(",")],
    enabled: !!inst,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!inst) return { cola: [], cancelados: [] };
      const [cola, canc] = await Promise.all([
        (supabase as any).from("reserva_cola").select("id,client_id,hora_inicio,servicio_slug,estado,created_at").eq("fecha", inst.fecha).in("estado", ["en_cola", "ofrecida"]).order("created_at"),
        supabase.from("sessions").select("id,client_id,titulo,hora_inicio,servicio_slug,slot_instance_id,no_contabilizar,clients(nombre)").eq("fecha", inst.fecha).eq("estado", "cancelada"),
      ]);
      const colaRows = ((cola.data ?? []) as { id: string; client_id: string; hora_inicio: string; servicio_slug: string | null }[])
        .filter((c) => hhmm(c.hora_inicio) === hhmm(inst.hora_inicio) && (!c.servicio_slug || c.servicio_slug === inst.servicio_slug));
      const nombres = new Map<string, string>();
      if (colaRows.length) {
        const { data } = await supabase.from("clients").select("id,nombre").in("id", colaRows.map((c) => c.client_id));
        for (const c of data ?? []) nombres.set(c.id, c.nombre);
      }
      const cancelados = ((canc.data ?? []) as any[]).filter((s) =>
        canceladasIds !== undefined && slotInstanceId === null
          ? canceladasIds.includes(s.id)
          : s.slot_instance_id ? s.slot_instance_id === inst.id : hhmm(s.hora_inicio) === hhmm(inst.hora_inicio) && s.servicio_slug === inst.servicio_slug,
      );
      return {
        cola: colaRows.map((c) => ({ id: c.id, clientId: c.client_id, nombre: nombres.get(c.client_id) ?? "Cliente" })),
        cancelados: cancelados.map((s) => ({ id: s.id as string, clientId: s.client_id as string | null, nombre: (s.clients?.nombre ?? s.titulo ?? "Cliente") as string, noContabilizar: !!s.no_contabilizar })),
      };
    },
  });

  const capacidad = Math.max(1, servicios.find((service) => service.slug === servicioSlug)?.capacidad_default ?? inst?.capacidad ?? 1);
  const selectedNewCount = isNew ? pickerValues.filter(Boolean).length : 0;
  const libres = Math.max(0, capacidad - reservasVisibles.length - selectedNewCount);
  useEffect(() => {
    // Conserva las selecciones en curso y recorta primero los buscadores vacíos.
    setPickerValues((old) => {
      const n = Math.max(0, capacidad - reservasVisibles.length);
      const elegidos = old.filter(Boolean).slice(0, n);
      return [...elegidos, ...Array.from({ length: n - elegidos.length }, () => null)];
    });
  }, [capacidad, reservasVisibles.length, inst?.id]);

  // Estado del bloque manual mientras el menú está abierto: la fila vacía solo
  // se rellena una vez y todas las altas comparten recurrencia_id, aunque las
  // props (instantánea al abrir) aún no se hayan refrescado.
  const grupoRef = useRef<{ instId: string | null; fillTarget: string | null; rec: string | null; grouped: boolean; ids: Set<string> }>({ instId: null, fillTarget: null, rec: null, grouped: false, ids: new Set() });
  if (grupoRef.current.instId !== (inst?.id ?? null)) {
    grupoRef.current = { instId: inst?.id ?? null, fillTarget: fillSessionId ?? null, rec: grupoManual?.recurrenciaId ?? null, grouped: grupoManual?.ocupacion === 2 && !!grupoManual?.recurrenciaId, ids: new Set(grupoManual?.ids ?? []) };
  }
  for (const id of grupoManual?.ids ?? []) grupoRef.current.ids.add(id);
  // Las altas se encadenan: dos clientes añadidos seguidos nunca compiten.
  const colaAltas = useRef<Promise<unknown>>(Promise.resolve());

  const anadir = useMutation({
    mutationFn: ({ clientId }: { clientId: string }) => {
      const run = async () => {
      if (!inst || isNew) return;
      const g = grupoRef.current;
      const valores = {
        fecha: inst.fecha,
        hora_inicio: `${horaInicio}:00`,
        hora_fin: `${horaFin}:00`,
        servicio_slug: inst.servicio_slug,
        trainer_id: trainerId,
        client_id: clientId,
        estado: esPrueba ? "prueba" : estado === "cancelada" ? "reservada" : estado,
        tipo: esPrueba ? "prueba" : null,
        por_confirmar: estado === "reservada" && porConfirmar,
      };
      const rellenar = g.fillTarget;
      // Sesión manual de varias plazas: todas las filas comparten recurrencia_id
      // y ocupacion=2 para que la Agenda las muestre como un único bloque.
      let grupo: { recurrencia_id: string; ocupacion: number } | null = null;
      if (slotInstanceId === null && grupoManual && capacidad > 1) {
        if (!g.grouped || !g.rec) {
          g.rec = crypto.randomUUID();
          if (g.ids.size) {
            const { error: e2 } = await supabase.from("sessions").update({ recurrencia_id: g.rec, ocupacion: 2 } as any).in("id", [...g.ids]);
            if (e2) throw e2;
          }
          g.grouped = true;
        }
        grupo = { recurrencia_id: g.rec, ocupacion: 2 };
      }
      const { data, error } = rellenar
        ? await supabase.from("sessions").update({ ...valores, ...(grupo ?? {}) } as any).eq("id", rellenar).select("id").single()
        : await supabase.from("sessions").insert({
            ...valores,
            booking_tipo: "centro",
            slot_instance_id: slotInstanceId !== undefined ? slotInstanceId : inst.id,
            reemplaza_session_id: slotInstanceId === null && canceladasIds?.length ? canceladasIds[0] : null,
            ...(grupo ?? {}),
          } as any).select("id").single();
      if (error) throw error;
      // Muestra la reserva al instante mientras llega el refresco, para que el
      // cliente no desaparezca del menú entre el guardado y la recarga.
      const cli = allClients.find((c) => c.id === clientId);
      setPendientes((old) => [...old.filter((p) => p.id !== data.id), { id: data.id, client_id: clientId, titulo: null, clients: { nombre: cli?.nombre ?? "Cliente" } } as unknown as PanelReserva]);
      if (rellenar) g.fillTarget = null;
      g.ids.add(data.id);
      // Quita el buscador por cliente (no por posición): otra alta en curso no
      // debe borrar la selección de otra fila.
      setPickerValues((old) => {
        const i = old.indexOf(clientId);
        return i < 0 ? old : old.filter((_, index) => index !== i);
      });
      void notificarSesionesAsignadas({ data: { sesiones: [{ clientId, fecha: inst.fecha, hora: `${horaInicio}:00` }] } }).catch(() => {});
      return data;
      };
      const p = colaAltas.current.then(run, run);
      colaAltas.current = p.catch(() => {});
      return p;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions-range"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Reserva añadida");
    },
    onError: (e: Error, vars) => {
      setPickerValues((old) => old.map((v) => (v === vars.clientId ? null : v)));
      toast.error(e.message);
    },
  });

  // Cancelación contabilizada por defecto; "No contabilizar" la excluye del
  // bono y de las realizadas (lo resuelven los triggers de sesiones).
  const toggleNoContabilizar = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("sessions").update({ no_contabilizar: value } as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, value }) => {
      qc.setQueryData(["hueco-panel", inst?.id, inst?.fecha, inst?.hora_inicio, canceladasIds?.join(",")], (old: any) => old ? {
        ...old,
        cancelados: old.cancelados.map((c: any) => c.id === id ? { ...c, noContabilizar: value } : c),
      } : old);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["hueco-panel"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["client-bonos"] });
      qc.invalidateQueries({ queryKey: ["bonos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Al cambiar el estado a "cancelada", los clientes reservados pasan al
  // instante a la pestaña Cancelados (y vuelven si se revierte el estado).
  const cancelando = estado === "cancelada" && estadoInicial !== "cancelada";
  const listas: Record<Pestana, { id: string; clientId?: string | null; nombre: string; reserva?: PanelReserva; noContabilizar?: boolean }[]> = useMemo(() => {
    const filas = reservasAll.filter((r) => !removedIds.includes(r.id)).map((r) => ({ id: r.id, clientId: r.client_id, nombre: r.clients?.nombre ?? r.titulo ?? "Cliente", reserva: r }));
    return {
      reservados: cancelando ? [] : filas,
      cola: extra?.cola ?? [],
      cancelados: [...(extra?.cancelados ?? []), ...(cancelando ? filas : [])],
    };
  }, [reservasAll, extra, cancelando, removedIds]);

  const sesionPasada = !!fechaInst && !!(horaFin || finInst) && new Date(`${fechaInst}T${horaFin || finInst}:00`).getTime() + graceMs < Date.now();
  const estadosDisponibles = EDITABLE_STATES.filter((s) => s === "cancelada" || s === (sesionPasada ? "realizada" : "reservada") || s === estado);

  async function guardar() {
    if (!inst || !onSave || saving || anadir.isPending) return;
    if (!horaInicio || !horaFin || horaFin <= horaInicio) {
      toast.error("Revisa las horas de la sesión");
      return;
    }
    setSaving(true);
    try {
      const result = await onSave({ servicioSlug, horaInicio, horaFin, trainerId, estado, esPrueba, porConfirmar, repeatWeeks, notas, clientIds: pickerValues.filter((id): id is string => !!id), noContabilizar: noContLocal });
      if (result !== false) {
        // Las listas de cola/cancelados quedan en caché por hueco: se refrescan
        // para que, al reabrir, los clientes recién cancelados aparezcan ya.
        await qc.invalidateQueries({ queryKey: ["hueco-panel"], refetchType: "all" });
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  // El punto de la cabecera siempre sigue el color del servicio elegido,
  // sea cual sea el estado de la sesión.
  const dotColor = servicioColorOf(colores, servicioSlug || null) ?? color;
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
    <>
    <Dialog open={!!inst} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onKeyDown={enterToSave(guardar)} className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {inst && (
          <>
            <DialogDescription className="sr-only">Detalle y edición de la sesión</DialogDescription>
            <div className="relative shrink-0 bg-primary px-6 pb-5 pt-5 text-primary-foreground">
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3 pr-7">
                <DialogTitle className="flex min-w-0 flex-1 items-center gap-2.5 text-lg">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                  {servicios.length > 0 ? (
                    <Select value={servicioSlug} onValueChange={setServicioSlug}>
                      <SelectTrigger className="h-8 w-auto min-w-0 max-w-72 justify-start gap-1.5 border-0 bg-transparent px-0 text-lg font-semibold text-primary-foreground shadow-none focus:ring-0 [&>span]:line-clamp-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{servicios.map((service) => <SelectItem key={service.slug} value={service.slug}>{service.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span className="truncate">{servicioNombre}</span>}
                </DialogTitle>
                <span className="shrink-0 text-sm font-normal text-primary-foreground/65">
                  ({reservasVisibles.length + selectedNewCount}/{libres})
                </span>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span className="whitespace-nowrap text-primary-foreground/85">{fechaDia.charAt(0).toUpperCase() + fechaDia.slice(1)}. {inst.fecha.split("-").reverse().join("/")}</span>
                  <span className="mx-0.5 text-primary-foreground/40">·</span>
                  <div className="flex items-center gap-1">
                    <Input
                      aria-label="Hora de inicio"
                      type="time"
                      value={horaInicio}
                      onChange={(e) => setHoraInicio(e.target.value)}
                      className="h-7 w-[3.6rem] border-0 bg-transparent px-1 [&::-webkit-calendar-picker-indicator]:hidden text-center text-sm font-semibold text-primary-foreground shadow-none focus-visible:ring-1 focus-visible:ring-primary-foreground/40"
                    />
                    <span className="text-primary-foreground/45">—</span>
                    <Input
                      aria-label="Hora de fin"
                      type="time"
                      value={horaFin}
                      onChange={(e) => setHoraFin(e.target.value)}
                      className="h-7 w-[3.6rem] border-0 bg-transparent px-1 [&::-webkit-calendar-picker-indicator]:hidden text-center text-sm font-semibold text-primary-foreground shadow-none focus-visible:ring-1 focus-visible:ring-primary-foreground/40"
                    />
                  </div>
                </div>
                <Select value={estado} onValueChange={(value) => { const next = value as SesionEstado; setEstado(next); if (next === "cancelada" && reservas.length > 0) setTab("cancelados"); }}>
                  <SelectTrigger className={cn("h-8 w-auto min-w-28 rounded-full px-3 text-xs font-semibold shadow-none focus:ring-0", ESTADO_PILL[estadoVisual])}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>{estadosDisponibles.map((item) => <SelectItem key={item} value={item}>{ESTADO_LABEL[item]}</SelectItem>)}</SelectContent>
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
                    {activeTrainerOptions(trainers).map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1.5">
                <Checkbox id="panel-prueba" checked={esPrueba} onCheckedChange={(value) => setEsPrueba(!!value)} className="border-primary-foreground/70 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                <Label htmlFor="panel-prueba" className="cursor-pointer text-[11px] font-semibold uppercase text-primary-foreground/75">Sesión de prueba</Label>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <h3 className="text-[11px] font-bold uppercase text-muted-foreground">Clientes</h3>
              <div className="grid grid-cols-3 border-b">
                {(["reservados", "cola", "cancelados"] as Pestana[]).map((key) => {
                  const label = key === "reservados" ? "Reservados" : key === "cola" ? "En cola" : "Cancelados";
                  const count = listas[key].length;
                  // El contador se rellena de color solo cuando hay clientes: en cola
                  // (ámbar) y cancelados (el color configurado para cancelaciones).
                  // Reservados mantiene siempre su apariencia neutra.
                  const relleno =
                    count > 0
                      ? key === "cola"
                        ? "#F5A524"
                        : key === "cancelados"
                          ? estadoColorOf(colores, "cancelada")
                          : null
                      : null;
                  return (
                    <Button key={key} type="button" variant="ghost" onClick={() => setTab(key)} className={cn("h-9 rounded-none border-b-2 px-1 text-xs sm:px-3", tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
                      <span className="truncate">{label}</span>
                      <span style={relleno ? { backgroundColor: relleno } : undefined} className={cn("ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px]", relleno ? "text-primary-foreground" : tab === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{count}</span>
                    </Button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {listas[tab].map((item) => item.reserva && item.reserva.client_id && tab !== "cancelados" ? (
                  <div key={item.id} className="min-w-0">
                    <ClientPicker
                      value={item.reserva.client_id}
                      onChange={(clientId) => {
                        if (!clientId) void quitarCliente(item.reserva as PanelReserva);
                      }}
                      onNameClick={(c) => setPerfilCliente(c)}
                    />
                  </div>
                ) : (
                  <div key={item.id} className="flex h-10 items-center justify-between gap-3 rounded-md border bg-muted/35 px-3">
                    <button type="button" onClick={() => abrirPerfil(item.clientId)} className="truncate text-left text-sm font-medium hover:underline">{item.nombre}</button>
                    {tab === "cancelados" && (
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={cancelando && item.reserva ? !!noContLocal[item.id] : !!item.noContabilizar}
                          onCheckedChange={(value) => {
                            // Si la cancelación aún no se ha guardado, la marca se
                            // guarda localmente y se aplica al pulsar Guardar.
                            if (cancelando && item.reserva) setNoContLocal((old) => ({ ...old, [item.id]: !!value }));
                            else toggleNoContabilizar.mutate({ id: item.id, value: !!value });
                          }}
                        />
                        No contabilizar
                      </label>
                    )}
                    {item.reserva && tab !== "cancelados" && (
                      <button type="button" aria-label={`Quitar a ${item.nombre}`} onClick={() => void quitarCliente(item.reserva as PanelReserva)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {tab === "reservados" && pickerValues.map((value, row) => (
                  <div key={`free-${row}`} className="min-w-0">
                    <ClientPicker
                      value={value}
                      autoFocus={row === 0}
                      onChange={(clientId) => {
                        setPickerValues((old) => old.map((item, index) => index === row ? clientId : item));
                        if (clientId && !isNew) anadir.mutate({ clientId });
                      }}
                      onNameClick={(c) => setPerfilCliente(c)}
                    />
                  </div>
                ))}
              </div>

              {tab === "reservados" && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="panel-repeat" className="text-[10px] font-bold uppercase text-muted-foreground">Repetir semanas</Label>
                      <Input id="panel-repeat" type="number" min={0} max={52} value={repeatWeeks || ""} placeholder="0" onChange={(e) => setRepeatWeeks(Number(e.target.value) || 0)} className="h-9 w-24" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="panel-notas" className="text-[10px] font-bold uppercase text-muted-foreground">Notas</Label>
                      <Input id="panel-notas" value={notas} onChange={(e) => setNotas(e.target.value)} className="h-9 rounded-lg" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {puedeMarcarPorConfirmar ? (
                      <>
                        <Checkbox id="panel-confirmar" checked={estado === "reservada" && porConfirmar} onCheckedChange={(value) => { if (puedeMarcarPorConfirmar) setPorConfirmar(!!value); }} />
                        <Label htmlFor="panel-confirmar" className="cursor-pointer text-sm">Por confirmar</Label>
                      </>
                    ) : (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex cursor-not-allowed items-center gap-2" aria-disabled="true">
                              <Checkbox id="panel-confirmar" disabled checked={estado === "reservada" && porConfirmar} tabIndex={-1} />
                              <span className="text-sm text-muted-foreground">Por confirmar</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="whitespace-nowrap">No se puede poner como pendiente una sesión ya confirmada</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-4 sm:justify-between">
              {onDelete ? <Button variant="ghost" className="text-xs font-bold uppercase text-destructive hover:text-destructive" onClick={onDelete}>Eliminar sesión</Button> : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" className="text-muted-foreground" onClick={onClose}>Cerrar</Button>
                <Button disabled={!onSave || saving || anadir.isPending} onClick={guardar}>Guardar cambios</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    <ClientDetailsDialog client={perfilCliente} defaultTab="calendario" onOpenChange={(o) => { if (!o) setPerfilCliente(null); }} />
    </>
  );
}