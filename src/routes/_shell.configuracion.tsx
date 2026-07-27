import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HorarioForm, PreciosForm } from "@/components/config/schedule-form";
import { SpecialDaysCalendar } from "@/components/config/special-days-calendar";
import { CatalogoManager } from "@/components/config/catalogo-manager";
import { AccountForm } from "@/components/config/account-form";
import { StatsConfigForm } from "@/components/config/stats-config-form";

export const Route = createFileRoute("/_shell/configuracion")({ component: ConfigPage });

function ConfigPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Configuración del centro</h1>
        <p className="text-sm text-muted-foreground">Horario, calendario laboral, bonos y precios.</p>
      </div>

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario">Calendario y horario</TabsTrigger>
          <TabsTrigger value="bonos">Tipos de bonos y precios</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
          <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="pt-4 space-y-6">
          <HorarioForm />
          <Card>
            <CardHeader><CardTitle>Calendario laboral</CardTitle></CardHeader>
            <CardContent>
              <SpecialDaysCalendar />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bonos" className="pt-4 space-y-6">
          <CatalogoManager />
          <PreciosForm />
        </TabsContent>

        <TabsContent value="estadisticas" className="pt-4 space-y-6">
          <StatsConfigForm />
        </TabsContent>

        <TabsContent value="cuenta" className="pt-4 space-y-6">
          <AccountForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}