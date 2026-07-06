import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase, type Trainer } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { AgendaGrid } from "@/components/agenda/agenda-grid";
import { useAgendaDate } from "@/lib/agenda-context";
import { cn } from "@/lib/utils";
import { useCenterConfig, getDayScheduleFor, ymd } from "@/lib/center-schedule";

export const Route = createFileRoute("/_shell/")({
  component: AgendaPage,
});

const DOW = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function AgendaPage() {
  const { date, setDate } = useAgendaDate();
  const [paintTrainerId, setPaintTrainerId] = useState<string | null>(null);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-30 border-b bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setDate(new Date(new Date().setHours(0,0,0,0)))}>Hoy</Button>
          <Button variant="ghost" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          <div className="font-display text-lg font-semibold capitalize">
            {DOW[date.getDay()]}, {date.getDate()} de {MONTHS[date.getMonth()]} {date.getFullYear()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Pintar entrenador:</span>
          {sortedTrainers.map((t) => (
            <button
              key={t.id}
              onClick={() => setPaintTrainerId(paintTrainerId === t.id ? null : t.id)}
              className={cn(
                "h-8 w-8 rounded-full text-xs font-semibold border-2 transition-all",
                paintTrainerId === t.id ? "border-primary scale-110 bg-primary text-primary-foreground" : "border-border bg-muted",
              )}
              title={t.nombre}
            >
              {t.iniciales}
            </button>
          ))}
          {paintTrainerId && (
            <Button variant="ghost" size="sm" onClick={() => setPaintTrainerId(null)}>Salir</Button>
          )}
        </div>
      </header>

      {paintTrainerId && (
        <div className="bg-primary/10 text-primary text-xs px-4 py-1.5 border-b">
          Modo pintar activo · pincha sobre las sesiones para asignarles este entrenador.
        </div>
      )}

      {sched === null && (
        <div className="bg-destructive/15 text-destructive text-xs font-medium px-4 py-1.5 border-b">
          {special?.etiqueta ? `${special.etiqueta} · ` : ""}Festivo · Centro cerrado
        </div>
      )}
      {sched && special?.tipo === "horario_especial" && (
        <div className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-medium px-4 py-1.5 border-b">
          Horario especial: {special.hora_apertura?.slice(0,5)}–{special.hora_cierre?.slice(0,5)}
          {special.etiqueta ? ` · ${special.etiqueta}` : ""}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <AgendaGrid date={date} trainers={trainers} paintTrainerId={paintTrainerId} />
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