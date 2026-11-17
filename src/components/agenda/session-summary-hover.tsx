import { useEffect, useState, type ReactElement } from "react";
import { StickyNote, Users } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn, formatNameTitle } from "@/lib/utils";

interface Props {
  children: ReactElement;
  servicio: string;
  color?: string | null;
  horario: string;
  plazas: string;
  entrenador?: string | null;
  nombres: string[];
  nota?: string | null;
  /** Vertical position of the tail; short rows (month view) need it higher. */
  tailTop?: string;
}

/** Session summary bubble shown on hover, styled like the Agenda session menu header. */
export function SessionSummaryHover({ children, servicio, color, horario, plazas, entrenador, nombres, nota, tailTop = "top-4" }: Props) {
  const notaTxt = nota?.trim();
  // Narrow windows have no room beside the session, so the bubble goes under it.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  if (nombres.length < 2 && !notaTxt) return children;
  return (
    <HoverCard openDelay={150} closeDelay={60}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={narrow ? "bottom" : "right"} align="start" sideOffset={8} className="group w-60 rounded-xl border-0 p-0 shadow-xl">
        {/* Tail pointing at the session this summary comes from */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-3 w-3 rotate-45 rounded-[2px] bg-primary",
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
        {nombres.length > 0 && <div className="px-3.5 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" /> Clientes reservados
          </div>
          <ul className="space-y-1">
            {nombres.map((n, i) => (
              <li key={i} className="truncate rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">{formatNameTitle(n)}</li>
            ))}
          </ul>
        </div>}
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
