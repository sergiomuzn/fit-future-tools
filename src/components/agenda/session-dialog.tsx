import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, type Trainer, type Session, type SesionEstado, ESTADO_LABEL, type ClientBono } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { ClientPicker } from "@/components/clients/client-picker";
import { GroupPicker } from "@/components/groups/group-picker";
import { GroupDialog } from "@/components/groups/group-dialog";
import { Plus } from "lucide-react";
import { formatDateISO } from "./types";
import { toast } from "sonner";
import { getBehaviorConfig } from "@/lib/behavior-config";
import { useCenterConfig } from "@/lib/center-schedule";
import { useServicios } from "@/lib/servicios";
import { notificarReservasCanceladas } from "@/lib/notificaciones.functions";
import { useConfirm } from "@/components/confirm-dialog";
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
  const [estado, setEstado] = useState<SesionEstado>("reservada");
  const [esPrueba, setEsPrueba] = useState(false);
  const [incidencia, setIncidencia] = useState("");
  const [grupo, setGrupo] = useState(false);
  const [servicioSlug, setServicioSlug] = useState<string>("");
  const [groupClientIds, setGroupClientIds] = useState<(string | null)[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [titulo, setTitulo] = useState("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [noContabilizar, setNoContabilizar] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

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
  });

  const { data: bonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => (await supabase.from("client_bonos").select("*")).data as ClientBono[] ?? [],
    enabled: open,
  });
  const { data: catalogoAll = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("id,tipo")).data ?? [],
    enabled: open,
  });
  const { colores } = useCenterConfig();
  const activeBono = clientId
    ? bonos.filter((b) => b.client_id === clientId && b.activo).sort((a, b) => (b.fecha_inicio ?? "").localeCompare(a.fecha_inicio ?? ""))[0]
    : null;
  const activeBonoTipo = (catalogoAll as Array<{ id: string; tipo: string }>).find(
    (c) => c.id === activeBono?.bono_catalogo_id,
  )?.tipo;
  const isGympassBono = activeBonoTipo === "gympass" || activeBonoTipo === "grupal";
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

  // Coincide con la columna "Restantes" del apartado Bonos.
  const restantes = activeBono && !isGympassBono ? activeBono.sesiones_disponibles : null;

  useEffect(() => {
    if (!open) return;
    setClientId(session?.client_id ?? null);
    setTrainerId(session?.trainer_id ?? null);
    setEsPrueba(session?.estado === "prueba" || (session as any)?.tipo === "prueba");
    setEstado(
      session?.estado === "prueba" ? "reservada" : ((session?.estado as SesionEstado) ?? "reservada"),
    );
    setIncidencia(session?.incidencia ?? "");
    setGrupo((session?.ocupacion ?? 1) === 2);
    setServicioSlug(
      ((session as any)?.servicio_slug as string | null | undefined) ??
        ((session?.ocupacion ?? 1) === 2 ? (servicioGrupo?.slug ?? "") : (servicioIndividual?.slug ?? "")),
    );
    setRepeatWeeks(0);
    setHoraInicio((session?.hora_inicio ?? "").slice(0,5));
    setHoraFin((session?.hora_fin ?? "").slice(0,5));
    setTitulo((session as any)?.titulo ?? "");
    setNombreLibre(!((session as any)?.client_id) ? ((session as any)?.titulo ?? "") : "");

    const isNewSession = !session?.id;
    const cfgBehavior = getBehaviorConfig();
    setNoContabilizar(
      isNewSession
        ? cfgBehavior.cancelacionDefaultNoContabilizar
        : !!(session as any)?.no_contabilizar,
    );
    setPorConfirmar(!!(session as any)?.por_confirmar);
    setGroupId(((session as any)?.group_id as string | null | undefined) ?? null);
  }, [open, session]);

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
      .map((m) => m.client_id)
      .filter((id): id is string => !!id);
    const padded: (string | null)[] = [...ids];
    while (padded.length < plazas) padded.push(null);
    setGroupClientIds(padded.slice(0, Math.max(plazas, ids.length)));
  }, [open, isNew, session?.ocupacion, session?.client_id, groupMembersData, plazas]);


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
    const tituloDeseado = grupo
      ? titulo.trim() || null
      : !clientId && nombreLibreTrim
        ? nombreLibreTrim
        : null;
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
    // Group sessions must reference a registered group (create it via the
    // "Nuevo grupo" button next to the picker). Enforce the group's capacity
    // on the picked members.
    const effectiveGroupId = groupId;
    if (grupo) {
      if (!effectiveGroupId) {
        toast.error("Selecciona un grupo o crea uno nuevo");
        return;
      }
      const cap = pickedGroup ? Math.max(1, pickedGroup.capacidad ?? 1) : 0;
      const pickedMembers = groupClientIds.filter((id): id is string => !!id);
      if (pickedMembers.length > cap) {
        toast.error(`Capacidad máxima del grupo: ${cap}`);
        return;
      }
    }
    const base = {
      client_id: grupo ? null : clientId,
      trainer_id: trainerId,
      fecha: session.fecha!,
      hora_inicio: `${horaInicio}:00`,
      hora_fin: `${horaFin}:00`,
      // La casilla "Sesión de prueba" marca el tipo; el estado sigue siendo
      // editable (reservada / realizada / cancelada). Para conservar el color
      // y evitar la auto-conversión, una prueba no cancelada se guarda como
      // estado "prueba".
      estado: (esPrueba && estado !== "cancelada" ? "prueba" : estado) as SesionEstado,
      tipo: esPrueba ? "prueba" : null,
      ocupacion,
      incidencia: incidencia || null,
      titulo: grupo ? (titulo.trim() || null) : (!clientId && nombreLibreTrim ? nombreLibreTrim : null),
      no_contabilizar: estado === "cancelada" ? noContabilizar : false,
      por_confirmar: estado === "reservada" ? porConfirmar : false,
      group_id: grupo ? effectiveGroupId : null,
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
    const now = new Date();
    const GRACE_MS = 15 * 60 * 1000;
    const estadoForDate = (fecha: string): SesionEstado => {
      const end = new Date(`${fecha}T${base.hora_fin}`);
      const isPast = end.getTime() + GRACE_MS < now.getTime();
      // "Por confirmar" nunca se auto-convierte.
      if (base.por_confirmar) return "reservada";
      // Canceladas se respetan tal cual. Prueba se auto-progresa a realizada
      // cuando la sesión es pasada (el tipo de bono "prueba" se mantiene).
      if (base.estado === "cancelada" || base.estado === "prueba") return base.estado;
      // Futuro: si estaba marcada como realizada, revertir a reservada.
      if (!isPast) {
        if (base.estado === "realizada") return "reservada";
        return base.estado;
      }
      // Pasado (>15 min tras el fin): reservada / renovacion / realizada → realizada.
      return "realizada";
    };

    if (isNew) {
      // Para grupo, insertar una sesión por cada hueco con cliente seleccionado.
      const memberIds = grupo
        ? groupClientIds.filter((id): id is string => !!id)
        : [clientId];
      if (!grupo && !clientId && !nombreLibreTrim) {
        if (!porConfirmar) {
          toast.error("Selecciona un cliente o escribe un nombre");
          return;
        }
      }
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
      // No se crea ningún bono: el tipo "Prueba" se deriva de la propia sesión
      // hasta que se registre un bono real (Bonos o Facturación).
      if (!error && !grupo && clientId && esPrueba) {
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
    } else {
      // Campos compartidos entre miembros de un grupo (mismo día).
      const sharedGroupFields = {
        trainer_id: base.trainer_id,
        hora_inicio: base.hora_inicio,
        hora_fin: base.hora_fin,
        estado: base.estado,
        tipo: base.tipo,
        titulo: base.titulo,
        no_contabilizar: base.no_contabilizar,
        por_confirmar: base.por_confirmar,
        group_id: base.group_id,
        incidencia: base.incidencia,
      };

      let updateErr: any = null;

      if (grupo && recurrenciaId) {
        // ---- Sincronizar miembros del grupo para esta fecha ----
        const desiredIds = groupClientIds.filter((id): id is string => !!id);
        const existing = groupMembersData ?? [];
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
            const rows = (futureRows ?? []).filter((r) => r.fecha === fecha);
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
        const payload = { ...base, estado: estadoForDate(session.fecha!), client_id: clientId };
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
            estado: base.estado === "reservada" ? "reservada" : base.estado,
          }).eq("recurrencia_id", recurrenciaId).gt("fecha", session.fecha!);
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
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    setScopeAsk(false);
    onClose();
  }

  function requestDelete() {
    if (isSeries) setDeleteAsk(true);
    else void doDelete("one");
  }

  async function doDelete(scope: "one" | "future") {
    if (!session?.id) return;
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
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    setDeleteAsk(false);
    onClose();
  }

  if (!session) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onKeyDown={enterToSave(requestSave)}>
        <DialogHeader>
          <DialogTitle>{isNew ? "Nueva sesión" : "Editar sesión"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{session.fecha}</div>
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

          <div className="flex items-start gap-2">
            <Checkbox id="esprueba" checked={esPrueba} onCheckedChange={(v) => setEsPrueba(!!v)} />
            <div className="space-y-0.5">
              <Label htmlFor="esprueba" className="cursor-pointer">Sesión de prueba</Label>
            </div>
          </div>

          {grupo ? (
            <div className="space-y-1.5">
              <Label>Grupo</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <GroupPicker value={groupId} onChange={(id, g) => { setGroupId(id); if (g) setTitulo(g.nombre); }} />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setCreateGroupOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Nuevo grupo
                </Button>
              </div>
              <Label className="text-xs text-muted-foreground">
                Clientes del grupo
                {pickedGroup
                  ? ` (${groupClientIds.filter(Boolean).length}/${pickedGroup.capacidad})`
                  : ""}
              </Label>
              {groupClientIds.map((cid, i) => {
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <ClientPicker
                        value={cid}
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
                                  "Este cliente reservó esta clase grupal desde su portal. Si lo quitas, se cancelará su reserva y recibirá un aviso.",
                                confirmText: "Quitar",
                              });
                              if (!ok) return;
                            }
                          }
                          setGroupClientIds((prev) => prev.map((p, idx) => (idx === i ? id : p)));
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <ClientPicker value={clientId} onChange={(id) => setClientId(id)} autoFocus={isNew} />
              {!grupo && clientId && !isGympassBono && (
              <div className="text-[11px] text-muted-foreground">
                  Sesiones restantes:{" "}
                  <span className="font-semibold">
                    {restantes ?? "Sin bono"}
                  </span>
                </div>
              )}
              {!clientId && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">o nombre libre (cliente no registrado)</Label>
                  <Input value={nombreLibre} onChange={(e) => setNombreLibre(e.target.value)} placeholder="Ej. Juan (prueba)" />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Entrenador</Label>
              <Select value={trainerId ?? ""} onValueChange={(v) => setTrainerId(v || null)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {trainers.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre} ({t.iniciales})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v as SesionEstado)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ESTADO_LABEL) as SesionEstado[]).filter((e) => e !== "prueba").map((e) => (
                    <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {estado === "cancelada" && (
            <div className="flex items-start gap-2 rounded-md border border-dashed p-2">
              <Checkbox id="nocount" checked={noContabilizar} onCheckedChange={(v) => setNoContabilizar(!!v)} />
              <div className="space-y-0.5">
                <Label htmlFor="nocount" className="cursor-pointer">No contabilizar</Label>
                <p className="text-[11px] text-muted-foreground leading-tight">Si lo marcas, la cancelación no descuenta sesión del bono. Si lo dejas sin marcar, se descuenta como si se hubiese realizado.</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Repetir semanas</Label>
              <Input type="number" min={0} max={52} placeholder="0" value={repeatWeeks === 0 ? "" : repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value) || 0)} />
            <p className="text-[11px] text-muted-foreground leading-tight">
              {isNew
                ? "Crea copias semanales tras esta fecha (también para grupos: se replican todos los miembros). Funciona con fechas pasadas ya realizadas."
                : "Añade N copias semanales tras esta sesión (en grupos, con todos los miembros)."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Incidencia / nota</Label>
            <Textarea value={incidencia} onChange={(e) => setIncidencia(e.target.value)} rows={2} />
          </div>

          {estado === "reservada" && (
            <div className="flex items-center gap-2">
              <Checkbox id="porconfirmar" checked={porConfirmar} onCheckedChange={(v) => setPorConfirmar(!!v)} />
              <Label htmlFor="porconfirmar" className="cursor-pointer">Por confirmar</Label>
            </div>
          )}
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
    <GroupDialog
      open={createGroupOpen}
      onClose={() => setCreateGroupOpen(false)}
      group={null}
    />
    {confirmDialog}
    </>
  );
}