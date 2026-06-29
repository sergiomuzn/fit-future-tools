import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Session, type Trainer, type Client, type ClientBono, ESTADO_BG } from "@/lib/db";
import { HOUR_START, HOUR_END, SLOT_MIN, SLOT_PX, TOTAL_PX, pxToMin, pxToMinRaw, snapMin, minToTime, timeToMin, formatDateISO } from "./types";
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

  // reloj en vivo para la línea horaria
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const isToday =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();
  const nowMin = now.getHours() * 60 + now.getMinutes() - HOUR_START * 60;
  const nowTop = (nowMin / SLOT_MIN) * SLOT_PX;

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
    const m = snapMin(pxToMinRaw(y));
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

  // Resize existing
  const [resizing, setResizing] = useState<{ id: string; edge: "top" | "bottom"; startMin: number; endMin: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ startMin: number; endMin: number } | null>(null);

  useEffect(() => {
    function up() {
      if (moving && movePreview !== null) {
        const snapped = snapMin(movePreview);
        const newStart = minToTime(snapped);
        const newEnd = minToTime(snapped + moving.dur);
        const movingId = moving.id;
        qc.setQueryData<Session[]>(["sessions", isoDate], (old) =>
          (old ?? []).map((s) => (s.id === movingId ? { ...s, hora_inicio: newStart, hora_fin: newEnd } : s)),
        );
        supabase.from("sessions").update({ hora_inicio: newStart, hora_fin: newEnd }).eq("id", moving.id).then(({ error }) => {
          if (error) toast.error(error.message);
          qc.invalidateQueries({ queryKey: ["sessions"] });
        });
      }
      setMoving(null);
      setMovePreview(null);
      if (resizing && resizePreview) {
        const newStart = minToTime(snapMin(resizePreview.startMin));
        const newEnd = minToTime(snapMin(resizePreview.endMin));
        const resizingId = resizing.id;
        qc.setQueryData<Session[]>(["sessions", isoDate], (old) =>
          (old ?? []).map((s) => (s.id === resizingId ? { ...s, hora_inicio: newStart, hora_fin: newEnd } : s)),
        );
        supabase.from("sessions").update({ hora_inicio: newStart, hora_fin: newEnd }).eq("id", resizing.id).then(({ error }) => {
          if (error) toast.error(error.message);
          qc.invalidateQueries({ queryKey: ["sessions"] });
        });
      }
      setResizing(null);
      setResizePreview(null);
    }
    function move(e: MouseEvent) {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      if (moving) {
        const y = e.clientY - rect.top - moving.offset;
        setMovePreview(Math.max(0, snapMin(pxToMinRaw(y))));
      } else if (resizing) {
        const m = Math.max(0, snapMin(pxToMinRaw(e.clientY - rect.top)));
        if (resizing.edge === "top") {
          const newStart = Math.min(m, resizing.endMin - SLOT_MIN);
          setResizePreview({ startMin: newStart, endMin: resizing.endMin });
        } else {
          const newEnd = Math.max(m, resizing.startMin + SLOT_MIN);
          setResizePreview({ startMin: resizing.startMin, endMin: newEnd });
        }
      }
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [moving, movePreview, resizing, resizePreview, qc, isoDate]);

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
      <div className="h-full overflow-y-auto">
        <div className="flex" style={{ minHeight: TOTAL_PX }}>
          {/* time gutter (scrolls with sessions) */}
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
              {isToday && nowMin >= 0 && nowMin <= (HOUR_END - HOUR_START) * 60 && (
                <div
                  className="absolute right-1 -translate-y-1/2 rounded bg-destructive px-1 py-0.5 text-[10px] font-semibold text-destructive-foreground"
                  style={{ top: nowTop }}
                >
                  {String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}
                </div>
              )}
            </div>
          </div>

          {/* grid */}
          <div className="flex-1">
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

            {/* línea de tiempo actual */}
            {isToday && nowMin >= 0 && nowMin <= (HOUR_END - HOUR_START) * 60 && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-20"
                style={{ top: nowTop }}
              >
                <div className="h-px bg-destructive shadow-[0_0_4px_var(--color-destructive)]" />
                <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-destructive" />
              </div>
            )}

            {/* draft */}
            {draft && (
              <div
                className="absolute rounded-md bg-primary/30 border border-primary pointer-events-none flex items-start justify-center text-[11px] font-semibold text-primary"
                style={{
                  top: (draft.startMin / SLOT_MIN) * SLOT_PX,
                  height: ((draft.endMin - draft.startMin) / SLOT_MIN) * SLOT_PX,
                  left: 4,
                  right: 4,
                }}
              >
                <span className="mt-1 rounded bg-primary px-1.5 py-0.5 text-primary-foreground shadow-sm">
                  {minToTime(draft.startMin).slice(0,5)} – {minToTime(draft.endMin).slice(0,5)}
                </span>
              </div>
            )}

            {/* sessions */}
            {layout.map(({ session, col, cols }) => {
              const startMin = timeToMin(session.hora_inicio);
              const endMin = timeToMin(session.hora_fin);
              const widthPct = 88 / cols; // 88% total, deja 12% lateral para click-add
              const leftPct = 2 + col * widthPct;
              const isMoving = moving?.id === session.id;
              const isResizing = resizing?.id === session.id;
              const effStart = isResizing && resizePreview ? resizePreview.startMin
                : isMoving && movePreview !== null ? movePreview
                : startMin;
              const effEnd = isResizing && resizePreview ? resizePreview.endMin
                : isMoving && movePreview !== null ? movePreview + (moving!.dur)
                : endMin;
              const top = (effStart / SLOT_MIN) * SLOT_PX;
              const height = ((effEnd - effStart) / SLOT_MIN) * SLOT_PX;
              const client = session.client_id ? clientMap.get(session.client_id) : null;
              const trainer = session.trainer_id ? trainerMap.get(session.trainer_id) : null;
              const bono = session.client_id ? bonoMap.get(session.client_id) : null;
              // Renovación: futura sin bono o con <= 1 sesión disponible
              const isFuture = new Date(`${session.fecha}T${session.hora_fin}`) > new Date();
              const needsRenewal =
                isFuture &&
                session.estado === "reservada" &&
                session.client_id != null &&
                (!bono || bono.sesiones_disponibles <= 1);
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
                  <div
                    className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize z-10"
                    onMouseDown={(e) => {
                      if (paintTrainerId) return;
                      e.stopPropagation();
                      setResizing({ id: session.id, edge: "top", startMin, endMin });
                      setResizePreview({ startMin, endMin });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div
                    className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize z-10"
                    onMouseDown={(e) => {
                      if (paintTrainerId) return;
                      e.stopPropagation();
                      setResizing({ id: session.id, edge: "bottom", startMin, endMin });
                      setResizePreview({ startMin, endMin });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
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