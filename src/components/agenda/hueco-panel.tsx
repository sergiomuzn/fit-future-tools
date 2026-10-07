import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientPicker } from "@/components/clients/client-picker";
import { hhmm } from "@/lib/service-slots";
import type { SlotInstance } from "@/lib/slot-propagation";
import { cn, formatDateShort } from "@/lib/utils";

type Pestana = "reservados" | "cola" | "cancelados";

export interface PanelReserva {
  id: string;
  client_id: string | null;
  titulo: string | null;
  clients: { nombre: string } | null;
}

interface Props {
  inst: SlotInstance | null;
  servicioNombre: string;
  color: string;
  trainerNombre: string | null;
  reservas: PanelReserva[];
  onClose: () => void;
  headerFields?: ReactNode;
  clientFields?: ReactNode;
  extraFields?: ReactNode;
  footer?: ReactNode;
  onCancelarReserva: (r: PanelReserva) => void;
  /** Estado a mostrar en la etiqueta (si no, se calcula). */
  estadoFijo?: { label: string; cls: string };
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export function HuecoPanel({ inst, servicioNombre, color, trainerNombre, reservas, onClose, onCancelarReserva, estadoFijo, headerFields, clientFields, extraFields, footer }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Pestana>("reservados");
  const [nuevoCliente, setNuevoCliente] = useState<string | null>(null);

  const { data: extra } = useQuery({
    queryKey: ["hueco-panel", inst?.id, inst?.fecha, inst?.hora_inicio],
    enabled: !!inst,
    queryFn: async () => {
      const i = inst;
      if (!i) throw new Error("Sesión no disponible");
      const [cola, canc] = await Promise.all([
        (supabase as any)
          .from("reserva_cola")
          .select("id,client_id,hora_inicio,servicio_slug,estado,created_at")
          .eq("fecha", i.fecha)
          .in("estado", ["en_cola", "ofrecida"])
          .order("created_at"),
        supabase
          .from("sessions")
          .select("id,client_id,titulo,hora_inicio,servicio_slug,slot_instance_id,clients(nombre)")
          .eq("fecha", i.fecha)
          .eq("estado", "cancelada"),
      ]);
      const colaRows = ((cola.data ?? []) as { id: string; client_id: string; hora_inicio: string; servicio_slug: string | null }[])
        .filter((c) => hhmm(c.hora_inicio) === hhmm(i.hora_inicio) && (!c.servicio_slug || c.servicio_slug === i.servicio_slug));
      const ids = colaRows.map((c) => c.client_id);
      const nombres = new Map<string, string>();
      if (ids.length) {
        const { data } = await supabase.from("clients").select("id,nombre").in("id", ids);
        for (const c of data ?? []) nombres.set(c.id, c.nombre);
      }
      const cancelados = ((canc.data ?? []) as any[]).filter((s) =>
        s.slot_instance_id
          ? s.slot_instance_id === i.id
          : hhmm(s.hora_inicio) === hhmm(i.hora_inicio) && s.servicio_slug === i.servicio_slug,
      );
      return {
        cola: colaRows.map((c) => ({ id: c.id, nombre: nombres.get(c.client_id) ?? "Cliente" })),
        cancelados: cancelados.map((s) => ({ id: s.id as string, nombre: (s.clients?.nombre ?? s.titulo ?? "Cliente") as string })),
      };
    },
  });

  const anadir = useMutation({
    mutationFn: async (clientId: string) => {
      const i = inst;
      if (!i) throw new Error("Sesión no disponible");
      const { error } = await supabase.from("sessions").insert({
        fecha: i.fecha,
        hora_inicio: i.hora_inicio,
        hora_fin: i.hora_fin,
        servicio_slug: i.servicio_slug,
        trainer_id: i.trainer_id,
        client_id: clientId,
        estado: "reservada",
        booking_tipo: "centro",
        slot_instance_id: i.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setNuevoCliente(null);
      qc.invalidateQueries({ queryKey: ["sessions-range"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Reserva añadida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completa = !!inst && reservas.length >= inst.capacidad;
  const estadoCalc = useMemo(() => {
    if (!inst) return { label: "", cls: "" };
    const fin = new Date(`${inst.fecha}T${hhmm(inst.hora_fin)}:00`);
    if (fin < new Date()) return { label: "Realizada", cls: "bg-state-asistida text-state-asistida-fg" };
    if (reservas.length > 0) return { label: "Reservada", cls: "bg-state-reservada text-state-reservada-fg" };
    return { label: "Disponible", cls: "bg-secondary text-secondary-foreground" };
  }, [inst, reservas.length]);
  const estado = estadoFijo ?? estadoCalc;

  const listas: Record<Pestana, { id: string; nombre: string; reserva?: PanelReserva }[]> = {
    reservados: reservas.map((r) => ({ id: r.id, nombre: r.clients?.nombre ?? r.titulo ?? "Cliente", reserva: r })),
    cola: extra?.cola ?? [],
    cancelados: extra?.cancelados ?? [],
  };
  const contadores: { key: Pestana; label: string; cls: string }[] = [
    { key: "reservados", label: "Reservados", cls: "text-state-prueba" },
    { key: "cola", label: "En cola", cls: "text-foreground" },
    { key: "cancelados", label: "Cancelados", cls: "text-foreground" },
  ];

  return (
    <Dialog open={!!inst} onOpenChange={(o) => { if (!o) { setTab("reservados"); onClose(); } }}>
      <DialogContent aria-describedby={undefined} className="gap-0 p-0 sm:max-w-xl">
        {inst && (
          <>
            <div className="relative space-y-1.5 bg-primary px-5 pb-4 pt-5 text-primary-foreground">
              <span className={cn("absolute right-12 top-4 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", estado.cls)}>
                {estado.label}
              </span>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-28 text-base">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="min-w-0 break-words">{servicioNombre}</span>
                <span className="text-[11px] font-normal opacity-80">{reservas.length} ocupadas · {Math.max(0, inst.capacidad - reservas.length)} disponibles</span>
              </DialogTitle>
              {headerFields ?? (
                <>
                  <div className="text-sm opacity-80">
                    {DIAS[new Date(`${inst.fecha}T00:00:00`).getDay()]} {formatDateShort(inst.fecha)} · {hhmm(inst.hora_inicio)}—{hhmm(inst.hora_fin)}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground/15 text-[11px] font-semibold">{(trainerNombre ?? "?").charAt(0).toUpperCase()}</span>
                    <span className="opacity-90">{trainerNombre ?? "Sin entrenador"}</span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 p-5">
              <h3 className="text-sm font-semibold">Clientes</h3>
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-3 gap-2">
                  {contadores.map((c) => (
                    <Button
                      variant="ghost"
                      key={c.key}
                      type="button"
                      onClick={() => setTab(c.key)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-muted",
                        tab === c.key && "bg-muted",
                      )}
                    >
                      <div className={cn("text-lg font-semibold leading-tight", c.cls)}>{listas[c.key].length}</div>
                      <div className="text-[11px] text-muted-foreground">{c.label}</div>
                    </Button>
                  ))}
                </div>

              </div>

              <div className="flex gap-1 border-b">
                {contadores.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setTab(c.key)}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-1.5 text-sm",
                      tab === c.key ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>

              {tab === "reservados" && (clientFields ?? (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><ClientPicker value={nuevoCliente} onChange={setNuevoCliente} /></div>
                  <Button size="sm" disabled={completa || !nuevoCliente || anadir.isPending} onClick={() => nuevoCliente && anadir.mutate(nuevoCliente)}>Reservar</Button>
                </div>
              ))}

              <div className="max-h-56 space-y-1 overflow-y-auto">
                {listas[tab].length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    Esta sesión no tiene clientes en esta categoría
                  </p>
                ) : (
                  listas[tab].map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                      <span className="truncate text-sm">{r.nombre}</span>
                      {r.reserva && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive" onClick={() => { if (r.reserva) onCancelarReserva(r.reserva); }}>
                              Cancelar reserva
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))
                )}
              </div>
              {extraFields}
            </div>
            {footer}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
