import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  selected: Date;
  onSelect: (d: Date) => void;
  month: Date;
  onMonthChange: (d: Date) => void;
}

const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre",
];

export function MiniCalendar({ selected, onSelect, month, onMonthChange }: Props) {
  const today = new Date();
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startDow = (first.getDay() + 6) % 7; // Lunes = 0
    const cells: { date: Date; outside: boolean }[] = [];
    // Días del mes anterior para rellenar primera semana
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(month.getFullYear(), month.getMonth(), -i);
      cells.push({ date: d, outside: true });
    }
    for (let d = 1; d <= last.getDate(); d++) {
      cells.push({ date: new Date(month.getFullYear(), month.getMonth(), d), outside: false });
    }
    // Rellenar hasta completar última semana con días del mes siguiente
    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (startDow + last.getDate()) + 1;
      cells.push({
        date: new Date(month.getFullYear(), month.getMonth() + 1, nextDay),
        outside: true,
      });
    }
    return cells;
  }, [month]);

  function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-xs font-medium capitalize">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground mb-1">
        {DOW.map((d) => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(({ date: d, outside }, i) => (
          <button
            key={i}
            onClick={() => {
              onSelect(d);
              if (outside) onMonthChange(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            className={cn(
              "h-7 text-xs rounded-md flex items-center justify-center transition-colors",
              sameDay(d, selected) && "bg-primary text-primary-foreground font-semibold",
              !sameDay(d, selected) && sameDay(d, today) && "ring-1 ring-primary/40 font-semibold",
              !sameDay(d, selected) && "hover:bg-accent",
              outside && !sameDay(d, selected) && "text-muted-foreground/40",
            )}
          >
            {d.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
}
