import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Paintbrush } from "lucide-react";
import { DayEditorDialog } from "./day-editor-dialog";
import { useCenterConfig, getDayScheduleFor, openMinutesOfDay, ymd, type SpecialDay } from "@/lib/center-schedule";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DOW = ["L","M","X","J","V","S","D"]; // lunes primero

export function SpecialDaysCalendar() {
  const [view, setView] = useState<"anual" | "mensual">("mensual");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paintMode, setPaintMode] = useState(false);

  const { specialsMap, horario, invalidate } = useCenterConfig();

  async function openDay(d: Date) {
    if (paintMode) {
      const key = ymd(d);
      const existing = specialsMap.get(key);
      if (existing?.tipo === "cerrado") {
        const { error } = await supabase.from("special_days").delete().eq("fecha", key);
        if (error) return toast.error(error.message);
      } else {
        const { error } = await supabase.from("special_days").upsert({
          fecha: key,
          tipo: "cerrado",
          hora_apertura: null,
          hora_cierre: null,
          etiqueta: null,
        });
        if (error) return toast.error(error.message);
      }
      invalidate();
      return;
    }
    setDialogDate(d);
    setDialogOpen(true);
  }

  const existing = dialogDate ? specialsMap.get(ymd(dialogDate)) ?? null : null;

  const operativos = useMemo(() => {
    const total = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= total; d++) {
      if (openMinutesOfDay(new Date(year, month, d), horario, specialsMap) > 0) count++;
    }
    return count;
  }, [year, month, horario, specialsMap]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant={view === "mensual" ? "default" : "outline"} size="sm" onClick={() => setView("mensual")}>Mensual</Button>
          <Button variant={view === "anual" ? "default" : "outline"} size="sm" onClick={() => setView("anual")}>Anual</Button>
          <Button
            variant={paintMode ? "default" : "outline"}
            size="sm"
            onClick={() => setPaintMode((p) => !p)}
            className={cn(paintMode && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            <Paintbrush className="h-4 w-4 mr-1" />
            Festivo/cerrado
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {view === "mensual" ? (
            <>
              <Button variant="ghost" size="icon" onClick={() => {
                if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
              }}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="font-medium min-w-[10rem] text-center">{MONTHS[month]} {year}</div>
              <Button variant="ghost" size="icon" onClick={() => {
                if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
              }}><ChevronRight className="h-4 w-4" /></Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={() => setYear(year - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="font-medium min-w-[6rem] text-center">{year}</div>
              <Button variant="ghost" size="icon" onClick={() => setYear(year + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </>
          )}
        </div>
      </div>

      {paintMode && (
        <div className="bg-destructive/10 text-destructive text-xs font-medium px-3 py-1.5 rounded-md border border-destructive/30">
          Modo pintar festivos activo · pincha en los días para marcarlos o desmarcarlos como festivo/cerrado.
        </div>
      )}

      {view === "mensual" ? (
        <>
          <div className="text-sm text-muted-foreground">
            Días operativos este mes: <span className="font-semibold text-foreground">{operativos}</span>
          </div>
          <MonthGrid year={year} month={month} onClickDay={openDay} specialsMap={specialsMap} horario={horario} />
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {MONTHS.map((name, i) => (
            <div key={i} className="border rounded-md p-2">
              <div className="text-xs font-semibold mb-1 text-center">{name}</div>
              <MonthGrid year={year} month={i} mini onClickDay={openDay} specialsMap={specialsMap} horario={horario} />
            </div>
          ))}
        </div>
      )}

      <DayEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        date={dialogDate}
        existing={existing}
        onSaved={invalidate}
      />
    </div>
  );
}

function MonthGrid({
  year, month, mini, onClickDay, specialsMap, horario,
}: {
  year: number; month: number; mini?: boolean;
  onClickDay: (d: Date) => void;
  specialsMap: Map<string, SpecialDay>;
  horario: import("@/lib/center-schedule").HorarioBase;
}) {
  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // lunes = 0
    const total = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const today = new Date();
  const todayKey = ymd(today);

  return (
    <div>
      <div className={cn("grid grid-cols-7 gap-1 mb-1 text-center text-muted-foreground", mini ? "text-[9px]" : "text-xs")}>
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = ymd(d);
          const sp = specialsMap.get(key);
          const sched = getDayScheduleFor(d, horario, specialsMap);
          const closed = sched === null;
          const isToday = key === todayKey;
          return (
            <button
              key={i}
              onClick={() => onClickDay(d)}
              className={cn(
                "border rounded-md text-left transition-colors hover:bg-accent flex flex-col items-start",
                mini ? "h-6 px-1 text-[10px]" : "min-h-14 p-1.5 text-xs",
                closed && "bg-destructive/15 border-destructive/40",
                sp?.tipo === "horario_especial" && "bg-amber-500/15 border-amber-500/40",
                isToday && "ring-1 ring-primary",
              )}
              title={sp?.etiqueta ?? undefined}
            >
              <div className="font-medium">{d.getDate()}</div>
              {!mini && sp && (
                <div className="text-[10px] leading-tight mt-0.5">
                  {sp.tipo === "cerrado"
                    ? (sp.etiqueta ? sp.etiqueta.trim().split(/\s+/).slice(0, 2).join(" ") : "")
                    : `${sp.hora_apertura?.slice(0,5)}–${sp.hora_cierre?.slice(0,5)}`}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}