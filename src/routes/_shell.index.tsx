import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase, type Trainer } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { AgendaGrid } from "@/components/agenda/agenda-grid";
import { WeekView, startOfWeek } from "@/components/agenda/week-view";
import { MonthView } from "@/components/agenda/month-view";
import { DisponibilidadView } from "@/components/agenda/disponibilidad-view";
import { abreviatura, slotColorClasses } from "@/components/agenda/slots-week-grid";
import { useServicios } from "@/lib/servicios";
import { useAgendaDate } from "@/lib/agenda-context";
import { cn } from "@/lib/utils";
import { useCenterConfig, getDayScheduleFor, ymd } from "@/lib/center-schedule";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_shell/")({
  component: AgendaPage,
});

const DOW = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function AgendaPage() {
  const { date, setDate } = useAgendaDate();
  const [paintTrainerId, setPaintTrainerId] = useState<string | null>(null);
  const [view, setView] = useState<"dia" | "semana" | "mes" | "disponibilidad">("dia");
  const [dispView, setDispView] = useState<"dia" | "semana">("semana");
  const { data: servicios = [] } = useServicios();
  const [servicioSlug, setServicioSlug] = useState<string>("__all");
  const activeServicio = servicioSlug === "__all" ? "" : servicioSlug;
  const [paintServicio, setPaintServicio] = useState<string | null>(null);
  const { horario, specialsMap } = useCenterConfig();
  const sched = getDayScheduleFor(date, horario, specialsMap);
  const special = specialsMap.get(ymd(date));

  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("*").eq("activo", true).order("nombre");
      return (data ?? []) as Trainer[];
    },
  });

  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
  const { data: monthCounts = {} } = useQuery({
    queryKey: ["trainer-month-counts", monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("trainer_id")
        .gte("fecha", monthStart)
        .lte("fecha", monthEnd)
        .not("trainer_id", "is", null);
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as { trainer_id: string | null }[]) {
        if (!r.trainer_id) continue;
        counts[r.trainer_id] = (counts[r.trainer_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const sortedTrainers = [...trainers].sort((a, b) => {
    const diff = (monthCounts[b.id] ?? 0) - (monthCounts[a.id] ?? 0);
    if (diff !== 0) return diff;
    return a.nombre.localeCompare(b.nombre);
  });

  function shift(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
  }

  function shiftView(dir: number) {
    if (view === "disponibilidad") return shift(dir);
    if (view === "dia") return shift(dir);
    if (view === "semana") return shift(dir * 7);
    setDate(new Date(date.getFullYear(), date.getMonth() + dir, 1));
  }

  const weekStart = startOfWeek(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const headerLabel =
    view === "dia"
      ? `${DOW[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
      : view === "semana"
        ? `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
        : view === "mes"
          ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
          : dispView === "dia"
            ? DOW[date.getDay()]
            : "Horario disponible";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-30 bg-muted px-4 pt-3 pb-0 flex items-end justify-between gap-3">
        <div className="flex items-end gap-3 pb-2">
          <Tabs
            value={view === "disponibilidad" ? "disponibilidad" : "agenda"}
            onValueChange={(v) => setView(v === "disponibilidad" ? "disponibilidad" : "dia")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="agenda" className="text-xs">Agenda</TabsTrigger>
              <TabsTrigger value="disponibilidad" className="text-xs">Horario disponible</TabsTrigger>
            </TabsList>
          </Tabs>
          {(view !== "disponibilidad" || dispView === "dia") && (
            <>
              {view !== "disponibilidad" && (
                <Button variant="outline" size="sm" onClick={() => setDate(new Date(new Date().setHours(0,0,0,0)))}>Hoy</Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => shiftView(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => shiftView(1)}><ChevronRight className="h-4 w-4" /></Button>
            </>
          )}
          <div className="font-display text-lg font-semibold capitalize">
            {headerLabel}
          </div>
          {view !== "disponibilidad" ? (
            <Select value={view} onValueChange={(v) => setView(v as typeof view)}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">Día</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mes</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select value={dispView} onValueChange={(v) => setDispView(v as "dia" | "semana")}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">Día</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2 pb-2">
          {view === "disponibilidad" && (
            <Select value={servicioSlug} onValueChange={setServicioSlug}>
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue placeholder="Selecciona un servicio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los servicios</SelectItem>
                {servicios.map((s) => (
                  <SelectItem key={s.id} value={s.slug}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {view === "disponibilidad" && servicioSlug === "__all" && (
            <>
              <span className="text-xs mr-1">Pintar servicio:</span>
              {servicios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPaintServicio(paintServicio === s.slug ? null : s.slug)}
                  className={cn(
                    "h-8 w-8 rounded-full text-xs font-semibold border-2 transition-all",
                    slotColorClasses(s.slug),
                    paintServicio === s.slug
                      ? "border-primary scale-110"
                      : "border-transparent opacity-60",
                  )}
                  title={s.nombre}
                >
                  {abreviatura(s.nombre)}
                </button>
              ))}
            </>
          )}
          {view === "dia" && <span className="text-xs mr-1">Pintar entrenador:</span>}
          {view === "dia" && sortedTrainers.map((t) => (
            <button
              key={t.id}
              onClick={() => setPaintTrainerId(paintTrainerId === t.id ? null : t.id)}
                className={cn(
                "h-8 w-8 rounded-full text-xs font-semibold border-2 transition-all",
                paintTrainerId === t.id
                  ? "border-primary scale-110 bg-primary text-white"
                  : "border-border bg-muted text-black dark:text-slate-100",
              )}
              title={t.nombre}
            >
              {t.iniciales}
            </button>
          ))}
        </div>
      </header>

        {view === "dia" && paintTrainerId && (
        <div className="bg-primary/90 text-primary-foreground text-xs font-medium px-4 py-1.5 border-b">
          Modo pintar activo · pincha sobre las sesiones para asignarles este entrenador.
        </div>
      )}

      {view === "dia" && sched === null && (
        <div className="bg-destructive/15 text-white text-xs font-medium px-4 py-1.5 border-b">
          {special?.etiqueta ? `${special.etiqueta} · ` : ""}Festivo · Centro cerrado
        </div>
      )}
      {view === "dia" && sched && special?.tipo === "horario_especial" && (
        <div className="bg-amber-500/15 text-white text-xs font-medium px-4 py-1.5 border-b">
          Horario especial: {special.hora_apertura?.slice(0,5)}–{special.hora_cierre?.slice(0,5)}
          {special.etiqueta ? ` · ${special.etiqueta}` : ""}
        </div>
      )}

      {view === "disponibilidad" && paintServicio && servicioSlug === "__all" && (
        <div className="bg-primary/90 text-primary-foreground text-xs font-medium px-4 py-1.5 border-b">
          Modo pintar activo · los huecos que crees serán de{" "}
          {servicios.find((s) => s.slug === paintServicio)?.nombre ?? paintServicio}.
        </div>
      )}

      {view === "disponibilidad" && (
        <div className="bg-muted/60 text-xs text-muted-foreground px-4 py-2 border-b space-y-0.5">
          <p className="font-medium text-foreground">
            Horario semanal visible para los clientes con acceso a cada servicio.
          </p>
          <p>
            Cada cliente solo verá los huecos de los servicios que tenga contratados. Arrastra sobre el
            calendario para crear un hueco disponible · pincha en un hueco para editarlo o eliminarlo.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {view === "dia" ? (
          <AgendaGrid date={date} trainers={trainers} paintTrainerId={paintTrainerId} />
        ) : view === "semana" ? (
          <WeekView date={date} trainers={trainers} onSelectDay={(d) => { setDate(d); setView("dia"); }} />
        ) : view === "mes" ? (
          <MonthView date={date} trainers={trainers} onSelectDay={(d) => { setDate(d); setView("dia"); }} />
        ) : (
          <DisponibilidadView
            servicioSlug={activeServicio}
            view={dispView}
            date={date}
            paintServicioSlug={paintServicio}
          />
        )}
      </div>

      <footer className="border-t bg-card px-4 py-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <Legend color="bg-state-reservada" label="Reservada" />
        <Legend color="bg-state-realizada" label="Realizada" />
        <Legend color="bg-state-prueba" label="Prueba" />
        <Legend color="bg-state-cancelada" label="Cancelada" />
        <Legend color="bg-state-renovacion" label="Renovación" />
        <Legend color="bg-state-grupo" label="Grupo" />
      </footer>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      {label}
    </div>
  );
}