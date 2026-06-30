import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, type Trainer, type Session, type SesionEstado, ESTADO_LABEL } from "@/lib/db";
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
  }, [open, session]);

  async function save() {
    if (!session) return;
    if (!horaInicio || !horaFin || horaFin <= horaInicio) {
      toast.error("Revisa las horas de la sesión");
      return;
    }
    const ocupacion = grupo ? 2 : 1;
    const base = {
      client_id: grupo ? null : clientId,
      trainer_id: trainerId,
      fecha: session.fecha!,
      hora_inicio: `${horaInicio}:00`,
      hora_fin: `${horaFin}:00`,
      estado,
      ocupacion,
      incidencia: incidencia || null,
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
      if (memberIds.length === 0) {
        toast.error(grupo ? "Selecciona al menos un cliente en el grupo" : "Selecciona un cliente");
        return;
      }
      const dates = [session.fecha!];
      for (let w = 1; w <= repeatWeeks; w++) {
        const d = new Date(session.fecha!);
        d.setDate(d.getDate() + 7 * w);
        dates.push(formatDateISO(d));
      }
      // Para grupos: un recurrencia_id compartido para que se rendericen como un solo bloque.
      const inserts = dates.flatMap((fecha) => {
        const groupId = grupo && memberIds.length > 1
          ? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
          : null;
        return memberIds.map((cid) => ({ ...base, fecha, client_id: cid, recurrencia_id: groupId }));
      });
      const { error } = await supabase.from("sessions").insert(inserts);
      if (error) toast.error(error.message); else toast.success(`Sesión creada${repeatWeeks > 0 ? ` (+${repeatWeeks} repeticiones)` : ""}`);
    } else {
      const { error } = await supabase.from("sessions").update({ ...base, client_id: clientId }).eq("id", session.id!);
      if (error) toast.error(error.message); else toast.success("Sesión actualizada");
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

          {isNew && (
            <div className="space-y-1.5">
              <Label>Repetir semanas</Label>
              <Input type="number" min={0} max={52} value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Incidencia / nota</Label>
            <Textarea value={incidencia} onChange={(e) => setIncidencia(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {!isNew && <Button variant="destructive" onClick={remove}>Eliminar</Button>}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>{isNew ? "Crear" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}