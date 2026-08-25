import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import type { Servicio } from "@/lib/servicios";

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

interface Kpis {
  clientesActivos: number;
  realizadas: number;
  ocupacion: number;
  canceladas: number;
}

/** KPIs del mes en curso para un servicio concreto. */
export function ServicioResumen({ servicio }: { servicio: Servicio }) {
  const { from, to } = monthRange();

  const { data } = useQuery({
    queryKey: ["servicio_kpis", servicio.slug, from],
    queryFn: async (): Promise<Kpis> => {
      const [bonosRes, sesionesRes] = await Promise.all([
        supabase
          .from("client_bonos")
          .select("client_id, clients!inner(activo)")
          .eq("servicio_slug", servicio.slug)
          .eq("activo", true),
        supabase
          .from("sessions")
          .select("id,fecha,hora_inicio,estado,client_id")
          .eq("servicio_slug", servicio.slug)
          .gte("fecha", from)
          .lte("fecha", to),
      ]);

      const clientes = new Set<string>();
      for (const r of (bonosRes.data ?? []) as Array<{ client_id: string; clients: { activo: boolean } | null }>) {
        if (r.clients?.activo !== false) clientes.add(r.client_id);
      }

      const sesiones = (sesionesRes.data ?? []) as Array<{
        fecha: string; hora_inicio: string; estado: string; client_id: string | null;
      }>;
      const realizadas = sesiones.filter((s) => s.estado === "realizada").length;
      const canceladas = sesiones.filter((s) => s.estado === "cancelada").length;

      // Ocupación media: plazas ocupadas frente a la capacidad del servicio
      // en cada franja (fecha + hora) con actividad este mes.
      const franjas = new Map<string, number>();
      for (const s of sesiones) {
        if (s.estado === "cancelada") continue;
        const key = `${s.fecha}|${s.hora_inicio}`;
        franjas.set(key, (franjas.get(key) ?? 0) + (s.client_id ? 1 : 0));
      }
      const cap = Math.max(1, servicio.capacidad_default);
      const ocupacion = franjas.size
        ? Math.round(([...franjas.values()].reduce((a, b) => a + Math.min(b / cap, 1), 0) / franjas.size) * 100)
        : 0;

      return { clientesActivos: clientes.size, realizadas, ocupacion, canceladas };
    },
  });

  const items = [
    { label: "Clientes activos", value: data?.clientesActivos ?? 0 },
    { label: "Sesiones realizadas este mes", value: data?.realizadas ?? 0 },
    { label: "Ocupación media este mes", value: `${data?.ocupacion ?? 0}%` },
    { label: "Cancelaciones este mes", value: data?.canceladas ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="pt-5">
            <div className="text-2xl font-display font-semibold">{it.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{it.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
