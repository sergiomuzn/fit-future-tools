import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, type Trainer, type Session, type SesionEstado, ESTADO_LABEL, type ClientBono } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { ClientPicker } from "@/components/clients/client-picker";
import { formatDateISO } from "./types";
import { toast } from "sonner";
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
  const [groupClientIds, setGroupClientIds] = useState<(string | null)[]>([null, null, null, null, null, null]);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [titulo, setTitulo] = useState("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [noContabilizar, setNoContabilizar] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(false);

  const recurrenciaId = (session as any)?.recurrencia_id as string | null | undefined;
  const isSeries = !isNew && !!recurrenciaId;

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
  const activeBono = clientId
    ? bonos.filter((b) => b.client_id === clientId && b.activo).sort((a, b) => (b.fecha_inicio ?? "").localeCompare(a.fecha_inicio ?? ""))[0]
    : null;
  // Coincide con la columna "Restantes" del apartado Bonos.
  const restantes = activeBono ? activeBono.sesiones_disponibles : null;

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
    setNoContabilizar(!!(session as any)?.no_contabilizar);
  }, [open, session]);

  // Cuando llegan los miembros del grupo desde BD, rellenar los pickers.
  useEffect(() => {
    if (!open) return;
    if (session?.ocupacion !== 2) return;
    if (isNew) {
      setGroupClientIds([session?.client_id ?? null, null, null, null, null, null]);
      return;
    }
    if (!groupMembersData) return;
    const ids = groupMembersData
      .map((m) => m.client_id)
      .filter((id): id is string => !!id);
    const padded: (string | null)[] = [...ids];
    while (padded.length < 6) padded.push(null);
    setGroupClientIds(padded.slice(0, 6));
  }, [open, isNew, session?.ocupacion, session?.client_id, groupMembersData]);

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
    };
    // Auto-realizada si la sesión es pasada (se aplica por fecha en la serie)
    const now = new Date();
    const estadoForDate = (fecha: string): SesionEstado => {
      if (base.estado !== "reservada") return base.estado;
      const end = new Date(`${fecha}T${base.hora_fin}`);
      return end < now ? "realizada" : "reservada";
    };

    if (isNew) {
      // Para grupo, insertar una sesión por cada hueco con cliente seleccionado.
      const memberIds = grupo
        ? groupClientIds.filter((id): id is string => !!id)
        : [clientId];
      if (!grupo && !clientId && !nombreLibreTrim) {
        toast.error("Selecciona un cliente o escribe un nombre");
        return;
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
        return ids.map((cid) => ({ ...base, fecha, estado: estadoForDate(fecha), client_id: cid, recurrencia_id: seriesId }));
      });
      const { error } = await supabase.from("sessions").insert(inserts);
      if (error) toast.error(error.message); else toast.success(`Sesión creada${repeatWeeks > 0 ? ` (+${repeatWeeks} repeticiones)` : ""}`);
    } else {
      // Campos compartidos entre miembros de un grupo (mismo día).
      const sharedGroupFields = {
        trainer_id: base.trainer_id,
        hora_inicio: base.hora_inicio,
        hora_fin: base.hora_fin,
        estado: base.estado,
        titulo: base.titulo,
        no_contabilizar: base.no_contabilizar,
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
          const inserts = extraDates.flatMap((fecha) =>
            ids.map((cid) => ({ ...base, fecha, estado: estadoForDate(fecha), client_id: cid, recurrencia_id: seriesId }))
          );
          if (inserts.length) {
            const { error: e2 } = await supabase.from("sessions").insert(inserts);
            if (e2) toast.error(e2.message);
          }
          toast.success(`Sesión actualizada (+${repeatWeeks} repeticiones)`);
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

  async function remove() {
    if (!session?.id) return;
    const { error } = await supabase.from("sessions").delete().eq("id", session.id);
    if (error) toast.error(error.message); else toast.success("Sesión eliminada");
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    onClose();
  }

  async function cancelFutureSeries() {
    if (!session?.id) return;
    const recId = (session as any).recurrencia_id as string | null | undefined;
    if (!recId) { toast.error("Esta sesión no pertenece a una serie"); return; }
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("recurrencia_id", recId)
      .gte("fecha", session.fecha!);
    if (error) toast.error(error.message);
    else toast.success("Serie futura cancelada");
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    onClose();
  }

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

          {grupo && isNew ? (
            <div className="space-y-1.5">
              <Label>Título del grupo</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Funcional avanzado" />
              {groupClientIds.map((cid, i) => (
              <ClientPicker
                  key={i}
                  value={cid}
                  onChange={(id) => setGroupClientIds((prev) => prev.map((p, idx) => (idx === i ? id : p)))}
                />
              ))}
            </div>
          ) : grupo ? (
            <div className="space-y-1.5">
              <Label>Título del grupo</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Funcional avanzado" />
              <Label>Clientes del grupo</Label>
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
              <ClientPicker value={clientId} onChange={(id) => setClientId(id)} />
              {!grupo && clientId && (
                <div className="text-[11px] text-muted-foreground">
                  Sesiones restantes:{" "}
                  <span className={`font-semibold ${restantes !== null && restantes <= 1 ? "text-state-renovacion-fg" : "text-foreground"}`}>
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
                ? "Crea copias semanales tras esta fecha (también funciona para fechas pasadas ya realizadas)."
                : "Añade N copias semanales tras esta sesión. Útil para series pasadas o planificar las siguientes."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Incidencia / nota</Label>
            <Textarea value={incidencia} onChange={(e) => setIncidencia(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {!isNew && (session as any).recurrencia_id && (
            <Button variant="outline" onClick={cancelFutureSeries}>Cancelar series futuras</Button>
          )}
          {!isNew && <Button variant="destructive" onClick={remove}>Eliminar</Button>}
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
            <AlertDialogAction onClick={() => doSave("future")}>Series futuras</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}