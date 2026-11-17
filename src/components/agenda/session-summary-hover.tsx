import type { ReactElement } from "react";
import { StickyNote, Users } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface Props {
  children: ReactElement;
  servicio: string;
  color?: string | null;
  horario: string;
  plazas: string;
  entrenador?: string | null;
  nombres: string[];
  nota?: string | null;
}

/** Session summary bubble shown on hover, styled like the Agenda session menu header. */
export function SessionSummaryHover({ children, servicio, color, horario, plazas, entrenador, nombres, nota }: Props) {
  const notaTxt = nota?.trim();
  if (nombres.length < 2 && !notaTxt) return children;
  return (
    <HoverCard openDelay={150} closeDelay={60}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" sideOffset={8} className="w-60 overflow-hidden rounded-xl border-0 p-0 shadow-xl">
        <div className="bg-primary px-3.5 py-2.5 text-primary-foreground">
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
              <li key={i} className="truncate rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">{n}</li>
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
