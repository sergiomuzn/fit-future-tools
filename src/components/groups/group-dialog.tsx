import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  supabase,
  type Group,
  type Client,
  type Session,
  DIAS_SEMANA,
  type GroupSchedule,
} from "@/lib/db";
import { toast } from "sonner";
import { formatNameTitle } from "@/lib/utils";

const EMPTY_SESSIONS: Session[] = [];

interface Props {
  open: boolean;
  onClose: () => void;
  group: Group | null; // null = new
}

export function GroupDialog({ open, onClose, group }: Props) {
  const qc = useQueryClient();
  const isNew = !group;
  const [nombre, setNombre] = useState("");
  const [capacidad, setCapacidad] = useState<number | "">(6);
  const [activo, setActivo] = useState(true);
  const [notas, setNotas] = useState("");

  // Stats data
  const { data: statsSessions = EMPTY_SESSIONS } = useQuery({
    queryKey: ["group_stats_sessions", group?.id],
    queryFn: async () => {
      if (!group?.id) return [] as Session[];
      const from = new Date();
      from.setMonth(from.getMonth() - 2);
      from.setDate(1);
      const iso = from.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("group_id", group.id)
        .gte("fecha", iso);
      return (data ?? []) as Session[];
    },
    enabled: open && !!group?.id,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*").order("nombre")).data as Client[] ?? [],
  });
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  useEffect(() => {
    if (!open) return;
    setNombre(group?.nombre ?? "");
    setCapacidad(group?.capacidad ?? 6);
    setActivo(group?.activo ?? true);
    setNotas(group?.notas ?? "");
  }, [open, group]);

  // Compute stats
  const stats = useMemo(() => {
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    // Sessions in prev month, counted only if realizada (or cancelada without no_contabilizar)
    const isCounted = (s: any) =>
      s.estado === "realizada" || (s.estado === "cancelada" && !s.no_contabilizar);

    const prevMonthSessions = statsSessions.filter((s: any) => {
      const d = new Date(s.fecha);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear && isCounted(s);
    });
    // Avg members per session date
    const byDate = new Map<string, Set<string>>();
    for (const s of prevMonthSessions as any[]) {
      if (!s.client_id) continue;
      const key = `${s.fecha}|${s.hora_inicio}`;
      if (!byDate.has(key)) byDate.set(key, new Set());
      byDate.get(key)!.add(s.client_id);
    }
    const sessionCounts = [...byDate.values()].map((set) => set.size);
    const avgPrev = sessionCounts.length
      ? sessionCounts.reduce((a, b) => a + b, 0) / sessionCounts.length
      : 0;

    // Top attendees last 2 months
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const attendance = new Map<string, number>();
    for (const s of statsSessions as any[]) {
      if (!s.client_id || !isCounted(s)) continue;
      const d = new Date(s.fecha);
      if (d < twoMonthsAgo) continue;
      attendance.set(s.client_id, (attendance.get(s.client_id) ?? 0) + 1);
    }
    const top = [...attendance.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, nombre: formatNameTitle(clientMap.get(id)?.nombre) ?? "?", count }));

    return { avgPrev, top };
  }, [statsSessions, clientMap]);

  async function save() {
    const name = nombre.trim();
    if (!name) { toast.error("Nombre requerido"); return; }
    const cap = typeof capacidad === "number" ? capacidad : Number(capacidad);
    if (!cap || cap < 1) { toast.error("Capacidad inválida"); return; }

    if (isNew) {
      const { error } = await supabase.from("groups").insert({
        nombre: name, capacidad: cap, activo, notas: notas || null,
      });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("groups").update({
        nombre: name, capacidad: cap, activo, notas: notas || null,
      }).eq("id", group!.id);
      if (error) { toast.error(error.message); return; }
    }

    toast.success(isNew ? "Grupo creado" : "Grupo guardado");
    qc.invalidateQueries({ queryKey: ["groups"] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onKeyDown={enterToSave(save)}>
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuevo grupo" : `Editar grupo · ${group?.nombre}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Funcional Lunes 18h" />
            </div>
            <div className="space-y-1.5">
              <Label>Capacidad (máx. clientes)</Label>
              <Input
                type="number"
                min={1}
                value={capacidad}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") { setCapacidad(""); return; }
                  const n = Number(v);
                  if (Number.isFinite(n)) setCapacidad(n);
                }}
                onBlur={() => {
                  if (capacidad === "" || (typeof capacidad === "number" && capacidad < 1)) setCapacidad(1);
                }}
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
            El horario de este grupo se define en la agenda al crear o editar la sesión grupal. Los clientes se añaden también desde la agenda al asignarlos a la sesión.
          </div>

          {!isNew && (
            <div className="rounded-md border bg-card/50 p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estadísticas</div>
              <div className="text-sm">
                Integrantes medios (mes anterior):{" "}
                <span className="font-semibold">{stats.avgPrev.toFixed(1)}</span>
              </div>
              <div className="text-sm">
                <div className="mb-1">Asistentes más frecuentes (últimos 2 meses):</div>
                {stats.top.length === 0 && <div className="text-xs text-muted-foreground">Sin datos aún.</div>}
                {stats.top.length > 0 && (
                  <ol className="space-y-0.5 pl-4 list-decimal">
                    {stats.top.map((t) => (
                      <li key={t.id} className="text-sm">{t.nombre} <span className="text-muted-foreground text-xs">· {t.count} sesiones</span></li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="grupo-activo" checked={activo} onCheckedChange={(v) => setActivo(!!v)} />
            <Label htmlFor="grupo-activo" className="cursor-pointer">Activo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function scheduleSummary(schedules: GroupSchedule[]): string {
  if (!schedules.length) return "—";
  return schedules
    .slice()
    .sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio))
    .map((s) => `${DIAS_SEMANA[s.dia_semana]} ${s.hora_inicio.slice(0, 5)}–${s.hora_fin.slice(0, 5)}`)
    .join(", ");
}