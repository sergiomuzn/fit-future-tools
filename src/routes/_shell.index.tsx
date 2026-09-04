import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase, type Trainer } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { AgendaGrid } from "@/components/agenda/agenda-grid";
import { WeekView, startOfWeek } from "@/components/agenda/week-view";
import { MonthView } from "@/components/agenda/month-view";
import { DisponibilidadView } from "@/components/agenda/disponibilidad-view";
import { InstanciasView } from "@/components/agenda/instancias-view";
import { HistorialPanel } from "@/components/sesiones/historial-panel";
import { abreviatura, slotColorClasses } from "@/components/agenda/slots-week-grid";
import { useServicios } from "@/lib/servicios";
import { useAgendaDate } from "@/lib/agenda-context";
import { cn } from "@/lib/utils";
import { useCenterConfig, getDayScheduleFor, ymd } from "@/lib/center-schedule";
import { servicioColorOf } from "@/lib/colors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";


export const Route = createFileRoute("/_shell/")({
  validateSearch: (search: { tab?: string; servicio?: string }): { tab?: string; servicio?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    servicio: typeof search.servicio === "string" ? search.servicio : undefined,
  }),
  component: AgendaPage,
});

const DOW = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function AgendaPage() {
  const { tab: tabParam, servicio: servicioParam } = Route.useSearch();
  const { date, setDate, agendaTabRequest } = useAgendaDate();
  const [paintTrainerId, setPaintTrainerId] = useState<string | null>(null);
  const trainerStripRef = useRef<HTMLDivElement>(null);
  const [canScrollTrainersLeft, setCanScrollTrainersLeft] = useState(false);
  const [canScrollTrainersRight, setCanScrollTrainersRight] = useState(false);
  const [view, setView] = useState<"dia" | "semana" | "mes" | "disponibilidad" | "historial">("dia");
  useEffect(() => {
    if (agendaTabRequest > 0) {
      setView((v) => (v === "disponibilidad" || v === "historial" ? "dia" : v));
    }
  }, [agendaTabRequest]);
  const [dispView, setDispView] = useState<"dia" | "semana">("semana");
  const [reservasModo, setReservasModo] = useState<"vista" | "edicion">("edicion");
  const { data: servicios = [] } = useServicios();
  const [servicioSlug, setServicioSlug] = useState<string>("__all");
  // Acceso directo desde Servicios → "Ver reservas de este servicio".
  useEffect(() => {
    if (tabParam === "reservas") setView("disponibilidad");
    if (servicioParam) setServicioSlug(servicioParam);
  }, [tabParam, servicioParam]);
  const activeServicio = servicioSlug === "__all" ? "" : servicioSlug;
  const [paintServicio, setPaintServicio] = useState<string | null>(null);
  const { horario, specialsMap, colores } = useCenterConfig();
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

  useEffect(() => {
    const strip = trainerStripRef.current;
    if (!strip) return;

    const updateScrollButtons = () => {
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      setCanScrollTrainersLeft(strip.scrollLeft > 1);
      setCanScrollTrainersRight(maxScroll > 1 && strip.scrollLeft < maxScroll - 1);
    };

    updateScrollButtons();
    const observer = new ResizeObserver(updateScrollButtons);
    observer.observe(strip);
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [trainers.length]);

  function scrollTrainers(direction: -1 | 1) {
    const strip = trainerStripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(strip.clientWidth - 40, 40), behavior: "smooth" });
  }

  function shift(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
  }

  function shiftView(dir: number) {
    if (view === "disponibilidad") return shift(dispView === "semana" ? dir * 7 : dir);
    if (view === "dia") return shift(dir);
    if (view === "semana") return shift(dir * 7);
    setDate(new Date(date.getFullYear(), date.getMonth() + dir, 1));
  }

  const weekStart = startOfWeek(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  function rangoSemana(d1: Date, d2: Date) {
    const mes1 = MONTHS[d1.getMonth()];
    const mes2 = MONTHS[d2.getMonth()];
    const año1 = d1.getFullYear();
    const año2 = d2.getFullYear();
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (año1 !== año2) {
      return `${d1.getDate()} ${cap(mes1)} ${año1} – ${d2.getDate()} ${cap(mes2)} ${año2}`;
    }
    if (d1.getMonth() !== d2.getMonth()) {
      return `${d1.getDate()} ${cap(mes1)} – ${d2.getDate()} ${cap(mes2)} ${año2}`;
    }
    return `${d1.getDate()}-${d2.getDate()} ${cap(mes1)} ${año2}`;
  }

  const headerLabel =
    view === "dia"
      ? `${DOW[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
      : view === "semana"
        ? rangoSemana(weekStart, weekEnd)
        : view === "mes"
          ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
          : view === "historial"
            ? ""
            : dispView === "dia" && reservasModo !== "vista"
              ? DOW[date.getDay()]
              : "";
  /** En modo vista la fecha se muestra sobre los días de la semana. */
  const vistaLabel =
    view === "disponibilidad" && reservasModo === "vista"
      ? dispView === "dia"
        ? DOW[date.getDay()]
        : rangoSemana(weekStart, weekEnd)
      : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-30 bg-muted px-4 pt-3 pb-0 min-h-[60px] overflow-x-hidden flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <Tabs
            value={view === "disponibilidad" ? "disponibilidad" : view === "historial" ? "historial" : "agenda"}
            onValueChange={(v) =>
              setView(v === "disponibilidad" ? "disponibilidad" : v === "historial" ? "historial" : "dia")
            }
          >
            <TabsList className="h-8">
              <TabsTrigger value="agenda" className="text-xs tab-active-background">Agenda</TabsTrigger>
              <TabsTrigger value="disponibilidad" className="text-xs tab-active-background">Reservas</TabsTrigger>
              <TabsTrigger value="historial" className="text-xs tab-active-background">Historial</TabsTrigger>

            </TabsList>
          </Tabs>

          {view === "disponibilidad" && (
            <div className="flex items-center self-center rounded-md border bg-background p-0.5 h-9 my-1">
              <button
                type="button"
                onClick={() => setReservasModo("vista")}
                className={cn(
                  "h-full whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors",
                  reservasModo === "vista"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Modo vista
              </button>
              <button
                type="button"
                onClick={() => setReservasModo("edicion")}
                className={cn(
                  "h-full whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors",
                  reservasModo === "edicion"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Modo edición
              </button>
            </div>
          )}

          <div className="flex min-h-9 items-center gap-3 pb-2">
            {view !== "historial" && (
              <Select
                value={view === "disponibilidad" ? dispView : view}
                onValueChange={(v) => {
                  if (view === "disponibilidad") setDispView(v as "dia" | "semana");
                  else setView(v as typeof view);
                }}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {view === "disponibilidad" ? (
                    <>
                      <SelectItem value="dia">Día</SelectItem>
                      <SelectItem value="semana">Semana</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="dia">Día</SelectItem>
                      <SelectItem value="semana">Semana</SelectItem>
                      <SelectItem value="mes">Mes</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            )}

            {view !== "historial" &&
              (view !== "disponibilidad" || (dispView === "dia" && reservasModo !== "vista")) && (

              <>
                {view !== "disponibilidad" && (
                  <Button variant="outline" size="sm" onClick={() => setDate(new Date(new Date().setHours(0,0,0,0)))}>Hoy</Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => shiftView(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => shiftView(1)}><ChevronRight className="h-4 w-4" /></Button>
              </>
            )}

            <div className="font-display text-lg font-semibold capitalize whitespace-nowrap">
              {headerLabel}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-2">
          {view === "disponibilidad" && (
             <Select value={servicioSlug} onValueChange={setServicioSlug}>
              <SelectTrigger className="h-8 w-[180px] shrink-0 text-xs bg-background">
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
          {view === "dia" && (
            <div className="flex h-9 items-center gap-1.5 whitespace-nowrap">
              <span className="mr-1 shrink-0 text-xs">Pintar entrenador:</span>
              {canScrollTrainersLeft && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full"
                  onClick={() => scrollTrainers(-1)}
                  aria-label="Ver entrenadores anteriores"
                  title="Ver entrenadores anteriores"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <div
                ref={trainerStripRef}
                onScroll={() => {
                  const strip = trainerStripRef.current;
                  if (!strip) return;
                  const maxScroll = strip.scrollWidth - strip.clientWidth;
                  setCanScrollTrainersLeft(strip.scrollLeft > 1);
                  setCanScrollTrainersRight(maxScroll > 1 && strip.scrollLeft < maxScroll - 1);
                }}
                className="flex w-40 shrink-0 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {sortedTrainers.map((t) => (
                  <Button
                    key={t.id}
                    variant="outline"
                    size="icon"
                    onClick={() => setPaintTrainerId(paintTrainerId === t.id ? null : t.id)}
                    className={cn(
                      "h-8 w-8 shrink-0 rounded-full border-2 text-xs font-semibold transition-all",
                      paintTrainerId === t.id
                        ? "scale-105 border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                        : "border-border bg-background text-foreground opacity-75 hover:opacity-100",
                    )}
                    title={t.nombre}
                    aria-label={`Pintar entrenador ${t.nombre}`}
                    aria-pressed={paintTrainerId === t.id}
                  >
                    {t.iniciales}
                  </Button>
                ))}
              </div>
              {canScrollTrainersRight && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full"
                  onClick={() => scrollTrainers(1)}
                  aria-label="Ver más entrenadores"
                  title="Ver más entrenadores"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
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

      <div className={cn("flex-1 bg-background", view === "historial" ? "overflow-auto" : "overflow-hidden")}>
        {view === "historial" ? (
          <HistorialPanel />
        ) : view === "dia" ? (
          <AgendaGrid date={date} trainers={trainers} paintTrainerId={paintTrainerId} />
        ) : view === "semana" ? (
          <WeekView date={date} trainers={trainers} onSelectDay={(d) => { setDate(d); setView("dia"); }} />
        ) : view === "mes" ? (
          <MonthView date={date} trainers={trainers} onSelectDay={(d) => { setDate(d); setView("dia"); }} />
        ) : reservasModo === "vista" ? (
          <InstanciasView
            servicioSlug={activeServicio}
            view={dispView}
            date={date}
            paintServicioSlug={paintServicio}
            label={vistaLabel}
            onNavigate={shift}
          />
        ) : (
          <DisponibilidadView
            servicioSlug={activeServicio}
            view={dispView}
            date={date}
            paintServicioSlug={paintServicio}
          />
        )}
      </div>

      {view !== "historial" && (
      <footer className="border-t bg-card px-4 py-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {servicios.map((s) => (
          <Legend key={s.slug} hex={servicioColorOf(colores, s.slug) ?? undefined} label={s.nombre} />
        ))}
        <Legend color="bg-state-prueba" label="Prueba" />
        <Legend color="bg-state-cancelada" label="Cancelada" />
        <Legend color="bg-state-renovacion" label="Renovación" />
        
      </footer>
      )}
    </div>
  );
}

function Legend({ color, hex, label }: { color?: string; hex?: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${color ?? ""}`} style={hex ? { backgroundColor: hex } : undefined} />
      {label}
    </div>
  );
}