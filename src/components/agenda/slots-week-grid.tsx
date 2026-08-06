import { useMemo, useRef, useState } from "react";
import { HOUR_START, HOUR_END, SLOT_MIN, SLOT_PX, TOTAL_PX, minToTime, pxToMin, timeToMin } from "./types";
import { DIAS_ORDEN, hhmm, type ServiceSlot } from "@/lib/service-slots";
import { cn } from "@/lib/utils";

const DOW_SHORT: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 0: "Dom" };
const DOW_LONG: Record<number, string> = {
  1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 0: "Domingo",
};

interface LayoutInfo {
  slot: ServiceSlot;
  col: number;
  cols: number;
  span: number;
}

/** Abreviatura de dos letras para un nombre de servicio. */
function abreviatura(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  return nombre.trim().slice(0, 2).toUpperCase();
}

/** Reparte los huecos solapados en columnas (misma lógica que la agenda). */
function computeLayout(slots: ServiceSlot[]): LayoutInfo[] {
  const sorted = [...slots].sort((a, b) => {
    const t = a.hora_inicio.localeCompare(b.hora_inicio);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
  const result: LayoutInfo[] = [];
  const groups: ServiceSlot[][] = [];
  let current: ServiceSlot[] = [];
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
      const c = assignments.get(s.id)!;
      let span = 1;
      for (let k = c + 1; k < colCount; k++) {
        const collides = g.some(
          (o) =>
            assignments.get(o.id) === k &&
            o.hora_inicio < s.hora_fin &&
            o.hora_fin > s.hora_inicio,
        );
        if (collides) break;
        span++;
      }
      result.push({ slot: s, col: c, cols: colCount, span });
    }
  }
  return result;
}

interface Props {
  slots: ServiceSlot[];
  nombreServicio?: (slug: string) => string;
  editable?: boolean;
  onCreate?: (dia: number, inicio: string, fin: string) => void;
  onSelect?: (slot: ServiceSlot) => void;
  /** Días a mostrar. Por defecto la semana completa. */
  dias?: readonly number[];
}

/** Calendario semanal (misma rejilla que la agenda) para huecos disponibles. */
export function SlotsWeekGrid({ slots, nombreServicio, editable = false, onCreate, onSelect, dias = DIAS_ORDEN }: Props) {
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  const [draft, setDraft] = useState<{ dia: number; from: number; to: number } | null>(null);
  const dragRef = useRef<{ dia: number; anchor: number } | null>(null);
  const single = dias.length === 1;

  const byDia = useMemo(() => {
    const m = new Map<number, LayoutInfo[]>();
    for (const d of dias) {
      m.set(d, computeLayout(slots.filter((s) => s.dia_semana === d)));
    }
    return m;
  }, [slots, dias]);

  function offsetMin(e: React.MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(pxToMin(e.clientY - rect.top), (HOUR_END - HOUR_START) * 60));
  }

  return (
    <div className="h-full overflow-auto select-none">
      <div className={cn("flex", !single && "min-w-[860px]")}>
        <div className="w-14 shrink-0">
          <div className="sticky top-0 z-20 h-10 border-b bg-card" />
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

        {dias.map((dia) => (
          <div key={dia} className="flex-1 min-w-[110px] border-l">
            <div className="sticky top-0 z-20 h-10 w-full border-b bg-card text-xs font-medium flex items-center justify-center">
              {single ? DOW_LONG[dia] : DOW_SHORT[dia]}
            </div>
            <div
              className={cn("relative", editable && "cursor-crosshair")}
              style={{ height: TOTAL_PX }}
              onMouseDown={(e) => {
                if (!editable) return;
                const min = offsetMin(e, e.currentTarget);
                dragRef.current = { dia, anchor: min };
                setDraft({ dia, from: min, to: min + SLOT_MIN });
              }}
              onMouseMove={(e) => {
                if (!editable || !dragRef.current || dragRef.current.dia !== dia) return;
                const min = offsetMin(e, e.currentTarget);
                const a = dragRef.current.anchor;
                setDraft({ dia, from: Math.min(a, min), to: Math.max(a + SLOT_MIN, min) });
              }}
              onMouseUp={() => {
                if (!editable || !dragRef.current || !draft) return;
                dragRef.current = null;
                if (draft.to > draft.from) onCreate?.(dia, minToTime(draft.from), minToTime(draft.to));
                setDraft(null);
              }}
              onMouseLeave={() => {
                if (dragRef.current?.dia === dia) {
                  dragRef.current = null;
                  setDraft(null);
                }
              }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/70"
                  style={{ top: (h - HOUR_START) * (60 / SLOT_MIN) * SLOT_PX }}
                />
              ))}

              {(byDia.get(dia) ?? []).map(({ slot: s, col, cols, span }) => {
                const startMin = timeToMin(s.hora_inicio);
                const endMin = timeToMin(s.hora_fin);
                const top = (startMin / SLOT_MIN) * SLOT_PX;
                const height = Math.max(((endMin - startMin) / SLOT_MIN) * SLOT_PX - 2, 10);
                const full = nombreServicio ? nombreServicio(s.servicio_slug) : "";
                const colWidthPct = 92 / cols; // deja 8% de márgenes laterales para crear huecos
                const widthPct = colWidthPct * span;
                const leftPct = 4 + col * colWidthPct;
                // Con columnas estrechas no cabe el nombre completo: usamos abreviatura de 2 letras.
                const label = !single && widthPct < 35 && full.length > 3 ? abreviatura(full) : full;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onSelect?.(s)}
                    className={cn(
                      "absolute overflow-hidden rounded px-1 text-left text-[10px] leading-tight shadow-sm border",
                      s.activo
                        ? "bg-state-reservada text-state-reservada-fg border-black/10"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                    style={{ top, height, left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)` }}
                    title={`${hhmm(s.hora_inicio)}–${hhmm(s.hora_fin)} · ${full} · ${s.capacidad} plazas`}
                  >
                    {height <= 22 ? (
                      <div className="flex items-baseline gap-1 overflow-hidden">
                        <span className="font-semibold shrink-0">{hhmm(s.hora_inicio)}</span>
                        <span className="truncate uppercase">{label}</span>
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold">{hhmm(s.hora_inicio)}</div>
                        <div className="truncate uppercase">{label}</div>
                      </>
                    )}
                    {height > 34 && <div className="truncate opacity-90">{s.capacidad} plazas</div>}
                  </button>
                );
              })}

              {draft && draft.dia === dia && (
                <div
                  className="absolute left-[4%] right-[4%] rounded border border-primary/60 bg-primary/20 pointer-events-none"
                  style={{
                    top: (draft.from / SLOT_MIN) * SLOT_PX,
                    height: Math.max(((draft.to - draft.from) / SLOT_MIN) * SLOT_PX, 8),
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
