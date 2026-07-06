import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientPicker } from "@/components/clients/client-picker";
import {
  supabase,
  type Group,
  type GroupSchedule,
  type Client,
  type Session,
  DIAS_SEMANA,
  DIAS_SEMANA_LONG,
} from "@/lib/db";
import { toast } from "sonner";

const EMPTY_SCHEDULES: GroupSchedule[] = [];
const EMPTY_MEMBERS: { client_id: string }[] = [];
const EMPTY_SESSIONS: Session[] = [];

interface Props {
  open: boolean;
  onClose: () => void;
  group: Group | null; // null = new
}

interface DraftSchedule {
  id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export function GroupDialog({ open, onClose, group }: Props) {
  const qc = useQueryClient();
  const isNew = !group;
  const [nombre, setNombre] = useState("");
  const [capacidad, setCapacidad] = useState(6);
  const [activo, setActivo] = useState(true);
  const [notas, setNotas] = useState("");
  const [schedules, setSchedules] = useState<DraftSchedule[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const { data: existingSchedules = EMPTY_SCHEDULES } = useQuery({
    queryKey: ["group_schedules", group?.id],
    queryFn: async () => {
      if (!group?.id) return [] as GroupSchedule[];
      const { data } = await supabase.from("group_schedules").select("*").eq("group_id", group.id).order("dia_semana");
      return (data ?? []) as GroupSchedule[];
    },
    enabled: open && !!group?.id,
  });

  const { data: existingMembers = EMPTY_MEMBERS } = useQuery({
    queryKey: ["group_members", group?.id],
    queryFn: async () => {
      if (!group?.id) return [] as { client_id: string }[];
      const { data } = await supabase.from("group_members").select("client_id").eq("group_id", group.id);
      return (data ?? []) as { client_id: string }[];
    },
    enabled: open && !!group?.id,
  });

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

  useEffect(() => {
    if (!open) return;
    setSchedules(
      existingSchedules.map((s) => ({
        id: s.id,
        dia_semana: s.dia_semana,
        hora_inicio: s.hora_inicio.slice(0, 5),
        hora_fin: s.hora_fin.slice(0, 5),
      })),
    );
  }, [open, existingSchedules]);

  useEffect(() => {
    if (!open) return;
    setMemberIds(existingMembers.map((m) => m.client_id));
  }, [open, existingMembers]);

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
      .map(([id, count]) => ({ id, nombre: clientMap.get(id)?.nombre ?? "?", count }));

    return { avgPrev, top };
  }, [statsSessions, clientMap]);

  async function save() {
    const name = nombre.trim();
    if (!name) { toast.error("Nombre requerido"); return; }
    if (!capacidad || capacidad < 1) { toast.error("Capacidad inválida"); return; }

    let groupId = group?.id;
    if (isNew) {
      const { data, error } = await supabase.from("groups").insert({
        nombre: name, capacidad, activo, notas: notas || null,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      groupId = data.id;
    } else {
      const { error } = await supabase.from("groups").update({
        nombre: name, capacidad, activo, notas: notas || null,
      }).eq("id", group!.id);
      if (error) { toast.error(error.message); return; }
    }
    if (!groupId) return;

    // Sync schedules: delete existing, insert current
    await supabase.from("group_schedules").delete().eq("group_id", groupId);
    const validSchedules = schedules.filter((s) => s.hora_inicio && s.hora_fin && s.hora_fin > s.hora_inicio);
    if (validSchedules.length) {
      await supabase.from("group_schedules").insert(
        validSchedules.map((s) => ({
          group_id: groupId!,
          dia_semana: s.dia_semana,
          hora_inicio: `${s.hora_inicio}:00`,
          hora_fin: `${s.hora_fin}:00`,
        })),
      );
    }

    // Sync members: delete existing, insert current
    await supabase.from("group_members").delete().eq("group_id", groupId);
    if (memberIds.length) {
      await supabase.from("group_members").insert(
        memberIds.map((cid) => ({ group_id: groupId!, client_id: cid })),
      );
    }

    toast.success(isNew ? "Grupo creado" : "Grupo guardado");
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["group_schedules"] });
    qc.invalidateQueries({ queryKey: ["group_members"] });
    onClose();
  }

  function addSchedule() {
    setSchedules((prev) => [...prev, { dia_semana: 1, hora_inicio: "18:00", hora_fin: "19:00" }]);
  }

  function addMember(id: string | null) {
    if (!id) return;
    if (memberIds.includes(id)) { toast.info("Ese cliente ya está en el grupo"); return; }
    if (memberIds.length >= capacidad) { toast.error(`Capacidad máxima: ${capacidad}`); return; }
    setMemberIds((prev) => [...prev, id]);
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
              <Label>Capacidad</Label>
              <Input type="number" min={1} value={capacidad} onChange={(e) => setCapacidad(Number(e.target.value) || 1)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Franjas horarias fijas</Label>
              <Button size="sm" variant="outline" onClick={addSchedule}><Plus className="h-3.5 w-3.5 mr-1" />Añadir franja</Button>
            </div>
            {schedules.length === 0 && (
              <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">Sin franjas configuradas.</div>
            )}
            {schedules.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Día</Label>
                  <Select value={String(s.dia_semana)} onValueChange={(v) => setSchedules((p) => p.map((x, idx) => idx === i ? { ...x, dia_semana: Number(v) } : x))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIAS_SEMANA_LONG.map((d, idx) => <SelectItem key={idx} value={String(idx)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Inicio</Label>
                  <Input type="time" step={300} value={s.hora_inicio} onChange={(e) => setSchedules((p) => p.map((x, idx) => idx === i ? { ...x, hora_inicio: e.target.value } : x))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fin</Label>
                  <Input type="time" step={300} value={s.hora_fin} onChange={(e) => setSchedules((p) => p.map((x, idx) => idx === i ? { ...x, hora_fin: e.target.value } : x))} />
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSchedules((p) => p.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Miembros ({memberIds.length}/{capacidad})</Label>
            <ClientPicker value={null} onChange={(id) => addMember(id)} />
            <div className="flex flex-wrap gap-1.5">
              {memberIds.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 text-xs bg-accent rounded-full pl-2 pr-1 py-0.5">
                  {clientMap.get(id)?.nombre ?? "?"}
                  <button type="button" onClick={() => setMemberIds((p) => p.filter((x) => x !== id))} className="rounded-full hover:bg-background p-0.5">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {memberIds.length === 0 && (
                <span className="text-xs text-muted-foreground">Sin miembros aún.</span>
              )}
            </div>
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