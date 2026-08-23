import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useServicios } from "@/lib/servicios";
import type { ServiceSlot } from "@/lib/service-slots";
import { SlotsWeekGrid } from "@/components/agenda/slots-week-grid";
import { listHuecos } from "@/lib/client-portal.functions";

/** Vista semanal (estilo agenda) de los huecos disponibles de los servicios del cliente. */
export function HorarioDisponible({ servicios: slugs }: { servicios: string[] }) {
  const { data: servicios = [] } = useServicios();
  const fetchHuecos = useServerFn(listHuecos);
  const { data, isLoading } = useQuery({
    queryKey: ["huecos-cliente", slugs.slice().sort().join(",")],
    queryFn: () => fetchHuecos({ data: { slugs } }),
    enabled: slugs.length > 0,
  });
  const nombreServicio = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;

  const activos = (data?.slots ?? []) as ServiceSlot[];

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando horario…</p>;
  if (activos.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay huecos publicados para tus servicios.
      </p>
    );

  return (
    <div className="h-[70vh] rounded-lg border overflow-hidden">
      <SlotsWeekGrid slots={activos} nombreServicio={nombreServicio} />
    </div>
  );
}
