import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session, type Trainer, type Client, colorEstadoFor, ESTADO_BG } from "@/lib/db";
import { formatDateISO } from "./types";
import { SessionDialog } from "./session-dialog";
import { cn } from "@/lib/utils";
import { sessionFillColor } from "@/lib/colors";
import { useCenterConfig, getDayScheduleFor } from "@/lib/center-schedule";
import { useServicios } from "@/lib/servicios";
import { abreviaturaServicio, sessionMainLabel } from "@/lib/session-label";
import { useBehaviorConfig } from "@/lib/behavior-config";

interface Props {
  date: Date;
  trainers: Trainer[];
  onSelectDay: (d: Date) => void;
}

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function MonthView({ date, trainers, onSelectDay }: Props) {
  const { colores, horario, specialsMap } = useCenterConfig();
  const mostrarAbrev = useBehaviorConfig().mostrarAbreviaturaServicio;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState<Partial<Session> | null>(null);

  const cells = useMemo(() => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const arr: { d: Date; outside: boolean }[] = [];
    for (let i = startOffset; i > 0; i--) {
      arr.push({ d: new Date(date.getFullYear(), date.getMonth(), 1 - i), outside: true });
    }
    for (let i = 1; i <= total; i++) arr.push({ d: new Date(date.getFullYear(), date.getMonth(), i), outside: false });
    while (arr.length % 7 !== 0) {
      const last = arr[arr.length - 1].d;
      const n = new Date(last);
      n.setDate(n.getDate() + 1);
      arr.push({ d: n, outside: true });
    }
    return arr;
  }, [date]);

  const from = formatDateISO(cells[0].d);
  const to = formatDateISO(cells[cells.length - 1].d);

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
  const { data: servicios = [] } = useServicios();
  const servicioCapMap = useMemo(
    () => new Map(servicios.map((s) => [s.slug, Math.max(1, s.capacidad_default ?? 1)])),
    [servicios],
  );
  const servicioAbrevMap = useMemo(
    () => new Map(servicios.map((s) => [s.slug, abreviaturaServicio(s.nombre, s.abreviatura)])),
    [servicios],
  );
  // Clientes apuntados por sesión de grupo (misma recurrencia + franja + fecha).
  const groupNamesMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of sessions) {
      if (s.recurrencia_id && s.ocupacion === 2 && s.client_id) {
        const key = `${s.fecha}|${s.recurrencia_id}|${s.hora_inicio}|${s.hora_fin}`;
        const nombre = clientMap.get(s.client_id)?.nombre ?? "?";
        const arr = m.get(key);
        if (arr) arr.push(nombre); else m.set(key, [nombre]);
      }
    }
    return m;
  }, [sessions, clientMap]);
  // Servicio del bloque de grupo: alguna sesión del grupo puede no tenerlo guardado.
  const groupSlugMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) {
      if (!s.recurrencia_id || s.ocupacion !== 2) continue;
      const slug = (s as any).servicio_slug as string | null | undefined;
      if (!slug) continue;
      m.set(`${s.fecha}|${s.recurrencia_id}|${s.hora_inicio}|${s.hora_fin}`, slug);
    }
    return m;
  }, [sessions]);
  // Clientes apuntados a una misma franja de un servicio con varias plazas.
  const slotNamesMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of sessions) {
      if (s.ocupacion === 2 || !s.client_id || s.estado === "cancelada") continue;
      const key = `${s.fecha}|${(s as any).servicio_slug ?? ""}|${s.hora_inicio}`;
      const nombre = clientMap.get(s.client_id)?.nombre ?? "?";
      const arr = m.get(key);
      if (arr) arr.push(nombre); else m.set(key, [nombre]);
    }
    return m;
  }, [sessions, clientMap]);


  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>();
    const seen = new Set<string>();
    for (const s of sessions) {
      if (s.recurrencia_id && s.ocupacion === 2) {
        const key = `${s.fecha}|${s.recurrencia_id}|${s.hora_inicio}|${s.hora_fin}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const arr = m.get(s.fecha);
      if (arr) arr.push(s); else m.set(s.fecha, [s]);
    }
    return m;
  }, [sessions]);

  const todayKey = formatDateISO(new Date());

  return (
    <>
      <div className="h-full overflow-y-auto overflow-x-hidden p-3">
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-muted-foreground">
          {DOW.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map(({ d, outside }) => {
            const key = formatDateISO(d);
            const list = byDay.get(key) ?? [];
            const closed = getDayScheduleFor(d, horario, specialsMap) === null;
            return (
              <div
                key={key}
                className={cn(
                  "min-h-28 rounded-md border p-1 flex flex-col gap-0.5",
                  outside && "opacity-45",
                  closed && "bg-destructive/10 border-destructive/30",
                  key === todayKey && "ring-1 ring-primary",
                )}
              >
                <button
                  onClick={() => onSelectDay(d)}
                  className="self-start rounded px-1 text-xs font-medium hover:bg-accent"
                  title="Ver día"
                >
                  {d.getDate()}
                </button>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {list.slice(0, 4).map((s) => {
                    const isGroup = s.ocupacion === 2;
                    const slug =
                      (isGroup
                        ? groupSlugMap.get(`${s.fecha}|${s.recurrencia_id}|${s.hora_inicio}|${s.hora_fin}`)
                        : null) ??
                      (s as any).servicio_slug ??
                      "";
                    const nombres = isGroup
                      ? (groupNamesMap.get(`${s.fecha}|${s.recurrencia_id}|${s.hora_inicio}|${s.hora_fin}`) ?? [])
                      : (slotNamesMap.get(`${s.fecha}|${slug}|${s.hora_inicio}`) ??
                        (s.client_id ? [clientMap.get(s.client_id)?.nombre ?? "?"] : []));
                    const ocupados = isGroup ? nombres.length : (s.client_id ? 1 : 0);
                    const plazas = servicioCapMap.get(slug) ?? (isGroup ? Math.max(2, ocupados) : 1);
                    // Regla común: 1 plaza → cliente; 2-3 → nombres; 4+ → "N personas".
                    const name = sessionMainLabel(plazas, nombres) || s.titulo || "";
                    const abrev = mostrarAbrev ? (servicioAbrevMap.get(slug) ?? "") : "";
                    const fill = sessionFillColor(colores, s as any, colorEstadoFor(s));
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setDialogSession(s); setDialogOpen(true); }}
                        className={cn(
                          "truncate rounded px-1 text-left text-[10px] leading-tight",
                          fill ? "text-white" : isGroup ? "bg-state-grupo text-state-grupo-fg" : ESTADO_BG[colorEstadoFor(s)],
                        )}
                        style={{ backgroundColor: fill ?? undefined }}
                        title={`${s.hora_inicio.slice(0, 5)} ${abrev ? `${abrev} · ` : ""}${name} (${ocupados}/${plazas})`}
                      >
                        {s.hora_inicio.slice(0, 5)}{" "}
                        {abrev && <span className="font-semibold">{abrev}</span>}
                        {abrev && " · "}
                        {name.toUpperCase()} ({ocupados}/{plazas})

                      </button>
                    );
                  })}
                  {list.length > 4 && (
                    <button
                      onClick={() => onSelectDay(d)}
                      className="px-1 text-left text-[10px] text-muted-foreground hover:underline"
                    >
                      +{list.length - 4} más
                    </button>
                  )}
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