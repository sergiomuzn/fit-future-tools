import { useMemo, useRef, useState } from "react";
import { HOUR_START, HOUR_END, SLOT_MIN, SLOT_PX, TOTAL_PX, minToTime, pxToMin, timeToMin } from "./types";
import { DIAS_ORDEN, hhmm, type ServiceSlot } from "@/lib/service-slots";
import { cn } from "@/lib/utils";

const DOW_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Props {
  slots: ServiceSlot[];
  nombreServicio?: (slug: string) => string;
  editable?: boolean;
  onCreate?: (dia: number, inicio: string, fin: string) => void;
  onSelect?: (slot: ServiceSlot) => void;
}

/** Calendario semanal (misma rejilla que la agenda) para huecos disponibles. */
export function SlotsWeekGrid({ slots, nombreServicio, editable = false, onCreate, onSelect }: Props) {
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  const [draft, setDraft] = useState<{ dia: number; from: number; to: number } | null>(null);
  const dragRef = useRef<{ dia: number; anchor: number } | null>(null);

  const byDia = useMemo(() => {
    const m = new Map<number, ServiceSlot[]>();
    for (const d of DIAS_ORDEN) m.set(d, []);
    for (const s of slots) m.get(s.dia_semana)?.push(s);
    for (const arr of m.values()) arr.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    return m;
  }, [slots]);

  function offsetMin(e: React.MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(pxToMin(e.clientY - rect.top), (HOUR_END - HOUR_START) * 60));
  }

  return (
    <div className="h-full overflow-auto select-none">
      <div className="flex min-w-[860px]">
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

        {DIAS_ORDEN.map((dia, i) => (
          <div key={dia} className="flex-1 min-w-[110px] border-l">
            <div className="sticky top-0 z-20 h-10 w-full border-b bg-card text-xs font-medium flex items-center justify-center">
              {DOW_SHORT[i]}
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

              {(byDia.get(dia) ?? []).map((s) => {
                const startMin = timeToMin(s.hora_inicio);
                const endMin = timeToMin(s.hora_fin);
                const top = (startMin / SLOT_MIN) * SLOT_PX;
                const height = Math.max(((endMin - startMin) / SLOT_MIN) * SLOT_PX - 2, 10);
                const label = nombreServicio ? nombreServicio(s.servicio_slug) : "";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onSelect?.(s)}
                    className={cn(
                      "absolute left-[1px] right-[1px] overflow-hidden rounded px-1 text-left text-[10px] leading-tight shadow-sm border",
                      s.activo
                        ? "bg-state-reservada text-state-reservada-fg border-black/10"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                    style={{ top, height }}
                    title={`${hhmm(s.hora_inicio)}–${hhmm(s.hora_fin)} · ${label} · ${s.capacidad} plazas`}
                  >
                    <div className="font-semibold">{hhmm(s.hora_inicio)}</div>
                    {height > 22 && <div className="truncate uppercase">{label}</div>}
                    {height > 34 && <div className="truncate opacity-90">{s.capacidad} plazas</div>}
                  </button>
                );
              })}

              {draft && draft.dia === dia && (
                <div
                  className="absolute left-[1px] right-[1px] rounded border border-primary/60 bg-primary/20 pointer-events-none"
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
