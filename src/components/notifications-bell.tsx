import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { resolverReservaPendiente } from "@/lib/notificaciones.functions";

interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
  tipo: string;
  session_id: string | null;
}

function relativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export function NotificationsBell({ className }: { className?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const resolver = useServerFn(resolverReservaPendiente);

  const { data: items = [] } = useQuery({
    queryKey: ["notificaciones"],
    queryFn: async (): Promise<Notificacion[]> => {
      const { data } = await supabase
        .from("notificaciones")
        .select("id,titulo,mensaje,leida,created_at,tipo,session_id")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as Notificacion[];
    },
    refetchInterval: 60_000,
  });

  const sessionIds = items
    .filter((i) => i.tipo === "reserva_pendiente" && i.session_id)
    .map((i) => i.session_id as string);

  const { data: pendientes = [] } = useQuery({
    queryKey: ["notificaciones-pendientes", sessionIds.join(",")],
    enabled: sessionIds.length > 0,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from("sessions")
        .select("id")
        .in("id", sessionIds)
        .eq("por_confirmar", true);
      return (data ?? []).map((r) => (r as { id: string }).id);
    },
  });

  async function resolverReserva(sessionId: string, accion: "confirmar" | "denegar") {
    setProcesando(sessionId);
    try {
      await resolver({ data: { sessionId, accion } });
      toast.success(accion === "confirmar" ? "Reserva confirmada" : "Reserva denegada");
      qc.invalidateQueries({ queryKey: ["notificaciones-pendientes"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["servicio_reservas"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setProcesando(null);
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel("notificaciones-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "notificaciones" }, () => {
        qc.invalidateQueries({ queryKey: ["notificaciones"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const sinLeer = items.filter((i) => !i.leida);

  async function marcarLeidas() {
    if (!sinLeer.length) return;
    await supabase
      .from("notificaciones")
      .update({ leida: true })
      .in("id", sinLeer.map((i) => i.id));
    qc.invalidateQueries({ queryKey: ["notificaciones"] });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void marcarLeidas();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative h-8 w-8", className)} aria-label="Buzón de avisos">
          <Inbox className="h-4 w-4" />
          {sinLeer.length > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">Buzón</div>
        <div className="max-h-80 overflow-auto">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No tienes avisos.</p>
          )}
          {items.map((n) => (
            <div key={n.id} className={cn("border-b px-3 py-2 last:border-b-0", !n.leida && "bg-accent/40")}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{n.titulo}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{relativo(n.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{n.mensaje}</p>
              {n.session_id && pendientes.includes(n.session_id) && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={procesando === n.session_id}
                    onClick={() => void resolverReserva(n.session_id!, "confirmar")}
                  >
                    Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={procesando === n.session_id}
                    onClick={() => void resolverReserva(n.session_id!, "denegar")}
                  >
                    Denegar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
