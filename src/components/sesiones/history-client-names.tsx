import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNameTitle } from "@/lib/utils";
import { fittingHistoryClientCount } from "@/lib/history-session-clients";
import type { Client } from "@/lib/db";

export function HistoryClientNames({ clients, onSelect, fallback }: { clients: Client[]; onSelect: (client: Client) => void; fallback?: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const measurements = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(clients.length);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = container.current;
    const measure = measurements.current;
    if (!element || !measure) return;
    const resize = () => {
      const widths = Array.from(measure.querySelectorAll<HTMLElement>("[data-client-width]")).map((node) => node.getBoundingClientRect().width);
      const overflow = measure.querySelector<HTMLElement>("[data-overflow-width]")?.getBoundingClientRect().width ?? 32;
      setVisibleCount(fittingHistoryClientCount(widths, element.clientWidth, overflow));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [clients.map((client) => `${client.id}:${client.nombre}`).join("|")]);
  const remaining = clients.length - visibleCount;
  return <div ref={container} className="relative flex w-64 max-w-full items-center gap-2 overflow-hidden">
    <div ref={measurements} aria-hidden className="pointer-events-none invisible absolute flex gap-2 whitespace-nowrap">
      {clients.map((client) => <span key={client.id} data-client-width className="text-sm font-medium">{formatNameTitle(client.nombre)}</span>)}
      <span data-overflow-width className="px-1 text-xs font-medium">+{clients.length}</span>
    </div>
    {!clients.length && <span className={fallback ? "text-sm font-medium" : "text-muted-foreground"}>{fallback ? formatNameTitle(fallback) : "—"}</span>}
    {clients.slice(0, visibleCount).map((client) => <Button key={client.id} variant="link" className="h-auto shrink-0 p-0 text-sm font-medium text-foreground" onClick={() => onSelect(client)}>{formatNameTitle(client.nombre)}</Button>)}
    {remaining > 0 && <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="ghost" className="h-7 shrink-0 px-1 text-xs" aria-label={`Ver ${remaining} clientes más`}>+{remaining}</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {clients.slice(visibleCount).map((client) => <Button key={client.id} variant="ghost" className="h-auto min-h-9 w-full justify-start whitespace-normal text-left" onClick={() => { setOpen(false); onSelect(client); }}>{formatNameTitle(client.nombre)}</Button>)}
      </PopoverContent>
    </Popover>}
  </div>;
}