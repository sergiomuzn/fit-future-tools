import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HorarioForm, PreciosForm, ColoresBonoForm, ColoresServiciosForm } from "@/components/config/schedule-form";
import { SpecialDaysCalendar } from "@/components/config/special-days-calendar";
import { AccountForm } from "@/components/config/account-form";
import { StatsConfigForm } from "@/components/config/stats-config-form";
import { BehaviorForm } from "@/components/config/behavior-form";
export const Route = createFileRoute("/_shell/configuracion")({ component: ConfigPage });

function ConfigPage() {
  return (
    <div className="page-tabbed min-h-screen p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Configuración del centro</h1>
        <p className="text-sm text-muted-foreground">Horario, calendario laboral, bonos y precios.</p>
      </div>

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario">Calendario y horario</TabsTrigger>
          <TabsTrigger value="bonos">Tipos de bonos</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
          <TabsTrigger value="funcionamiento">Funcionamiento</TabsTrigger>
          <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="pt-4 space-y-6">
          <HorarioForm />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Calendario laboral
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-help" aria-label="Cómo afecta el calendario laboral">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      El número de días operativos definido aquí es necesario para calcular la
                      ocupación máxima del centro (días abiertos × horas de apertura × espacios) y,
                      a partir de ella, el porcentaje de ocupación en Estadísticas. Si un día se
                      marca como cerrado o con horario especial, deja de sumar a esa capacidad.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SpecialDaysCalendar />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bonos" className="pt-4 space-y-6">
          <ServiciosManager />
          <ColoresServiciosForm />
          <CatalogoManager />
          <ColoresBonoForm />
        </TabsContent>

        <TabsContent value="estadisticas" className="pt-4 space-y-6">
          <StatsConfigForm />
          <PreciosForm />
        </TabsContent>

        <TabsContent value="funcionamiento" className="pt-4 space-y-6">
          <BehaviorForm />
        </TabsContent>

        <TabsContent value="cuenta" className="pt-4 space-y-6">
          <AccountForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}