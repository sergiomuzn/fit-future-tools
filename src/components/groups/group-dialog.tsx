import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { useConfirm } from "@/components/confirm-dialog";

const EMPTY_SESSIONS: Session[] = [];

interface Props {
  open: boolean;
  onClose: () => void;
  group: Group | null; // null = new
}

export function GroupDialog({ open, onClose, group }: Props) {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const isNew = !group;
  const [nombre, setNombre] = useState("");
  const [capacidad, setCapacidad] = useState<number | "">(6);
  const [activo, setActivo] = useState(true);
  const [notas, setNotas] = useState("");
  const [acceso, setAcceso] = useState(true);
  const [tab, setTab] = useState("datos");

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

  // All past sessions for history tab (fetch broad window)
  const { data: historySessions = EMPTY_SESSIONS } = useQuery({
    queryKey: ["group_history_sessions", group?.id],
    queryFn: async () => {
      if (!group?.id) return [] as Session[];
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("group_id", group.id)
        .order("fecha", { ascending: false });
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
    setAcceso(group?.acceso_clientes ?? true);
  }, [open, group]);

  // Compute stats
  const stats = useMemo(() => {
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);
    const todayIso = now.toISOString().slice(0, 10);

    // Sessions in prev month, counted only if realizada (or cancelada without no_contabilizar)
    const isCounted = (s: any) =>
      s.estado === "realizada" || (s.estado === "cancelada" && !s.no_contabilizar);

    const prevMonthSessions = statsSessions.filter(
      (s: any) => s.fecha >= sinceIso && s.fecha <= todayIso && isCounted(s),
    );
    // Avg members per session date
    const byDate = new Map<string, Set<string>>();
    for (const s of prevMonthSessions as any[]) {
      const key = `${s.fecha}|${s.hora_inicio}`;
      if (!byDate.has(key)) byDate.set(key, new Set());
      if (s.client_id) byDate.get(key)!.add(s.client_id);
    }
    const sessionCounts = [...byDate.values()].map((set) => set.size);
    const avgPrev = sessionCounts.length
      ? sessionCounts.reduce((a, b) => a + b, 0) / sessionCounts.length
      : 0;

    // Top attendees: previous month only
    const attendance = new Map<string, number>();
    for (const s of prevMonthSessions as any[]) {
      if (!s.client_id) continue;
      attendance.set(s.client_id, (attendance.get(s.client_id) ?? 0) + 1);
    }
    const top = [...attendance.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({ id, nombre: formatNameTitle(clientMap.get(id)?.nombre) ?? "?", count }));

    return { avgPrev, top };
  }, [statsSessions, clientMap]);

  // Build history: group by fecha+hora_inicio, past dates only, newest first (leftmost is most recent — we render in a row and user scrolls left for older)
  const historyBlocks = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const map = new Map<string, { fecha: string; hora: string; clientIds: string[] }>();
    for (const s of historySessions as Session[]) {
      if (!s.fecha || s.fecha >= todayIso) continue;
      const hora = (s.hora_inicio ?? "").slice(0, 5);
      const key = `${s.fecha}|${hora}`;
      if (!map.has(key)) map.set(key, { fecha: s.fecha, hora, clientIds: [] });
      if (s.client_id) map.get(key)!.clientIds.push(s.client_id);
    }
    return [...map.values()].sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return b.hora.localeCompare(a.hora);
    });
  }, [historySessions]);

  async function save() {
    const name = nombre.trim();
    if (!name) { toast.error("Nombre requerido"); return; }
    const cap = typeof capacidad === "number" ? capacidad : Number(capacidad);
    if (!cap || cap < 1) { toast.error("Capacidad inválida"); return; }

    if (isNew) {
      const { error } = await supabase.from("groups").insert({
        nombre: name, capacidad: cap, activo, notas: notas || null, acceso_clientes: acceso,
      });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("groups").update({
        nombre: name, capacidad: cap, activo, notas: notas || null, acceso_clientes: acceso,
      }).eq("id", group!.id);
      if (error) { toast.error(error.message); return; }
    }

    toast.success(isNew ? "Grupo creado" : "Grupo guardado");
    qc.invalidateQueries({ queryKey: ["groups"] });
    onClose();
  }

  async function removeGroup() {
    if (!group) return;
    const ok = await confirm({
      title: `¿Eliminar grupo «${group.nombre}»?`,
      description: "Esta acción no se puede deshacer.",
    });
    if (!ok) return;
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Grupo eliminado");
    qc.invalidateQueries({ queryKey: ["groups"] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {confirmDialog}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden" onKeyDown={enterToSave(save)}>
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuevo grupo" : `Editar grupo · ${group?.nombre}`}</DialogTitle>
        </DialogHeader>
        {isNew ? (
          <GroupForm
            nombre={nombre} setNombre={setNombre}
            capacidad={capacidad} setCapacidad={setCapacidad}
            notas={notas} setNotas={setNotas}
            activo={activo} setActivo={setActivo}
            acceso={acceso} setAcceso={setAcceso}
            isNew={isNew} stats={stats}
          />
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="min-w-0 w-full">
            <TabsList>
              <TabsTrigger value="datos">Datos</TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>
            <TabsContent value="datos" className="mt-4">
              <GroupForm
                nombre={nombre} setNombre={setNombre}
                capacidad={capacidad} setCapacidad={setCapacidad}
                notas={notas} setNotas={setNotas}
                activo={activo} setActivo={setActivo}
                acceso={acceso} setAcceso={setAcceso}
                isNew={isNew} stats={stats}
              />
            </TabsContent>
            <TabsContent value="historial" className="mt-4 min-w-0">
              <GroupHistory
                blocks={historyBlocks}
                capacidad={typeof capacidad === "number" ? capacidad : Number(capacidad) || 6}
                clientMap={clientMap}
              />
            </TabsContent>
          </Tabs>
        )}
        <DialogFooter>
          <div className="flex gap-2 justify-end">
            {!isNew && tab !== "historial" && (
              <Button variant="destructive" onClick={removeGroup}>Eliminar grupo</Button>
            )}
            <Button variant="outline" onClick={onClose}>{!isNew && tab === "historial" ? "Cerrar" : "Cancelar"}</Button>
            {(isNew || tab !== "historial") && <Button onClick={save}>Guardar</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupForm({
  nombre, setNombre, capacidad, setCapacidad, notas, setNotas, activo, setActivo, acceso, setAcceso, isNew, stats,
}: {
  nombre: string; setNombre: (v: string) => void;
  capacidad: number | ""; setCapacidad: (v: number | "") => void;
  notas: string; setNotas: (v: string) => void;
  activo: boolean; setActivo: (v: boolean) => void;
  acceso: boolean; setAcceso: (v: boolean) => void;
  isNew: boolean;
  stats: { avgPrev: number; top: { id: string; nombre: string; count: number }[] };
}) {
  return (
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

          {!isNew && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border bg-card p-3 flex flex-col items-center justify-center text-center min-h-[120px]">
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Integrantes medios</div>
                <div className="text-3xl font-bold">{stats.avgPrev.toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">últimos 30 días</div>
              </div>
              <div className="rounded-md border bg-card p-3 flex flex-col min-h-[120px]">
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 text-center">Asistentes más frecuentes</div>
                {stats.top.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Sin datos aún.</div>
                )}
                {stats.top.length > 0 && (
                  <ol className="space-y-1 pl-4 list-decimal text-sm flex-1">
                    {stats.top.map((t) => (
                      <li key={t.id}>{t.nombre} <span className="text-muted-foreground text-xs">· {t.count} sesiones</span></li>
                    ))}
                  </ol>
                )}
                <div className="text-[10px] text-muted-foreground text-center mt-1">últimos 30 días</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox id="grupo-activo" checked={activo} onCheckedChange={(v) => setActivo(!!v)} />
            <Label htmlFor="grupo-activo" className="cursor-pointer">Activo</Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="grupo-acceso" checked={acceso} onCheckedChange={(v) => setAcceso(!!v)} className="mt-0.5" />
            <div>
              <Label htmlFor="grupo-acceso" className="cursor-pointer">Acceso de clientes</Label>
              <p className="text-[11px] text-muted-foreground">
                Si se desactiva, el grupo queda con acceso restringido y no aparece en el portal de clientes.
              </p>
            </div>
          </div>
        </div>
  );
}

function GroupHistory({
  blocks,
  capacidad,
  clientMap,
}: {
  blocks: { fecha: string; hora: string; clientIds: string[] }[];
  capacidad: number;
  clientMap: Map<string, Client>;
}) {
  if (blocks.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-8">Sin entrenamientos pasados.</div>;
  }
  // Oldest on the left, newest on the right; view starts scrolled to the newest.
  const ordered = [...blocks].reverse();
  const pinRight = (el: HTMLDivElement | null) => {
    if (!el) return;
    const snap = () => { el.scrollLeft = el.scrollWidth; };
    snap();
    requestAnimationFrame(snap);
    setTimeout(snap, 60);
  };
  return (
    <div ref={pinRight} className="w-full max-w-full overflow-x-auto overflow-y-hidden px-1 pb-2">
      <div className="flex gap-2 min-w-min">
        {ordered.map((b) => {
          const d = new Date(`${b.fecha}T00:00:00`);
          const dow = DIAS_SEMANA[d.getDay()];
          const fechaStr = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
          return (
            <div key={`${b.fecha}|${b.hora}`} className="shrink-0 w-40 rounded-md border bg-card p-2 flex flex-col">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{dow}</div>
              <div className="text-sm font-medium">{fechaStr}</div>
              <div className="text-[11px] text-muted-foreground mb-1.5">{b.hora} · {b.clientIds.length}/{capacidad}</div>
              <ul className="space-y-0.5 text-xs">
                {b.clientIds.map((cid, i) => (
                  <li key={`${cid}-${i}`} className="truncate">
                    {formatNameTitle(clientMap.get(cid)?.nombre) ?? "—"}
                  </li>
                ))}
                {b.clientIds.length === 0 && <li className="text-muted-foreground italic">Sin integrantes</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
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