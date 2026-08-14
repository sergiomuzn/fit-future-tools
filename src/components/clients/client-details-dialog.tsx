import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, prettyBonoNombre, colorEstadoFor, type Client, type ClientBono, type BonoCatalogo, type Session, type Invoice } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatNameTitle } from "@/lib/utils";
import { useServicios } from "@/lib/servicios";

const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal", gympass: "Gympass" };
const TIPO_CLASS: Record<string, string> = {
  individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  gympass: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
};

export type ClientDetailsTab = "info" | "historial" | "calendario";

export function ClientDetailsDialog({
  client,
  defaultTab = "info",
  onOpenChange,
}: {
  client: Client | null;
  defaultTab?: ClientDetailsTab;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: bonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => (await supabase.from("client_bonos").select("*")).data as ClientBono[] ?? [],
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [],
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));
  const { data: servicios = [] } = useServicios();
  const servMap = new Map(servicios.map((s) => [s.slug, s.nombre]));

  const history = client
    ? bonos
        .filter((b) => b.client_id === client.id && !b.activo)
        .sort((a, b) => (b.ultimo_bono_fecha ?? "").localeCompare(a.ultimo_bono_fecha ?? ""))
    : [];

  return (
    <Dialog open={!!client} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{formatNameTitle(client?.nombre)}</DialogTitle>
        </DialogHeader>
        {client && (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList>
              <TabsTrigger value="info">Información</TabsTrigger>
              <TabsTrigger value="historial">Historial de bonos</TabsTrigger>
              <TabsTrigger value="calendario">Calendario</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="pt-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Nombre" value={formatNameTitle(client.nombre)} />
                <Field label="Estado" value={
                  <span className={`text-xs px-2 py-0.5 rounded-full ${client.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"}`}>
                    {client.activo ? "Activo" : "Inactivo"}
                  </span>
                } />
                <Field label="Teléfono" value={client.telefono ?? "—"} />
                <Field label="Email" value={client.email ?? "—"} />
                <Field label="Fecha de inicio" value={client.fecha_inicio ?? "—"} />
                <Field label="Fecha de nacimiento" value={client.cumpleanos ?? "—"} />
              </dl>
              {client.notas && (
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground mb-1">Notas</div>
                  <div className="text-sm whitespace-pre-wrap">{client.notas}</div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="historial" className="pt-4">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sin bonos anteriores.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bono</TableHead>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Realizadas</TableHead>
                      <TableHead>Restantes al cerrar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((b) => {
                      const cat = catMap.get(b.bono_catalogo_id ?? "");
                      const slug = cat?.servicio_slug ?? b.servicio_slug;
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="whitespace-nowrap truncate max-w-[180px]">{prettyBonoNombre(cat?.nombre ?? b.ultimo_bono_nombre)}</TableCell>
                          <TableCell className="whitespace-nowrap">{slug ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border whitespace-nowrap">
                              {servMap.get(slug) ?? slug}
                            </span>
                          ) : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{(cat?.tipo ?? b.tipo) ? <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[(cat?.tipo ?? b.tipo)!] ?? "bg-muted"} whitespace-nowrap`}>{TIPO_LABEL[(cat?.tipo ?? b.tipo)!] ?? (cat?.tipo ?? b.tipo)}</span> : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{b.ultimo_bono_fecha ?? b.fecha_inicio}</TableCell>
                          <TableCell>{b.sesiones_realizadas}</TableCell>
                          <TableCell className={b.sesiones_disponibles < 0 ? "text-red-500" : ""}>{b.sesiones_disponibles}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="calendario" className="pt-4">
              <ClientCalendar clientId={client.id} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DOW = ["L","M","X","J","V","S","D"];

const ESTADO_DOT: Record<string, string> = {
  reservada: "bg-state-reservada",
  realizada: "bg-state-realizada",
  cancelada: "bg-state-cancelada",
  prueba: "bg-state-prueba",
  renovacion: "bg-state-renovacion",
};

function ClientCalendar({ clientId }: { clientId: string }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  // Build grid range (lunes primero) incluyendo días fuera del mes
  const firstDow = (monthStart.getDay() + 6) % 7;
  const totalDays = monthEnd.getDate();
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstDow);
  const totalCells = Math.ceil((firstDow + totalDays) / 7) * 7;
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + totalCells - 1);
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const isoStart = toIso(gridStart);
  const isoEnd = toIso(gridEnd);

  const { data: sessions = [] } = useQuery({
    queryKey: ["client-sessions", clientId, isoStart, isoEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("client_id", clientId)
        .gte("fecha", isoStart)
        .lte("fecha", isoEnd)
        .order("hora_inicio");
      return (data ?? []) as Session[];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["client-invoices", clientId, isoStart, isoEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .gte("fecha", isoStart)
        .lte("fecha", isoEnd);
      return (data ?? []) as Invoice[];
    },
  });

  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [],
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));

  const { data: allBonos = [] } = useQuery({
    queryKey: ["client-bonos-all", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_bonos")
        .select("*")
        .eq("client_id", clientId);
      return (data ?? []) as ClientBono[];
    },
  });
  const closedBonos = allBonos.filter((b) => !b.activo);
  // map por fecha de cierre → bono cerrado (para "restantes al cerrar")
  const closedByDate = new Map<string, ClientBono>();
  closedBonos.forEach((b) => {
    if (b.ultimo_bono_fecha) closedByDate.set(b.ultimo_bono_fecha, b);
  });
  // notas de bonos por fecha de inicio
  const notaByDate = new Map<string, string>();
  allBonos.forEach((b) => {
    const nota = (b.nota ?? "").trim();
    if (nota && b.fecha_inicio) {
      notaByDate.set(b.fecha_inicio, [notaByDate.get(b.fecha_inicio), nota].filter(Boolean).join("\n"));
    }
  });

  const sessionsByDate = new Map<string, Session[]>();
  sessions.forEach((s) => {
    const arr = sessionsByDate.get(s.fecha) ?? [];
    arr.push(s);
    sessionsByDate.set(s.fecha, arr);
  });
  const invoicesByDate = new Map<string, Invoice[]>();
  invoices.forEach((i) => {
    const arr = invoicesByDate.get(i.fecha) ?? [];
    arr.push(i);
    invoicesByDate.set(i.fecha, arr);
  });

  type Cell = { date: Date; iso: string; isOutside: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    cells.push({ date: d, iso: toIso(d), isOutside: d.getMonth() !== cursor.getMonth() });
  }

  return (
    <TooltipProvider delayDuration={100}>
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="font-semibold capitalize">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
        <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground text-center">
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map(({ date, iso, isOutside }, i) => {
          const day = date.getDate();
          const daySessions = sessionsByDate.get(iso) ?? [];
          const dayInvoices = invoicesByDate.get(iso) ?? [];
          const isToday = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === day;
          return (
            <div
              key={i}
              className={cn(
                "h-10 rounded border p-0.5 text-[10px] flex flex-col gap-0.5 overflow-hidden",
                isToday ? "border-primary bg-primary/5" : "border-border",
                isOutside && "bg-muted/20",
                isOutside && "opacity-60",
              )}
            >
              <div className="flex items-center justify-between gap-0.5">
                <span className={cn("font-semibold", isToday && "text-primary", isOutside && "text-muted-foreground/40")}>{day}</span>
                <span className="flex items-center gap-0.5">
                {notaByDate.has(iso) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[9px] leading-none text-muted-foreground cursor-default">✎</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56 whitespace-pre-wrap">
                      <span className="font-medium">Nota</span>
                      <div>{notaByDate.get(iso)}</div>
                    </TooltipContent>
                  </Tooltip>
                )}
                {dayInvoices.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      <div className="font-medium">Renovación</div>
                      {dayInvoices.map((iv) => {
                        const nombre = prettyBonoNombre(catMap.get(iv.bono_catalogo_id ?? "")?.nombre) ?? "Bono";
                        const cerrado = closedByDate.get(iv.fecha);
                        return (
                          <div key={iv.id}>
                            {nombre}
                            {cerrado ? ` · Restantes al cerrar: ${cerrado.sesiones_disponibles}` : ""}
                          </div>
                        );
                      })}
                    </TooltipContent>
                  </Tooltip>
                )}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {daySessions.slice(0, 2).map((s) => {
                  const isNC = s.estado === "cancelada" && (s as any).no_contabilizar;
                  const inc = (s.incidencia ?? "").trim();
                  const isPorConfirmar = s.estado === "reservada" && (s as any).por_confirmar;
                  const dot = ESTADO_DOT[colorEstadoFor(s)] ?? "bg-muted";
                  return (
                    <Tooltip key={s.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex items-center gap-1 rounded px-1 leading-tight text-[9px] truncate text-white cursor-default",
                            dot,
                            isNC && "opacity-60 border border-dashed border-white/60",
                          )}
                          style={{
                            backgroundImage: isPorConfirmar
                              ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 3px, transparent 3px 6px)"
                              : undefined,
                          }}
                        >
                          <span className="truncate">{s.hora_inicio.slice(0,5)}{isNC ? " NC" : ""}</span>
                          {inc && <span className="font-bold">!</span>}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-56 whitespace-pre-wrap">
                        <div className="font-medium">
                          {s.hora_inicio.slice(0,5)} · {s.estado}
                          {isNC ? " (NC)" : ""}
                          {isPorConfirmar ? " (Por confirmar)" : ""}
                        </div>
                        {inc && <div>Incidencia: {inc}</div>}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                {daySessions.length > 2 && (
                  <div className="text-[9px] text-muted-foreground">+{daySessions.length - 2}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t">
        <LegendDot color="bg-state-reservada" label="Reservada" />
        <LegendDot color="bg-state-realizada" label="Realizada" />
        <LegendDot color="bg-state-cancelada" label="Cancelada" />
        <LegendDot color="bg-state-prueba" label="Prueba" />
        <LegendDot color="bg-amber-500" label="Renovación" />
      </div>
    </div>
    </TooltipProvider>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-sm", color)} />
      <span>{label}</span>
    </div>
  );
}