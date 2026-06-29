import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, type Client, type Trainer, type Session, type SesionEstado, ESTADO_LABEL } from "@/lib/db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [ocupacion, setOcupacion] = useState(1);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [search, setSearch] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-search"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").order("nombre");
      return (data ?? []) as Client[];
    },
  });

  useEffect(() => {
    if (!open) return;
    setClientId(session?.client_id ?? null);
    setTrainerId(session?.trainer_id ?? null);
    setEstado((session?.estado as SesionEstado) ?? "reservada");
    setIncidencia(session?.incidencia ?? "");
    setOcupacion(session?.ocupacion ?? 1);
    setRepeatWeeks(0);
    setSearch("");
  }, [open, session]);

  const filtered = useMemo(
    () => clients.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase())),
    [clients, search],
  );

  async function save() {
    if (!session) return;
    const base = {
      client_id: clientId,
      trainer_id: trainerId,
      fecha: session.fecha!,
      hora_inicio: session.hora_inicio!,
      hora_fin: session.hora_fin!,
      estado,
      ocupacion,
      incidencia: incidencia || null,
    };
    // Auto-realizada si la sesión es pasada
    const now = new Date();
    const sessionEnd = new Date(`${session.fecha}T${session.hora_fin}`);
    if (sessionEnd < now && base.estado === "reservada") base.estado = "realizada";

    if (isNew) {
      const inserts = [base];
      if (repeatWeeks > 0) {
        for (let w = 1; w <= repeatWeeks; w++) {
          const d = new Date(session.fecha!);
          d.setDate(d.getDate() + 7 * w);
          inserts.push({ ...base, fecha: formatDateISO(d) });
        }
      }
      const { error } = await supabase.from("sessions").insert(inserts);
      if (error) toast.error(error.message); else toast.success(`Sesión creada${repeatWeeks > 0 ? ` (+${repeatWeeks} repeticiones)` : ""}`);
    } else {
      const { error } = await supabase.from("sessions").update(base).eq("id", session.id!);
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nueva sesión" : "Editar sesión"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {session.fecha} · {session.hora_inicio?.slice(0,5)} – {session.hora_fin?.slice(0,5)}
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-32 overflow-y-auto rounded-md border">
              {filtered.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">Sin resultados</div>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClientId(c.id)}
                  className={`w-full text-left px-2 py-1.5 text-sm hover:bg-accent ${clientId === c.id ? "bg-accent font-medium" : ""}`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ocupación</Label>
              <Select value={String(ocupacion)} onValueChange={(v) => setOcupacion(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 (individual/pareja)</SelectItem>
                  <SelectItem value="2">2 (grupal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isNew && (
              <div className="space-y-1.5">
                <Label>Repetir semanas</Label>
                <Input type="number" min={0} max={52} value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))} />
              </div>
            )}
          </div>

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