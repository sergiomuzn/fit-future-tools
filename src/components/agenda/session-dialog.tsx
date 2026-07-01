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
    setGroupClientIds([session?.client_id ?? null, null, null, null, null, null]);
    setRepeatWeeks(0);
    setHoraInicio((session?.hora_inicio ?? "").slice(0,5));
    setHoraFin((session?.hora_fin ?? "").slice(0,5));
    setTitulo((session as any)?.titulo ?? "");
    setNombreLibre(!((session as any)?.client_id) && !((session as any)?.ocupacion === 2) ? ((session as any)?.titulo ?? "") : "");
    setNoContabilizar(!!(session as any)?.no_contabilizar);
  }, [open, session]);

  async function save() {
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
    // Auto-realizada si la sesión es pasada
    const now = new Date();
    const sessionEnd = new Date(`${session.fecha}T${base.hora_fin}`);
    if (sessionEnd < now && base.estado === "reservada") base.estado = "realizada";

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
        return ids.map((cid) => ({ ...base, fecha, client_id: cid, recurrencia_id: seriesId }));
      });
      const { error } = await supabase.from("sessions").insert(inserts);
      if (error) toast.error(error.message); else toast.success(`Sesión creada${repeatWeeks > 0 ? ` (+${repeatWeeks} repeticiones)` : ""}`);
    } else {
      const { error } = await supabase.from("sessions").update({ ...base, client_id: clientId }).eq("id", session.id!);
      // Si es grupo en edición, también actualizar todos los miembros del recurrencia_id
      if (grupo && (session as any).recurrencia_id) {
        await supabase.from("sessions").update({
          trainer_id: base.trainer_id,
          hora_inicio: base.hora_inicio,
          hora_fin: base.hora_fin,
          estado: base.estado,
          titulo: base.titulo,
          no_contabilizar: base.no_contabilizar,
        }).eq("recurrencia_id", (session as any).recurrencia_id).eq("fecha", session.fecha!);
      }
      if (error) { toast.error(error.message); }
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
            ids.map((cid) => ({ ...base, fecha, client_id: cid, recurrencia_id: seriesId }))
          );
          if (inserts.length) {
            const { error: e2 } = await supabase.from("sessions").insert(inserts);
            if (e2) toast.error(e2.message);
          }
          toast.success(`Sesión actualizada (+${repeatWeeks} repeticiones)`);
        } else {
          toast.success("Sesión actualizada");
        }
      }
    }
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
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
    if (!confirm("¿Eliminar todas las sesiones futuras de esta serie?")) return;
    const today = formatDateISO(new Date());
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("recurrencia_id", recId)
      .gt("fecha", today);
    if (error) toast.error(error.message);
    else toast.success("Serie futura cancelada");
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    onClose();
  }

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
              <Label>Cliente</Label>
              <ClientPicker value={clientId} onChange={(id) => setClientId(id)} />
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
            <Input type="number" min={0} max={52} value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))} />
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
            <Button variant="outline" onClick={cancelFutureSeries}>Cancelar serie futura</Button>
          )}
          {!isNew && <Button variant="destructive" onClick={remove}>Eliminar</Button>}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>{isNew ? "Crear" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}