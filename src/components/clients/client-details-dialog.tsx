import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, prettyBonoNombre, type Client, type ClientBono, type BonoCatalogo, type Session, type Invoice } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal" };
const TIPO_CLASS: Record<string, string> = {
  individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
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
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*")).data as BonoCatalogo[] ?? [],
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));

  const history = client
    ? bonos
        .filter((b) => b.client_id === client.id && !b.activo)
        .sort((a, b) => (b.ultimo_bono_fecha ?? "").localeCompare(a.ultimo_bono_fecha ?? ""))
    : [];

  return (
    <Dialog open={!!client} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{client?.nombre}</DialogTitle>
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
                <Field label="Nombre" value={client.nombre} />
                <Field label="Estado" value={
                  <span className={`text-xs px-2 py-0.5 rounded-full ${client.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"}`}>
                    {client.activo ? "Activo" : "Inactivo"}
                  </span>
                } />
                <Field label="Teléfono" value={client.telefono ?? "—"} />
                <Field label="Fecha de inicio" value={client.fecha_inicio ?? "—"} />
                <Field label="Cumpleaños" value={client.cumpleanos ?? "—"} />
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
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Realizadas</TableHead>
                      <TableHead>Restantes al cerrar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((b) => {
                      const cat = catMap.get(b.bono_catalogo_id ?? "");
                      return (
                        <TableRow key={b.id}>
                          <TableCell>{prettyBonoNombre(cat?.nombre ?? b.ultimo_bono_nombre)}</TableCell>
                          <TableCell>{cat ? <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[cat.tipo]}`}>{TIPO_LABEL[cat.tipo]}</span> : "—"}</TableCell>
                          <TableCell>{b.ultimo_bono_fecha ?? b.fecha_inicio}</TableCell>
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
  const isoStart = `${monthStart.getFullYear()}-${String(monthStart.getMonth()+1).padStart(2,"0")}-01`;
  const isoEnd = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth()+1).padStart(2,"0")}-${String(monthEnd.getDate()).padStart(2,"0")}`;

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
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*")).data as BonoCatalogo[] ?? [],
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));

  const sessionsByDay = new Map<number, Session[]>();
  sessions.forEach((s) => {
    const d = Number(s.fecha.slice(8, 10));
    const arr = sessionsByDay.get(d) ?? [];
    arr.push(s);
    sessionsByDay.set(d, arr);
  });
  const invoicesByDay = new Map<number, Invoice[]>();
  invoices.forEach((i) => {
    const d = Number(i.fecha.slice(8, 10));
    const arr = invoicesByDay.get(d) ?? [];
    arr.push(i);
    invoicesByDay.set(d, arr);
  });

  // grid: lunes primero
  const firstDow = (monthStart.getDay() + 6) % 7; // Lun=0
  const totalDays = monthEnd.getDate();
  const prevMonthEnd = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();

  type Cell = { day: number; isOutside: boolean };
  const cells: Cell[] = [];
  for (let i = 100; i < firstDow; i++) {
    const day = prevMonthEnd - firstDow + 1 + i;
    cells.push({ day, isOutside: true });
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, isOutside: false });
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - (firstDow + totalDays) + 1;
    cells.push({ day, isOutside: true });
  }

  return (
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
        {cells.map(({ day, isOutside }, i) => {
          const daySessions = isOutside ? [] : (sessionsByDay.get(day) ?? []);
          const dayInvoices = isOutside ? [] : (invoicesByDay.get(day) ?? []);
          const isToday = !isOutside && today.getFullYear() === cursor.getFullYear() && today.getMonth() === cursor.getMonth() && today.getDate() === day;
          return (
            <div
              key={i}
              className={cn(
                "h-10 rounded border p-0.5 text-[10px] flex flex-col gap-0.5 overflow-hidden",
                isToday ? "border-primary bg-primary/5" : "border-border",
                isOutside && "bg-muted/20",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("font-semibold", isToday && "text-primary", isOutside && "text-muted-foreground/40")}>{day}</span>
                {dayInvoices.length > 0 && (
                  <span
                    title={dayInvoices.map((iv) => catMap.get(iv.bono_catalogo_id)?.nombre ?? "Bono").join(", ")}
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                  />
                )}
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {daySessions.slice(0, 2).map((s) => {
                  const isNC = s.estado === "cancelada" && (s as any).no_contabilizar;
                  const isPorConfirmar = s.estado === "reservada" && (s as any).por_confirmar;
                  const dot = ESTADO_DOT[s.estado] ?? "bg-muted";
                  return (
                    <div
                      key={s.id}
                      title={`${s.hora_inicio.slice(0,5)} · ${s.estado}${isNC ? " (NC)" : ""}${isPorConfirmar ? " (Por confirmar)" : ""}`}
                      className={cn(
                        "flex items-center gap-1 rounded px-1 leading-tight text-[9px] truncate text-white",
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
                    </div>
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