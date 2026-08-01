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
  const [clientId, setClientId] = useState<string | null>(null);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [estado, setEstado] = useState<SesionEstado>("reservada");
  const [incidencia, setIncidencia] = useState("");
  const [grupo, setGrupo] = useState(false);
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

  // Contar hermanas futuras en la misma serie (fecha > actual). Solo pedimos
  // el "scope" al editar cuando de hecho existen series futuras.
  const { data: futureSiblingsCount = 0 } = useQuery({
    queryKey: ["series-future-count", recurrenciaId, session?.fecha],
    queryFn: async () => {
      if (!recurrenciaId || !session?.fecha) return 0;
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("recurrencia_id", recurrenciaId)
        .gt("fecha", session.fecha);
      return count ?? 0;
    },
    enabled: open && !isNew && !!recurrenciaId,
  });
  const isSeries = !isNew && !!recurrenciaId && futureSiblingsCount > 0;

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
  const TIPO_LABEL_BONO: Record<string, string> = {
    individual: "Individual",
    pareja: "Pareja",
    grupal: "Grupal",
    gympass: "Gympass",
    prueba: "Prueba",
  };
  // Tipo de bono efectivo de cada cliente del grupo: las reservas vía
  // Wellhub/Claspass cuentan como Gympass; el resto usa su bono activo.
  function tipoForClient(cid: string): string | null {
    const booking = (groupMembersData ?? []).find(
      (m) => m.client_id === cid && !!(m as any).booking_tipo,
    ) as any;
    const bt = booking?.booking_tipo as string | undefined;
    if (bt === "wellhub" || bt === "claspass") return "gympass";
    if (bt === "grupal_directo") return "grupal";
    const b = bonos
      .filter((x) => x.client_id === cid && x.activo)
      .sort((a, z) => (z.fecha_inicio ?? "").localeCompare(a.fecha_inicio ?? ""))[0];
    return (
      (catalogoAll as Array<{ id: string; tipo: string }>).find((c) => c.id === b?.bono_catalogo_id)
        ?.tipo ?? null
    );
  }
  const activeBono = clientId
    ? bonos.filter((b) => b.client_id === clientId && b.activo).sort((a, b) => (b.fecha_inicio ?? "").localeCompare(a.fecha_inicio ?? ""))[0]
    : null;
  const activeBonoTipo = (catalogoAll as Array<{ id: string; tipo: string }>).find(
    (c) => c.id === activeBono?.bono_catalogo_id,
  )?.tipo;
  const isGympassBono = activeBonoTipo === "gympass" || activeBonoTipo === "grupal";
  // Coincide con la columna "Restantes" del apartado Bonos.
  const restantes = activeBono && !isGympassBono ? activeBono.sesiones_disponibles : null;

  useEffect(() => {
    if (!open) return;
    setClientId(session?.client_id ?? null);
    setTrainerId(session?.trainer_id ?? null);
    setEstado((session?.estado as SesionEstado) ?? "reservada");
    setIncidencia(session?.incidencia ?? "");
    setGrupo((session?.ocupacion ?? 1) === 2);
    setRepeatWeeks(0);
    setHoraInicio((session?.hora_inicio ?? "").slice(0,5));
    setHoraFin((session?.hora_fin ?? "").slice(0,5));
    setTitulo((session as any)?.titulo ?? "");
    setNombreLibre(!((session as any)?.client_id) && !((session as any)?.ocupacion === 2) ? ((session as any)?.titulo ?? "") : "");
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

  // When a registered group is selected (in a new group session), auto-fill members and title.
  const { data: pickedGroupMembers = [] } = useQuery({
    queryKey: ["group_members_by_group", groupId],
    queryFn: async () => {
      if (!groupId) return [] as { client_id: string }[];
      const { data } = await supabase.from("group_members").select("client_id").eq("group_id", groupId);
      return (data ?? []) as { client_id: string }[];
    },
    enabled: open && !!groupId,
  });
  const { data: pickedGroup } = useQuery({
    queryKey: ["group_by_id", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const { data } = await supabase.from("groups").select("*").eq("id", groupId).maybeSingle();
      return data;
    },
    enabled: open && !!groupId,
  });

  // Asistentes que han reservado desde el portal de clientes (o vía Wellhub/Claspass).
  const onlineMembers = (groupMembersData ?? []).filter(
    (m) => !!(m as any).booking_tipo && !!m.client_id,
  );
  const { data: onlineClientNames = {} } = useQuery({
    queryKey: ["online-booking-names", onlineMembers.map((m) => m.client_id).join(",")],
    queryFn: async () => {
      const ids = onlineMembers.map((m) => m.client_id as string);
      if (!ids.length) return {} as Record<string, string>;
      const { data } = await supabase.from("clients").select("id,nombre").in("id", ids);
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.nombre])) as Record<string, string>;
    },
    enabled: open && onlineMembers.length > 0,
  });
  const lastAutofilledGroupIdRef = ((): { current: string | null } => {
    // Use a stable ref stored on window to avoid an extra useRef import churn.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyGlobal: any = globalThis as any;
    if (!anyGlobal.__sd_ref) anyGlobal.__sd_ref = { current: null };
    return anyGlobal.__sd_ref;
  })();
  useEffect(() => {
    if (!open || !groupId || !isNew) return;
    if (lastAutofilledGroupIdRef.current === groupId) return;
    if (pickedGroup) {
      setTitulo(pickedGroup.nombre);
    }
    if (pickedGroup) {
      const cap = Math.max(1, pickedGroup.capacidad ?? 1);
      const ids = pickedGroupMembers.map((m) => m.client_id);
      const padded: (string | null)[] = [...ids];
      while (padded.length < cap) padded.push(null);
      setGroupClientIds(padded.slice(0, cap));
      lastAutofilledGroupIdRef.current = groupId;
    }
  }, [open, isNew, groupId, pickedGroup, pickedGroupMembers, lastAutofilledGroupIdRef]);

  // Sync titulo with linked group's name (when we don't already have one).
  useEffect(() => {
    if (!open || !groupId || !pickedGroup) return;
    setTitulo((prev) => prev || pickedGroup.nombre);
  }, [open, groupId, pickedGroup]);

  // Resize the client pickers to match the linked group's capacidad while
  // preserving any picks. Without a picked group there are no client slots.
  const capacityForPickers = pickedGroup ? Math.max(1, pickedGroup.capacidad ?? 1) : 0;
  useEffect(() => {
    if (!open || !grupo) return;
    setGroupClientIds((prev) => {
      if (prev.length === capacityForPickers) return prev;
      if (prev.length > capacityForPickers) return prev.slice(0, capacityForPickers);
      const next = [...prev];
      while (next.length < capacityForPickers) next.push(null);
      return next;
    });
  }, [open, grupo, capacityForPickers]);

  // Cuando llegan los miembros del grupo desde BD, rellenar los pickers.
  useEffect(() => {
    if (!open) return;
    if (session?.ocupacion !== 2) return;
    if (isNew) {
      // Slots aparecerán al elegir un grupo (según su capacidad).
      setGroupClientIds(session?.client_id ? [session.client_id] : []);
      return;
    }
    if (!groupMembersData) return;
    const ids = groupMembersData
      .map((m) => m.client_id)
      .filter((id): id is string => !!id);
    const cap = pickedGroup ? Math.max(1, pickedGroup.capacidad ?? 1) : ids.length;
    const padded: (string | null)[] = [...ids];
    while (padded.length < cap) padded.push(null);
    setGroupClientIds(padded.slice(0, Math.max(cap, ids.length)));
  }, [open, isNew, session?.ocupacion, session?.client_id, groupMembersData, pickedGroup]);

  function requestSave() {
    if (isSeries) {
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
      estado,
      ocupacion,
      incidencia: incidencia || null,
      titulo: grupo ? (titulo.trim() || null) : (!clientId && nombreLibreTrim ? nombreLibreTrim : null),
      no_contabilizar: estado === "cancelada" ? noContabilizar : false,
      por_confirmar: estado === "reservada" ? porConfirmar : false,
      group_id: grupo ? effectiveGroupId : null,
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
      if (base.estado === "cancelada") return base.estado;
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
      // Si es una sesión de prueba con un cliente asignado, aseguramos que el
      // cliente quede registrado con un bono "Prueba" activo (sin factura).
      if (!error && !grupo && clientId && base.estado === "prueba") {
        await supabase.rpc("ensure_prueba_bono" as never, {
          p_client: clientId,
          p_fecha: session.fecha!,
        } as never);
        qc.invalidateQueries({ queryKey: ["client_bonos"] });
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
    } else {
      // Campos compartidos entre miembros de un grupo (mismo día).
      const sharedGroupFields = {
        trainer_id: base.trainer_id,
        hora_inicio: base.hora_inicio,
        hora_fin: base.hora_fin,
        estado: base.estado,
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

          <div className="flex items-center gap-2">
            <Checkbox id="grupo" checked={grupo} onCheckedChange={(v) => setGrupo(!!v)} />
            <Label htmlFor="grupo" className="cursor-pointer">Grupo</Label>
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
                Clientes del grupo{pickedGroup ? ` (máx. ${pickedGroup.capacidad})` : ""}
              </Label>
              {onlineMembers.length > 0 && (
                <div className="rounded-md border border-dashed border-primary/50 bg-primary/5 p-2 space-y-1">
                  <div className="text-[11px] font-medium text-primary">
                    Reservas online ({onlineMembers.length})
                  </div>
                  {onlineMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{onlineClientNames[m.client_id as string] ?? "Cliente"}</span>
                      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                        {bonoTipoClienteLabel((m as any).booking_tipo)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {groupClientIds.map((cid, i) => (
                <ClientPicker
                  key={i}
                  value={cid}
                  onChange={(id) => setGroupClientIds((prev) => prev.map((p, idx) => (idx === i ? id : p)))}
                />
              ))}
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
                  {(Object.keys(ESTADO_LABEL) as SesionEstado[]).map((e) => (
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
    </>
  );
}