import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session, type Trainer, type Client, colorEstadoFor } from "@/lib/db";
import { HOUR_START, HOUR_END, SLOT_MIN, SLOT_PX, TOTAL_PX, timeToMin, formatDateISO } from "./types";
import { SessionDialog } from "./session-dialog";
import { cn } from "@/lib/utils";

interface Props {
  date: Date;
  trainers: Trainer[];
  onSelectDay: (d: Date) => void;
}

const DOW_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const off = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - off);
  return r;
}

function layoutDay(sessions: Session[]) {
  const sorted = [...sessions].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || a.id.localeCompare(b.id));
  const out: { session: Session; col: number; cols: number }[] = [];
  let group: Session[] = [];
  let end = "";
  const flush = () => {
    if (!group.length) return;
    const cols: string[] = [];
    const assign = new Map<string, number>();
    for (const s of group) {
      let placed = cols.findIndex((e) => e <= s.hora_inicio);
      if (placed === -1) { cols.push(s.hora_fin); placed = cols.length - 1; }
      else cols[placed] = s.hora_fin;
      assign.set(s.id, placed);
    }
    for (const s of group) out.push({ session: s, col: assign.get(s.id)!, cols: cols.length });
    group = [];
  };
  for (const s of sorted) {
    if (group.length === 0 || s.hora_inicio < end) {
      group.push(s);
      if (s.hora_fin > end) end = s.hora_fin;
    } else {
      flush();
      group = [s];
      end = s.hora_fin;
    }
  }
  flush();
  return out;
}

export function WeekView({ date, trainers, onSelectDay }: Props) {
  const weekStart = useMemo(() => startOfWeek(date), [date]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart],
  );
  const from = formatDateISO(days[0]);
  const to = formatDateISO(days[6]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState<Partial<Session> | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-range", from, to],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*").gte("fecha", from).lte("fecha", to).order("hora_inicio");
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
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);

  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) {
      // Colapsa sesiones de grupo (mismo recurrencia_id + franja) en una tarjeta
      const arr = m.get(s.fecha);
      if (arr) arr.push(s); else m.set(s.fecha, [s]);
    }
    for (const [k, arr] of m) {
      const seen = new Set<string>();
      m.set(
        k,
        arr.filter((s) => {
          if (s.recurrencia_id && s.ocupacion === 2) {
            const key = `${s.recurrencia_id}|${s.hora_inicio}|${s.hora_fin}`;
            if (seen.has(key)) return false;
            seen.add(key);
          }
          return true;
        }),
      );
    }
    return m;
  }, [sessions]);

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  const todayKey = formatDateISO(new Date());

  return (
    <>
      <div className="h-full overflow-y-auto overflow-x-hidden">
        <div className="flex min-w-[860px]">
          {/* gutter */}
          <div className="w-14 shrink-0">
            <div className="sticky top-0 z-20 h-10 border-b bg-background" />
            <div className="relative text-[10px] text-muted-foreground" style={{ height: TOTAL_PX }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute w-full pr-2 text-right"
                  style={{ top: (h - HOUR_START) * (60 / SLOT_MIN) * SLOT_PX - 6 }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {days.map((d) => {
            const key = formatDateISO(d);
            const daySessions = byDay.get(key) ?? [];
            return (
              <div key={key} className="flex-1 min-w-[110px] border-l">
                <button
                  onClick={() => onSelectDay(d)}
                  className={cn(
                    "sticky top-0 z-20 h-10 w-full border-b bg-background text-xs font-medium hover:bg-accent",
                    key === todayKey && "text-primary",
                  )}
                >
                  <span className="capitalize">{DOW_SHORT[(d.getDay() + 6) % 7]}</span> {d.getDate()}
                </button>
                <div className="relative" style={{ height: TOTAL_PX }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-border/70"
                      style={{ top: (h - HOUR_START) * (60 / SLOT_MIN) * SLOT_PX }}
                    />
                  ))}
                  {layoutDay(daySessions).map(({ session, col, cols }) => {
                    const startMin = timeToMin(session.hora_inicio);
                    const endMin = timeToMin(session.hora_fin);
                    const top = (startMin / SLOT_MIN) * SLOT_PX;
                    const height = Math.max(((endMin - startMin) / SLOT_MIN) * SLOT_PX - 2, 10);
                    const w = 100 / cols;
                    const isGroup = session.ocupacion === 2;
                    const trainer = session.trainer_id ? trainerMap.get(session.trainer_id) : null;
                    const name = session.titulo ?? (session.client_id ? clientMap.get(session.client_id)?.nombre : null) ?? (isGroup ? "Grupo" : "");
                    return (
                      <button
                        key={session.id}
                        onClick={() => { setDialogSession(session); setDialogOpen(true); }}
                        className={cn(
                          "absolute overflow-hidden rounded px-1 text-left text-[10px] leading-tight shadow-sm border border-black/5",
                          isGroup ? "bg-state-grupo text-state-grupo-fg" : ESTADO_BG[colorEstadoFor(session)],
                        )}
                        style={{ top, height, left: `calc(${col * w}% + 1px)`, width: `calc(${w}% - 2px)` }}
                        title={`${session.hora_inicio.slice(0, 5)} ${name}`}
                      >
                        <div className="font-semibold">{session.hora_inicio.slice(0, 5)}</div>
                        {height > 22 && <div className="truncate">{name.toUpperCase()}</div>}
                        {trainer && height > 34 && <div className="truncate opacity-90">{trainer.iniciales}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
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