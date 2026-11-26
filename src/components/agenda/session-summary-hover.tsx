import { isMarkedUnregistered, stripUnregistered } from "@/lib/unregistered-client";
import { useEffect, useState, type ReactElement } from "react";
import { StickyNote, Users } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn, formatNameTitle } from "@/lib/utils";

/** Cliente del resumen; `prueba` marca que tiene activada la Sesión de Prueba. */
export type HoverName = { nombre: string; prueba?: boolean };

interface Props {
  children: ReactElement;
  servicio: string;
  color?: string | null;
  horario: string;
  plazas: string;
  entrenador?: string | null;
  nombres: Array<string | HoverName>;
  nota?: string | null;
  /** Vertical position of the tail; short rows (month view) need it higher. */
  tailTop?: string;
}

/** Session summary bubble shown on hover, styled like the Agenda session menu header. */
export function SessionSummaryHover({ children, servicio, color, horario, plazas, entrenador, nombres, nota, tailTop = "top-4" }: Props) {
  const notaTxt = nota?.trim();
  const entries = nombres.map((n) => (typeof n === "string" ? { nombre: n, prueba: false } : { nombre: n.nombre, prueba: !!n.prueba }));
  // Narrow windows have no room beside the session, so the bubble goes under it.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return (
    <HoverCard openDelay={900} closeDelay={60}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={narrow ? "bottom" : "right"} align="start" sideOffset={8} className="group w-60 rounded-xl border-0 p-0 shadow-xl">
        {/* Tail pointing at the session this summary comes from */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-3 w-3 rotate-45 rounded-[2px] bg-primary group-data-[side=top]:bg-popover",
            tailTop,
            "group-data-[side=right]:-left-1 group-data-[side=left]:-right-1 group-data-[side=top]:top-auto group-data-[side=top]:-bottom-1 group-data-[side=top]:left-5 group-data-[side=bottom]:top-auto group-data-[side=bottom]:-top-1 group-data-[side=bottom]:left-5",
          )}
        />
        <div className="rounded-t-xl bg-primary px-3.5 py-2.5 text-primary-foreground">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? undefined }} />
            <span className="truncate">{servicio}</span>
            <span className="ml-auto shrink-0 text-xs font-normal text-primary-foreground/65">({plazas})</span>
          </div>
          <div className="mt-0.5 text-xs text-primary-foreground/80 tabular-nums">
            {horario}{entrenador ? ` · ${entrenador}` : ""}
          </div>
        </div>
        <div className="px-3.5 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" /> Clientes reservados
          </div>
          <ul className="space-y-1">
            {entries.map((e, i) => (
              <li key={i} className="relative flex items-center gap-1.5 truncate rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
                {/* Green stripe: this client has Sesión de Prueba active, glued to the box's left edge */}
                {e.prueba && <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-1 rounded-l-md bg-state-prueba" />}
                <span className="truncate">{formatNameTitle(stripUnregistered(e.nombre))}</span>
                {isMarkedUnregistered(e.nombre) && <span className="shrink-0 rounded border border-dashed px-1 text-[10px] font-normal text-muted-foreground">No registrado</span>}
              </li>
            ))}
          </ul>
        </div>
        {notaTxt && (
          <div className="border-t px-3.5 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <StickyNote className="h-3 w-3" /> Nota
            </div>
            <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1.5 text-xs">{notaTxt}</p>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
