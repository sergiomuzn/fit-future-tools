import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Session, type Trainer, type Client, type ClientBono, ESTADO_BG } from "@/lib/db";
import { HOUR_START, HOUR_END, SLOT_MIN, SLOT_PX, TOTAL_PX, pxToMin, minToTime, timeToMin, formatDateISO } from "./types";
import { SessionDialog } from "./session-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  date: Date;
  trainers: Trainer[];
  paintTrainerId: string | null;
}

interface DraftSession {
  startMin: number;
  endMin: number;
}

interface LayoutInfo {
  session: Session;
  col: number;
  cols: number;
}

function computeLayout(sessions: Session[]): LayoutInfo[] {
  const sorted = [...sessions].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const result: LayoutInfo[] = [];
  // Greedy column assignment within overlap groups
  const groups: Session[][] = [];
  let current: Session[] = [];
  let currentEnd = "";
  for (const s of sorted) {
    if (current.length === 0 || s.hora_inicio < currentEnd) {
      current.push(s);
      if (s.hora_fin > currentEnd) currentEnd = s.hora_fin;
    } else {
      groups.push(current);
      current = [s];
      currentEnd = s.hora_fin;
    }
  }
  if (current.length) groups.push(current);

  for (const g of groups) {
    const cols: { end: string }[] = [];
    const assignments = new Map<string, number>();
    for (const s of g) {
      let placed = -1;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i].end <= s.hora_inicio) {
          cols[i] = { end: s.hora_fin };
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        cols.push({ end: s.hora_fin });
        placed = cols.length - 1;
      }
      assignments.set(s.id, placed);
    }
    const colCount = cols.length;
    for (const s of g) {
      result.push({ session: s, col: assignments.get(s.id)!, cols: colCount });
    }
  }
  return result;
}

export function AgendaGrid({ date, trainers, paintTrainerId }: Props) {
  const qc = useQueryClient();
  const isoDate = formatDateISO(date);
  const gridRef = useRef<HTMLDivElement>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", isoDate],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*").eq("fecha", isoDate).order("hora_inicio");
      return (data ?? []) as Session[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").order("nombre");
      return (data ?? []) as Client[];
    },
  });

  const { data: bonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => {
      const { data } = await supabase.from("client_bonos").select("*");
      return (data ?? []) as ClientBono[];
    },
  });

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);
  const bonoMap = useMemo(() => {
    const m = new Map<string, ClientBono>();
    for (const b of bonos) {
      const existing = m.get(b.client_id);
      if (!existing || (b.activo && !existing.activo)) m.set(b.client_id, b);
    }
    return m;
  }, [bonos]);

  const layout = useMemo(() => computeLayout(sessions), [sessions]);

  // Drag-to-create
  const [draft, setDraft] = useState<DraftSession | null>(null);
  const dragStartRef = useRef<number | null>(null);

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-session]")) return;
    const rect = gridRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const m = Math.max(0, pxToMin(y));
    dragStartRef.current = m;
    setDraft({ startMin: m, endMin: m + 30 });
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (dragStartRef.current === null) return;
    const rect = gridRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const m = pxToMin(y);
    const start = dragStartRef.current;
    const end = Math.max(m, start + 15);
    setDraft({ startMin: start, endMin: end });
  }
  function onMouseUp() {
    if (dragStartRef.current !== null && draft) {
      setDialogSession({
        fecha: isoDate,
        hora_inicio: minToTime(draft.startMin),
        hora_fin: minToTime(draft.endMin),
        trainer_id: paintTrainerId,
        estado: "reservada",
        ocupacion: 1,
      });
      setDialogOpen(true);
    }
    dragStartRef.current = null;
    setDraft(null);
  }

  // Drag-to-move existing
  const [moving, setMoving] = useState<{ id: string; offset: number; dur: number } | null>(null);
  const [movePreview, setMovePreview] = useState<number | null>(null);

  useEffect(() => {
    function up() {
      if (moving && movePreview !== null) {
        const newStart = minToTime(movePreview);
        const newEnd = minToTime(movePreview + moving.dur);
        supabase.from("sessions").update({ hora_inicio: newStart, hora_fin: newEnd }).eq("id", moving.id).then(({ error }) => {
          if (error) toast.error(error.message);
          qc.invalidateQueries({ queryKey: ["sessions"] });
        });
      }
      setMoving(null);
      setMovePreview(null);
    }
    function move(e: MouseEvent) {
      if (!moving || !gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top - moving.offset;
      setMovePreview(Math.max(0, pxToMin(y)));
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [moving, movePreview, qc]);

  // Dialog
  const [dialogSession, setDialogSession] = useState<Partial<Session> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Click on a session — if paintMode, just assign trainer
  async function handleSessionClick(s: Session, e: React.MouseEvent) {
    if (paintTrainerId) {
      e.stopPropagation();
      await supabase.from("sessions").update({ trainer_id: paintTrainerId }).eq("id", s.id);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      return;
    }
    setDialogSession(s);
    setDialogOpen(true);
  }

  // Auto-realizada para sesiones pasadas en estado 'reservada'
  useEffect(() => {
    const now = new Date();
    for (const s of sessions) {
      if (s.estado === "reservada") {
        const end = new Date(`${s.fecha}T${s.hora_fin}`);
        if (end < now) {
          supabase.from("sessions").update({ estado: "realizada" }).eq("id", s.id).then(() => {
            qc.invalidateQueries({ queryKey: ["sessions"] });
            qc.invalidateQueries({ queryKey: ["client_bonos"] });
          });
        }
      }
    }
  }, [sessions, qc]);

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {/* time gutter */}
        <div className="w-14 shrink-0 border-r bg-card/40 text-xs text-muted-foreground">
          <div style={{ height: TOTAL_PX, position: "relative" }}>
            {hours.map((h) => (
              <div
                key={h}
                style={{ position: "absolute", top: (h - HOUR_START) * (60 / SLOT_MIN) * SLOT_PX - 6 }}
                className="w-full text-right pr-2"
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        {/* grid */}
        <div className="flex-1 overflow-y-auto">
          <div
            ref={gridRef}
            className="relative w-full select-none"
            style={{ height: TOTAL_PX }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          >
            {/* hour lines */}
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border/60"
                style={{ top: (h - HOUR_START) * (60 / SLOT_MIN) * SLOT_PX }}
              />
            ))}
            {/* half-hour lines */}
            {hours.map((h) => (
              <div
                key={`half-${h}`}
                className="absolute left-0 right-0 border-t border-border/20"
                style={{ top: ((h - HOUR_START) * (60 / SLOT_MIN) + 2) * SLOT_PX }}
              />
            ))}

            {/* draft */}
            {draft && (
              <div
                className="absolute rounded-md bg-primary/30 border border-primary pointer-events-none"
                style={{
                  top: (draft.startMin / SLOT_MIN) * SLOT_PX,
                  height: ((draft.endMin - draft.startMin) / SLOT_MIN) * SLOT_PX,
                  left: 4,
                  right: 4,
                }}
              />
            )}

            {/* sessions */}
            {layout.map(({ session, col, cols }) => {
              const startMin = timeToMin(session.hora_inicio);
              const endMin = timeToMin(session.hora_fin);
              const widthPct = 88 / cols; // 88% total, deja 12% lateral para click-add
              const leftPct = 2 + col * widthPct;
              const isMoving = moving?.id === session.id;
              const top = isMoving && movePreview !== null
                ? (movePreview / SLOT_MIN) * SLOT_PX
                : (startMin / SLOT_MIN) * SLOT_PX;
              const height = ((endMin - startMin) / SLOT_MIN) * SLOT_PX;
              const client = session.client_id ? clientMap.get(session.client_id) : null;
              const trainer = session.trainer_id ? trainerMap.get(session.trainer_id) : null;
              const bono = session.client_id ? bonoMap.get(session.client_id) : null;
              // Renovación: futura con <= 1 sesión disponible
              const isFuture = new Date(`${session.fecha}T${session.hora_fin}`) > new Date();
              const needsRenewal = isFuture && bono && bono.sesiones_disponibles <= 1 && session.estado === "reservada";
              const estadoForColor = needsRenewal ? "renovacion" : session.estado;
              return (
                <div
                  key={session.id}
                  data-session
                  className={cn(
                    "absolute rounded-md px-2 py-1 text-xs shadow-sm cursor-pointer overflow-hidden border border-black/5 transition-shadow hover:shadow-md",
                    ESTADO_BG[estadoForColor],
                  )}
                  style={{
                    top,
                    height,
                    left: `${leftPct}%`,
                    width: `${widthPct - 0.5}%`,
                    opacity: isMoving ? 0.7 : 1,
                  }}
                  onMouseDown={(e) => {
                    if (paintTrainerId) return;
                    e.stopPropagation();
                    const rect = gridRef.current!.getBoundingClientRect();
                    const offset = e.clientY - rect.top - top;
                    setMoving({ id: session.id, offset, dur: endMin - startMin });
                  }}
                  onClick={(e) => handleSessionClick(session, e)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="font-medium truncate">{client?.nombre ?? "Sin cliente"}</div>
                    {trainer && (
                      <div className="shrink-0 rounded bg-black/15 px-1 text-[10px] font-semibold">
                        {trainer.iniciales}
                      </div>
                    )}
                  </div>
                  <div className="opacity-80 text-[10px]">
                    {session.hora_inicio.slice(0,5)}–{session.hora_fin.slice(0,5)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SessionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        session={dialogSession}
        trainers={trainers}
      />
    </>
  );
}