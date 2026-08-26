import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useServicios } from "@/lib/servicios";
import { ServicioResumen } from "@/components/servicios/servicio-resumen";
import { ServicioBonosPanel } from "@/components/servicios/servicio-bonos-panel";
import { ServicioDialog } from "@/components/servicios/servicio-dialog";

export const Route = createFileRoute("/_shell/grupos")({
  component: ServiciosPage,
});

function ServiciosPage() {
  const navigate = useNavigate();
  const { data: servicios = [] } = useServicios();
  const [tab, setTab] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!tab && servicios.length > 0) setTab(servicios[0].slug);
  }, [servicios, tab]);

  const editing = servicios.find((s) => s.slug === editingSlug) ?? null;

  return (
    <div className="page-tabbed min-h-full p-6 space-y-4">
      <div className="flex min-h-10 items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-display font-semibold">Servicios</h1>
          <p className="text-sm text-muted-foreground">
            Panel de control de cada servicio: resumen, bonos y reservas.
          </p>
        </div>
        <Button onClick={() => { setEditingSlug(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo servicio
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {servicios.map((s) => (
            <TabsTrigger key={s.id} value={s.slug}>{s.nombre}</TabsTrigger>
          ))}
        </TabsList>

        {servicios.map((s) => (
          <TabsContent key={s.id} value={s.slug} className="pt-4 space-y-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-display font-semibold">Resumen</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditingSlug(s.slug); setDialogOpen(true); }}
                >
                  <Settings2 className="h-4 w-4 mr-1" /> Configurar servicio
                </Button>
              </div>
              <ServicioResumen servicio={s} />
              <p className="text-xs text-muted-foreground">
                Capacidad por sesión: {s.capacidad_default} {s.capacidad_default === 1 ? "plaza" : "plazas"}
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-display font-semibold">Bonos</h2>
              <ServicioBonosPanel servicioSlug={s.slug} />
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-display font-semibold">Reservas</h2>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Huecos y reservas de {s.nombre}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() =>
                      navigate({ to: "/", search: { tab: "reservas", servicio: s.slug } })
                    }
                  >
                    Ver reservas de este servicio <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            </section>
          </TabsContent>
        ))}

        {servicios.length === 0 && (
          <div className="text-center text-muted-foreground py-8 border rounded-lg bg-card">
            Aún no hay servicios. Crea el primero con “Nuevo servicio”.
          </div>
        )}
      </Tabs>

      <ServicioDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        servicio={editing}
        servicios={servicios}
        onCreated={(slug) => setTab(slug)}
      />
    </div>
  );
}
