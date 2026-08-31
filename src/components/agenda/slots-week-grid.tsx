import { useEffect, useMemo, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { HOUR_START, HOUR_END, SLOT_MIN, SLOT_PX, TOTAL_PX, minToTime, pxToMin, timeToMin } from "./types";
import { DIAS_ORDEN, hhmm, type ServiceSlot } from "@/lib/service-slots";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

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
export function abreviatura(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  return nombre.trim().slice(0, 2).toUpperCase();
}

/** Clases de color según el servicio: los grupos usan el color de grupo de la agenda. */
export function slotColorClasses(slug: string, activo = true): string {
  if (!activo) return "bg-muted text-muted-foreground border-border";
  if (/grupo/i.test(slug)) return "bg-state-grupo text-state-grupo-fg border-black/10";
  return "bg-state-reservada text-state-reservada-fg border-black/10";
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

export type GridMode = "crear" | "rapida" | "seleccion";

interface Props {
  slots: ServiceSlot[];
  nombreServicio?: (slug: string) => string;
  editable?: boolean;
  onCreate?: (dia: number, inicio: string, fin: string) => void;
  onSelect?: (slot: ServiceSlot) => void;
  /** Días a mostrar. Por defecto la semana completa. */
  dias?: readonly number[];
  /** Modo de interacción de la cuadrícula. */
  mode?: GridMode;
  /** Ids seleccionados (modo selección). */
  selectedIds?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Mueve los huecos indicados (días y minutos de desplazamiento). */
  onMoveSelection?: (deltaDias: number, deltaMin: number, ids: string[]) => void;
  onCopyDay?: (dia: number) => void;
  onPasteDay?: (dia: number) => void;
  onClearDay?: (dia: number) => void;
  canPaste?: boolean;
  /** Copia los huecos seleccionados al portapapeles interno. */
  onCopySelection?: () => void;
  /** Pega los huecos copiados en el día indicado. */
  onPasteSelection?: (dia: number) => void;
  canPasteSelection?: boolean;
  hasSelection?: boolean;
  onDeleteSelection?: () => void;
  /** Huecos bloqueados (con reserva confirmada): no se pueden mover ni seleccionar. */
  lockedIds?: string[];
  /**
   * Apariencia por hueco (modo vista): contorno del color del servicio cuando
   * está libre y relleno sólido cuando tiene al menos una reserva.
   */
  slotAppearance?: (slot: ServiceSlot) => { color: string; filled: boolean } | null;
}

/** Calendario semanal (misma rejilla que la agenda) para huecos disponibles. */
export function SlotsWeekGrid({
  slots,
  nombreServicio,
  editable = false,
  onCreate,
  onSelect,
  dias = DIAS_ORDEN,
  mode = "crear",
  selectedIds = [],
  onSelectedChange,
  onMoveSelection,
  onCopyDay,
  onPasteDay,
  onClearDay,
  canPaste = false,
  onCopySelection,
  onPasteSelection,
  canPasteSelection = false,
  hasSelection = false,
  onDeleteSelection,
  lockedIds = [],
}: Props) {
  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  const [draft, setDraft] = useState<{ dia: number; from: number; to: number } | null>(null);
  const dragRef = useRef<{ dia: number; anchor: number } | null>(null);
  const single = dias.length === 1;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selecting = mode === "seleccion";

  const bodyRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const hoverDia = useRef<number | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeRef = useRef<{ x: number; y: number; additive: boolean; base: string[] } | null>(null);
  const [moveDelta, setMoveDelta] = useState<{ dias: number; min: number; ids: string[] } | null>(null);
  const moveRef = useRef<{ x: number; y: number; colW: number; ids: string[] } | null>(null);
  const deltaRef = useRef<{ dias: number; min: number; ids: string[] } | null>(null);
  const draggedRef = useRef(false);
  /** Al soltar mantenemos el desplazamiento hasta que llegan los datos nuevos (evita el parpadeo). */
  useEffect(() => {
    setMoveDelta(null);
  }, [slots]);

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

  // ---- Selección por rectángulo y movimiento (individual o en bloque) ----
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (marqueeRef.current) {
        const m = marqueeRef.current;
        setMarquee({ x1: m.x, y1: m.y, x2: e.clientX, y2: e.clientY });
        const left = Math.min(m.x, e.clientX);
        const right = Math.max(m.x, e.clientX);
        const top = Math.min(m.y, e.clientY);
        const bottom = Math.max(m.y, e.clientY);
        const hit: string[] = [];
        bodyRef.current?.querySelectorAll<HTMLElement>("[data-slot-id]").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (
            el.dataset["locked"] !== "1" &&
            r.left < right && r.right > left && r.top < bottom && r.bottom > top
          ) {
            hit.push(el.dataset["slotId"]!);
          }
        });
        const next = m.additive ? Array.from(new Set([...m.base, ...hit])) : hit;
        onSelectedChange?.(next);
      } else if (moveRef.current) {
        const mv = moveRef.current;
        const dy = e.clientY - mv.y;
        const dx = e.clientX - mv.x;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true;
        const next = {
          dias: mv.colW > 0 ? Math.round(dx / mv.colW) : 0,
          min: Math.round(dy / SLOT_PX) * SLOT_MIN,
          ids: mv.ids,
        };
        deltaRef.current = next;
        setMoveDelta(next);
      }
    }
    function onUp() {
      if (marqueeRef.current) {
        marqueeRef.current = null;
        setMarquee(null);
      }
      if (moveRef.current) {
        moveRef.current = null;
        const d = deltaRef.current;
        deltaRef.current = null;
        if (d && (d.dias !== 0 || d.min !== 0)) {
          // Mantenemos la posición arrastrada hasta que llegan los datos nuevos.
          onMoveSelection?.(d.dias, d.min, d.ids);
        } else {
          setMoveDelta(null);
        }
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onSelectedChange, onMoveSelection]);

  // ---- Atajos de teclado: Ctrl/Cmd + C / V ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "c" && hasSelection) {
        e.preventDefault();
        onCopySelection?.();
      } else if (k === "v" && canPasteSelection) {
        e.preventDefault();
        onPasteSelection?.(hoverDia.current ?? dias[0]!);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasSelection, canPasteSelection, onCopySelection, onPasteSelection, dias]);

  const showMenu = !!(onCopyDay || onPasteDay || onClearDay);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden select-none">
      <div className={cn("flex", !single && "min-w-[860px]")} ref={bodyRef}>
        <div className="w-14 shrink-0">
          <div className="sticky top-0 z-20 h-10 border-b bg-background" />
          <div className="relative text-[10px] text-muted-foreground" style={{ height: TOTAL_PX, marginTop: 8 }}>
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
          <div key={dia} className="flex-1 min-w-[110px]">
            <div className="sticky top-0 z-20 h-10 w-full border-b bg-background text-xs font-medium flex items-center justify-center gap-1">
              {DOW_LONG[dia]}
              {showMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Opciones de ${DOW_LONG[dia]}`}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onCopyDay?.(dia)}>Copiar día</DropdownMenuItem>
                    <DropdownMenuItem disabled={!canPaste} onSelect={() => onPasteDay?.(dia)}>
                      Pegar día
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => onClearDay?.(dia)}>
                      Vaciar día
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <ContextMenu>
              <ContextMenuTrigger asChild>
            <div
              ref={(el) => {
                if (el) colRefs.current.set(dia, el);
                else colRefs.current.delete(dia);
              }}
              className={cn(
                "relative border-l",
                editable && !selecting && "cursor-crosshair",
                selecting && "cursor-default",
              )}
              style={{ height: TOTAL_PX, marginTop: 8 }}
              onMouseEnter={() => { hoverDia.current = dia; }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                if (selecting) {
                  marqueeRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                    additive: e.ctrlKey || e.metaKey,
                    base: selectedIds,
                  };
                  setMarquee({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
                  if (!(e.ctrlKey || e.metaKey)) onSelectedChange?.([]);
                  return;
                }
                if (!editable) return;
                const min = offsetMin(e, e.currentTarget);
                dragRef.current = { dia, anchor: min };
                setDraft({ dia, from: min, to: min + SLOT_MIN });
              }}
              onMouseMove={(e) => {
                if (selecting) return;
                if (!editable || !dragRef.current || dragRef.current.dia !== dia) return;
                const min = offsetMin(e, e.currentTarget);
                const a = dragRef.current.anchor;
                setDraft({ dia, from: Math.min(a, min), to: Math.max(a + SLOT_MIN, min) });
              }}
              onMouseUp={() => {
                if (selecting) return;
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
                const isSel = selected.has(s.id);
                const isLocked = locked.has(s.id);
                const drag = moveDelta && moveDelta.ids.includes(s.id) ? moveDelta : null;
                const colW = colRefs.current.get(dia)?.getBoundingClientRect().width ?? 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-slot-id={s.id}
                    data-locked={isLocked ? "1" : undefined}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      if (isLocked) return;
                      draggedRef.current = false;
                      if (selecting) {
                        if (e.ctrlKey || e.metaKey) {
                          onSelectedChange?.(
                            isSel ? selectedIds.filter((id) => id !== s.id) : [...selectedIds, s.id],
                          );
                          return;
                        }
                        const ids = isSel ? selectedIds : [s.id];
                        if (!isSel) onSelectedChange?.([s.id]);
                        moveRef.current = { x: e.clientX, y: e.clientY, colW, ids };
                        setMoveDelta({ dias: 0, min: 0, ids });
                        return;
                      }
                      // Modo normal: arrastrar un hueco individual.
                      moveRef.current = { x: e.clientX, y: e.clientY, colW, ids: [s.id] };
                    }}
                    onClick={() => {
                      if (selecting || draggedRef.current) return;
                      onSelect?.(s);
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded px-1 text-left text-[10px] leading-tight shadow-sm border",
                      slotColorClasses(s.servicio_slug, s.activo),
                      isSel && "outline outline-2 -outline-offset-2 outline-primary z-30",
                      isLocked && "cursor-not-allowed ring-1 ring-inset ring-foreground/40",
                      drag && "opacity-80 z-40",
                    )}
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + 1px)`,
                      width: `calc(${widthPct}% - 2px)`,
                      transform: drag
                        ? `translate(${drag.dias * colW}px, ${(drag.min / SLOT_MIN) * SLOT_PX}px)`
                        : undefined,
                      // Sin transición: el hueco sigue al ratón igual que en la agenda,
                      // evitando el efecto de "venir desde el lateral" al soltar.
                      transition: "none",
                    }}
                    title={`${hhmm(s.hora_inicio)}–${hhmm(s.hora_fin)} · ${full} · ${s.capacidad} plazas${
                      isLocked ? " · Reservado (bloqueado)" : ""
                    }`}
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
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem disabled={!hasSelection} onSelect={() => onCopySelection?.()}>
                  Copiar selección <span className="ml-auto text-xs text-muted-foreground">Ctrl+C</span>
                </ContextMenuItem>
                <ContextMenuItem disabled={!canPasteSelection} onSelect={() => onPasteSelection?.(dia)}>
                  Pegar aquí <span className="ml-auto text-xs text-muted-foreground">Ctrl+V</span>
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!hasSelection}
                  className="text-destructive"
                  onSelect={() => onDeleteSelection?.()}
                >
                  Eliminar selección
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onCopyDay?.(dia)}>Copiar día</ContextMenuItem>
                <ContextMenuItem disabled={!canPaste} onSelect={() => onPasteDay?.(dia)}>
                  Pegar día
                </ContextMenuItem>
                <ContextMenuItem className="text-destructive" onSelect={() => onClearDay?.(dia)}>
                  Vaciar día
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        ))}
      </div>

      {marquee && (
        <div
          className="fixed z-50 rounded border border-primary/70 bg-primary/10 pointer-events-none"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
          }}
        />
      )}
    </div>
  );
}
