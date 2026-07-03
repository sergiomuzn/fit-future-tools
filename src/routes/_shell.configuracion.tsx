import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleForm } from "@/components/config/schedule-form";
import { SpecialDaysCalendar } from "@/components/config/special-days-calendar";

export const Route = createFileRoute("/_shell/configuracion")({ component: ConfigPage });

function ConfigPage() {
  return (
    <div className="p-6 space-y-6 overflow-auto h-screen">
      <div>
        <h1 className="text-2xl font-display font-semibold">Configuración del centro</h1>
        <p className="text-sm text-muted-foreground">Horario base, precios medios y calendario de días especiales.</p>
      </div>

      <ScheduleForm />

      <Card>
        <CardHeader><CardTitle>Días especiales</CardTitle></CardHeader>
        <CardContent>
          <SpecialDaysCalendar />
        </CardContent>
      </Card>
    </div>
  );
}