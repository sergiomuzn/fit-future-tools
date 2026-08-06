import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DIAS_SEMANA_LONG } from "@/lib/db";
import { useServicios } from "@/lib/servicios";
import { DIAS_ORDEN, hhmm, useServiceSlots } from "@/lib/service-slots";

/** Vista semanal de los huecos disponibles de los servicios del cliente. */
export function HorarioDisponible({ servicios: slugs }: { servicios: string[] }) {
  const { data: servicios = [] } = useServicios();
  const { data: slots = [], isLoading } = useServiceSlots(slugs);
  const nombreServicio = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;

  const activos = slots.filter((s) => s.activo);

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando horario…</p>;
  if (activos.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay huecos publicados para tus servicios.
      </p>
    );

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {DIAS_ORDEN.map((dia) => {
        const delDia = activos
          .filter((s) => s.dia_semana === dia)
          .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
        return (
          <Card key={dia}>
            <CardContent className="p-3">
              <p className="mb-2 text-sm font-medium">{DIAS_SEMANA_LONG[dia]}</p>
              {delDia.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin huecos disponibles</p>
              ) : (
                <ul className="space-y-1.5">
                  {delDia.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {hhmm(s.hora_inicio)}–{hhmm(s.hora_fin)}
                      </span>
                      <Badge variant="secondary" className="shrink-0 text-[11px]">
                        {nombreServicio(s.servicio_slug)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}