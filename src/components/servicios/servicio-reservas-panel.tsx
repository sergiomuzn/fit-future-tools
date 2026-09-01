import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Reserva {
  id: string;
  fecha: string;
  hora_inicio: string;
  titulo: string | null;
  por_confirmar: boolean;
  cliente: string | null;
}

function fechaCorta(f: string): string {
  const d = new Date(`${f}T00:00:00`);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/** Sesiones futuras reservadas por clientes desde su portal, para un servicio. */
export function ServicioReservasPanel({ servicioSlug }: { servicioSlug: string }) {
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: reservas = [], isLoading } = useQuery({
    queryKey: ["servicio_reservas", servicioSlug, hoy],
    queryFn: async (): Promise<Reserva[]> => {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          "id,fecha,hora_inicio,titulo,por_confirmar,estado,booked_by_user_id,clients(nombre)",
        )
        .eq("servicio_slug", servicioSlug)
        .gte("fecha", hoy)
        .not("booked_by_user_id", "is", null)
        .neq("estado", "cancelada")
        .order("fecha")
        .order("hora_inicio");
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as unknown as {
          id: string;
          fecha: string;
          hora_inicio: string;
          titulo: string | null;
          por_confirmar: boolean;
          clients: { nombre: string } | null;
        };
        return {
          id: row.id,
          fecha: row.fecha,
          hora_inicio: row.hora_inicio,
          titulo: row.titulo,
          por_confirmar: row.por_confirmar,
          cliente: row.clients?.nombre ?? null,
        };
      });
    },
    enabled: !!servicioSlug,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando reservas…</p>;
  if (reservas.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No hay reservas futuras de clientes en este servicio.
      </p>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Hora</TableHead>
          <TableHead>Cliente</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reservas.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">{fechaCorta(r.fecha)}</TableCell>
            <TableCell className="whitespace-nowrap">{r.hora_inicio.slice(0, 5)}</TableCell>
            <TableCell className="flex items-center gap-2">
              <span className="truncate">{r.cliente ?? r.titulo ?? "—"}</span>
              {r.por_confirmar && <Badge variant="outline">Por confirmar</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
