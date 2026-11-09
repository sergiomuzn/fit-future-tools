import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { MoreHorizontal, Ban, UserMinus } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { clientCancellationFields } from "@/lib/session-state";
import { commitAgendaRows } from "@/lib/agenda-session-cache";
import { automaticSessionState } from "@/lib/session-state";
import { refreshAgenda } from "@/lib/agenda-session-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase, type Trainer, type Session, type SesionEstado, ESTADO_LABEL, type Client } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { ClientPicker } from "@/components/clients/client-picker";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { formatDateISO } from "./types";
import { toast } from "sonner";
import { useBehaviorConfig } from "@/lib/behavior-config";
import { useCenterConfig, isOutsideOpening } from "@/lib/center-schedule";
import { FueraHorarioAviso } from "@/components/fuera-horario-aviso";
import { useServicios } from "@/lib/servicios";
import {
  notificarReservasCanceladas,
  notificarSesionesAsignadas,
  resolverReservaPendiente,
  marcarReservaPorConfirmar,
} from "@/lib/notificaciones.functions";
import { useConfirm } from "@/components/confirm-dialog";
import { formatDateShort } from "@/lib/utils";
import { activeTrainerOptions } from "@/lib/trainer-availability";
import { canMarkSessionPending, isSelfBooking } from "./online-booking";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  session: Partial<Session> | null;
  trainers: Trainer[];
}

export function SessionDialog({ open, onClose, session, trainers }: Props) {
  const qc = useQueryClient();
  const isNew = !session?.id;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [clientId, setClientId] = useState<string | null>(null);
  const [trainerId, setTrainerId] = useState<string | null>(null);

  const [esPrueba, setEsPrueba] = useState(false);
  const [incidencia, setIncidencia] = useState("");
  const [grupo, setGrupo] = useState(false);
  const [servicioSlug, setServicioSlug] = useState<string>("");
  const [groupClientIds, setGroupClientIds] = useState<(string | null)[]>([]);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [noContabilizar, setNoContabilizar] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(false);
  const [cancelledIds, setCancelledIds] = useState<string[]>([]);
  const [cancelledOverrides, setCancelledOverrides] = useState<Session[]>([]);
  const [deleteAsk, setDeleteAsk] = useState(false);
  const [perfilCliente, setPerfilCliente] = useState<Client | null>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);

  function ajustarAlturaNotas() {
    const el = notasRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  const recurrenciaId = (session as any)?.recurrencia_id as string | null | undefined;

  // Hermanas futuras en la misma serie (fecha > actual). Solo pedimos el
  // "scope" al editar cuando existen series futuras Y los cambios podrían
  // afectarlas realmente.
  const { data: futureSiblings = [] } = useQuery({
    queryKey: ["series-future-rows", recurrenciaId, session?.fecha],
    queryFn: async () => {
      if (!recurrenciaId || !session?.fecha) return [] as Session[];
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("recurrencia_id", recurrenciaId)
        .gt("fecha", session.fecha);
      return (data ?? []) as Session[];
    },
    enabled: open && !isNew && !!recurrenciaId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const isSeries = !isNew && !!recurrenciaId && futureSiblings.length > 0;

  // Fetch group members (same recurrencia_id + fecha + hora_inicio) when editing a group.
  const { data: groupMembersData } = useQuery({
    queryKey: ["group-members", recurrenciaId, session?.fecha, session?.hora_inicio],
    queryFn: async () => {
      if (!recurrenciaId || !session?.fecha || !session?.hora_inicio) return [] as Session[];
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("recurrencia_id", recurrenciaId)
        .eq("fecha", session.fecha)
        .eq("hora_inicio", session.hora_inicio);
      return (data ?? []) as Session[];
    },
    enabled: open && !isNew && !!recurrenciaId && (session?.ocupacion === 2),
    // Siempre datos frescos: si se guardan miembros antiguos en caché, al
    // cambiar un cliente por otro la sesión no se actualizaría correctamente.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  // Configuración de funcionamiento del centro (para valores por defecto al crear).
  const behaviorCfg = useBehaviorConfig();
  const estado = automaticSessionState(session?.fecha ?? "", `${horaFin}:00`, behaviorCfg.graciaAutoRealizadaMin, porConfirmar);
  const cfgBehaviorRef = useRef(behaviorCfg);
  useEffect(() => {
    cfgBehaviorRef.current = behaviorCfg;
  }, [behaviorCfg]);

  // Filas de esta sesión (o de todo el bloque de grupo) que son reservas del
  // portal del cliente: sirven para avisarle al confirmar, denegar o volver a
  // dejar la reserva pendiente.
  const filasReserva = ((groupMembersData ?? []).length
    ? (groupMembersData as any[])
    : session?.id
      ? [session as any]
      : []) as Array<{ id: string; client_id?: string | null; por_confirmar?: boolean | null; booked_by_user_id?: string | null; booking_tipo?: string | null; estado?: string }>;
  // Solo las reservas online pendientes: si el centro marcó "por confirmar"
  // a mano, eliminar no muestra el cuadro de denegación.
  const pendientesIds = filasReserva
    .filter((r) => r?.por_confirmar && isSelfBooking(r as any))
    .map((r) => r.id);
  const reservasPortalIds = filasReserva
    .filter((r) => r?.booked_by_user_id)
    .map((r) => r.id);

  const { colores, horario, specialsMap } = useCenterConfig();
  const { data: servicios = [] } = useServicios();
  // Servicio de grupos (grupos reducidos) y servicio individual por defecto.
  const servicioGrupo = servicios.find((s) => /grupo/i.test(s.slug));
  const servicioIndividual =
    servicios.find((s) => s.slug === "personal") ?? servicios.find((s) => !/grupo/i.test(s.slug));
  const servicioActual = servicios.find((s) => s.slug === servicioSlug);
  // Plazas del servicio (definidas en Servicios). 1 plaza = sesión individual.
  const plazas = Math.max(1, servicioActual?.capacidad_default ?? 1);

  function cambiarServicio(slug: string) {
    setServicioSlug(slug);
    const cap = Math.max(1, servicios.find((s) => s.slug === slug)?.capacidad_default ?? 1);
    setGrupo(cap > 1);
  }

  // Si los servicios cargan después de abrir el diálogo, fija el valor por defecto.
  useEffect(() => {
    if (!open || servicioSlug || servicios.length === 0) return;
    setServicioSlug(grupo ? (servicioGrupo?.slug ?? "") : (servicioIndividual?.slug ?? ""));
  }, [open, servicioSlug, servicios.length, grupo, servicioGrupo?.slug, servicioIndividual?.slug]);
  // Mantener `grupo` sincronizado con las plazas del servicio elegido.
  useEffect(() => {
    if (!open || !servicioActual) return;
    setGrupo(plazas > 1);
  }, [open, servicioActual?.slug, plazas]);

  // Sin cliente seleccionado, el nombre de la sesión es el texto libre escrito
  // en el buscador; si se deja vacío se usa el nombre del servicio.

  useEffect(() => {
    if (!open) return;
    setCancelledIds([]);
    setCancelledOverrides([]);
    setClientId(session?.estado === "cancelada" ? null : session?.client_id ?? null);
    setTrainerId(session?.trainer_id ?? null);
    setEsPrueba(session?.estado === "prueba" || (session as any)?.tipo === "prueba");
    setIncidencia(session?.incidencia ?? "");
    setGrupo((session?.ocupacion ?? 1) === 2);
    setServicioSlug(
      ((session as any)?.servicio_slug as string | null | undefined) ??
        ((session?.ocupacion ?? 1) === 2 ? (servicioGrupo?.slug ?? "") : (servicioIndividual?.slug ?? "")),
    );
    setRepeatWeeks(0);
    setHoraInicio((session?.hora_inicio ?? "").slice(0,5));
    setHoraFin((session?.hora_fin ?? "").slice(0,5));
    setNombreLibre(!((session as any)?.client_id) ? ((session as any)?.titulo ?? "") : "");

    const isNewSession = !session?.id;
    const cfgBehavior = cfgBehaviorRef.current;
    setNoContabilizar(
      isNewSession
        ? cfgBehavior.cancelacionDefaultNoContabilizar
        : !!(session as any)?.no_contabilizar,
    );
    setPorConfirmar(!!(session as any)?.por_confirmar);
    // Al crear una sesión nueva los clientes siempre empiezan vacíos,
    // sin arrastrar los de la sesión editada anteriormente.
    if (isNewSession) setGroupClientIds(session?.client_id ? [session.client_id] : []);
  }, [open, session]);

  useEffect(() => {
    ajustarAlturaNotas();
  }, [incidencia]);

  // Las plazas de las sesiones con varios clientes salen del servicio
  // (Servicios → capacidad por sesión). Ya no existen grupos con nombre.
  useEffect(() => {
    if (!open || !grupo) return;
    setGroupClientIds((prev) => {
      if (prev.length === plazas) return prev;
      if (prev.length > plazas) return prev.slice(0, plazas);
      const next = [...prev];
      while (next.length < plazas) next.push(null);
      return next;
    });
  }, [open, grupo, plazas]);

  // Cuando llegan los miembros de la sesión desde BD, rellenar los pickers.
  useEffect(() => {
    if (!open) return;
    if (session?.ocupacion !== 2) return;
    if (isNew) {
      setGroupClientIds(session?.client_id ? [session.client_id] : []);
      return;
    }
    if (!groupMembersData) return;
    const ids = groupMembersData
      .filter((m) => m.estado !== "cancelada" && !cancelledIds.includes(m.id))
      .map((m) => m.client_id)
      .filter((id): id is string => !!id);
    const padded: (string | null)[] = [...ids];
    while (padded.length < plazas) padded.push(null);
    setGroupClientIds(padded.slice(0, Math.max(plazas, ids.length)));
  }, [open, isNew, session?.ocupacion, session?.client_id, groupMembersData, plazas, cancelledIds]);


  /**
   * ¿Aplicar los cambios "a las siguientes" alteraría algo en las sesiones
   * futuras de la serie? Si ya son idénticas a lo que se propagaría, no tiene
   * sentido preguntar por el alcance. El entrenador se excluye porque las
   * repeticiones nacen sin entrenador y se pintan una a una.
   */
  function futureWouldChange(): boolean {
    if (!futureSiblings.length) return false;
    const hi = `${horaInicio}:00`;
    const hf = `${horaFin}:00`;
    const nombreLibreTrim = nombreLibre.trim();
    const sinClientes = grupo ? groupClientIds.every((id) => !id) : !clientId;
    // Sin cliente seleccionado, el texto escrito en el buscador actúa como
    // nombre libre; si está vacío se usa el nombre del servicio.
    const tituloDeseado = sinClientes ? (nombreLibreTrim || null) : null;

    const incidenciaDeseada = incidencia || null;

    const byDate = new Map<string, Session[]>();
    for (const r of futureSiblings) {
      const arr = byDate.get(r.fecha!);
      if (arr) arr.push(r);
      else byDate.set(r.fecha!, [r]);
    }

    const sharedDiffers = (r: Session) =>
      (r.hora_inicio ?? null) !== hi ||
      (r.hora_fin ?? null) !== hf ||
      ((r.titulo as string | null) ?? null) !== tituloDeseado ||
      ((r.incidencia as string | null) ?? null) !== incidenciaDeseada ||
      (r.ocupacion ?? 1) !== (grupo ? 2 : 1);

    if (grupo) {
      const desired = new Set(groupClientIds.filter((id): id is string => !!id));
      for (const [, rows] of byDate) {
        if (rows.some(sharedDiffers)) return true;
        const existing = new Set(
          rows.map((r) => r.client_id).filter((id): id is string => !!id),
        );
        if (existing.size !== desired.size) return true;
        for (const id of desired) if (!existing.has(id)) return true;
      }
      return false;
    }

    return futureSiblings.some(
      (r) => sharedDiffers(r) || (r.client_id ?? null) !== (clientId ?? null),
    );
  }

  async function cancelarCliente(row: Session) {
    if (!(await confirm({ title: "¿Cancelar la reserva de este cliente?", description: "Solo se cancelará la reserva de este cliente.", confirmText: "Cancelar reserva" }))) return;
    if (row.por_confirmar) {
      const { error } = await supabase.from("sessions").update({ por_confirmar: false }).eq("id", row.id);
      if (error) return toast.error(error.message);
    }
    const { data, error } = await supabase.from("sessions").update(clientCancellationFields(row.por_confirmar, behaviorCfg.cancelacionDefaultNoContabilizar)).eq("id", row.id).select("*").single();
    if (error) return toast.error(error.message);
    commitAgendaRows(qc, [data]);
    setCancelledIds((old) => [...old, row.id]);
    setCancelledOverrides((old) => [...old.filter((r) => r.id !== data.id), data]);
    if (row.client_id === clientId) setClientId(null);
    void notificarReservasCanceladas({ data: { sessionIds: [row.id] } }).then((r) => {
      if (r?.claves?.length) return import("@/lib/notificaciones.functions").then(({ ofrecerPlazasLiberadas }) => ofrecerPlazasLiberadas({ data: { claves: r.claves } }));
    }).catch(() => {});
    refreshAgenda(qc);
    for (const key of ["group-members", "sessions-past", "client_bonos", "client-bonos", "bonos"]) void qc.invalidateQueries({ queryKey: [key] });
  }
  function clientMenu(row: Session | undefined, remove: () => void) {
    if (!row || row.estado === "cancelada" || cancelledIds.includes(row.id)) return null;
    return <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Opciones del cliente" title="Opciones del cliente"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={remove}><UserMinus />Quitar cliente</DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => void cancelarCliente(row)}><Ban />Cancelar reserva</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  }
  const { data: clientsForCancelled = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*")).data ?? [] });
  const cancelledRows = (groupMembersData?.length ? groupMembersData : session?.id ? [session as Session] : []).map((row) => cancelledOverrides.find((r) => r.id === row.id) ?? row).filter((row) => row.estado === "cancelada" || cancelledIds.includes(row.id));

  function requestSave() {
    if (isSeries && futureWouldChange()) {
      setScopeAsk(true);
    } else {
      void doSave("one");
    }
  }

  async function doSave(scope: "one" | "future") {
    if (!session) return;
    if (!horaInicio || !horaFin || horaFin <= horaInicio) {
      toast.error("Revisa las horas de la sesión");
      return;
    }
    const ocupacion = grupo ? 2 : 1;
    const nombreLibreTrim = nombreLibre.trim();
    // Las plazas las define el servicio (Servicios → capacidad por sesión).
    if (grupo) {
      const pickedMembers = groupClientIds.filter((id): id is string => !!id);
      if (pickedMembers.length > plazas) {
        toast.error(`Plazas máximas del servicio: ${plazas}`);
        return;
      }
    }

    // Cerrar el diálogo al instante: el guardado continúa en segundo plano.
    setScopeAsk(false);
    onClose();

    // Cambios en la casilla "Por confirmar" de una reserva hecha desde el
    // portal del cliente:
    //  - se desmarca  → la reserva queda confirmada y se avisa al cliente.
    //  - se marca     → la reserva vuelve a pendiente en la vista del cliente.
    if (!isNew && estado === "reservada") {
      if (pendientesIds.length && !porConfirmar) {
        quitarAvisosPendientes(pendientesIds);
        await Promise.all(
          pendientesIds.map((id) =>
            resolverReservaPendiente({ data: { sessionId: id, accion: "confirmar" } }).catch(() => {}),
          ),
        );
        qc.invalidateQueries({ queryKey: ["notificaciones-pendientes"] });
        qc.invalidateQueries({ queryKey: ["notificaciones"] });
      } else if (!pendientesIds.length && porConfirmar && reservasPortalIds.length) {
        await Promise.all(
          reservasPortalIds.map((id) =>
            marcarReservaPorConfirmar({ data: { sessionId: id } }).catch(() => {}),
          ),
        );
      }
    }



    const base = {
      client_id: grupo ? null : clientId,
      trainer_id: trainerId,
      fecha: session.fecha!,
      hora_inicio: `${horaInicio}:00`,
      hora_fin: `${horaFin}:00`,
      // La casilla "Sesión de prueba" marca el tipo; el estado sigue siendo
      // automático por fecha y hora; el tipo conserva el color de prueba.
      estado: estado as SesionEstado,
      tipo: esPrueba ? "prueba" : null,
      ocupacion,
      incidencia: incidencia || null,
      // Nombre de la sesión: el texto libre del buscador (cuando no hay
      // cliente seleccionado) o, si está vacío, el nombre del servicio.
      titulo: (grupo ? groupClientIds.every((id) => !id) : !clientId)
        ? (nombreLibreTrim || null)
        : null,
      no_contabilizar: false,
      por_confirmar: estado === "reservada" ? porConfirmar : false,
      group_id: null,

      // Servicio al que pertenece la sesión: determina de qué bono se descuenta.
      servicio_slug:
        servicioSlug ||
        (grupo ? (servicioGrupo?.slug ?? null) : (servicioIndividual?.slug ?? null)),
    };
    // Auto-realizada si la sesión reservada es pasada (con 15 min de margen tras la hora de fin).
    // - "Prueba" se respeta siempre, aunque sea pasada.
    // - "Por confirmar" nunca pasa automáticamente a realizada.
    // - Si el estado guardado era "realizada" pero la nueva hora está en el futuro,
    //   se revierte a "reservada".
    const estadoForDate = (fecha: string): SesionEstado => automaticSessionState(fecha, base.hora_fin, behaviorCfg.graciaAutoRealizadaMin, base.por_confirmar);

    if (isNew) {
      // Para grupo, insertar una sesión por cada hueco con cliente seleccionado.
      const memberIds = grupo
        ? groupClientIds.filter((id): id is string => !!id)
        : [clientId];
      const dates = [session.fecha!];
      for (let w = 1; w <= repeatWeeks; w++) {
        const d = new Date(session.fecha!);
        d.setDate(d.getDate() + 7 * w);
        dates.push(formatDateISO(d));
      }
      // Recurrencia: compartida entre todas las fechas de la serie (para poder
      // cancelar la serie futura más adelante). Para grupos también agrupa a
      // los miembros del mismo día.
      const seriesId = (repeatWeeks > 0 || grupo)
        ? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
        : null;
      const inserts = dates.flatMap((fecha) => {
        const ids = grupo && memberIds.length === 0 ? [null] : memberIds;
        const isRepeat = fecha !== session.fecha;
        return ids.map((cid) => ({
          ...base,
          fecha,
          estado: estadoForDate(fecha),
          client_id: cid,
          recurrencia_id: seriesId,
          // Las repeticiones futuras nacen sin entrenador asignado.
          trainer_id: isRepeat ? null : base.trainer_id,
        }));
      });
      const { error } = await supabase.from("sessions").insert(inserts);
      if (error) toast.error(error.message); else toast.success(`Sesión creada${repeatWeeks > 0 ? ` (+${repeatWeeks} repeticiones)` : ""}`);
      // Aviso al buzón de los clientes con acceso al portal.
      if (!error) {
        const avisos = inserts
          .filter((i) => !!i.client_id)
          .map((i) => ({
            clientId: i.client_id as string,
            fecha: i.fecha as string,
            hora: String(i.hora_inicio),
          }));
        if (avisos.length) {
          // En segundo plano: el aviso no debe retrasar la aparición de la sesión.
          void notificarSesionesAsignadas({ data: { sesiones: avisos.slice(0, 100) } }).catch(() => {
            /* la sesión es válida aunque falle el aviso */
          });
        }
      }
      // No se crea ningún bono: el tipo "Prueba" se deriva de la propia sesión
      // hasta que se registre un bono real (Bonos o Facturación).
      if (!error && !grupo && clientId && esPrueba) {
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
    } else {
      // Campos compartidos entre miembros de un grupo (mismo día).
      // Importante: se conserva el grupo y el servicio de la sesión para que al
      // quitar o añadir miembros no cambien el color ni las plazas del bloque.
      const sharedGroupFields = {
        trainer_id: base.trainer_id,
        hora_inicio: base.hora_inicio,
        hora_fin: base.hora_fin,
        estado: base.estado,
        tipo: base.tipo,
        titulo: base.titulo,
        no_contabilizar: base.no_contabilizar,
        por_confirmar: base.por_confirmar,
        group_id: ((session as any).group_id as string | null) ?? null,
        servicio_slug: base.servicio_slug,
        incidencia: base.incidencia,
      };


      let updateErr: any = null;

      if (grupo && recurrenciaId) {
        // ---- Sincronizar miembros del grupo para esta fecha ----
        const desiredIds = groupClientIds.filter((id): id is string => !!id);
        const existing = (groupMembersData ?? []).filter((m) => m.estado !== "cancelada" && !cancelledIds.includes(m.id));
        const existingWithClient = existing.filter((m) => !!m.client_id);
        const existingIds = new Set(existingWithClient.map((m) => m.client_id as string));
        const desiredSet = new Set(desiredIds);
        const toRemove = existingWithClient.filter((m) => !desiredSet.has(m.client_id as string));
        const toAdd = desiredIds.filter((id) => !existingIds.has(id));
        const placeholder = existing.find((m) => !m.client_id);

        // Aplicar campos compartidos (incluida la nota/incidencia) a TODOS los
        // miembros existentes del bloque para que la nota quede persistida
        // aunque la sesión clicada sea el placeholder o vaya a ser eliminada.
        if (existing.length) {
          await supabase.from("sessions").update({
            ...sharedGroupFields,
            estado: estadoForDate(session.fecha!),
            ocupacion: 2,
          }).in("id", existing.map((m) => m.id));
        }

        // Actualizar miembros existentes que se mantienen (campos compartidos).
        const keepIds = existingWithClient.filter((m) => desiredSet.has(m.client_id as string)).map((m) => m.id);
        if (keepIds.length) {
          await supabase.from("sessions").update({
            ...sharedGroupFields,
            estado: estadoForDate(session.fecha!),
            ocupacion: 2,
          }).in("id", keepIds);
        }

        // Añadir nuevos miembros.
        if (toAdd.length) {
          // Si existe placeholder sin cliente, reasignar el primero a él.
          const inserts: any[] = [];
          let addQueue = [...toAdd];
          if (placeholder && addQueue.length) {
            const first = addQueue.shift()!;
            await supabase.from("sessions").update({
              ...sharedGroupFields,
              estado: estadoForDate(session.fecha!),
              ocupacion: 2,
              client_id: first,
            }).eq("id", placeholder.id);
          }
          for (const cid of addQueue) {
            inserts.push({
              ...sharedGroupFields,
              fecha: session.fecha!,
              estado: estadoForDate(session.fecha!),
              ocupacion: 2,
              client_id: cid,
              recurrencia_id: recurrenciaId,
            });
          }
          if (inserts.length) {
            const { error: e } = await supabase.from("sessions").insert(inserts);
            if (e) updateErr = e;
          }
        } else if (desiredIds.length === 0 && !placeholder) {
          // Grupo sin clientes: mantener un placeholder para que exista el bloque.
          const { error: e } = await supabase.from("sessions").insert([{
            ...sharedGroupFields,
            fecha: session.fecha!,
            estado: estadoForDate(session.fecha!),
            ocupacion: 2,
            client_id: null,
            recurrencia_id: recurrenciaId,
          }]);
          if (e) updateErr = e;
        }

        // Quitar miembros eliminados.
        if (toRemove.length) {
          const canceladas = toRemove
            .filter((m) => !!(m as { booked_by_user_id?: string | null }).booked_by_user_id)
            .map((m) => m.id);
          if (canceladas.length) {
            try {
              await notificarReservasCanceladas({ data: { sessionIds: canceladas } });
            } catch {
              /* el aviso es best-effort */
            }
          }
          await supabase.from("sessions").delete().in("id", toRemove.map((m) => m.id));
        }

        // Si scope=future, propagar los campos compartidos al resto de fechas de la serie.
        if (scope === "future") {
          const { data: futureRows } = await supabase
            .from("sessions")
            .select("*")
            .eq("recurrencia_id", recurrenciaId)
            .gt("fecha", session.fecha!);
          const desiredIds2 = groupClientIds.filter((id): id is string => !!id);
          const desiredSet2 = new Set(desiredIds2);
          const futureDates = Array.from(new Set((futureRows ?? []).map((r) => r.fecha)));
          for (const fecha of futureDates) {
            const rows = (futureRows ?? []).filter((r) => r.fecha === fecha && r.estado !== "cancelada");
            const existingWithClient2 = rows.filter((r) => !!r.client_id);
            const existingIds2 = new Set(existingWithClient2.map((r) => r.client_id as string));
            const placeholder2 = rows.find((r) => !r.client_id);
            const keepIds2 = existingWithClient2.filter((r) => desiredSet2.has(r.client_id as string)).map((r) => r.id);
            const removeIds2 = existingWithClient2.filter((r) => !desiredSet2.has(r.client_id as string)).map((r) => r.id);
            let addQueue2 = desiredIds2.filter((id) => !existingIds2.has(id));

            if (keepIds2.length) {
              await supabase.from("sessions").update({
                trainer_id: sharedGroupFields.trainer_id,
                hora_inicio: sharedGroupFields.hora_inicio,
                hora_fin: sharedGroupFields.hora_fin,
                titulo: sharedGroupFields.titulo,
                incidencia: sharedGroupFields.incidencia,
                servicio_slug: sharedGroupFields.servicio_slug,
                ocupacion: 2,
              }).in("id", keepIds2);
            }
            if (placeholder2 && addQueue2.length) {
              const first = addQueue2.shift()!;
              await supabase.from("sessions").update({
                trainer_id: sharedGroupFields.trainer_id,
                hora_inicio: sharedGroupFields.hora_inicio,
                hora_fin: sharedGroupFields.hora_fin,
                titulo: sharedGroupFields.titulo,
                incidencia: sharedGroupFields.incidencia,
                servicio_slug: sharedGroupFields.servicio_slug,
                ocupacion: 2,
                client_id: first,
              }).eq("id", placeholder2.id);
            }
            if (addQueue2.length) {
              const inserts2 = addQueue2.map((cid) => ({
                trainer_id: sharedGroupFields.trainer_id,
                hora_inicio: sharedGroupFields.hora_inicio,
                hora_fin: sharedGroupFields.hora_fin,
                titulo: sharedGroupFields.titulo,
                incidencia: sharedGroupFields.incidencia,
                servicio_slug: sharedGroupFields.servicio_slug,
                group_id: (rows[0] as any)?.group_id ?? sharedGroupFields.group_id,
                no_contabilizar: false,
                fecha,
                estado: "reservada" as SesionEstado,
                ocupacion: 2,
                client_id: cid,
                recurrencia_id: recurrenciaId,
              }));
              const { error: eIns } = await supabase.from("sessions").insert(inserts2);
              if (eIns) updateErr = eIns;
            }
            if (removeIds2.length) {
              await supabase.from("sessions").delete().in("id", removeIds2);
            }
            // Si el grupo queda vacío en esta fecha, mantener un placeholder.
            if (desiredIds2.length === 0 && !placeholder2) {
              await supabase.from("sessions").insert([{
                trainer_id: sharedGroupFields.trainer_id,
                hora_inicio: sharedGroupFields.hora_inicio,
                hora_fin: sharedGroupFields.hora_fin,
                titulo: sharedGroupFields.titulo,
                incidencia: sharedGroupFields.incidencia,
                servicio_slug: sharedGroupFields.servicio_slug,
                group_id: (rows[0] as any)?.group_id ?? sharedGroupFields.group_id,
                no_contabilizar: false,
                fecha,
                estado: "reservada" as SesionEstado,
                ocupacion: 2,
                client_id: null,
                recurrencia_id: recurrenciaId,
              }]);
            }

          }
        }
      } else {
        // Sesión individual.
        const payload = { ...base, estado: session.estado === "cancelada" || cancelledIds.includes(session.id ?? "") ? "cancelada" as SesionEstado : estadoForDate(session.fecha!), no_contabilizar: cancelledRows.find((r) => r.id === session.id)?.no_contabilizar ?? false, client_id: session.estado === "cancelada" || cancelledIds.includes(session.id ?? "") ? session.client_id : clientId };
        if (scope === "future" && recurrenciaId) {
          // Aplicar a todas las sesiones futuras de la serie (misma serie, fecha >= actual).
          // Excluimos "fecha" del payload para no colapsar todas al mismo día.
          const { fecha: _f, estado: _e, ...rest } = payload as any;
          const { error: eSelf } = await supabase.from("sessions").update(payload).eq("id", session.id!);
          if (eSelf) updateErr = eSelf;
          await supabase.from("sessions").update({
            ...rest,
            // Recalcular estado por fecha en el cliente sería ideal; para futuras dejamos "reservada"
            // salvo que el usuario haya elegido explícitamente otro estado distinto de reservada.
            estado: "reservada",
          }).eq("recurrencia_id", recurrenciaId).gt("fecha", session.fecha!).neq("estado", "cancelada");
        } else {
          const { error } = await supabase.from("sessions").update(payload).eq("id", session.id!);
          if (error) updateErr = error;
        }
      }

      if (updateErr) { toast.error(updateErr.message); }
      else {
        // Repetir en serie también al editar: crea N copias semanales tras la fecha actual.
        if (repeatWeeks > 0) {
          let seriesId: string | null = (session as any).recurrencia_id ?? null;
          if (!seriesId) {
            seriesId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
            await supabase.from("sessions").update({ recurrencia_id: seriesId }).eq("id", session.id!);
          }
          const memberIds = grupo
            ? groupClientIds.filter((id): id is string => !!id)
            : [clientId];
          const ids = grupo && memberIds.length === 0 ? [null] : memberIds;
          const extraDates: string[] = [];
          for (let w = 1; w <= repeatWeeks; w++) {
            const d = new Date(session.fecha!);
            d.setDate(d.getDate() + 7 * w);
            extraDates.push(formatDateISO(d));
          }
          // Excluir fechas que ya existan en la serie (misma hora) para no duplicar.
          const { data: existingSeries } = await supabase
            .from("sessions")
            .select("fecha")
            .eq("recurrencia_id", seriesId)
            .eq("hora_inicio", base.hora_inicio!)
            .in("fecha", extraDates);
          const existingDates = new Set((existingSeries ?? []).map((r: any) => r.fecha));
          const newDates = extraDates.filter((f) => !existingDates.has(f));
          const inserts = newDates.flatMap((fecha) =>
            ids.map((cid) => ({
              ...base,
              fecha,
              estado: estadoForDate(fecha),
              client_id: cid,
              recurrencia_id: seriesId,
              // Las repeticiones futuras nacen sin entrenador asignado.
              trainer_id: null,
            }))
          );
          if (inserts.length) {
            const { error: e2 } = await supabase.from("sessions").insert(inserts);
            if (e2) toast.error(e2.message);
          }
          const added = newDates.length;
          toast.success(added > 0 ? `Sesión actualizada (+${added} repeticiones)` : "Sesión actualizada (sin repeticiones nuevas)");
        } else {
          toast.success(scope === "future" ? "Series futuras actualizadas" : "Sesión actualizada");
        }
      }
    }
    // Las sesiones de prueba no generan bono; el tipo "Prueba" se deriva de la sesión.
    refreshAgenda(qc);
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    qc.removeQueries({ queryKey: ["group-members"] });
    qc.removeQueries({ queryKey: ["series-future-rows"] });
    setScopeAsk(false);
    onClose();
  }

  async function requestDelete() {
    // Si la sesión está pendiente de confirmar, eliminarla equivale a denegar
    // la reserva del cliente: se avisa antes de continuar.
    if (pendientesIds.length) {
      const ok = await confirm({
        title: "¿Eliminar una sesión pendiente de confirmar?",
        description:
          "Esta sesión está pendiente de confirmar. Si la eliminas, se denegará la reserva del cliente y recibirá un aviso.",
        confirmText: "Eliminar y denegar",
      });
      if (!ok) return;
    }
    if (isSeries) setDeleteAsk(true);
    else void doDelete("one");
  }

  // Oculta al instante del buzón los avisos de confirmar/denegar ya resueltos a mano.
  function quitarAvisosPendientes(ids: string[]) {
    const set = new Set(ids);
    qc.setQueriesData<string[]>({ queryKey: ["notificaciones-pendientes"] }, (old) =>
      old ? old.filter((id) => !set.has(id)) : old,
    );
  }

  async function doDelete(scope: "one" | "future") {
    if (!session?.id) return;
    // Cerrar al instante: el borrado continúa en segundo plano.
    setDeleteAsk(false);
    onClose();
    if (pendientesIds.length) {
      quitarAvisosPendientes(pendientesIds);
      // Denegar primero para avisar al cliente y liberar la plaza a la cola.
      await Promise.all(
        pendientesIds.map((id) =>
          resolverReservaPendiente({ data: { sessionId: id, accion: "denegar" } }).catch(() => {}),
        ),
      );
      qc.invalidateQueries({ queryKey: ["notificaciones-pendientes"] });
      qc.invalidateQueries({ queryKey: ["notificaciones"] });
    }
    if (scope === "future" && recurrenciaId && session.fecha) {
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("recurrencia_id", recurrenciaId)
        .gte("fecha", session.fecha);
      if (error) toast.error(error.message);
      else toast.success("Sesiones futuras eliminadas");
    } else if (grupo && recurrenciaId && session.fecha && session.hora_inicio) {
      // Grupo: eliminar todos los miembros del bloque en esta fecha/hora.
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("recurrencia_id", recurrenciaId)
        .eq("fecha", session.fecha)
        .eq("hora_inicio", session.hora_inicio);
      if (error) toast.error(error.message);
      else toast.success("Sesión de grupo eliminada");
    } else {
      const { error } = await supabase.from("sessions").delete().eq("id", session.id);
      if (error) toast.error(error.message);
      else toast.success("Sesión eliminada");
    }
    refreshAgenda(qc);
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    qc.removeQueries({ queryKey: ["group-members"] });
    qc.removeQueries({ queryKey: ["series-future-rows"] });
    setDeleteAsk(false);
    onClose();
  }

  if (!session) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onKeyDown={enterToSave(requestSave)} className="max-w-2xl gap-3 p-5">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nueva sesión" : "Editar sesión"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2.5">
           <div className="-mt-1 text-xs text-muted-foreground">{formatDateShort(session.fecha)}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hora inicio</Label>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} step={300} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora fin</Label>
              <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} step={300} />
            </div>
          </div>
          {isOutsideOpening(session.fecha ?? "", horaInicio, horaFin, horario, specialsMap) && (
            <FueraHorarioAviso show />
          )}


          <div className="space-y-1.5">
            <Label>Servicio</Label>
            <Select value={servicioSlug} onValueChange={cambiarServicio}>
              <SelectTrigger><SelectValue placeholder="Selecciona un servicio" /></SelectTrigger>
              <SelectContent>
                {servicios.map((s) => (
                  <SelectItem key={s.id} value={s.slug}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Entrenador</Label>
              <Select value={trainerId ?? ""} onValueChange={(v) => setTrainerId(v || null)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {activeTrainerOptions(trainers).map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre} ({t.iniciales})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

          </div>

          <div className="space-y-1.5">
            <Label>
              {plazas > 1
                ? `Clientes (${groupClientIds.filter(Boolean).length}/${plazas})`
                : "Cliente"}
            </Label>
            {plazas > 1 ? (
              <div className="flex flex-col gap-2">
              {groupClientIds.map((cid, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <ClientPicker
                      value={cid}
                      showRemainingSessions={behaviorCfg.mostrarSesionesRestantesEnSesion}
                      autoFocus={isNew && i === 0}
                      initialText={i === 0 ? nombreLibre : undefined}
                      onTextChange={i === 0 ? (t) => setNombreLibre(t) : undefined}
                      onChange={async (id) => {
                        if (cid && id !== cid) {
                          const reserva = (groupMembersData ?? []).find(
                            (m) =>
                              m.client_id === cid &&
                              !!(m as { booked_by_user_id?: string | null }).booked_by_user_id,
                          );
                          if (reserva) {
                            const ok = await confirm({
                              title: "¿Quitar a este cliente?",
                              description:
                                "Este cliente reservó esta sesión desde su portal. Si lo quitas, se cancelará su reserva y recibirá un aviso.",
                              confirmText: "Quitar",
                            });
                            if (!ok) return;
                          }
                        }
                        setGroupClientIds((prev) => prev.map((p, idx) => (idx === i ? id : p)));
                      }}
                      onNameClick={(c) => setPerfilCliente(c)}
                    />
                  </div>
                  {clientMenu((groupMembersData ?? []).find((row) => row.client_id === cid), () => setGroupClientIds((old) => old.map((id, index) => index === i ? null : id)))}
                </div>
              ))}
              </div>
            ) : (
              <div className="flex items-start gap-2"><div className="min-w-0 flex-1">
                <ClientPicker
                  value={clientId}
                  showRemainingSessions={behaviorCfg.mostrarSesionesRestantesEnSesion}
                  onChange={(id) => setClientId(id)}
                  autoFocus={isNew}
                  initialText={nombreLibre}
                  onTextChange={(t) => setNombreLibre(t)}
                  onNameClick={(c) => setPerfilCliente(c)}
                /></div>{clientMenu(session?.id ? session as Session : undefined, () => setClientId(null))}
              </div>
            )}
          </div>


          {cancelledRows.length > 0 && <div className="space-y-2"><Label>Cancelados ({cancelledRows.length})</Label>{cancelledRows.map((row) => <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"><span>{clientsForCancelled.find((c) => c.id === row.client_id)?.nombre ?? "Cliente"}</span><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!row.no_contabilizar} onCheckedChange={async (v) => { const { data, error } = await supabase.from("sessions").update({ no_contabilizar: !!v }).eq("id", row.id).select("*").single(); if (error) return toast.error(error.message); commitAgendaRows(qc, [data]); setCancelledOverrides((old) => [...old.filter((r) => r.id !== data.id), data]); void qc.invalidateQueries({ queryKey: ["group-members"] }); void qc.invalidateQueries({ queryKey: ["client_bonos"] }); void qc.invalidateQueries({ queryKey: ["sessions-past"] }); }} />No contabilizar</label></div>)}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="esprueba" checked={esPrueba} onCheckedChange={(v) => setEsPrueba(!!v)} />
              <Label htmlFor="esprueba" className="cursor-pointer">Sesión de prueba</Label>
            </div>
            <div className="flex items-center gap-2">
              {canMarkSessionPending(estado, reservasPortalIds.length > 0) ? (
                <>
                  <Checkbox id="porconfirmar" checked={estado === "reservada" && porConfirmar} onCheckedChange={(v) => { if (canMarkSessionPending(estado, reservasPortalIds.length > 0)) setPorConfirmar(!!v); }} />
                  <Label htmlFor="porconfirmar" className="cursor-pointer">Por confirmar</Label>
                </>
              ) : (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-not-allowed items-center gap-2" aria-disabled="true">
                        <Checkbox id="porconfirmar" disabled checked={estado === "reservada" && porConfirmar} tabIndex={-1} />
                        <span className="text-sm text-muted-foreground">Por confirmar</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="whitespace-nowrap">No se puede poner como pendiente una sesión ya confirmada</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Repetir semanas</Label>
            <Input type="number" min={0} max={52} placeholder="0" value={repeatWeeks === 0 ? "" : repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              ref={notasRef}
              value={incidencia}
              onChange={(e) => setIncidencia(e.target.value)}
              rows={1}
              className="min-h-[36px] resize-none overflow-hidden"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {!isNew && <Button variant="destructive" onClick={requestDelete}>Eliminar</Button>}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={requestSave}>{isNew ? "Crear" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={scopeAsk} onOpenChange={setScopeAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar sesión en serie</AlertDialogTitle>
            <AlertDialogDescription>
              Esta sesión se repite en varias semanas. ¿Quieres aplicar los cambios sólo a esta sesión o también a las siguientes de la serie?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => doSave("one")}>Sólo esta sesión</AlertDialogAction>
            <AlertDialogAction onClick={() => doSave("future")}>Sesiones futuras</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteAsk} onOpenChange={setDeleteAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sesión en serie</AlertDialogTitle>
            <AlertDialogDescription>
              Esta sesión se repite en varias semanas. ¿Quieres eliminar sólo esta sesión o también las siguientes de la serie?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => doDelete("one")}>Sólo esta sesión</AlertDialogAction>
            <AlertDialogAction onClick={() => doDelete("future")}>Sesiones futuras</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
    {confirmDialog}
    <ClientDetailsDialog
      client={perfilCliente}
      defaultTab="calendario"
      onOpenChange={(o) => { if (!o) setPerfilCliente(null); }}
    />
    </>
  );
}